-- Optional multi-city logistics: a trip can have MANY flights and MANY stays.
--
-- The single `bookings` row (one flight pair + one accommodation) can't express
-- a multi-city trip's inbound + inter-city + outbound flights, or a lodging per
-- city. These two child tables hold optional, ordered lists — add as many as
-- you like, or none. Additive: existing trips/bookings are untouched.

CREATE TABLE IF NOT EXISTS trip_flights (
  flight_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id       UUID NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  from_airport  TEXT,          -- "JFK — John F Kennedy …" (free text / IATA)
  to_airport    TEXT,
  depart_date   DATE,
  depart_time   TIME,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trip_flights_trip_id ON trip_flights(trip_id);

CREATE TABLE IF NOT EXISTS trip_accommodations (
  accommodation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id          UUID NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  name             TEXT,
  neighborhood     TEXT,        -- area / city (free text from place autocomplete)
  lat              NUMERIC(9, 6),
  lon              NUMERIC(9, 6),
  check_in         DATE,
  check_out        DATE,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trip_accommodations_trip_id ON trip_accommodations(trip_id);

-- RLS (mirror trip_legs: members read/write, owner deletes)
ALTER TABLE trip_flights ENABLE ROW LEVEL SECURITY;
CREATE POLICY tf_select ON trip_flights FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY tf_insert ON trip_flights FOR INSERT WITH CHECK (is_trip_member(trip_id));
CREATE POLICY tf_update ON trip_flights FOR UPDATE USING (is_trip_member(trip_id));
CREATE POLICY tf_delete ON trip_flights FOR DELETE USING (
  EXISTS (SELECT 1 FROM trips WHERE trips.trip_id = trip_flights.trip_id AND trips.owner_id = (select auth.uid()))
);

ALTER TABLE trip_accommodations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ta_select ON trip_accommodations FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY ta_insert ON trip_accommodations FOR INSERT WITH CHECK (is_trip_member(trip_id));
CREATE POLICY ta_update ON trip_accommodations FOR UPDATE USING (is_trip_member(trip_id));
CREATE POLICY ta_delete ON trip_accommodations FOR DELETE USING (
  EXISTS (SELECT 1 FROM trips WHERE trips.trip_id = trip_accommodations.trip_id AND trips.owner_id = (select auth.uid()))
);
