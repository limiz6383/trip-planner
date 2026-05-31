/**
 * POST /api/trips/[id]/consult/confirm
 *
 * Persists a completed TripBrief to trip_briefs. Auth-gated.
 * Does NOT generate an itinerary — that is the next milestone.
 *
 * Request body:
 *   {
 *     brief: LLMTripBrief   // all required fields must be present
 *   }
 *
 * Response (200):
 *   {
 *     briefId: string    // the persisted brief_id
 *   }
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: string }
 *   500  { error: string }
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import { upsertTripBrief } from "@/lib/db/queries";
import type { LLMTripBrief } from "@/lib/types";

export interface ConfirmRequestBody {
  brief: LLMTripBrief;
}

export interface ConfirmResponseBody {
  briefId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tripId } = await params;
  if (!tripId) {
    return Response.json({ error: "Missing trip id" }, { status: 400 });
  }

  let body: ConfirmRequestBody;
  try {
    body = (await request.json()) as ConfirmRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { brief } = body;

  // Validate all required LLMTripBrief fields are present
  if (
    !brief ||
    typeof brief.destination !== "string" ||
    !brief.destination.trim() ||
    typeof brief.start_date !== "string" ||
    !brief.start_date ||
    typeof brief.end_date !== "string" ||
    !brief.end_date ||
    typeof brief.daily_budget_usd !== "number" ||
    !Array.isArray(brief.vibe_keywords) ||
    !brief.party_composition ||
    typeof brief.party_composition.adults !== "number" ||
    typeof brief.local_touristy_dial !== "number" ||
    !Array.isArray(brief.dietary_constraints) ||
    !Array.isArray(brief.accessibility_needs) ||
    !brief.pace
  ) {
    return Response.json(
      { error: "brief is missing required fields" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    const persisted = await upsertTripBrief(supabase, tripId, {
      destination: brief.destination,
      start_date: brief.start_date,
      end_date: brief.end_date,
      daily_budget_usd: brief.daily_budget_usd,
      vibe_keywords: brief.vibe_keywords,
      party_composition: brief.party_composition,
      local_touristy_dial: brief.local_touristy_dial,
      dietary_constraints: brief.dietary_constraints,
      accessibility_needs: brief.accessibility_needs,
      pace: brief.pace,
    });

    const responseBody: ConfirmResponseBody = { briefId: persisted.brief_id };
    return Response.json(responseBody, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save trip brief.";
    return Response.json({ error: message }, { status: 500 });
  }
}
