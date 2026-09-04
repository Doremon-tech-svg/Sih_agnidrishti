import { pool } from './db.js';
import 'dotenv/config';
import twilio from 'twilio';

const tierFromPriority = { LOW: 1, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

export async function dispatchAlert(incidentId, priority) {
    const tier = tierFromPriority[priority] ?? 1;
    const message = `Incident ${incidentId}: priority ${priority}, tier ${tier} alert triggered.`;

    await pool.query(
        `INSERT INTO alerts (incident_id, tier, message) VALUES ($1,$2,$3)`,
        [incidentId, tier, message]
    );

    if (tier >= 3 && process.env.TWILIO_SID) {
        const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
        await client.messages.create({
            body: message,
            from: process.env.TWILIO_FROM,
            to: process.env.TWILIO_TO,
        });
    }
}