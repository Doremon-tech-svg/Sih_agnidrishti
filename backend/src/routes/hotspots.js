import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { since, class: cls } = req.query;
    const conditions = [];
    const values = [];
    if (since) { values.push(since); conditions.push(`acq_date >= $${values.length}`); }
    if (cls) { values.push(cls); conditions.push(`classification = $${values.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT id, lat, lon, satellite, acq_date, brightness_ti4, frp, confidence,
              classification, class_confidence, risk_score, facility_id, explanation
       FROM hotspots ${where} ORDER BY acq_date DESC LIMIT 5000`,
      values
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      lat, lon, satellite, acq_date, brightness_ti4, frp, confidence,
      classification, class_confidence, risk_score, facility_id, explanation, raw
    } = req.body;

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'lat/lon required as numbers' });
    }

    const { rows } = await pool.query(
      `INSERT INTO hotspots
        (lat, lon, geom, satellite, acq_date, brightness_ti4, frp, confidence,
         classification, class_confidence, risk_score, facility_id, explanation, raw)
       VALUES ($1,$2, ST_SetSRID(ST_MakePoint($2,$1),4326), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [lat, lon, satellite, acq_date, brightness_ti4, frp, confidence,
        classification, class_confidence, risk_score, facility_id, explanation, raw]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { classification, class_confidence, risk_score, explanation } = req.body;
    await pool.query(
      `UPDATE hotspots SET classification=$1, class_confidence=$2, risk_score=$3, explanation=$4
       WHERE id=$5`,
      [classification, class_confidence, risk_score, explanation, req.params.id]
    );
    res.sendStatus(204);
  } catch (err) { next(err); }
});

export default router;