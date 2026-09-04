/**
 * Scene3D.jsx — Thermal Heatmap View (Leaflet-based, works on all devices)
 *
 * Replaces the broken MapLibre GL 3D view. Renders:
 *   - Dark satellite tile base
 *   - Risk-coloured circle markers sized by FRP magnitude
 *   - Facility boundary outlines (GeoJSON)
 *   - Detection density summary panel
 *   - No WebGL required — runs on any hardware
 */
import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Popup, useMap } from 'react-leaflet';

const RISK_COLOR = (score) => {
    if (score >= 76) return '#ef4444';
    if (score >= 56) return '#f97316';
    if (score >= 31) return '#f59e0b';
    return '#22c55e';
};

const RISK_LABEL = (score) => {
    if (score >= 76) return 'CRITICAL';
    if (score >= 56) return 'HIGH';
    if (score >= 31) return 'MODERATE';
    return 'LOW';
};

const CLASS_COLOR = {
    'Gas Flare':                  '#f59e0b',
    'Industrial Thermal Source':  '#3b82f6',
    'Industrial Fire / Accident': '#ef4444',
    'Agricultural Burning':       '#84cc16',
    'Wildfire / Forest Fire':     '#f97316',
    'Mining Thermal Activity':    '#a855f7',
    'False Positive':             '#6b7280',
};

// Auto-fit map to hotspot bounds
function FitBounds({ hotspots }) {
    const map = useMap();
    useEffect(() => {
        if (!hotspots.length) return;
        const lats = hotspots.map(h => h.lat);
        const lons = hotspots.map(h => h.lon);
        map.fitBounds([
            [Math.min(...lats) - 0.1, Math.min(...lons) - 0.1],
            [Math.max(...lats) + 0.1, Math.max(...lons) + 0.1],
        ], { padding: [30, 30] });
    }, [hotspots, map]);
    return null;
}

function SummaryPanel({ hotspots }) {
    const priorityCounts = { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 };
    let maxFrp = 0, totalFrp = 0;

    for (const h of hotspots) {
        const label = RISK_LABEL(h.risk_score || 0);
        priorityCounts[label]++;
        const frp = h.frp || 0;
        totalFrp += frp;
        if (frp > maxFrp) maxFrp = frp;
    }

    const classCounts = {};
    for (const h of hotspots) {
        const c = h.classification || 'Unclassified';
        classCounts[c] = (classCounts[c] || 0) + 1;
    }
    const topClasses = Object.entries(classCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    return (
        <div style={{
            position: 'absolute', top: 16, right: 16, zIndex: 1000,
            background: 'rgba(8,15,30,0.96)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14, padding: '14px 16px', minWidth: 220,
            backdropFilter: 'blur(20px)', color: '#f0f6ff',
            fontFamily: "'Inter', sans-serif",
        }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: 1.2, color: 'rgba(138,172,204,0.6)', marginBottom: 12 }}>
                🔥 Detection Summary
            </div>

            {/* Priority counts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                {[
                    { label: 'CRITICAL', color: '#ef4444', val: priorityCounts.CRITICAL },
                    { label: 'HIGH',     color: '#f97316', val: priorityCounts.HIGH },
                    { label: 'MODERATE', color: '#f59e0b', val: priorityCounts.MODERATE },
                    { label: 'LOW',      color: '#22c55e', val: priorityCounts.LOW },
                ].map(({ label, color, val }) => (
                    <div key={label} style={{
                        background: `${color}18`, border: `1px solid ${color}40`,
                        borderRadius: 8, padding: '6px 10px', textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color }}>{val}</div>
                        <div style={{ fontSize: 9, color: `${color}cc`, fontWeight: 600,
                            textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* FRP stats */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10, marginBottom: 10 }}>
                <StatRow label="Total hotspots" value={hotspots.length.toLocaleString()} />
                <StatRow label="Max FRP" value={`${maxFrp.toFixed(1)} MW`} color="#ef4444" />
                <StatRow label="Avg FRP" value={hotspots.length ? `${(totalFrp / hotspots.length).toFixed(1)} MW` : '—'} />
            </div>

            {/* Top classes */}
            <div style={{ fontSize: 10, color: 'rgba(138,172,204,0.5)', marginBottom: 6,
                textTransform: 'uppercase', letterSpacing: 0.8 }}>Top Classifications</div>
            {topClasses.map(([cls, cnt]) => (
                <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: CLASS_COLOR[cls] || '#9ca3af', flexShrink: 0,
                        boxShadow: `0 0 5px ${CLASS_COLOR[cls] || '#9ca3af'}`,
                    }} />
                    <span style={{ fontSize: 11, color: '#8aaccc', flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cls}</span>
                    <span style={{ fontSize: 11, fontWeight: 700,
                        color: CLASS_COLOR[cls] || '#9ca3af' }}>{cnt}</span>
                </div>
            ))}
        </div>
    );
}

function StatRow({ label, value, color }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ fontSize: 11, color: 'rgba(138,172,204,0.6)' }}>{label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: color || '#f0f6ff' }}>{value}</span>
        </div>
    );
}

export default function Scene3D({ hotspots, facilities, onClose }) {
    const center = hotspots.length
        ? [hotspots[0].lat, hotspots[0].lon]
        : [22.3, 71.5];

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2500 }}>
            {/* Header bar */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 48,
                background: 'rgba(8,15,30,0.97)', borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 20px', zIndex: 2600, backdropFilter: 'blur(20px)',
                fontFamily: "'Inter', sans-serif",
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14 }}>🌡️</span>
                    <span style={{ fontWeight: 700, color: '#f0f6ff', fontSize: 14 }}>
                        Thermal Heatmap View
                    </span>
                    <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 20,
                        background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
                        color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8,
                    }}>
                        {hotspots.length.toLocaleString()} detections
                    </span>
                </div>
                <button onClick={onClose} style={{
                    padding: '6px 16px', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#f0f6ff', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                }}>
                    ✕ Close
                </button>
            </div>

            {/* Map */}
            <div style={{ position: 'absolute', inset: 0, top: 48 }}>
                <MapContainer
                    center={center}
                    zoom={8}
                    style={{ height: '100%', width: '100%', background: '#0f172a' }}
                    zoomControl={true}
                >
                    {/* Esri Dark Gray Canvas — free, no API key required */}
                    <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                        attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
                        maxZoom={16}
                    />
                    {/* Reference layer — adds city/road/border labels */}
                    <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
                        maxZoom={16}
                        pane="shadowPane"
                    />

                    {/* Auto-fit to detections */}
                    <FitBounds hotspots={hotspots} />

                    {/* Facility boundaries */}
                    {facilities.map(f => {
                        try {
                            return (
                                <GeoJSON
                                    key={f.id}
                                    data={JSON.parse(f.geometry)}
                                    style={{
                                        color: '#f97316', weight: 2,
                                        fillOpacity: 0.08, fillColor: '#f97316',
                                        dashArray: '4 4',
                                    }}
                                />
                            );
                        } catch { return null; }
                    })}

                    {/* Hotspot markers — sized by FRP, coloured by risk */}
                    {hotspots.map(h => {
                        const risk  = h.risk_score || 0;
                        const color = RISK_COLOR(risk);
                        const frp   = h.frp || 0;
                        // Radius: log scale of FRP, clamped 5–22px
                        const r = Math.max(5, Math.min(22, 5 + Math.log1p(frp) * 3));
                        const cls = h.classification || 'Unclassified';

                        return (
                            <CircleMarker
                                key={h.id}
                                center={[h.lat, h.lon]}
                                radius={r}
                                pathOptions={{
                                    color,
                                    fillColor: color,
                                    fillOpacity: risk >= 56 ? 0.85 : 0.55,
                                    weight: risk >= 76 ? 2.5 : 1.5,
                                }}
                            >
                                <Popup maxWidth={240}>
                                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12 }}>
                                        <div style={{
                                            fontWeight: 700, fontSize: 13,
                                            color: CLASS_COLOR[cls] || '#555',
                                            marginBottom: 6, paddingBottom: 6,
                                            borderBottom: '1px solid #e2e8f0',
                                        }}>{cls}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '3px 6px' }}>
                                            <span style={{ color: '#64748b' }}>FRP</span>
                                            <span style={{ fontWeight: 700, color: '#ef4444' }}>{frp.toFixed(1)} MW</span>
                                            <span style={{ color: '#64748b' }}>Risk Score</span>
                                            <span style={{ fontWeight: 700, color }}>{risk}/100 — {RISK_LABEL(risk)}</span>
                                            <span style={{ color: '#64748b' }}>Satellite</span>
                                            <span>{h.satellite || 'VIIRS'}</span>
                                            <span style={{ color: '#64748b' }}>Detected</span>
                                            <span>{h.acq_date ? new Date(h.acq_date).toLocaleDateString() : '—'}</span>
                                        </div>
                                        {h.explanation && (
                                            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e2e8f0',
                                                fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                                                {h.explanation}
                                            </div>
                                        )}
                                    </div>
                                </Popup>
                            </CircleMarker>
                        );
                    })}
                </MapContainer>
            </div>

            {/* Summary panel */}
            <SummaryPanel hotspots={hotspots} />

            {/* Legend */}
            <div style={{
                position: 'absolute', bottom: 24, left: 16, zIndex: 2600,
                background: 'rgba(8,15,30,0.96)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, padding: '10px 14px',
                backdropFilter: 'blur(20px)', fontFamily: "'Inter', sans-serif",
            }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(138,172,204,0.6)',
                    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Risk Level</div>
                {[
                    { label: 'Critical (76–100)', color: '#ef4444' },
                    { label: 'High (56–75)',      color: '#f97316' },
                    { label: 'Moderate (31–55)',  color: '#f59e0b' },
                    { label: 'Low (0–30)',         color: '#22c55e' },
                ].map(({ label, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%',
                            background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#8aaccc' }}>{label}</span>
                    </div>
                ))}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)',
                    fontSize: 10, color: 'rgba(138,172,204,0.4)' }}>
                    Circle size = FRP magnitude
                </div>
            </div>
        </div>
    );
}