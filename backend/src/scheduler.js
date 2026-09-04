import cron from 'node-cron';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

const execAsync = promisify(exec);

async function runStep(command, description, options = {}) {
    console.log(`\n=== ${description} ===`);
    try {
        const { stdout, stderr } = await execAsync(command, options);
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
    } catch (error) {
        console.error(`[ERROR] ${description} failed:`, error.message);
        throw error; // stop the pipeline
    }
}

async function runPipeline() {
    const activate = `source ${path.join(PROJECT_ROOT, 'backend', 'venv', 'bin', 'activate')}`;

    try {
        // 1. Fetch latest FIRMS data (optional – can be commented out if using CSV)
        await runStep(
            `node ${path.join(SCRIPTS_DIR, 'fetchFirms.js')}`,
            'Fetching FIRMS data from NASA',
            { cwd: PROJECT_ROOT }
        );

        // 2. Spatially link hotspots to facilities
        await runStep(
            `node ${path.join(SCRIPTS_DIR, 'linkFacilities.js')}`,
            'Linking hotspots to facilities',
            { cwd: PROJECT_ROOT }
        );

        // 3. Run the unified ML/risk pipeline (enrichment + feature engineering + risk scoring + agents + writeback)
        await runStep(
            `${activate} && python -m ml.scripts.run_db_pipeline --write-back`,
            'Running ML / Risk pipeline',
            { cwd: PROJECT_ROOT, shell: '/bin/bash' }
        );

        console.log('\n=== Pipeline run completed successfully ===');
    } catch (error) {
        console.error('\n[FATAL] Scheduled pipeline aborted:', error.message);
    }
}

// Schedule every 6 hours
cron.schedule('0 */6 * * *', runPipeline);

console.log('Scheduler active: fetch -> link -> ML pipeline (every 6h)');