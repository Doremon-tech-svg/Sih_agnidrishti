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
import './scheduler.js';

import hotspots from './routes/hotspots.js';
import facilities from './routes/facilities.js';
import incidents from './routes/incidents.js';
import alerts from './routes/alerts.js';
import ml from './routes/ml.js';
import admin from './routes/admin.js';
import auth from './routes/auth.js';
import mlApp from './routes/mlApp.js';
import notifications from './routes/notifications.js';

import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth, requireRole } from './middleware/authMiddleware.js';

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
initializeSocket(server);

app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '5mb' }));

// ── Public routes ──────────────────────────────────────────────────────────
app.use('/api/auth', auth);
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// ── Protected routes (require valid JWT) ───────────────────────────────────
// Read-only data: any authenticated role
app.use('/api/hotspots', requireAuth, hotspots);
app.use('/api/facilities', requireAuth, facilities);
app.use('/api/incidents', requireAuth, incidents);
app.use('/api/alerts', alerts); // alerts has its own requireAuth

// Notifications
app.use('/api/notifications', notifications);

// ML pipeline: SUPER_ADMIN, ADMIN or ANALYST only
app.use('/api/ml', ml); // role check inside router
app.use('/api/ml-app', mlApp); // role check inside router

// Admin-only endpoints
app.use('/api/admin', admin); // role check inside router

app.use(errorHandler);

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Backend up on :${port} with Socket.IO`));