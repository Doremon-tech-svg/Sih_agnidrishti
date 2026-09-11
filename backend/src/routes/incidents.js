import { Router } from 'express';
import { pool } from '../db.js';
import { dispatchAlert } from '../notify.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

router.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM incidents ORDER BY created_at DESC LIMIT 500`);
        res.json(rows);
    } catch (err) { next(err); }
});

// POST /api/incidents/evaluate -- rule-based detector/skeptic preview
router.post('/evaluate', (req, res) => {
    const record = req.body || {};
    const frp = Number(record.frp || 0);
    const confidence = Number(record.confidence_score ?? record.confidence ?? 0);
    const industrialDistance = Number(record.nearest_industrial_distance_m ?? 5000);
    const industrialCount = Number(record.industrial_count || 0);
    const settlementDistance = Number(record.nearest_settlement_distance_m ?? 5000);
    const settlementCount = Number(record.settlement_count || 0);
    const buildingCount = Number(record.building_count || 0);
    const reasons = [];
    let score = 0;

    if (frp >= 30) { score += 20; reasons.push(`High fire radiative power (FRP: ${frp.toFixed(1)} MW)`); }
    else if (frp >= 10) { score += 12; reasons.push(`Moderate fire radiative power (FRP: ${frp.toFixed(1)} MW)`); }
    else if (frp > 0) { score += 5; reasons.push(`Low fire intensity detected (FRP: ${frp.toFixed(1)} MW)`); }
    if (confidence >= 0.8) { score += 5; reasons.push(`High satellite detection confidence (${Math.round(confidence * 100)}%)`); }
    if (Number(record.is_night || 0) === 1) { score += 5; reasons.push('Night-time fire detection (delayed response risk)'); }

    if (industrialCount > 0 || industrialDistance <= 1000) {
        score += industrialDistance <= 500 ? 25 : 15;
        reasons.push(`Industrial hazard proximity (${industrialDistance.toFixed(0)}m)`);
    }
    if (settlementCount > 0 || settlementDistance <= 500) {
        score += settlementDistance <= 300 ? 15 : 10;
        reasons.push(`Settlement proximity (${settlementDistance.toFixed(0)}m)`);
    }
    if (buildingCount >= 5) { score += 10; reasons.push(`High building density (${buildingCount})`); }
    else if (buildingCount > 0) { score += 5; reasons.push(`Nearby buildings (${buildingCount})`); }
    if (Number(record.is_vegetation || 0) === 1) { score += 15; reasons.push('Vegetation fuel load'); }
    else if (Number(record.is_cropland || 0) === 1) { score += 10; reasons.push('Cropland spread risk'); }

    score = Math.min(100, Math.max(0, score));
    const riskLevel = score <= 35 ? 'LOW' : score <= 70 ? 'MEDIUM' : 'HIGH';
    const suppressed = confidence < 0.3 && score < 85;
    const status = suppressed ? 'SUPPRESSED' : score >= 70 ? 'VALIDATED' : 'MONITORED';

    if (suppressed) reasons.push('Low satellite confidence and no critical risk evidence.');
    if (reasons.length === 0) reasons.push('Baseline low-intensity event with no immediate nearby hazards.');

    const response = {
        event_id: record.event_id || null,
        status,
        detected: true,
        risk_score: score,
        risk_level: riskLevel,
        confidence,
        dispatch_required: status === 'VALIDATED',
        reasons,
    };

    res.json(response);
});

// POST /api/incidents -- multi-agent pipeline pushes final verdict here
router.post('/', async (req, res, next) => {
    try {
        const { hotspot_id, agent1, agent2, agent3, status, threat_priority } = req.body;
        const { rows } = await pool.query(
            `INSERT INTO incidents (hotspot_id, agent1, agent2, agent3, status, threat_priority)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [hotspot_id, agent1, agent2, agent3, status, threat_priority]
        );
        const incidentId = rows[0].id;

        if (status === 'VALIDATED') {
            await dispatchAlert(incidentId, threat_priority);
        }
        res.status(201).json({ id: incidentId });
    } catch (err) { next(err); }
});

// GET /api/incidents/:id/report -- Generate human-readable LLM explanation
router.get('/:id/report', async (req, res, next) => {
    try {
        const incidentId = req.params.id;
        const { rows } = await pool.query(`
            SELECT i.*, h.frp, h.classification, h.class_confidence, h.risk_score, h.satellite, h.acq_date, h.lat, h.lon,
                   h.frp_zscore, h.anomaly_score
            FROM incidents i
            JOIN hotspots h ON i.hotspot_id = h.id
            WHERE i.id = $1
        `, [incidentId]);

        if (rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
        const data = rows[0];

        const prompt = `
        You are an AI assistant for AgniDrishti, an industrial fire detection system.
        Analyze the following incident data and generate a clear, professional, 2-3 sentence human-readable report.
        Focus on classification, risk priority, FRP (Fire Radiative Power), and anomaly detection.
        Do not output markdown, just plain text.
        
        Data:
        Classification: ${data.classification}
        Confidence: ${(data.class_confidence * 100).toFixed(1)}%
        FRP: ${data.frp} MW
        FRP Z-Score (Anomaly): ${data.frp_zscore}
        Threat Priority: ${data.threat_priority}
        Risk Score: ${data.risk_score}/100
        Satellite: ${data.satellite}
        Coordinates: ${data.lat}, ${data.lon}
        `;

        if (process.env.GEMINI_API_KEY) {
            try {
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result = await model.generateContent(prompt);
                const text = result.response.text();
                return res.json({ report: text });
            } catch (llmErr) {
                console.error("LLM Error:", llmErr);
                // fallback below
            }
        }

        // Fallback explanation if no key or error
        const frp = parseFloat(data.frp || 0).toFixed(1);
        const zscore = parseFloat(data.frp_zscore || 0).toFixed(2);
        const conf = ((data.class_confidence || 0.5) * 100).toFixed(1);
        const fallback = `Automated analysis confirms a ${data.threat_priority} priority ${data.classification} event with ${conf}% confidence. The thermal signature shows a Fire Radiative Power of ${frp} MW, which presents an anomaly z-score of ${zscore} against historical baselines. Immediate attention is advised.`;

        res.json({ report: fallback });
    } catch (err) { next(err); }
});

export default router;