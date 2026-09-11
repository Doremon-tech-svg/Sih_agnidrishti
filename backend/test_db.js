import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const facCount = await pool.query('SELECT COUNT(*) FROM facilities');
  const hsCount = await pool.query('SELECT COUNT(*) FROM hotspots');
  console.log(`Facilities: ${facCount.rows[0].count}`);
  console.log(`Hotspots: ${hsCount.rows[0].count}`);
  process.exit();
}
run();
