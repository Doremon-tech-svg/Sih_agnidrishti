const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api';

// ── Auth token helpers ─────────────────────────────────────────────────────
export const getToken  = ()    => localStorage.getItem('ag_token');
export const setToken  = (t)   => localStorage.setItem('ag_token', t);
export const clearToken = ()   => localStorage.removeItem('ag_token');
export const getUser   = ()    => { try { return JSON.parse(localStorage.getItem('ag_user') || 'null'); } catch { return null; } };
export const setUser   = (u)   => localStorage.setItem('ag_user', JSON.stringify(u));
export const clearUser = ()    => localStorage.removeItem('ag_user');

// ── Fetch wrapper — auto-attaches Bearer token ─────────────────────────────
async function apiFetch(url, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401) {
        clearToken(); clearUser();
        window.location.reload();   // boot back to login
    }
    return res;
}

// ── Auth endpoints ─────────────────────────────────────────────────────────
export const login = async (email, password) => {
    const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    return data;   // { token, user }
};

export const register = async (payload) => {
    const res = await fetch(`${BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    return data;
};

export const getMe = async () => (await apiFetch(`${BASE}/auth/me`)).json();

// ── Data endpoints ─────────────────────────────────────────────────────────
export const getHotspots  = async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return (await apiFetch(`${BASE}/hotspots${qs ? `?${qs}` : ''}`)).json();
};
export const getFacilities  = async ()  => (await apiFetch(`${BASE}/facilities`)).json();
export const getFacility    = async (id)=> (await apiFetch(`${BASE}/facilities/${id}`)).json();
export const getIncidents   = async ()  => (await apiFetch(`${BASE}/incidents`)).json();
export const getIncidentReport = async (id) => (await apiFetch(`${BASE}/incidents/${id}/report`)).json();
export const getAlerts      = async ()  => (await apiFetch(`${BASE}/alerts`)).json();
export const getMlStatus    = async ()  => (await apiFetch(`${BASE}/ml/status`)).json();
export const runMlPipeline  = async (writeBack = true) =>
    (await apiFetch(`${BASE}/ml/run?write_back=${writeBack}`, { method: 'POST' })).json();

export { BASE };