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
INSERT INTO users (email, password_hash, full_name, designation, department, role, is_approved)
VALUES (
  'admin@agnidrishti.gov.in',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiWMLGHlUBP5.Ob.gFEtVwXOhTWq',  -- bcrypt of 'Admin@2026'
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
