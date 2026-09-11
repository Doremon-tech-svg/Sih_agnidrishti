/**
 * backend/src/scripts/reverseGeocode.js
 *
 * Assigns district/state to hotspots via a single spatial join against
 * india_districts (seeded once by scripts/seedDistricts.js). No per-hotspot
 * API calls — avoids Nominatim/OSM rate limits entirely.
 *
 * Run: node --input-type=module < backend/src/scripts/reverseGeocode.js
 */
import { pool } from '../db.js';

async function main() {
    console.log('Reverse-geocoding hotspots → district/state (spatial join)…');

    const { rows: [{ count: districtCount }] } = await pool.query(
        `SELECT COUNT(*) FROM india_districts`
    );
    if (districtCount === '0') {
        console.warn('india_districts is empty — run scripts/seedDistricts.js first. Skipping.');
        await pool.end();
        return;
    }

    const result = await pool.query(`
        UPDATE hotspots h
        SET district = d.name,
            state    = d.state
        FROM india_districts d
        WHERE h.district IS NULL
          AND ST_Contains(d.geom, h.geom)
    `);

    console.log(`  Assigned district/state to ${result.rowCount} hotspots`);

    const { rows } = await pool.query(`
        SELECT COUNT(*) FILTER (WHERE district IS NOT NULL) AS with_district,
               COUNT(*) FILTER (WHERE district IS NULL)     AS without_district
        FROM hotspots
    `);
    console.log(`  With district: ${rows[0].with_district}  |  Without: ${rows[0].without_district}`);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });