/**
 * LLM Provider abstraction.
 *
 * All LLM calls are SERVER-SIDE ONLY. This module must never be imported
 * by Client Components (it reads ANTHROPIC_API_KEY at call time).
 *
 * The LLMProvider interface makes the underlying model swappable: drop in
 * a different implementation (OpenAI, Gemini, local Ollama) without touching
 * the planner engine.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LLMItinerary, LLMActivity, LLMTripBrief, TripBrief, Booking, CommunityPost, Activity, DestinationGuide, PreferenceProfile, TripFlight, TripAccommodation } from "@/lib/types";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * A single turn in a consulting conversation.
 */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Parameters for one consulting conversation turn (gathering trip intent).
 */
export interface ConsultingTurnParams {
  /** Full conversation history so far */
  history: ConversationMessage[];
  /** The latest user message to respond to */
  userMessage: string;
  /** Partial trip brief assembled so far (may be empty on first turn) */
  partialBrief: Partial<LLMTripBrief>;
  /**
   * Trip facts already known from the trip row (entered on the create-trip
   * form). The consultant must NEVER re-ask for these.
   */
  knownTrip: {
    destination: string;
    start_date: string;
    end_date: string;
  };
  /**
   * Flights and accommodation details collected before the consulting session.
   * When present the consultant treats them as fixed facts, never asks for them,
   * and factors them into its questions and suggestions (e.g. a late arrival
   * means day 1 is light; lodging neighbourhood anchors recommendations).
   * When null/undefined the consultant behaves as if no logistics are known.
   */
  booking?: Booking | null;
}

/**
 * Response from a consulting turn.
 */
export interface ConsultingTurnResult {
  /** The assistant's response text */
  assistantMessage: string;
  /**
   * Updated partial brief if the model extracted new structured fields.
   * If the brief is complete (all required fields present) the planner
   * engine can proceed to itinerary generation.
   */
  updatedBrief: Partial<LLMTripBrief>;
  /** True when the model signals the brief is fully collected */
  briefComplete: boolean;
}

/**
 * Parameters for itinerary generation.
 */
export interface GenerateItineraryParams {
  brief: TripBrief;
  /** Community posts ranked and filtered by the retrieval pipeline */
  rankedPosts: CommunityPost[];
  /**
   * Dates that are locked and must not be replanned.
   * ISO date strings (YYYY-MM-DD).
   */
  lockedDates?: string[];
  /**
   * Optional booking record for the trip.
   * When present the model uses flight times to bound day-1 and last-day
   * usable hours, and clusters activities near the accommodation location.
   * When null/undefined the model plans full days as if no constraints exist.
   */
  booking?: Booking | null;
  /**
   * Learned travel preferences from the traveller's past trips. Used to gently
   * bias the plan; never overrides the explicit brief for THIS trip.
   */
  learnedPreferences?: PreferenceProfile | null;
  /**
   * Multi-city legs (ordered). When present (>1), the model assigns each day to
   * a city by its date range, emits `city` per day, and plans inter-city
   * transit on transition days. Single-city trips omit this or pass one leg.
   */
  legs?: LegContext[];
  /**
   * Optional multi-city flight list (ordered). When non-empty this is the REAL
   * flight schedule and supersedes the single `booking` arrival/departure rules:
   * the earliest flight bounds day-1's start, the last flight bounds the final
   * day's end, and a flight dated mid-trip is an inter-city transfer the model
   * schedules as a transport activity, splitting that day across the two cities.
   */
  flights?: TripFlight[];
  /**
   * Optional multi-city accommodation list (possibly one per city). When
   * non-empty the model clusters each day's activities near the accommodation
   * whose [check_in, check_out] window covers that day, accounting for
   * check-in/out timing.
   */
  accommodations?: TripAccommodation[];
}

/** A city leg passed to the model for multi-city planning. */
export interface LegContext {
  city: string;
  arrival_date: string;
  departure_date: string;
}

/**
 * Parameters for whole-itinerary revision.
 */
export interface ReviseItineraryParams {
  brief: TripBrief;
  booking?: Booking | null;
  rankedPosts: CommunityPost[];
  /** The current hydrated itinerary expressed as the LLMItinerary shape (no DB ids). */
  currentItinerary: LLMItinerary;
  /** Free-text revision instruction from the user. */
  instruction: string;
  /** Earlier revision asks to keep honoring unless the current one overrides. */
  standingPreferences?: string[];
}

/**
 * Parameters for single-activity revision.
 */
export interface ReviseActivityParams {
  /** The activity being replaced (DB row). */
  activity: Activity;
  /** Free-text instruction from the user. */
  instruction: string;
  brief: TripBrief;
  rankedPosts: CommunityPost[];
  /** ISO date string for the day this activity belongs to. */
  dayDateContext: string;
}

/**
 * Parameters for single-day revision.
 */
export interface ReviseDayParams {
  brief: TripBrief;
  rankedPosts: CommunityPost[];
  /** ISO date (YYYY-MM-DD) of the day being revised. */
  dayDate: string;
  /** The day's current activities expressed as the LLM shape (no DB ids). */
  currentActivities: LLMActivity[];
  /** Free-text revision instruction from the user. */
  instruction: string;
  /** Earlier revision asks to keep honoring unless the current one overrides. */
  standingPreferences?: string[];
  booking?: Booking | null;
}

/**
 * Provider interface — implement this to swap out the underlying model.
 */
export interface LLMProvider {
  /**
   * Handles one turn of the consulting conversation.
   * Gathers trip intent and extracts structured TripBrief fields.
   */
  consultingTurn(params: ConsultingTurnParams): Promise<ConsultingTurnResult>;

  /**
   * Generates a full itinerary from a completed TripBrief + ranked posts.
   */
  generateItinerary(params: GenerateItineraryParams): Promise<LLMItinerary>;

  /**
   * Revises the entire itinerary according to a free-text instruction.
   * Returns the same LLMItinerary shape; caller is responsible for persistence.
   */
  reviseItinerary(params: ReviseItineraryParams): Promise<LLMItinerary>;

  /**
   * Revises a single activity according to a free-text instruction.
   * Returns a single LLMActivity replacement; caller applies it to the DB row.
   */
  reviseActivity(params: ReviseActivityParams): Promise<LLMActivity>;

  /**
   * Revises all activities for a single day according to a free-text
   * instruction. Returns the day's new activity list; caller persists it.
   */
  reviseDay(params: ReviseDayParams): Promise<LLMActivity[]>;

  /**
   * Generates a general overview of a destination (what it's known for, the
   * spots people usually hit, must-try foods). Not trip-specific; cache it.
   */
  generateDestinationGuide(destination: string): Promise<DestinationGuide>;

  /**
   * One conversational turn about an existing itinerary. The model discusses
   * and suggests but does NOT modify the plan — applying changes is a separate
   * revise step. Returns the assistant's reply text.
   */
  discussItinerary(params: DiscussItineraryParams): Promise<string>;
}

/**
 * Parameters for a conversational itinerary-planning turn.
 */
export interface DiscussItineraryParams {
  /** Human-readable summary of the current plan (days, times, activities). */
  itineraryText: string;
  /** Optional destination highlights (spots/foods) for the model to reference. */
  guideText?: string;
  /** The conversation so far. */
  messages: { role: "user" | "assistant"; content: string }[];
}

// ---------------------------------------------------------------------------
// Anthropic implementation
// ---------------------------------------------------------------------------

const MODEL = "claude-opus-4-5";
// Itinerary generation emits a large JSON payload; Opus can take ~30s for that.
// Sonnet is markedly faster and more than capable for structured itineraries.
const ITINERARY_MODEL = "claude-sonnet-4-5";

/** System prompt for the consulting conversation phase */
const CONSULTING_SYSTEM_PROMPT = `You are a knowledgeable travel planning assistant helping a user plan a trip.

IMPORTANT — destination and travel dates are ALREADY KNOWN. You must NEVER ask about them. They will be provided to you at the start of every turn in a context block. Your opening message must naturally reference the destination and the number of days (e.g. "Let's plan your 4-day trip to Tokyo!").

LOGISTICS — If a "Booked logistics" block appears in the context, the user has already provided flight and accommodation details. You must:
- NEVER ask for flight arrival/departure times, accommodation name, neighbourhood, check-in, or check-out — these are already set.
- Treat them as fixed facts and factor them into your questions and suggestions. For example:
  - A late-evening arrival means day 1 will be short — acknowledge this and suggest a light first day.
  - An early departure means the last day ends early — note this when discussing pace.
  - The accommodation neighbourhood is a natural anchor for activity recommendations.
- If no "Booked logistics" block appears, behave as today — do not mention flights or accommodation unless the user raises them.

Your goal is to gather ONLY the following remaining fields through natural conversation (do not gather destination, start_date, end_date, or any logistics already provided):
- Daily budget in USD
- Travel vibe / keywords (e.g. "relaxing", "foodie", "adventure")
- Party composition (number of adults, children, infants)
- Local vs touristy preference (on a scale from 0.0 very local to 1.0 very touristy)
- Dietary constraints (if any)
- Accessibility needs (if any)
- Travel pace (relaxed, moderate, or fast)

Tailor your questions and suggestions to the trip length you are given. For example, a 3-day trip needs a tighter itinerary than a 14-day trip.

Ask one or two questions at a time — keep it conversational.
When you have enough information to fill all fields, respond with a final summary and include a JSON block like:

\`\`\`json
{
  "brief_complete": true,
  "brief": {
    "destination": "...",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "daily_budget_usd": 100,
    "vibe_keywords": ["..."],
    "party_composition": { "adults": 2 },
    "local_touristy_dial": 0.4,
    "dietary_constraints": [],
    "accessibility_needs": [],
    "pace": "moderate"
  }
}
\`\`\`

Always populate destination, start_date, and end_date in the brief JSON from the known trip facts — never leave them blank or ask the user to re-enter them.

If you don't have enough information yet, omit the JSON block and keep asking.`;

/** System prompt for whole-itinerary revision */
const ITINERARY_REVISION_SYSTEM_PROMPT = `You are an expert travel itinerary planner helping a user revise an existing plan.

You will receive:
- The user's trip brief (budget, pace, preferences)
- The current itinerary (day-by-day with activities)
- A revision instruction from the user (e.g. "make it cheaper", "more outdoorsy", "less walking on day 2")
- standing_preferences: things the traveller asked for in EARLIER revisions
- Community-sourced place recommendations

Your job is to apply the instruction to produce a revised itinerary. Rules:
1. Apply the instruction purposefully — change what the user asked to change. When the instruction asks to ADD specific places, dishes, or activities, you MUST include them in the result on suitable days — even if a day is already busy (you may exceed the usual per-day count or replace a lower-priority, non-locked activity). NEVER silently omit something the user explicitly asked to add.
2. STANDING PREFERENCES ARE STICKY. Everything in standing_preferences was explicitly requested earlier and must still hold in your result. Do NOT undo or compromise an earlier request while satisfying the new one — only drop a standing preference if the current instruction directly contradicts it. (e.g. if they earlier asked to add a specific restaurant, keep it when they later say "make it cheaper".)
3. Keep what the user did NOT ask to change where reasonable; preserve good activities that are unaffected by the instruction.
3. LOCKED ITEMS ARE NON-NEGOTIABLE. Any day or activity marked "locked": true in the current itinerary represents a committed plan (e.g. a booking the user cannot move). Reproduce it EXACTLY — do not change, reword, reprice, reorder, or remove it — and plan the rest of the trip around it.
4. Size each day to the traveller's PACE from the brief: relaxed ≈ 3-4, moderate ≈ 4-5, fast ≈ 6-7 activities (default ~4; meals included in the count; never exceed 8) — same policy as the original generation.
5. MEALS: keep breakfast, lunch, and dinner present on every full day (activity_type "food") at realistic times, unless the instruction explicitly changes meals. Arrival/departure days include only meals that fit around the flight.
6. Keep each "description" to ONE short sentence.
7. Maintain the same date range and day count as the original itinerary.
8. Respect the budget and pace from the brief.
9. Prioritise community posts that match the revised intent.
10. List each day's activities in the ORDER the traveller does them, earliest first — the array order IS the schedule. On the arrival day, sequence arrival logistics first (e.g. a meal eaten en route from the airport, then check-in) before activities that need the traveller settled in. Never place a later-in-the-day activity before an earlier one.
11. TIMING: give every activity a "start_time" in 24-hour "HH:MM" format, chronological and consistent with each activity's estimated_time_hours and realistic venue/meal hours.

Respond ONLY with valid JSON matching this exact shape:
{
  "destination": "string",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "total_cost_estimate": 0,
  "notes": "string",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "daily_cost": 0,
      "activities": [
        {
          "name": "string",
          "description": "string",
          "start_time": "HH:MM",
          "estimated_time_hours": 1.5,
          "estimated_cost_usd": 20,
          "place_name": "string",
          "source_attribution": "string or empty",
          "activity_type": "food|culture|outdoor|shopping|transport|accommodation|entertainment|other"
        }
      ]
    }
  ]
}`;

/** System prompt for single-activity revision */
const ACTIVITY_REVISION_SYSTEM_PROMPT = `You are an expert travel planner helping a user swap one activity in their itinerary.

You will receive:
- The current activity to replace
- The user's revision instruction (e.g. "swap for something cheaper", "find a more local option", "different cuisine")
- The trip brief for context (budget, preferences, location)
- The date of the day this activity belongs to
- Community-sourced place recommendations for the destination

Return ONLY a single replacement activity as valid JSON matching this exact shape:
{
  "name": "string",
  "description": "string (one sentence)",
  "estimated_time_hours": 1.5,
  "estimated_cost_usd": 20,
  "place_name": "string",
  "source_attribution": "string or empty",
  "activity_type": "food|culture|outdoor|shopping|transport|accommodation|entertainment|other"
}

No markdown fences, no explanation — just the JSON object.`;

/** System prompt for single-day revision */
const DAY_REVISION_SYSTEM_PROMPT = `You are an expert travel planner revising ONE day of an existing itinerary.

You will receive:
- The trip brief (budget, pace, preferences)
- The date of the day being revised
- The day's current activities (each with start_time, duration, locked flag)
- A revision instruction (e.g. "more outdoorsy", "make the morning cheaper", "add a museum")
- standing_preferences: things the traveller asked for in EARLIER revisions
- Community-sourced place recommendations

Rules:
1. Apply the instruction to THIS day only; keep unaffected activities where reasonable.
2. STANDING PREFERENCES ARE STICKY. Everything in standing_preferences was explicitly requested earlier and must still hold. Do NOT undo or compromise an earlier request while satisfying the new one — only drop one if the current instruction directly contradicts it.
2. LOCKED ITEMS ARE NON-NEGOTIABLE. Any activity with "locked": true must be reproduced EXACTLY (do not change, reorder, reprice, or remove it) and the rest of the day planned around it.
3. Size the day to the traveller's PACE: relaxed ≈ 3-4, moderate ≈ 4-5, fast ≈ 6-7 activities (default ~4; meals count; never exceed 8).
4. Keep breakfast, lunch, and dinner present (activity_type "food") at realistic times unless the instruction explicitly changes meals.
5. Give every activity a "start_time" in 24-hour "HH:MM" format — chronological, consistent with each activity's estimated_time_hours and realistic venue/meal hours.
6. Keep each "description" to ONE short sentence.

Respond ONLY with valid JSON matching this exact shape:
{
  "activities": [
    {
      "name": "string",
      "description": "string",
      "start_time": "HH:MM",
      "estimated_time_hours": 1.5,
      "estimated_cost_usd": 20,
      "place_name": "string",
      "source_attribution": "string or empty",
      "activity_type": "food|culture|outdoor|shopping|transport|accommodation|entertainment|other"
    }
  ]
}`;

/** System prompt for conversational itinerary planning ("discuss, then apply") */
const DISCUSS_SYSTEM_PROMPT = `You are a warm, knowledgeable travel-planning companion helping the traveller refine an EXISTING itinerary by talking it through.

You can see their current plan and (often) a guide to the destination. Your job is to DISCUSS — bounce ideas, suggest specific spots/dishes/timing, flag tradeoffs ("day 2 is already pretty full — want to swap something?"), and help them decide.

Rules:
- Keep replies short and conversational — 2-5 sentences, no headings or lists unless they ask.
- Be specific and grounded in their actual plan and the destination (name real places/dishes).
- DO NOT rewrite the itinerary or output JSON. You are only talking.
- When the traveller has settled on changes, tell them to hit "Apply changes" to update the plan, and briefly recap what will change.`;

/** System prompt for the destination overview/guide */
const DESTINATION_GUIDE_SYSTEM_PROMPT = `You are a seasoned local travel guide. Given a destination, produce a concise overview a traveller can use as a reference for the area's highlights.

Rules:
- "known_for": 2-3 sentences capturing what the destination is famous for and its character.
- "top_spots": 6-9 of the places/experiences most visitors prioritise (landmarks, neighbourhoods, museums, viewpoints, day trips). Use the COMMON, recognisable name for each so it can be matched against an itinerary. One short "why" each.
- "must_try_foods": 5-8 iconic local dishes/drinks/food experiences. One short "why" each.
- Be specific and accurate to THIS destination — no generic filler.

Respond ONLY with valid JSON matching this exact shape:
{
  "destination": "string",
  "known_for": "string",
  "top_spots": [{ "name": "string", "why": "string" }],
  "must_try_foods": [{ "name": "string", "why": "string" }]
}`;

/** System prompt for the itinerary generation phase */
const ITINERARY_SYSTEM_PROMPT = `You are an expert travel itinerary planner.
You will receive a trip brief, a set of community-sourced place recommendations, and optionally a booking record containing flight and accommodation details.

Generate a detailed day-by-day itinerary that:
1. Respects the budget, pace, and preferences in the brief
2. Prioritises places from the community posts, especially those matching the local/touristy dial
3. Produces a realistic schedule with appropriate timing and logical geography
4. Estimates costs for each activity
5. Sizes each day to the traveller's PACE from the brief: relaxed ≈ 3-4 activities, moderate ≈ 4-5, fast ≈ 6-7. Default to about 4 when pace is moderate or unspecified. These counts INCLUDE meals. Never exceed 8 in a day; favor realistic pacing over packing the day.
6. MEALS: every full day MUST include breakfast, lunch, and dinner as activities (activity_type "food") at realistic times (breakfast ~08:00, lunch ~12:30, dinner ~19:00) — meals are part of the per-day count above, not extra. On the arrival day, include only the meals that fall after arrival + transit; on the departure day, only meals before leaving for the airport.
7. Keeps each activity "description" to ONE short sentence (the goal is a fast, scannable plan, not an essay)
8. Lists each day's activities in the ORDER the traveller does them, earliest first — the array order IS the schedule. On the arrival day, sequence arrival logistics first (e.g. a meal eaten en route from the airport, then hotel check-in) before any activity that needs the traveller already settled in. Never place a later-in-the-day activity before an earlier one.
9. TIMING: give every activity a "start_time" in 24-hour "HH:MM" format. Times must be in chronological order, consistent with each activity's estimated_time_hours (so one activity ends before the next begins, leaving brief transit gaps), realistic venue/meal hours, and any flight arrival/departure bounds.

BOOKING CONSTRAINTS — apply these rules when a booking object is provided:

Flight arrival (flight_arrival_date + flight_arrival_time + flight_arrival_airport):
- Day 1 of the trip starts at the arrival time, not at the beginning of the day.
- Subtract realistic transit time from the SPECIFIC arrival airport to the accommodation. When flight_arrival_airport is given, use transit time for that exact airport — nearby airports can differ greatly (e.g. landing at a regional airport in town vs. a major hub 1–2 hours away). When it is not given, assume typical 1–2 hours.
- Schedule only activities that fit in the remaining usable hours. For late arrivals (e.g. 21:00+) day 1 should contain only arrival logistics and dinner/rest — no sightseeing.

Flight departure (flight_departure_date + flight_departure_time + flight_departure_airport):
- The last day ends when the traveller must leave for the airport.
- Allow at least 2–3 hours before departure for transit and check-in, using transit time to the SPECIFIC flight_departure_airport when given (adjust for destination norms).
- For early departures (e.g. before 10:00) the last day may have zero or only one quick activity.

Accommodation location (accommodation_neighborhood, accommodation_lat, accommodation_lon):
- Cluster activities geographically near the accommodation where possible to minimise transit time.
- When the accommodation neighbourhood is known, explicitly note proximity in activity descriptions.
- Account for accommodation check-in time on day 1 (typically 15:00 or as known).

If no booking is provided, or booking fields are null, plan full days from morning to evening as normal — do not invent flight or accommodation constraints.

MULTI-CITY — if a "legs" array is provided, the trip visits multiple cities in order, each with its own date range:
- Assign EVERY day to exactly one city and emit it as "city" on the day object. A day's city is the leg whose [arrival_date, departure_date] contains that day's date.
- On a day where the traveller moves between cities (one leg's departure_date = the next leg's arrival_date), schedule the inter-city transfer (flight/ferry/train as appropriate for the route, e.g. an Athens→Santorini ferry) as the day's first activity (activity_type "transport"), subtract its duration + transfer time from that day's usable hours, and place that day's remaining activities in the ARRIVING city.
- Source each day's activities from the community_posts whose "destination" matches that day's city, and cluster them within that city. Never put one city's sights on another city's day.
- Respect each leg's dates exactly; do not move a city's days outside its range.

MULTI-CITY FLIGHTS — if a "flights" array is provided (each: from_airport, to_airport, depart_date, depart_time, sort_order), it is the REAL flight schedule and SUPERSEDES the single "booking" arrival/departure rules above:
- The EARLIEST flight (by depart_date/depart_time) is the inbound flight: its arrival bounds the START of day 1. Subtract realistic transit from to_airport to the first accommodation, and schedule only activities that fit the remaining usable hours (late arrivals = arrival logistics + dinner/rest only).
- The LAST flight is the outbound flight: the final day ends when the traveller must leave for from_airport. Allow 2-3 hours before depart_time for transit + check-in; early departures leave the last day with zero or one quick activity.
- A flight whose depart_date falls MID-TRIP is an INTER-CITY TRANSFER. Schedule it as a transport activity (activity_type "transport") on that day at its depart_time, and SPLIT that day's activities around it: activities in the DEPARTING city (near from_airport) before the flight, activities in the ARRIVING city (near to_airport) after arrival + transit. Subtract the flight + transfer time from that day's usable hours.
- Use depart_time when present; if a flight has no time, assume typical 1-2 hour transit and reasonable hours.
- When "flights" is provided, IGNORE the single booking's flight_arrival_*/flight_departure_* fields — the flight list is authoritative.

MULTI-CITY ACCOMMODATIONS — if an "accommodations" array is provided (each: name, neighborhood, lat, lon, check_in, check_out, sort_order), there may be one per city:
- For each day, find the accommodation whose [check_in, check_out] window covers that day and cluster that day's activities geographically near it (use neighborhood/lat/lon); note proximity in descriptions when known.
- Account for check-in timing on the day a stay's window begins (don't schedule a stay-dependent activity before check-in) and check-out timing on the day it ends.
- When "accommodations" is provided, use it instead of the single booking's accommodation_* fields.

If BOTH "flights" and "accommodations" are empty or absent, fall back to the single "booking" behavior described above, unchanged.

LEARNED PREFERENCES — if a "learned_preferences" object is provided (inferred from the traveller's PAST trips), use it as a GENTLE bias, never an override:
- Favor their liked_activity_types and lean away from disliked_activity_types when choosing between otherwise-comparable options.
- Nudge toward their travel_pace, price_sensitivity, and locality_preference (0 local … 1 touristy) where the brief for THIS trip doesn't already specify otherwise.
- The explicit brief for THIS trip ALWAYS wins. Never contradict it, and don't force a preference where it doesn't fit the destination.

Respond ONLY with valid JSON matching this exact shape:
{
  "destination": "string",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "total_cost_estimate": 0,
  "notes": "string",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "daily_cost": 0,
      "activities": [
        {
          "name": "string",
          "description": "string",
          "start_time": "HH:MM",
          "estimated_time_hours": 1.5,
          "estimated_cost_usd": 20,
          "place_name": "string",
          "source_attribution": "string or empty",
          "activity_type": "food|culture|outdoor|shopping|transport|accommodation|entertainment|other"
        }
      ]
    }
  ]
}`;

export class AnthropicProvider implements LLMProvider {
  private getClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local."
      );
    }
    return new Anthropic({ apiKey });
  }

  async consultingTurn(
    params: ConsultingTurnParams
  ): Promise<ConsultingTurnResult> {
    const client = this.getClient();

    // Compute trip length in days so the model can tailor its questions.
    const msPerDay = 1000 * 60 * 60 * 24;
    const startMs = new Date(params.knownTrip.start_date).getTime();
    const endMs = new Date(params.knownTrip.end_date).getTime();
    const tripDays = Math.round((endMs - startMs) / msPerDay) + 1;

    // Build a per-turn context block injected as the first user message so the
    // model always has the known trip facts, the current partial brief, and any
    // pre-collected booking details.
    const bookingLines: string[] = [];
    if (params.booking) {
      const b = params.booking;
      bookingLines.push("", "Booked logistics (fixed — do not ask about these):");
      if (b.flight_arrival_date) {
        bookingLines.push(
          `  Flight arrival: ${b.flight_arrival_date}${b.flight_arrival_time ? " at " + b.flight_arrival_time : ""}${b.flight_arrival_airport ? " into " + b.flight_arrival_airport : ""}`
        );
      }
      if (b.flight_departure_date) {
        bookingLines.push(
          `  Flight departure: ${b.flight_departure_date}${b.flight_departure_time ? " at " + b.flight_departure_time : ""}${b.flight_departure_airport ? " from " + b.flight_departure_airport : ""}`
        );
      }
      if (b.accommodation_name) {
        bookingLines.push(`  Accommodation: ${b.accommodation_name}`);
      }
      if (b.accommodation_neighborhood) {
        bookingLines.push(`  Neighbourhood: ${b.accommodation_neighborhood}`);
      }
      if (b.accommodation_check_in) {
        bookingLines.push(`  Check-in: ${b.accommodation_check_in}`);
      }
      if (b.accommodation_check_out) {
        bookingLines.push(`  Check-out: ${b.accommodation_check_out}`);
      }
    }

    const knownFactsBlock = [
      "--- TRIP CONTEXT (already known — do not ask about these) ---",
      `Destination: ${params.knownTrip.destination}`,
      `Start date: ${params.knownTrip.start_date}`,
      `End date: ${params.knownTrip.end_date}`,
      `Trip length: ${tripDays} day${tripDays !== 1 ? "s" : ""}`,
      ...bookingLines,
      "",
      "Current partial brief (fields gathered so far):",
      JSON.stringify(
        {
          ...params.knownTrip,
          ...params.partialBrief,
        },
        null,
        2
      ),
      "--- END TRIP CONTEXT ---",
    ].join("\n");

    // Prepend the context block to the conversation. If there is no history yet
    // this becomes the sole user turn; otherwise it is injected before the
    // existing history so the model always sees it at position 0.
    const historyMessages: Anthropic.MessageParam[] = params.history.map(
      (m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })
    );

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: knownFactsBlock },
      { role: "assistant", content: "Understood. I have the trip context." },
      ...historyMessages,
      { role: "user", content: params.userMessage },
    ];

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: CONSULTING_SYSTEM_PROMPT,
      messages,
    });

    const assistantMessage =
      response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "";

    // Always seed the brief with the known trip facts so they are never lost.
    const knownFields: Pick<LLMTripBrief, "destination" | "start_date" | "end_date"> = {
      destination: params.knownTrip.destination,
      start_date: params.knownTrip.start_date,
      end_date: params.knownTrip.end_date,
    };

    // Try to extract the structured brief from a ```json block
    let updatedBrief: Partial<LLMTripBrief> = { ...knownFields, ...params.partialBrief };
    let briefComplete = false;

    const jsonMatch = assistantMessage.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as {
          brief_complete?: boolean;
          brief?: Partial<LLMTripBrief>;
        };
        if (parsed.brief) {
          // Merge: known facts take precedence over whatever the LLM emits for
          // destination/dates to prevent the model from accidentally changing them.
          updatedBrief = { ...params.partialBrief, ...parsed.brief, ...knownFields };
        }
        briefComplete = parsed.brief_complete === true;
      } catch {
        // Malformed JSON in the response — keep the partial brief as-is
      }
    }

    return { assistantMessage, updatedBrief, briefComplete };
  }

  async generateItinerary(
    params: GenerateItineraryParams
  ): Promise<LLMItinerary> {
    const client = this.getClient();

    const userContent = JSON.stringify({
      brief: params.brief,
      community_posts: params.rankedPosts.slice(0, 30), // cap context size
      locked_dates: params.lockedDates ?? [],
      // Include booking when present so the model can apply flight/accommodation
      // constraints. Omit the key entirely when there is no booking so the
      // model prompt remains identical to the no-booking path.
      ...(params.booking ? { booking: params.booking } : {}),
      // Learned preferences from past trips (gentle bias only).
      ...(params.learnedPreferences
        ? { learned_preferences: params.learnedPreferences }
        : {}),
      // Multi-city legs (cities + date ranges).
      ...(params.legs && params.legs.length > 1 ? { legs: params.legs } : {}),
      // Multi-city flight list — the real schedule; supersedes single-booking
      // arrival/departure bounds when present. Omitted when empty.
      ...(params.flights && params.flights.length > 0
        ? { flights: params.flights }
        : {}),
      // Multi-city accommodation list — clusters each day near the stay whose
      // window covers it. Omitted when empty.
      ...(params.accommodations && params.accommodations.length > 0
        ? { accommodations: params.accommodations }
        : {}),
    });

    const response = await client.messages.create({
      model: ITINERARY_MODEL,
      max_tokens: 8192,
      system: ITINERARY_SYSTEM_PROMPT,
      // Prefill the assistant turn with "{" so Claude returns raw JSON without a
      // markdown code fence or any preamble.
      messages: [
        { role: "user", content: userContent },
        { role: "assistant", content: "{" },
      ],
    });

    const raw =
      "{" +
      (response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "");

    // Robustly extract the JSON object: strip any markdown fences, then fall
    // back to slicing between the first "{" and the last "}".
    let jsonStr = raw.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) jsonStr = fence[1].trim();
    if (!jsonStr.startsWith("{")) {
      const s = jsonStr.indexOf("{");
      const e = jsonStr.lastIndexOf("}");
      if (s !== -1 && e !== -1 && e > s) jsonStr = jsonStr.slice(s, e + 1);
    }

    let itinerary: LLMItinerary;
    try {
      itinerary = JSON.parse(jsonStr) as LLMItinerary;
    } catch (err) {
      throw new Error(
        `LLM returned invalid JSON for itinerary. Raw response:\n${raw}\nParse error: ${err}`
      );
    }

    // Hard cap: the model tends to overshoot the per-day limit even when the
    // prompt asks for 3-4. Enforce it so the plan stays concise and scannable.
    const MAX_ACTIVITIES_PER_DAY = 8;
    if (Array.isArray(itinerary.days)) {
      for (const day of itinerary.days) {
        if (
          Array.isArray(day.activities) &&
          day.activities.length > MAX_ACTIVITIES_PER_DAY
        ) {
          day.activities = day.activities.slice(0, MAX_ACTIVITIES_PER_DAY);
        }
      }
    }

    return itinerary;
  }
  async reviseItinerary(
    params: ReviseItineraryParams
  ): Promise<LLMItinerary> {
    const client = this.getClient();

    const userContent = JSON.stringify({
      brief: params.brief,
      current_itinerary: params.currentItinerary,
      revision_instruction: params.instruction,
      standing_preferences: params.standingPreferences ?? [],
      community_posts: params.rankedPosts.slice(0, 30),
      ...(params.booking ? { booking: params.booking } : {}),
    });

    const response = await client.messages.create({
      model: ITINERARY_MODEL,
      max_tokens: 8192,
      system: ITINERARY_REVISION_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userContent },
        { role: "assistant", content: "{" },
      ],
    });

    const raw =
      "{" +
      (response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "");

    let jsonStr = raw.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) jsonStr = fence[1].trim();
    if (!jsonStr.startsWith("{")) {
      const s = jsonStr.indexOf("{");
      const e = jsonStr.lastIndexOf("}");
      if (s !== -1 && e !== -1 && e > s) jsonStr = jsonStr.slice(s, e + 1);
    }

    let itinerary: LLMItinerary;
    try {
      itinerary = JSON.parse(jsonStr) as LLMItinerary;
    } catch (err) {
      throw new Error(
        `LLM returned invalid JSON for itinerary revision. Raw response:\n${raw}\nParse error: ${err}`
      );
    }

    const MAX_ACTIVITIES_PER_DAY = 8;
    if (Array.isArray(itinerary.days)) {
      for (const day of itinerary.days) {
        if (
          Array.isArray(day.activities) &&
          day.activities.length > MAX_ACTIVITIES_PER_DAY
        ) {
          day.activities = day.activities.slice(0, MAX_ACTIVITIES_PER_DAY);
        }
      }
    }

    return itinerary;
  }

  async reviseActivity(
    params: ReviseActivityParams
  ): Promise<LLMActivity> {
    const client = this.getClient();

    const userContent = JSON.stringify({
      current_activity: {
        name: params.activity.name,
        description: params.activity.description,
        estimated_time_hours: params.activity.estimated_time_hours,
        estimated_cost_usd: params.activity.estimated_cost_usd,
        place_name: params.activity.place_name,
        activity_type: params.activity.activity_type,
      },
      revision_instruction: params.instruction,
      day_date: params.dayDateContext,
      brief: params.brief,
      community_posts: params.rankedPosts.slice(0, 20),
    });

    const response = await client.messages.create({
      model: ITINERARY_MODEL,
      max_tokens: 512,
      system: ACTIVITY_REVISION_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userContent },
        { role: "assistant", content: "{" },
      ],
    });

    const raw =
      "{" +
      (response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "");

    let jsonStr = raw.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) jsonStr = fence[1].trim();
    if (!jsonStr.startsWith("{")) {
      const s = jsonStr.indexOf("{");
      const e = jsonStr.lastIndexOf("}");
      if (s !== -1 && e !== -1 && e > s) jsonStr = jsonStr.slice(s, e + 1);
    }

    let activity: LLMActivity;
    try {
      activity = JSON.parse(jsonStr) as LLMActivity;
    } catch (err) {
      throw new Error(
        `LLM returned invalid JSON for activity revision. Raw response:\n${raw}\nParse error: ${err}`
      );
    }

    return activity;
  }

  async reviseDay(params: ReviseDayParams): Promise<LLMActivity[]> {
    const client = this.getClient();

    const userContent = JSON.stringify({
      brief: params.brief,
      day_date: params.dayDate,
      current_activities: params.currentActivities,
      revision_instruction: params.instruction,
      standing_preferences: params.standingPreferences ?? [],
      community_posts: params.rankedPosts.slice(0, 20),
      ...(params.booking ? { booking: params.booking } : {}),
    });

    const response = await client.messages.create({
      model: ITINERARY_MODEL,
      max_tokens: 2048,
      system: DAY_REVISION_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userContent },
        { role: "assistant", content: "{" },
      ],
    });

    const raw =
      "{" +
      (response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "");

    let jsonStr = raw.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) jsonStr = fence[1].trim();
    if (!jsonStr.startsWith("{")) {
      const s = jsonStr.indexOf("{");
      const e = jsonStr.lastIndexOf("}");
      if (s !== -1 && e !== -1 && e > s) jsonStr = jsonStr.slice(s, e + 1);
    }

    let parsed: { activities?: LLMActivity[] };
    try {
      parsed = JSON.parse(jsonStr) as { activities?: LLMActivity[] };
    } catch (err) {
      throw new Error(
        `LLM returned invalid JSON for day revision. Raw response:\n${raw}\nParse error: ${err}`
      );
    }

    const activities = Array.isArray(parsed.activities) ? parsed.activities : [];
    return activities.slice(0, 8); // safety ceiling; pace drives the real count
  }

  async generateDestinationGuide(destination: string): Promise<DestinationGuide> {
    const client = this.getClient();

    const response = await client.messages.create({
      model: ITINERARY_MODEL,
      max_tokens: 1500,
      system: DESTINATION_GUIDE_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Destination: ${destination}` },
        { role: "assistant", content: "{" },
      ],
    });

    const raw =
      "{" +
      (response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "");

    let jsonStr = raw.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) jsonStr = fence[1].trim();
    if (!jsonStr.startsWith("{")) {
      const s = jsonStr.indexOf("{");
      const e = jsonStr.lastIndexOf("}");
      if (s !== -1 && e !== -1 && e > s) jsonStr = jsonStr.slice(s, e + 1);
    }

    let guide: DestinationGuide;
    try {
      guide = JSON.parse(jsonStr) as DestinationGuide;
    } catch (err) {
      throw new Error(
        `LLM returned invalid JSON for destination guide. Raw response:\n${raw}\nParse error: ${err}`
      );
    }

    return {
      destination: guide.destination || destination,
      known_for: guide.known_for ?? "",
      top_spots: Array.isArray(guide.top_spots) ? guide.top_spots : [],
      must_try_foods: Array.isArray(guide.must_try_foods)
        ? guide.must_try_foods
        : [],
    };
  }

  async discussItinerary(params: DiscussItineraryParams): Promise<string> {
    const client = this.getClient();

    const context = [
      "--- CURRENT ITINERARY ---",
      params.itineraryText,
      ...(params.guideText
        ? ["", "--- DESTINATION HIGHLIGHTS ---", params.guideText]
        : []),
    ].join("\n");

    const response = await client.messages.create({
      model: ITINERARY_MODEL,
      max_tokens: 700,
      system: `${DISCUSS_SYSTEM_PROMPT}\n\n${context}`,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
  }
}

/**
 * Default provider singleton.
 * The planner engine imports this rather than instantiating directly,
 * making it easy to swap providers in tests.
 */
export const defaultProvider: LLMProvider = new AnthropicProvider();
