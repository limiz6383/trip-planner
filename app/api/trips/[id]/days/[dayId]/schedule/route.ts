/**
 * PATCH /api/trips/[id]/days/[dayId]/schedule
 *
 * Bulk-updates the start_time of multiple activities on a day in one call.
 * Used to persist a cascade: when one activity's time/duration changes, the
 * client recomputes the downstream activities' clock times and sends them all
 * here. Auth-gated; each update is scoped to the day so foreign rows can't be
 * touched.
 *
 * Request body:
 *   { updates: Array<{ activity_id: string; start_time: string | null }> }
 *
 * Response (200):
 *   { activities: Activity[] }   // the updated rows, ordered by start_time
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: string }
 *   500  { error: string }
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getActivitiesForDay } from "@/lib/db/queries";
import type { Activity } from "@/lib/types";

export interface RescheduleRequestBody {
  updates: Array<{ activity_id: string; start_time: string | null }>;
}

export interface RescheduleResponseBody {
  activities: Activity[];
}

export interface RescheduleErrorBody {
  error: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json(
      { error: "Unauthorized" } satisfies RescheduleErrorBody,
      { status: 401 }
    );
  }

  const { dayId } = await params;
  if (!dayId) {
    return Response.json(
      { error: "Missing day id" } satisfies RescheduleErrorBody,
      { status: 400 }
    );
  }

  let body: RescheduleRequestBody;
  try {
    body = (await request.json()) as RescheduleRequestBody;
  } catch {
    return Response.json(
      { error: "Invalid JSON body" } satisfies RescheduleErrorBody,
      { status: 400 }
    );
  }

  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    return Response.json(
      { error: "No updates provided" } satisfies RescheduleErrorBody,
      { status: 400 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    // Scope every update to this day so an activity_id from another day can't
    // be retimed. RLS additionally gates on trip ownership/collaboration.
    for (const u of body.updates) {
      if (!u || typeof u.activity_id !== "string") continue;
      const { error } = await supabase
        .from("activities")
        .update({ start_time: u.start_time || null })
        .eq("activity_id", u.activity_id)
        .eq("day_id", dayId);
      if (error) throw error;
    }

    const activities = await getActivitiesForDay(supabase, dayId);
    return Response.json(
      { activities } satisfies RescheduleResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reschedule the day.";
    return Response.json(
      { error: message } satisfies RescheduleErrorBody,
      { status: 500 }
    );
  }
}
