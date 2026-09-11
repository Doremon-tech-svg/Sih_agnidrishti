/**
 * backend/src/services/mlService.js
 *
 * All communication with the FastAPI ML service.
 * Replaces the old mlBridge.js subprocess approach with proper HTTP calls.
 *
 * FastAPI endpoints used:
 *   GET  /health
 *   POST /predict           — full single hotspot pipeline
 *   POST /predict/batch     — batch hotspots
 *   POST /agent2/analyze    — gas detector only
 *   POST /pipeline/full     — ML + agent2 + risk in one shot  ← primary
 */

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const TIMEOUT_MS = parseInt(process.env.ML_TIMEOUT_MS || '15000');

/**
 * Generic fetch wrapper for FastAPI with timeout + error handling.
 */
async function fastapiPost(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(`${FASTAPI_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => `HTTP ${res.status}`);
            throw new Error(`FastAPI ${path} → ${res.status}: ${text.slice(0, 300)}`);
        }

        return await res.json();
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`FastAPI ${path} timed out after ${TIMEOUT_MS}ms`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Check FastAPI health.
 */
export async function checkFastapiHealth() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`${FASTAPI_URL}/health`, { signal: controller.signal });
        if (!res.ok) return { ok: false };
        return await res.json();
    } catch {
        return { ok: false };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Build a HotspotRecord payload from a hotspot DB row.
 * Maps DB columns to the FastAPI HotspotRecord schema.
 */
export function buildHotspotPayload(hotspot) {
    const acq = hotspot.acq_date ? new Date(hotspot.acq_date) : new Date();
    const raw = hotspot.raw || {};

    // Parse OSM context from raw or linked facility
    const osmIndustrial = hotspot.facility_id
        ? { count: 1, nearest_distance_m: 200 }
        : { count: 0, nearest_distance_m: 5000 };

    return {
        event_id: `HS-${hotspot.id}`,
        latitude: parseFloat(hotspot.lat),
        longitude: parseFloat(hotspot.lon),
        acquisition_date: acq.toISOString().slice(0, 10),
        acquisition_time: acq.toTimeString().slice(0, 5).replace(':', ''),
        daynight: raw.daynight || 'D',
        frp: parseFloat(hotspot.frp || 0),
        bright_ti4: hotspot.brightness_ti4 ? parseFloat(hotspot.brightness_ti4) : null,
        confidence: hotspot.confidence || 'nominal',
        scan: parseFloat(raw.scan || 1.0),
        track: parseFloat(raw.track || 1.0),
        osm: {
            industrial_areas: osmIndustrial,
        },
    };
}

/**
 * Run the full ML + Agent2 + risk pipeline for a single hotspot payload.
 * Returns the combined result from /pipeline/full.
 */
export async function classifyHotspot(hotspotPayload) {
    return fastapiPost('/pipeline/full', hotspotPayload);
}

/**
 * Run just the ML predict for a single hotspot payload.
 * Returns classification + risk + incident status.
 */
export async function predictHotspot(hotspotPayload) {
    return fastapiPost('/predict', hotspotPayload);
}

/**
 * Run batch classification for multiple hotspot payloads.
 */
export async function classifyBatch(payloads) {
    if (!payloads.length) return [];
    return fastapiPost('/predict/batch', payloads);
}

/**
 * Run Agent2 gas detector verification separately.
 */
export async function runAgent2(hotspot, mlClassification) {
    return fastapiPost('/agent2/analyze', {
        hotspot,
        ml_classification: mlClassification,
    });
}

/**
 * Classify a hotspot DB row and return the ML result.
 * Convenience wrapper: builds payload, calls /pipeline/full.
 */
export async function classifyHotspotRow(hotspotRow) {
    const payload = buildHotspotPayload(hotspotRow);
    return classifyHotspot(payload);
}
