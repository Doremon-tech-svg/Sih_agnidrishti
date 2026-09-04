import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import './scheduler.js';

import hotspots from './routes/hotspots.js';
import facilities from './routes/facilities.js';
import incidents from './routes/incidents.js';
import alerts from './routes/alerts.js';
import ml from './routes/ml.js';
import auth from './routes/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth, requireRole } from './middleware/authMiddleware.js';

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '5mb' }));

// ── Puiblic routes ──────────────────────────────────────────────────────────
app.use('/api/auth', auth);
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// ── Protected routes (require valid JWT) ───────────────────────────────────
// Read-only data: any authenticated role
app.use('/api/hotspots', requireAuth, hotspots);
app.use('/api/facilities', requireAuth, facilities);
app.use('/api/incidents', requireAuth, incidents);
app.use('/api/alerts', requireAuth, alerts);

// ML pipeline: ADMIN or ANALYST only
app.use('/api/ml', requireAuth, requireRole('ADMIN', 'ANALYST'), ml);

app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Backend up on :${port}`));