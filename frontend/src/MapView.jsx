import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON } from 'react-leaflet';
import { useEffect, useState, useCallback, useRef } from 'react';
import { getHotspots, getFacilities } from './api.js';
import FacilityPanel from './FacilityPanel.jsx';
import TimeSlider from './TimeSlider.jsx';
import Legend from './Legend.jsx';
import Scene3D from './Scene3D.jsx';
import ClassFilter from './ClassFilter.jsx';
import { getRegionInfo, formatCoord, getLandCoverLabel, getSatelliteName } from './geoUtils.js';

const COLORS = {
    'Gas Flare':                  '#f59e0b',
    'Industrial Thermal Source':  '#3b82f6',
    'Industrial Fire / Accident': '#ef4444',
    'Agricultural Burning':       '#84cc16',
    'Wildfire / Forest Fire':     '#f97316',
    'Mining Thermal Activity':    '#a855f7',
    'False Positive':             '#6b7280',
};

const RISK_COLOR = (score) => {
    if (score >= 76) return '#ef4444';
    if (score >= 56) return '#f59e0b';
    if (score >= 31) return '#3b82f6';
    return '#22c55e';
};

function HotspotPopup({ h }) {
    const cls = h.classification || 'Unclassified';
    const risk = h.risk_score;
    const clsColor = COLORS[cls] || '#9ca3af';
    
    const loc = getRegionInfo(h.lat, h.lon);
    const coordStr = formatCoord(h.lat, h.lon);
    const raw = h.raw || {};
    const landCover = getLandCoverLabel(raw);
    const satName = getSatelliteName(h.satellite);

    return (
        <div style={{ fontSize: 12, minWidth: 230, fontFamily: 'Inter, system-ui, sans-serif', color: '#1e293b' }}>
            {/* Header: Classification */}
            <div style={{
                background: `${clsColor}15`,
                border: `1px solid ${clsColor}30`,
                borderBottom: `2px solid ${clsColor}`,
                padding: '6px 10px', margin: '-1px -1px 8px -1px',
                fontWeight: 700, color: clsColor, fontSize: 13,
                borderTopLeftRadius: 11, borderTopRightRadius: 11,
            }}>
                {cls}
            </div>

            <div style={{ padding: '0 8px 8px 8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 6px', marginBottom: 8 }}>
                    
                    <span style={{ color: '#64748b' }}>Location</span>
                    <span style={{ fontWeight: 600 }}>{loc.name} <br/><span style={{fontSize: 10, color: '#94a3b8'}}>{coordStr}</span></span>
                    
                    <span style={{ color: '#64748b' }}>Land Cover</span>
                    <span style={{ fontWeight: 500 }}>{landCover}</span>

                    <span style={{ color: '#64748b' }}>FRP</span>
                    <span style={{ fontWeight: 700, color: '#ef4444' }}>{h.frp?.toFixed(1) ?? '—'} MW</span>
                    
                    <span style={{ color: '#64748b' }}>Risk Score</span>
                    <span style={{ fontWeight: 700, color: risk ? RISK_COLOR(risk) : '#64748b' }}>
                        {risk ? `${risk}/100` : '—'}
                    </span>
                    
                    {h.class_confidence != null && (
                        <>
                            <span style={{ color: '#64748b' }}>ML Conf.</span>
                            <span style={{ fontWeight: 600 }}>{(h.class_confidence * 100).toFixed(0)}%</span>
                        </>
                    )}
                    
                    <span style={{ color: '#64748b' }}>Satellite</span>
                    <span style={{ fontWeight: 500 }}>{satName}</span>
                    
                    <span style={{ color: '#64748b' }}>Detected</span>
                    <span style={{ fontWeight: 500 }}>{h.acq_date ? new Date(h.acq_date).toLocaleString() : '—'}</span>
                </div>

                {h.explanation && (
                    <div style={{
                        color: '#475569', fontSize: 11, borderTop: '1px solid #e2e8f0',
                        paddingTop: 6, marginTop: 4, lineHeight: 1.5, fontStyle: 'italic'
                    }}>
                        {h.explanation}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function MapView({ onHotspotCount }) {
    const [hotspots, setHotspots]               = useState([]);
    const [timeFiltered, setTimeFiltered]       = useState([]);
    const [classFiltered, setClassFiltered]     = useState([]);
    const [facilities, setFacilities]           = useState([]);
    const [selectedFacility, setSelectedFacility] = useState(null);
    const [loading, setLoading]                 = useState(true);
    const [show3D, setShow3D]                   = useState(false);
    const [leftPanelOpen, setLeftPanelOpen]     = useState(true);

    const loadData = useCallback(() => {
        Promise.all([getHotspots(), getFacilities()])
            .then(([h, f]) => {
                setHotspots(h);
                setTimeFiltered(h);
                setClassFiltered(h);
                setFacilities(f);
                setLoading(false);
                if (onHotspotCount) onHotspotCount(h.length);
            })
            .catch(() => setLoading(false));
    }, [onHotspotCount]);

    useEffect(() => {
        loadData();
        // Periodically refresh map data to catch pipeline updates
        const t = setInterval(loadData, 30000);
        return () => clearInterval(t);
    }, [loadData]);

    const handleTimeFiltered = useCallback((filtered) => {
        setTimeFiltered(filtered);
        setClassFiltered(filtered); 
    }, []);

    const handleClassFiltered = useCallback((filtered) => {
        setClassFiltered(filtered);
    }, []);

    const visibleHotspots = classFiltered;

    return (
        <div style={{ position: 'absolute', top: 'var(--topbar-h)', left: 0, right: 'var(--sidebar-w)', bottom: 'var(--bottom-h)', zIndex: 1 }}>
            {loading && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg-dark)', color: 'white', zIndex: 2000, gap: 16,
                }}>
                    <div style={{ fontSize: 36, animation: 'pulse-ring 2s infinite', borderRadius: '50%' }}>🔥</div>
                    <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: 0.5 }}>Loading Thermal Intelligence…</div>
                    <div className="shimmer" style={{ width: 240, height: 4, borderRadius: 2 }} />
                </div>
            )}

            <MapContainer
                center={[22.3, 71.5]} zoom={7}
                style={{ height: '100%', width: '100%', background: '#0f172a' }}
                zoomControl={false}
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

                {facilities.map(f => (
                    <GeoJSON
                        key={f.id}
                        data={JSON.parse(f.geometry)}
                        style={{ color: '#64748b', weight: 1.5, fillOpacity: 0.15, fillColor: '#94a3b8' }}
                        eventHandlers={{ click: () => setSelectedFacility(f.id) }}
                    />
                ))}

                {visibleHotspots.map(h => {
                    const cls   = h.classification || 'False Positive';
                    const color = COLORS[cls] || '#9ca3af';
                    const risk  = h.risk_score || 0;
                    
                    let r = 5;
                    let opacity = 0.6;
                    let weight = 1;
                    
                    if (risk >= 76) { r = 11; opacity = 0.95; weight = 2.5; }
                    else if (risk >= 56) { r = 9; opacity = 0.9; weight = 2; }
                    else if (risk >= 31) { r = 7; opacity = 0.8; weight = 1.5; }

                    if (cls === 'False Positive') {
                        r = 4;
                        opacity = 0.4;
                        weight = 0.5;
                    }

                    return (
                        <CircleMarker
                            key={h.id}
                            center={[h.lat, h.lon]}
                            radius={r}
                            pathOptions={{
                                color,
                                fillColor: color,
                                fillOpacity: opacity,
                                weight: weight,
                            }}
                        >
                            <Popup maxWidth={260}><HotspotPopup h={h} /></Popup>
                        </CircleMarker>
                    );
                })}
            </MapContainer>

            {/* Left slide-in panel */}
            <div className={`left-panel ${leftPanelOpen ? 'open' : ''}`}>
                <div style={{ padding: '16px 14px', flex: 1, overflowY: 'auto' }}>
                    <ClassFilter
                        hotspots={timeFiltered}
                        onFilteredChange={handleClassFiltered}
                    />
                    
                    <div style={{ marginTop: 24 }}>
                        <Legend />
                    </div>
                </div>
            </div>

            {/* Controls overlay */}
            <div style={{ position: 'absolute', top: 'calc(var(--topbar-h) + 16px)', left: leftPanelOpen ? 236 : 16, zIndex: 1300, display: 'flex', gap: 10, transition: 'left 0.22s' }}>
                <button 
                    className={`map-btn ${leftPanelOpen ? 'active' : ''}`}
                    onClick={() => setLeftPanelOpen(!leftPanelOpen)}
                >
                    {leftPanelOpen ? '◀ Hide Filters' : '▶ Show Filters'}
                </button>
                <button 
                    className="map-btn"
                    onClick={() => setShow3D(true)}
                >
                    🏔 3D Terrain
                </button>
            </div>

            {/* Time slider is positioned absolute at the bottom in the timeslider-bar */}
            <TimeSlider hotspots={hotspots} onFilteredChange={handleTimeFiltered} />

            <FacilityPanel facilityId={selectedFacility} onClose={() => setSelectedFacility(null)} />

            {show3D && (
                <Scene3D hotspots={hotspots} facilities={facilities} onClose={() => setShow3D(false)} />
            )}
        </div>
    );
}