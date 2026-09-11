import cron from 'node-cron';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { classifyAllHotspots } from './routes/ml.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

function execScript(name) {
    return new Promise((resolve, reject) => {
        exec(`node ${path.join(SCRIPTS_DIR, name)}`, (err, stdout, stderr) => {
            if (err) { reject(new Error(`${name} failed: ${stderr}`)); return; }
            console.log(stdout);
            resolve();
        });
    });
}

async function runPipeline() {
    try {
        console.log('1/5 Running FIRMS fetch...');
        await execScript('fetchFirms.js');

        console.log('2/5 Running facility linker...');
        await execScript('linkFacilities.js');

        console.log('3/5 Running reverse geocode (district assignment)...');
        await execScript('reverseGeocode.js');

        console.log('4/5 Running anomaly engine...');
        await execScript('anomalyEngine.js');

        console.log('5/5 Running ML classify-all...');
        const results = await classifyAllHotspots(500);
        console.log(`  Classified ${results.length} hotspots (${results.filter(r => r.ok).length} ok)`);

        console.log('Pipeline run complete.');
    } catch (err) {
        console.error('Pipeline error:', err.message);
    }
}

// Run every 12 hours
cron.schedule('0 */12 * * *', runPipeline);
console.log('Scheduler active: fetch -> link -> reverseGeocode -> anomalyEngine -> ml classify-all (every 12h)');

export { runPipeline };