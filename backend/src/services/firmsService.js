/**
 * backend/src/services/firmsService.js
 *
 * FIRMS (Fire Information for Resource Management System) data fetcher.
 * Fetches real satellite fire hotspot data from NASA FIRMS API
 * for the entire India bounding box, tiled to avoid API limits.
 *
 * NASA FIRMS API: https://firms.modaps.eosdis.nasa.gov/api/
 * Map key is free, register at: https://firms.modaps.eosdis.nasa.gov/api/map_key/
 */

import pg from 'pg';
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAST_RUN_FILE = path.join(__dirname, '..', '..', '..', '.firms_last_run.json');

// ── Config ─────────────────────────────────────────────────────────────────
const MAP_KEY     = process.env.FIRMS_MAP_KEY || '05b4c24999378905f9027d8631b08449';
const SOURCE      = process.env.FIRMS_SOURCE  || 'VIIRS_SNPP_NRT';
const DAY_RANGE   = parseInt(process.env.FIRMS_DAY_RANGE || '3');
const TILE_DEG    = 5.0;

// India bounding box (WGS84)
const INDIA_BBOX = { minLon: 68.0, minLat: 6.0, maxLon: 97.5, maxLat: 37.0 };

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCsv(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = line.split(',');
        return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() ?? '']));
    });
}

function loadLastRun() {
    try {
        if (!fs.existsSync(LAST_RUN_FILE)) return null;
        return JSON.parse(fs.readFileSync(LAST_RUN_FILE, 'utf8'));
    } catch {
        return null;
    }
}

function saveLastRun(data) {
    try {
        fs.writeFileSync(LAST_RUN_FILE, JSON.stringify({ ...data, saved_at: new Date().toISOString() }));
    } catch (e) {
        console.warn('[FIRMS] Could not write last-run file:', e.message);
    }
}

async function fetchTileWithRetry(url, maxAttempts = 4, baseDelayMs = 800) {
    let lastErr;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (e) {
            lastErr = e;
            await sleep(baseDelayMs * (i + 1));
        }
    }
    throw lastErr;
}

// ── Main fetch function ────────────────────────────────────────────────────

/**
 * Fetch all FIRMS fire detections for India (all tiles).
 * Returns array of raw detection objects.
 * Skips detections already fetched in the last run (incremental).
 */
export async function fetchFirmsIndia({ incremental = true } = {}) {
    console.log('[FIRMS] Starting India-wide FIRMS fetch...');

    const last = incremental ? loadLastRun() : null;
    const lastDate = last?.last_run ? new Date(last.last_run) : null;
    if (lastDate) {
        console.log(`[FIRMS] Incremental mode — skipping records before ${lastDate.toISOString()}`);
    }

    const detections = [];
    const seen = new Set();

    // Generate all tiles for India
    const tiles = [];
    for (let lon = INDIA_BBOX.minLon; lon < INDIA_BBOX.maxLon; lon += TILE_DEG) {
        for (let lat = INDIA_BBOX.minLat; lat < INDIA_BBOX.maxLat; lat += TILE_DEG) {
            const minLon = lon.toFixed(3);
            const minLat = lat.toFixed(3);
            const maxLon = Math.min(lon + TILE_DEG, INDIA_BBOX.maxLon).toFixed(3);
            const maxLat = Math.min(lat + TILE_DEG, INDIA_BBOX.maxLat).toFixed(3);
            tiles.push(`${minLon},${minLat},${maxLon},${maxLat}`);
        }
    }

    console.log(`[FIRMS] Fetching ${tiles.length} tiles...`);

    for (const area of tiles) {
        const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${MAP_KEY}/${SOURCE}/${area}/${DAY_RANGE}`;

        try {
            const csvText = await fetchTileWithRetry(url);
            const rows = parseCsv(csvText);

            for (const row of rows) {
                if (!row.latitude || !row.longitude) continue;

                const latVal = parseFloat(row.latitude);
                const lonVal = parseFloat(row.longitude);

                if (isNaN(latVal) || isNaN(lonVal)) continue;

                // Parse acquisition date/time
                const acqTimeStr = (row.acq_time || '0000').toString().padStart(4, '0');
                const acqDateStr = row.acq_date || '';
                const acqIso = acqDateStr
                    ? `${acqDateStr}T${acqTimeStr.slice(0,2)}:${acqTimeStr.slice(2)}:00Z`
                    : new Date().toISOString();
                const acq = new Date(acqIso);

                // Incremental: skip old records
                if (lastDate && acq <= lastDate) continue;

                // Dedup by rounded coords + date
                const key = `${latVal.toFixed(4)}:${lonVal.toFixed(4)}:${acqDateStr}`;
                if (seen.has(key)) continue;
                seen.add(key);

                detections.push({
                    lat: latVal,
                    lon: lonVal,
                    acq_date: acq.toISOString(),
                    brightness_ti4: parseFloat(row.bright_ti4) || null,
                    frp: parseFloat(row.frp) || 0,
                    confidence: row.confidence || 'nominal',
                    satellite: row.satellite || SOURCE,
                    daynight: row.daynight || 'D',
                    scan: parseFloat(row.scan) || 1.0,
                    track: parseFloat(row.track) || 1.0,
                    raw: row,
                });
            }

            await sleep(500); // Be nice to the API
        } catch (err) {
            console.warn(`[FIRMS] Tile ${area} failed: ${err.message}`);
        }
    }

    console.log(`[FIRMS] Fetched ${detections.length} unique detections`);
    return detections;
}

/**
 * Fetch FIRMS data and insert into hotspots table.
 * Returns stats: { fetched, inserted, skipped }
 */
export async function fetchAndIngestFirms(dbPool, { incremental = true } = {}) {
    const detections = await fetchFirmsIndia({ incremental });

    let inserted = 0;
    let skipped = 0;

    for (const d of detections) {
        try {
            const res = await dbPool.query(
                `INSERT INTO hotspots
                   (lat, lon, geom, satellite, acq_date, brightness_ti4, frp, confidence, raw)
                 VALUES ($1,$2, ST_SetSRID(ST_MakePoint($2,$1),4326), $3,$4,$5,$6,$7,$8)
                 ON CONFLICT DO NOTHING
                 RETURNING id`,
                [
                    d.lat, d.lon, d.satellite, d.acq_date,
                    d.brightness_ti4, d.frp, d.confidence,
                    JSON.stringify(d.raw),
                ]
            );
            if (res.rows.length > 0) inserted++;
            else skipped++;
        } catch (e) {
            console.warn('[FIRMS] DB insert error:', e.message?.slice(0, 100));
            skipped++;
        }
    }

    saveLastRun({ last_run: new Date().toISOString(), inserted, skipped, total: detections.length });
    console.log(`[FIRMS] Ingested: ${inserted} new, ${skipped} skipped`);

    return { fetched: detections.length, inserted, skipped };
}
