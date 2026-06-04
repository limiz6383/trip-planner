/**
 * Deterministic travel-preference learning.
 *
 * Aggregates signals from a traveller's past trips into a PreferenceProfile —
 * no LLM, so it's free and instant. The query layer gathers the raw signals
 * (activity types chosen, briefs, reviews); this module is the pure logic.
 */

import type { ActivityType, TripPace, PriceSensitivity } from "@/lib/types";

/** Activity types that reflect taste (logistics like transport/accommodation excluded). */
const PREFERENCE_TYPES: ActivityType[] = [
  "food",
  "culture",
  "outdoor",
  "shopping",
  "entertainment",
];

export interface ProfileSignals {
  /** activity_type of every activity across the traveller's past itineraries */
  activityTypes: (ActivityType | null)[];
  /** pace from each past brief */
  paces: (TripPace | null)[];
  /** daily_budget_usd from each past brief */
  budgets: number[];
  /** local_touristy_dial (0 local … 1 touristy) from each past brief */
  localityDials: number[];
  /** place reviews (rating 1-5) for like/dislike signal */
  reviews: { activity_type: ActivityType | null; rating: number }[];
}

export interface ComputedProfile {
  liked_activity_types: ActivityType[];
  disliked_activity_types: ActivityType[];
  price_sensitivity: PriceSensitivity | null;
  travel_pace: TripPace | null;
  locality_preference: number;
}

export function computeProfile(s: ProfileSignals): ComputedProfile {
  // Frequency of taste-bearing activity types.
  const counts = new Map<ActivityType, number>();
  for (const t of s.activityTypes) {
    if (t && PREFERENCE_TYPES.includes(t)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  // Average review rating per type.
  const rev = new Map<ActivityType, { sum: number; n: number }>();
  for (const r of s.reviews) {
    if (!r.activity_type) continue;
    const e = rev.get(r.activity_type) ?? { sum: 0, n: 0 };
    e.sum += r.rating;
    e.n += 1;
    rev.set(r.activity_type, e);
  }

  const liked = new Set<ActivityType>();
  const disliked = new Set<ActivityType>();

  // Liked = the types that recur (>= 2 times), top 4 by frequency.
  [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .forEach(([t]) => liked.add(t));

  // Reviews override frequency: highly-rated → liked, poorly-rated → disliked.
  for (const [t, { sum, n }] of rev) {
    const avg = sum / n;
    if (avg >= 4) liked.add(t);
    if (avg <= 2) {
      disliked.add(t);
      liked.delete(t);
    }
  }

  // Pace = the mode across past briefs.
  const paceCounts = new Map<TripPace, number>();
  for (const p of s.paces) if (p) paceCounts.set(p, (paceCounts.get(p) ?? 0) + 1);
  const travel_pace =
    [...paceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Price sensitivity from average daily budget (lower budget = more sensitive).
  let price_sensitivity: PriceSensitivity | null = null;
  if (s.budgets.length > 0) {
    const avg = s.budgets.reduce((x, y) => x + y, 0) / s.budgets.length;
    price_sensitivity = avg < 120 ? "high" : avg <= 300 ? "mid" : "low";
  }

  const locality_preference =
    s.localityDials.length > 0
      ? Math.round(
          (s.localityDials.reduce((x, y) => x + y, 0) / s.localityDials.length) *
            100
        ) / 100
      : 0.5;

  return {
    liked_activity_types: [...liked],
    disliked_activity_types: [...disliked],
    price_sensitivity,
    travel_pace,
    locality_preference,
  };
}

/** True when there's enough signal to be worth showing/using. */
export function hasPreferenceSignal(p: ComputedProfile): boolean {
  return (
    p.liked_activity_types.length > 0 ||
    p.disliked_activity_types.length > 0 ||
    p.travel_pace !== null ||
    p.price_sensitivity !== null
  );
}
