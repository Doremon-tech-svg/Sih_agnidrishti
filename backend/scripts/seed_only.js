import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('render.com') || process.env.DATABASE_URL?.includes('supabase')
        ? { rejectUnauthorized: false }
        : false
});

const ACCOUNTS = [
    { email: 'admin@agnidrishti.gov.in', password: 'Admin@2026', role: 'ADMIN', full_name: 'System Administrator' },
    { email: 'analyst@agnidrishti.gov.in', password: 'Analyst@2026', role: 'ANALYST', full_name: 'Senior Analyst' },
    { email: 'viewer@agnidrishti.gov.in', password: 'Viewer@2026', role: 'VIEWER', full_name: 'Field Viewer' }
];

async function setup() {
    try {
        console.log('Creating core test accounts...');
        for (const account of ACCOUNTS) {
            const hash = await bcrypt.hash(account.password, 10);
            await pool.query(`
                INSERT INTO users (email, password_hash, full_name, role, is_approved)
                VALUES ($1, $2, $3, $4, true)
                ON CONFLICT (email) DO UPDATE 
                SET password_hash = $2, role = $4, is_approved = true
            `, [account.email, hash, account.full_name, account.role]);
            console.log(`✅ Created account: ${account.email}`);
        }
    } catch (err) {
        console.error('\n❌ Database setup failed:', err);
    } finally {
        await pool.end();
    }
}

setup();
