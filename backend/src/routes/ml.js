import { Router } from 'express';
import { pool } from '../db.js';
import { classifyHotspotRow } from '../services/mlService.js';

const router = Router();

function tierFromRisk(score) {
    if (score >= 76) return 'CRITICAL';
    if (score >= 51) return 'HIGH';
    if (score >= 26) return 'MODERATE';
    return 'LOW';
}

async function classifyOne(hotspotId) {
    const { rows } = await pool.query(
        `SELECT h.* FROM hotspots h WHERE h.id = $1`,
        [hotspotId]
    );
    if (!rows.length) throw new Error('Hotspot not found');
    const h = rows[0];

    const result = await classifyHotspotRow(h);

    await pool.query(
        `UPDATE hotspots
         SET classification=$1, class_confidence=$2, risk_score=$3,
             explanation=$4, agent2_status=$5, gas_analysis=$6
         WHERE id=$7`,
        [
            result.classification,
            result.confidence,
            Math.round(result.risk_score),
            result.reasons?.join('; ') || null,
            result.agent2_status || null,
            result.gas_analysis || null,
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
                    classification: result.classification, confidence: result.confidence,
                    gas_status: result.agent2_status
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
        res.json(await classifyOne(req.params.hotspotId));
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