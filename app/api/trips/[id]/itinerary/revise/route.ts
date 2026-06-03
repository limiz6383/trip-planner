/**
 * POST /api/trips/[id]/itinerary/revise
 *
 * Revises the trip's current itinerary according to a free-text instruction
 * (e.g. "make it cheaper", "more outdoorsy", "less walking on day 2") and
 * persists the result as a NEW itinerary version (the previous version is
 * retained; is_current moves to the new one). Auth-gated.
 *
 * Request body:
 *   { instruction: string }
 *
 * Response (200):
 *   { itinerary: Itinerary }   // hydrated: itinerary.days[].activities[] populated
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: string }   — missing instruction / no brief / no current itinerary
 *   500  { error: string }   — missing API key, LLM error, or DB error
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  getTripBrief,
  getBookingForTrip,
  getCurrentItineraryHydrated,
  createItineraryFromLLMOutput,
  appendChangeLogEntry,
} from "@/lib/db/queries";
import { createPlannerEngine } from "@/lib/planner/engine";
import type { Itinerary } from "@/lib/types";

// ---- request / response shapes (exported so client components can import) ----

export interface ReviseItineraryRequestBody {
  instruction: string;
}

export interface ReviseItineraryResponseBody {
  itinerary: Itinerary;
}

export interface ReviseItineraryErrorBody {
  error: string;
}

// ---- handler ----

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json(
      { error: "Unauthorized" } satisfies ReviseItineraryErrorBody,
      { status: 401 }
    );
  }

  const { id: tripId } = await params;
  if (!tripId) {
    return Response.json(
      { error: "Missing trip id" } satisfies ReviseItineraryErrorBody,
      { status: 400 }
    );
  }

  // Parse + validate body
  let body: ReviseItineraryRequestBody;
  try {
    body = (await request.json()) as ReviseItineraryRequestBody;
  } catch {
    return Response.json(
      { error: "Invalid JSON body" } satisfies ReviseItineraryErrorBody,
      { status: 400 }
    );
  }

  const instruction = body.instruction?.trim();
  if (!instruction) {
    return Response.json(
      { error: "A revision instruction is required." } satisfies ReviseItineraryErrorBody,
      { status: 400 }
    );
  }

  // Guard: ANTHROPIC_API_KEY must be present — fail clearly instead of crashing
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured on the server. Add it to .env.local.",
      } satisfies ReviseItineraryErrorBody,
      { status: 500 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    // --- 1. Load the confirmed brief (required for destination + preferences) ---
    const brief = await getTripBrief(supabase, tripId);
    if (!brief) {
      return Response.json(
        { error: "No confirmed trip brief found for this trip." } satisfies ReviseItineraryErrorBody,
        { status: 400 }
      );
    }

    // --- 2. Load the current itinerary (required — nothing to revise otherwise) ---
    const currentItinerary = await getCurrentItineraryHydrated(supabase, tripId);
    if (!currentItinerary) {
      return Response.json(
        { error: "No current itinerary to revise." } satisfies ReviseItineraryErrorBody,
        { status: 400 }
      );
    }

    // --- 3. Load the booking (optional) ---
    const booking = await getBookingForTrip(supabase, tripId);

    // --- 4. Run the revision through the planner pipeline ---
    const engine = createPlannerEngine(supabase);
    const llmItinerary = await engine.reviseItinerary({
      brief,
      currentItinerary,
      instruction,
      booking,
    });

    // --- 5. Persist as a new version and return the hydrated itinerary ---
    const persisted = await createItineraryFromLLMOutput(
      supabase,
      tripId,
      llmItinerary
    );

    // --- 6. Record the revision in the change log (non-fatal) ---
    try {
      await appendChangeLogEntry(
        supabase,
        tripId,
        user.id,
        "revision",
        `Revised itinerary: "${instruction}"`,
        { itinerary_id: currentItinerary.itinerary_id, version: currentItinerary.version },
        {
          itinerary_id: persisted.itinerary_id,
          version: persisted.version,
          destination: llmItinerary.destination,
          total_cost_estimate: llmItinerary.total_cost_estimate,
        },
        { instruction }
      );
    } catch {
      // Change log write failing must not break the primary response
    }

    return Response.json(
      { itinerary: persisted } satisfies ReviseItineraryResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Itinerary revision failed.";
    return Response.json(
      { error: message } satisfies ReviseItineraryErrorBody,
      { status: 500 }
    );
  }
}
