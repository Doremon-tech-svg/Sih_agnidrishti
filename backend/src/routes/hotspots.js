/**
 * backend/src/routes/hotspots.js (v2)
 *
 * GET  /api/hotspots              — list hotspots with filters
 * POST /api/hotspots              — insert hotspot
 * PATCH /api/hotspots/:id         — update classification
 * GET  /api/hotspots/india-heatmap — full India heatmap (no bbox required)
 * GET  /api/hotspots/heatmap      — bbox-based heatmap (legacy)
 *
 * IMPORTANT: /india-heatmap and /heatmap must be defined BEFORE /:id routes.
 */

import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ── GET /api/hotspots/india-heatmap ─────────────────────────────────────────
// Full India heatmap grid — no bbox restriction, returns all hotspots binned
router.get('/india-heatmap', async (req, res, next) => {
    try {
        console.log('[MOCK] Returning hardcoded india-heatmap because DB is unreachable');
        const mockCells = [];
        for (let i = 0; i < 50; i++) {
            mockCells.push({
                lat_bin: 10.0 + Math.random() * 18.0,
                lon_bin: 70.0 + Math.random() * 18.0,
                count: Math.floor(1 + Math.random() * 20),
                max_frp: 50 + Math.random() * 200,
                avg_frp: 30 + Math.random() * 100,
                max_risk: Math.floor(Math.random() * 100),
                dominant_class: 'Industrial Fire / Accident'
            });
        }
        res.json({
            bbox: [68.0, 6.0, 97.5, 37.0],
            step: 0.1,
            days: 30,
            total_cells: mockCells.length,
            cells: mockCells,
        });
    } catch (err) { next(err); }
});

// ── GET /api/hotspots/heatmap ─────────────────────────────────────────────
// Legacy bbox-based heatmap
router.get('/heatmap', async (req, res, next) => {
    try {
        console.log('[MOCK] Returning hardcoded heatmap because DB is unreachable');
        const mockCells = [];
        for (let i = 0; i < 50; i++) {
            mockCells.push({
                lat_bin: 10.0 + Math.random() * 18.0,
                lon_bin: 70.0 + Math.random() * 18.0,
                cnt: Math.floor(1 + Math.random() * 20)
            });
        }
        res.json({ bbox: [68.0, 6.0, 97.5, 37.0], step: 0.05, cells: mockCells });
    } catch (err) { next(err); }
});

// ── GET /api/hotspots ─────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
    try {
        console.log('[MOCK] Returning hardcoded hotspots because DB is unreachable');
        const mockHotspots = [];
        const classes = ['Gas Flare', 'Industrial Thermal Source', 'Industrial Fire / Accident', 'Agricultural Burning', 'Wildfire / Forest Fire'];
        
        // Generate random hotspots in Gujarat and India
        for (let i = 0; i < 200; i++) {
            let lat, lon;
            if (i < 50) { lat = 22.85 + Math.random() * 0.3; lon = 72.45 + Math.random() * 0.3; } // Ahmedabad
            else if (i < 100) { lat = 21.05 + Math.random() * 0.15; lon = 72.55 + Math.random() * 0.15; } // Hazira
            else { lat = 10.0 + Math.random() * 18.0; lon = 70.0 + Math.random() * 18.0; }
            
            mockHotspots.push({
                id: i + 1000,
                lat, lon,
                satellite: Math.random() > 0.5 ? 'N20' : 'Aqua',
                acq_date: new Date().toISOString(),
                brightness_ti4: 300 + Math.random() * 50,
                frp: 10 + Math.random() * 200,
                confidence: Math.random() > 0.5 ? 'h' : 'n',
                classification: classes[Math.floor(Math.random() * classes.length)],
                class_confidence: 0.6 + Math.random() * 0.4,
                risk_score: Math.floor(Math.random() * 100),
                facility_id: null,
                explanation: 'Mock incident generated due to database outage.',
                district: 'Simulated District',
                state: 'Simulated State',
                agent2_status: 'EVALUATED',
                is_anomaly: Math.random() > 0.8
            });
        }
        res.json(mockHotspots);
    } catch (err) { next(err); }
});

// ── POST /api/hotspots ────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
    try {
        const {
            lat, lon, satellite, acq_date, brightness_ti4, frp, confidence,
            classification, class_confidence, risk_score, facility_id,
            explanation, raw, district,
        } = req.body;

        if (typeof lat !== 'number' || typeof lon !== 'number')
            return res.status(400).json({ error: 'lat/lon required as numbers' });

        const { rows } = await pool.query(
            `INSERT INTO hotspots
               (lat, lon, geom, satellite, acq_date, brightness_ti4, frp, confidence,
                classification, class_confidence, risk_score, facility_id, explanation, raw, district)
             VALUES ($1,$2, ST_SetSRID(ST_MakePoint($2,$1),4326), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [lat, lon, satellite, acq_date, brightness_ti4, frp, confidence,
                classification, class_confidence, risk_score, facility_id,
                explanation, raw ? JSON.stringify(raw) : null, district || null]
        );
        if (!rows.length) return res.status(409).json({ message: 'Duplicate, skipped' });
        res.status(201).json({ id: rows[0].id });
    } catch (err) { next(err); }
});

// ── PATCH /api/hotspots/:id ────────────────────────────────────────────────
router.patch('/:id', async (req, res, next) => {
    try {
        const { classification, class_confidence, risk_score, explanation, district } = req.body;
        await pool.query(
            `UPDATE hotspots
             SET classification=$1, class_confidence=$2, risk_score=$3, explanation=$4,
                 district=COALESCE($5, district)
             WHERE id=$6`,
            [classification, class_confidence, risk_score, explanation, district || null, req.params.id]
        );
        res.sendStatus(204);
    } catch (err) { next(err); }
});

export default router;