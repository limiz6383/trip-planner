/**
 * Loads the real trip logistics (booking, legs, flights, stays) for planner
 * calls. Every piece is optional and non-fatal: a trip without them plans
 * exactly as before.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getBookingForTrip,
  getLegsForTrip,
  getFlightsForTrip,
  getAccommodationsForTrip,
} from "@/lib/db/queries";
import type { Booking, TripLeg, TripFlight, TripAccommodation } from "@/lib/types";

export interface TripLogistics {
  booking: Booking | null;
  legs: TripLeg[];
  flights: TripFlight[];
  accommodations: TripAccommodation[];
}

async function soft<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export async function loadTripLogistics(
  client: SupabaseClient,
  tripId: string
): Promise<TripLogistics> {
  const [booking, legs, flights, accommodations] = await Promise.all([
    soft(getBookingForTrip(client, tripId), null),
    soft(getLegsForTrip(client, tripId), [] as TripLeg[]),
    soft(getFlightsForTrip(client, tripId), [] as TripFlight[]),
    soft(getAccommodationsForTrip(client, tripId), [] as TripAccommodation[]),
  ]);
  return { booking, legs, flights, accommodations };
}
