
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
// fallback to backend/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Major industrial zones in India
const REGIONS = [
    { name: 'Gujarat', bbox: '21.0,68.5,24.5,74.5' },
    { name: 'Maharashtra', bbox: '18.0,72.5,21.0,76.5' },
    { name: 'Tamil Nadu & Karnataka', bbox: '10.0,76.0,14.0,80.5' },
    { name: 'Odisha & Jharkhand', bbox: '20.0,83.5,24.5,87.5' },
    { name: 'NCR & Punjab', bbox: '28.0,75.5,31.5,78.5' },
];

function buildQuery(bbox) {
    return `
[out:json][timeout:90];
(
  way["landuse"="industrial"](${bbox});
  way["power"="plant"](${bbox});
  way["man_made"="works"](${bbox});
  way["industrial"="oil"](${bbox});
  way["industrial"="refinery"](${bbox});
  way["industrial"="chemical"](${bbox});
  way["landuse"="quarry"](${bbox});
);
out geom;
`;
}

function wayToPolygon(way) {
    const coords = way.geometry.map(pt => [pt.lon, pt.lat]);
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
    return { type: 'Polygon', coordinates: [coords] };
}

function guessType(tags = {}) {
    if (tags.power === 'plant') return 'power_plant';
    if (tags.industrial === 'oil' || tags.industrial === 'refinery') return 'refinery';
    if (tags.industrial === 'chemical') return 'chemical';
    if (tags.landuse === 'quarry') return 'mine';
    return 'industrial';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log('🌍 Fetching facilities for major Indian industrial zones...');
    
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not set in .env");
    }

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    
    let totalInserted = 0;

    for (const region of REGIONS) {
        console.log(`\n📍 Fetching for ${region.name} (${region.bbox})...`);
        const query = buildQuery(region.bbox);
        
        let success = false;
        let retries = 3;
        let data = null;

        while (retries > 0 && !success) {
            try {
                const res = await fetch(OVERPASS_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'AgniDrishti-SIH2026/1.0',
                    },
                    body: `data=${encodeURIComponent(query)}`,
                });

                if (!res.ok) {
                    if (res.status === 429) {
                        console.log('  ⚠️ Rate limited. Waiting 15s...');
                        await sleep(15000);
                        retries--;
                        continue;
                    }
                    throw new Error(`Overpass failed: ${res.status}`);
                }
                data = await res.json();
                success = true;
            } catch (err) {
                console.error(`  ❌ Error: ${err.message}. Retries left: ${retries - 1}`);
                retries--;
                await sleep(5000);
            }
        }

        if (!data || !data.elements) {
            console.log(`  ⏭️ Skipping ${region.name} due to fetch failure.`);
            continue;
        }

        const facilities = data.elements
            .filter(el => el.type === 'way' && el.geometry?.length >= 3)
            .map(el => ({
                name: el.tags?.name || `Unnamed ${guessType(el.tags)}`,
                type: guessType(el.tags),
                osm_id: `way/${el.id}`,
                geojsonPolygon: wayToPolygon(el),
            }));

        console.log(`  Found ${facilities.length} facilities. Inserting into DB...`);
        
        let insertedRegion = 0;
        for (const fac of facilities) {
            try {
                await pool.query(`
                    INSERT INTO facilities (name, type, osm_id, geom)
                    VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
                    ON CONFLICT (osm_id) DO NOTHING
                `, [fac.name, fac.type, fac.osm_id, JSON.stringify(fac.geojsonPolygon)]);
                insertedRegion++;
                totalInserted++;
            } catch (err) {
                console.error(`DB Error on ${fac.osm_id}:`, err.message);
                // Ignore silent failures on invalid geometry
            }
        }
        console.log(`  ✅ Inserted ${insertedRegion} new facilities for ${region.name}.`);
        
        console.log('  Sleeping 5 seconds to respect Overpass rate limits...');
        await sleep(5000);
    }

    console.log(`\n🎉 Finished fetching facilities. Total newly inserted: ${totalInserted}`);
    await pool.end();
}

main().catch(console.error);