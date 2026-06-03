/**
 * POST /api/trips/[id]/activities/[activityId]/revise
 *
 * Replaces a single activity with an LLM-generated alternative based on a
 * free-text instruction (e.g. "swap for something cheaper", "find a more local
 * option", "different cuisine"). Updates the activity row in place — the
 * activity_id and day_id are preserved. Auth-gated. Records a "revision"
 * change_log entry with before/after snapshots.
 *
 * Request body:
 *   { instruction: string }
 *
 * Response (200):
 *   { activity: Activity }
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: string }   — missing instruction / no brief
 *   404  { error: "Activity not found" }
 *   500  { error: string }   — missing API key, LLM error, or DB error
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  getActivityById,
  getDayById,
  getTripBrief,
  updateActivityFromLLMOutput,
  appendChangeLogEntry,
} from "@/lib/db/queries";
import { createPlannerEngine } from "@/lib/planner/engine";
import type { Activity } from "@/lib/types";

// ---- request / response shapes (exported so client components can import) ----

export interface ReviseActivityRequestBody {
  instruction: string;
}

export interface ReviseActivityResponseBody {
  activity: Activity;
}

export interface ReviseActivityErrorBody {
  error: string;
}

// ---- snapshot helper: the content fields a revision can change ----

function activitySnapshot(a: Activity): Record<string, unknown> {
  return {
    name: a.name,
    description: a.description,
    estimated_time_hours: a.estimated_time_hours,
    estimated_cost_usd: a.estimated_cost_usd,
    place_name: a.place_name,
    source_attribution: a.source_attribution,
    activity_type: a.activity_type,
  };
}

// ---- handler ----

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json(
      { error: "Unauthorized" } satisfies ReviseActivityErrorBody,
      { status: 401 }
    );
  }

  const { id: tripId, activityId } = await params;
  if (!tripId || !activityId) {
    return Response.json(
      { error: "Missing trip id or activity id" } satisfies ReviseActivityErrorBody,
      { status: 400 }
    );
  }

  // Parse + validate body
  let body: ReviseActivityRequestBody;
  try {
    body = (await request.json()) as ReviseActivityRequestBody;
  } catch {
    return Response.json(
      { error: "Invalid JSON body" } satisfies ReviseActivityErrorBody,
      { status: 400 }
    );
  }

  const instruction = body.instruction?.trim();
  if (!instruction) {
    return Response.json(
      { error: "A revision instruction is required." } satisfies ReviseActivityErrorBody,
      { status: 400 }
    );
  }

  // Guard: ANTHROPIC_API_KEY must be present — fail clearly instead of crashing
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured on the server. Add it to .env.local.",
      } satisfies ReviseActivityErrorBody,
      { status: 500 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    // --- 1. Load the activity (RLS ensures the user can access it) ---
    const activity = await getActivityById(supabase, activityId);
    if (!activity) {
      return Response.json(
        { error: "Activity not found" } satisfies ReviseActivityErrorBody,
        { status: 404 }
      );
    }

    // --- 2. Resolve the day's date for context (best-effort) ---
    const day = await getDayById(supabase, activity.day_id);
    const dayDate = day?.date ?? "";

    // --- 3. Load the brief (required for destination + preferences) ---
    const brief = await getTripBrief(supabase, tripId);
    if (!brief) {
      return Response.json(
        { error: "No confirmed trip brief found for this trip." } satisfies ReviseActivityErrorBody,
        { status: 400 }
      );
    }

    // --- 4. Generate the replacement via the planner pipeline ---
    const engine = createPlannerEngine(supabase);
    const llmActivity = await engine.reviseActivity({
      brief,
      activity,
      dayDate,
      instruction,
    });

    // --- 5. Apply to the DB row (activity_id + day_id + locked preserved) ---
    const updated = await updateActivityFromLLMOutput(
      supabase,
      activityId,
      llmActivity
    );

    // --- 6. Record the revision in the change log (non-fatal) ---
    try {
      await appendChangeLogEntry(
        supabase,
        tripId,
        user.id,
        "revision",
        `Revised activity "${activity.name}" → "${updated.name}": "${instruction}"`,
        activitySnapshot(activity),
        activitySnapshot(updated),
        { activity_id: activityId, day_id: activity.day_id, instruction }
      );
    } catch {
      // Change log write failing must not break the primary response
    }

    return Response.json(
      { activity: updated } satisfies ReviseActivityResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Activity revision failed.";
    return Response.json(
      { error: message } satisfies ReviseActivityErrorBody,
      { status: 500 }
    );
  }
}
