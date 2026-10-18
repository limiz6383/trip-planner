/**
 * POST /api/trips/[id]/days/[dayId]/revise
 *
 * Revises all activities for ONE day from a free-text instruction (e.g.
 * "more outdoorsy", "make the morning cheaper", "add a museum"). Replaces the
 * day's activities in place; locked activities are preserved. Auth-gated.
 * Records a "revision" change_log entry.
 *
 * SCOPE: if the instruction changes trip logistics that reach beyond the day
 * ("I'm leaving early on the last day", "our ferry is at 8am"), the revision is
 * escalated to a WHOLE-TRIP revision (new itinerary version, locks respected)
 * so the neighbouring days, transfers and budget follow. See
 * lib/planner/ripple.ts. The response says which happened via `scope`.
 *
 * Request body:
 *   { instruction: string }
 *
 * Response (200):
 *   { scope: "day",  activities: Activity[], notes: string[] }
 *   { scope: "trip", itinerary_id, version, reason, notice }  // whole trip re-planned
 *   409 { error } when another revision of this trip is still running
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: string }   — missing instruction / no brief
 *   404  { error: "Day not found" }
 *   500  { error: string }
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  getDayById,
  getActivitiesForDay,
  getTripBrief,
  getCurrentItineraryHydrated,
  getRevisionInstructions,
  replaceDayActivitiesFromLLM,
  createItineraryFromLLMOutput,
  appendChangeLogEntry,
} from "@/lib/db/queries";
import { createPlannerEngine, type HydratedItinerary } from "@/lib/planner/engine";
import type { Activity, TripBrief } from "@/lib/types";
import { isLLMConfigured } from "@/lib/llm/availability";
import { loadTripLogistics } from "@/lib/server/trip-logistics";
import { tryAcquire } from "@/lib/server/inflight";
import { syncCostsForDay, type SyncedCosts } from "@/lib/db/sync-costs";
import {
  detectTripWideImpact,
  buildRippleInstruction,
  type RippleKind,
} from "@/lib/planner/ripple";

export interface ReviseDayRequestBody {
  instruction: string;
}

export type ReviseDayResponseBody =
  | {
      scope: "day";
      activities: Activity[];
      /** Route adjustments made to the day, if any. */
      notes: string[];
      costs?: SyncedCosts;
    }
  | {
      scope: "trip";
      itinerary_id: string;
      version: number;
      /** Why this was treated as a whole-trip change. */
      reason: string;
      /** Plain-language summary for the traveller. */
      notice: string;
    };

export interface ReviseDayErrorBody {
  error: string;
}

/** One-line summary of a day for the model's trip_context. */
function summarizeDay(day: HydratedItinerary["days"][number] | undefined): string | undefined {
  if (!day) return undefined;
  const acts = (day.activities ?? [])
    .slice(0, 8)
    .map((a) => `${(a.start_time ?? "").slice(0, 5)} ${a.name}`.trim())
    .join("; ");
  return `${day.date}${day.city ? ` (${day.city.split(",")[0]})` : ""}: ${acts || "nothing planned"}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json(
      { error: "Unauthorized" } satisfies ReviseDayErrorBody,
      { status: 401 }
    );
  }

  const { id: tripId, dayId } = await params;
  if (!tripId || !dayId) {
    return Response.json(
      { error: "Missing trip id or day id" } satisfies ReviseDayErrorBody,
      { status: 400 }
    );
  }

  let body: ReviseDayRequestBody;
  try {
    body = (await request.json()) as ReviseDayRequestBody;
  } catch {
    return Response.json(
      { error: "Invalid JSON body" } satisfies ReviseDayErrorBody,
      { status: 400 }
    );
  }

  const instruction = body.instruction?.trim();
  if (!instruction) {
    return Response.json(
      { error: "A revision instruction is required." } satisfies ReviseDayErrorBody,
      { status: 400 }
    );
  }

  if (!isLLMConfigured()) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured on the server. Add it to .env.local.",
      } satisfies ReviseDayErrorBody,
      { status: 500 }
    );
  }

  // One model revision per trip at a time (double-click, second tab).
  const release = tryAcquire(`revise:${tripId}`);
  if (!release) {
    return Response.json(
      { error: "Another change to this trip is still being applied. Give it a moment." } satisfies ReviseDayErrorBody,
      { status: 409 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    // --- 1. Load the day (for its date) ---
    const day = await getDayById(supabase, dayId);
    if (!day) {
      return Response.json(
        { error: "Day not found" } satisfies ReviseDayErrorBody,
        { status: 404 }
      );
    }

    // --- 2. Load brief (required), the whole current itinerary and logistics ---
    const brief = await getTripBrief(supabase, tripId);
    if (!brief) {
      return Response.json(
        { error: "No confirmed trip brief found for this trip." } satisfies ReviseDayErrorBody,
        { status: 400 }
      );
    }
    const [activities, logistics, standingPreferences, hydrated] = await Promise.all([
      getActivitiesForDay(supabase, dayId),
      loadTripLogistics(supabase, tripId),
      getRevisionInstructions(supabase, tripId),
      getCurrentItineraryHydrated(supabase, tripId),
    ]);

    const days = hydrated?.days ?? [];
    const dayIndex = days.findIndex((d) => d.day_id === dayId);
    const dayNumber = dayIndex + 1;
    const position = dayIndex >= 0 ? { dayNumber, dayCount: days.length } : null;

    const engine = createPlannerEngine(supabase);

    // --- 3a. Whole-trip escalation ---
    async function escalate(kind: RippleKind, reason: string) {
      if (!hydrated || !position) {
        throw new Error("Couldn't find the current itinerary to re-plan.");
      }
      const composed = buildRippleInstruction({
        userInstruction: instruction as string,
        dayDate: day!.date,
        dayNumber: position.dayNumber,
        dayCount: position.dayCount,
        kind,
      });
      const llmItinerary = await engine.reviseItinerary({
        brief: brief as TripBrief,
        currentItinerary: hydrated,
        instruction: composed,
        standingPreferences,
        booking: logistics.booking,
        legs: logistics.legs,
        flights: logistics.flights,
        accommodations: logistics.accommodations,
      });
      const persisted = await createItineraryFromLLMOutput(supabase, tripId, llmItinerary);

      try {
        await appendChangeLogEntry(
          supabase,
          tripId,
          user!.id,
          "revision",
          `Re-planned the whole trip after a change to ${day!.date}: "${instruction}"`,
          { itinerary_id: hydrated.itinerary_id, version: hydrated.version },
          {
            itinerary_id: persisted.itinerary_id,
            version: persisted.version,
            total_cost_estimate: persisted.total_cost_estimate,
          },
          // The traveller's own words stay the standing preference (not the
          // long composed prompt), so later revisions keep honouring them.
          { instruction, kind: "user", scope: "trip", via: "day", day_id: dayId, ripple: kind }
        );
      } catch {
        // Change log write failing must not break the primary response
      }

      const lockedNote = day!.locked
        ? ` Day ${position.dayNumber} is locked, so it was left exactly as it was; unlock it and ask again to change it.`
        : "";
      return Response.json(
        {
          scope: "trip",
          itinerary_id: persisted.itinerary_id,
          version: persisted.version,
          reason,
          notice:
            `Re-planned the whole trip (now version ${persisted.version}). ${reason}` +
            ` Check the neighbouring days and the budget, and update your booking details if the flight or check-out time changed.` +
            lockedNote,
        } satisfies ReviseDayResponseBody,
        { status: 200 }
      );
    }

    const detected = detectTripWideImpact(instruction, position);
    if (detected) return await escalate(detected.kind, detected.reason);

    // --- 3b. Single-day revision ---
    const revised = await engine.reviseDay({
      brief,
      dayDate: day.date,
      activities,
      instruction,
      standingPreferences,
      booking: logistics.booking,
      legs: logistics.legs,
      flights: logistics.flights,
      accommodations: logistics.accommodations,
      context: position
        ? {
            day_number: position.dayNumber,
            day_count: position.dayCount,
            is_first_day: position.dayNumber === 1,
            is_last_day: position.dayNumber === position.dayCount,
            city: days[dayIndex].city ?? undefined,
            previous_day: summarizeDay(days[dayIndex - 1]),
            next_day: summarizeDay(days[dayIndex + 1]),
          }
        : undefined,
    });

    // The model flagged a logistics change the patterns missed: discard this
    // one-day answer and re-plan the whole trip instead.
    if (revised.ripple && position) {
      const kind: RippleKind =
        position.dayNumber === position.dayCount
          ? "departure"
          : position.dayNumber === 1
          ? "arrival"
          : "transfer";
      return await escalate(kind, revised.ripple.reason);
    }

    // --- 4. Replace the day's activities, resync costs, and return them ---
    const updated = await replaceDayActivitiesFromLLM(supabase, dayId, revised.activities);
    const costs = (await syncCostsForDay(supabase, dayId)) ?? undefined;

    // --- 5. Change log (non-fatal) ---
    try {
      await appendChangeLogEntry(
        supabase,
        tripId,
        user.id,
        "revision",
        `Revised ${day.date}: "${instruction}"`,
        { day_id: dayId, activity_count: activities.length },
        { day_id: dayId, activity_count: updated.length },
        { day_id: dayId, instruction }
      );
    } catch {
      // Change log write failing must not break the primary response
    }

    return Response.json(
      {
        scope: "day",
        activities: updated,
        notes: revised.geoNotes,
        ...(costs ? { costs } : {}),
      } satisfies ReviseDayResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Day revision failed.";
    return Response.json(
      { error: message } satisfies ReviseDayErrorBody,
      { status: 500 }
    );
  } finally {
    release();
  }
}
