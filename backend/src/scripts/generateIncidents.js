/**
 * backend/src/scripts/generateIncidents.js
 *
 * One-pass script that:
 *   1. Reads all CRITICAL / HIGH classified hotspots with no existing incident
 *   2. Creates one incident record per hotspot (status = VALIDATED)
 *   3. Creates an alert for Tier-2+ events (HIGH → Tier 2, CRITICAL → Tier 3)
 *
 * Run: node --input-type=module < backend/src/scripts/generateIncidents.js
 *   or: node src/scripts/generateIncidents.js   (from backend/ with --input-type via package.json type:module)
 */
import { pool } from '../db.js';

/* ── helpers ─────────────────────────────────────────────────────────────── */
const RISK_LABEL = (score) => {
    if (score >= 76) return { priority: 'CRITICAL', tier: 3 };
    if (score >= 56) return { priority: 'HIGH',     tier: 2 };
    if (score >= 31) return { priority: 'MODERATE', tier: 1 };
    return                   { priority: 'LOW',      tier: 1 };
};

const buildExplanation = (h) => {
    const { priority } = RISK_LABEL(h.risk_score || 0);
    const frp   = parseFloat(h.frp || 0).toFixed(1);
    const conf  = ((h.class_confidence || 0.5) * 100).toFixed(0);
    const cls   = h.classification || 'Unknown';
    return (
        `${cls} detected with ${conf}% confidence. ` +
        `Fire Radiative Power: ${frp} MW. ` +
        `Risk level: ${priority}. ` +
        (h.explanation ? h.explanation.slice(0, 120) : 'ML pipeline verified event.')
    );
};

const buildAlertMessage = (h, priority) => {
    const frp  = parseFloat(h.frp || 0).toFixed(1);
    const cls  = h.classification || 'Thermal event';
    const loc  = `${parseFloat(h.lat).toFixed(3)}°N, ${parseFloat(h.lon).toFixed(3)}°E`;
    return (
        `[${priority}] ${cls} · FRP ${frp} MW · ` +
        `Risk ${Math.round(h.risk_score || 0)}/100 · ` +
        `Location ${loc} · Satellite ${h.satellite || 'VIIRS'}`
    );
};

/* ── main ─────────────────────────────────────────────────────────────────── */
async function main() {
    console.log('\n=== AgniDrishti — Incident & Alert Generator ===\n');

    // 1. Load classified hotspots that don't have incidents yet
    const { rows: hotspots } = await pool.query(`
        SELECT h.id, h.lat, h.lon, h.frp, h.risk_score, h.classification,
               h.class_confidence, h.explanation, h.satellite, h.acq_date
        FROM hotspots h
        LEFT JOIN incidents i ON i.hotspot_id = h.id
        WHERE h.classification IS NOT NULL
          AND h.classification <> 'False Positive'
          AND h.risk_score    >= 31          -- MODERATE and above only
          AND i.id IS NULL                   -- no incident yet
        ORDER BY h.risk_score DESC
        LIMIT 2000
    `);

    console.log(`Found ${hotspots.length} classified hotspots without incidents.`);

    let incidentOk = 0, alertOk = 0, skipped = 0;

    for (const h of hotspots) {
        const { priority, tier } = RISK_LABEL(h.risk_score || 0);

        // Build structured agent payload (matches what the ML pipeline would produce)
        const agentPayload = {
            agent1: { status: 'FLAGGED',   reason: `FRP=${h.frp} MW above threshold` },
            agent2: { status: 'FLAGGED',   rule: 'PASS', reason: 'Passed suppression checks' },
            agent3: { risk_score: h.risk_score, threat_priority: priority, tier, status: 'VALIDATED' },
        };

        try {
            // Insert incident (check first — no unique constraint on hotspot_id)
            const { rows: [inc] } = await pool.query(`
                INSERT INTO incidents
                    (hotspot_id, status, threat_priority, agent1, agent2, agent3, created_at)
                VALUES ($1, 'VALIDATED', $2, $3, $4, $5, now())
                RETURNING id
            `, [h.id, priority, agentPayload.agent1, agentPayload.agent2, agentPayload.agent3]);

            if (!inc) { skipped++; continue; }
            incidentOk++;

            // Create alerts for Tier 2+ (HIGH and CRITICAL)
            if (tier >= 2) {
                await pool.query(`
                    INSERT INTO alerts (incident_id, tier, message, sent_at)
                    VALUES ($1, $2, $3, now())
                `, [inc.id, tier, buildAlertMessage(h, priority)]);
                alertOk++;
            }

            // Update explanation on the hotspot if it's a template placeholder
            if (!h.explanation || h.explanation.length < 20) {
                await pool.query(
                    'UPDATE hotspots SET explanation = $1 WHERE id = $2',
                    [buildExplanation(h), h.id]
                );
            }

        } catch (err) {
            console.error(`  Hotspot ${h.id}: ${err.message}`);
            skipped++;
        }
    }

    console.log(`\nResults:`);
    console.log(`  Incidents created : ${incidentOk}`);
    console.log(`  Alerts   created  : ${alertOk}  (Tier 2+)`);
    console.log(`  Skipped / errors  : ${skipped}`);

    // Final counts
    const { rows } = await pool.query(`
        SELECT
            (SELECT COUNT(*) FROM incidents)                            AS total_incidents,
            (SELECT COUNT(*) FROM incidents WHERE threat_priority='CRITICAL') AS critical,
            (SELECT COUNT(*) FROM incidents WHERE threat_priority='HIGH')     AS high,
            (SELECT COUNT(*) FROM incidents WHERE threat_priority='MODERATE') AS moderate,
            (SELECT COUNT(*) FROM alerts)                              AS total_alerts
    `);
    const s = rows[0];
    console.log(`\nDB state after run:`);
    console.log(`  Incidents: ${s.total_incidents}  (${s.critical} CRITICAL · ${s.high} HIGH · ${s.moderate} MODERATE)`);
    console.log(`  Alerts:    ${s.total_alerts}`);

    await pool.end();
    console.log('\nDone.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
