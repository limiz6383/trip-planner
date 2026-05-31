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
import type { TripBrief, Itinerary, ItineraryDay, Activity, LLMItinerary } from "@/lib/types";
import type { ContentSource } from "@/lib/retrieval/source";
import type { LLMProvider } from "@/lib/llm/provider";
import { rankPosts } from "@/lib/retrieval/ranking";
import { PostgresContentSource } from "@/lib/retrieval/source";
import { defaultProvider } from "@/lib/llm/provider";
import {
  deriveLockedConstraint,
  mergeLockedDays,
  validateLockedConstraints,
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
}

export interface PlannerResult {
  itinerary: LLMItinerary;
  /** Non-empty if locked constraints were violated (soft warning) */
  lockedConstraintViolations: string[];
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
    const { brief, existingItinerary, currentDate } = input;

    // --- Step 1: Derive locked constraints (mid-trip re-planning only) ---
    let lockedDates: string[] = [];
    if (existingItinerary && currentDate) {
      const constraint = deriveLockedConstraint(existingItinerary, currentDate);
      lockedDates = constraint.lockedDates;
    }

    // --- Step 2: Fetch candidate posts ---
    const posts = await this.source.fetchForDestination(brief.destination, {
      limit: 200,
    });

    // --- Step 3: Rank posts by authenticity + dial alignment ---
    const ranked = rankPosts(posts, brief.local_touristy_dial);

    // --- Step 4: Generate itinerary via LLM ---
    let generated = await this.llm.generateItinerary({
      brief,
      rankedPosts: ranked,
      lockedDates,
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
