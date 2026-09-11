import { Router } from 'express';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { predictWithModel } from '../mlBridge.js';

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

router.post('/predict', async (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ error: 'A feature record JSON object is required' });
    }

    try {
        const prediction = await predictWithModel(req.body);
        return res.json(prediction);
    } catch (error) {
        error.status = 503;
        error.message = `ML prediction unavailable: ${error.message}`;
        return next(error);
    }
});

// ── POST /api/ml/pipeline ──────────────────────────────────────────────────
// Forwards a hotspot to the FastAPI ML service, then to Agent2, and returns combined result
router.post('/pipeline', async (req, res, next) => {
    try {
        const FASTAPI = process.env.FASTAPI_URL || 'http://localhost:8000';
        const hotspot = req.body;

        // Call FastAPI predict endpoint
        const predictResp = await fetch(`${FASTAPI}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(hotspot),
        });

        if (!predictResp.ok) {
            const txt = await predictResp.text();
            return res.status(502).json({ error: 'FastAPI predict failed', details: txt });
        }

        const mlResult = await predictResp.json();

        // Build payload for Agent2
        const agentPayload = {
            hotspot,
            ml_classification: {
                threat_class: mlResult.predicted_class ?? mlResult.predicted_class ?? mlResult.threat_short_name,
                probability: mlResult.confidence ?? mlResult.confidence,
                predicted_label: mlResult.classification ?? mlResult.threat_name ?? mlResult.threat_short_name,
            }
        };

        // Call Agent2 analyze
        const agentResp = await fetch(`${FASTAPI}/agent2/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(agentPayload),
        });

        if (!agentResp.ok) {
            const txt = await agentResp.text();
            return res.status(502).json({ error: 'Agent2 analyze failed', details: txt });
        }

        const agentResult = await agentResp.json();

        // Policy: if agent or ML indicates high priority, create a pending alert
        try {
            const { pool } = await import('../db.js');
            const priority = agentResult.priority || agentResult.severity || mlResult.priority || mlResult.threat_level || null;
            const probVal = agentResult?.probability ?? mlResult?.probability ?? mlResult?.confidence ?? 0;
            const prob = parseFloat(String(probVal)) || 0;
            const predictedLabel = String(mlResult.predicted_label || mlResult.threat_class || mlResult.threat_name || '').toLowerCase();
            const shouldAlert = (priority && ['CRITICAL', 'HIGH'].includes(String(priority).toUpperCase())) || (prob >= 0.85 && predictedLabel.includes('fire'));
            if (shouldAlert) {
                const payload = { hotspot, ml: mlResult, agent2: agentResult };
                await pool.query('INSERT INTO alerts (hotspot_id, payload, status) VALUES ($1,$2,$3)', [hotspot.id || null, payload, 'PENDING']);
                console.log('[ML Pipeline] Created pending alert for hotspot', hotspot.id || '(no id)');
            }
        } catch (e) {
            console.warn('Could not create pending alert', e.message || e);
        }

        // Combine and return
        return res.json({ ml: mlResult, agent2: agentResult });
    } catch (err) {
        return next(err);
    }
});

export default router;
