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
  CommunityPost,
  PlaceReview,
  PreferenceProfile,
  ChangeLogEntry,
  TripInvite,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

/**
 * Returns all trips the authenticated user owns or collaborates on.
 * RLS handles the visibility filter.
 */
export async function getTripsForUser(
  client: SupabaseClient
): Promise<Trip[]> {
  const { data, error } = await client
    .from("trips")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as Trip[]) ?? [];
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
  input: Pick<Trip, "title" | "destination" | "start_date" | "end_date">
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
// TODO (M1+): createItineraryFromLLMOutput, upsertPreferenceProfile,
//             createPlaceReview, appendChangeLogEntry,
//             createTripInvite, acceptTripInvite
// ---------------------------------------------------------------------------
