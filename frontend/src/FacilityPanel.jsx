import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { getFacility } from './api.js';

export default function FacilityPanel({ facilityId, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!facilityId) { setData(null); return; }
        setLoading(true);
        getFacility(facilityId)
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [facilityId]);

    if (!facilityId) return null;

    return (
        <div className="glass" style={{
            position: 'absolute',
            bottom: 'calc(var(--bottom-h) + 10px)',
            left: 10,
            width: 340,
            padding: 16,
            zIndex: 1000,
            color: 'var(--text-primary)',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {data?.name ?? 'Loading...'}
                    </h3>
                    {data && (
                        <span style={{
                            fontSize: 11, color: '#60a5fa',
                            background: 'rgba(59,130,246,0.12)',
                            padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                            marginTop: 4, display: 'inline-block',
                        }}>
                            {data.type}
                        </span>
                    )}
                </div>
                <button onClick={onClose} style={{
                    border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)',
                    borderRadius: 6, width: 26, height: 26, cursor: 'pointer',
                    fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1,
                }}>
                    ✕
                </button>
            </div>

            {loading && (
                <div style={{ marginTop: 12 }}>
                    {[1, 2].map(i => (
                        <div key={i} className="shimmer" style={{ height: 18, marginBottom: 6, borderRadius: 6 }} />
                    ))}
                </div>
            )}

            {data && (
                <>
                    <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 13 }}>
                        <Stat label="Detections" value={data.stats.detection_count} />
                        <Stat label="Avg FRP" value={`${Number(data.stats.avg_frp || 0).toFixed(1)} MW`} />
                        <Stat label="Last Seen" value={
                            data.stats.last_seen ? new Date(data.stats.last_seen).toLocaleDateString() : '—'
                        } />
                    </div>

                    {data.history.length > 0 ? (
                        <ResponsiveContainer width="100%" height={160} style={{ marginTop: 10 }}>
                            <LineChart data={data.history.map(h => ({
                                date: new Date(h.acq_date).toLocaleDateString(),
                                frp: h.frp,
                            }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#8aaccc' }} />
                                <YAxis tick={{ fontSize: 9, fill: '#8aaccc' }} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'rgba(10,18,35,0.95)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 8, fontSize: 11, color: '#f0f6ff',
                                    }}
                                />
                                <Line type="monotone" dataKey="frp" stroke="#ef4444" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16, textAlign: 'center' }}>
                            No linked detections yet
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{value}</div>
        </div>
    );
}