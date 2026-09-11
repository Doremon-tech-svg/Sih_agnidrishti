import { Router } from 'express';
import { pool } from '../db.js';
import { classifyHotspotRow } from '../services/mlService.js';
import { createAlertAndNotifyAdmin } from '../services/alertService.js';

const router = Router();

async function classifyOne(hotspotId) {
    const { rows } = await pool.query(`SELECT h.* FROM hotspots h WHERE h.id = $1`, [hotspotId]);
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
        const priority = result.priority || result.risk_level;
        const { rows: [inc] } = await pool.query(
            `INSERT INTO incidents (hotspot_id, agent1, agent2, agent3, status, threat_priority)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [
                hotspotId,
                { source: 'backend ML pipeline', frp: h.frp },
                { classification: result.classification, confidence: result.confidence, gas_status: result.agent2_status },
                { severity_tier: result.severity_tier, risk_score: result.risk_score },
                'VALIDATED',
                priority,
            ]
        );

        // Agent 3 entry point: create PENDING alert + notify district admin for confirmation
        await createAlertAndNotifyAdmin({ ...h, id: hotspotId }, result);
        result.incident_id = inc.id;
    }

    return result;
}

/**
 * Classify every unclassified hotspot. Used by both the HTTP route and the
 * scheduler cron chain (step 5 of the pipeline).
 */
export async function classifyAllHotspots(limit = 200) {
    const { rows } = await pool.query(
        `SELECT id FROM hotspots WHERE classification IS NULL LIMIT $1`,
        [limit]
    );
    const results = [];
    for (const row of rows) {
        try {
            await classifyOne(row.id);
            results.push({ id: row.id, ok: true });
        } catch (e) {
            results.push({ id: row.id, ok: false, error: e.message });
        }
    }
    return results;
}

router.post('/classify/:hotspotId', async (req, res) => {
    try {
        res.json(await classifyOne(req.params.hotspotId));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/classify-all', async (req, res) => {
    const results = await classifyAllHotspots(200);
    res.json({ processed: results.length, results });
});

export default router;