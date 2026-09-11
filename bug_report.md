# 🐛 AgniDrishti Bug Report — Full Codebase Scan

> [!IMPORTANT]
> Found **16 bugs** across backend, frontend, and config files. Listed by severity.

---

## 🔴 BUG 1 — Hardcoded API Key Exposed in Source Code
**File:** [client.py](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/backend/app/ingestion/firms/client.py#L16)  
**Category:** 🔒 Security — CRITICAL  
**Line:** 16

```python
MAP_KEY = "2d6536514c8efa5e004a1f494d10eab8"
```

**Problem:** The NASA FIRMS API key is hardcoded directly in source code and committed to Git. Anyone with repo access can see and abuse it.

**Fix:** Move to an environment variable:
```python
MAP_KEY = os.environ.get("FIRMS_MAP_KEY")
if not MAP_KEY:
    raise ValueError("FIRMS_MAP_KEY env var is required")
```

---

## 🔴 BUG 2 — Hardcoded Database Credentials in docker-compose.yml
**File:** [docker-compose.yml](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/docker-compose.yml#L6-L8)  
**Category:** 🔒 Security — CRITICAL  
**Lines:** 6–8

```yaml
POSTGRES_USER: sih
POSTGRES_PASSWORD: sih
POSTGRES_DB: firewatch
```

**Problem:** Trivially weak credentials (`sih` / `sih`) are hardcoded in the compose file. If this Postgres port is exposed (it is, on `5432:5432`), anyone can connect.

**Fix:** Use environment variable substitution:
```yaml
POSTGRES_USER: ${POSTGRES_USER:-sih}
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set a strong DB password}
```

---

## 🔴 BUG 3 — Test Credentials Hardcoded in Frontend Source
**File:** [LoginPage.jsx](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/LoginPage.jsx#L21-L25)  
**Category:** 🔒 Security — HIGH  
**Lines:** 21–25

```jsx
const TEST_ACCOUNTS = [
    { email: 'admin@agnidrishti.gov.in', password: 'Admin@2026', ... },
    { email: 'analyst@agnidrishti.gov.in', password: 'Analyst@2026', ... },
    { email: 'viewer@agnidrishti.gov.in', password: 'Viewer@2026', ... },
];
```

**Problem:** Admin, analyst, and viewer passwords are exposed in the client-side JavaScript bundle. Anyone can view-source and log in as admin.

**Fix:** Remove `TEST_ACCOUNTS` entirely from production. Use env-gated demo mode:
```jsx
const TEST_ACCOUNTS = import.meta.env.VITE_DEMO_MODE === 'true' ? [...] : [];
```

---

## 🔴 BUG 4 — No CORS Configuration on FastAPI Backend
**File:** [main.py](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/backend/app/main.py#L14)  
**Category:** 🔒 Security / 🐛 Runtime Error  
**Line:** 14

```python
app = FastAPI(title="AgniDrishti ML Service")
```

**Problem:** No `CORSMiddleware` is configured. The frontend at `localhost:5173` (Vite) cannot call this API due to browser CORS enforcement. All `apiFetch()` calls will fail with CORS errors.

**Fix:**
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 🟠 BUG 5 — Redundant/Dead Status Check in `apiFetch`
**File:** [api.js](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/api.js#L46)  
**Category:** 🐛 Logic Error  
**Line:** 46

```js
if (!res.ok && res.status !== 200) {
```

**Problem:** `res.ok` is `true` for status 200–299. So `!res.ok && res.status !== 200` is logically the same as `!res.ok`. The `res.status !== 200` check is dead code and misleading — it suggests 200 might bypass the error handler, but it can't.

**Fix:**
```js
if (!res.ok) {
```

---

## 🟠 BUG 6 — `evaluateIncident` Double-Checks `response.ok` After `apiFetch` Already Checked
**File:** [api.js](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/api.js#L201)  
**Category:** 🐛 Logic Error  
**Line:** 201

```js
if (!response.ok) throw new Error('Incident evaluation failed');
```

**Problem:** `apiFetch` (line 46) already throws if `!res.ok`. This check will never trigger — it's unreachable dead code.

**Fix:** Remove the redundant check:
```js
return await safeJson(response, { error: 'Evaluation failed' });
```

---

## 🟠 BUG 7 — `handleTimeFiltered` Resets Class Filter State
**File:** [MapView.jsx](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/MapView.jsx#L206-L209)  
**Category:** 🐛 Logic Error  
**Lines:** 206–209

```jsx
const handleTimeFiltered = useCallback((filtered) => {
    setTimeFiltered(Array.isArray(filtered) ? filtered : []);
    setClassFiltered(Array.isArray(filtered) ? filtered : []);  // ← BUG
}, []);
```

**Problem:** When the time slider changes, `classFiltered` is reset to the full time-filtered list, **wiping out any active class filter selections**. If the user has toggled off "Gas Flare" in `ClassFilter`, moving the time slider brings all gas flares back.

**Fix:** Remove the `setClassFiltered` line here. Let `ClassFilter`'s `useEffect` re-filter when `timeFiltered` (its `hotspots` prop) changes:
```jsx
const handleTimeFiltered = useCallback((filtered) => {
    setTimeFiltered(Array.isArray(filtered) ? filtered : []);
}, []);
```

---

## 🟠 BUG 8 — Daily Trend Sorting Uses Locale-Formatted Dates
**File:** [Dashboard.jsx](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/Dashboard.jsx#L167-L171)  
**Category:** 🐛 Logic Error  
**Lines:** 167–171

```jsx
const day = new Date(h.acq_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
// ...
const trendData = Object.entries(dailyCounts)
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))  // ← BUG
```

**Problem:** `a[0]` is a locale-formatted string like `"8 Sep"` — `new Date("8 Sep")` is unreliable and produces `NaN` in many browsers/locales, causing the chart data to be unsorted or randomly ordered.

**Fix:** Sort by the original ISO dates, not the formatted strings:
```jsx
// Store both the ISO date and formatted label
for (const h of hotspots) {
    if (!h.acq_date) continue;
    const iso = h.acq_date.split('T')[0];
    const label = new Date(h.acq_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    if (!dailyCounts[iso]) dailyCounts[iso] = { label, count: 0 };
    dailyCounts[iso].count++;
}
const trendData = Object.entries(dailyCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([_, { label, count }]) => ({ date: label, count }));
```

---

## 🟠 BUG 9 — `Scene3D` Crashes on Non-String Geometry
**File:** [Scene3D.jsx](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/Scene3D.jsx#L211)  
**Category:** 🐛 Runtime Error  
**Line:** 211

```jsx
data={JSON.parse(f.geometry)}
```

**Problem:** If `f.geometry` is already a parsed object (not a string), `JSON.parse()` throws a `SyntaxError`, and the catch block silently returns `null` — all facility boundaries disappear. `MapView.jsx` (line 261) already handles this correctly with `typeof f.geometry === 'string' ? JSON.parse(...) : f.geometry`, but `Scene3D` doesn't.

**Fix:**
```jsx
data={typeof f.geometry === 'string' ? JSON.parse(f.geometry) : f.geometry}
```

---

## 🟠 BUG 10 — `handleRegistrationSuccess` Doesn't Set User State
**File:** [App.jsx](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/App.jsx#L185-L189)  
**Category:** 🐛 Logic Error  
**Lines:** 185–189

```jsx
const handleRegistrationSuccess = () => {
    setLandingEntrance(true);
    window.setTimeout(() => setLandingEntrance(false), 4700);
    setViewMode('landing');
};
```

**Problem:** After successful registration, `user` is never set via `setUser()`. The `authed` check (`!!(user && getToken())`) will be `false`, so the user is redirected to landing but can't access any authenticated features — they're stuck in a limbo state.

**Fix:** Either set user state from the registration response, or redirect to login:
```jsx
const handleRegistrationSuccess = (data) => {
    if (data?.token && data?.user) {
        setUser(data.user);
    }
    setLandingEntrance(true);
    window.setTimeout(() => setLandingEntrance(false), 4700);
    setViewMode('landing');
};
```

---

## 🟡 BUG 11 — `FacilityPanel` Crashes When `data.stats` Is Null
**File:** [FacilityPanel.jsx](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/FacilityPanel.jsx#L65-L72)  
**Category:** 🐛 Runtime Error  
**Lines:** 65–72

```jsx
<Stat label="Detections" value={data.stats.detection_count} />
<Stat label="Avg FRP" value={`${Number(data.stats.avg_frp || 0).toFixed(1)} MW`} />
// ...
{data.history.length > 0 ? (
```

**Problem:** If the API returns a facility without `stats` or `history` (e.g. `null`), accessing `data.stats.detection_count` or `data.history.length` throws `TypeError: Cannot read property of null`.

**Fix:** Add defensive checks:
```jsx
<Stat label="Detections" value={data.stats?.detection_count ?? 0} />
// ...
{(data.history?.length || 0) > 0 ? (
```

---

## 🟡 BUG 12 — `IncidentRow` Crashes on Missing `created_at`
**File:** [App.jsx](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/App.jsx#L67)  
**Category:** 🐛 Runtime Error  
**Line:** 67

```jsx
{new Date(inc.created_at).toLocaleString()}
```

**Problem:** If `inc.created_at` is `null` or `undefined`, `new Date(null)` returns Unix epoch (Jan 1, 1970), which shows misleading dates. `new Date(undefined)` returns `Invalid Date`.

**Fix:**
```jsx
{inc.created_at ? new Date(inc.created_at).toLocaleString() : '—'}
```

---

## 🟡 BUG 13 — `Dashboard.refresh` Not Wrapped in `useCallback` — Recreated on Every Render
**File:** [Dashboard.jsx](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/Dashboard.jsx#L108-L125)  
**Category:** ⚡ Performance  
**Lines:** 108–125

```jsx
const refresh = () => { ... };

useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
}, []); // ← `refresh` not in deps, ESLint would warn
```

**Problem:** `refresh` is a plain function redeclared every render. The `useEffect` has an empty dependency array, so it captures the first `refresh` closure — this works by accident but violates React's rules of hooks. If state setters ever change, stale closures could cause bugs.

**Fix:** Wrap `refresh` in `useCallback`:
```jsx
const refresh = useCallback(() => { ... }, []);
useEffect(() => { refresh(); ... }, [refresh]);
```

---

## 🟡 BUG 14 — Backend `/predict` Endpoint Has No Error Handling
**File:** [main.py](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/backend/app/main.py#L74-L101)  
**Category:** 🐛 Error Handling  
**Lines:** 74–101

```python
@app.post("/predict")
def predict(record: HotspotRecord) -> Dict[str, Any]:
    raw = record.model_dump()
    features = engineer.transform_record(raw)
    ml_result = predictor.predict_record(features)
    risk = risk_engine.evaluate(features)
    incident = incident_pipeline.process_record({...})
    return {...}
```

**Problem:** If `predictor.predict_record()` or any other call raises an exception (e.g., model not loaded, NaN in features, shape mismatch), the endpoint returns a raw `500 Internal Server Error` with a Python traceback. No try/except, no structured error response.

**Fix:** Wrap in try/except with proper HTTP error response:
```python
from fastapi import HTTPException

@app.post("/predict")
def predict(record: HotspotRecord) -> Dict[str, Any]:
    try:
        ...
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")
```

---

## 🟡 BUG 15 — `auth-expired` Event Listener Never Cleaned Up
**File:** [api.js](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/api.js#L40)  
**Category:** 🐛 Missing Cleanup  
**Line:** 40

```js
window.dispatchEvent(new CustomEvent('auth-expired'));
```

**Problem:** `apiFetch` dispatches `auth-expired` but no component in the codebase listens for it with `addEventListener`. The feature is dead code — it does nothing. If a listener is eventually added, there's no cleanup mechanism.

**Fix:** Either add a listener in `App.jsx`:
```jsx
useEffect(() => {
    const handler = () => handleLogout();
    window.addEventListener('auth-expired', handler);
    return () => window.removeEventListener('auth-expired', handler);
}, []);
```
Or remove the dispatch if not needed.

---

## 🟡 BUG 16 — `MiniConstellation` Ignores `regionId` Dependency
**File:** [LandingHome.jsx](file:///c:/Users/Ayush%20Pal/Documents/Sih_agnidrishti/frontend/src/LandingHome.jsx#L178-L191)  
**Category:** ⚡ Performance / Logic  
**Lines:** 178–191

```jsx
const points = useMemo(() => {
    const list = [];
    const count = 38;
    for (let i = 0; i < count; i++) {
        // Pure math, no dependency on regionId
    }
    return list;
}, [regionId]); // ← regionId in deps but never used
```

**Problem:** The `regionId` is listed as a dependency but never used in the computation. Every region gets the exact same constellation pattern, yet it recalculates unnecessarily when the region changes.

**Fix:** Either remove `regionId` from deps `[]` (all regions get same pattern), or use `regionId` as a seed for variation:
```jsx
}, []); // If same pattern is intentional
```

---

## Summary Table

| # | Severity | Category | File | Bug |
|---|----------|----------|------|-----|
| 1 | 🔴 CRITICAL | Security | `client.py:16` | Hardcoded API key |
| 2 | 🔴 CRITICAL | Security | `docker-compose.yml:6-8` | Hardcoded DB credentials |
| 3 | 🔴 HIGH | Security | `LoginPage.jsx:21-25` | Test passwords in prod |
| 4 | 🔴 HIGH | Security/Runtime | `main.py:14` | No CORS middleware |
| 5 | 🟠 MEDIUM | Logic | `api.js:46` | Redundant status check |
| 6 | 🟠 MEDIUM | Logic | `api.js:201` | Unreachable code |
| 7 | 🟠 MEDIUM | Logic | `MapView.jsx:208` | Class filter reset on time change |
| 8 | 🟠 MEDIUM | Logic | `Dashboard.jsx:167-171` | Broken date sorting |
| 9 | 🟠 MEDIUM | Runtime | `Scene3D.jsx:211` | Crash on non-string geometry |
| 10 | 🟠 MEDIUM | Logic | `App.jsx:185-189` | Registration doesn't set user |
| 11 | 🟡 LOW | Runtime | `FacilityPanel.jsx:65` | Crash on null stats |
| 12 | 🟡 LOW | Runtime | `App.jsx:67` | Invalid Date display |
| 13 | 🟡 LOW | Performance | `Dashboard.jsx:108` | Stale closure risk |
| 14 | 🟡 LOW | Error Handling | `main.py:74` | No try/except on predict |
| 15 | 🟡 LOW | Dead Code | `api.js:40` | Unused auth-expired event |
| 16 | 🟡 LOW | Performance | `LandingHome.jsx:178` | Unused dep in useMemo |
