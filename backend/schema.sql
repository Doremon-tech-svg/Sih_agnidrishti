CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE facilities (
  id SERIAL PRIMARY KEY,
  name TEXT,
  type TEXT,               -- refinery, power_plant, mine, lng, etc
  osm_id TEXT UNIQUE,
  geom GEOMETRY(Polygon, 4326),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE hotspots (
  id SERIAL PRIMARY KEY,
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