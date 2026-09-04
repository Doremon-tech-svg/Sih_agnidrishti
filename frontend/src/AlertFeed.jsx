import { useEffect, useState } from 'react';
import { getAlerts, getIncidentReport } from './api.js';

const TIER_LABEL = { 1: 'Facility', 2: 'District', 3: 'State', 4: 'National' };
const TIER_COLOR = { 1: '#22c55e', 2: '#f59e0b', 3: '#ef4444', 4: '#7c3aed' };
const TIER_BG    = { 1: 'rgba(34,197,94,0.08)', 2: 'rgba(245,158,11,0.08)', 3: 'rgba(239,68,68,0.1)', 4: 'rgba(124,58,237,0.1)' };

function AlertItem({ a }) {
    const [report, setReport] = useState(null);
    const [loadingReport, setLoadingReport] = useState(false);
    
    const fetchReport = async () => {
        if (report) {
            setReport(null); // toggle off
            return;
        }
        setLoadingReport(true);
        try {
            const data = await getIncidentReport(a.incident_id);
            setReport(data.report || 'No report available.');
        } catch (err) {
            setReport('Error generating report.');
        } finally {
            setLoadingReport(false);
        }
    };

    const color = TIER_COLOR[a.tier] || '#888';
    const bg    = TIER_BG[a.tier]    || 'transparent';
    const isCritical = a.tier >= 3;
    return (
        <div style={{
            padding: '9px 11px',
            borderRadius: 9,
            background: bg,
            borderLeft: `3px solid ${color}`,
            marginBottom: 6,
            transition: 'opacity 0.2s',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span
                    className={`badge ${isCritical ? 'badge-critical' : a.tier === 2 ? 'badge-high' : 'badge-low'} ${isCritical ? 'pulse' : ''}`}
                >
                    T{a.tier} · {TIER_LABEL[a.tier]}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(a.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>
                {a.message}
            </p>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    onClick={fetchReport}
                    disabled={loadingReport}
                    style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 10,
                        color: '#60a5fa',
                        cursor: 'pointer',
                    }}
                >
                    {loadingReport ? 'Generating...' : report ? 'Hide AI Report' : '✨ AI Report'}
                </button>
            </div>
            {report && (
                <div style={{
                    marginTop: 8,
                    padding: '8px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: 6,
                    fontSize: 11,
                    color: '#e2e8f0',
                    lineHeight: 1.4,
                    fontStyle: 'italic',
                    borderLeft: '2px solid #60a5fa'
                }}>
                    {report}
                </div>
            )}
        </div>
    );
}

export default function AlertFeed() {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = () =>
            getAlerts()
                .then(a => { setAlerts(Array.isArray(a) ? a : []); setLoading(false); })
                .catch(() => setLoading(false));
        load();
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
    }, []);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {/* Header */}
            <div className="sidebar-section" style={{ paddingBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="sidebar-section-title" style={{ margin: 0 }}>Alert Feed</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {alerts.length} total · live
                    </span>
                </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                {loading && (
                    <>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="shimmer" style={{ height: 56, marginBottom: 6, borderRadius: 9 }} />
                        ))}
                    </>
                )}

                {!loading && alerts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>🟢</div>
                        <div>No alerts — system monitoring</div>
                        <div style={{ fontSize: 10, marginTop: 4 }}>Alerts appear after HIGH/CRITICAL events</div>
                    </div>
                )}

                {alerts.map(a => <AlertItem key={a.id} a={a} />)}
            </div>
        </div>
    );
}