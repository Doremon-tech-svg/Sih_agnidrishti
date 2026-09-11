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