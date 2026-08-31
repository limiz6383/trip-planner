/**
 * GET /api/trips/[id]/guide
 *
 * Returns a destination overview (what the city is known for, the spots people
 * usually hit, must-try foods) shown alongside the itinerary. For multi-city
 * trips this returns ONE guide per city (per leg); each guide is generated once
 * via the LLM and cached on its leg row, so repeat views cost nothing. Trips
 * with no legs (pre-migration / fallback) get a single guide cached on the trip
 * row. Auth-gated.
 *
 * Response (200): { guides: CityGuide[] }
 * Errors: 401 unauthorized, 404 trip not found, 500 (incl. ANTHROPIC_API_KEY
 * not configured, or the destination_guide column not yet migrated — the UI
 * treats failures as "no guide" and simply hides the panel).
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  getTripById,
  getLegsForTrip,
  setLegDestinationGuide,
  setTripDestinationGuide,
} from "@/lib/db/queries";
import { createPlannerEngine } from "@/lib/planner/engine";
import type { DestinationGuide } from "@/lib/types";
import { isLLMConfigured } from "@/lib/llm/availability";

export interface CityGuide {
  city: string;
  guide: DestinationGuide;
}

export interface GuideResponseBody {
  guides: CityGuide[];
}

export interface GuideErrorBody {
  error: string;
}

const MISSING_KEY_MESSAGE =
  "ANTHROPIC_API_KEY is not configured on the server.";

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

    const engine = createPlannerEngine(supabase);
    const legs = await getLegsForTrip(supabase, tripId);

    // --- Multi-city: one guide per leg, generated + cached per leg ---
    if (legs.length > 0) {
      const guides: CityGuide[] = [];

      for (const leg of legs) {
        // Cache hit → no LLM call.
        if (leg.destination_guide) {
          guides.push({ city: leg.city, guide: leg.destination_guide });
          continue;
        }

        if (!isLLMConfigured()) {
          return Response.json(
            { error: MISSING_KEY_MESSAGE } satisfies GuideErrorBody,
            { status: 500 }
          );
        }

        const guide = await engine.generateDestinationGuide(leg.city);
        // Cache on the leg (non-fatal: if the column isn't migrated yet this
        // throws and is caught below — the client hides the panel).
        await setLegDestinationGuide(supabase, leg.leg_id, guide);
        guides.push({ city: leg.city, guide });
      }

      return Response.json(
        { guides } satisfies GuideResponseBody,
        { status: 200 }
      );
    }

    // --- Fallback (pre-migration / no legs): single guide on the trip row ---
    // Cache hit → no LLM call.
    if (trip.destination_guide) {
      return Response.json(
        {
          guides: [
            { city: trip.destination, guide: trip.destination_guide },
          ],
        } satisfies GuideResponseBody,
        { status: 200 }
      );
    }

    if (!isLLMConfigured()) {
      return Response.json(
        { error: MISSING_KEY_MESSAGE } satisfies GuideErrorBody,
        { status: 500 }
      );
    }
    if (!trip.destination?.trim()) {
      return Response.json(
        { error: "Trip has no destination." } satisfies GuideErrorBody,
        { status: 400 }
      );
    }

    const guide = await engine.generateDestinationGuide(trip.destination);
    await setTripDestinationGuide(supabase, tripId, guide);

    return Response.json(
      {
        guides: [{ city: trip.destination, guide }],
      } satisfies GuideResponseBody,
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
