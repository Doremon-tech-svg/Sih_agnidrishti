import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const demoRegions = [
    { name: 'Ahmedabad Metro', minLat: 22.85, maxLat: 23.15, minLon: 72.45, maxLon: 72.75 },
    { name: 'Hazira Industrial Area', minLat: 21.05, maxLat: 21.20, minLon: 72.55, maxLon: 72.70 },
    { name: 'Jamnagar Refineries', minLat: 22.30, maxLat: 22.45, minLon: 69.80, maxLon: 70.00 },
    { name: 'Dahej PCPIR', minLat: 21.65, maxLat: 21.80, minLon: 72.50, maxLon: 72.65 },
    { name: 'Mundra Port & SEZ', minLat: 22.70, maxLat: 22.85, minLon: 69.60, maxLon: 69.80 },
    // A broader India region for general map populate
    { name: 'India Wide', minLat: 10.0, maxLat: 28.0, minLon: 70.0, maxLon: 88.0 }
];

async function seed() {
    console.log('Seeding emergency data...');
    await pool.query('DELETE FROM alerts');
    await pool.query('DELETE FROM incidents');
    await pool.query('DELETE FROM hotspots');
    
    let count = 0;
    
    // Seed ~200 hotspots total
    for (const region of demoRegions) {
        // More in specific regions, less randomly scattered
        const limit = region.name === 'India Wide' ? 80 : 25;
        
        for (let i = 0; i < limit; i++) {
            const lat = region.minLat + Math.random() * (region.maxLat - region.minLat);
            const lon = region.minLon + Math.random() * (region.maxLon - region.minLon);
            const frp = Math.random() * 100 + 10;
            const conf = Math.random() > 0.5 ? 'h' : 'n';
            const sat = Math.random() > 0.5 ? 'N20' : 'Aqua';
            const day = Math.random() > 0.5 ? 'D' : 'N';
            const instrument = 'VIIRS';
            const acq_date = new Date().toISOString();
            
            try {
                await pool.query(`
                    INSERT INTO hotspots (
                        lat, lon, geom, brightness_ti4, frp, confidence, 
                        satellite, acq_date, classification, class_confidence, risk_score
                    ) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($2,$1),4326), $3, $4, $5, $6, $7, $8, $9, $10)
                `, [
                    lat, lon, 300 + Math.random() * 50, frp, conf,
                    sat, acq_date,
                    'Industrial Fire / Accident', 0.85, Math.floor(Math.random() * 100)
                ]);
                count++;
            } catch (e) {
                console.error(e.message);
            }
        }
    }
    
    console.log(`Seeded ${count} hotspots.`);
    process.exit(0);
}

seed();
