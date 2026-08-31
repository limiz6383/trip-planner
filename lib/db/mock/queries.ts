/**
 * Demo-mode implementations of the query helpers.
 *
 * Signature-compatible with lib/db/queries.supabase.ts so that pages, server
 * actions, and route handlers need no changes — lib/db/queries.ts picks the
 * implementation at import time. The `client` argument is accepted and ignored;
 * in demo mode it is an inert sentinel.
 *
 * Anything a demo visitor cannot reach throws a clear "[demo]" error rather
 * than silently returning empty data, so gaps surface loudly during a
 * click-through instead of looking like real product behaviour.
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
  LLMActivity,
  CommunityPost,
  PlaceReview,
  PreferenceProfile,
  ChangeLogEntry,
  TripInvite,
  ActivityType,
  TripPace,
  TripLeg,
  TripFlight,
  TripAccommodation,
  DestinationGuide,
} from "@/lib/types";
import type {
  TripLegInput,
  FlightInput,
  AccommodationInput,
} from "@/lib/db/queries.supabase";
import { DEMO_USER_ID } from "@/lib/mock/flag";
import {
  db,
  newId,
  nowIso,
  clone,
  cloneAll,
  byDateThen,
} from "./store";

/** Marks a path a demo visitor is not expected to reach. */
function unsupported(name: string): never {
  throw new Error(
    `[demo] ${name}() is not available in demo mode. Run without NEXT_PUBLIC_MOCK_MODE to use the real database.`
  );
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

export async function getTripsForUser(
  _client: SupabaseClient,
  { archived = false }: { archived?: boolean } = {}
): Promise<Trip[]> {
  return cloneAll(
    db.trips
      .filter((t) => t.archived === archived)
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
  );
}

export async function getArchivedTripsForUser(
  client: SupabaseClient
): Promise<Trip[]> {
  return getTripsForUser(client, { archived: true });
}

export async function setTripArchived(
  _client: SupabaseClient,
  tripId: string,
  archived: boolean
): Promise<Trip> {
  const trip = db.trips.find((t) => t.trip_id === tripId);
  if (!trip) throw new Error(`[demo] trip not found: ${tripId}`);
  trip.archived = archived;
  trip.updated_at = nowIso();
  return clone(trip);
}

export async function deleteTrip(
  _client: SupabaseClient,
  tripId: string
): Promise<void> {
  const itineraryIds = db.itineraries
    .filter((i) => i.trip_id === tripId)
    .map((i) => i.itinerary_id);
  const dayIds = db.itinerary_days
    .filter((d) => itineraryIds.includes(d.itinerary_id))
    .map((d) => d.day_id);

  db.activities = db.activities.filter((a) => !dayIds.includes(a.day_id));
  db.itinerary_days = db.itinerary_days.filter(
    (d) => !itineraryIds.includes(d.itinerary_id)
  );
  db.itineraries = db.itineraries.filter((i) => i.trip_id !== tripId);
  db.trip_legs = db.trip_legs.filter((l) => l.trip_id !== tripId);
  db.trip_briefs = db.trip_briefs.filter((b) => b.trip_id !== tripId);
  db.bookings = db.bookings.filter((b) => b.trip_id !== tripId);
  db.trip_flights = db.trip_flights.filter((f) => f.trip_id !== tripId);
  db.trip_accommodations = db.trip_accommodations.filter(
    (a) => a.trip_id !== tripId
  );
  db.change_log = db.change_log.filter((c) => c.trip_id !== tripId);
  db.trips = db.trips.filter((t) => t.trip_id !== tripId);
}

export async function getTripById(
  _client: SupabaseClient,
  tripId: string
): Promise<Trip | null> {
  const trip = db.trips.find((t) => t.trip_id === tripId);
  return trip ? clone(trip) : null;
}

export async function createTrip(
  _client: SupabaseClient,
  input: Pick<
    Trip,
    "title" | "destination" | "start_date" | "end_date" | "owner_id"
  >
): Promise<Trip> {
  const trip: Trip = {
    trip_id: newId(),
    owner_id: input.owner_id || DEMO_USER_ID,
    title: input.title,
    destination: input.destination,
    start_date: input.start_date,
    end_date: input.end_date,
    status: "planned",
    archived: false,
    destination_guide: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.trips.push(trip);
  return clone(trip);
}

export async function getCollaboratorsForTrip(
  _client: SupabaseClient,
  _tripId: string
): Promise<TripCollaborator[]> {
  return [];
}

// ---------------------------------------------------------------------------
// Briefs / bookings
// ---------------------------------------------------------------------------

export async function getTripBrief(
  _client: SupabaseClient,
  tripId: string
): Promise<TripBrief | null> {
  const brief = db.trip_briefs.find((b) => b.trip_id === tripId);
  return brief ? clone(brief) : null;
}

export async function upsertTripBrief(
  _client: SupabaseClient,
  tripId: string,
  input: Omit<TripBrief, "brief_id" | "trip_id" | "created_at" | "updated_at">
): Promise<TripBrief> {
  const existing = db.trip_briefs.find((b) => b.trip_id === tripId);
  if (existing) {
    Object.assign(existing, input, { updated_at: nowIso() });
    return clone(existing);
  }
  const brief: TripBrief = {
    brief_id: newId(),
    trip_id: tripId,
    ...input,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.trip_briefs.push(brief);
  return clone(brief);
}

export async function getBookingForTrip(
  _client: SupabaseClient,
  tripId: string
): Promise<Booking | null> {
  const booking = db.bookings.find((b) => b.trip_id === tripId);
  return booking ? clone(booking) : null;
}

export async function upsertBooking(
  _client: SupabaseClient,
  tripId: string,
  input: Partial<
    Omit<Booking, "booking_id" | "trip_id" | "created_at" | "updated_at">
  >
): Promise<Booking> {
  const existing = db.bookings.find((b) => b.trip_id === tripId);
  if (existing) {
    Object.assign(existing, input, { updated_at: nowIso() });
    return clone(existing);
  }
  const booking: Booking = {
    booking_id: newId(),
    trip_id: tripId,
    flight_arrival_date: null,
    flight_arrival_time: null,
    flight_arrival_airport: null,
    flight_departure_date: null,
    flight_departure_time: null,
    flight_departure_airport: null,
    accommodation_name: null,
    accommodation_neighborhood: null,
    accommodation_lat: null,
    accommodation_lon: null,
    accommodation_check_in: null,
    accommodation_check_out: null,
    ...input,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.bookings.push(booking);
  return clone(booking);
}

// ---------------------------------------------------------------------------
// Itineraries
// ---------------------------------------------------------------------------

export async function getCurrentItinerary(
  _client: SupabaseClient,
  tripId: string
): Promise<Itinerary | null> {
  const found = db.itineraries.find((i) => i.trip_id === tripId && i.is_current);
  return found ? clone(found) : null;
}

export async function getItinerariesForTrip(
  _client: SupabaseClient,
  tripId: string
): Promise<Itinerary[]> {
  return cloneAll(
    db.itineraries
      .filter((i) => i.trip_id === tripId)
      .sort((a, b) => b.version - a.version)
  );
}

export async function getDaysForItinerary(
  _client: SupabaseClient,
  itineraryId: string
): Promise<ItineraryDay[]> {
  return cloneAll(
    db.itinerary_days
      .filter((d) => d.itinerary_id === itineraryId)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
  );
}

export async function getActivitiesForDay(
  _client: SupabaseClient,
  dayId: string
): Promise<Activity[]> {
  return cloneAll(
    byDateThen(
      db.activities.filter((a) => a.day_id === dayId),
      (a) => a.start_time,
      (a) => a.sort_order
    )
  );
}

export async function getActivityById(
  _client: SupabaseClient,
  activityId: string
): Promise<Activity | null> {
  const found = db.activities.find((a) => a.activity_id === activityId);
  return found ? clone(found) : null;
}

export async function getDayById(
  _client: SupabaseClient,
  dayId: string
): Promise<ItineraryDay | null> {
  const found = db.itinerary_days.find((d) => d.day_id === dayId);
  return found ? clone(found) : null;
}

export async function getCurrentItineraryHydrated(
  client: SupabaseClient,
  tripId: string
): Promise<
  | (Itinerary & { days: (ItineraryDay & { activities: Activity[] })[] })
  | null
> {
  const itinerary = await getCurrentItinerary(client, tripId);
  if (!itinerary) return null;

  const legs = await getLegsForTrip(client, tripId);
  const cityByLeg = new Map(legs.map((l) => [l.leg_id, l.city]));

  const days = await getDaysForItinerary(client, itinerary.itinerary_id);
  const hydratedDays = await Promise.all(
    days.map(async (day) => ({
      ...day,
      activities: await getActivitiesForDay(client, day.day_id),
      city: day.leg_id ? cityByLeg.get(day.leg_id) ?? null : null,
    }))
  );

  return { ...itinerary, days: hydratedDays };
}

/**
 * Persists a generated itinerary as a new current version.
 *
 * Simpler than the Postgres version because there are no relational inserts —
 * the object graph is built directly. Day→leg assignment mirrors the real
 * query: a day belongs to the leg whose date range covers it.
 */
export async function createItineraryFromLLMOutput(
  _client: SupabaseClient,
  tripId: string,
  llmItinerary: LLMItinerary
): Promise<Itinerary & { days: (ItineraryDay & { activities: Activity[] })[] }> {
  for (const prior of db.itineraries.filter((i) => i.trip_id === tripId)) {
    prior.is_current = false;
  }

  const version =
    db.itineraries
      .filter((i) => i.trip_id === tripId)
      .reduce((max, i) => Math.max(max, i.version), 0) + 1;

  const itinerary: Itinerary = {
    itinerary_id: newId(),
    trip_id: tripId,
    version,
    is_current: true,
    status: "proposed",
    proposed_reason: null,
    total_cost_estimate: llmItinerary.total_cost_estimate ?? null,
    notes: llmItinerary.notes ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.itineraries.push(itinerary);

  const legs = db.trip_legs
    .filter((l) => l.trip_id === tripId)
    .sort((a, b) => a.leg_order - b.leg_order);

  const days: (ItineraryDay & { activities: Activity[] })[] = [];

  for (const llmDay of llmItinerary.days ?? []) {
    // On a boundary date (one leg's departure == the next's arrival) the day
    // belongs to the city being travelled TO, matching the generator.
    const arrivingIndex = legs.findIndex(
      (l, i) => i > 0 && l.arrival_date === llmDay.date
    );
    const leg =
      (arrivingIndex > 0
        ? legs[arrivingIndex]
        : legs.find(
            (l) =>
              llmDay.date >= l.arrival_date && llmDay.date <= l.departure_date
          )) ?? null;

    const day: ItineraryDay = {
      day_id: newId(),
      itinerary_id: itinerary.itinerary_id,
      date: llmDay.date,
      daily_cost: llmDay.daily_cost ?? null,
      locked: llmDay.locked ?? false,
      leg_id: leg?.leg_id ?? null,
      created_at: nowIso(),
    };
    db.itinerary_days.push(day);

    const activities = (llmDay.activities ?? []).map((a, index) =>
      buildActivity(day.day_id, a, index)
    );
    db.activities.push(...activities);

    days.push({ ...clone(day), activities: cloneAll(activities), city: leg?.city ?? null });
  }

  return { ...clone(itinerary), days };
}

function buildActivity(
  dayId: string,
  a: LLMActivity,
  sortOrder: number
): Activity {
  return {
    activity_id: newId(),
    day_id: dayId,
    name: a.name,
    description: a.description ?? null,
    estimated_time_hours: a.estimated_time_hours ?? null,
    estimated_cost_usd: a.estimated_cost_usd ?? null,
    place_name: a.place_name ?? null,
    source_attribution: a.source_attribution ?? null,
    activity_type: a.activity_type ?? null,
    locked: a.locked ?? false,
    start_time: a.start_time ?? null,
    sort_order: sortOrder,
    created_at: nowIso(),
  };
}

export async function updateActivityFromLLMOutput(
  _client: SupabaseClient,
  activityId: string,
  llmActivity: LLMActivity
): Promise<Activity> {
  const activity = db.activities.find((a) => a.activity_id === activityId);
  if (!activity) throw new Error(`[demo] activity not found: ${activityId}`);

  activity.name = llmActivity.name;
  activity.description = llmActivity.description ?? null;
  activity.estimated_time_hours = llmActivity.estimated_time_hours ?? null;
  activity.estimated_cost_usd = llmActivity.estimated_cost_usd ?? null;
  activity.place_name = llmActivity.place_name ?? null;
  activity.source_attribution = llmActivity.source_attribution ?? null;
  activity.activity_type = llmActivity.activity_type ?? null;
  if (llmActivity.start_time) activity.start_time = llmActivity.start_time;

  return clone(activity);
}

export async function replaceDayActivitiesFromLLM(
  _client: SupabaseClient,
  dayId: string,
  llmActivities: LLMActivity[]
): Promise<Activity[]> {
  db.activities = db.activities.filter((a) => a.day_id !== dayId);
  const created = llmActivities.map((a, index) =>
    buildActivity(dayId, a, index)
  );
  db.activities.push(...created);
  return cloneAll(created);
}

// ---------------------------------------------------------------------------
// Legs / flights / accommodations
// ---------------------------------------------------------------------------

export async function getLegsForTrip(
  _client: SupabaseClient,
  tripId: string
): Promise<TripLeg[]> {
  return cloneAll(
    db.trip_legs
      .filter((l) => l.trip_id === tripId)
      .sort((a, b) => a.leg_order - b.leg_order)
  );
}

export async function createTripLegs(
  _client: SupabaseClient,
  tripId: string,
  legs: TripLegInput[]
): Promise<TripLeg[]> {
  const created: TripLeg[] = legs.map((leg, index) => ({
    leg_id: newId(),
    trip_id: tripId,
    city: leg.city,
    arrival_date: leg.arrival_date,
    departure_date: leg.departure_date,
    leg_order: index,
    destination_guide: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));
  db.trip_legs.push(...created);
  return cloneAll(created);
}

export async function setLegDestinationGuide(
  _client: SupabaseClient,
  legId: string,
  guide: DestinationGuide
): Promise<void> {
  const leg = db.trip_legs.find((l) => l.leg_id === legId);
  if (leg) {
    leg.destination_guide = guide;
    leg.updated_at = nowIso();
  }
}

export async function setTripDestinationGuide(
  _client: SupabaseClient,
  tripId: string,
  guide: DestinationGuide
): Promise<void> {
  const trip = db.trips.find((t) => t.trip_id === tripId);
  if (trip) {
    trip.destination_guide = guide;
    trip.updated_at = nowIso();
  }
}

export async function getFlightsForTrip(
  _client: SupabaseClient,
  tripId: string
): Promise<TripFlight[]> {
  return cloneAll(
    db.trip_flights
      .filter((f) => f.trip_id === tripId)
      .sort((a, b) => a.sort_order - b.sort_order)
  );
}

export async function replaceFlightsForTrip(
  _client: SupabaseClient,
  tripId: string,
  flights: FlightInput[]
): Promise<TripFlight[]> {
  db.trip_flights = db.trip_flights.filter((f) => f.trip_id !== tripId);
  const created: TripFlight[] = flights.map((f, index) => ({
    flight_id: newId(),
    trip_id: tripId,
    from_airport: f.from_airport || null,
    to_airport: f.to_airport || null,
    depart_date: f.depart_date || null,
    depart_time: f.depart_time || null,
    sort_order: index,
    created_at: nowIso(),
  }));
  db.trip_flights.push(...created);
  return cloneAll(created);
}

export async function getAccommodationsForTrip(
  _client: SupabaseClient,
  tripId: string
): Promise<TripAccommodation[]> {
  return cloneAll(
    db.trip_accommodations
      .filter((a) => a.trip_id === tripId)
      .sort((a, b) => a.sort_order - b.sort_order)
  );
}

export async function replaceAccommodationsForTrip(
  _client: SupabaseClient,
  tripId: string,
  stays: AccommodationInput[]
): Promise<TripAccommodation[]> {
  db.trip_accommodations = db.trip_accommodations.filter(
    (a) => a.trip_id !== tripId
  );
  const created: TripAccommodation[] = stays.map((s, index) => ({
    accommodation_id: newId(),
    trip_id: tripId,
    name: s.name || null,
    neighborhood: s.neighborhood || null,
    lat: s.lat ?? null,
    lon: s.lon ?? null,
    check_in: s.check_in || null,
    check_out: s.check_out || null,
    sort_order: index,
    created_at: nowIso(),
  }));
  db.trip_accommodations.push(...created);
  return cloneAll(created);
}

// ---------------------------------------------------------------------------
// Community content / reviews
// ---------------------------------------------------------------------------

export async function getCommunityPostsForDestination(
  _client: SupabaseClient,
  destination: string,
  limit = 100
): Promise<CommunityPost[]> {
  const needle = destination.toLowerCase();
  const matches = db.community_posts.filter((p) =>
    p.destination.toLowerCase().includes(needle)
  );
  // The fixture's seed corpus only covers a few cities. Falling back to the
  // whole corpus keeps the retrieval + ranking pipeline exercised for any
  // destination a demo visitor types instead of silently returning nothing.
  const pool = matches.length > 0 ? matches : db.community_posts;
  return cloneAll(pool.slice(0, limit));
}

export async function getReviewsForTrip(
  _client: SupabaseClient,
  tripId: string
): Promise<PlaceReview[]> {
  return cloneAll(db.place_reviews.filter((r) => r.trip_id === tripId));
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export async function getPreferenceProfile(
  _client: SupabaseClient
): Promise<PreferenceProfile | null> {
  const found = db.preference_profiles.find((p) => p.user_id === DEMO_USER_ID);
  return found ? clone(found) : null;
}

export async function upsertPreferenceProfile(
  _client: SupabaseClient,
  userId: string,
  fields: import("@/lib/preferences").ComputedProfile
): Promise<PreferenceProfile> {
  const existing = db.preference_profiles.find((p) => p.user_id === userId);
  if (existing) {
    Object.assign(existing, fields, { updated_at: nowIso() });
    return clone(existing);
  }
  const profile: PreferenceProfile = {
    profile_id: newId(),
    user_id: userId,
    ...fields,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.preference_profiles.push(profile);
  return clone(profile);
}

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

    for (const r of await getReviewsForTrip(client, trip.trip_id)) {
      reviews.push({ activity_type: r.activity_type, rating: r.rating });
    }
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

// ---------------------------------------------------------------------------
// Change log / revisions
// ---------------------------------------------------------------------------

export async function getChangeLogForTrip(
  _client: SupabaseClient,
  tripId: string
): Promise<ChangeLogEntry[]> {
  return cloneAll(
    db.change_log
      .filter((c) => c.trip_id === tripId)
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
  );
}

export async function appendChangeLogEntry(
  _client: SupabaseClient,
  tripId: string,
  actorId: string,
  changeType: ChangeLogEntry["change_type"],
  summary: string,
  before: Record<string, unknown> | null = null,
  after: Record<string, unknown> | null = null,
  metadata: Record<string, unknown> | null = null
): Promise<ChangeLogEntry> {
  const entry: ChangeLogEntry = {
    log_id: newId(),
    trip_id: tripId,
    user_id: actorId || DEMO_USER_ID,
    change_type: changeType,
    summary,
    before_snapshot: before,
    after_snapshot: after,
    metadata,
    created_at: nowIso(),
  };
  db.change_log.push(entry);
  return clone(entry);
}

/**
 * Mirrors the Postgres query exactly: revisions only, oldest first, skipping
 * system cleanups and guide-picker rebuilds, de-duplicated, capped at 20.
 * Divergence here would be invisible to the type checker and would make demo
 * mode behave differently from production.
 */
export async function getRevisionInstructions(
  client: SupabaseClient,
  tripId: string
): Promise<string[]> {
  // getChangeLogForTrip returns newest first; the real query orders ascending.
  const entries = (await getChangeLogForTrip(client, tripId)).reverse();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    if (e.change_type !== "revision") continue;
    const md = e.metadata;
    if (!md || md.kind === "tidy" || md.kind === "picks") continue;
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

// ---------------------------------------------------------------------------
// Not reachable in the demo
// ---------------------------------------------------------------------------

export async function getTripInviteByToken(
  _client: SupabaseClient,
  _token: string
): Promise<TripInvite | null> {
  return unsupported("getTripInviteByToken");
}

// ---------------------------------------------------------------------------
// Direct row edits (manual UI actions: move, retime, lock, edit, delete)
// ---------------------------------------------------------------------------

export async function moveActivityToDay(
  _client: SupabaseClient,
  activityId: string,
  targetDayId: string,
  sortOrder: number
): Promise<Activity> {
  const activity = db.activities.find((a) => a.activity_id === activityId);
  if (!activity) throw new Error(`[demo] activity not found: ${activityId}`);
  activity.day_id = targetDayId;
  activity.sort_order = sortOrder;
  return clone(activity);
}

export async function setActivityStartTime(
  _client: SupabaseClient,
  activityId: string,
  dayId: string,
  startTime: string | null
): Promise<void> {
  const activity = db.activities.find(
    (a) => a.activity_id === activityId && a.day_id === dayId
  );
  // Scoped to the day, matching the real query: an id from another day is a
  // silent no-op rather than an error.
  if (activity) activity.start_time = startTime || null;
}

export async function setDayLocked(
  _client: SupabaseClient,
  dayId: string,
  locked: boolean
): Promise<ItineraryDay> {
  const day = db.itinerary_days.find((d) => d.day_id === dayId);
  if (!day) throw new Error(`[demo] day not found: ${dayId}`);
  day.locked = locked;
  return clone(day);
}

export async function updateActivityFields(
  _client: SupabaseClient,
  activityId: string,
  patch: Partial<Omit<Activity, "activity_id" | "day_id" | "created_at">>
): Promise<Activity> {
  const activity = db.activities.find((a) => a.activity_id === activityId);
  if (!activity) throw new Error(`[demo] activity not found: ${activityId}`);
  Object.assign(activity, patch);
  return clone(activity);
}

export async function deleteActivity(
  _client: SupabaseClient,
  activityId: string
): Promise<void> {
  db.activities = db.activities.filter((a) => a.activity_id !== activityId);
}
