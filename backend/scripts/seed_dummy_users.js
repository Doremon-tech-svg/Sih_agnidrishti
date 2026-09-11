import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const pwd = 'Password@123';
    const hash = await bcrypt.hash(pwd, 10);
    // Simple grid of points across India
    const minLat = 8, maxLat = 35, minLon = 68, maxLon = 97;
    const latStep = 4, lonStep = 6; // coarse grid
    const users = [];
    for (let lat = minLat; lat <= maxLat; lat += latStep) {
        for (let lon = minLon; lon <= maxLon; lon += lonStep) {
            users.push({ email: `demo_${lat}_${lon}@example.com`, full_name: `Demo User ${lat}_${lon}`, lat, lon });
        }
    }

    console.log(`Creating ${users.length} demo users...`);
    for (const u of users) {
        try {
            const exists = await pool.query('SELECT id FROM users WHERE email=$1', [u.email]);
            if (exists.rows.length) continue;
            const res = await pool.query(
                `INSERT INTO users (email, password_hash, full_name, role, is_approved, work_lat, work_lon, work_geom)
                 VALUES ($1,$2,$3,$4,$5,$6,$7, ST_SetSRID(ST_MakePoint($7,$6),4326)) RETURNING id`,
                [u.email, hash, u.full_name, 'VIEWER', true, u.lat, u.lon]
            );
        } catch (e) { console.warn('Failed to create user', u.email, e.message || e); }
    }

    console.log('Seeder complete.');
    await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
