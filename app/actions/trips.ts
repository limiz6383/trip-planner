"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createTrip } from "@/lib/db/queries";
import { requireUser } from "@/lib/auth";

export type TripActionState = { error?: string } | undefined;

export async function createTripAction(
  _prevState: TripActionState,
  formData: FormData
): Promise<TripActionState> {
  // Verify authentication (also redirects if not authed)
  await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  const destination = String(formData.get("destination") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();

  if (!title || !destination || !startDate || !endDate) {
    return { error: "All fields are required." };
  }

  if (endDate < startDate) {
    return { error: "End date must be on or after start date." };
  }

  const supabase = await createSupabaseServerClient();

  let trip;
  try {
    trip = await createTrip(supabase, {
      title,
      destination,
      start_date: startDate,
      end_date: endDate,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create trip.";
    return { error: message };
  }

  redirect(`/trips/${trip.trip_id}`);
}
