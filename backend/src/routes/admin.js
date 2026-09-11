import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';

const router = Router();

// POST /api/admin/fetch-firms -> trigger FIRMS fetch script (ADMIN only)
router.post('/fetch-firms', async (req, res) => {
    try {
        const ROOT = path.join(process.cwd());
        const script = path.join(ROOT, 'backend', 'scripts', 'fetchFirms.js');

        // spawn detached process so HTTP response isn't blocked
        const child = spawn(process.execPath, [script], {
            cwd: ROOT,
            env: process.env,
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        res.status(202).json({ status: 'started', pid: child.pid, script: 'fetchFirms.js' });
    } catch (e) {
        res.status(500).json({ error: e.message || String(e) });
    }
});

export default router;
