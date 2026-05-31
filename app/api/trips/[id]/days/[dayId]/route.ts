/**
 * PATCH /api/trips/[id]/days/[dayId]
 *
 * Toggles (or explicitly sets) the `locked` flag on an itinerary day.
 * Auth-gated. Records a "manual_edit" change_log entry.
 *
 * Request body:
 *   {
 *     locked: boolean;
 *   }
 *
 * Response (200):
 *   { day: ItineraryDay }
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: string }
 *   404  { error: "Day not found" }
 *   500  { error: string }
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import { appendChangeLogEntry } from "@/lib/db/queries";
import type { ItineraryDay } from "@/lib/types";

// ---- request / response shapes ----

export interface PatchDayRequestBody {
  locked: boolean;
}

export interface PatchDayResponseBody {
  day: ItineraryDay;
}

export interface PatchDayErrorBody {
  error: string;
}

// ---- handler ----

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" } satisfies PatchDayErrorBody, { status: 401 });
  }

  const { id: tripId, dayId } = await params;

  if (!tripId || !dayId) {
    return Response.json({ error: "Missing trip id or day id" } satisfies PatchDayErrorBody, { status: 400 });
  }

  let body: PatchDayRequestBody;
  try {
    body = (await request.json()) as PatchDayRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" } satisfies PatchDayErrorBody, { status: 400 });
  }

  if (typeof body.locked !== "boolean") {
    return Response.json(
      { error: "locked must be a boolean" } satisfies PatchDayErrorBody,
      { status: 400 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    // --- 1. Fetch current row (RLS ensures the user can access this day) ---
    const { data: currentRow, error: fetchError } = await supabase
      .from("itinerary_days")
      .select("*")
      .eq("day_id", dayId)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return Response.json({ error: "Day not found" } satisfies PatchDayErrorBody, { status: 404 });
      }
      throw fetchError;
    }

    const before = currentRow as ItineraryDay;

    // --- 2. Apply the update ---
    const { data: updatedRow, error: updateError } = await supabase
      .from("itinerary_days")
      .update({ locked: body.locked })
      .eq("day_id", dayId)
      .select()
      .single();

    if (updateError) throw updateError;

    const after = updatedRow as ItineraryDay;

    // --- 3. Append change log entry ---
    const summary = after.locked
      ? `Locked day ${after.date}`
      : `Unlocked day ${after.date}`;

    await appendChangeLogEntry(
      supabase,
      tripId,
      user.id,
      "manual_edit",
      summary,
      { locked: before.locked },
      { locked: after.locked },
      { day_id: dayId, date: after.date }
    );

    const responseBody: PatchDayResponseBody = { day: after };
    return Response.json(responseBody, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update day.";
    return Response.json({ error: message } satisfies PatchDayErrorBody, { status: 500 });
  }
}
