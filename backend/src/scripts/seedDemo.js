import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
    try {
        console.log('🔥 Initializing AgniDrishti Demo Data Seeder...');

        await pool.query('BEGIN');

        console.log('🧹 Clearing existing demo data...');
        await pool.query('DELETE FROM alerts');
        await pool.query('DELETE FROM incidents');
        await pool.query('DELETE FROM hotspots');
        await pool.query('DELETE FROM facilities');

        console.log('🏭 Injecting Industrial & Environmental Facilities (GeoJSON)...');
        
        const gujaratPoly = {
            "type": "Polygon",
            "coordinates": [[[71.0, 22.0], [73.5, 22.0], [73.5, 23.5], [71.0, 23.5], [71.0, 22.0]]]
        };
        const resGj = await pool.query(`
            INSERT INTO facilities (name, type, osm_id, geom, district, state) 
            VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4), $5, $6) RETURNING id
        `, ['Gujarat Industrial Corridor', 'industrial', 'demo_gj_1', JSON.stringify(gujaratPoly), 'Ahmedabad', 'Gujarat']);
        const facGj = resGj.rows[0].id;

        const odishaPoly = {
            "type": "Polygon",
            "coordinates": [[[85.0, 20.0], [87.0, 20.0], [87.0, 22.0], [85.0, 22.0], [85.0, 20.0]]]
        };
        const resOd = await pool.query(`
            INSERT INTO facilities (name, type, osm_id, geom, district, state) 
            VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4), $5, $6) RETURNING id
        `, ['Simlipal Biosphere Reserve', 'forest', 'demo_od_1', JSON.stringify(odishaPoly), 'Mayurbhanj', 'Odisha']);
        const facOd = resOd.rows[0].id;

        console.log('📍 Injecting 50+ diverse Hotspots...');
        let hsId = 1000;
        const insertHotspot = async (lat, lon, cls, frp, conf, facId, district, state, exp) => {
            hsId++;
            const res = await pool.query(`
                INSERT INTO hotspots (id, source_event_id, lat, lon, geom, satellite, frp, confidence, classification, class_confidence, risk_score, facility_id, explanation, district, state, created_at, acq_date)
                VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($4, $3), 4326), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
                RETURNING id
            `, [hsId, 'demo_' + hsId, lat, lon, 'VIIRS', frp, 'h', cls, conf, Math.round(frp / 2), facId, exp, district, state]);
            return res.rows[0].id;
        };

        const hotspots = [];
        
        for(let i=0; i<15; i++) {
            const lat = 22.0 + Math.random() * 1.5;
            const lon = 71.0 + Math.random() * 2.5;
            const isFlare = Math.random() > 0.3;
            hotspots.push(await insertHotspot(
                lat, lon, 
                isFlare ? 'Gas Flare' : 'Industrial Fire / Accident',
                isFlare ? 40 + Math.random()*20 : 150 + Math.random()*100,
                0.95, facGj, 'Ahmedabad', 'Gujarat',
                isFlare ? 'Routine industrial flaring detected.' : 'Anomalous thermal signature consistent with industrial accident.'
            ));
        }

        for(let i=0; i<10; i++) {
            const lat = 20.0 + Math.random() * 2.0;
            const lon = 85.0 + Math.random() * 2.0;
            hotspots.push(await insertHotspot(
                lat, lon, 'Wildfire / Forest Fire',
                80 + Math.random()*200, 0.88, facOd, 'Mayurbhanj', 'Odisha',
                'Large spread thermal signature in forested area.'
            ));
        }

        for(let i=0; i<20; i++) {
            const lat = 29.5 + Math.random() * 2.0;
            const lon = 74.5 + Math.random() * 2.5;
            hotspots.push(await insertHotspot(
                lat, lon, 'Agricultural Burning',
                25 + Math.random()*30, 0.99, null, 'Ludhiana', 'Punjab',
                'Seasonal crop residue burning detected.'
            ));
        }

        console.log('🚨 Generating Incidents & Alerts...');
        
        let incId = 5000;
        for (const hid of hotspots) {
            const hs = await pool.query('SELECT * FROM hotspots WHERE id = $1', [hid]);
            const h = hs.rows[0];
            
            if (h.frp > 100 || h.classification === 'Industrial Fire / Accident') {
                incId++;
                const threatPriority = h.frp > 200 ? 'CRITICAL' : 'HIGH';
                
                await pool.query(`
                    INSERT INTO incidents (id, hotspot_id, threat_priority, status, agent1, agent3, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                `, [
                    incId, hid, threatPriority, 'VALIDATED',
                    JSON.stringify({ classification: h.classification, confidence: h.class_confidence }),
                    JSON.stringify({ reason: h.explanation, severity_tier: threatPriority, threat_short_name: h.classification })
                ]);

                await pool.query(`
                    INSERT INTO alerts (hotspot_id, priority, status, ml_result, district, created_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                `, [hid, threatPriority, 'NEW', JSON.stringify({ classification: h.classification }), h.district]);
            }
        }

        await pool.query('COMMIT');
        console.log('✅ Demo data successfully seeded! Restart the frontend/backend if needed.');
        process.exit(0);
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    }
}

seed();
