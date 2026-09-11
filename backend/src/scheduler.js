import cron from 'node-cron';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

function runPipeline() {
    console.log('Running scheduled FIRMS fetch...');
    exec(`node ${path.join(SCRIPTS_DIR, 'fetchFirms.js')}`, (err, stdout, stderr) => {
        if (err) { console.error('fetchFirms error:', stderr); return; }
        console.log(stdout);

        console.log('Running facility linker...');
        exec(`node ${path.join(SCRIPTS_DIR, 'linkFacilities.js')}`, (err2, stdout2, stderr2) => {
            if (err2) { console.error('linkFacilities error:', stderr2); return; }
            console.log(stdout2);

            console.log('Running anomaly engine...');
            const projectRoot = path.join(__dirname, '..', '..');
            const activate = `source ${path.join(projectRoot, 'backend', 'venv', 'bin', 'activate')}`;
            exec(`${activate} && python -m ml.anomaly`, { cwd: projectRoot, shell: '/bin/bash' }, (err3, stdout3, stderr3) => {
                if (err3) { console.error('anomaly error:', stderr3); return; }
                console.log(stdout3);

                console.log('Generating incidents...');
                exec(`node ${path.join(SCRIPTS_DIR, 'generateIncidents.js')}`, (err4, stdout4, stderr4) => {
                    if (err4) { console.error('generateIncidents error:', stderr4); return; }
                    console.log(stdout4);
                    console.log('Pipeline run complete.');
                });
            });
        });
    });
}

// Run every 12 hours (user requested)
cron.schedule('0 */12 * * *', runPipeline);
console.log('Scheduler active: fetch -> link -> anomaly -> incidents (every 12h)');