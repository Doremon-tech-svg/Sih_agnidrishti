/**
 * backend/src/services/alertService.js
 *
 * Alert lifecycle management:
 *   create  → find district admin → notify for confirmation
 *   confirm → find target users → dispatch notifications
 *   reject  → mark rejected, no dispatch
 *
 * Alert states: PENDING → CONFIRMED → DISPATCHED
 *                       → REJECTED
 */

import { pool } from '../db.js';
import { notifyAdminForConfirmation, dispatchAlertToUsers } from './notifyService.js';

const NEARBY_RADIUS_M = 10000; // 10 km

// ── Priority mapping ───────────────────────────────────────────────────────

export function priorityFromRiskScore(riskScore) {
    if (riskScore >= 76) return 'CRITICAL';
    if (riskScore >= 51) return 'HIGH';
    if (riskScore >= 26) return 'MODERATE';
    return 'LOW';
}

// ── Create alert and notify admin ─────────────────────────────────────────

/**
 * Create a PENDING alert for a hotspot after ML detects it needs dispatch.
 * Finds the admin for that district and sends them a confirmation request.
 *
 * @param {object} hotspot  — DB hotspot row
 * @param {object} mlResult — result from FastAPI /pipeline/full
 * @returns {number} alertId
 */
export async function createAlertAndNotifyAdmin(hotspot, mlResult) {
    const priority = priorityFromRiskScore(mlResult?.risk_score || 0);
    const district = hotspot.district || null;

    // Insert alert record
    const { rows } = await pool.query(
        `INSERT INTO alerts
           (hotspot_id, status, priority, district, payload, ml_result, created_at)
         VALUES ($1, 'PENDING', $2, $3, $4, $5, now())
         RETURNING id`,
        [
            hotspot.id,
            priority,
            district,
            JSON.stringify({ hotspot_id: hotspot.id, lat: hotspot.lat, lon: hotspot.lon }),
            JSON.stringify(mlResult),
        ]
    );

    const alertId = rows[0].id;
    console.log(`[ALERT] Created alert #${alertId} for hotspot ${hotspot.id} — ${priority}`);

    // Find district admin(s)
    const admins = await findDistrictAdmins(district, hotspot.lat, hotspot.lon);

    if (admins.length === 0) {
        console.warn(`[ALERT] No admin found for district "${district}" — alert #${alertId} is PENDING, awaiting manual review`);
    } else {
        for (const admin of admins) {
            await notifyAdminForConfirmation(alertId, admin, hotspot, mlResult);
        }
        console.log(`[ALERT] Notified ${admins.length} admin(s) for alert #${alertId}`);
    }

    return alertId;
}

/**
 * Confirm a PENDING alert and dispatch notifications to all target users.
 * Called when admin approves via POST /api/alerts/:id/confirm
 */
export async function confirmAndDispatchAlert(alertId, adminId) {
    // Load alert
    const { rows: alertRows } = await pool.query(
        'SELECT * FROM alerts WHERE id = $1',
        [alertId]
    );
    if (!alertRows.length) throw new Error(`Alert ${alertId} not found`);
    const alert = alertRows[0];

    if (alert.status !== 'PENDING') {
        throw new Error(`Alert ${alertId} is already ${alert.status}`);
    }

    // Mark confirmed
    await pool.query(
        'UPDATE alerts SET status = $1, admin_id = $2, confirmed_at = now() WHERE id = $3',
        ['CONFIRMED', adminId, alertId]
    );

    // Load hotspot
    const { rows: hotspotRows } = await pool.query(
        'SELECT * FROM hotspots WHERE id = $1',
        [alert.hotspot_id]
    );
    const hotspot = hotspotRows[0] || {};
    const mlResult = alert.ml_result || {};
    const agentResult = alert.agent2_result || {};

    // Find target users
    const targetUsers = await findTargetUsers(hotspot, alert);

    // Dispatch
    await dispatchAlertToUsers(alertId, targetUsers, hotspot, mlResult, agentResult);

    // Mark dispatched
    await pool.query(
        'UPDATE alerts SET status = $1, dispatched_at = now() WHERE id = $2',
        ['DISPATCHED', alertId]
    );

    console.log(`[ALERT] Alert #${alertId} dispatched to ${targetUsers.length} users`);
    return { alertId, dispatched: targetUsers.length, targets: targetUsers.map(u => u.id) };
}

/**
 * Reject a PENDING alert.
 */
export async function rejectAlert(alertId, adminId) {
    const { rows } = await pool.query(
        'SELECT status FROM alerts WHERE id = $1',
        [alertId]
    );
    if (!rows.length) throw new Error(`Alert ${alertId} not found`);
    if (rows[0].status !== 'PENDING') throw new Error(`Alert ${alertId} is not PENDING`);

    await pool.query(
        'UPDATE alerts SET status = $1, admin_id = $2, confirmed_at = now() WHERE id = $3',
        ['REJECTED', adminId, alertId]
    );

    return { alertId, status: 'REJECTED' };
}

// ── User finders ───────────────────────────────────────────────────────────

/**
 * Find ADMIN users for a given district.
 * Falls back to spatial search within 50km if no district match.
 */
async function findDistrictAdmins(district, lat, lon) {
    if (district) {
        const { rows } = await pool.query(
            `SELECT id, email, full_name, district, phone
             FROM users
             WHERE role IN ('ADMIN', 'SUPER_ADMIN')
               AND is_approved = TRUE
               AND district = $1`,
            [district]
        );
        if (rows.length) return rows;
    }

    // Spatial fallback: find admin closest to hotspot within 200km
    if (lat && lon) {
        const { rows } = await pool.query(
            `SELECT id, email, full_name, district, phone
             FROM users
             WHERE role IN ('ADMIN', 'SUPER_ADMIN')
               AND is_approved = TRUE
               AND work_geom IS NOT NULL
             ORDER BY ST_Distance(work_geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography)
             LIMIT 3`,
            [parseFloat(lon), parseFloat(lat)]
        );
        if (rows.length) return rows;
    }

    // Last resort: global super admin
    const { rows } = await pool.query(
        `SELECT id, email, full_name, district, phone
         FROM users WHERE role = 'SUPER_ADMIN' AND is_approved = TRUE LIMIT 1`
    );
    return rows;
}

/**
 * Find all users to notify for a confirmed alert:
 * 1. ANALYSTs registered to the hotspot's facility
 * 2. VIEWERs registered to the hotspot's facility
 * 3. Any user within NEARBY_RADIUS_M of the hotspot
 */
async function findTargetUsers(hotspot, alert) {
    const userMap = new Map();

    const lat = parseFloat(hotspot.lat || hotspot.latitude || 0);
    const lon = parseFloat(hotspot.lon || hotspot.longitude || 0);

    // 1. Users registered to the facility
    if (hotspot.facility_id) {
        const { rows } = await pool.query(
            `SELECT id, email, phone, full_name, role, district
             FROM users
             WHERE facility_id = $1 AND is_approved = TRUE`,
            [hotspot.facility_id]
        );
        rows.forEach(u => userMap.set(u.id, u));
    }

    // 2. Users in the same district (analysts + admins)
    if (alert.district) {
        const { rows } = await pool.query(
            `SELECT id, email, phone, full_name, role, district
             FROM users
             WHERE district = $1
               AND role IN ('ANALYST', 'ADMIN')
               AND is_approved = TRUE`,
            [alert.district]
        );
        rows.forEach(u => userMap.set(u.id, u));
    }

    // 3. Spatial lookup — any user within NEARBY_RADIUS_M
    if (lat && lon) {
        const { rows } = await pool.query(
            `SELECT id, email, phone, full_name, role, district
             FROM users
             WHERE work_geom IS NOT NULL
               AND is_approved = TRUE
               AND ST_DWithin(
                 work_geom::geography,
                 ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,
                 $3
               )`,
            [lon, lat, NEARBY_RADIUS_M]
        );
        rows.forEach(u => userMap.set(u.id, u));
    }

    return Array.from(userMap.values());
}
