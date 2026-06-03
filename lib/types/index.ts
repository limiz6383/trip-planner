// ============================================================
// Core domain types — mirrors the Postgres schema exactly.
// All date fields from the DB come back as ISO strings; we keep
// them as string here so no coercion is needed at the boundary.
// ============================================================

// ----- Users -----

export interface User {
  user_id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

// ----- Trips -----

export type TripStatus = "planned" | "in_progress" | "completed";

export interface Trip {
  trip_id: string;
  owner_id: string;
  title: string;
  destination: string;
  start_date: string; // ISO date string YYYY-MM-DD
  end_date: string;
  status: TripStatus;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

// ----- Trip Collaborators -----

export type CollaboratorRole = "editor";

export interface TripCollaborator {
  collaborator_id: string;
  trip_id: string;
  user_id: string;
  role: CollaboratorRole;
  invited_at: string;
  accepted_at: string | null;
  created_at: string;
}

// ----- Trip Briefs -----

export interface PartyComposition {
  adults: number;
  children?: number;
  infants?: number;
}

export type TripPace = "relaxed" | "moderate" | "fast";

export interface TripBrief {
  brief_id: string;
  trip_id: string;
  destination: string;
  start_date: string;
  end_date: string;
  daily_budget_usd: number;
  vibe_keywords: string[];
  party_composition: PartyComposition;
  /** 0.0 = very local, 1.0 = very touristy */
  local_touristy_dial: number;
  dietary_constraints: string[];
  accessibility_needs: string[];
  pace: TripPace;
  created_at: string;
  updated_at: string;
}

// ----- Bookings -----

export interface Booking {
  booking_id: string;
  trip_id: string;
  flight_arrival_date: string | null;
  flight_arrival_time: string | null;
  flight_arrival_airport: string | null;
  flight_departure_date: string | null;
  flight_departure_time: string | null;
  flight_departure_airport: string | null;
  accommodation_name: string | null;
  accommodation_neighborhood: string | null;
  accommodation_lat: number | null;
  accommodation_lon: number | null;
  accommodation_check_in: string | null;
  accommodation_check_out: string | null;
  created_at: string;
  updated_at: string;
}

// ----- Itineraries -----

export type ItineraryStatus = "draft" | "proposed" | "confirmed";

export type ProposedReason =
  | "user_revision"
  | "booking_replan"
  | "intrip_adjustment"
  | null;

export interface Itinerary {
  itinerary_id: string;
  trip_id: string;
  version: number;
  is_current: boolean;
  status: ItineraryStatus;
  proposed_reason: ProposedReason;
  total_cost_estimate: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Populated via joins when fetching a full itinerary
  days?: ItineraryDay[];
}

export interface ItineraryDay {
  day_id: string;
  itinerary_id: string;
  date: string; // ISO date YYYY-MM-DD
  daily_cost: number | null;
  locked: boolean;
  created_at: string;
  // Populated via joins
  activities?: Activity[];
}

export type ActivityType =
  | "food"
  | "culture"
  | "outdoor"
  | "shopping"
  | "transport"
  | "accommodation"
  | "entertainment"
  | "other";

export interface Activity {
  activity_id: string;
  day_id: string;
  name: string;
  description: string | null;
  estimated_time_hours: number | null;
  estimated_cost_usd: number | null;
  place_name: string | null;
  source_attribution: string | null;
  activity_type: ActivityType | null;
  locked: boolean;
  created_at: string;
}

// ----- Community Posts -----

export type AuthorType = "local" | "tourist" | "blogger" | "unknown";

export interface CommunityPost {
  post_id: string;
  destination: string;
  title: string;
  source: string | null;
  author: string;
  author_type: AuthorType;
  content: string | null;
  tags: string[];
  estimated_cost_usd: number | null;
  /** 0.0 = very touristy, 1.0 = very local */
  locality_score: number;
  place_name: string;
  location_lat: number | null;
  location_lon: number | null;
  created_at: string;
}

// ----- Place Reviews -----

export type ReviewType = "in_trip" | "post_trip";

export interface PlaceReview {
  review_id: string;
  trip_id: string;
  user_id: string;
  activity_id: string | null;
  place_name: string;
  activity_type: ActivityType | null;
  /** 1–5 */
  rating: number;
  notes: string | null;
  review_type: ReviewType;
  created_at: string;
}

// ----- Preference Profiles -----

export type PriceSensitivity = "low" | "mid" | "high";

export interface PreferenceProfile {
  profile_id: string;
  user_id: string;
  liked_activity_types: ActivityType[];
  disliked_activity_types: ActivityType[];
  price_sensitivity: PriceSensitivity | null;
  travel_pace: TripPace | null;
  /** Inferred from reviews: 0.0 = local-leaning, 1.0 = touristy */
  locality_preference: number;
  created_at: string;
  updated_at: string;
}

// ----- Change Log -----

export type ChangeType =
  | "consulting_plan"
  | "manual_edit"
  | "revision"
  | "booking_replan"
  | "intrip_adjustment"
  | "collaborator_edit";

export interface ChangeLogEntry {
  log_id: string;
  trip_id: string;
  user_id: string;
  change_type: ChangeType;
  summary: string;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ----- Trip Invites -----

export interface TripInvite {
  invite_id: string;
  trip_id: string;
  token: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  invite_used_by: string | null;
  used_at: string | null;
}

// ----- Planner / LLM contracts -----

/**
 * Constraint passed to the planner when re-planning during an active trip.
 * Locked days and activities must be preserved verbatim in the new itinerary.
 */
export interface LockedDaysConstraint {
  /** ISO date strings for days that cannot be changed */
  lockedDates: string[];
  /** activity_ids that must be preserved unchanged */
  lockedActivityIds: string[];
  /** ISO date string — today's date on the device */
  currentDate: string;
}

/**
 * Raw LLM output shape for a single activity, before it is persisted.
 */
export interface LLMActivity {
  name: string;
  description: string;
  estimated_time_hours: number;
  estimated_cost_usd: number;
  place_name: string;
  source_attribution: string;
  activity_type: ActivityType;
}

/**
 * Raw LLM output shape for a single day.
 */
export interface LLMItineraryDay {
  date: string;
  activities: LLMActivity[];
  daily_cost: number;
}

/**
 * Full itinerary as returned by the LLM before persistence.
 */
export interface LLMItinerary {
  destination: string;
  start_date: string;
  end_date: string;
  days: LLMItineraryDay[];
  total_cost_estimate: number;
  notes: string;
}

/**
 * Raw LLM output for a consulting session (TripBrief fields without DB metadata).
 */
export interface LLMTripBrief {
  destination: string;
  start_date: string;
  end_date: string;
  daily_budget_usd: number;
  vibe_keywords: string[];
  party_composition: PartyComposition;
  local_touristy_dial: number;
  dietary_constraints: string[];
  accessibility_needs: string[];
  pace: TripPace;
}
