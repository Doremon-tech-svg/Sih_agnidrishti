import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, name, type, osm_id, ST_AsGeoJSON(geom) AS geometry FROM facilities`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const facility = await pool.query(
            `SELECT id, name, type, osm_id, ST_AsGeoJSON(geom) AS geometry FROM facilities WHERE id=$1`,
            [id]
        );
        if (!facility.rows.length) return res.status(404).json({ error: 'Not found' });

        const history = await pool.query(
            `SELECT id, acq_date, frp, brightness_ti4, classification, risk_score
         FROM hotspots WHERE facility_id=$1 ORDER BY acq_date ASC`,
            [id]
        );

        const stats = await pool.query(
            `SELECT AVG(frp) AS avg_frp, STDDEV(frp) AS std_frp, COUNT(*) AS detection_count,
                MAX(acq_date) AS last_seen
         FROM hotspots WHERE facility_id=$1`,
            [id]
        );

        res.json({
            ...facility.rows[0],
            history: history.rows,
            stats: stats.rows[0],
        });
    } catch (err) { next(err); }
});

// Upsert so re-running fetchFacilities.js never creates duplicates
router.post('/bulk', async (req, res, next) => {
    const facilities = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const f of facilities) {
            await client.query(
                `INSERT INTO facilities (name, type, osm_id, geom)
         VALUES ($1,$2,$3, ST_SetSRID(ST_GeomFromGeoJSON($4),4326))
         ON CONFLICT (osm_id) DO UPDATE
           SET name = EXCLUDED.name,
               type = EXCLUDED.type,
               geom = EXCLUDED.geom`,
                [f.name, f.type, f.osm_id, JSON.stringify(f.geojsonPolygon)]
            );
        }
        await client.query('COMMIT');
        res.status(201).json({ upserted: facilities.length });
    } catch (e) {
        await client.query('ROLLBACK');
        next(e);
    } finally {
        client.release();
    }
});

export default router;