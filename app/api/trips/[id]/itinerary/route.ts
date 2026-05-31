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
import { getTripBrief, createItineraryFromLLMOutput } from "@/lib/db/queries";
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

    // --- 2. Run the planner pipeline (fetch posts → rank → generate) ---
    const engine = createPlannerEngine(supabase);
    const { itinerary: llmItinerary } = await engine.plan({ brief });

    // --- 3. Persist and return the hydrated itinerary ---
    const persisted = await createItineraryFromLLMOutput(
      supabase,
      tripId,
      llmItinerary
    );

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
