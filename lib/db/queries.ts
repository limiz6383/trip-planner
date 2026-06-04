/**
 * RLS-safe query helpers.
 *
 * Each function accepts a Supabase client created by createSupabaseServerClient()
 * (which carries the authenticated user session via cookies). RLS policies on
 * the database enforce that users can only read/write their own data — these
 * helpers do NOT need to inject user-id filters manually.
 *
 * Naming convention:
 *   get*     — SELECT helpers (throw on error, return null when not found)
 *   create*  — INSERT helpers (return the created row)
 *   update*  — UPDATE helpers (return the updated row)
 *
 * TODO (M1+): add the remaining helpers as each feature milestone requires them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Trip,
  TripCollaborator,
  TripBrief,
  Booking,
  Itinerary,
  ItineraryDay,
  Activity,
  LLMItinerary,
  CommunityPost,
  PlaceReview,
  PreferenceProfile,
  ChangeLogEntry,
  TripInvite,
  ActivityType,
  TripPace,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

/**
 * Returns trips the authenticated user owns or collaborates on.
 *
 * @param archived - When false (default) returns only active trips.
 *                   When true returns only archived trips.
 *
 * RLS handles the ownership/collaboration visibility filter.
 */
export async function getTripsForUser(
  client: SupabaseClient,
  { archived = false }: { archived?: boolean } = {}
): Promise<Trip[]> {
  const { data, error } = await client
    .from("trips")
    .select("*")
    .eq("archived", archived)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as Trip[]) ?? [];
}

/**
 * Returns archived trips the authenticated user owns or collaborates on.
 * Convenience wrapper around getTripsForUser({ archived: true }).
 */
export async function getArchivedTripsForUser(
  client: SupabaseClient
): Promise<Trip[]> {
  return getTripsForUser(client, { archived: true });
}

/**
 * Sets the archived flag on a trip.
 *
 * RLS trips_update USING is_trip_member(trip_id) — both owner and accepted
 * collaborators may archive/unarchive.
 */
export async function setTripArchived(
  client: SupabaseClient,
  tripId: string,
  archived: boolean
): Promise<Trip> {
  const { data, error } = await client
    .from("trips")
    .update({ archived })
    .eq("trip_id", tripId)
    .select()
    .single();

  if (error) throw error;
  return data as Trip;
}

/**
 * Permanently deletes a trip.
 *
 * RLS trips_delete USING owner_id = auth.uid() — only the trip owner may
 * delete. All child rows cascade via ON DELETE CASCADE on the FK.
 */
export async function deleteTrip(
  client: SupabaseClient,
  tripId: string
): Promise<void> {
  const { error } = await client
    .from("trips")
    .delete()
    .eq("trip_id", tripId);

  if (error) throw error;
}

/**
 * Returns a single trip by ID, or null if not found / not accessible.
 */
export async function getTripById(
  client: SupabaseClient,
  tripId: string
): Promise<Trip | null> {
  const { data, error } = await client
    .from("trips")
    .select("*")
    .eq("trip_id", tripId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw error;
  }
  return data as Trip;
}

/**
 * Creates a new trip owned by the authenticated user.
 */
export async function createTrip(
  client: SupabaseClient,
  input: Pick<Trip, "title" | "destination" | "start_date" | "end_date" | "owner_id">
): Promise<Trip> {
  const { data, error } = await client
    .from("trips")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as Trip;
}

// ---------------------------------------------------------------------------
// Trip Collaborators
// ---------------------------------------------------------------------------

/**
 * Returns all collaborators for a trip.
 */
export async function getCollaboratorsForTrip(
  client: SupabaseClient,
  tripId: string
): Promise<TripCollaborator[]> {
  const { data, error } = await client
    .from("trip_collaborators")
    .select("*")
    .eq("trip_id", tripId)
    .order("invited_at");

  if (error) throw error;
  return (data as TripCollaborator[]) ?? [];
}

// ---------------------------------------------------------------------------
// Trip Briefs
// ---------------------------------------------------------------------------

/**
 * Returns the most recent brief for a trip, or null if none exists.
 */
export async function getTripBrief(
  client: SupabaseClient,
  tripId: string
): Promise<TripBrief | null> {
  const { data, error } = await client
    .from("trip_briefs")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as TripBrief;
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

/**
 * Returns the booking record for a trip, or null if not set.
 */
export async function getBookingForTrip(
  client: SupabaseClient,
  tripId: string
): Promise<Booking | null> {
  const { data, error } = await client
    .from("bookings")
    .select("*")
    .eq("trip_id", tripId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as Booking;
}

// ---------------------------------------------------------------------------
// Itineraries
// ---------------------------------------------------------------------------

/**
 * Returns the current (is_current=true) itinerary for a trip, or null.
 */
export async function getCurrentItinerary(
  client: SupabaseClient,
  tripId: string
): Promise<Itinerary | null> {
  const { data, error } = await client
    .from("itineraries")
    .select("*")
    .eq("trip_id", tripId)
    .eq("is_current", true)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as Itinerary;
}

/**
 * Returns all itineraries for a trip ordered by version ascending.
 */
export async function getItinerariesForTrip(
  client: SupabaseClient,
  tripId: string
): Promise<Itinerary[]> {
  const { data, error } = await client
    .from("itineraries")
    .select("*")
    .eq("trip_id", tripId)
    .order("version");

  if (error) throw error;
  return (data as Itinerary[]) ?? [];
}

// ---------------------------------------------------------------------------
// Itinerary Days + Activities
// ---------------------------------------------------------------------------

/**
 * Returns all days for an itinerary, ordered by date.
 */
export async function getDaysForItinerary(
  client: SupabaseClient,
  itineraryId: string
): Promise<ItineraryDay[]> {
  const { data, error } = await client
    .from("itinerary_days")
    .select("*")
    .eq("itinerary_id", itineraryId)
    .order("date");

  if (error) throw error;
  return (data as ItineraryDay[]) ?? [];
}

/**
 * Returns all activities for a day, ordered by creation time.
 */
export async function getActivitiesForDay(
  client: SupabaseClient,
  dayId: string
): Promise<Activity[]> {
  const { data, error } = await client
    .from("activities")
    .select("*")
    .eq("day_id", dayId)
    // Chronological by clock time; untimed activities fall back to sort_order.
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("sort_order")
    .order("created_at");

  if (error) throw error;
  return (data as Activity[]) ?? [];
}

// ---------------------------------------------------------------------------
// Community Posts
// ---------------------------------------------------------------------------

/**
 * Returns community posts for a destination.
 * Optionally limited by count (defaults to 100 for retrieval pipeline use).
 */
export async function getCommunityPostsForDestination(
  client: SupabaseClient,
  destination: string,
  limit = 100
): Promise<CommunityPost[]> {
  const { data, error } = await client
    .from("community_posts")
    .select("*")
    .eq("destination", destination)
    .order("locality_score", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as CommunityPost[]) ?? [];
}

// ---------------------------------------------------------------------------
// Place Reviews
// ---------------------------------------------------------------------------

/**
 * Returns all place reviews for a trip.
 */
export async function getReviewsForTrip(
  client: SupabaseClient,
  tripId: string
): Promise<PlaceReview[]> {
  const { data, error } = await client
    .from("place_reviews")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at");

  if (error) throw error;
  return (data as PlaceReview[]) ?? [];
}

// ---------------------------------------------------------------------------
// Preference Profiles
// ---------------------------------------------------------------------------

/**
 * Returns the preference profile for the authenticated user, or null.
 */
export async function getPreferenceProfile(
  client: SupabaseClient
): Promise<PreferenceProfile | null> {
  const { data, error } = await client
    .from("preference_profiles")
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as PreferenceProfile;
}

// ---------------------------------------------------------------------------
// Change Log
// ---------------------------------------------------------------------------

/**
 * Returns the change log for a trip, newest first.
 */
export async function getChangeLogForTrip(
  client: SupabaseClient,
  tripId: string
): Promise<ChangeLogEntry[]> {
  const { data, error } = await client
    .from("change_log")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as ChangeLogEntry[]) ?? [];
}

// ---------------------------------------------------------------------------
// Trip Invites
// ---------------------------------------------------------------------------

/**
 * Looks up a trip invite by its token. Returns null if not found or expired.
 */
export async function getTripInviteByToken(
  client: SupabaseClient,
  token: string
): Promise<TripInvite | null> {
  const { data, error } = await client
    .from("trip_invites")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as TripInvite;
}

// ---------------------------------------------------------------------------
// Trip Briefs — upsert
// ---------------------------------------------------------------------------

/**
 * Insert or update the trip_brief row for a given trip.
 *
 * Strategy: trip_briefs has a unique constraint on trip_id (one brief per
 * trip). We attempt an insert; on conflict we update every mutable column.
 * The RLS policy ensures the authenticated user can only write briefs for
 * trips they own or collaborate on.
 *
 * Returns the persisted TripBrief row.
 */
export async function upsertTripBrief(
  client: SupabaseClient,
  tripId: string,
  input: Omit<TripBrief, "brief_id" | "trip_id" | "created_at" | "updated_at">
): Promise<TripBrief> {
  const { data, error } = await client
    .from("trip_briefs")
    .upsert(
      {
        trip_id: tripId,
        destination: input.destination,
        start_date: input.start_date,
        end_date: input.end_date,
        daily_budget_usd: input.daily_budget_usd,
        vibe_keywords: input.vibe_keywords,
        party_composition: input.party_composition,
        local_touristy_dial: input.local_touristy_dial,
        dietary_constraints: input.dietary_constraints,
        accessibility_needs: input.accessibility_needs,
        pace: input.pace,
      },
      {
        onConflict: "trip_id",
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (error) throw error;
  return data as TripBrief;
}

// ---------------------------------------------------------------------------
// Bookings — upsert
// ---------------------------------------------------------------------------

/**
 * Insert or update the booking row for a given trip.
 *
 * Strategy: bookings has a unique constraint on trip_id (one booking per trip).
 * We attempt an insert; on conflict we update every mutable column.
 * The RLS policy ensures the authenticated user can only write bookings for
 * trips they own or collaborate on.
 *
 * All fields are optional/nullable — the user may have partial booking info.
 * Returns the persisted Booking row.
 */
export async function upsertBooking(
  client: SupabaseClient,
  tripId: string,
  input: Partial<Omit<Booking, "booking_id" | "trip_id" | "created_at" | "updated_at">>
): Promise<Booking> {
  const { data, error } = await client
    .from("bookings")
    .upsert(
      {
        trip_id: tripId,
        flight_arrival_date: input.flight_arrival_date ?? null,
        flight_arrival_time: input.flight_arrival_time ?? null,
        flight_arrival_airport: input.flight_arrival_airport ?? null,
        flight_departure_date: input.flight_departure_date ?? null,
        flight_departure_time: input.flight_departure_time ?? null,
        flight_departure_airport: input.flight_departure_airport ?? null,
        accommodation_name: input.accommodation_name ?? null,
        accommodation_neighborhood: input.accommodation_neighborhood ?? null,
        accommodation_lat: input.accommodation_lat ?? null,
        accommodation_lon: input.accommodation_lon ?? null,
        accommodation_check_in: input.accommodation_check_in ?? null,
        accommodation_check_out: input.accommodation_check_out ?? null,
      },
      {
        onConflict: "trip_id",
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (error) throw error;
  return data as Booking;
}

// ---------------------------------------------------------------------------
// Itinerary creation from LLM output
// ---------------------------------------------------------------------------

/**
 * Persists a new itinerary (with versioning), its days, and activities from
 * raw LLM output. Marks the new row as the current itinerary for the trip and
 * clears is_current on any previous versions.
 *
 * All writes are RLS-safe: the server client carries the authenticated session,
 * and the itineraries/itinerary_days/activities RLS policies gate on trip
 * ownership or collaboration.
 *
 * Returns the fully hydrated Itinerary (with days and nested activities).
 */
export async function createItineraryFromLLMOutput(
  client: SupabaseClient,
  tripId: string,
  llmItinerary: LLMItinerary
): Promise<Itinerary & { days: (ItineraryDay & { activities: Activity[] })[] }> {
  // --- 1. Determine the next version number ---
  const existing = await getItinerariesForTrip(client, tripId);
  const nextVersion = existing.length > 0
    ? Math.max(...existing.map((i) => i.version)) + 1
    : 1;

  // --- 2. Clear is_current on previous versions ---
  if (existing.length > 0) {
    const { error: clearError } = await client
      .from("itineraries")
      .update({ is_current: false })
      .eq("trip_id", tripId);
    if (clearError) throw clearError;
  }

  // --- 3. Insert the new itinerary header row ---
  const { data: itineraryRow, error: itineraryError } = await client
    .from("itineraries")
    .insert({
      trip_id: tripId,
      version: nextVersion,
      is_current: true,
      status: "proposed" as const,
      proposed_reason: null,
      total_cost_estimate: llmItinerary.total_cost_estimate ?? null,
      notes: llmItinerary.notes ?? null,
    })
    .select()
    .single();

  if (itineraryError) throw itineraryError;
  const itinerary = itineraryRow as Itinerary;

  // --- 4. Insert days and activities, collecting hydrated results ---
  const hydratedDays: (ItineraryDay & { activities: Activity[] })[] = [];

  for (const llmDay of llmItinerary.days) {
    const { data: dayRow, error: dayError } = await client
      .from("itinerary_days")
      .insert({
        itinerary_id: itinerary.itinerary_id,
        date: llmDay.date,
        daily_cost: llmDay.daily_cost ?? null,
        // Lock state is carried forward by the revision pipeline; defaults to
        // false for fresh generation (where llmDay.locked is undefined).
        locked: llmDay.locked ?? false,
      })
      .select()
      .single();

    if (dayError) throw dayError;
    const day = dayRow as ItineraryDay;

    const hydratedActivities: Activity[] = [];

    if (llmDay.activities && llmDay.activities.length > 0) {
      const activityInserts = llmDay.activities.map((a, index) => ({
        day_id: day.day_id,
        name: a.name,
        description: a.description ?? null,
        start_time: a.start_time || null,
        estimated_time_hours: a.estimated_time_hours ?? null,
        estimated_cost_usd: a.estimated_cost_usd ?? null,
        place_name: a.place_name ?? null,
        source_attribution: a.source_attribution ?? null,
        activity_type: a.activity_type ?? null,
        // Carried forward by the revision pipeline; false for fresh generation.
        locked: a.locked ?? false,
        // Preserve the model's intended chronological order — a batch insert
        // ties created_at, so this is the only reliable ordering key.
        sort_order: index,
      }));

      const { data: activityRows, error: activityError } = await client
        .from("activities")
        .insert(activityInserts)
        .select()
        .order("start_time", { ascending: true, nullsFirst: false })
        .order("sort_order");

      if (activityError) throw activityError;
      hydratedActivities.push(...((activityRows as Activity[]) ?? []));
    }

    hydratedDays.push({ ...day, activities: hydratedActivities });
  }

  return { ...itinerary, days: hydratedDays };
}

// ---------------------------------------------------------------------------
// Change Log — write helpers
// ---------------------------------------------------------------------------

/**
 * Appends a single entry to the change_log table for a trip.
 *
 * RLS-safe: the Supabase client carries the authenticated session and the
 * change_log RLS policies gate on trip ownership/collaboration.
 *
 * @param client  - Authenticated Supabase server client
 * @param tripId  - UUID of the trip
 * @param actorId - Supabase auth user_id of the actor
 * @param changeType - Discriminant matching the ChangeType union
 * @param summary - Human-readable single-sentence description
 * @param before  - Snapshot of affected fields before the change (or null)
 * @param after   - Snapshot of affected fields after the change (or null)
 * @param metadata - Any extra structured metadata (or null)
 */
/**
 * Upserts the user's learned preference profile (one row per user).
 */
export async function upsertPreferenceProfile(
  client: SupabaseClient,
  userId: string,
  fields: import("@/lib/preferences").ComputedProfile
): Promise<PreferenceProfile> {
  const { data, error } = await client
    .from("preference_profiles")
    .upsert(
      {
        user_id: userId,
        liked_activity_types: fields.liked_activity_types,
        disliked_activity_types: fields.disliked_activity_types,
        price_sensitivity: fields.price_sensitivity,
        travel_pace: fields.travel_pace,
        locality_preference: fields.locality_preference,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as PreferenceProfile;
}

/**
 * Learns the user's travel preferences from ALL their past trips — the activity
 * types they pick, their briefs (pace, budget, local/touristy), and any place
 * reviews — then caches the result in preference_profiles. Deterministic (no
 * LLM). Returns the persisted profile.
 */
export async function learnPreferenceProfile(
  client: SupabaseClient,
  userId: string
): Promise<PreferenceProfile> {
  const { computeProfile } = await import("@/lib/preferences");

  const [active, archived] = await Promise.all([
    getTripsForUser(client),
    getArchivedTripsForUser(client),
  ]);
  const trips = [...active, ...archived];

  const activityTypes: (ActivityType | null)[] = [];
  const paces: (TripPace | null)[] = [];
  const budgets: number[] = [];
  const localityDials: number[] = [];
  const reviews: { activity_type: ActivityType | null; rating: number }[] = [];

  for (const trip of trips) {
    const brief = await getTripBrief(client, trip.trip_id);
    if (brief) {
      paces.push(brief.pace);
      if (typeof brief.daily_budget_usd === "number")
        budgets.push(brief.daily_budget_usd);
      if (typeof brief.local_touristy_dial === "number")
        localityDials.push(brief.local_touristy_dial);
    }

    const itinerary = await getCurrentItinerary(client, trip.trip_id);
    if (itinerary) {
      const days = await getDaysForItinerary(client, itinerary.itinerary_id);
      for (const day of days) {
        const acts = await getActivitiesForDay(client, day.day_id);
        for (const a of acts) activityTypes.push(a.activity_type);
      }
    }

    const revs = await getReviewsForTrip(client, trip.trip_id);
    for (const r of revs)
      reviews.push({ activity_type: r.activity_type, rating: r.rating });
  }

  const computed = computeProfile({
    activityTypes,
    paces,
    budgets,
    localityDials,
    reviews,
  });
  return upsertPreferenceProfile(client, userId, computed);
}

/**
 * Caches the generated destination guide on the trip. Returns nothing.
 */
export async function setTripDestinationGuide(
  client: SupabaseClient,
  tripId: string,
  guide: import("@/lib/types").DestinationGuide
): Promise<void> {
  const { error } = await client
    .from("trips")
    .update({ destination_guide: guide })
    .eq("trip_id", tripId);
  if (error) throw error;
}

/**
 * Returns the traveller's prior revision instructions for a trip — the
 * free-text asks they made in earlier whole-itinerary / day / activity
 * revisions — so later revisions can honor them as standing preferences and
 * not silently undo earlier requests.
 *
 * Excludes system-issued revisions (e.g. "Tidy up", tagged metadata.kind
 * "tidy"). De-duplicated, oldest→newest, capped to the most recent 20.
 */
export async function getRevisionInstructions(
  client: SupabaseClient,
  tripId: string
): Promise<string[]> {
  const { data, error } = await client
    .from("change_log")
    .select("metadata, created_at")
    .eq("trip_id", tripId)
    .eq("change_type", "revision")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of (data ?? []) as { metadata: Record<string, unknown> | null }[]) {
    const md = row.metadata;
    if (!md || md.kind === "tidy") continue;
    const instr = md.instruction;
    if (typeof instr === "string" && instr.trim()) {
      const t = instr.trim();
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out.slice(-20);
}

export async function appendChangeLogEntry(
  client: SupabaseClient,
  tripId: string,
  actorId: string,
  changeType: ChangeLogEntry["change_type"],
  summary: string,
  before: Record<string, unknown> | null = null,
  after: Record<string, unknown> | null = null,
  metadata: Record<string, unknown> | null = null
): Promise<ChangeLogEntry> {
  const { data, error } = await client
    .from("change_log")
    .insert({
      trip_id: tripId,
      user_id: actorId,
      change_type: changeType,
      summary,
      before_snapshot: before,
      after_snapshot: after,
      metadata,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ChangeLogEntry;
}

// ---------------------------------------------------------------------------
// Activity — LLM-driven update
// ---------------------------------------------------------------------------

/**
 * Replaces the content fields of an existing activity row with values from a
 * single LLMActivity returned by the revision pipeline. The activity_id and
 * day_id are preserved; locked status is not changed.
 *
 * Returns the updated Activity row.
 */
export async function updateActivityFromLLMOutput(
  client: SupabaseClient,
  activityId: string,
  llmActivity: import("@/lib/types").LLMActivity
): Promise<Activity> {
  const { data, error } = await client
    .from("activities")
    .update({
      name: llmActivity.name,
      description: llmActivity.description ?? null,
      estimated_time_hours: llmActivity.estimated_time_hours ?? null,
      estimated_cost_usd: llmActivity.estimated_cost_usd ?? null,
      place_name: llmActivity.place_name ?? null,
      source_attribution: llmActivity.source_attribution ?? null,
      activity_type: llmActivity.activity_type ?? null,
    })
    .eq("activity_id", activityId)
    .select()
    .single();

  if (error) throw error;
  return data as Activity;
}

/**
 * Replaces ALL activities on a day with a fresh list from the revision
 * pipeline (used by per-day AI revise). Locked activities are expected to be
 * present in `llmActivities` already (re-injected upstream), so deleting and
 * re-inserting preserves them. start_time, sort_order, and locked are carried.
 *
 * Returns the day's activities, ordered by start_time.
 */
export async function replaceDayActivitiesFromLLM(
  client: SupabaseClient,
  dayId: string,
  llmActivities: import("@/lib/types").LLMActivity[]
): Promise<Activity[]> {
  const { error: delError } = await client
    .from("activities")
    .delete()
    .eq("day_id", dayId);
  if (delError) throw delError;

  if (llmActivities.length > 0) {
    const inserts = llmActivities.map((a, index) => ({
      day_id: dayId,
      name: a.name,
      description: a.description ?? null,
      start_time: a.start_time || null,
      estimated_time_hours: a.estimated_time_hours ?? null,
      estimated_cost_usd: a.estimated_cost_usd ?? null,
      place_name: a.place_name ?? null,
      source_attribution: a.source_attribution ?? null,
      activity_type: a.activity_type ?? null,
      locked: a.locked ?? false,
      sort_order: index,
    }));
    const { error: insError } = await client.from("activities").insert(inserts);
    if (insError) throw insError;
  }

  return getActivitiesForDay(client, dayId);
}

/**
 * Returns a single activity by its ID, or null if not found / not accessible.
 */
export async function getActivityById(
  client: SupabaseClient,
  activityId: string
): Promise<Activity | null> {
  const { data, error } = await client
    .from("activities")
    .select("*")
    .eq("activity_id", activityId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as Activity;
}

/**
 * Returns a single itinerary day by its ID, or null if not found / not accessible.
 */
export async function getDayById(
  client: SupabaseClient,
  dayId: string
): Promise<import("@/lib/types").ItineraryDay | null> {
  const { data, error } = await client
    .from("itinerary_days")
    .select("*")
    .eq("day_id", dayId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as import("@/lib/types").ItineraryDay;
}

// ---------------------------------------------------------------------------
// Itinerary — hydration helper
// ---------------------------------------------------------------------------

/**
 * Returns the current itinerary for a trip with days and activities hydrated.
 * Returns null if no current itinerary exists.
 */
export async function getCurrentItineraryHydrated(
  client: SupabaseClient,
  tripId: string
): Promise<
  (import("@/lib/types").Itinerary & {
    days: (import("@/lib/types").ItineraryDay & {
      activities: Activity[];
    })[];
  }) | null
> {
  const itinerary = await getCurrentItinerary(client, tripId);
  if (!itinerary) return null;

  const days = await getDaysForItinerary(client, itinerary.itinerary_id);
  const hydratedDays = await Promise.all(
    days.map(async (day) => {
      const activities = await getActivitiesForDay(client, day.day_id);
      return { ...day, activities };
    })
  );

  return { ...itinerary, days: hydratedDays };
}

// ---------------------------------------------------------------------------
// TODO (M1+): upsertPreferenceProfile, createPlaceReview,
//             createTripInvite, acceptTripInvite
// ---------------------------------------------------------------------------
