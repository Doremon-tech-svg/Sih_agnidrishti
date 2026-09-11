import 'dotenv/config';
import { pool } from '../db.js';
import bcrypt from 'bcryptjs';

const BASE_URL = 'http://localhost:4000/api';

async function run() {
    console.log("🔥 Starting End-to-End AgniDrishti Test...");

    // 1. Create/Update Users
    console.log("\n[1] Registering users to district 'Ahmedabad'...");
    const users = [
        { email: 'divyankrichhariya@gmail.com', phone: '9695166905', role: 'VIEWER' },
        { email: 'divyankrichhariya8618@gmail.com', phone: '9286853321', role: 'ADMIN' }
    ];

    for (const u of users) {
        const hash = await bcrypt.hash('Demo@2026', 10);
        await pool.query(
            `INSERT INTO users (email, password_hash, full_name, role, is_approved, district, phone) 
             VALUES ($1, $2, $3, $4, TRUE, 'Ahmedabad', $5)
             ON CONFLICT (email) DO UPDATE SET district = 'Ahmedabad', phone = $5, role = $4`,
            [u.email, hash, 'Test User', u.role, u.phone]
        );
    }
    console.log("Users configured successfully.");

    // 2. Insert Fake Hotspot
    console.log("\n[2] Injecting a simulated satellite hotspot in Ahmedabad...");
    const { rows: hotspotRows } = await pool.query(`
        INSERT INTO hotspots (satellite, acq_date, lat, lon, frp, confidence, geom, district, state)
        VALUES ('TEST-SAT', CURRENT_DATE, 23.0225, 72.5714, 250.5, 'h', ST_SetSRID(ST_MakePoint(72.5714, 23.0225), 4326), 'Ahmedabad', 'Gujarat')
        RETURNING id
    `);
    const hotspotId = hotspotRows[0].id;
    console.log(`Hotspot inserted (ID: ${hotspotId}). FRP: 250.5 MW`);

    // 3. Trigger Alert Creation Directly
    console.log("\n[3] Generating Critical Alert via AlertService...");
    const { createAlertAndNotifyAdmin } = await import('../services/alertService.js');
    const fakeMLResult = {
        classification: 'Industrial Fire',
        confidence: 0.98,
        risk_score: 95,
        risk_level: 'CRITICAL',
        reasons: ['High FRP detected', 'Near industrial zone'],
        dispatch_required: true,
        priority: 'CRITICAL'
    };
    const alertId = await createAlertAndNotifyAdmin({ ...hotspotRows[0], district: 'Ahmedabad', lat: 23.0225, lon: 72.5714 }, fakeMLResult);

    // 4. Find the Alert
    console.log("\n[4] Verifying generated Alert...");
    const { rows: alertRows } = await pool.query(`
        SELECT a.id, a.status 
        FROM alerts a
        WHERE a.id = $1
    `, [alertId]);
    
    if (alertRows.length === 0) {
        console.error("No alert was generated!");
        process.exit(1);
    }
    const alert = alertRows[0];
    console.log(`Alert #${alert.id} created successfully with status: ${alert.status}`);

    // Generate Fake Incident for Report Endpoint (Because /report still needs incident_id)
    const { rows: incRows } = await pool.query(
        `INSERT INTO incidents (hotspot_id, status, threat_priority) VALUES ($1, 'VALIDATED', 'CRITICAL') RETURNING id`,
        [hotspotId]
    );
    const incidentId = incRows[0].id;

    // 5. Generate AI Report
    console.log("\n[5] Requesting Gemini AI Incident Report...");
    const reportRes = await fetch(`${BASE_URL}/incidents/${incidentId}/report`);
    const reportData = await reportRes.json();
    console.log(`\n🤖 AI Report:\n"${reportData.report}"\n`);

    // 6. Confirm Alert (Triggers Notifications)
    console.log("\n[6] Admin confirming Alert (Dispatching Notifications)...");
    
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'divyankrichhariya8618@gmail.com', password: 'Demo@2026' })
    });
    const { token } = await loginRes.json();

    if (!token) {
        console.error("Login failed for admin test account.");
        process.exit(1);
    }

    const confirmRes = await fetch(`${BASE_URL}/alerts/${alert.id}/confirm`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const confirmData = await confirmRes.json();
    console.log("Confirmation API Response:", confirmData);

    console.log("\n✅ End-to-End Test Complete! Check your emails and SMS (if FAST2SMS_KEY is valid).");
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
