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