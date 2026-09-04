/**
 * backend/src/middleware/authMiddleware.js
 * JWT verification + role-based access guard
 */
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'agnidrishti-dev-secret-change-in-prod';

/**
 * requireAuth — verifies JWT, attaches req.user
 */
export function requireAuth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }
    const token = header.slice(7);
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: 'Token expired or invalid. Please log in again.' });
    }
}

/**
 * requireRole(...roles) — gates a route to specific roles
 * Usage: router.post('/run', requireAuth, requireRole('ADMIN','ANALYST'), handler)
 */
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}.`
            });
        }
        next();
    };
}
