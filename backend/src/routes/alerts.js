import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { confirmAndDispatchAlert, rejectAlert } from '../services/alertService.js';

const router = Router();

// ── GET /api/alerts ──────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM alerts ORDER BY created_at DESC LIMIT 500`);
        res.json(rows);
    } catch (err) { next(err); }
});

// ── GET /api/alerts/pending  (ADMIN/SUPER_ADMIN) ────────────────────────
router.get('/pending', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM alerts WHERE status = 'PENDING' ORDER BY created_at ASC`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

// ── POST /api/alerts/:id/confirm  (ADMIN/SUPER_ADMIN) ───────────────────
// Confirms a PENDING alert and dispatches notifications to target users (Agent 3).
router.post('/:id/confirm', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
    try {
        const result = await confirmAndDispatchAlert(req.params.id, req.user.id);
        res.json(result);
    } catch (err) { next(err); }
});

// ── POST /api/alerts/:id/reject  (ADMIN/SUPER_ADMIN) ────────────────────
router.post('/:id/reject', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
    try {
        const result = await rejectAlert(req.params.id, req.user.id);
        res.json(result);
    } catch (err) { next(err); }
});

export default router;