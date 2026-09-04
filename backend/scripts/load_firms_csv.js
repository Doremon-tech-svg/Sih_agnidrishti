import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..');
const API_BASE = process.env.API_BASE || 'http://localhost:4000/api';

const csvPath = path.join(ROOT, 'data', 'raw', 'firms', 'firms_gujarat_clusters.csv');

function parseCsv(content) {
    const lines = content.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV is empty');

    // Parse header line
    const headers = lines[0].split(',').map(h => h.trim());

    // Parse rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length !== headers.length) {
            console.warn(`Skipping malformed row ${i + 1}: expected ${headers.length} fields, got ${values.length}`);
            continue;
        }
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = values[idx].trim();
        });
        rows.push(row);
    }
    return rows;
}

async function postHotspot(row) {
    const acqTime = row.acq_time.padStart(4, '0');
    const formattedTime = `${acqTime.slice(0, 2)}:${acqTime.slice(2, 4)}`;
    const payload = {
        lat: parseFloat(row.latitude),
        lon: parseFloat(row.longitude),
        satellite: row.satellite,
        acq_date: `${row.acq_date}T${formattedTime}:00Z`,
        brightness_ti4: parseFloat(row.bright_ti4),
        frp: parseFloat(row.frp),
        confidence: row.confidence,
        raw: row,
    };
    const res = await fetch(`${API_BASE}/hotspots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to insert hotspot: ${res.status} ${text}`);
    }
    return res.json();
}

async function main() {
    if (!fs.existsSync(csvPath)) {
        console.error(`CSV not found: ${csvPath}`);
        process.exit(1);
    }
    console.log(`Reading ${csvPath}...`);
    const content = fs.readFileSync(csvPath, 'utf8');
    const rows = parseCsv(content);
    console.log(`Parsed ${rows.length} rows. Posting to backend...`);

    let ok = 0;
    for (const row of rows) {
        try {
            await postHotspot(row);
            ok++;
        } catch (e) {
            console.error('Error on row:', e.message);
        }
    }
    console.log(`Inserted ${ok}/${rows.length} hotspots.`);
}

main().catch(console.error);