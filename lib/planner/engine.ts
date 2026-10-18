/**
 * Planner orchestration engine.
 *
 * Orchestrates the full pipeline:
 *   1. Fetch community posts from the content source
 *   2. Rank posts using the two-axis ranking function
 *   3. Call the LLM provider to generate an itinerary
 *   4. Merge locked days (if re-planning mid-trip)
 *   5. Return the LLMItinerary ready for persistence
 *
 * The engine is intentionally thin — it delegates to:
 *   - lib/retrieval/source.ts   (data access)
 *   - lib/retrieval/ranking.ts  (scoring)
 *   - lib/llm/provider.ts       (model calls)
 *   - lib/planner/locked-days.ts (constraint handling)
 *
 * TODO (M1): Wire persistence — convert LLMItinerary → DB rows via a
 *            createItineraryFromLLMOutput() query helper, write the
 *            change_log entry, and return the persisted Itinerary ID.
 * TODO (M2): Stream LLM output to the client via a Route Handler / SSE.
 * TODO (M2): Integrate preference_profiles to personalise the ranking dial.
 */

import { resolveStartTime } from "./activity-edit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TripBrief,
  Booking,
  Itinerary,
  ItineraryDay,
  Activity,
  LLMItinerary,
  LLMItineraryDay,
  LLMActivity,
  PreferenceProfile,
  TripLeg,
  TripFlight,
  TripAccommodation,
  GuidePick,
} from "@/lib/types";
import type { ContentSource } from "@/lib/retrieval/source";
import type { LLMProvider } from "@/lib/llm/provider";
import { rankPosts } from "@/lib/retrieval/ranking";
import { PostgresContentSource } from "@/lib/retrieval/source";
import { CompositeContentSource, OsmContentSource } from "@/lib/places/source";
import { IS_MOCK } from "@/lib/mock/flag";
import { defaultProvider } from "@/lib/llm/provider";
import type { DayRevisionContext, ReviseDayResult } from "@/lib/llm/provider";
import { normalizeLLMCosts } from "@/lib/planner/costs";
import { alignDaysToLegs, legForDate } from "@/lib/planner/legs";
import {
  buildVenueIndex,
  reorderDayForGeography,
  type LatLon,
} from "@/lib/planner/geo";
import {
  deriveLockedConstraint,
  mergeLockedDays,
  validateLockedConstraints,
  applyLocksToRevision,
  applyLocksToDayRevision,
} from "@/lib/planner/locked-days";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface PlannerInput {
  brief: TripBrief;
  /**
   * Optional: the current persisted itinerary (with days + activities loaded).
   * Required for mid-trip re-planning so locked days are preserved.
   */
  existingItinerary?: Itinerary & {
    days: (ItineraryDay & { activities: Activity[] })[];
  };
  /**
   * ISO date string (YYYY-MM-DD) representing today.
   * Required for mid-trip re-planning to identify past days.
   * Ignored for initial planning.
   */
  currentDate?: string;
  /**
   * Optional booking record for the trip (flights + accommodation).
   * Passed through to the LLM so it can bound arrival/departure day hours
   * and cluster activities near the accommodation.
   * When null/undefined the LLM plans full days with no travel constraints.
   */
  booking?: Booking | null;
  /** Learned preferences from past trips — gently biases generation. */
  learnedPreferences?: PreferenceProfile | null;
  /** Multi-city legs (ordered). When >1, generation plans per-city. */
  legs?: TripLeg[];
  /**
   * Optional multi-city flight list. When non-empty it is the real schedule and
   * supersedes the single booking's arrival/departure bounds. Passed through to
   * the LLM unchanged.
   */
  flights?: TripFlight[];
  /**
   * Optional multi-city accommodation list (possibly one per city). Passed
   * through to the LLM to cluster each day near the covering stay.
   */
  accommodations?: TripAccommodation[];
}

export interface PlannerResult {
  itinerary: LLMItinerary;
  /** Non-empty if locked constraints were violated (soft warning) */
  lockedConstraintViolations: string[];
}

/** Hydrated itinerary (header + days + activities) as loaded from the DB. */
export type HydratedItinerary = Itinerary & {
  days: (ItineraryDay & { activities: Activity[] })[];
};

export interface ReviseItineraryInput {
  brief: TripBrief;
  /** The current persisted itinerary, hydrated with days + activities. */
  currentItinerary: HydratedItinerary;
  /** Free-text revision instruction from the user. */
  instruction: string;
  /** Earlier revision asks to keep honoring. */
  standingPreferences?: string[];
  /** Guide items the traveller ticked — each must appear in the result. */
  mustInclude?: GuidePick[];
  /** Guide items the traveller un-ticked — none may appear in the result. */
  mustExclude?: GuidePick[];
  booking?: Booking | null;
  /** Multi-city logistics, so revisions respect cities, transfers and stays. */
  legs?: TripLeg[];
  flights?: TripFlight[];
  accommodations?: TripAccommodation[];
  /**
   * ISO date (YYYY-MM-DD) for today. When provided, past days are preserved in
   * addition to explicitly locked days/activities (mid-trip revision). When
   * omitted, only explicit locks are preserved.
   */
  currentDate?: string;
}

export interface ReviseActivityInput {
  brief: TripBrief;
  /** The activity being replaced (DB row). */
  activity: Activity;
  /** ISO date (YYYY-MM-DD) of the day this activity belongs to. */
  dayDate: string;
  /** Free-text revision instruction from the user. */
  instruction: string;
  legs?: TripLeg[];
  /** The rest of the day, for timing + location context. */
  dayActivities?: Activity[];
}

export interface ReviseDayInput {
  brief: TripBrief;
  /** ISO date (YYYY-MM-DD) of the day being revised. */
  dayDate: string;
  /** The day's current activities (DB rows). */
  activities: Activity[];
  /** Free-text revision instruction from the user. */
  instruction: string;
  /** Earlier revision asks to keep honoring. */
  standingPreferences?: string[];
  /** Guide items the traveller ticked — each must appear in the result. */
  mustInclude?: GuidePick[];
  /** Guide items the traveller un-ticked — none may appear in the result. */
  mustExclude?: GuidePick[];
  booking?: Booking | null;
  /** Position of the day in the trip + neighbouring plan, for ripple detection. */
  context?: DayRevisionContext;
  legs?: TripLeg[];
  flights?: TripFlight[];
  accommodations?: TripAccommodation[];
}

export interface ReviseDayOutput extends ReviseDayResult {
  /** Human-readable notes about route adjustments made to the day. */
  geoNotes: string[];
}

// ---------------------------------------------------------------------------
// Helpers shared by generation and the revisions
// ---------------------------------------------------------------------------

/**
 * Post-processes a model itinerary deterministically:
 *   - stored costs always equal the sum of the activities;
 *   - each day's city matches its date's leg, and transfer days are checked;
 *   - each day's stops are re-ordered when that cuts real backtracking (only
 *     unlocked sightseeing stops, swapping time slots, never causing overlaps);
 *   - anything we could not fix is returned as a warning.
 * Mutates and returns the itinerary; `notes` gets a short "Route check" line.
 */
export function polishItinerary(
  itinerary: LLMItinerary,
  venues: ReadonlyMap<string, LatLon>,
  legs?: { city: string; arrival_date: string; departure_date: string }[]
): { itinerary: LLMItinerary; warnings: string[]; adjustments: string[] } {
  const warnings = alignDaysToLegs(itinerary.days ?? [], legs);
  const adjustments: string[] = [];
  (itinerary.days ?? []).forEach((day, i) => {
    if (!Array.isArray(day.activities)) day.activities = [];
    const r = reorderDayForGeography(day.activities, venues);
    if (r.changed) {
      day.activities = r.activities;
      adjustments.push(
        `Day ${i + 1}: re-ordered stops, route ${r.before.pathKm.toFixed(1)} km to ${r.afterKm.toFixed(1)} km.`
      );
    } else if (r.unresolved) {
      warnings.push(
        `Day ${i + 1} may backtrack (route ${r.before.pathKm.toFixed(1)} km; ${r.before.bestKm.toFixed(1)} km if re-ordered). Ask to group it by area.`
      );
    }
  });
  normalizeLLMCosts(itinerary);
  const lines = [...warnings];
  if (lines.length > 0) {
    itinerary.notes = `${itinerary.notes ?? ""}${itinerary.notes ? "\n\n" : ""}Route check: ${lines.join(" ")}`;
  }
  return { itinerary, warnings, adjustments };
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Converts a hydrated DB itinerary into the LLMItinerary shape (no DB ids),
 * which is what the revision prompt expects as the "current itinerary".
 *
 * Destination and the date range are sourced from the brief / day list since
 * the itinerary header row does not store them. Nullable DB fields are
 * normalised to the non-null LLM shape ("" / 0 / "other").
 */
export function hydratedItineraryToLLM(
  brief: TripBrief,
  itinerary: HydratedItinerary
): LLMItinerary {
  const days: LLMItineraryDay[] = (itinerary.days ?? []).map((day) => ({
    date: day.date,
    daily_cost: day.daily_cost ?? 0,
    locked: day.locked,
    ...(day.city ? { city: day.city } : {}),
    activities: (day.activities ?? []).map(
      (a): LLMActivity => ({
        name: a.name,
        description: a.description ?? "",
        start_time: a.start_time ?? "",
        estimated_time_hours: a.estimated_time_hours ?? 0,
        estimated_cost_usd: a.estimated_cost_usd ?? 0,
        place_name: a.place_name ?? "",
        source_attribution: a.source_attribution ?? "",
        activity_type: a.activity_type ?? "other",
        locked: a.locked,
      })
    ),
  }));

  const dates = days.map((d) => d.date).sort();

  return {
    destination: brief.destination,
    start_date: dates[0] ?? brief.start_date,
    end_date: dates[dates.length - 1] ?? brief.end_date,
    days,
    total_cost_estimate: itinerary.total_cost_estimate ?? 0,
    notes: itinerary.notes ?? "",
  };
}

// ---------------------------------------------------------------------------
// Engine class
// ---------------------------------------------------------------------------

export class PlannerEngine {
  constructor(
    private readonly source: ContentSource,
    private readonly llm: LLMProvider
  ) {}

  async plan(input: PlannerInput): Promise<PlannerResult> {
    const {
      brief,
      existingItinerary,
      currentDate,
      booking,
      learnedPreferences,
      legs,
      flights,
      accommodations,
    } = input;

    // --- Step 1: Derive locked constraints (mid-trip re-planning only) ---
    let lockedDates: string[] = [];
    if (existingItinerary && currentDate) {
      const constraint = deriveLockedConstraint(existingItinerary, currentDate);
      lockedDates = constraint.lockedDates;
    }

    // --- Step 2+3: Fetch + rank candidate posts (per city for multi-city) ---
    const multiCity = !!legs && legs.length > 1;
    let ranked;
    if (multiCity) {
      // Fetch + rank each city's posts independently and take a top slice per
      // city, so every leg gets fair representation in the capped context.
      // The prompt keeps only the first 30 posts, so share that budget across the
      // cities; otherwise the last leg of a 3+ city trip gets nothing.
      const perCityCap = Math.max(5, Math.floor(30 / legs!.length));
      const perCity = await Promise.all(
        legs!.map((leg) =>
          this.source
            .fetchForDestination(leg.city, {
              limit: 120,
              localTouristyDial: brief.local_touristy_dial,
            })
            .then((p) => rankPosts(p, brief.local_touristy_dial).slice(0, perCityCap))
        )
      );
      ranked = perCity.flat();
    } else {
      // Use the leg's full label ("Paris, Texas, USA") when we have it: the trip's
      // denormalised destination drops everything after the first comma.
      const posts = await this.source.fetchForDestination(
        legs?.length === 1 ? legs[0].city : brief.destination,
        { limit: 200, localTouristyDial: brief.local_touristy_dial }
      );
      ranked = rankPosts(posts, brief.local_touristy_dial);
    }

    // --- Step 4: Generate itinerary via LLM ---
    let generated = await this.llm.generateItinerary({
      brief,
      rankedPosts: ranked,
      lockedDates,
      // Pass booking through so the LLM can apply flight/accommodation constraints.
      // Undefined when not provided — LLM plans full days with no constraints.
      booking: booking ?? null,
      learnedPreferences: learnedPreferences ?? null,
      legs: legs?.map((l) => ({
        city: l.city,
        arrival_date: l.arrival_date,
        departure_date: l.departure_date,
      })),
      // Multi-city flights + accommodations (optional). Pass through unchanged;
      // when empty the LLM falls back to the single-booking path.
      flights,
      accommodations,
    });

    // --- Step 4b: deterministic post-processing (costs, city order, route) ---
    generated = polishItinerary(
      generated,
      buildVenueIndex(ranked),
      legs
    ).itinerary;

    // --- Step 5: Merge locked days (deterministic override of LLM output) ---
    let lockedConstraintViolations: string[] = [];
    if (existingItinerary && currentDate) {
      const constraint = deriveLockedConstraint(existingItinerary, currentDate);
      lockedConstraintViolations = validateLockedConstraints(generated, constraint);
      generated = mergeLockedDays(generated, existingItinerary, constraint);
    }

    return { itinerary: generated, lockedConstraintViolations };
  }

  /**
   * Ranked posts for a revision. Multi-city: per-leg slices (or just the leg
   * covering `date` for a single-day/activity revision); single-city: the
   * brief's destination.
   */
  private async rankedFor(
    brief: TripBrief,
    legs: TripLeg[] | undefined,
    date?: string
  ) {
    const dial = brief.local_touristy_dial;
    if (legs && legs.length > 1) {
      const target = date ? legForDate(date, legs) : null;
      const chosen = target ? [target] : legs;
      const cap = target ? 30 : Math.max(5, Math.floor(30 / chosen.length));
      const perCity = await Promise.all(
        chosen.map((leg) =>
          this.source
            .fetchForDestination(leg.city, { limit: 120, localTouristyDial: dial })
            .then((p) => rankPosts(p, dial).slice(0, cap))
        )
      );
      return perCity.flat();
    }
    const posts = await this.source.fetchForDestination(
      legs?.length === 1 ? legs[0].city : brief.destination,
      { limit: 200, localTouristyDial: dial }
    );
    return rankPosts(posts, dial);
  }

  /**
   * Revises the entire current itinerary according to a free-text instruction.
   *
   * Mirrors the generation path (fetch posts → rank → call the model) but feeds
   * the model the current itinerary plus the instruction instead of planning
   * from scratch. Returns the revised LLMItinerary; the caller persists it
   * (which creates a new version via createItineraryFromLLMOutput).
   */
  async reviseItinerary(input: ReviseItineraryInput): Promise<LLMItinerary> {
    const { brief, currentItinerary, instruction, booking, currentDate, standingPreferences, mustInclude, mustExclude, legs, flights, accommodations } = input;

    // Multi-city trips: the denormalised brief.destination ("Paros → Athens")
    // matches no city's posts, so fetch per leg exactly like generation does.
    const ranked = await this.rankedFor(brief, legs);

    // Derive locks from the current itinerary. Passing "" as the reference date
    // when currentDate is absent means no day is treated as past, so only
    // explicit locks are preserved.
    const constraint = deriveLockedConstraint(currentItinerary, currentDate ?? "");

    const revised = await this.llm.reviseItinerary({
      brief,
      booking: booking ?? null,
      rankedPosts: ranked,
      // hydratedItineraryToLLM carries per-day/-activity lock flags so the model
      // is told which items to leave alone.
      currentItinerary: hydratedItineraryToLLM(brief, currentItinerary),
      instruction,
      standingPreferences,
      mustInclude,
      mustExclude,
      legs: legs?.map((l) => ({
        city: l.city,
        arrival_date: l.arrival_date,
        departure_date: l.departure_date,
      })),
      flights,
      accommodations,
    });

    // Costs, city order and route sanity before locks are re-applied (locked
    // content is then restored verbatim, so it is never re-ordered).
    polishItinerary(revised, buildVenueIndex(ranked), legs);

    // Deterministically guarantee locked content survives regardless of model
    // output, and carry lock state forward into the persisted new version.
    return applyLocksToRevision(revised, currentItinerary, constraint);
  }

  /**
   * Revises a single activity according to a free-text instruction. Returns a
   * single LLMActivity replacement; the caller applies it to the DB row.
   */
  async reviseActivity(input: ReviseActivityInput): Promise<LLMActivity> {
    const { brief, activity, dayDate, instruction } = input;

    const ranked = await this.rankedFor(brief, input.legs, dayDate);

    const revised = await this.llm.reviseActivity({
      activity,
      instruction,
      brief,
      rankedPosts: ranked,
      dayDateContext: dayDate,
      dayActivities: input.dayActivities,
    });
    // A time the traveller typed is a fact: enforce it, don't hope the model did.
    return {
      ...revised,
      name: revised.name?.trim() || activity.name,
      start_time:
        resolveStartTime(instruction, revised.start_time, activity.start_time) ?? "",
    };
  }

  /**
   * Revises all activities for a single day. Returns the day's new activity
   * list (locked activities preserved + carried forward); caller persists it.
   */
  async reviseDay(input: ReviseDayInput): Promise<ReviseDayOutput> {
    const { brief, dayDate, activities, instruction, booking, standingPreferences, context, legs, flights, accommodations } = input;

    // Source venues from the city this day is actually in.
    const ranked = await this.rankedFor(brief, legs, dayDate);

    // Express the day's current activities in the LLM shape (with lock flags so
    // the model is told what it must preserve).
    const currentActivities: LLMActivity[] = activities.map((a) => ({
      name: a.name,
      description: a.description ?? "",
      start_time: a.start_time ?? "",
      estimated_time_hours: a.estimated_time_hours ?? 1,
      estimated_cost_usd: a.estimated_cost_usd ?? 0,
      place_name: a.place_name ?? "",
      source_attribution: a.source_attribution ?? "",
      activity_type: a.activity_type ?? "other",
      locked: a.locked,
    }));

    const revised = await this.llm.reviseDay({
      brief,
      rankedPosts: ranked,
      dayDate,
      currentActivities,
      instruction,
      standingPreferences,
      booking: booking ?? null,
      context: context
        ? {
            ...context,
            legs: legs?.map((l) => ({
              city: l.city,
              arrival_date: l.arrival_date,
              departure_date: l.departure_date,
            })),
            flights,
            accommodations,
          }
        : undefined,
    });

    // Keep the day a tidy route (unlocked sightseeing stops only), then
    // guarantee locked activities survive and stay locked.
    const geo = reorderDayForGeography(revised.activities, buildVenueIndex(ranked));
    const geoNotes: string[] = [];
    if (geo.changed) {
      geoNotes.push(
        `Re-ordered stops to cut backtracking (${geo.before.pathKm.toFixed(1)} km to ${geo.afterKm.toFixed(1)} km).`
      );
    } else if (geo.unresolved) {
      geoNotes.push(
        `This day may still backtrack (${geo.before.pathKm.toFixed(1)} km route). Ask to group it by area.`
      );
    }
    return {
      activities: applyLocksToDayRevision(geo.activities, activities),
      ripple: revised.ripple,
      geoNotes,
    };
  }

  /** Generate a general destination overview (cache the result). */
  async generateDestinationGuide(destination: string) {
    return this.llm.generateDestinationGuide(destination);
  }

  /** One conversational turn about the itinerary (no changes applied). */
  async discussItinerary(params: import("@/lib/llm/provider").DiscussItineraryParams) {
    return this.llm.discussItinerary(params);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a PlannerEngine wired to the real Postgres source and the default
 * Anthropic provider.
 *
 * Import and call this in Route Handlers / Server Actions only.
 *
 * @param supabaseClient A server-side Supabase client with auth session attached.
 */
// One shared instance so the in-memory cache survives across requests.
let osmSource: OsmContentSource | null = null;
function getOsmSource(): OsmContentSource {
  return (osmSource ??= new OsmContentSource());
}

export function createPlannerEngine(supabaseClient: SupabaseClient): PlannerEngine {
  const curated = new PostgresContentSource(supabaseClient);
  // Real, named venues from OpenStreetMap on top of the curated posts. Demo mode
  // stays fully offline, and PLACES_SOURCE=off disables the lookup.
  const useMap = !IS_MOCK && process.env.PLACES_SOURCE !== "off";
  const source = useMap
    ? new CompositeContentSource(curated, getOsmSource())
    : curated;
  return new PlannerEngine(source, defaultProvider);
}
