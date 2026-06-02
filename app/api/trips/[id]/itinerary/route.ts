/**
 * POST /api/trips/[id]/itinerary
 *
 * Generates and persists a new itinerary for a trip that has a confirmed
 * TripBrief. Auth-gated.
 *
 * Request body: (empty — all data is derived server-side from the trip brief)
 *
 * Response (200):
 *   {
 *     itinerary: Itinerary   // hydrated: itinerary.days[].activities[] populated
 *   }
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: "No confirmed trip brief found for this trip." }
 *   500  { error: string }   — missing API key, LLM error, or DB error
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getTripBrief, getBookingForTrip, createItineraryFromLLMOutput, appendChangeLogEntry } from "@/lib/db/queries";
import { createPlannerEngine } from "@/lib/planner/engine";
import type { Itinerary } from "@/lib/types";

// ---- response shape (exported so client components can import) ----

export interface GenerateItineraryResponseBody {
  itinerary: Itinerary;
}

export interface GenerateItineraryErrorBody {
  error: string;
}

// ---- handler ----

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth gate
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tripId } = await params;
  if (!tripId) {
    return Response.json({ error: "Missing trip id" }, { status: 400 });
  }

  // Guard: ANTHROPIC_API_KEY must be present — fail clearly instead of crashing
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured on the server. " +
          "Add it to .env.local.",
      },
      { status: 500 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    // --- 1. Load the confirmed brief (required) ---
    const brief = await getTripBrief(supabase, tripId);
    if (!brief) {
      return Response.json(
        { error: "No confirmed trip brief found for this trip." },
        { status: 400 }
      );
    }

    // --- 2. Load the booking (optional — null is fine; generation proceeds without it) ---
    const booking = await getBookingForTrip(supabase, tripId);

    // --- 3. Run the planner pipeline (fetch posts → rank → generate) ---
    const engine = createPlannerEngine(supabase);
    const { itinerary: llmItinerary } = await engine.plan({ brief, booking });

    // --- 4. Persist and return the hydrated itinerary ---
    const persisted = await createItineraryFromLLMOutput(
      supabase,
      tripId,
      llmItinerary
    );

    // --- 5. Record the initial plan in the change log (non-fatal) ---
    try {
      const dayCount = persisted.days?.length ?? 0;
      await appendChangeLogEntry(
        supabase,
        tripId,
        user.id,
        "consulting_plan",
        `Initial itinerary generated for ${llmItinerary.destination} (${dayCount} ${dayCount === 1 ? "day" : "days"})`,
        null,
        {
          itinerary_id: persisted.itinerary_id,
          version: persisted.version,
          destination: llmItinerary.destination,
          total_cost_estimate: llmItinerary.total_cost_estimate,
        },
        null
      );
    } catch {
      // Change log write failing must not break the primary response
    }

    const responseBody: GenerateItineraryResponseBody = {
      itinerary: persisted,
    };
    return Response.json(responseBody, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Itinerary generation failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
