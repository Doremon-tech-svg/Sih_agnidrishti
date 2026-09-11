import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
// fallback to backend/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

const SCRIPTS_DIR = __dirname;
const SRC_SCRIPTS_DIR = path.join(__dirname, '../src/scripts');

async function runScript(scriptPath) {
    console.log(`\n▶️ Running ${path.basename(scriptPath)}...`);
    try {
        const { stdout, stderr } = await execAsync(`node ${scriptPath}`, {
            env: { ...process.env, NODE_OPTIONS: '' }
        });
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
    } catch (err) {
        console.error(`❌ Failed to run ${scriptPath}: ${err.message}`);
        if (err.stdout) console.log(err.stdout);
        if (err.stderr) console.error(err.stderr);
        throw err;
    }
}

async function main() {
    console.log('🧹 Wiping all demo data to restore real pipeline...');
    
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not set in .env");
    }

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    
    try {
        await pool.query('DELETE FROM alerts');
        await pool.query('DELETE FROM incidents');
        await pool.query('DELETE FROM hotspots');
        await pool.query('DELETE FROM facilities');
        console.log('✅ Demo data wiped.');
    } catch (err) {
        console.error('❌ Failed to wipe data:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }

    try {
        // 1. Fetch facilities from OSM
        await runScript(path.join(SCRIPTS_DIR, 'fetchFacilities.js'));
        
        // 2. Fetch hotspots from NASA FIRMS (directly into DB)
        // Note: fetchFirms.js expects to be run with `node scripts/fetchFirms.js` normally, but we run it via stdin to allow ESM without package.json type:module in scripts if needed, though fetchFirms uses imports. Let's just run it standardly.
        console.log(`\n▶️ Running fetchFirms.js...`);
        const { stdout, stderr } = await execAsync(`node ${path.join(SCRIPTS_DIR, 'fetchFirms.js')}`, { cwd: path.join(__dirname, '..') });
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
        
        // 3. Link facilities
        await runScript(path.join(SRC_SCRIPTS_DIR, 'linkFacilities.js'));
        
        // 4. Reverse Geocode
        await runScript(path.join(SRC_SCRIPTS_DIR, 'reverseGeocode.js'));
        
        // 5. Anomaly Engine
        await runScript(path.join(SRC_SCRIPTS_DIR, 'anomalyEngine.js'));
        
        // 6. ML Classification (via anomalyEngine/generateIncidents or classify route)
        // Wait, normally `scheduler.js` calls `classifyAllHotspots()` from routes/ml.js.
        // But we have `generateIncidents.js` which simulates the ML agent pipeline!
        await runScript(path.join(SRC_SCRIPTS_DIR, 'generateIncidents.js'));
        
        console.log('\n🎉 Real data restoration complete!');
        
    } catch (err) {
        console.error('\n💥 Pipeline failed.', err.message);
    }
}

main().catch(console.error);
