/**
 * backend/src/scripts/linkFacilities.js
 *
 * Spatially links every hotspot to its nearest facility within 5km.
 * Previously used 2km which left 99.8% of hotspots unlinked.
 * Run: node --input-type=module < backend/src/scripts/linkFacilities.js
 */
import { pool } from '../db.js';

async function main() {
    console.log('Linking hotspots → nearest facility (within 5 km)…');

    // Pass 1: link to nearest facility within 5 km
    const r1 = await pool.query(`
        UPDATE hotspots h
        SET facility_id = (
            SELECT f.id FROM facilities f
            WHERE ST_DWithin(h.geom::geography, f.geom::geography, 5000)
            ORDER BY h.geom <-> f.geom
            LIMIT 1
        )
        WHERE h.facility_id IS NULL
          AND EXISTS (
            SELECT 1 FROM facilities f
            WHERE ST_DWithin(h.geom::geography, f.geom::geography, 5000)
          )
    `);
    console.log(`  Pass 1 (≤5 km):  ${r1.rowCount} hotspots linked`);

    // Pass 2: for remaining unlinked, link to nearest within 10 km
    const r2 = await pool.query(`
        UPDATE hotspots h
        SET facility_id = (
            SELECT f.id FROM facilities f
            WHERE ST_DWithin(h.geom::geography, f.geom::geography, 10000)
            ORDER BY h.geom <-> f.geom
            LIMIT 1
        )
        WHERE h.facility_id IS NULL
          AND EXISTS (
            SELECT 1 FROM facilities f
            WHERE ST_DWithin(h.geom::geography, f.geom::geography, 10000)
          )
    `);
    console.log(`  Pass 2 (5–10 km): ${r2.rowCount} hotspots linked`);

    // Summary
    const { rows } = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE facility_id IS NOT NULL) AS linked,
            COUNT(*) FILTER (WHERE facility_id IS NULL)     AS unlinked,
            COUNT(*)                                         AS total
        FROM hotspots
    `);
    const { linked, unlinked, total } = rows[0];
    console.log(`\n  Total: ${total}  |  Linked: ${linked}  |  Unlinked: ${unlinked}`);
    console.log(`  Coverage: ${((linked / total) * 100).toFixed(1)}%`);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });