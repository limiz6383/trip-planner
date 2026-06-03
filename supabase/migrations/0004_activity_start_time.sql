-- Add a clock start time to activities.
--
-- Activities had a duration (estimated_time_hours) and an order (sort_order)
-- but no time of day, so the plan couldn't be a real schedule. start_time turns
-- each day into an ordered timeline: the model seeds realistic times, the day is
-- read ordered by start_time (untimed activities last), and editing an
-- activity's time or duration cascades the rest of the day forward.
--
-- "HH:MM(:SS)"; nullable (untimed activities and pre-existing rows stay null).
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS start_time TIME;
