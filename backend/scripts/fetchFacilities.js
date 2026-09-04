const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const API_BASE = 'http://localhost:4000/api';

// Gujarat refinery belt bbox (south,west,north,east) — swap for your region
const BBOX = '21.0,68.5,23.5,73.5';

const QUERY = `
[out:json][timeout:60];
(
  way["landuse"="industrial"](${BBOX});
  way["power"="plant"](${BBOX});
  way["man_made"="works"](${BBOX});
  way["industrial"="oil"](${BBOX});
  way["industrial"="refinery"](${BBOX});
  way["industrial"="chemical"](${BBOX});
  way["landuse"="quarry"](${BBOX});
);
out geom;
`;

function wayToPolygon(way) {
    const coords = way.geometry.map(pt => [pt.lon, pt.lat]);
    // close ring if not closed
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

async function main() {
    console.log('Querying Overpass...');
    const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'AgniDrishti-SIH2026/1.0',
        },
        body: `data=${encodeURIComponent(QUERY)}`,
    });

    if (!res.ok) throw new Error(`Overpass failed: ${res.status}`);
    const data = await res.json();

    const facilities = data.elements
        .filter(el => el.type === 'way' && el.geometry?.length >= 3)
        .map(el => ({
            name: el.tags?.name || `Unnamed ${guessType(el.tags)}`,
            type: guessType(el.tags),
            osm_id: `way/${el.id}`,
            geojsonPolygon: wayToPolygon(el),
        }));

    console.log(`Fetched ${facilities.length} facilities. Posting to backend...`);

    const post = await fetch(`${API_BASE}/facilities/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(facilities),
    });

    console.log(await post.json());
}

main().catch(console.error);