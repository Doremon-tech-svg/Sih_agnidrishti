/**
 * backend/src/routes/notifications.js
 *
 * GET /api/notifications/public-key — Get VAPID public key.
 *
 * The old POST /subscribe route (writing to users.push_subscription JSON
 * column) is removed — it conflicted with auth.js's push_subscriptions
 * table, which notifyService.js already queries correctly. One
 * push-subscription system: the table, via auth.js POST /push-subscribe.
 */

import { Router } from 'express';

const router = Router();

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BEl62iIQ6amvn6Yc0tV2d9G7zZzO-wT3f4v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v';

router.get('/public-key', (req, res) => {
    res.json({ publicKey: publicVapidKey });
});

export default router;