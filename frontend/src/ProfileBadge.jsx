/**
 * ProfileBadge.jsx — Topbar user avatar + role badge + logout
 */
import { useState, useRef, useEffect } from 'react';
import { clearToken, clearUser } from './api.js';

const ROLE_COLORS = {
    ADMIN:   { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.35)',  text: '#f87171' },
    ANALYST: { bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.35)', text: '#fbbf24' },
    VIEWER:  { bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.35)',  text: '#4ade80' },
};

const ROLE_ICONS = { ADMIN: '🛡️', ANALYST: '🔬', VIEWER: '👁️' };

export default function ProfileBadge({ user, onLogout }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleLogout = () => {
        clearToken(); clearUser();
        onLogout();
    };

    if (!user) return null;

    const initials = user.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
    const roleStyle = ROLE_COLORS[user.role] || ROLE_COLORS.VIEWER;

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            {/* Trigger button */}
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 10px 5px 6px', borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: open ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}
            >
                {/* Avatar circle */}
                <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'linear-gradient(135deg,#3b82f6,#6366f1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: 'white', flexShrink: 0,
                }}>
                    {initials}
                </div>

                {/* Name + role */}
                <div style={{ textAlign: 'left', lineHeight: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#f0f6ff', marginBottom: 2 }}>
                        {user.full_name?.split(' ')[0]}
                    </div>
                    <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                        background: roleStyle.bg, border: `1px solid ${roleStyle.border}`,
                        color: roleStyle.text, textTransform: 'uppercase', letterSpacing: 0.6,
                    }}>
                        {ROLE_ICONS[user.role]} {user.role}
                    </span>
                </div>

                <span style={{ fontSize: 10, color: 'rgba(138,172,204,0.4)', marginLeft: 2 }}>
                    {open ? '▲' : '▼'}
                </span>
            </button>

            {/* Dropdown */}
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    minWidth: 240, zIndex: 3000,
                    background: 'rgba(8,15,30,0.98)', backdropFilter: 'blur(24px)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
                    boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
                    overflow: 'hidden', fontFamily: "'Inter', sans-serif",
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)',
                        background: 'rgba(255,255,255,0.02)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: '50%',
                                background: 'linear-gradient(135deg,#3b82f6,#6366f1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 16, fontWeight: 800, color: 'white',
                            }}>
                                {initials}
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f6ff' }}>
                                    {user.full_name}
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(138,172,204,0.6)', marginTop: 1 }}>
                                    {user.email}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Profile info */}
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <InfoRow label="Role" value={`${ROLE_ICONS[user.role]} ${user.role}`} color={roleStyle.text} />
                        {user.designation && <InfoRow label="Designation" value={user.designation} />}
                        {user.department && <InfoRow label="Department" value={user.department} />}
                    </div>

                    {/* Role permissions */}
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ fontSize: 10, color: 'rgba(138,172,204,0.4)',
                            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                            Access Level
                        </div>
                        {getPermissions(user.role).map((p, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center',
                                marginBottom: 3, fontSize: 11, color: 'rgba(138,172,204,0.7)' }}>
                                <span style={{ color: '#4ade80' }}>✓</span> {p}
                            </div>
                        ))}
                    </div>

                    {/* Logout */}
                    <div style={{ padding: '8px' }}>
                        <button onClick={handleLogout} style={{
                            width: '100%', padding: '9px 0', borderRadius: 8,
                            border: '1px solid rgba(239,68,68,0.2)',
                            background: 'rgba(239,68,68,0.08)',
                            color: '#f87171', cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                            transition: 'all 0.15s',
                        }}
                            onMouseEnter={e => { e.target.style.background = 'rgba(239,68,68,0.15)'; }}
                            onMouseLeave={e => { e.target.style.background = 'rgba(239,68,68,0.08)'; }}
                        >
                            🚪 Sign Out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function InfoRow({ label, value, color }) {
    return (
        <div style={{ display: 'flex', gap: 8, padding: '2px 0', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, color: 'rgba(138,172,204,0.4)',
                minWidth: 70, paddingTop: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
            <span style={{ fontSize: 11, color: color || 'rgba(138,172,204,0.8)', flex: 1 }}>{value}</span>
        </div>
    );
}

function getPermissions(role) {
    if (role === 'ADMIN') return [
        'View live map & detections',
        'Access dashboard & incidents',
        'Run ML pipeline',
        'Manage user accounts',
    ];
    if (role === 'ANALYST') return [
        'View live map & detections',
        'Access dashboard & incidents',
        'Run ML pipeline',
    ];
    return [
        'View live map & detections',
        'Access dashboard & incidents',
    ];
}
