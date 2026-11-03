/**
 * GET  /api/trips/[id]/logistics  — returns the trip's flights + accommodations.
 * POST /api/trips/[id]/logistics  — replaces both lists (optional, multi-city).
 *
 * Auth-gated. Lists are optional — empty arrays are valid (clears them).
 *
 * POST body:
 *   {
 *     flights:        Array<{ from_airport, to_airport, depart_date, depart_time }>,
 *     accommodations: Array<{ name, neighborhood, lat, lon, check_in, check_out }>
 *   }
 * Response (200): { flights: TripFlight[], accommodations: TripAccommodation[] }
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  getFlightsForTrip,
  getAccommodationsForTrip,
  replaceFlightsForTrip,
  replaceAccommodationsForTrip,
  type FlightInput,
  type AccommodationInput,
} from "@/lib/db/queries";
import type { TripFlight, TripAccommodation } from "@/lib/types";

export interface LogisticsRequestBody {
  flights: FlightInput[];
  accommodations: AccommodationInput[];
}
export interface LogisticsResponseBody {
  flights: TripFlight[];
  accommodations: TripAccommodation[];
}
export interface LogisticsErrorBody {
  error: string;
}

/** Supabase throws plain PostgrestError objects, not Error instances. */
function errorMessage(err: unknown, fallback: string): string {
  if (
    err && typeof err === "object" && "message" in err &&
    typeof (err as { message?: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return fallback;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" } satisfies LogisticsErrorBody, {
      status: 401,
    });
  }
  const { id: tripId } = await params;
  try {
    const supabase = await createSupabaseServerClient();
    const [flights, accommodations] = await Promise.all([
      getFlightsForTrip(supabase, tripId),
      getAccommodationsForTrip(supabase, tripId),
    ]);
    return Response.json(
      { flights, accommodations } satisfies LogisticsResponseBody,
      { status: 200 }
    );
  } catch (err) {
    console.error("[logistics GET]", err);
    const message = errorMessage(err, "Failed to load logistics.");
    return Response.json({ error: message } satisfies LogisticsErrorBody, {
      status: 500,
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" } satisfies LogisticsErrorBody, {
      status: 401,
    });
  }
  const { id: tripId } = await params;

  let body: LogisticsRequestBody;
  try {
    body = (await request.json()) as LogisticsRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" } satisfies LogisticsErrorBody, {
      status: 400,
    });
  }

  const flights = Array.isArray(body.flights) ? body.flights : [];
  const accommodations = Array.isArray(body.accommodations)
    ? body.accommodations
    : [];

  try {
    const supabase = await createSupabaseServerClient();
    const [savedFlights, savedStays] = await Promise.all([
      replaceFlightsForTrip(supabase, tripId, flights),
      replaceAccommodationsForTrip(supabase, tripId, accommodations),
    ]);
    return Response.json(
      { flights: savedFlights, accommodations: savedStays } satisfies LogisticsResponseBody,
      { status: 200 }
    );
  } catch (err) {
    console.error("[logistics POST]", err);
    const message = errorMessage(err, "Failed to save logistics.");
    return Response.json({ error: message } satisfies LogisticsErrorBody, {
      status: 500,
    });
  }
}
