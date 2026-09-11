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
        const step = parseFloat(req.query.step || '0.1');
        const days = parseInt(req.query.days || '30');
        const safeStep = Math.max(0.05, Math.min(step, 2.0));

        const { rows } = await pool.query(
            `SELECT
               (floor(lat::numeric/$1)*$1)::float  AS lat_bin,
               (floor(lon::numeric/$1)*$1)::float  AS lon_bin,
               COUNT(*)::int                       AS count,
               MAX(frp)::float                     AS max_frp,
               AVG(frp)::float                     AS avg_frp,
               MAX(risk_score)::float              AS max_risk,
               mode() WITHIN GROUP (ORDER BY classification) AS dominant_class
             FROM hotspots
             WHERE lat BETWEEN 6.0 AND 37.0
               AND lon BETWEEN 68.0 AND 97.5
               AND acq_date >= now() - ($2 || ' days')::interval
             GROUP BY lat_bin, lon_bin
             ORDER BY count DESC`,
            [safeStep, days]
        );

        res.json({
            bbox: [68.0, 6.0, 97.5, 37.0],
            step: safeStep,
            days,
            total_cells: rows.length,
            cells: rows,
        });
    } catch (err) { next(err); }
});

// ── GET /api/hotspots/heatmap ─────────────────────────────────────────────
// Legacy bbox-based heatmap
router.get('/heatmap', async (req, res, next) => {
    try {
        const { bbox, step = '0.05' } = req.query;

        // If no bbox, default to all of India
        let minLon = 68.0, minLat = 6.0, maxLon = 97.5, maxLat = 37.0;
        if (bbox) {
            const parts = bbox.split(',').map(Number);
            if (parts.length === 4 && parts.every(p => !Number.isNaN(p))) {
                [minLon, minLat, maxLon, maxLat] = parts;
            }
        }

        const stepNum = Math.max(0.05, parseFloat(step) || 0.05);

        const { rows } = await pool.query(
            `SELECT
               (floor(lat::numeric/$5)*$5)::float AS lat_bin,
               (floor(lon::numeric/$5)*$5)::float AS lon_bin,
               COUNT(*)::int                      AS cnt
             FROM hotspots
             WHERE lat BETWEEN $2 AND $4 AND lon BETWEEN $1 AND $3
             GROUP BY lat_bin, lon_bin`,
            [minLon, minLat, maxLon, maxLat, stepNum]
        );

        res.json({ bbox: [minLon, minLat, maxLon, maxLat], step: stepNum, cells: rows });
    } catch (err) { next(err); }
});

// ── GET /api/hotspots ─────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
    try {
        const { since, class: cls, bbox, days = '30', limit = '5000' } = req.query;
        const conditions = [];
        const values = [];

        // Default to last N days if no `since`
        if (since) {
            values.push(since);
            conditions.push(`acq_date >= $${values.length}`);
        } else {
            values.push(parseInt(days));
            conditions.push(`acq_date >= now() - ($${values.length} || ' days')::interval`);
        }

        if (cls) {
            values.push(cls);
            conditions.push(`classification = $${values.length}`);
        }

        if (bbox) {
            const parts = bbox.split(',').map(Number);
            if (parts.length === 4 && parts.every(p => !Number.isNaN(p))) {
                values.push(parts[0], parts[1], parts[2], parts[3]);
                conditions.push(
                    `ST_Within(geom, ST_MakeEnvelope($${values.length-3}, $${values.length-2}, $${values.length-1}, $${values.length}, 4326))`
                );
            }
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const safeLimit = Math.min(parseInt(limit) || 5000, 10000);

        const { rows } = await pool.query(
            `SELECT id, lat, lon, satellite, acq_date, brightness_ti4, frp, confidence,
                    classification, class_confidence, risk_score, facility_id, explanation,
                    district
             FROM hotspots ${where}
             ORDER BY acq_date DESC
             LIMIT ${safeLimit}`,
            values
        );
        res.json(rows);
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