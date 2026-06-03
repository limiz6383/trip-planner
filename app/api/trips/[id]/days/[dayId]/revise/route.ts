/**
 * POST /api/trips/[id]/days/[dayId]/revise
 *
 * Revises all activities for ONE day from a free-text instruction (e.g.
 * "more outdoorsy", "make the morning cheaper", "add a museum"). Replaces the
 * day's activities in place; locked activities are preserved. Auth-gated.
 * Records a "revision" change_log entry.
 *
 * Request body:
 *   { instruction: string }
 *
 * Response (200):
 *   { activities: Activity[] }   // the day's new activities, ordered by start_time
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
  getBookingForTrip,
  getRevisionInstructions,
  replaceDayActivitiesFromLLM,
  appendChangeLogEntry,
} from "@/lib/db/queries";
import { createPlannerEngine } from "@/lib/planner/engine";
import type { Activity } from "@/lib/types";

export interface ReviseDayRequestBody {
  instruction: string;
}

export interface ReviseDayResponseBody {
  activities: Activity[];
}

export interface ReviseDayErrorBody {
  error: string;
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured on the server. Add it to .env.local.",
      } satisfies ReviseDayErrorBody,
      { status: 500 }
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

    // --- 2. Load brief (required), the day's activities, and booking ---
    const brief = await getTripBrief(supabase, tripId);
    if (!brief) {
      return Response.json(
        { error: "No confirmed trip brief found for this trip." } satisfies ReviseDayErrorBody,
        { status: 400 }
      );
    }
    const [activities, booking, standingPreferences] = await Promise.all([
      getActivitiesForDay(supabase, dayId),
      getBookingForTrip(supabase, tripId),
      getRevisionInstructions(supabase, tripId),
    ]);

    // --- 3. Revise the day via the planner pipeline ---
    const engine = createPlannerEngine(supabase);
    const revised = await engine.reviseDay({
      brief,
      dayDate: day.date,
      activities,
      instruction,
      standingPreferences,
      booking,
    });

    // --- 4. Replace the day's activities and return them ---
    const updated = await replaceDayActivitiesFromLLM(supabase, dayId, revised);

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
      { activities: updated } satisfies ReviseDayResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Day revision failed.";
    return Response.json(
      { error: message } satisfies ReviseDayErrorBody,
      { status: 500 }
    );
  }
}
