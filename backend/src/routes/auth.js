/**
 * backend/src/routes/auth.js (v2)
 *
 * POST /api/auth/login              — email + password → JWT
 * POST /api/auth/register           — creates PENDING account (VIEWER/ANALYST)
 * GET  /api/auth/me                 — current user profile
 * GET  /api/auth/users              — ADMIN only: list all users
 * PATCH /api/auth/users/:id/approve — ADMIN only: set role + approve
 * PATCH /api/auth/users/:id/location — set work lat/lon
 * POST /api/auth/push-subscribe     — save Web Push subscription
 * DELETE /api/auth/push-subscribe   — remove push subscription
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();
const JWT_SECRET  = process.env.JWT_SECRET  || 'agnidrishti-dev-secret-change-in-prod';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: 'Email and password are required.' });

        const { rows } = await pool.query(
            'SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]
        );
        const user = rows[0];

        if (!user)
            return res.status(401).json({ error: 'Invalid credentials.' });

        if (!user.is_approved)
            return res.status(403).json({
                error: 'Account pending approval. Contact your district administrator.',
                pending: true,
            });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid)
            return res.status(401).json({ error: 'Invalid credentials.' });

        await pool.query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);

        const payload = {
            id:          user.id,
            email:       user.email,
            full_name:   user.full_name,
            designation: user.designation,
            department:  user.department,
            role:        user.role,
            facility_id: user.facility_id,
            district:    user.district,
            state:       user.state,
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

        res.json({ token, user: payload });
    } catch (err) { next(err); }
});

// ── POST /api/auth/seed-demo ────────────────────────────────────────────────
// Utility endpoint for live demonstrations to instantly seed the DB with
// the default Admin, Analyst, and Viewer accounts expected by the frontend.
router.post('/seed-demo', async (req, res, next) => {
    try {
        const TEST_ACCOUNTS = [
            { email: 'admin@agnidrishti.gov.in', password: 'Admin@2026', role: 'ADMIN', full_name: 'System Admin' },
            { email: 'analyst@agnidrishti.gov.in', password: 'Analyst@2026', role: 'ANALYST', full_name: 'Lead Analyst' },
            { email: 'viewer@agnidrishti.gov.in', password: 'Viewer@2026', role: 'VIEWER', full_name: 'Field Viewer' },
        ];
        
        let created = 0;
        for (const acc of TEST_ACCOUNTS) {
            const existing = await pool.query('SELECT id FROM users WHERE email=$1', [acc.email]);
            if (existing.rows.length === 0) {
                const hash = await bcrypt.hash(acc.password, 12);
                await pool.query(
                    `INSERT INTO users (email, password_hash, full_name, role, is_approved, department) 
                     VALUES ($1, $2, $3, $4, TRUE, 'GSDMA - Gujarat State Disaster Management Authority')`,
                    [acc.email, hash, acc.full_name, acc.role]
                );
                created++;
            }
        }
        res.json({ message: `Successfully seeded ${created} demo accounts.`, ready: true });
    } catch (err) { next(err); }
});

// ── POST /api/auth/register ─────────────────────────────────────────────────
// Creates account with is_approved=false — admin must approve before login works.
// Users specify their facility (or lat/lon workplace) during registration.
router.post('/register', async (req, res, next) => {
    try {
        const {
            email, password, full_name, designation, department,
            role = 'VIEWER',
            facility_id = null,
            work_lat = null,
            work_lon = null,
            phone = null,
        } = req.body;

        if (!email || !password || !full_name)
            return res.status(400).json({ error: 'email, password, and full_name are required.' });

        if (password.length < 8)
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });

        // Role validation — users can only self-register as VIEWER or ANALYST
        // ADMIN accounts must be created by SUPER_ADMIN through admin panel
        const allowedSelfRoles = ['VIEWER', 'ANALYST'];
        const requestedRole = role.toUpperCase();
        if (!allowedSelfRoles.includes(requestedRole))
            return res.status(400).json({
                error: `Self-registration only allowed for roles: ${allowedSelfRoles.join(', ')}.`
            });

        const DEV_MODE = process.env.NODE_ENV !== 'production';
        if (!DEV_MODE) {
            // Domain check in production
            const allowedDomains = [
                'gov.in', 'nic.in', 'isro.gov.in', 'imd.gov.in', 'gsdma.org',
                'gujarat.gov.in', 'ndma.gov.in', 'ndrf.gov.in',
                'iitb.ac.in', 'iitgn.ac.in', 'iitd.ac.in', 'iisc.ac.in',
            ];
            const domain = email.split('@')[1]?.toLowerCase() || '';
            const domainOk = allowedDomains.some(d => domain === d || domain.endsWith(`.${d}`));
            if (!domainOk) {
                return res.status(403).json({
                    error: 'Registration restricted to government and authorised institutional emails.',
                });
            }
        }

        const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
        if (existing.rows.length)
            return res.status(409).json({ error: 'An account with this email already exists.' });

        // Resolve district from facility if facility_id is provided
        let district = null;
        let state = null;
        if (facility_id) {
            const { rows: facilityRows } = await pool.query(
                'SELECT district, state FROM facilities WHERE id = $1', [facility_id]
            );
            if (facilityRows.length) {
                district = facilityRows[0].district;
                state = facilityRows[0].state;
            }
        }

        const hash = await bcrypt.hash(password, 12);

        // Insert user
        const { rows } = await pool.query(
            `INSERT INTO users
               (email, password_hash, full_name, designation, department, role, is_approved,
                facility_id, district, state, phone)
             VALUES ($1,$2,$3,$4,$5,$6,FALSE,$7,$8,$9,$10)
             RETURNING id, email, full_name, role, is_approved, facility_id, district`,
            [
                email.toLowerCase(), hash, full_name,
                designation || null, department || null,
                requestedRole,
                facility_id || null, district, state,
                phone || null,
            ]
        );

        const newUser = rows[0];

        // Set work location if provided
        if (work_lat != null && work_lon != null) {
            await pool.query(
                `UPDATE users SET work_lat=$1, work_lon=$2,
                 work_geom=ST_SetSRID(ST_MakePoint($3,$4),4326) WHERE id=$5`,
                [parseFloat(work_lat), parseFloat(work_lon), parseFloat(work_lon), parseFloat(work_lat), newUser.id]
            );
        }

        res.status(201).json({
            message: `Registration submitted as ${requestedRole}. Your account will be reviewed by your district administrator.`,
            user: newUser,
        });
    } catch (err) { next(err); }
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, email, full_name, designation, department, role, is_approved,
                    facility_id, district, state, phone, work_lat, work_lon, last_login, created_at
             FROM users WHERE id = $1`,
            [req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'User not found.' });
        res.json(rows[0]);
    } catch (err) { next(err); }
});

// ── GET /api/auth/users — ADMIN only ────────────────────────────────────────
router.get('/users', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
    try {
        const { district, role, approved } = req.query;
        const conditions = [];
        const values = [];

        // Non-super admins can only see users in their own district
        if (req.user.role === 'ADMIN' && req.user.district) {
            values.push(req.user.district);
            conditions.push(`district = $${values.length}`);
        }

        if (district) { values.push(district); conditions.push(`district = $${values.length}`); }
        if (role) { values.push(role.toUpperCase()); conditions.push(`role = $${values.length}`); }
        if (approved !== undefined) { values.push(approved === 'true'); conditions.push(`is_approved = $${values.length}`); }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const { rows } = await pool.query(
            `SELECT id, email, full_name, designation, department, role, is_approved,
                    facility_id, district, state, phone, last_login, created_at
             FROM users ${where} ORDER BY created_at DESC`,
            values
        );
        res.json(rows);
    } catch (err) { next(err); }
});

// ── PATCH /api/auth/users/:id/approve — ADMIN only ─────────────────────────
router.patch('/users/:id/approve', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
    try {
        const { role = 'VIEWER', is_approved = true } = req.body;
        const validRoles = ['ADMIN', 'ANALYST', 'VIEWER'];
        if (!validRoles.includes(role.toUpperCase()))
            return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });

        // Regular ADMIN cannot elevate to ADMIN or SUPER_ADMIN
        if (req.user.role === 'ADMIN' && ['ADMIN', 'SUPER_ADMIN'].includes(role.toUpperCase()))
            return res.status(403).json({ error: 'You cannot assign ADMIN or SUPER_ADMIN role.' });

        await pool.query(
            'UPDATE users SET role=$1, is_approved=$2 WHERE id=$3',
            [role.toUpperCase(), is_approved, req.params.id]
        );
        res.json({ message: `User ${req.params.id} updated: role=${role}, approved=${is_approved}` });
    } catch (err) { next(err); }
});

// ── PATCH /api/auth/users/:id/location ─────────────────────────────────────
router.patch('/users/:id/location', requireAuth, async (req, res, next) => {
    try {
        const targetId = parseInt(req.params.id, 10);
        if (isNaN(targetId)) return res.status(400).json({ error: 'Invalid user id' });

        if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN' && req.user.id !== targetId)
            return res.status(403).json({ error: 'Insufficient privileges' });

        const { work_lat, work_lon } = req.body;
        if (work_lat === undefined || work_lon === undefined)
            return res.status(400).json({ error: 'work_lat and work_lon are required' });

        const lat = parseFloat(work_lat);
        const lon = parseFloat(work_lon);
        if (!isFinite(lat) || !isFinite(lon))
            return res.status(400).json({ error: 'Invalid latitude/longitude' });

        await pool.query(
            `UPDATE users SET work_lat=$1, work_lon=$2,
             work_geom=ST_SetSRID(ST_MakePoint($3,$4),4326) WHERE id=$5`,
            [lat, lon, lon, lat, targetId]
        );
        res.json({ message: 'Location updated', user_id: targetId });
    } catch (err) { next(err); }
});

// ── POST /api/auth/push-subscribe ─────────────────────────────────────────
router.post('/push-subscribe', requireAuth, async (req, res, next) => {
    try {
        const { endpoint, keys } = req.body;
        if (!endpoint || !keys?.p256dh || !keys?.auth)
            return res.status(400).json({ error: 'Invalid push subscription object' });

        await pool.query(
            `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (user_id, endpoint) DO UPDATE
             SET p256dh=$3, auth_key=$4`,
            [req.user.id, endpoint, keys.p256dh, keys.auth]
        );
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// ── DELETE /api/auth/push-subscribe ────────────────────────────────────────
router.delete('/push-subscribe', requireAuth, async (req, res, next) => {
    try {
        const { endpoint } = req.body;
        await pool.query(
            'DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',
            [req.user.id, endpoint]
        );
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// ── GET /api/auth/facilities — for registration dropdown ────────────────────
router.get('/facilities', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, name, type, district, state FROM facilities ORDER BY state, district, name LIMIT 2000`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

export default router;
