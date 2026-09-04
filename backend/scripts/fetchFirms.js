import 'dotenv/config';

const MAP_KEY = process.env.FIRMS_MAP_KEY;
const API_BASE = 'http://localhost:4000/api';

// area API: source/MAP_KEY/AREA/dayRange/date
// VIIRS_SNPP_NRT | VIIRS_NOAA20_NRT | VIIRS_NOAA21_NRT
const SOURCE = 'VIIRS_SNPP_NRT';
const AREA = '68.5,21.0,73.5,23.5'; // west,south,east,north
const DAY_RANGE = 5; // max 5 per call on free tier for area API

function parseCsv(text) {
    const [headerLine, ...lines] = text.trim().split('\n');
    const headers = headerLine.split(',');
    return lines.map(line => {
        const values = line.split(',');
        return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    });
}

async function main() {
    if (!MAP_KEY) throw new Error('FIRMS_MAP_KEY missing in .env');

    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${MAP_KEY}/${SOURCE}/${AREA}/${DAY_RANGE}`;
    console.log('Fetching FIRMS data...');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FIRMS failed: ${res.status}`);
    const csvText = await res.text();

    const rows = parseCsv(csvText);
    console.log(`Fetched ${rows.length} detections. Posting to backend...`);

    let ok = 0;
    for (const row of rows) {
        const payload = {
            lat: parseFloat(row.latitude),
            lon: parseFloat(row.longitude),
            satellite: row.satellite || SOURCE,
            acq_date: `${row.acq_date}T${row.acq_time?.padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2')}:00Z`,
            brightness_ti4: parseFloat(row.bright_ti4),
            frp: parseFloat(row.frp),
            confidence: row.confidence,
            raw: row,
        };
        const post = await fetch(`${API_BASE}/hotspots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (post.ok) {
            ok++;
        } else {
            console.log('Failed row:', payload.lat, payload.lon, '->', await post.text());
        }
    }
    console.log(`Inserted ${ok}/${rows.length}`);
}

main().catch(console.error);