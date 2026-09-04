import { useState, useEffect, useCallback } from 'react';
import { getMlStatus, runMlPipeline } from './api.js';

const PRIORITY_COLORS = {
    CRITICAL: '#ef4444', HIGH: '#f59e0b', MODERATE: '#3b82f6', LOW: '#22c55e',
};

function StatRow({ label, value, color }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</span>
        </div>
    );
}

export default function MLPanel({ onStatusChange }) {
    const [status, setStatus] = useState(null);
    const [running, setRunning] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const s = await getMlStatus();
            setStatus(s);
            if (onStatusChange) onStatusChange(s);
            const isRunning = s.status === 'running';
            setRunning(isRunning);
        } catch { /* backend may not be ready */ }
    }, [onStatusChange]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    // Fast poll while running
    useEffect(() => {
        const interval = setInterval(fetchStatus, running ? 2500 : 20000);
        return () => clearInterval(interval);
    }, [fetchStatus, running]);

    const handleRun = async () => {
        if (running) return;
        setRunning(true);
        await runMlPipeline(true).catch(() => {});
        await fetchStatus();
    };

    const summary  = status?.summary || {};
    const priority = summary?.priority_counts || {};
    const isDone   = status?.status === 'done';
    const isError  = status?.status === 'error';

    return (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', flexShrink: 0 }}>
            {/* Title row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className="sidebar-section-title" style={{ margin: 0 }}>ML Pipeline</span>
                {status?.status && (
                    <span className={`badge ${
                        running    ? 'badge-running' :
                        isDone     ? 'badge-done'    :
                        isError    ? 'badge-critical' : 'badge-neutral'
                    } ${running ? 'pulse-running' : ''}`}>
                        {running ? '⟳ Running' : isDone ? '✓ Done' : isError ? '✗ Error' : '—'}
                    </span>
                )}
            </div>

            {/* Last run timestamp */}
            {status?.finished_at && !running && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Last run: {new Date(status.finished_at).toLocaleString()}
                </div>
            )}

            {/* Summary stats */}
            {isDone && summary.patched > 0 && (
                <div style={{ marginBottom: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '7px 9px' }}>
                    <StatRow label="Total processed" value={(summary.total || 0).toLocaleString()} />
                    <StatRow label="Classified"      value={(summary.patched || 0).toLocaleString()} color="#a78bfa" />
                    <StatRow label="Debunked (FP)"   value={(summary.debunked || 0).toLocaleString()} color="#4ade80" />
                    <StatRow label="Incidents filed" value={(summary.incidents || 0).toLocaleString()} color="#f87171" />
                </div>
            )}

            {/* Priority breakdown */}
            {isDone && Object.keys(priority).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.8 }}>Threat Priority</div>
                    {['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].map(p =>
                        (priority[p] || 0) > 0 ? (
                            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                <span style={{
                                    width: 7, height: 7, borderRadius: '50%',
                                    background: PRIORITY_COLORS[p], flexShrink: 0,
                                    boxShadow: `0 0 5px ${PRIORITY_COLORS[p]}`,
                                }} />
                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{p}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLORS[p] }}>{priority[p]}</span>
                            </div>
                        ) : null
                    )}
                </div>
            )}

            {/* Error */}
            {isError && (
                <div style={{ fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.08)', padding: '6px 8px', borderRadius: 7, marginBottom: 8, lineHeight: 1.4 }}>
                    Pipeline error — check backend logs
                </div>
            )}

            {/* Run button */}
            <button
                id="ml-run-btn"
                className="ml-run-btn"
                onClick={handleRun}
                disabled={running}
            >
                {running ? '⟳ Running…' : '▶ Run Full Pipeline'}
            </button>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, textAlign: 'center' }}>
                Agents 1→2→3 · classifies + writes to DB
            </div>
        </div>
    );
}
