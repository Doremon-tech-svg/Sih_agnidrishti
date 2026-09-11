-- Auto-generated Supabase Initialization Script
CREATE EXTENSION IF NOT EXISTS postgis;



-- ===================================
-- Source: backend/schema.sql
-- ===================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE facilities (
  id SERIAL PRIMARY KEY,
  name TEXT,
  type TEXT,               -- refinery, power_plant, mine, lng, etc
  osm_id TEXT,
  geom GEOMETRY(Polygon, 4326),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE hotspots (
  id SERIAL PRIMARY KEY,
  source_event_id TEXT UNIQUE,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  geom GEOMETRY(Point, 4326),
  satellite TEXT,
  acq_date TIMESTAMPTZ,
  brightness_ti4 DOUBLE PRECISION,
  frp DOUBLE PRECISION,
  confidence TEXT,
  classification TEXT,        -- filled by ML team later
  class_confidence DOUBLE PRECISION,
  risk_score DOUBLE PRECISION,
  facility_id INTEGER REFERENCES facilities(id),
  explanation TEXT,           -- human-readable "why"
  raw JSONB,                  -- room for ML team to dump anything extra
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incidents (
  id SERIAL PRIMARY KEY,
  hotspot_id INTEGER REFERENCES hotspots(id),
  agent1 JSONB,
  agent2 JSONB,
  agent3 JSONB,
  status TEXT,                -- FLAGGED, DEBUNKED, VALIDATED
  threat_priority TEXT,       -- LOW/MODERATE/HIGH/CRITICAL
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER REFERENCES incidents(id),
  tier INTEGER,                -- 1-4
  message TEXT,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX hotspots_geom_idx ON hotspots USING GIST (geom);
CREATE INDEX facilities_geom_idx ON facilities USING GIST (geom);
CREATE INDEX hotspots_acq_date_idx ON hotspots (acq_date DESC);
CREATE INDEX hotspots_classification_idx ON hotspots (classification);

-- ===================================
-- Source: backend/migrations/002_auth.sql
-- ===================================

-- Auth schema for AgniDrishti government application
-- Run AFTER schema.sql (adds users + sessions tables)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  designation   TEXT,                          -- e.g. "Senior Fire Officer, Gujarat"
  department    TEXT,                          -- e.g. "Forest Dept", "GSDMA"
  role          TEXT NOT NULL DEFAULT 'VIEWER', -- ADMIN | ANALYST | VIEWER
  is_approved   BOOLEAN NOT NULL DEFAULT FALSE, -- Admin must approve new accounts
  created_at    TIMESTAMPTZ DEFAULT now(),
  last_login    TIMESTAMPTZ
);

-- Initial admin account (password: Admin@2026  — change immediately)
-- NOTE: the previous hash here did not actually correspond to 'Admin@2026'
-- (verified with bcrypt.compareSync), which made the seeded admin account
-- unable to log in on a fresh install. Regenerated with bcryptjs, cost 12.
INSERT INTO users (email, password_hash, full_name, designation, department, role, is_approved)
VALUES (
  'admin@agnidrishti.gov.in',
  '$2b$12$3phFYhCIiO8wdxVYCrNx/e/gNv5pEitNOhPuLcpqcrRaukEaVaIfG',  -- bcrypt of 'Admin@2026'
  'System Administrator',
  'IT Administrator',
  'ISRO / NIC',
  'ADMIN',
  TRUE
) ON CONFLICT (email) DO NOTHING;

-- Role permissions reference (informational comment)
-- ADMIN   → full access, can approve users, run ML, view all data
-- ANALYST → can run ML pipeline, view all data, cannot manage users
-- VIEWER  → read-only access to map, dashboard, alerts (default for new signups)


-- ===================================
-- Source: backend/migrations/003_anomaly_cols.sql
-- ===================================

-- Migration 003 — Add anomaly detection columns to hotspots
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS frp_zscore    double precision DEFAULT 0.0;
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS anomaly_score double precision DEFAULT 0.0;
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS is_anomaly    boolean          DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_hotspots_facility ON hotspots(facility_id);


-- ===================================
-- Source: backend/migrations/004_notifications.sql
-- ===================================

-- Add user location columns, subscriptions, alerts and notification logs

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS work_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS work_lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS work_geom geometry(Point,4326);

-- Populate work_geom when lat/lon provided (future upserts set it)

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'email' | 'sms' | 'push'
  value TEXT NOT NULL, -- email address, phone number, push endpoint JSON
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  hotspot_id INTEGER REFERENCES hotspots(id),
  event_time TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'PENDING', -- PENDING | CONFIRMED | DISPATCHED | CANCELLED
  admin_id INTEGER REFERENCES users(id), -- who confirmed
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  channel TEXT, -- email|sms|push
  to_addr TEXT,
  status TEXT DEFAULT 'QUEUED', -- QUEUED | SENT | FAILED
  detail TEXT,
  sent_at TIMESTAMPTZ
);

-- Index for spatial lookups on users
CREATE INDEX IF NOT EXISTS idx_users_work_geom ON users USING GIST(work_geom);


-- ===================================
-- Source: backend/migrations/004_pipeline_v2.sql
-- ===================================

-- Migration 004: pipeline v2 — districts, alerts rewrite, notifications, push, facility/user cols

-- facilities: district/state + osm_id uniqueness (needed for /bulk upsert)
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS state TEXT;
DO $$ BEGIN
  ALTER TABLE facilities ADD CONSTRAINT facilities_osm_id_unique UNIQUE (osm_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- users: fields required by alertService/notifyService + SUPER_ADMIN role
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS facility_id INTEGER REFERENCES facilities(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_lat DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_lon DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_geom GEOMETRY(Point,4326);
ALTER TABLE users ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS state TEXT;
CREATE INDEX IF NOT EXISTS idx_users_work_geom ON users USING GIST(work_geom);
-- role stored as free TEXT (002_auth.sql), no CHECK constraint to extend — SUPER_ADMIN already usable.

-- hotspots: district/state target of reverseGeocode.js
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS state TEXT;
-- frp_zscore / anomaly_score / is_anomaly already added by 003_anomaly_cols.sql
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS agent2_status TEXT;
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS gas_analysis JSONB;

-- alerts: drop old (notify.js / generateIncidents.js) shape, recreate to match alertService.js
DROP TABLE IF EXISTS alerts CASCADE;
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  hotspot_id INTEGER REFERENCES hotspots(id),
  status TEXT DEFAULT 'PENDING',        -- PENDING, CONFIRMED, DISPATCHED, REJECTED
  priority TEXT,                        -- LOW/MODERATE/HIGH/CRITICAL
  district TEXT,
  payload JSONB,
  ml_result JSONB,
  agent2_result JSONB,
  admin_id INTEGER REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_status   ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_district ON alerts(district);
CREATE INDEX IF NOT EXISTS idx_alerts_priority ON alerts(priority);

-- notifications: alert_id now points at the rebuilt alerts table
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  channel TEXT,             -- email, sms, push
  to_addr TEXT,
  status TEXT DEFAULT 'QUEUED', -- SENT, FAILED, QUEUED
  detail TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifs_alert_id ON notifications(alert_id);
CREATE INDEX IF NOT EXISTS idx_notifs_user_id  ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifs_status   ON notifications(status);

-- push_subscriptions (referenced by auth.js and notifyService.js)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

-- india_districts (seeded once by scripts/seedDistricts.js, used by reverseGeocode.js)
CREATE TABLE IF NOT EXISTS india_districts (
  id SERIAL PRIMARY KEY,
  name TEXT,
  state TEXT,
  geom GEOMETRY(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS india_districts_geom_idx ON india_districts USING GIST (geom);

-- ===================================
-- Source: backend/migrations/005_roles_facilities_alerts.sql
-- ===================================

-- Migration 005: Extended user roles, facility linkage, push subscriptions, districts
-- AgniDrishti v2 — full alert + notification system
-- Run: psql $DATABASE_URL -f migrations/005_roles_facilities_alerts.sql

-- ── 1. Extend facilities table ──────────────────────────────────────────
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS state    TEXT,
  ADD COLUMN IF NOT EXISTS lat      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lon      DOUBLE PRECISION;

-- ── 2. Extend users table ────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS facility_id INTEGER REFERENCES facilities(id),
  ADD COLUMN IF NOT EXISTS district    TEXT,
  ADD COLUMN IF NOT EXISTS state       TEXT,
  ADD COLUMN IF NOT EXISTS phone       TEXT,
  ADD COLUMN IF NOT EXISTS role        TEXT NOT NULL DEFAULT 'VIEWER';

-- Add SUPER_ADMIN role support (one global account)
-- Roles: SUPER_ADMIN > ADMIN (per district) > ANALYST (per facility) > VIEWER

-- ── 3. Push subscriptions table (Web Push VAPID) ─────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT,
  auth_key     TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- ── 4. Extend alerts table ───────────────────────────────────────────────
-- alerts already created in 004, extend it
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS district       TEXT,
  ADD COLUMN IF NOT EXISTS incident_id    INTEGER REFERENCES incidents(id),
  ADD COLUMN IF NOT EXISTS ml_result      JSONB,
  ADD COLUMN IF NOT EXISTS agent2_result  JSONB,
  ADD COLUMN IF NOT EXISTS priority       TEXT DEFAULT 'LOW', -- LOW/MODERATE/HIGH/CRITICAL
  ADD COLUMN IF NOT EXISTS confirmed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatched_at  TIMESTAMPTZ;

-- ── 5. Extend notifications table ────────────────────────────────────────
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- ── 6. Alert feedback table (operator feedback loop) ─────────────────────
CREATE TABLE IF NOT EXISTS alert_feedback (
  id                     SERIAL PRIMARY KEY,
  alert_id               INTEGER REFERENCES alerts(id),
  hotspot_id             INTEGER REFERENCES hotspots(id),
  operator_id            INTEGER REFERENCES users(id),
  feedback               TEXT,    -- 'confirmed' | 'false_alarm' | 'uncertain'
  confidence_in_feedback FLOAT,
  comments               TEXT,
  created_at             TIMESTAMPTZ DEFAULT now()
);

-- ── 7. Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_district    ON users(district);
CREATE INDEX IF NOT EXISTS idx_users_facility_id ON users(facility_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status     ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_district   ON alerts(district);
CREATE INDEX IF NOT EXISTS idx_alerts_priority   ON alerts(priority);
CREATE INDEX IF NOT EXISTS idx_notifs_alert_id   ON notifications(alert_id);
CREATE INDEX IF NOT EXISTS idx_notifs_user_id    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifs_status     ON notifications(status);

-- ── 8. SUPER_ADMIN account ───────────────────────────────────────────────
-- Password: SuperAdmin@2026  (bcrypt hash generated with cost 12)
INSERT INTO users (email, password_hash, full_name, designation, department, role, is_approved)
VALUES (
  'superadmin@agnidrishti.gov.in',
  '$2b$12$3phFYhCIiO8wdxVYCrNx/e/gNv5pEitNOhPuLcpqcrRaukEaVaIfG',
  'Super Administrator',
  'National Operations Head',
  'AgniDrishti / NIC',
  'SUPER_ADMIN',
  TRUE
) ON CONFLICT (email) DO NOTHING;


-- ===================================
-- Source: backend/migrations/rescore_hotspots.sql
-- ===================================

UPDATE hotspots
SET risk_score = ROUND(LEAST(100, GREATEST(0,
  (
    CASE classification
      WHEN 'Industrial Fire / Accident' THEN 0.90
      WHEN 'Wildfire / Forest Fire'     THEN 0.60
      WHEN 'Industrial Thermal Source'  THEN 0.35
      WHEN 'Mining Thermal Activity'    THEN 0.30
      WHEN 'Gas Flare'                  THEN 0.25
      WHEN 'Agricultural Burning'       THEN 0.20
      ELSE 0.05
    END * 0.45
    + LEAST(1.0, LN(1.0 + COALESCE(frp, 0)) / LN(51.0)) * 0.25
    + COALESCE(class_confidence, 0.5) * 0.20
    + 0.075
  ) * 100
)::numeric, 1)
WHERE classification IS NOT NULL
  AND classification <> 'False Positive';

SELECT
  COUNT(*) FILTER (WHERE risk_score >= 76) AS critical,
  COUNT(*) FILTER (WHERE risk_score >= 56 AND risk_score < 76) AS high,
  COUNT(*) FILTER (WHERE risk_score >= 31 AND risk_score < 56) AS moderate,
  COUNT(*) FILTER (WHERE risk_score < 31)  AS low,
  ROUND(MIN(risk_score)::numeric,1)        AS min_score,
  ROUND(MAX(risk_score)::numeric,1)        AS max_score
FROM hotspots
WHERE classification IS NOT NULL;
