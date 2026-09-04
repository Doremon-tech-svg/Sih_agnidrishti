-- Migration 003 — Add anomaly detection columns to hotspots
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS frp_zscore    double precision DEFAULT 0.0;
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS anomaly_score double precision DEFAULT 0.0;
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS is_anomaly    boolean          DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_hotspots_facility ON hotspots(facility_id);
