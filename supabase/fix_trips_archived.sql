-- Add the archived column to an existing trips table.
-- Safe to run multiple times (IF NOT EXISTS guard).
--
-- Apply with:
--   supabase db push
--   — or —
--   psql -h <host> -U postgres -d postgres -f supabase/fix_trips_archived.sql

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
