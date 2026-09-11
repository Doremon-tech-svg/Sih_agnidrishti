/**
 * backend/src/routes/notifications.js
 *
 * GET  /api/notifications/public-key  — Get VAPID public key
 * POST /api/notifications/subscribe   — Save push subscription
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { pool } from '../db.js';

const router = Router();

// VAPID keys should be in env
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BEl62iIQ6amvn6Yc0tV2d9G7zZzO-wT3f4v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v';

router.get('/public-key', (req, res) => {
    res.json({ publicKey: publicVapidKey });
});

router.post('/subscribe', requireAuth, async (req, res, next) => {
    try {
        const subscription = req.body;
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription object' });
        }

        // We assume we want to store it in `users` table `push_subscription` column
        await pool.query(
            'UPDATE users SET push_subscription = $1 WHERE id = $2',
            [subscription, req.user.id]
        );

        res.status(201).json({ message: 'Subscription saved' });
    } catch (err) {
        next(err);
    }
});

export default router;
