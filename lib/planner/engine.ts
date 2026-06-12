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
} from "@/lib/types";
import type { ContentSource } from "@/lib/retrieval/source";
import type { LLMProvider } from "@/lib/llm/provider";
import { rankPosts } from "@/lib/retrieval/ranking";
import { PostgresContentSource } from "@/lib/retrieval/source";
import { defaultProvider } from "@/lib/llm/provider";
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
  booking?: Booking | null;
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
  booking?: Booking | null;
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
      const perCity = await Promise.all(
        legs!.map((leg) =>
          this.source
            .fetchForDestination(leg.city, { limit: 120 })
            .then((p) => rankPosts(p, brief.local_touristy_dial).slice(0, 18))
        )
      );
      ranked = perCity.flat();
    } else {
      const posts = await this.source.fetchForDestination(brief.destination, {
        limit: 200,
      });
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
    });

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
   * Revises the entire current itinerary according to a free-text instruction.
   *
   * Mirrors the generation path (fetch posts → rank → call the model) but feeds
   * the model the current itinerary plus the instruction instead of planning
   * from scratch. Returns the revised LLMItinerary; the caller persists it
   * (which creates a new version via createItineraryFromLLMOutput).
   */
  async reviseItinerary(input: ReviseItineraryInput): Promise<LLMItinerary> {
    const { brief, currentItinerary, instruction, booking, currentDate, standingPreferences } = input;

    const posts = await this.source.fetchForDestination(brief.destination, {
      limit: 200,
    });
    const ranked = rankPosts(posts, brief.local_touristy_dial);

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
    });

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

    const posts = await this.source.fetchForDestination(brief.destination, {
      limit: 200,
    });
    const ranked = rankPosts(posts, brief.local_touristy_dial);

    return this.llm.reviseActivity({
      activity,
      instruction,
      brief,
      rankedPosts: ranked,
      dayDateContext: dayDate,
    });
  }

  /**
   * Revises all activities for a single day. Returns the day's new activity
   * list (locked activities preserved + carried forward); caller persists it.
   */
  async reviseDay(input: ReviseDayInput): Promise<LLMActivity[]> {
    const { brief, dayDate, activities, instruction, booking, standingPreferences } = input;

    const posts = await this.source.fetchForDestination(brief.destination, {
      limit: 200,
    });
    const ranked = rankPosts(posts, brief.local_touristy_dial);

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
    });

    // Deterministically guarantee locked activities survive and stay locked.
    return applyLocksToDayRevision(revised, activities);
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
export function createPlannerEngine(supabaseClient: SupabaseClient): PlannerEngine {
  const source = new PostgresContentSource(supabaseClient);
  return new PlannerEngine(source, defaultProvider);
}
