import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const bbox = '21.0,68.5,23.5,73.5'; // Gujarat
const query = `[out:json][timeout:90];(way["landuse"="industrial"](${bbox}););out geom;`;

async function run() {
    try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`
        });
        const text = await res.text();
        const data = JSON.parse(text);
        
        let inserted = 0;
        for (const el of data.elements) {
            if (el.type !== 'way' || !el.geometry || el.geometry.length < 3) continue;
            const coords = el.geometry.map(pt => [pt.lon, pt.lat]);
            if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) {
                coords.push(coords[0]);
            }
            const geom = { type: 'Polygon', coordinates: [coords] };
            
            try {
                await pool.query(`
                    INSERT INTO facilities (name, type, osm_id, geom)
                    VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
                    ON CONFLICT (osm_id) DO NOTHING
                `, [el.tags?.name || 'Unnamed Industrial', 'industrial', `way/${el.id}`, JSON.stringify(geom)]);
                inserted++;
            } catch (e) {}
        }
        console.log(`Inserted ${inserted} facilities for Gujarat`);
    } catch(e) { console.error(e.message); }
    process.exit();
}
run();
