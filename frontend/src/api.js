const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api';

// ── Auth token helpers ─────────────────────────────────────────────────────
export const getToken  = ()    => localStorage.getItem('ag_token');
export const setToken  = (t)   => localStorage.setItem('ag_token', t);
export const clearToken = ()   => localStorage.removeItem('ag_token');
export const getUser   = ()    => { try { return JSON.parse(localStorage.getItem('ag_user') || 'null'); } catch { return null; } };
export const setUser   = (u)   => localStorage.setItem('ag_user', JSON.stringify(u));
export const clearUser = ()    => localStorage.removeItem('ag_user');

// ── Error logging utility ──────────────────────────────────────────────────
const logError = (endpoint, error, response = null) => {
    const msg = `[API] ${endpoint} failed: ${error}${response ? ` (${response.status})` : ''}`;
    console.error(msg);
    return msg;
};

// ── Fetch wrapper — auto-attaches Bearer token + response validation ───────
async function apiFetch(url, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    let res;
    try {
        res = await fetch(url, { ...opts, headers });
    } catch (networkErr) {
        logError(url, 'Network error: ' + networkErr.message);
        throw new Error('Network error. Please check your connection.');
    }

    // Handle 401 gracefully — log out without full-page reload (unless explicitly needed)
    if (res.status === 401) {
        clearToken();
        clearUser();
        const handleAuthRedirect = opts.handleAuthRedirect !== false;
        if (handleAuthRedirect) {
            logError(url, 'Unauthorized (401)');
            // Dispatch custom event for App to handle logout
            window.dispatchEvent(new CustomEvent('auth-expired'));
        }
        throw new Error('Authentication expired. Please log in again.');
    }

    // Validate response status
    if (!res.ok && res.status !== 200) {
        const msg = logError(url, `HTTP ${res.status}`);
        throw new Error(msg);
    }

    return res;
}

// ── Safe JSON parsing wrapper ──────────────────────────────────────────────
async function safeJson(response, fallback = null) {
    try {
        const text = await response.clone().text();
        if (!text) return fallback;
        return JSON.parse(text);
    } catch (e) {
        logError('JSON parse', e.message);
        return fallback;
    }
}

// ── Auth endpoints ─────────────────────────────────────────────────────────
export const login = async (email, password) => {
    try {
        const res = await fetch(`${BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await safeJson(res, {});
        if (!res.ok) throw new Error(data.error || 'Login failed');
        return data;   // { token, user }
    } catch (e) {
        logError('login', e.message);
        throw e;
    }
};

export const register = async (payload) => {
    try {
        const res = await fetch(`${BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await safeJson(res, {});
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        return data;
    } catch (e) {
        logError('register', e.message);
        throw e;
    }
};

export const getMe = async () => {
    try {
        const res = await apiFetch(`${BASE}/auth/me`);
        return await safeJson(res, null);
    } catch (e) {
        logError('getMe', e.message);
        throw e;
    }
};

// ── Data endpoints ─────────────────────────────────────────────────────────
export const getHotspots  = async (params = {}) => {
    try {
        const qs = new URLSearchParams(params).toString();
        const res = await apiFetch(`${BASE}/hotspots${qs ? `?${qs}` : ''}`);
        const data = await safeJson(res, []);
        return Array.isArray(data) ? data : [];
    } catch (e) {
        logError('getHotspots', e.message);
        return [];
    }
};

export const getFacilities  = async () => {
    try {
        const res = await apiFetch(`${BASE}/facilities`);
        const data = await safeJson(res, []);
        return Array.isArray(data) ? data : [];
    } catch (e) {
        logError('getFacilities', e.message);
        return [];
    }
};

export const getFacility = async (id) => {
    try {
        const res = await apiFetch(`${BASE}/facilities/${id}`);
        return await safeJson(res, null);
    } catch (e) {
        logError(`getFacility(${id})`, e.message);
        return null;
    }
};

export const getIncidents = async () => {
    try {
        const res = await apiFetch(`${BASE}/incidents`);
        const data = await safeJson(res, []);
        return Array.isArray(data) ? data : [];
    } catch (e) {
        logError('getIncidents', e.message);
        return [];
    }
};

export const getIncidentReport = async (id) => {
    try {
        const res = await apiFetch(`${BASE}/incidents/${id}/report`);
        return await safeJson(res, { report: 'Report unavailable.' });
    } catch (e) {
        logError(`getIncidentReport(${id})`, e.message);
        return { report: 'Error generating report.' };
    }
};

export const getAlerts = async () => {
    try {
        const res = await apiFetch(`${BASE}/alerts`);
        const data = await safeJson(res, []);
        return Array.isArray(data) ? data : [];
    } catch (e) {
        logError('getAlerts', e.message);
        return [];
    }
};

export const getMlStatus = async () => {
    try {
        const res = await apiFetch(`${BASE}/ml/status`);
        return await safeJson(res, { status: 'never_run' });
    } catch (e) {
        logError('getMlStatus', e.message);
        return { status: 'error', error: e.message };
    }
};

export const runMlPipeline = async (writeBack = true) => {
    try {
        const res = await apiFetch(`${BASE}/ml/run?write_back=${writeBack}`, { method: 'POST' });
        return await safeJson(res, { status: 'error' });
    } catch (e) {
        logError('runMlPipeline', e.message);
        throw e;
    }
};

export const evaluateIncident = async (hotspot) => {
    try {
        const response = await apiFetch(`${BASE}/incidents/evaluate`, {
            method: 'POST',
            body: JSON.stringify(hotspot),
        });
        if (!response.ok) throw new Error('Incident evaluation failed');
        return await safeJson(response, { error: 'Evaluation failed' });
    } catch (e) {
        logError('evaluateIncident', e.message);
        throw e;
    }
};

export { BASE };
