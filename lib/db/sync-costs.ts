/**
 * Keeps stored daily_cost / total_cost_estimate consistent with the activities.
 * Route handlers call this after every mutation that can change a cost: edit,
 * delete, move between days, activity revise, day revise.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDayById, syncItineraryCosts } from "@/lib/db/queries";

export interface SyncedCosts {
  total_cost_estimate: number;
  days: { day_id: string; daily_cost: number }[];
}

/** Resyncs the itinerary that owns `dayId`. Non-fatal: returns null on failure. */
export async function syncCostsForDay(
  client: SupabaseClient,
  dayId: string
): Promise<SyncedCosts | null> {
  try {
    const day = await getDayById(client, dayId);
    if (!day) return null;
    return await syncItineraryCosts(client, day.itinerary_id);
  } catch (err) {
    console.error("[costs] sync failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
