import { Router } from 'express';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..', '..'); // AgniDrishti/
const VENV_PYTHON = path.join(ROOT, 'backend', 'venv', 'bin', 'python3');
const STATUS_FILE = path.join(ROOT, 'ml', 'output', 'last_run.json');

// ── GET /api/ml/status ───────────────────────────────────────────────────────
// Returns the result of the last pipeline run (or "never" if first time).
router.get('/status', (req, res) => {
    if (!fs.existsSync(STATUS_FILE)) {
        return res.json({ status: 'never_run', message: 'Pipeline has not been run yet.' });
    }
    try {
        const data = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        res.json(data);
    } catch {
        res.json({ status: 'error', message: 'Could not read status file.' });
    }
});

// ── POST /api/ml/run ─────────────────────────────────────────────────────────
// Triggers the full multi-agent pipeline (async, returns immediately).
// Query params:
//   ?write_back=true  → PATCH hotspots + POST incidents (default: true)
let _running = false;

router.post('/run', (req, res) => {
    if (_running) {
        return res.status(409).json({ error: 'Pipeline already running. Check /api/ml/status.' });
    }

    const writeBack = req.query.write_back !== 'false';
    const args = writeBack ? '--write-back' : '';
    const cmd = `${VENV_PYTHON} -m ml.agents.pipeline ${args}`;

    _running = true;
    const startedAt = new Date().toISOString();

    // Write "running" status immediately
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify({
        status: 'running',
        started_at: startedAt,
        write_back: writeBack,
    }));

    res.json({ status: 'started', started_at: startedAt, write_back: writeBack });

    // Run in background
    exec(cmd, { cwd: ROOT }, (err, stdout, stderr) => {
        _running = false;
        const finishedAt = new Date().toISOString();

        if (err) {
            console.error('[ML Pipeline] Error:', stderr?.slice(0, 500));
            fs.writeFileSync(STATUS_FILE, JSON.stringify({
                status: 'error',
                started_at: startedAt,
                finished_at: finishedAt,
                error: stderr?.slice(0, 800),
            }));
            return;
        }

        // Parse summary from stdout — JSON-first, regex fallback
        let summary = {};
        try {
            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                summary = {
                    total: parseInt(parsed.total) || 0,
                    skipped: parseInt(parsed.skipped) || 0,
                    debunked: parseInt(parsed.debunked) || 0,
                    validated: parseInt(parsed.validated) || 0,
                    patched: parseInt(parsed.patched) || 0,
                    incidents: parseInt(parsed.incidents) || 0,
                    priority_counts: parsed.priority_counts || {},
                };
            } else {
                const g = (re) => parseInt(stdout.match(re)?.[1]) || 0;
                summary = {
                    total: g(/Total:\s+(\d+)/),
                    skipped: g(/Skipped:\s+(\d+)/),
                    debunked: g(/Debunked:\s+(\d+)/),
                    validated: g(/Validated:\s+(\d+)/),
                    patched: g(/Patched:\s+(\d+)/),
                    incidents: g(/Incidents:\s+(\d+)/),
                    priority_counts: {
                        CRITICAL: g(/CRITICAL:\s+(\d+)/),
                        HIGH: g(/HIGH:\s+(\d+)/),
                        MODERATE: g(/MODERATE:\s+(\d+)/),
                        LOW: g(/LOW:\s+(\d+)/),
                    },
                };
            }
        } catch { /* best-effort */ }

        fs.writeFileSync(STATUS_FILE, JSON.stringify({
            status: 'done',
            started_at: startedAt,
            finished_at: finishedAt,
            write_back: writeBack,
            summary,
        }));

        console.log(`[ML Pipeline] Completed at ${finishedAt}`, summary);
    });
});

export default router;