import path from 'path';
import dotenv from 'dotenv';

// Ensure we load backend/.env even when script is invoked from project root
const envPath = path.resolve(process.cwd(), 'backend', '.env');
dotenv.config({ path: envPath });

const MAP_KEY = process.env.FIRMS_MAP_KEY;
const API_BASE = process.env.API_BASE || 'http://localhost:4000/api';
const TOKEN = process.env.API_TOKEN;

const SOURCE = process.env.FIRMS_SOURCE || 'VIIRS_SNPP_NRT';
const DAY_RANGE = process.env.FIRMS_DAY_RANGE || 3;

// India bounding box (lon/lat): minLon,minLat,maxLon,maxLat
const INDIA_BBOX = { minLon: 68.0, minLat: 6.0, maxLon: 97.5, maxLat: 37.0 };
const TILE_DEG = 5.0; // 5-degree tiles to cover India

function parseCsv(text) {
    const [headerLine, ...lines] = text.trim().split('\n');
    const headers = headerLine.split(',');
    return lines.map(line => {
        const values = line.split(',');
        return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    });
}

const fs = await import('fs');
const LAST_FILE = path.join(process.cwd(), '.firms_last_run.json');

async function fetchWithRetry(url, attempts = 3, delayMs = 800) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (e) {
            lastErr = e;
            await sleep(delayMs * (i + 1));
        }
    }
    throw lastErr;
}

function loadLastRun() {
    try {
        if (!fs.existsSync(LAST_FILE)) return null;
        return JSON.parse(fs.readFileSync(LAST_FILE, 'utf8'));
    } catch { return null; }
}

function saveLastRun(obj) {
    try { fs.writeFileSync(LAST_FILE, JSON.stringify(obj)); } catch (e) { console.warn('Could not write last-run', e); }
}

async function main() {
    if (!MAP_KEY) throw new Error('FIRMS_MAP_KEY missing in .env');
    const useDirectDb = !!process.env.DATABASE_URL && !TOKEN;
    if (!TOKEN && !useDirectDb) throw new Error('API_TOKEN missing — run with API_TOKEN=<token> node scripts/fetchFirms.js or set DATABASE_URL to insert directly.');
    console.log('Fetching FIRMS data with India tiling...');

    let dbPool = null;
    if (useDirectDb) {
        const pg = await import('pg');
        dbPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        console.log('No API_TOKEN provided — will insert detections directly into DB using DATABASE_URL.');
    }

    const last = loadLastRun();
    const lastDate = last?.last_run ? new Date(last.last_run) : null;
    if (lastDate) console.log('Last run at', lastDate.toISOString());

    const detections = [];
    const seen = new Set();

    for (let lon = INDIA_BBOX.minLon; lon < INDIA_BBOX.maxLon; lon += TILE_DEG) {
        for (let lat = INDIA_BBOX.minLat; lat < INDIA_BBOX.maxLat; lat += TILE_DEG) {
            const minLon = lon.toFixed(3);
            const minLat = lat.toFixed(3);
            const maxLon = Math.min(lon + TILE_DEG, INDIA_BBOX.maxLon).toFixed(3);
            const maxLat = Math.min(lat + TILE_DEG, INDIA_BBOX.maxLat).toFixed(3);
            const area = `${minLon},${minLat},${maxLon},${maxLat}`;

            const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${MAP_KEY}/${SOURCE}/${area}/${DAY_RANGE}`;
            console.log(`Fetching tile ${area} ...`);

            try {
                const res = await fetchWithRetry(url, 4, 800);
                const csvText = await res.text();
                const rows = parseCsv(csvText);

                for (const row of rows) {
                    const latVal = parseFloat(row.latitude);
                    const lonVal = parseFloat(row.longitude);
                    const acq = new Date(row.acq_date + 'T' + (row.acq_time?.padStart(4,'0').replace(/(\d{2})(\d{2})/,'$1:$2')||'00:00') + 'Z');
                    if (lastDate && acq <= lastDate) continue; // skip older detections

                    // dedupe by rounded coords + date
                    const key = `${latVal.toFixed(4)}:${lonVal.toFixed(4)}:${row.acq_date}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    detections.push({ row, lat: latVal, lon: lonVal, acq });
                }
            } catch (err) {
                console.warn('Tile fetch error', err.message || err);
            }

            // small delay to avoid hammering the FIRMS API
            await sleep(600);
        }
    }

    console.log(`Fetched total unique detections: ${detections.length}. Posting to backend...`);

    let ok = 0;
    for (const d of detections) {
        const row = d.row;
        const payload = {
            lat: d.lat,
            lon: d.lon,
            satellite: row.satellite || SOURCE,
            acq_date: d.acq.toISOString(),
            brightness_ti4: parseFloat(row.bright_ti4),
            frp: parseFloat(row.frp),
            confidence: row.confidence,
            raw: row,
        };

        if (dbPool) {
            try {
                const insertRes = await dbPool.query(
                    `INSERT INTO hotspots (lat, lon, geom, satellite, acq_date, brightness_ti4, frp, confidence, raw)
                     VALUES ($1,$2, ST_SetSRID(ST_MakePoint($2,$1),4326), $3,$4,$5,$6,$7,$8) RETURNING id`,
                    [payload.lat, payload.lon, payload.satellite, payload.acq_date, payload.brightness_ti4, payload.frp, payload.confidence, JSON.stringify(payload.raw)]
                );
                if (insertRes && insertRes.rows && insertRes.rows[0]) ok++;
            } catch (e) {
                console.warn('DB insert error', e.message || e);
            }
        } else {
            let attempt = 0;
            while (attempt < 3) {
                try {
                    const post = await fetch(`${API_BASE}/hotspots`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${TOKEN}`,
                        },
                        body: JSON.stringify(payload),
                    });

                    if (post.ok) { ok++; break; }
                    else {
                        const txt = await post.text();
                        console.warn('Failed row:', payload.lat, payload.lon, '->', txt);
                    }
                } catch (err) {
                    console.warn('Post error', err.message || err);
                }
                attempt++;
                await sleep(400 * attempt);
            }
        }
    }

    console.log(`Inserted ${ok}/${detections.length}`);
    saveLastRun({ last_run: new Date().toISOString(), inserted: ok });
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

main().catch(console.error);