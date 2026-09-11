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
