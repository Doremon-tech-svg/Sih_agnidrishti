/**
 * backend/src/scripts/seedDistricts.js
 *
 * ONE-TIME seed of india_districts from a public district-boundary GeoJSON
 * hosted on raw.githubusercontent.com (allow-listed). Not part of the cron chain.
 *
 * Run: node --input-type=module < backend/src/scripts/seedDistricts.js
 *
 * Set DISTRICTS_GEOJSON_URL in .env to override the default source if needed.
 */
import { pool } from '../db.js';

const DEFAULT_URL =
    'https://raw.githubusercontent.com/datameet/maps/master/Districts/Census_2011/2011_Dist.geojson';
const URL = process.env.DISTRICTS_GEOJSON_URL || DEFAULT_URL;

async function main() {
    const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) FROM india_districts`);
    if (count !== '0') {
        console.log(`india_districts already has ${count} rows — skipping seed. Delete rows first to re-seed.`);
        await pool.end();
        return;
    }

    console.log(`Fetching district boundaries from ${URL} …`);
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
    const geojson = await res.json();

    const features = geojson.features || [];
    console.log(`Loaded ${features.length} district features. Inserting…`);

    let ok = 0, skipped = 0;
    for (const f of features) {
        const props = f.properties || {};
        const name = props.DISTRICT || props.district || props.NAME_2 || props.name || null;
        const state = props.ST_NM || props.STATE || props.state || props.NAME_1 || null;
        if (!f.geometry) { skipped++; continue; }

        try {
            await pool.query(
                `INSERT INTO india_districts (name, state, geom)
                 VALUES ($1, $2, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)))`,
                [name, state, JSON.stringify(f.geometry)]
            );
            ok++;
        } catch (e) {
            console.warn(`  Skipped feature (${name}): ${e.message}`);
            skipped++;
        }
    }

    console.log(`Inserted ${ok} districts, skipped ${skipped}.`);
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });