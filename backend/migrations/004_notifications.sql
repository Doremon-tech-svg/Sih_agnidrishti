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
