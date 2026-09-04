/**
 * backend/src/routes/auth.js
 *
 * POST /api/auth/login    — email + password → JWT
 * POST /api/auth/register — invite-only signup (creates PENDING/VIEWER account)
 * GET  /api/auth/me       — returns current user profile
 * GET  /api/auth/users    — ADMIN only: list all users
 * PATCH /api/auth/users/:id/approve  — ADMIN only: approve + set role
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'agnidrishti-dev-secret-change-in-prod';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';  // 8-hour shift tokens

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
                error: 'Account pending approval. Contact your system administrator.'
            });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid)
            return res.status(401).json({ error: 'Invalid credentials.' });

        // Update last_login
        await pool.query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);

        const payload = {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            designation: user.designation,
            department: user.department,
            role: user.role,
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

        res.json({ token, user: payload });
    } catch (err) { next(err); }
});

// ── POST /api/auth/register ─────────────────────────────────────────────────
// Creates account with is_approved=false — admin must approve before login works
router.post('/register', async (req, res, next) => {
    try {
        const { email, password, full_name, designation, department } = req.body;

        if (!email || !password || !full_name)
            return res.status(400).json({ error: 'email, password, and full_name are required.' });

        if (password.length < 8)
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });

        // Allowed domains — government, research, and authorised institutions
        const allowedDomains = [
            // Central government
            'gov.in', 'nic.in',
            // Key agencies
            'isro.gov.in', 'imd.gov.in', 'gsdma.org',
            'gujarat.gov.in', 'ndma.gov.in', 'ndrf.gov.in',
            // Research & academia
            'iitb.ac.in', 'iitgn.ac.in', 'iitd.ac.in', 'iitk.ac.in',
            'iisc.ac.in', 'nit.ac.in', 'bits-pilani.ac.in',
            // Generic Indian domains (for demo / testing)
            'in',
        ];

        const domain = email.split('@')[1]?.toLowerCase() || '';
        const DEV_MODE = process.env.NODE_ENV !== 'production';

        // In dev mode, allow any email for testing
        const domainAllowed = DEV_MODE || allowedDomains.some(d =>
            domain === d || domain.endsWith(`.${d}`)
        );

        if (!domainAllowed)
            return res.status(403).json({
                error: 'Registration is restricted to government and authorised institutional email addresses.',
                allowed_domains: allowedDomains,
                note: 'Contact admin@agnidrishti.gov.in to request manual access.',
            });

        const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
        if (existing.rows.length)
            return res.status(409).json({ error: 'An account with this email already exists.' });

        const hash = await bcrypt.hash(password, 12);
        const { rows } = await pool.query(
            `INSERT INTO users (email, password_hash, full_name, designation, department, role, is_approved)
             VALUES ($1, $2, $3, $4, $5, 'VIEWER', FALSE) RETURNING id, email, full_name, role, is_approved`,
            [email.toLowerCase(), hash, full_name, designation || null, department || null]
        );

        res.status(201).json({
            message: 'Registration submitted. Your account will be reviewed by the system administrator.',
            user: rows[0],
        });
    } catch (err) { next(err); }
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, email, full_name, designation, department, role, is_approved, last_login, created_at
             FROM users WHERE id = $1`, [req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'User not found.' });
        res.json(rows[0]);
    } catch (err) { next(err); }
});

// ── GET /api/auth/users — ADMIN only ────────────────────────────────────────
router.get('/users', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, email, full_name, designation, department, role, is_approved, last_login, created_at
             FROM users ORDER BY created_at DESC`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

// ── PATCH /api/auth/users/:id/approve — ADMIN only ─────────────────────────
router.patch('/users/:id/approve', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const { role = 'VIEWER', is_approved = true } = req.body;
        const validRoles = ['ADMIN', 'ANALYST', 'VIEWER'];
        if (!validRoles.includes(role))
            return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });

        await pool.query(
            'UPDATE users SET role=$1, is_approved=$2 WHERE id=$3',
            [role, is_approved, req.params.id]
        );
        res.json({ message: `User ${req.params.id} updated: role=${role}, approved=${is_approved}` });
    } catch (err) { next(err); }
});

export default router;
