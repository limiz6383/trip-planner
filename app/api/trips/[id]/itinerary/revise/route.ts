/**
 * POST /api/trips/[id]/itinerary/revise
 *
 * Revises the trip's current itinerary according to a free-text instruction
 * (e.g. "make it cheaper", "more outdoorsy", "less walking on day 2") and
 * persists the result as a NEW itinerary version (the previous version is
 * retained; is_current moves to the new one). Auth-gated.
 *
 * Request body:
 *   { instruction: string }
 *
 * Response (200):
 *   { itinerary: Itinerary }   // hydrated: itinerary.days[].activities[] populated
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: string }   — missing instruction / no brief / no current itinerary
 *   500  { error: string }   — missing API key, LLM error, or DB error
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  getTripBrief,
  getCurrentItineraryHydrated,
  createItineraryFromLLMOutput,
  getRevisionInstructions,
  appendChangeLogEntry,
} from "@/lib/db/queries";
import { createPlannerEngine } from "@/lib/planner/engine";
import type { Itinerary, GuidePick } from "@/lib/types";
import { isLLMConfigured } from "@/lib/llm/availability";
import { loadTripLogistics } from "@/lib/server/trip-logistics";
import { tryAcquire } from "@/lib/server/inflight";

// ---- request / response shapes (exported so client components can import) ----

export interface ReviseItineraryRequestBody {
  /**
   * Free-text ask. Optional when `include`/`exclude` are supplied — the server
   * composes an instruction from the picks in that case.
   */
  instruction?: string;
  /**
   * "tidy" marks a system-issued cleanup (the "Tidy up" button) so it is NOT
   * remembered as a standing preference. Defaults to a user revision.
   * "picks" marks a rebuild driven by the destination-guide selector.
   */
  kind?: "user" | "tidy" | "picks";
  /** Guide items the traveller ticked — each must appear in the new plan. */
  include?: GuidePick[];
  /** Guide items the traveller un-ticked — none may appear in the new plan. */
  exclude?: GuidePick[];
}

export interface ReviseItineraryResponseBody {
  itinerary: Itinerary;
}

export interface ReviseItineraryErrorBody {
  error: string;
}

// ---- handler ----

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json(
      { error: "Unauthorized" } satisfies ReviseItineraryErrorBody,
      { status: 401 }
    );
  }

  const { id: tripId } = await params;
  if (!tripId) {
    return Response.json(
      { error: "Missing trip id" } satisfies ReviseItineraryErrorBody,
      { status: 400 }
    );
  }

  // Parse + validate body
  let body: ReviseItineraryRequestBody;
  try {
    body = (await request.json()) as ReviseItineraryRequestBody;
  } catch {
    return Response.json(
      { error: "Invalid JSON body" } satisfies ReviseItineraryErrorBody,
      { status: 400 }
    );
  }

  const clean = (list: unknown): GuidePick[] => {
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    const out: GuidePick[] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const pick = raw as Partial<GuidePick>;
      const name = typeof pick.name === "string" ? pick.name.trim() : "";
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({
        name,
        kind: pick.kind === "food" ? "food" : "spot",
        ...(typeof pick.city === "string" && pick.city.trim()
          ? { city: pick.city.trim() }
          : {}),
      });
      if (out.length >= 40) break;
    }
    return out;
  };

  const names = (picks: GuidePick[]) => picks.map((p) => p.name).join(", ");

  const mustInclude = clean(body.include);
  const mustExclude = clean(body.exclude);

  // A guide-driven rebuild carries picks instead of prose; compose a readable
  // instruction from them so the change log and standing preferences — both of
  // which are free text — stay meaningful.
  const composed = [
    mustInclude.length > 0
      ? `Work these in: ${names(mustInclude)}.`
      : null,
    mustExclude.length > 0
      ? `Leave these out: ${names(mustExclude)}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const instruction = body.instruction?.trim() || composed;
  if (!instruction) {
    return Response.json(
      { error: "A revision instruction is required." } satisfies ReviseItineraryErrorBody,
      { status: 400 }
    );
  }

  // Guard: ANTHROPIC_API_KEY must be present — fail clearly instead of crashing
  if (!isLLMConfigured()) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured on the server. Add it to .env.local.",
      } satisfies ReviseItineraryErrorBody,
      { status: 500 }
    );
  }

  // One model revision per trip at a time (double-click, second tab).
  const release = tryAcquire(`revise:${tripId}`);
  if (!release) {
    return Response.json(
      { error: "Another change to this trip is still being applied. Give it a moment." } satisfies ReviseItineraryErrorBody,
      { status: 409 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    // --- 1. Load the confirmed brief (required for destination + preferences) ---
    const brief = await getTripBrief(supabase, tripId);
    if (!brief) {
      return Response.json(
        { error: "No confirmed trip brief found for this trip." } satisfies ReviseItineraryErrorBody,
        { status: 400 }
      );
    }

    // --- 2. Load the current itinerary (required — nothing to revise otherwise) ---
    const currentItinerary = await getCurrentItineraryHydrated(supabase, tripId);
    if (!currentItinerary) {
      return Response.json(
        { error: "No current itinerary to revise." } satisfies ReviseItineraryErrorBody,
        { status: 400 }
      );
    }

    // --- 3. Load the booking (optional) + prior revision preferences ---
    const [logistics, standingPreferences] = await Promise.all([
      loadTripLogistics(supabase, tripId),
      getRevisionInstructions(supabase, tripId),
    ]);

    // --- 4. Run the revision through the planner pipeline ---
    const engine = createPlannerEngine(supabase);
    const llmItinerary = await engine.reviseItinerary({
      brief,
      currentItinerary,
      instruction,
      standingPreferences,
      mustInclude,
      mustExclude,
      booking: logistics.booking,
      legs: logistics.legs,
      flights: logistics.flights,
      accommodations: logistics.accommodations,
    });

    // --- 5. Persist as a new version and return the hydrated itinerary ---
    const persisted = await createItineraryFromLLMOutput(
      supabase,
      tripId,
      llmItinerary
    );

    // --- 6. Record the revision in the change log (non-fatal) ---
    try {
      await appendChangeLogEntry(
        supabase,
        tripId,
        user.id,
        "revision",
        `Revised itinerary: "${instruction}"`,
        { itinerary_id: currentItinerary.itinerary_id, version: currentItinerary.version },
        {
          itinerary_id: persisted.itinerary_id,
          version: persisted.version,
          destination: llmItinerary.destination,
          total_cost_estimate: llmItinerary.total_cost_estimate,
        },
        {
          instruction,
          kind:
            body.kind === "tidy"
              ? "tidy"
              : body.kind === "picks"
              ? "picks"
              : "user",
          // Persisted so the guide selector can restore the traveller's ticks
          // on reload. Coverage matching is fuzzy and cannot be trusted to
          // reconstruct intent after the model rewords an activity.
          ...(mustInclude.length > 0 || mustExclude.length > 0
            ? { include: mustInclude, exclude: mustExclude }
            : {}),
        }
      );
    } catch {
      // Change log write failing must not break the primary response
    }

    return Response.json(
      { itinerary: persisted } satisfies ReviseItineraryResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Itinerary revision failed.";
    return Response.json(
      { error: message } satisfies ReviseItineraryErrorBody,
      { status: 500 }
    );
  } finally {
    release();
  }
}
