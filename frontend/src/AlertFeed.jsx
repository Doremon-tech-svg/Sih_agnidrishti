import { useEffect, useState } from 'react';
import { getAlerts } from './api.js';
const TIER_LABEL = { 1: 'Facility', 2: 'District', 3: 'State', 4: 'National' };
const TIER_COLOR = { 1: '#22c55e', 2: '#f59e0b', 3: '#ef4444', 4: '#a855f7' };
const TIER_BG    = { 1: 'rgba(34,197,94,0.08)', 2: 'rgba(245,158,11,0.08)', 3: 'rgba(239,68,68,0.1)', 4: 'rgba(168,85,247,0.1)' };

function AlertItem({ a }) {
    const [report, setReport] = useState(null);
    const [loadingReport, setLoadingReport] = useState(false);

    const fetchReport = async () => {
        if (report) {
            setReport(null);
            return;
        }
        setLoadingReport(true);
        try {
            const data = await getIncidentReport(a.incident_id);
            setReport(data.report || 'No report available.');
        } catch {
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
            padding: '7px 10px',
            borderRadius: 8,
            background: bg,
            borderLeft: `3px solid ${color}`,
            marginBottom: 5,
            transition: 'opacity 0.2s',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <span
                    className={`badge ${isCritical ? 'badge-critical' : a.tier === 2 ? 'badge-high' : 'badge-low'} ${isCritical ? 'pulse' : ''}`}
                    style={{ fontSize: 9, padding: '1px 6px' }}
                >
                    T{a.tier} · {TIER_LABEL[a.tier]}
                </span>
                <span style={{ fontSize: 9, color: 'var(--ag-text-muted)' }}>
                    {new Date(a.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
            <p style={{ fontSize: 10, color: 'var(--ag-text-secondary)', lineHeight: 1.3, margin: 0 }}>
                {a.message}
            </p>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    onClick={fetchReport}
                    disabled={loadingReport}
                    style={{
                        background: 'rgba(56, 189, 248, 0.08)',
                        border: '1px solid rgba(56, 189, 248, 0.2)',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 9,
                        color: 'var(--ag-cyan)',
                        cursor: loadingReport ? 'wait' : 'pointer',
                        fontFamily: 'inherit',
                    }}
                >
                    {loadingReport ? 'Generating…' : report ? 'Hide AI Report' : '✨ AI Report'}
                </button>
            </div>
            {report && (
                <div style={{
                    marginTop: 6,
                    padding: '6px 8px',
                    background: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: 4,
                    fontSize: 10,
                    color: 'var(--ag-text-secondary)',
                    lineHeight: 1.3,
                    fontStyle: 'italic',
                    borderLeft: '2px solid var(--ag-cyan)',
                }}>
                    {report}
                </div>
            )}
        </div>
    );
}

export default function AlertFeed({ collapsible = true }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);

    useEffect(() => {
        const load = () =>
            getAlerts()
                .then(a => { setAlerts(Array.isArray(a) ? a : []); setLoading(false); setErrored(false); })
                .catch(() => { setLoading(false); setErrored(true); });
        load();
        const interval = setInterval(load, 15000);
        return () => clearInterval(interval);
    }, []);

    const criticalCount = alerts.filter(a => a.tier >= 3).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Only show header if not collapsible (dropdown mode) */}
            {!collapsible && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: 6,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    marginBottom: 6,
                }}>
                    <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        color: 'var(--ag-cyan)',
                    }}>
                        🛰 Live Alerts
                    </span>
                    {criticalCount > 0 && (
                        <span className="badge badge-critical pulse" style={{ fontSize: 8, padding: '1px 6px' }}>
                            {criticalCount} critical
                        </span>
                    )}
                    <span style={{ fontSize: 9, color: 'var(--ag-text-muted)' }}>
                        {errored ? 'offline' : `${alerts.length} total`}
                    </span>
                </div>
            )}

            <div style={{ maxHeight: collapsible ? 'none' : '300px', overflowY: 'auto' }}>
                {loading && (
                    <>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="shimmer" style={{ height: 40, marginBottom: 4, borderRadius: 6 }} />
                        ))}
                    </>
                )}

                {!loading && errored && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--ag-text-muted)', fontSize: 11 }}>
                        ⚠️ Couldn't reach alert service
                    </div>
                )}

                {!loading && !errored && alerts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--ag-text-muted)', fontSize: 11 }}>
                        🟢 No alerts — system monitoring
                    </div>
                )}

                {!loading && !errored && alerts.map(a => <AlertItem key={a.id} a={a} />)}
            </div>
        </div>
    );
}