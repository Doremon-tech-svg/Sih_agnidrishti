import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

// POST /api/admin/fetch-firms -> trigger FIRMS fetch script (ADMIN/SUPER_ADMIN only)
router.post('/fetch-firms', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const ROOT = path.join(process.cwd());
        const script = path.join(ROOT, 'backend', 'scripts', 'fetchFirms.js');

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