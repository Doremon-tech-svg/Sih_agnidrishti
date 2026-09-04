/**
 * LoginPage.jsx — Government authentication portal
 * Fire amber theme · Sign In + Request Access
 */
import { useState } from 'react';
import { login, register, setToken, setUser } from './api.js';

const DEPARTMENTS = [
    'GSDMA — Gujarat State Disaster Management Authority',
    'Gujarat Forest Department',
    'ISRO / SAC — Space Applications Centre',
    'IMD — India Meteorological Department',
    'CPCB / GPCB — Pollution Control Board',
    'Revenue & Relief Commissioner, Gujarat',
    'IIT Gandhinagar / IIT Bombay (Research)',
    'National Disaster Response Force (NDRF)',
    'Other Government Agency',
];

/* ─── Test credentials shown on login page for demo ────────────────────────── */
const TEST_ACCOUNTS = [
    { email: 'admin@agnidrishti.gov.in',   password: 'Admin@2026',   role: 'ADMIN',   color: '#ef4444' },
    { email: 'analyst@agnidrishti.gov.in', password: 'Analyst@2026', role: 'ANALYST', color: '#f59e0b' },
    { email: 'viewer@agnidrishti.gov.in',  password: 'Viewer@2026',  role: 'VIEWER',  color: '#22c55e' },
];

export default function LoginPage({ onAuthSuccess }) {
    const [mode,    setMode]    = useState('login');
    const [form,    setForm]    = useState({ email: '', password: '', full_name: '', designation: '', department: '' });
    const [error,   setError]   = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    /* Quick-fill from test account card */
    const fillTest = (acc) => {
        setForm(f => ({ ...f, email: acc.email, password: acc.password }));
        setMode('login');
        setError('');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try {
            const { token, user } = await login(form.email, form.password);
            setToken(token);
            setUser(user);
            onAuthSuccess(user);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError(''); setSuccess(''); setLoading(true);
        try {
            const data = await register({
                email: form.email, password: form.password,
                full_name: form.full_name, designation: form.designation, department: form.department,
            });
            setSuccess(data.message || 'Registration submitted. Await admin approval.');
            setForm({ email: '', password: '', full_name: '', designation: '', department: '' });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh', width: '100vw',
            background: 'linear-gradient(145deg, #0d0a08 0%, #1a0e06 40%, #0d0a08 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Inter', sans-serif", position: 'relative', overflow: 'hidden',
        }}>
            {/* Background grid */}
            <div style={{
                position: 'absolute', inset: 0, opacity: 0.04,
                backgroundImage: `linear-gradient(rgba(249,115,22,0.7) 1px, transparent 1px),
                                  linear-gradient(90deg, rgba(249,115,22,0.7) 1px, transparent 1px)`,
                backgroundSize: '40px 40px',
            }} />

            {/* Fire glow orbs */}
            <div style={{ position: 'absolute', top: '10%', left: '5%', width: 500, height: 500,
                borderRadius: '50%', pointerEvents: 'none',
                background: 'radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 65%)'}} />
            <div style={{ position: 'absolute', bottom: '10%', right: '5%', width: 400, height: 400,
                borderRadius: '50%', pointerEvents: 'none',
                background: 'radial-gradient(circle, rgba(249,115,22,0.07) 0%, transparent 65%)'}} />

            {/* Centered layout: test accounts left + login card right on wide screens */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start',
                flexWrap: 'wrap', justifyContent: 'center', padding: '24px 16px', width: '100%', maxWidth: 860 }}>

                {/* ── Test Accounts Card ── */}
                <div style={{
                    width: 280, background: 'rgba(22,16,10,0.95)',
                    border: '1px solid rgba(249,115,22,0.15)', borderRadius: 18,
                    padding: '20px', backdropFilter: 'blur(20px)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: 1.5, color: 'rgba(196,149,106,0.6)', marginBottom: 14 }}>
                        🧪 Demo Accounts
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(196,149,106,0.5)', marginBottom: 14, lineHeight: 1.5 }}>
                        Click any account to auto-fill login credentials for testing.
                    </div>
                    {TEST_ACCOUNTS.map(acc => (
                        <button key={acc.role} onClick={() => fillTest(acc)} style={{
                            width: '100%', padding: '10px 12px', marginBottom: 8,
                            borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                            border: `1px solid ${acc.color}30`,
                            background: `${acc.color}0d`,
                            textAlign: 'left', transition: 'all 0.15s',
                        }}
                            onMouseEnter={e => { e.currentTarget.style.background = `${acc.color}1a`; e.currentTarget.style.borderColor = `${acc.color}50`; }}
                            onMouseLeave={e => { e.currentTarget.style.background = `${acc.color}0d`; e.currentTarget.style.borderColor = `${acc.color}30`; }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: acc.color,
                                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                                    {acc.role === 'ADMIN' ? '🛡️' : acc.role === 'ANALYST' ? '🔬' : '👁️'} {acc.role}
                                </span>
                            </div>
                            <div style={{ fontSize: 10, color: 'rgba(196,149,106,0.6)', fontFamily: 'monospace', marginBottom: 1 }}>
                                {acc.email}
                            </div>
                            <div style={{ fontSize: 10, color: 'rgba(196,149,106,0.4)', fontFamily: 'monospace' }}>
                                {acc.password}
                            </div>
                        </button>
                    ))}

                    {/* Role permissions */}
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(249,115,22,0.1)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: 1, color: 'rgba(196,149,106,0.4)', marginBottom: 10 }}>Role Permissions</div>
                        {[
                            { role: 'ADMIN',   icon: '🛡️', color: '#ef4444', perms: ['Full access','Run ML pipeline','Manage users','All data'] },
                            { role: 'ANALYST', icon: '🔬', color: '#f59e0b', perms: ['Run ML pipeline','All data views'] },
                            { role: 'VIEWER',  icon: '👁️', color: '#22c55e', perms: ['Map & dashboard','Alert feed'] },
                        ].map(({ role, icon, color, perms }) => (
                            <div key={role} style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 3 }}>{icon} {role}</div>
                                {perms.map(p => (
                                    <div key={p} style={{ fontSize: 10, color: 'rgba(196,149,106,0.45)',
                                        paddingLeft: 10, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                                        <span style={{ color: '#4ade8060' }}>✓</span> {p}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Login / Register Card ── */}
                <div style={{
                    width: 400, background: 'rgba(22,16,10,0.95)',
                    border: '1px solid rgba(249,115,22,0.15)', borderRadius: 18, padding: '32px 36px',
                    backdropFilter: 'blur(24px)', boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
                }}>
                    {/* Logo */}
                    <div style={{ textAlign: 'center', marginBottom: 26 }}>
                        <div style={{ fontSize: 44, marginBottom: 8, filter: 'drop-shadow(0 0 16px rgba(249,115,22,0.6))' }}>🔥</div>
                        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0,
                            background: 'linear-gradient(90deg, #f97316, #ef4444, #f59e0b)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            AgniDrishti
                        </h1>
                        <p style={{ fontSize: 10, color: 'rgba(196,149,106,0.5)', margin: '4px 0 0',
                            letterSpacing: 1.8, textTransform: 'uppercase' }}>
                            Thermal Intelligence Platform · SIH 2026
                        </p>
                        <div style={{ marginTop: 10, fontSize: 10, padding: '3px 12px', display: 'inline-block',
                            borderRadius: 999, background: 'rgba(249,115,22,0.1)',
                            border: '1px solid rgba(249,115,22,0.2)', color: '#fb923c',
                            fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                            🏛️ Authorised Personnel Only
                        </div>
                    </div>

                    {/* Tab switcher */}
                    <div style={{ display: 'flex', background: 'rgba(249,115,22,0.05)',
                        borderRadius: 10, padding: 3, marginBottom: 22,
                        border: '1px solid rgba(249,115,22,0.1)' }}>
                        {[['login', '🔐 Sign In'], ['register', '📋 Request Access']].map(([m, label]) => (
                            <button key={m} onClick={() => { setMode(m); setError(''); setSuccess(''); }} style={{
                                flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
                                cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                                transition: 'all 0.15s',
                                background: mode === m ? 'rgba(249,115,22,0.2)' : 'transparent',
                                color: mode === m ? '#fb923c' : 'rgba(196,149,106,0.5)',
                                outline: mode === m ? '1px solid rgba(249,115,22,0.3)' : 'none',
                            }}>{label}</button>
                        ))}
                    </div>

                    {/* Form */}
                    <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
                        {mode === 'register' && (
                            <Field label="Full Name *" type="text" placeholder="Dr. Ramesh Patel"
                                value={form.full_name} onChange={v => set('full_name', v)} />
                        )}
                        <Field label="Email *" type="email"
                            placeholder={mode === 'login' ? 'officer@agnidrishti.gov.in' : 'you@agency.gov.in'}
                            value={form.email} onChange={v => set('email', v)} />
                        <Field label="Password *" type="password"
                            placeholder={mode === 'register' ? 'Min. 8 characters' : '••••••••'}
                            value={form.password} onChange={v => set('password', v)} />

                        {mode === 'register' && (
                            <>
                                <Field label="Designation" type="text" placeholder="Fire Safety Officer"
                                    value={form.designation} onChange={v => set('designation', v)} />
                                <div style={{ marginBottom: 14 }}>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600,
                                        color: 'rgba(196,149,106,0.6)', marginBottom: 5,
                                        textTransform: 'uppercase', letterSpacing: 0.8 }}>Department</label>
                                    <select value={form.department} onChange={e => set('department', e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 9,
                                            border: '1px solid rgba(249,115,22,0.15)',
                                            background: 'rgba(249,115,22,0.04)',
                                            color: form.department ? '#fdf0e0' : 'rgba(196,149,106,0.4)',
                                            fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}>
                                        <option value="">Select department…</option>
                                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>
                                <div style={{ padding: '10px 12px', borderRadius: 9, marginBottom: 14,
                                    background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)',
                                    fontSize: 11, color: '#fb923c', lineHeight: 1.5 }}>
                                    ℹ️ Your account will be reviewed by the administrator before access is granted.
                                </div>
                            </>
                        )}

                        {error && (
                            <div style={{ padding: '10px 12px', borderRadius: 9, marginBottom: 14,
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                                fontSize: 12, color: '#f87171' }}>⚠️ {error}</div>
                        )}
                        {success && (
                            <div style={{ padding: '10px 12px', borderRadius: 9, marginBottom: 14,
                                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                                fontSize: 12, color: '#4ade80' }}>✓ {success}</div>
                        )}

                        <button type="submit" disabled={loading} style={{
                            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                            background: loading ? 'rgba(249,115,22,0.25)'
                                : 'linear-gradient(135deg, #ea580c, #dc2626)',
                            color: 'white',
                            boxShadow: loading ? 'none' : '0 4px 20px rgba(234,88,12,0.4)',
                            transition: 'all 0.2s', letterSpacing: 0.5,
                        }}>
                            {loading ? '⟳ Please wait…' : mode === 'login' ? '🔐 Sign In' : '📋 Submit Request'}
                        </button>
                    </form>

                    <p style={{ textAlign: 'center', marginTop: 18, fontSize: 10,
                        color: 'rgba(196,149,106,0.3)', lineHeight: 1.6 }}>
                        AgniDrishti · SIH-2026 · Team 26162<br />
                        Unauthorized access is a criminal offence under IT Act 2000
                    </p>
                </div>
            </div>
        </div>
    );
}

function Field({ label, type, placeholder, value, onChange }) {
    return (
        <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600,
                color: 'rgba(196,149,106,0.6)', marginBottom: 5,
                textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</label>
            <input type={type} placeholder={placeholder} value={value} required
                onChange={e => onChange(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 9,
                    border: '1px solid rgba(249,115,22,0.15)',
                    background: 'rgba(249,115,22,0.04)',
                    color: '#fdf0e0', fontSize: 13, fontFamily: 'inherit',
                    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                onFocus={e => e.target.style.borderColor = 'rgba(249,115,22,0.5)'}
                onBlur={e  => e.target.style.borderColor = 'rgba(249,115,22,0.15)'}
            />
        </div>
    );
}
