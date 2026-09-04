import { pool } from '../src/db.js';

async function main() {
  console.log('Linking hotspots to nearest facility (within 2km)...');

  const result = await pool.query(`
    UPDATE hotspots h
    SET facility_id = f.id
    FROM facilities f
    WHERE h.facility_id IS NULL
      AND ST_DWithin(h.geom::geography, f.geom::geography, 2000)
      AND f.id = (
        SELECT f2.id FROM facilities f2
        WHERE ST_DWithin(h.geom::geography, f2.geom::geography, 2000)
        ORDER BY h.geom <-> f2.geom
        LIMIT 1
      )
  `);

  console.log(`Linked ${result.rowCount} hotspots to nearest facility.`);
  await pool.end();
}

main().catch(console.error);
