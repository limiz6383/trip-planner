/**
 * POST /api/trips/[id]/activities/[activityId]/move
 *
 * Moves an activity to a different day within the same itinerary. Deterministic
 * (no LLM). The activity keeps its content and start_time; it is appended to the
 * end of the target day's order. Auth-gated. Records a "manual_edit" change_log
 * entry.
 *
 * Request body:
 *   { target_day_id: string }
 *
 * Response (200):
 *   { activity: Activity }   // the moved activity (now on the target day)
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: string }       — missing/invalid target, or target on a different itinerary
 *   404  { error: "Activity not found" } / "Target day not found"
 *   500  { error: string }
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  getActivityById,
  getDayById,
  getActivitiesForDay,
  appendChangeLogEntry,
} from "@/lib/db/queries";
import type { Activity } from "@/lib/types";

export interface MoveActivityRequestBody {
  target_day_id: string;
}

export interface MoveActivityResponseBody {
  activity: Activity;
}

export interface MoveActivityErrorBody {
  error: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json(
      { error: "Unauthorized" } satisfies MoveActivityErrorBody,
      { status: 401 }
    );
  }

  const { id: tripId, activityId } = await params;
  if (!tripId || !activityId) {
    return Response.json(
      { error: "Missing trip id or activity id" } satisfies MoveActivityErrorBody,
      { status: 400 }
    );
  }

  let body: MoveActivityRequestBody;
  try {
    body = (await request.json()) as MoveActivityRequestBody;
  } catch {
    return Response.json(
      { error: "Invalid JSON body" } satisfies MoveActivityErrorBody,
      { status: 400 }
    );
  }

  const targetDayId = body.target_day_id;
  if (!targetDayId || typeof targetDayId !== "string") {
    return Response.json(
      { error: "target_day_id is required" } satisfies MoveActivityErrorBody,
      { status: 400 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    const activity = await getActivityById(supabase, activityId);
    if (!activity) {
      return Response.json(
        { error: "Activity not found" } satisfies MoveActivityErrorBody,
        { status: 404 }
      );
    }

    if (activity.day_id === targetDayId) {
      // No-op move; return as-is.
      return Response.json(
        { activity } satisfies MoveActivityResponseBody,
        { status: 200 }
      );
    }

    // Both days must belong to the same itinerary (can't move across itineraries
    // or into another trip). RLS additionally gates on trip ownership.
    const [sourceDay, targetDay] = await Promise.all([
      getDayById(supabase, activity.day_id),
      getDayById(supabase, targetDayId),
    ]);
    if (!targetDay) {
      return Response.json(
        { error: "Target day not found" } satisfies MoveActivityErrorBody,
        { status: 404 }
      );
    }
    if (!sourceDay || sourceDay.itinerary_id !== targetDay.itinerary_id) {
      return Response.json(
        { error: "Target day is not part of this itinerary" } satisfies MoveActivityErrorBody,
        { status: 400 }
      );
    }

    // Append to the end of the target day's order.
    const targetActivities = await getActivitiesForDay(supabase, targetDayId);
    const nextSortOrder =
      targetActivities.length > 0
        ? Math.max(...targetActivities.map((a) => a.sort_order)) + 1
        : 0;

    const { data: movedRow, error: moveError } = await supabase
      .from("activities")
      .update({ day_id: targetDayId, sort_order: nextSortOrder })
      .eq("activity_id", activityId)
      .select()
      .single();
    if (moveError) throw moveError;
    const moved = movedRow as Activity;

    try {
      await appendChangeLogEntry(
        supabase,
        tripId,
        user.id,
        "manual_edit",
        `Moved "${moved.name}" to ${targetDay.date}`,
        { day_id: activity.day_id },
        { day_id: targetDayId },
        { activity_id: activityId }
      );
    } catch {
      // non-fatal
    }

    return Response.json(
      { activity: moved } satisfies MoveActivityResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to move activity.";
    return Response.json(
      { error: message } satisfies MoveActivityErrorBody,
      { status: 500 }
    );
  }
}
