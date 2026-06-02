-- Fix: upsertTripBrief uses ON CONFLICT (trip_id), but trip_briefs had no
-- unique constraint on trip_id, so the upsert errored ("Failed to save trip
-- brief"). Add the unique constraint (also enforces one brief per trip).
ALTER TABLE trip_briefs
  ADD CONSTRAINT trip_briefs_trip_id_key UNIQUE (trip_id);
