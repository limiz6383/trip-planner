-- Real fix: the trips SELECT policy used is_trip_member(trip_id), a STABLE
-- SECURITY DEFINER function that re-queries the trips table. On INSERT ...
-- RETURNING (what the app does via .insert().select()), that function can't see
-- the just-inserted row in its snapshot, returns false, and the row is rejected
-- ("new row violates row-level security policy").
--
-- Fix: evaluate owner_id directly on the row (no self-query of trips), and check
-- collaborators against the separate trip_collaborators table. This makes the
-- policy correct for the RETURNING row.

DROP POLICY IF EXISTS trips_select ON trips;
CREATE POLICY trips_select ON trips
  FOR SELECT
  USING (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM trip_collaborators tc
      WHERE tc.trip_id = trips.trip_id
        AND tc.user_id = (select auth.uid())
        AND tc.accepted_at IS NOT NULL
    )
  );

-- Keep the insert policy in canonical form (idempotent).
DROP POLICY IF EXISTS trips_insert ON trips;
CREATE POLICY trips_insert ON trips
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);
