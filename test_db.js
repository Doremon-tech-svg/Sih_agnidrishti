import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: 'backend/.env'});
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='hotspots'").then(res => { console.log(res.rows.map(r=>r.column_name).join(', ')); process.exit(0); }).catch(err => { console.error(err.message); process.exit(1); });
