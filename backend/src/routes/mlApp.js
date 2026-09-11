import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const ML_APP_URL = process.env.ML_APP_URL || 'http://localhost:8001';

function tierFromRisk(score) {
    if (score >= 76) return 'CRITICAL';
    if (score >= 51) return 'HIGH';
    if (score >= 26) return 'MODERATE';
    return 'LOW';
}

async function classifyOne(hotspotId) {
    const { rows } = await pool.query(
        `SELECT h.*, f.id AS linked_facility_id
     FROM hotspots h
     LEFT JOIN facilities f ON f.id = h.facility_id
     WHERE h.id = $1`,
        [hotspotId]
    );
    if (!rows.length) throw new Error('Hotspot not found');
    const h = rows[0];

    const acq = h.acq_date ? new Date(h.acq_date) : new Date();
    const payload = {
        event_id: `HS-${h.id}`,
        latitude: h.lat,
        longitude: h.lon,
        acquisition_date: acq.toISOString().slice(0, 10),
        acquisition_time: acq.toTimeString().slice(0, 5),
        daynight: 'D',
        frp: h.frp || 0,
        bright_ti4: h.brightness_ti4 || null,
        confidence: h.confidence || 'nominal',
        osm: h.linked_facility_id
            ? { industrial_areas: { count: 1, nearest_distance_m: 200 } }
            : { industrial_areas: { count: 0, nearest_distance_m: 5000 } },
    };

    const mlRes = await fetch(`${ML_APP_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!mlRes.ok) throw new Error(`ML service failed: ${mlRes.status}`);
    const result = await mlRes.json();

    await pool.query(
        `UPDATE hotspots
     SET classification=$1, class_confidence=$2, risk_score=$3, explanation=$4,
         gas_so2_ppb=$5, gas_no2_ppb=$6, agent2_status=$7, agent2_recommendation=$8
     WHERE id=$9`,
        [
            result.classification,
            result.confidence,
            Math.round(result.risk_score),
            result.reasons?.join('; ') || null,
            result.gas_so2_ppb ?? null,
            result.gas_no2_ppb ?? null,
            result.agent2_status ?? null,
            result.agent2_recommendation ?? null,
            hotspotId,
        ]
    );

    if (result.dispatch_required) {
        const priority = tierFromRisk(result.risk_score);
        await pool.query(
            `INSERT INTO incidents (hotspot_id, agent1, agent2, agent3, status, threat_priority)
       VALUES ($1,$2,$3,$4,$5,$6)`,
            [
                hotspotId,
                { source: 'backend/app ML pipeline', frp: h.frp },
                {
                    status: result.agent2_status ?? 'NOT_RUN',
                    so2_ppb: result.gas_so2_ppb ?? null,
                    no2_ppb: result.gas_no2_ppb ?? null,
                    recommendation: result.agent2_recommendation ?? null,
                },
                { severity_tier: result.severity_tier, risk_score: result.risk_score },
                'VALIDATED',
                priority,
            ]
        );
    }

    return result;
}

router.post('/classify/:hotspotId', async (req, res) => {
    try {
        const result = await classifyOne(req.params.hotspotId);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/classify-all', async (req, res) => {
    const { rows } = await pool.query(`SELECT id FROM hotspots WHERE classification IS NULL LIMIT 200`);
    const results = [];
    for (const row of rows) {
        try {
            await classifyOne(row.id);
            results.push({ id: row.id, ok: true });
        } catch (e) {
            results.push({ id: row.id, ok: false, error: e.message });
        }
    }
    res.json({ processed: results.length, results });
});

export default router;