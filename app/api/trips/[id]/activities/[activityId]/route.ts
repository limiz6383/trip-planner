/**
 * PATCH /api/trips/[id]/activities/[activityId]
 *
 * Updates one or more mutable fields on an activity and/or toggles its lock.
 * Auth-gated. Records a "manual_edit" change_log entry with before/after
 * snapshots of the changed fields.
 *
 * Request body (all fields optional — send only what changed):
 *   {
 *     name?:                  string;
 *     description?:           string | null;
 *     estimated_cost_usd?:    number | null;
 *     estimated_time_hours?:  number | null;
 *     activity_type?:         ActivityType | null;
 *     locked?:                boolean;
 *   }
 *
 * Response (200):
 *   { activity: Activity }
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: string }
 *   404  { error: "Activity not found" }
 *   500  { error: string }
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import { appendChangeLogEntry } from "@/lib/db/queries";
import type { Activity, ActivityType } from "@/lib/types";

// ---- request / response shapes ----

export interface PatchActivityRequestBody {
  name?: string;
  description?: string | null;
  estimated_cost_usd?: number | null;
  estimated_time_hours?: number | null;
  activity_type?: ActivityType | null;
  start_time?: string | null;
  locked?: boolean;
}

export interface PatchActivityResponseBody {
  activity: Activity;
}

export interface PatchActivityErrorBody {
  error: string;
}

// ---- allowed mutable fields (guards against prototype injection) ----

const ALLOWED_FIELDS = new Set<string>([
  "name",
  "description",
  "estimated_cost_usd",
  "estimated_time_hours",
  "activity_type",
  "start_time",
  "locked",
]);

// ---- handler ----

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" } satisfies PatchActivityErrorBody, { status: 401 });
  }

  const { id: tripId, activityId } = await params;

  if (!tripId || !activityId) {
    return Response.json({ error: "Missing trip id or activity id" } satisfies PatchActivityErrorBody, { status: 400 });
  }

  let body: PatchActivityRequestBody;
  try {
    body = (await request.json()) as PatchActivityRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" } satisfies PatchActivityErrorBody, { status: 400 });
  }

  // Build the update patch — only include keys present in the body and allowed
  const patch: Partial<Record<string, unknown>> = {};
  for (const key of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(key)) {
      patch[key] = (body as Record<string, unknown>)[key];
    }
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No valid fields to update" } satisfies PatchActivityErrorBody, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();

    // --- 1. Fetch current row (RLS ensures the user can access this activity) ---
    const { data: currentRow, error: fetchError } = await supabase
      .from("activities")
      .select("*")
      .eq("activity_id", activityId)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return Response.json({ error: "Activity not found" } satisfies PatchActivityErrorBody, { status: 404 });
      }
      throw fetchError;
    }

    const before = currentRow as Activity;

    // --- 2. Apply the update ---
    const { data: updatedRow, error: updateError } = await supabase
      .from("activities")
      .update(patch)
      .eq("activity_id", activityId)
      .select()
      .single();

    if (updateError) throw updateError;

    const after = updatedRow as Activity;

    // --- 3. Build before/after snapshots — only changed fields ---
    const beforeSnapshot: Record<string, unknown> = {};
    const afterSnapshot: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
      beforeSnapshot[key] = (before as unknown as Record<string, unknown>)[key];
      afterSnapshot[key] = (after as unknown as Record<string, unknown>)[key];
    }

    // --- 4. Build a human-readable summary ---
    const changedKeys = Object.keys(patch);
    const isLockOnly = changedKeys.length === 1 && changedKeys[0] === "locked";
    let summary: string;
    if (isLockOnly) {
      summary = after.locked
        ? `Locked activity "${after.name}"`
        : `Unlocked activity "${after.name}"`;
    } else {
      const fieldList = changedKeys.filter((k) => k !== "locked").join(", ");
      summary = `Edited activity "${after.name}"${fieldList ? ` (${fieldList})` : ""}`;
    }

    // --- 5. Append change log entry ---
    await appendChangeLogEntry(
      supabase,
      tripId,
      user.id,
      "manual_edit",
      summary,
      beforeSnapshot,
      afterSnapshot,
      { activity_id: activityId, day_id: after.day_id }
    );

    const responseBody: PatchActivityResponseBody = { activity: after };
    return Response.json(responseBody, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update activity.";
    return Response.json({ error: message } satisfies PatchActivityErrorBody, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove an activity from its day
// ---------------------------------------------------------------------------

export interface DeleteActivityResponseBody {
  ok: true;
}

export interface DeleteActivityErrorBody {
  error: string;
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json(
      { error: "Unauthorized" } satisfies DeleteActivityErrorBody,
      { status: 401 }
    );
  }

  const { id: tripId, activityId } = await params;
  if (!tripId || !activityId) {
    return Response.json(
      { error: "Missing trip id or activity id" } satisfies DeleteActivityErrorBody,
      { status: 400 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    // Fetch first so we can log what was removed (RLS gates access).
    const { data: row, error: fetchError } = await supabase
      .from("activities")
      .select("*")
      .eq("activity_id", activityId)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return Response.json(
          { error: "Activity not found" } satisfies DeleteActivityErrorBody,
          { status: 404 }
        );
      }
      throw fetchError;
    }
    const activity = row as Activity;

    const { error: delError } = await supabase
      .from("activities")
      .delete()
      .eq("activity_id", activityId);
    if (delError) throw delError;

    try {
      await appendChangeLogEntry(
        supabase,
        tripId,
        user.id,
        "manual_edit",
        `Removed activity "${activity.name}"`,
        { activity_id: activityId, day_id: activity.day_id, name: activity.name },
        null,
        { activity_id: activityId, day_id: activity.day_id }
      );
    } catch {
      // non-fatal
    }

    return Response.json({ ok: true } satisfies DeleteActivityResponseBody, {
      status: 200,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete activity.";
    return Response.json(
      { error: message } satisfies DeleteActivityErrorBody,
      { status: 500 }
    );
  }
}
