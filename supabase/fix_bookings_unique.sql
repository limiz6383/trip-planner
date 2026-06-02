-- Fix: upsertBooking uses ON CONFLICT (trip_id), but bookings had no unique
-- constraint on trip_id, so the upsert errored. Add the unique constraint
-- (also enforces one booking record per trip).
ALTER TABLE bookings
  ADD CONSTRAINT bookings_trip_id_key UNIQUE (trip_id);
