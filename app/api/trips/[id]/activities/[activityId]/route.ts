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
import {
  appendChangeLogEntry,
  getActivityById,
  updateActivityFields,
  deleteActivity,
} from "@/lib/db/queries";
import type { Activity, ActivityType } from "@/lib/types";
import { syncCostsForDay, type SyncedCosts } from "@/lib/db/sync-costs";

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
  /** Present when the edit changed a cost: the resynced per-day + trip totals. */
  costs?: SyncedCosts;
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

const ACTIVITY_TYPES = new Set<string>([
  "food", "culture", "outdoor", "shopping", "transport", "accommodation", "entertainment", "other",
]);

/** Returns an error message for a bad field value, or null when the patch is sane. */
function validatePatch(patch: Partial<Record<string, unknown>>): string | null {
  if ("name" in patch && (typeof patch.name !== "string" || !patch.name.trim())) {
    return "Name can't be empty.";
  }
  if ("estimated_cost_usd" in patch && patch.estimated_cost_usd !== null) {
    const c = patch.estimated_cost_usd;
    if (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 1_000_000) {
      return "Cost must be a number between 0 and 1,000,000.";
    }
  }
  if ("estimated_time_hours" in patch && patch.estimated_time_hours !== null) {
    const h = patch.estimated_time_hours;
    if (typeof h !== "number" || !Number.isFinite(h) || h < 0 || h > 24) {
      return "Duration must be between 0 and 24 hours.";
    }
  }
  if ("activity_type" in patch && patch.activity_type !== null) {
    if (typeof patch.activity_type !== "string" || !ACTIVITY_TYPES.has(patch.activity_type)) {
      return "Unknown activity type.";
    }
  }
  if ("start_time" in patch && patch.start_time !== null) {
    if (typeof patch.start_time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(patch.start_time)) {
      return "Start time must look like 09:30.";
    }
  }
  if ("locked" in patch && typeof patch.locked !== "boolean") {
    return "locked must be a boolean.";
  }
  return null;
}

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

  const invalid = validatePatch(patch);
  if (invalid) {
    return Response.json({ error: invalid } satisfies PatchActivityErrorBody, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();

    // --- 1. Fetch current row (RLS ensures the user can access this activity) ---
    const before = await getActivityById(supabase, activityId);
    if (!before) {
      return Response.json({ error: "Activity not found" } satisfies PatchActivityErrorBody, { status: 404 });
    }

    // --- 2. Apply the update ---
    const after = await updateActivityFields(supabase, activityId, patch);

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

    // A cost edit changes the day total and the trip total: keep them in step.
    const costs =
      "estimated_cost_usd" in patch
        ? (await syncCostsForDay(supabase, after.day_id)) ?? undefined
        : undefined;

    const responseBody: PatchActivityResponseBody = { activity: after, ...(costs ? { costs } : {}) };
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
  costs?: SyncedCosts;
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
    const activity = await getActivityById(supabase, activityId);
    if (!activity) {
      return Response.json(
        { error: "Activity not found" } satisfies DeleteActivityErrorBody,
        { status: 404 }
      );
    }

    await deleteActivity(supabase, activityId);
    const costs = (await syncCostsForDay(supabase, activity.day_id)) ?? undefined;

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

    return Response.json(
      { ok: true, ...(costs ? { costs } : {}) } satisfies DeleteActivityResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete activity.";
    return Response.json(
      { error: message } satisfies DeleteActivityErrorBody,
      { status: 500 }
    );
  }
}
