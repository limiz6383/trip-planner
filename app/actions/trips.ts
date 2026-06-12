"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  createTrip,
  createTripLegs,
  setTripArchived,
  deleteTrip,
  type TripLegInput,
} from "@/lib/db/queries";
import { requireUser } from "@/lib/auth";

export type TripActionState = { error?: string } | undefined;

interface LegDraft {
  city: string;
  arrival: string;
  departure: string;
}

export async function createTripAction(
  _prevState: TripActionState,
  formData: FormData
): Promise<TripActionState> {
  // Verify authentication (also redirects if not authed)
  const user = await requireUser();

  const title = String(formData.get("title") ?? "").trim();

  // Parse the city legs (multi-city). The form always submits a `legs` JSON array.
  let legs: LegDraft[];
  try {
    legs = JSON.parse(String(formData.get("legs") ?? "[]")) as LegDraft[];
  } catch {
    return { error: "Could not read the cities. Please try again." };
  }

  legs = (Array.isArray(legs) ? legs : [])
    .map((l) => ({
      city: String(l.city ?? "").trim(),
      arrival: String(l.arrival ?? "").trim(),
      departure: String(l.departure ?? "").trim(),
    }))
    .filter((l) => l.city && l.arrival && l.departure);

  if (!title) return { error: "Trip name is required." };
  if (legs.length === 0) return { error: "Add at least one city with dates." };
  if (legs.some((l) => l.departure < l.arrival)) {
    return { error: "Each city's departure must be on or after its arrival." };
  }

  // Chronological order = leg order. Trip dates are the outer envelope.
  legs.sort((a, b) => a.arrival.localeCompare(b.arrival));
  const startDate = legs[0].arrival;
  const endDate = legs[legs.length - 1].departure;
  // Denormalized label, e.g. "Athens → Santorini" (city part before any comma).
  const destination = legs.map((l) => l.city.split(",")[0].trim()).join(" → ");

  const supabase = await createSupabaseServerClient();

  let trip;
  try {
    trip = await createTrip(supabase, {
      title,
      destination,
      start_date: startDate,
      end_date: endDate,
      owner_id: user.id,
    });
    const legInputs: TripLegInput[] = legs.map((l) => ({
      city: l.city,
      arrival_date: l.arrival,
      departure_date: l.departure,
    }));
    await createTripLegs(supabase, trip.trip_id, legInputs);
  } catch (err) {
    // Supabase/Postgrest errors are plain objects, not Error instances —
    // log the full shape so the real cause (RLS, constraint, etc.) is visible.
    console.error("createTrip failed:", JSON.stringify(err, null, 2));
    const message =
      err && typeof err === "object" && "message" in err &&
      typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : err instanceof Error
          ? err.message
          : "Failed to create trip.";
    return { error: message };
  }

  redirect(`/trips/${trip.trip_id}`);
}

// ---------------------------------------------------------------------------
// Archive / Unarchive
// ---------------------------------------------------------------------------

export type TripMutationState = { error?: string } | undefined;

async function setArchived(
  tripId: string,
  archived: boolean
): Promise<TripMutationState> {
  await requireUser();

  if (!tripId) return { error: "Trip ID is required." };

  const supabase = await createSupabaseServerClient();

  try {
    await setTripArchived(supabase, tripId, archived);
  } catch (err) {
    console.error("setTripArchived failed:", JSON.stringify(err, null, 2));
    const message =
      err && typeof err === "object" && "message" in err &&
      typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : err instanceof Error
          ? err.message
          : "Failed to update trip.";
    return { error: message };
  }

  revalidatePath("/dashboard");
}

export async function archiveTripAction(
  _prevState: TripMutationState,
  formData: FormData
): Promise<TripMutationState> {
  return setArchived(String(formData.get("trip_id") ?? "").trim(), true);
}

export async function unarchiveTripAction(
  _prevState: TripMutationState,
  formData: FormData
): Promise<TripMutationState> {
  return setArchived(String(formData.get("trip_id") ?? "").trim(), false);
}

// ---------------------------------------------------------------------------
// Delete (permanent)
// ---------------------------------------------------------------------------

export async function deleteTripAction(
  _prevState: TripMutationState,
  formData: FormData
): Promise<TripMutationState> {
  await requireUser();

  const tripId = String(formData.get("trip_id") ?? "").trim();
  if (!tripId) return { error: "Trip ID is required." };

  const supabase = await createSupabaseServerClient();

  try {
    await deleteTrip(supabase, tripId);
  } catch (err) {
    console.error("deleteTrip failed:", JSON.stringify(err, null, 2));
    const message =
      err && typeof err === "object" && "message" in err &&
      typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : err instanceof Error
          ? err.message
          : "Failed to delete trip.";
    return { error: message };
  }

  revalidatePath("/dashboard");
}
