-- =============================================================
-- Trip Planner v1 — Initial Schema
-- File: supabase/migrations/0001_init.sql
--
-- Apply with:
--   supabase db push
--   — or —
--   psql -h <host> -U postgres -d postgres -f supabase/migrations/0001_init.sql
-- =============================================================

-- Enable UUID extension (available by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- TRIPS
-- =============================================================

CREATE TABLE trips (
  trip_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  destination     TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned', 'in_progress', 'completed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trips_owner_id ON trips(owner_id);
CREATE INDEX idx_trips_status   ON trips(status);

-- =============================================================
-- TRIP COLLABORATORS
-- =============================================================

CREATE TABLE trip_collaborators (
  collaborator_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'editor'
                    CHECK (role IN ('editor')),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, user_id)
);

CREATE INDEX idx_trip_collaborators_trip_id ON trip_collaborators(trip_id);
CREATE INDEX idx_trip_collaborators_user_id ON trip_collaborators(user_id);

-- =============================================================
-- TRIP BRIEFS
-- (Structured output of the consulting conversation)
-- =============================================================

CREATE TABLE trip_briefs (
  brief_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id               UUID NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  destination           TEXT NOT NULL,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  daily_budget_usd      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  vibe_keywords         TEXT[]         NOT NULL DEFAULT '{}',
  party_composition     JSONB          NOT NULL DEFAULT '{}',
  -- 0.0 = very local, 1.0 = very touristy
  local_touristy_dial   NUMERIC(3, 2)  NOT NULL DEFAULT 0.5
                          CHECK (local_touristy_dial >= 0.0 AND local_touristy_dial <= 1.0),
  dietary_constraints   TEXT[]         NOT NULL DEFAULT '{}',
  accessibility_needs   TEXT[]         NOT NULL DEFAULT '{}',
  pace                  TEXT           NOT NULL DEFAULT 'moderate'
                          CHECK (pace IN ('relaxed', 'moderate', 'fast')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trip_briefs_trip_id ON trip_briefs(trip_id);

-- =============================================================
-- BOOKINGS
-- (Flight and accommodation anchors for a trip)
-- =============================================================

CREATE TABLE bookings (
  booking_id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id                   UUID NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  flight_arrival_date       DATE,
  flight_arrival_time       TIME,
  flight_departure_date     DATE,
  flight_departure_time     TIME,
  accommodation_name        TEXT,
  accommodation_neighborhood TEXT,
  accommodation_lat         NUMERIC(9, 6),
  accommodation_lon         NUMERIC(9, 6),
  accommodation_check_in    DATE,
  accommodation_check_out   DATE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_trip_id ON bookings(trip_id);

-- =============================================================
-- ITINERARIES
-- (Versioned; only one is_current=true per trip at a time)
-- =============================================================

CREATE TABLE itineraries (
  itinerary_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id             UUID NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  version             INTEGER NOT NULL DEFAULT 1,
  is_current          BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'proposed', 'confirmed')),
  proposed_reason     TEXT
                        CHECK (proposed_reason IN ('user_revision', 'booking_replan', 'intrip_adjustment')),
  total_cost_estimate NUMERIC(10, 2),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, version)
);

CREATE INDEX idx_itineraries_trip_id    ON itineraries(trip_id);
CREATE INDEX idx_itineraries_is_current ON itineraries(trip_id, is_current) WHERE is_current = TRUE;

-- =============================================================
-- ITINERARY DAYS
-- =============================================================

CREATE TABLE itinerary_days (
  day_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id    UUID NOT NULL REFERENCES itineraries(itinerary_id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  daily_cost      NUMERIC(10, 2),
  -- When TRUE this day is preserved verbatim during re-planning
  locked          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (itinerary_id, date)
);

CREATE INDEX idx_itinerary_days_itinerary_id ON itinerary_days(itinerary_id);

-- =============================================================
-- ACTIVITIES
-- =============================================================

CREATE TABLE activities (
  activity_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_id                  UUID NOT NULL REFERENCES itinerary_days(day_id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  description             TEXT,
  estimated_time_hours    NUMERIC(4, 2),
  estimated_cost_usd      NUMERIC(10, 2),
  place_name              TEXT,
  source_attribution      TEXT,
  activity_type           TEXT
                            CHECK (activity_type IN (
                              'food', 'culture', 'outdoor', 'shopping',
                              'transport', 'accommodation', 'entertainment', 'other'
                            )),
  -- Individual activity lock: preserved during re-plan even if day is unlocked
  locked                  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_day_id       ON activities(day_id);
CREATE INDEX idx_activities_activity_type ON activities(activity_type);

-- =============================================================
-- COMMUNITY POSTS
-- (Sourced content used for retrieval + ranking)
-- =============================================================

CREATE TABLE community_posts (
  post_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  destination         TEXT NOT NULL,
  title               TEXT NOT NULL,
  source              TEXT,
  author              TEXT NOT NULL,
  author_type         TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (author_type IN ('local', 'tourist', 'blogger', 'unknown')),
  content             TEXT,
  tags                TEXT[]         NOT NULL DEFAULT '{}',
  estimated_cost_usd  NUMERIC(10, 2),
  -- 0.0 = very touristy, 1.0 = very local
  locality_score      NUMERIC(3, 2)  NOT NULL DEFAULT 0.5
                        CHECK (locality_score >= 0.0 AND locality_score <= 1.0),
  place_name          TEXT NOT NULL,
  location_lat        NUMERIC(9, 6),
  location_lon        NUMERIC(9, 6),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_posts_destination  ON community_posts(destination);
CREATE INDEX idx_community_posts_author_type  ON community_posts(author_type);
CREATE INDEX idx_community_posts_locality     ON community_posts(locality_score);

-- =============================================================
-- PLACE REVIEWS
-- (User ratings written during or after a trip)
-- =============================================================

CREATE TABLE place_reviews (
  review_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id     UUID REFERENCES activities(activity_id) ON DELETE SET NULL,
  place_name      TEXT NOT NULL,
  activity_type   TEXT
                    CHECK (activity_type IN (
                      'food', 'culture', 'outdoor', 'shopping',
                      'transport', 'accommodation', 'entertainment', 'other'
                    )),
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  notes           TEXT,
  review_type     TEXT NOT NULL
                    CHECK (review_type IN ('in_trip', 'post_trip')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_place_reviews_trip_id     ON place_reviews(trip_id);
CREATE INDEX idx_place_reviews_user_id     ON place_reviews(user_id);
CREATE INDEX idx_place_reviews_activity_id ON place_reviews(activity_id);

-- =============================================================
-- PREFERENCE PROFILES
-- (One per user; inferred from review history)
-- =============================================================

CREATE TABLE preference_profiles (
  profile_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  liked_activity_types    TEXT[]        NOT NULL DEFAULT '{}',
  disliked_activity_types TEXT[]        NOT NULL DEFAULT '{}',
  price_sensitivity       TEXT
                            CHECK (price_sensitivity IN ('low', 'mid', 'high')),
  travel_pace             TEXT
                            CHECK (travel_pace IN ('relaxed', 'moderate', 'fast')),
  -- 0.0 = local-leaning, 1.0 = touristy (inferred from review patterns)
  locality_preference     NUMERIC(3, 2) NOT NULL DEFAULT 0.5
                            CHECK (locality_preference >= 0.0 AND locality_preference <= 1.0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- CHANGE LOG
-- (Audit trail for all itinerary mutations)
-- =============================================================

CREATE TABLE change_log (
  log_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id          UUID NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_type      TEXT NOT NULL
                     CHECK (change_type IN (
                       'consulting_plan', 'manual_edit', 'revision',
                       'booking_replan', 'intrip_adjustment', 'collaborator_edit'
                     )),
  summary          TEXT NOT NULL,
  before_snapshot  JSONB,
  after_snapshot   JSONB,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_change_log_trip_id ON change_log(trip_id);
CREATE INDEX idx_change_log_user_id ON change_log(user_id);

-- =============================================================
-- TRIP INVITES
-- (Token-based invite links for trip collaboration)
-- =============================================================

CREATE TABLE trip_invites (
  invite_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  invite_used_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at         TIMESTAMPTZ
);

CREATE INDEX idx_trip_invites_trip_id ON trip_invites(trip_id);
CREATE INDEX idx_trip_invites_token   ON trip_invites(token);

-- =============================================================
-- UPDATED_AT TRIGGERS
-- Automatically keep updated_at current on mutation.
-- =============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_trips_updated_at
  BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_trip_briefs_updated_at
  BEFORE UPDATE ON trip_briefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_itineraries_updated_at
  BEFORE UPDATE ON itineraries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_preference_profiles_updated_at
  BEFORE UPDATE ON preference_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================
-- ROW-LEVEL SECURITY
-- Users can only access trips they own or collaborate on.
-- community_posts are world-readable (no auth required for reads).
-- =============================================================

ALTER TABLE trips              ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_briefs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_days     ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_reviews      ENABLE ROW LEVEL SECURITY;
ALTER TABLE preference_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_invites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts    ENABLE ROW LEVEL SECURITY;

-- Helper: check whether the calling user is a member (owner OR accepted collaborator) of a trip
CREATE OR REPLACE FUNCTION is_trip_member(p_trip_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM trips WHERE trip_id = p_trip_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM trip_collaborators
    WHERE trip_id = p_trip_id
      AND user_id = auth.uid()
      AND accepted_at IS NOT NULL
  );
$$;

-- ---- trips ----
CREATE POLICY trips_select ON trips FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY trips_insert ON trips FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY trips_update ON trips FOR UPDATE USING (is_trip_member(trip_id));
CREATE POLICY trips_delete ON trips FOR DELETE USING (owner_id = auth.uid());

-- ---- trip_collaborators ----
CREATE POLICY tc_select ON trip_collaborators FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY tc_insert ON trip_collaborators FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM trips WHERE trip_id = trip_collaborators.trip_id AND owner_id = auth.uid())
);
CREATE POLICY tc_update ON trip_collaborators FOR UPDATE USING (
  -- Only the invited user can accept their own invite (set accepted_at)
  user_id = auth.uid()
);
CREATE POLICY tc_delete ON trip_collaborators FOR DELETE USING (
  EXISTS (SELECT 1 FROM trips WHERE trip_id = trip_collaborators.trip_id AND owner_id = auth.uid())
);

-- ---- trip_briefs ----
CREATE POLICY tb_select ON trip_briefs FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY tb_insert ON trip_briefs FOR INSERT WITH CHECK (is_trip_member(trip_id));
CREATE POLICY tb_update ON trip_briefs FOR UPDATE USING (is_trip_member(trip_id));
CREATE POLICY tb_delete ON trip_briefs FOR DELETE USING (
  EXISTS (SELECT 1 FROM trips WHERE trip_id = trip_briefs.trip_id AND owner_id = auth.uid())
);

-- ---- bookings ----
CREATE POLICY bookings_select ON bookings FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY bookings_insert ON bookings FOR INSERT WITH CHECK (is_trip_member(trip_id));
CREATE POLICY bookings_update ON bookings FOR UPDATE USING (is_trip_member(trip_id));
CREATE POLICY bookings_delete ON bookings FOR DELETE USING (
  EXISTS (SELECT 1 FROM trips WHERE trip_id = bookings.trip_id AND owner_id = auth.uid())
);

-- ---- itineraries ----
CREATE POLICY itin_select ON itineraries FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY itin_insert ON itineraries FOR INSERT WITH CHECK (is_trip_member(trip_id));
CREATE POLICY itin_update ON itineraries FOR UPDATE USING (is_trip_member(trip_id));
CREATE POLICY itin_delete ON itineraries FOR DELETE USING (
  EXISTS (SELECT 1 FROM trips WHERE trip_id = itineraries.trip_id AND owner_id = auth.uid())
);

-- ---- itinerary_days ----
CREATE POLICY days_select ON itinerary_days FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM itineraries i
    WHERE i.itinerary_id = itinerary_days.itinerary_id
      AND is_trip_member(i.trip_id)
  )
);
CREATE POLICY days_insert ON itinerary_days FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM itineraries i
    WHERE i.itinerary_id = itinerary_days.itinerary_id
      AND is_trip_member(i.trip_id)
  )
);
CREATE POLICY days_update ON itinerary_days FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM itineraries i
    WHERE i.itinerary_id = itinerary_days.itinerary_id
      AND is_trip_member(i.trip_id)
  )
);
CREATE POLICY days_delete ON itinerary_days FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM itineraries i
    WHERE i.itinerary_id = itinerary_days.itinerary_id
      AND is_trip_member(i.trip_id)
  )
);

-- ---- activities ----
CREATE POLICY act_select ON activities FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM itinerary_days d
    JOIN itineraries i ON i.itinerary_id = d.itinerary_id
    WHERE d.day_id = activities.day_id
      AND is_trip_member(i.trip_id)
  )
);
CREATE POLICY act_insert ON activities FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM itinerary_days d
    JOIN itineraries i ON i.itinerary_id = d.itinerary_id
    WHERE d.day_id = activities.day_id
      AND is_trip_member(i.trip_id)
  )
);
CREATE POLICY act_update ON activities FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM itinerary_days d
    JOIN itineraries i ON i.itinerary_id = d.itinerary_id
    WHERE d.day_id = activities.day_id
      AND is_trip_member(i.trip_id)
  )
);
CREATE POLICY act_delete ON activities FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM itinerary_days d
    JOIN itineraries i ON i.itinerary_id = d.itinerary_id
    WHERE d.day_id = activities.day_id
      AND is_trip_member(i.trip_id)
  )
);

-- ---- place_reviews ----
CREATE POLICY pr_select ON place_reviews FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY pr_insert ON place_reviews FOR INSERT WITH CHECK (
  is_trip_member(trip_id) AND user_id = auth.uid()
);
CREATE POLICY pr_update ON place_reviews FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY pr_delete ON place_reviews FOR DELETE USING (user_id = auth.uid());

-- ---- preference_profiles ----
CREATE POLICY pp_select ON preference_profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY pp_insert ON preference_profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY pp_update ON preference_profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY pp_delete ON preference_profiles FOR DELETE USING (user_id = auth.uid());

-- ---- change_log ----
CREATE POLICY cl_select ON change_log FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY cl_insert ON change_log FOR INSERT WITH CHECK (
  is_trip_member(trip_id) AND user_id = auth.uid()
);
-- change_log is append-only: no UPDATE or DELETE policies

-- ---- trip_invites ----
CREATE POLICY ti_select ON trip_invites FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY ti_insert ON trip_invites FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM trips WHERE trip_id = trip_invites.trip_id AND owner_id = auth.uid())
);
CREATE POLICY ti_update ON trip_invites FOR UPDATE USING (
  -- Only the invited user can mark an invite as used
  invite_used_by = auth.uid()
);
CREATE POLICY ti_delete ON trip_invites FOR DELETE USING (
  EXISTS (SELECT 1 FROM trips WHERE trip_id = trip_invites.trip_id AND owner_id = auth.uid())
);

-- ---- community_posts (world-readable, write-protected) ----
CREATE POLICY cp_select ON community_posts FOR SELECT USING (TRUE);
-- Only service-role writes are allowed (no user-facing insert policy)
