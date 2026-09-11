import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const res = await pool.query('SELECT COUNT(*) FROM facilities');
console.log(res.rows[0]);
process.exit();
