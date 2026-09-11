/**
 * backend/src/index.js
 *
 * Express entry point. Sets up Socket.IO, middleware, and routes.
 */

import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import http from 'http';
import { initializeSocket } from './socket.js';
import { setSocketIO } from './services/notifyService.js';
import './scheduler.js';

import hotspots from './routes/hotspots.js';
import facilities from './routes/facilities.js';
import incidents from './routes/incidents.js';
import alerts from './routes/alerts.js';
import ml from './routes/ml.js';
import admin from './routes/admin.js';
import auth from './routes/auth.js';
import notifications from './routes/notifications.js';

import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth, requireRole } from './middleware/authMiddleware.js';

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO and wire it into the notification dispatcher
const io = initializeSocket(server);
setSocketIO(io);

const frontendUrl = process.env.FRONTEND_URL;
app.use(cors({
    origin: frontendUrl ? [frontendUrl, frontendUrl.replace(/\/$/, '')] : '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200,
}));
app.use(express.json({ limit: '5mb' }));

// ── Public routes ──────────────────────────────────────────────────────────
app.use('/api/auth', auth);
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// ── Protected routes (require valid JWT) ───────────────────────────────────
app.use('/api/hotspots', requireAuth, hotspots);
app.use('/api/facilities', requireAuth, facilities);
app.use('/api/incidents', requireAuth, incidents);
app.use('/api/alerts', alerts); // alerts has its own requireAuth

// Notifications
app.use('/api/notifications', notifications);

// ML pipeline: role check inside router
app.use('/api/ml', ml);

// Admin-only endpoints (auth now enforced inside admin.js)
app.use('/api/admin', admin);

app.use(errorHandler);

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Backend up on :${port} with Socket.IO`));