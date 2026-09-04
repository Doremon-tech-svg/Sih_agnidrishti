import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM alerts ORDER BY sent_at DESC LIMIT 500`);
        res.json(rows);
    } catch (err) { next(err); }
});

export default router;