/**
 * GET /api/trips/[id]/guide
 *
 * Returns a destination overview (what the city is known for, the spots people
 * usually hit, must-try foods) shown alongside the itinerary. Generated once
 * per trip via the LLM and cached on the trip row, so repeat views cost
 * nothing. Auth-gated.
 *
 * Response (200): { guide: DestinationGuide }
 * Errors: 401 unauthorized, 400 missing trip/destination, 500 (incl. the
 * destination_guide column not yet migrated — the UI treats this as "no guide"
 * and simply hides the panel).
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getTripById, setTripDestinationGuide } from "@/lib/db/queries";
import { createPlannerEngine } from "@/lib/planner/engine";
import type { DestinationGuide } from "@/lib/types";

export interface GuideResponseBody {
  guide: DestinationGuide;
}

export interface GuideErrorBody {
  error: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" } satisfies GuideErrorBody, {
      status: 401,
    });
  }

  const { id: tripId } = await params;
  if (!tripId) {
    return Response.json(
      { error: "Missing trip id" } satisfies GuideErrorBody,
      { status: 400 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    const trip = await getTripById(supabase, tripId);
    if (!trip) {
      return Response.json(
        { error: "Trip not found" } satisfies GuideErrorBody,
        { status: 404 }
      );
    }

    // Cached → return immediately (no LLM call).
    if (trip.destination_guide) {
      return Response.json(
        { guide: trip.destination_guide } satisfies GuideResponseBody,
        { status: 200 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY is not configured on the server." } satisfies GuideErrorBody,
        { status: 500 }
      );
    }
    if (!trip.destination?.trim()) {
      return Response.json(
        { error: "Trip has no destination." } satisfies GuideErrorBody,
        { status: 400 }
      );
    }

    const engine = createPlannerEngine(supabase);
    const guide = await engine.generateDestinationGuide(trip.destination);

    // Cache it (non-fatal: if the column isn't migrated yet this throws and is
    // caught below — the client still gets nothing and hides the panel).
    await setTripDestinationGuide(supabase, tripId, guide);

    return Response.json(
      { guide } satisfies GuideResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to build destination guide.";
    return Response.json({ error: message } satisfies GuideErrorBody, {
      status: 500,
    });
  }
}
