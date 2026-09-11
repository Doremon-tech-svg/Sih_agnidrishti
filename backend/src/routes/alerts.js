import { Router } from 'express';
import { pool } from '../db.js';
import nodemailer from 'nodemailer';

const router = Router();

// Simple email transporter: uses env SMTP if available, otherwise logs
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}

async function sendEmail(to, subject, text) {
    if (transporter) {
        try {
            const res = await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
            return { ok: true, info: res };
        } catch (e) {
            console.warn('Email send failed', e.message || e);
            return { ok: false, error: e.message || String(e) };
        }
    }
    console.log(`[EMAIL MOCK] to=${to} subject=${subject}\n${text}`);
    return { ok: true, info: 'mock' };
}

// ── GET /api/alerts ──────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM alerts ORDER BY created_at DESC LIMIT 500`);
        res.json(rows);
    } catch (err) { next(err); }
});

// ── POST /api/alerts/create  (internal) ─────────────────────────────────
// Create a pending alert for admin confirmation
router.post('/create', async (req, res, next) => {
    try {
        const { hotspot_id, hotspot, ml_result } = req.body;
        const payload = { hotspot_id, hotspot, ml_result };
        const { rows } = await pool.query(
            'INSERT INTO alerts (hotspot_id, payload, status) VALUES ($1,$2,$3) RETURNING id',
            [hotspot_id || null, payload, 'PENDING']
        );
        const alertId = rows[0].id;
        res.status(201).json({ id: alertId, status: 'PENDING' });
    } catch (err) { next(err); }
});

// ── GET /api/alerts/pending  (ADMIN) ────────────────────────────────────
router.get('/pending', async (req, res, next) => {
    try {
        const { rows } = await pool.query('SELECT id, payload, created_at FROM alerts WHERE status=$1 ORDER BY created_at ASC', ['PENDING']);
        res.json(rows);
    } catch (err) { next(err); }
});

// ── POST /api/alerts/:id/confirm  (ADMIN) ───────────────────────────────
// Confirms an alert and dispatches notifications to nearby users
router.post('/:id/confirm', async (req, res, next) => {
    try {
        const alertId = req.params.id;
        // Mark alert confirmed by admin
        await pool.query('UPDATE alerts SET status=$1, admin_id=$2 WHERE id=$3', ['CONFIRMED', req.user.id, alertId]);

        // Load alert payload
        const { rows } = await pool.query('SELECT payload FROM alerts WHERE id=$1', [alertId]);
        if (!rows.length) return res.status(404).json({ error: 'Alert not found' });
        const payload = rows[0].payload || {};
        const hotspot = payload.hotspot || {};

        // Find nearby users: within 10km of hotspot or registered to same facility
        const lat = parseFloat(hotspot.latitude || hotspot.lat || hotspot.lat);
        const lon = parseFloat(hotspot.longitude || hotspot.lon || hotspot.lon);
        const facilityId = hotspot.facility_id || null;

        const nearbyUsers = [];
        if (facilityId) {
            const { rows: frows } = await pool.query('SELECT u.id, u.email, u.work_lat, u.work_lon FROM users u WHERE u.work_geom IS NOT NULL AND EXISTS(SELECT 1 FROM facilities f WHERE f.id=$1 AND ST_Intersects(u.work_geom, f.geom))', [facilityId]);
            nearbyUsers.push(...frows);
        }

        // Spatial lookup within 10km
        const radiusMeters = 10000;
        const { rows: spatialRows } = await pool.query(
            `SELECT id, email, work_lat, work_lon FROM users WHERE work_geom IS NOT NULL AND ST_DWithin(work_geom, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)`,
            [lon, lat, radiusMeters]
        );
        spatialRows.forEach(r => nearbyUsers.push(r));

        // Deduplicate
        const uniq = new Map();
        nearbyUsers.forEach(u => { if (u && u.id) uniq.set(u.id, u); });
        const targets = Array.from(uniq.values());

        // Queue notifications and send emails (fallback)
        for (const user of targets) {
            await pool.query('INSERT INTO notifications (alert_id, user_id, channel, to_addr, status) VALUES ($1,$2,$3,$4,$5)', [alertId, user.id, 'email', user.email, 'QUEUED']);
            if (user.email) {
                const subject = `AgniDrishti Alert: Thermal anomaly near your area`;
                const text = `A potential critical thermal event was detected near your registered location. Details:\n${JSON.stringify(hotspot, null, 2)}\nPlease await official confirmation from local authorities.`;
                const r = await sendEmail(user.email, subject, text);
                const status = r.ok ? 'SENT' : 'FAILED';
                await pool.query('UPDATE notifications SET status=$1, detail=$2, sent_at=now() WHERE alert_id=$3 AND user_id=$4', [status, r.ok ? JSON.stringify(r.info) : r.error, alertId, user.id]);
            }
        }

        // Mark alert dispatched
        await pool.query('UPDATE alerts SET status=$1 WHERE id=$2', ['DISPATCHED', alertId]);

        res.json({ alert: alertId, dispatched: targets.length });
    } catch (err) { next(err); }
});

export default router;