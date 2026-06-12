-- Multi-city support: a trip is a sequence of "legs" (city stays).
--
-- A leg = one city with its own date range and order within the trip
-- (e.g. Athens 2026-07-09..07-11, then Santorini 2026-07-11..07-13). Each
-- itinerary day points at the leg (city) it belongs to. trips.destination is
-- kept as a denormalized human label ("Greece: Athens -> Santorini") so
-- existing single-destination reads keep working; legs are the source of truth.
--
-- Additive + backfilled: every existing trip becomes a single leg, so nothing
-- breaks. The per-leg destination_guide supersedes trips.destination_guide.

CREATE TABLE IF NOT EXISTS trip_legs (
  leg_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id           UUID NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  city              TEXT NOT NULL,
  arrival_date      DATE NOT NULL,
  departure_date    DATE NOT NULL,
  leg_order         INTEGER NOT NULL,             -- 0-based sequence within the trip
  destination_guide JSONB,                        -- per-city guide (cached)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, leg_order),
  CHECK (departure_date >= arrival_date)
);

CREATE INDEX IF NOT EXISTS idx_trip_legs_trip_id ON trip_legs(trip_id);

-- Each day belongs to a leg (nullable so pre-existing/unassigned days are fine).
ALTER TABLE itinerary_days
  ADD COLUMN IF NOT EXISTS leg_id UUID REFERENCES trip_legs(leg_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_itinerary_days_leg_id ON itinerary_days(leg_id);

-- updated_at trigger (mirrors the other tables)
DROP TRIGGER IF EXISTS trg_trip_legs_updated_at ON trip_legs;
CREATE TRIGGER trg_trip_legs_updated_at
  BEFORE UPDATE ON trip_legs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS (mirror trip_briefs: members read/write, owner deletes)
ALTER TABLE trip_legs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tl_select ON trip_legs FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY tl_insert ON trip_legs FOR INSERT WITH CHECK (is_trip_member(trip_id));
CREATE POLICY tl_update ON trip_legs FOR UPDATE USING (is_trip_member(trip_id));
CREATE POLICY tl_delete ON trip_legs FOR DELETE USING (
  EXISTS (SELECT 1 FROM trips WHERE trips.trip_id = trip_legs.trip_id AND trips.owner_id = (select auth.uid()))
);

-- ---- Backfill: every existing trip becomes one leg, and its days point at it ----
INSERT INTO trip_legs (trip_id, city, arrival_date, departure_date, leg_order, destination_guide)
SELECT t.trip_id, t.destination, t.start_date, t.end_date, 0, t.destination_guide
FROM trips t
WHERE NOT EXISTS (SELECT 1 FROM trip_legs l WHERE l.trip_id = t.trip_id);

UPDATE itinerary_days d
SET leg_id = l.leg_id
FROM itineraries i
JOIN trip_legs l ON l.trip_id = i.trip_id AND l.leg_order = 0
WHERE d.itinerary_id = i.itinerary_id AND d.leg_id IS NULL;
