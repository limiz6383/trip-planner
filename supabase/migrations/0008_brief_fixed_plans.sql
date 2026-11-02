-- Plans the traveller already has before planning starts (booked tours,
-- reservations, tickets, "museum on Tuesday"). Captured by the consulting chat
-- and treated as fixed anchors when the itinerary is generated or revised.
-- Each entry: { description, date (YYYY-MM-DD|null), start_time, end_time (HH:MM|null) }.
-- Additive: existing briefs get an empty list.

ALTER TABLE trip_briefs
  ADD COLUMN IF NOT EXISTS fixed_plans JSONB NOT NULL DEFAULT '[]';
