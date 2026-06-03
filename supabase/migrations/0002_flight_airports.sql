-- Add arrival/departure airport to bookings.
--
-- A destination city often has multiple nearby airports (e.g. NYC = JFK/LGA/EWR,
-- Santa Fe = SAF vs ABQ ~1h away), and which one you actually use materially
-- changes airport-to-accommodation transit time on day 1 / the last day. Capture
-- the airport so itinerary generation can reason about real transit instead of a
-- generic guess.
--
-- Stored as free text (airport name or code) — the booking form captures it via
-- the same place autocomplete used for accommodation, but only the label is
-- persisted. Both columns are nullable; airports remain optional.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS flight_arrival_airport   TEXT,
  ADD COLUMN IF NOT EXISTS flight_departure_airport TEXT;
