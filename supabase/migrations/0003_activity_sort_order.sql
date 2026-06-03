-- Add an explicit ordering column to activities.
--
-- Activities were ordered by created_at, but a day's activities are inserted in
-- a single batch, so Postgres stamps them all with the same NOW() — making
-- ORDER BY created_at non-deterministic. The model's intended chronological
-- order (lunch before an afternoon walk, arrival logistics first on day 1, etc.)
-- was therefore lost on the round-trip.
--
-- sort_order is the activity's position within its day (0-based), set from the
-- generated array order. Existing rows default to 0 and fall back to created_at.
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_activities_day_sort ON activities(day_id, sort_order);
