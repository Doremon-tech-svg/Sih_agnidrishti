import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getHotspots, getFacilities, getHotspotHeatmap } from './api.js';

function RecenterComponent({ lat, lon, zoom }) {
    const map = useMap();
    useEffect(() => {
        if (lat != null && lon != null) {
            map.setView([lat, lon], zoom || 7, { animate: true });
        }
    }, [lat, lon, zoom, map]);
    return null;
}

export default function RegionCardMap({ bbox, center, height = 220 }) {
    const [hotspots, setHotspots] = useState([]);
    const [heatCells, setHeatCells] = useState([]);
    const [facilities, setFacilities] = useState([]);

    useEffect(() => {
        if (!bbox && !center) return;
        const params = {};
        if (bbox) params.bbox = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;

        // Fetch hotspot points and aggregated heatmap cells
        getHotspots(params).then(setHotspots).catch(() => setHotspots([]));
        getHotspotHeatmap({ bbox: params.bbox, step: 0.05 }).then(h => setHeatCells(h.cells || [])).catch(() => setHeatCells([]));
        getFacilities().then(setFacilities).catch(() => setFacilities([]));
    }, [bbox, center]);

    const view = center ? [center.lat, center.lon] : [(bbox.minLat + bbox.maxLat) / 2, (bbox.minLon + bbox.maxLon) / 2];

    return (
        <div style={{ width: '100%', height, borderRadius: 8, overflow: 'hidden', marginTop: 10 }}>
            <MapContainer center={view} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true} zoomControl={true}>
                <RecenterComponent lat={view[0]} lon={view[1]} zoom={6} />
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap contributors"
                />

                {hotspots.map(h => (
                    <CircleMarker key={`h-${h.id}`} center={[h.lat, h.lon]} radius={3} pathOptions={{ color: '#ff5722', fillOpacity: 0.8 }} />
                ))}

                {/* Heatmap overlay via aggregated cells */}
                {heatCells.map((c, i) => (
                    <CircleMarker key={`cell-${i}`} center={[parseFloat(c.lat_bin), parseFloat(c.lon_bin)]} radius={Math.max(4, Math.log((c.cnt || 0) + 1) * 4)} pathOptions={{ color: '#ff0000', fillOpacity: 0.35 }} />
                ))}

                {facilities.map(f => {
                    try {
                        const geom = typeof f.geometry === 'string' ? JSON.parse(f.geometry) : f.geometry;
                        return <GeoJSON key={`f-${f.id}`} data={geom} style={{ color: '#64748b', weight: 1, fillOpacity: 0.06 }} />;
                    } catch (e) { return null; }
                })}

            </MapContainer>
        </div>
    );
}
