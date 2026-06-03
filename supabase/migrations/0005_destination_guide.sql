-- Cache an LLM-generated destination guide on the trip.
--
-- The itinerary view shows an overview of the destination (what it's known for,
-- the spots people usually hit, must-try foods) so the traveller has a
-- reference for how much of the city's highlights their plan covers. The guide
-- is general city knowledge (not trip-specific), so it's generated once and
-- cached here rather than regenerated on every view.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS destination_guide JSONB;
