/**
 * backend/src/services/notifyService.js
 *
 * Multi-channel notification service using FREE providers only:
 *   - Email:  Brevo (Sendinblue) — 300 emails/day free, no credit card
 *   - SMS:    Textbelt free tier (1 SMS/day demo key) or console mock
 *   - Push:   Web Push API (VAPID) — browser push, completely free
 *   - Socket: Socket.IO real-time in-app notifications
 *
 * Falls back to console.log if credentials are not set (safe for dev).
 */

import { pool } from '../db.js';

// ── Email via Brevo (free 300/day) ────────────────────────────────────────

async function sendEmailBrevo(to, subject, htmlContent) {
    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
        console.log(`[EMAIL MOCK] To: ${to}\nSubject: ${subject}\n${htmlContent.replace(/<[^>]+>/g, '')}`);
        return { ok: true, info: 'mock' };
    }

    try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                sender: {
                    name: process.env.BREVO_FROM_NAME || 'AgniDrishti Alert System',
                    email: process.env.BREVO_FROM_EMAIL || 'alerts@agnidrishti.gov.in',
                },
                to: [{ email: to }],
                subject,
                htmlContent,
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            console.warn(`[EMAIL] Brevo failed for ${to}: ${text.slice(0, 200)}`);
            return { ok: false, error: text };
        }

        const data = await res.json();
        return { ok: true, info: data };
    } catch (e) {
        console.warn(`[EMAIL] Brevo error: ${e.message}`);
        return { ok: false, error: e.message };
    }
}

// ── SMS via Fast2SMS (Free Tier without Credit Card) ─────────────────────────

async function sendSmsFast2SMS(phone, message) {
    if (!phone) return { ok: false, error: 'No phone number' };

    const apiKey = process.env.FAST2SMS_KEY;

    if (process.env.SMS_MOCK === 'true' || !apiKey) {
        console.log(`[SMS MOCK] To: ${phone}\n${message}`);
        return { ok: true, info: 'mock' };
    }

    try {
        const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
            method: 'POST',
            headers: {
                'authorization': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                route: 'q',
                message: message,
                flash: 0,
                numbers: phone
            })
        });
        const data = await res.json();
        return { ok: data.return, info: data };
    } catch (e) {
        console.warn(`[SMS] Fast2SMS error: ${e.message}`);
        return { ok: false, error: e.message };
    }
}

// ── Web Push (VAPID) ──────────────────────────────────────────────────────

async function sendWebPush(subscription, payload) {
    // web-push package must be installed: npm install web-push
    try {
        const webpush = (await import('web-push')).default;

        const vapidPublic = process.env.VAPID_PUBLIC_KEY;
        const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
        const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@agnidrishti.gov.in';

        if (!vapidPublic || !vapidPrivate) {
            console.log('[PUSH MOCK] VAPID keys not set:', JSON.stringify(payload).slice(0, 100));
            return { ok: true, info: 'mock' };
        }

        webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);

        await webpush.sendNotification(subscription, JSON.stringify(payload));
        return { ok: true };
    } catch (e) {
        console.warn(`[PUSH] Web push error: ${e.message}`);
        return { ok: false, error: e.message };
    }
}

// ── In-app Socket.IO ───────────────────────────────────────────────────────

let _io = null;

export function setSocketIO(io) {
    _io = io;
}

function emitSocketAlert(district, event, data) {
    if (!_io) return;
    // Broadcast to district room + global alert room
    _io.to(`district:${district}`).emit(event, data);
    _io.to('alerts').emit(event, data);
}

// ── Email template ─────────────────────────────────────────────────────────

function buildAlertEmailHtml(hotspot, mlResult, agentResult, priority) {
    const lat = parseFloat(hotspot?.lat || hotspot?.latitude || 0).toFixed(4);
    const lon = parseFloat(hotspot?.lon || hotspot?.longitude || 0).toFixed(4);
    const frp = parseFloat(hotspot?.frp || 0).toFixed(1);
    const classification = mlResult?.classification || mlResult?.threat_name || 'Unknown';
    const riskScore = Math.round(mlResult?.risk_score || 0);
    const agentStatus = agentResult?.agent2_status || 'NO_DATA';
    const confidence = Math.round((mlResult?.confidence || 0) * 100);

    const PRIORITY_COLOR = {
        CRITICAL: '#ef4444',
        HIGH: '#f97316',
        MODERATE: '#f59e0b',
        LOW: '#22c55e',
    };
    const color = PRIORITY_COLOR[priority] || '#6b7280';

    return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; background: #0a0a0f; color: #e2e8f0; margin: 0; padding: 20px; }
  .card { background: #1a1a2e; border: 1px solid #2d2d4a; border-radius: 12px; padding: 24px; max-width: 600px; margin: 0 auto; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .priority { background: ${color}22; color: ${color}; border: 1px solid ${color}44; }
  h2 { color: ${color}; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  td { padding: 8px 12px; border-bottom: 1px solid #2d2d4a; font-size: 14px; }
  td:first-child { color: #94a3b8; width: 140px; }
  .footer { font-size: 11px; color: #64748b; margin-top: 20px; border-top: 1px solid #2d2d4a; padding-top: 12px; }
  a.btn { display: inline-block; padding: 10px 20px; background: ${color}; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px; font-weight: 600; }
</style></head>
<body>
<div class="card">
  <span class="badge priority">${priority} PRIORITY</span>
  <h2>🔥 AgniDrishti Fire Alert</h2>
  <table>
    <tr><td>Classification</td><td><strong>${classification}</strong></td></tr>
    <tr><td>Risk Score</td><td><strong>${riskScore}/100</strong></td></tr>
    <tr><td>ML Confidence</td><td>${confidence}%</td></tr>
    <tr><td>Agent2 Status</td><td>${agentStatus}</td></tr>
    <tr><td>FRP</td><td>${frp} MW</td></tr>
    <tr><td>Coordinates</td><td>${lat}°N, ${lon}°E</td></tr>
    <tr><td>Detected At</td><td>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</td></tr>
  </table>
  ${agentResult?.flags?.length ? `<p style="color:#f59e0b;font-size:13px;">⚠️ Flags: ${agentResult.flags.join(', ')}</p>` : ''}
  <a class="btn" href="${process.env.FRONTEND_URL || 'http://localhost:5173'}">Open AgniDrishti Dashboard</a>
  <div class="footer">
    This is an automated alert from AgniDrishti Industrial Fire Detection System.<br>
    Please verify with local authorities before taking emergency action.
  </div>
</div>
</body></html>`;
}

// ── Main dispatch functions ────────────────────────────────────────────────

/**
 * Send admin confirmation request notification.
 * Admin receives email + push asking them to confirm/reject the alert.
 */
export async function notifyAdminForConfirmation(alertId, admin, hotspot, mlResult) {
    const subject = `[ACTION REQUIRED] AgniDrishti Alert #${alertId} — Awaiting Your Confirmation`;
    const priority = mlResult?.priority || mlResult?.risk_level || 'HIGH';

    const html = `
    ${buildAlertEmailHtml(hotspot, mlResult, null, priority)}
    <div style="background:#1a1a2e;padding:16px;margin-top:16px;border-radius:8px;border:1px solid #2d2d4a;">
      <strong style="color:#fbbf24;">⚡ Admin Action Required</strong>
      <p style="font-size:13px;color:#94a3b8;">Please log in to AgniDrishti and <strong>CONFIRM or REJECT</strong> this alert before notifications are dispatched to facility workers.</p>
      <p style="font-size:12px;color:#64748b;">Alert ID: #${alertId} | Your district: ${admin.district || 'N/A'}</p>
    </div>`;

    await sendEmailBrevo(admin.email, subject, html);

    // Push notification
    await notifyUserPush(admin, {
        title: `🔥 Alert #${alertId} — Confirm Required`,
        body: `${priority} priority fire alert near your district. Login to confirm.`,
        data: { alertId, type: 'admin_confirm', url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/alerts` },
    });
}

/**
 * Dispatch confirmed alert to all target users.
 * Sends email + SMS + push + socket notification.
 * Logs all notifications to the DB.
 */
export async function dispatchAlertToUsers(alertId, users, hotspot, mlResult, agentResult) {
    const priority = mlResult?.priority || mlResult?.risk_level || 'HIGH';
    const lat = parseFloat(hotspot?.lat || hotspot?.latitude || 0).toFixed(4);
    const lon = parseFloat(hotspot?.lon || hotspot?.longitude || 0).toFixed(4);
    const classification = mlResult?.classification || mlResult?.threat_name || 'Unknown';
    const district = hotspot?.district || 'your area';

    const subject = `🔥 Fire Alert — ${priority} Priority near ${district}`;
    const smsText = `AgniDrishti ALERT: ${priority} fire detected near ${lat},${lon}. Classification: ${classification}. Risk: ${Math.round(mlResult?.risk_score || 0)}/100. Check your email or the AgniDrishti dashboard for details.`;

    const emailHtml = buildAlertEmailHtml(hotspot, mlResult, agentResult, priority);

    const pushPayload = {
        title: `🔥 ${priority} Fire Alert`,
        body: `${classification} detected near ${district}. Risk: ${Math.round(mlResult?.risk_score || 0)}/100`,
        data: { alertId, type: 'fire_alert', url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}` },
    };

    const results = [];

    for (const user of users) {
        // Email
        if (user.email) {
            const emailRes = await sendEmailBrevo(user.email, subject, emailHtml);
            await _logNotification(alertId, user.id, 'email', user.email, emailRes);
            results.push({ userId: user.id, channel: 'email', ok: emailRes.ok });
        }

        // SMS
        if (user.phone) {
            const smsRes = await sendSmsFast2SMS(user.phone, smsText);
            await _logNotification(alertId, user.id, 'sms', user.phone, smsRes);
            results.push({ userId: user.id, channel: 'sms', ok: smsRes.ok });
        }

        // Push
        await notifyUserPush(user, pushPayload, alertId);
    }

    // Socket.IO broadcast
    emitSocketAlert(district, 'new_alert', {
        alertId,
        priority,
        classification,
        lat,
        lon,
        riskScore: mlResult?.risk_score,
        district,
    });

    return results;
}

/**
 * Send push notification to a single user.
 * Fetches their subscription from the DB.
 */
export async function notifyUserPush(user, payload, alertId = null) {
    try {
        const { rows } = await pool.query(
            'SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id = $1',
            [user.id]
        );

        for (const sub of rows) {
            const subscription = {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth_key },
            };
            const pushRes = await sendWebPush(subscription, payload);
            if (alertId) {
                await _logNotification(alertId, user.id, 'push', sub.endpoint, pushRes);
            }
        }
    } catch (e) {
        console.warn(`[NOTIFY] Push to user ${user.id} failed: ${e.message}`);
    }
}

async function _logNotification(alertId, userId, channel, toAddr, result) {
    try {
        await pool.query(
            `INSERT INTO notifications (alert_id, user_id, channel, to_addr, status, detail, sent_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())`,
            [
                alertId,
                userId || null,
                channel,
                toAddr,
                result.ok ? 'SENT' : 'FAILED',
                result.ok ? JSON.stringify(result.info || {}) : (result.error || 'error'),
            ]
        );
    } catch (e) {
        console.warn('[NOTIFY] Failed to log notification:', e.message);
    }
}
