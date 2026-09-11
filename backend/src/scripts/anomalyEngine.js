/**
 * backend/src/scripts/anomalyEngine.js
 *
 * Rebuilds "constant spot monitoring" (was the dead `python -m ml.anomaly` step).
 * A "spot" = facility_id if linked, else a rounded 0.05° lat/lon grid cell
 * (same binning as the hotspots.js heatmap queries).
 *
 * For each new/unscored hotspot, computes frp_zscore against the trailing
 * window (default 90 days, excluding itself) of FRP readings at that spot,
 * and flags is_anomaly when |z| exceeds ANOMALY_THRESHOLD.
 *
 * Writes to hotspots.frp_zscore / anomaly_score / is_anomaly
 * (columns already exist — migrations/003_anomaly_cols.sql).
 *
 * Run: node --input-type=module < backend/src/scripts/anomalyEngine.js
 */
import { pool } from '../db.js';

const WINDOW_DAYS = parseInt(process.env.ANOMALY_WINDOW_DAYS || '90');
const GRID_DEG = parseFloat(process.env.ANOMALY_GRID_DEG || '0.05');
const THRESHOLD = parseFloat(process.env.ANOMALY_ZSCORE_THRESHOLD || '2.5');

async function main() {
    console.log(`Anomaly engine — window=${WINDOW_DAYS}d, grid=${GRID_DEG}°, threshold=|z|>${THRESHOLD}`);

    // Only score hotspots that haven't been scored yet (frp_zscore default 0.0 / untouched).
    // We treat "unscored" as classification IS NULL (i.e. still fresh from ingest),
    // since anomalyEngine runs before ml.js classify-all in the pipeline.
    const { rows: targets } = await pool.query(`
        SELECT id, lat, lon, frp, facility_id, acq_date
        FROM hotspots
        WHERE classification IS NULL
        ORDER BY acq_date DESC
        LIMIT 5000
    `);

    console.log(`  Scoring ${targets.length} hotspots…`);

    let flagged = 0, scored = 0;

    for (const h of targets) {
        const spotWhere = h.facility_id
            ? `facility_id = $1`
            : `facility_id IS NULL
                 AND floor(lat::numeric/${GRID_DEG})*${GRID_DEG} = floor($1::numeric/${GRID_DEG})*${GRID_DEG}
                 AND floor(lon::numeric/${GRID_DEG})*${GRID_DEG} = floor($2::numeric/${GRID_DEG})*${GRID_DEG}`;
        const spotParams = h.facility_id ? [h.facility_id] : [h.lat, h.lon];

        const { rows: statRows } = await pool.query(
            `SELECT AVG(frp) AS mean_frp, STDDEV(frp) AS std_frp, COUNT(*) AS n
             FROM hotspots
             WHERE ${spotWhere}
               AND id <> $${spotParams.length + 1}
               AND acq_date >= now() - ($${spotParams.length + 2} || ' days')::interval`,
            [...spotParams, h.id, WINDOW_DAYS]
        );

        const { mean_frp, std_frp, n } = statRows[0];
        const frp = parseFloat(h.frp || 0);

        let zscore = 0;
        let anomalyScore = 0;
        let isAnomaly = false;

        // Need a meaningful trailing history before z-score is trustworthy.
        if (parseInt(n) >= 5 && parseFloat(std_frp) > 0) {
            zscore = (frp - parseFloat(mean_frp)) / parseFloat(std_frp);
            anomalyScore = Math.min(1, Math.abs(zscore) / (THRESHOLD * 2));
            isAnomaly = Math.abs(zscore) > THRESHOLD;
        }

        await pool.query(
            `UPDATE hotspots SET frp_zscore = $1, anomaly_score = $2, is_anomaly = $3 WHERE id = $4`,
            [zscore, anomalyScore, isAnomaly, h.id]
        );

        scored++;
        if (isAnomaly) flagged++;
    }

    console.log(`  Scored: ${scored}  |  Flagged anomalies: ${flagged}`);
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });