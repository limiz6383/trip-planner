/**
 * GET  /api/trips/[id]/booking  — returns the current booking for a trip, or null.
 * POST /api/trips/[id]/booking  — upserts booking fields (all optional/nullable).
 *
 * Auth-gated. Uses RLS-safe upsertBooking which requires the user to own or
 * collaborate on the trip.
 *
 * POST request body (all fields optional):
 *   {
 *     flight_arrival_date?:       string | null   // YYYY-MM-DD
 *     flight_arrival_time?:       string | null   // HH:MM
 *     flight_departure_date?:     string | null   // YYYY-MM-DD
 *     flight_departure_time?:     string | null   // HH:MM
 *     accommodation_name?:        string | null
 *     accommodation_neighborhood?: string | null
 *     accommodation_lat?:         number | null
 *     accommodation_lon?:         number | null
 *     accommodation_check_in?:    string | null   // YYYY-MM-DD
 *     accommodation_check_out?:   string | null   // YYYY-MM-DD
 *   }
 *
 * POST response (200):
 *   { booking: Booking }
 *
 * GET response (200):
 *   { booking: Booking | null }
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   500  { error: string }
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getBookingForTrip, upsertBooking } from "@/lib/db/queries";
import type { Booking } from "@/lib/types";

// ---- response shapes (exported so client components can import) ----

export interface BookingResponseBody {
  booking: Booking | null;
}

export interface BookingErrorBody {
  error: string;
}

// ---- GET ----

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" } satisfies BookingErrorBody, {
      status: 401,
    });
  }

  const { id: tripId } = await params;

  try {
    const supabase = await createSupabaseServerClient();
    const booking = await getBookingForTrip(supabase, tripId);
    return Response.json({ booking } satisfies BookingResponseBody, {
      status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load booking.";
    return Response.json({ error: message } satisfies BookingErrorBody, {
      status: 500,
    });
  }
}

// ---- POST ----

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" } satisfies BookingErrorBody, {
      status: 401,
    });
  }

  const { id: tripId } = await params;

  let body: Partial<Omit<Booking, "booking_id" | "trip_id" | "created_at" | "updated_at">>;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const supabase = await createSupabaseServerClient();
    const booking = await upsertBooking(supabase, tripId, body);
    return Response.json({ booking } satisfies BookingResponseBody, {
      status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save booking.";
    return Response.json({ error: message } satisfies BookingErrorBody, {
      status: 500,
    });
  }
}
