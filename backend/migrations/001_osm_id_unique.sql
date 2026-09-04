-- Run this once against the running DB to apply the UNIQUE constraint
-- that was added to schema.sql for new deployments.
-- Safe to run even if there are no existing rows.

ALTER TABLE facilities ADD CONSTRAINT facilities_osm_id_unique UNIQUE (osm_id);
