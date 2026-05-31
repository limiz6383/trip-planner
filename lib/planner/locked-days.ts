/**
 * Locked-days / re-plan-preserving logic.
 *
 * When a user triggers a re-plan mid-trip (e.g. after a flight delay or a
 * spontaneous detour), any day they have marked as "locked" — or any day
 * that is already in the past relative to the current date — must be
 * preserved verbatim in the new itinerary.
 *
 * This module provides pure helpers for:
 *   1. Deriving the set of locked dates + activity IDs from an existing itinerary.
 *   2. Merging a newly generated itinerary back with the locked days.
 *   3. Validating that an LLM-generated itinerary honoured the locked constraints.
 */

import type {
  Itinerary,
  ItineraryDay,
  Activity,
  LLMItinerary,
  LLMItineraryDay,
  LockedDaysConstraint,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Derive constraints from an existing itinerary
// ---------------------------------------------------------------------------

/**
 * Computes the LockedDaysConstraint from a fully-loaded Itinerary (with
 * `days` and nested `activities` populated via joins).
 *
 * A day is locked if:
 *   - `day.locked === true` (user explicitly locked it), OR
 *   - the day's date is before `currentDate` (already lived; can't replan the past)
 *
 * @param itinerary   The current itinerary with days and activities loaded.
 * @param currentDate ISO date string representing today (YYYY-MM-DD).
 */
export function deriveLockedConstraint(
  itinerary: Itinerary & { days: (ItineraryDay & { activities: Activity[] })[] },
  currentDate: string
): LockedDaysConstraint {
  const lockedDates: string[] = [];
  const lockedActivityIds: string[] = [];

  for (const day of itinerary.days) {
    const isPast = day.date < currentDate;
    const isExplicitlyLocked = day.locked;

    if (isPast || isExplicitlyLocked) {
      lockedDates.push(day.date);
      // All activities on a locked day are also locked
      for (const activity of day.activities) {
        lockedActivityIds.push(activity.activity_id);
      }
    } else {
      // Day is not locked but individual activities may be
      for (const activity of day.activities) {
        if (activity.locked) {
          lockedActivityIds.push(activity.activity_id);
        }
      }
    }
  }

  return { lockedDates, lockedActivityIds, currentDate };
}

// ---------------------------------------------------------------------------
// Merge locked days into a freshly generated LLM itinerary
// ---------------------------------------------------------------------------

/**
 * Merges the locked days from an existing itinerary into a newly LLM-generated
 * itinerary, replacing any generated content for those dates.
 *
 * The LLM is instructed to leave locked dates empty (or skip them), but this
 * function provides a deterministic fallback guarantee regardless of LLM output.
 *
 * @param generated   Fresh LLM output.
 * @param existing    The current persisted itinerary (days + activities loaded).
 * @param constraint  The locked constraint produced by deriveLockedConstraint.
 * @returns           A merged LLMItinerary where locked days come from the existing
 *                    itinerary and all other days come from the generated itinerary.
 */
export function mergeLockedDays(
  generated: LLMItinerary,
  existing: Itinerary & { days: (ItineraryDay & { activities: Activity[] })[] },
  constraint: LockedDaysConstraint
): LLMItinerary {
  const lockedDateSet = new Set(constraint.lockedDates);

  // Build a map from date -> existing day for locked dates
  const existingByDate = new Map<
    string,
    ItineraryDay & { activities: Activity[] }
  >();
  for (const day of existing.days) {
    if (lockedDateSet.has(day.date)) {
      existingByDate.set(day.date, day);
    }
  }

  // Build the merged day list: union of all dates from both sources
  const allDates = new Set<string>([
    ...generated.days.map((d) => d.date),
    ...constraint.lockedDates,
  ]);

  const sortedDates = Array.from(allDates).sort();

  const mergedDays: LLMItineraryDay[] = sortedDates.map((date) => {
    if (lockedDateSet.has(date) && existingByDate.has(date)) {
      const existingDay = existingByDate.get(date)!;
      return {
        date,
        daily_cost: existingDay.daily_cost ?? 0,
        activities: existingDay.activities.map((a) => ({
          name: a.name,
          description: a.description ?? "",
          estimated_time_hours: a.estimated_time_hours ?? 1,
          estimated_cost_usd: a.estimated_cost_usd ?? 0,
          place_name: a.place_name ?? "",
          source_attribution: a.source_attribution ?? "",
          activity_type: a.activity_type ?? "other",
        })),
      };
    }

    // Use the generated day; fall back to an empty day if the LLM skipped it
    const generatedDay = generated.days.find((d) => d.date === date);
    return (
      generatedDay ?? {
        date,
        daily_cost: 0,
        activities: [],
      }
    );
  });

  return {
    ...generated,
    days: mergedDays,
    total_cost_estimate: mergedDays.reduce((sum, d) => sum + (d.daily_cost ?? 0), 0),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates that a generated itinerary honours all locked constraints.
 *
 * Returns a list of violation descriptions (empty = valid).
 * Used for defensive checks before persisting LLM output.
 *
 * TODO (M2): surface these violations back to the UI and trigger a re-generation.
 */
export function validateLockedConstraints(
  generated: LLMItinerary,
  constraint: LockedDaysConstraint
): string[] {
  const violations: string[] = [];
  const lockedDateSet = new Set(constraint.lockedDates);

  for (const date of lockedDateSet) {
    const day = generated.days.find((d) => d.date === date);
    if (!day) {
      violations.push(`Locked date ${date} is missing from generated itinerary`);
    }
  }

  return violations;
}
