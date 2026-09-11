ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS source_event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS hotspots_source_event_id_idx
  ON hotspots (source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hotspots_acq_date_idx ON hotspots (acq_date DESC);
CREATE INDEX IF NOT EXISTS hotspots_classification_idx ON hotspots (classification);