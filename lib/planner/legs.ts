/**
 * Multi-city sanity: legs must form a clean chain, every day belongs to the
 * city its date says it does, and a city-to-city transfer day actually has a
 * transfer on it. Pure module.
 *
 * Convention (matches the generator and persistence): the day one leg ends is
 * the day the next begins, and that shared date belongs to the city being
 * travelled TO.
 */

export interface LegLike {
  city: string;
  arrival_date: string;
  departure_date: string;
}

const short = (c: string | null | undefined) => (c ?? "").split(",")[0].trim().toLowerCase();

/** Error message for an unusable leg chain, or null. Legs may be in any order. */
export function validateLegs(legs: readonly LegLike[]): string | null {
  const sorted = [...legs].sort((a, b) => a.arrival_date.localeCompare(b.arrival_date));
  for (const l of sorted) {
    if (l.departure_date < l.arrival_date) {
      return `${short(l.city) || "A city"}: departure must be on or after arrival.`;
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.arrival_date < prev.departure_date) {
      return `${short(cur.city)} starts on ${cur.arrival_date}, before ${short(prev.city)} ends on ${prev.departure_date}. Cities can't overlap.`;
    }
    if (cur.arrival_date > prev.departure_date) {
      return `There is a gap between ${short(prev.city)} (ends ${prev.departure_date}) and ${short(cur.city)} (starts ${cur.arrival_date}). Start each city on the day the previous one ends.`;
    }
  }
  return null;
}

/** The leg a date belongs to (arriving city wins on a transfer day). */
export function legForDate<L extends LegLike>(date: string, legs: readonly L[]): L | null {
  const sorted = [...legs].sort((a, b) => a.arrival_date.localeCompare(b.arrival_date));
  const arrivingIndex = sorted.findIndex((l, i) => i > 0 && l.arrival_date === date);
  if (arrivingIndex > 0) return sorted[arrivingIndex];
  return sorted.find((l) => date >= l.arrival_date && date <= l.departure_date) ?? null;
}

interface DayLike {
  date: string;
  city?: string;
  activities: { activity_type?: string | null; name?: string }[];
}

/**
 * Forces each day's `city` to the leg its date belongs to (the model sometimes
 * drifts; silently) and reports transfer days that have no transport activity. Mutates
 * `days`; returns human-readable warnings.
 */
export function alignDaysToLegs(
  days: DayLike[],
  legs: readonly LegLike[] | undefined
): string[] {
  const warnings: string[] = [];
  if (!legs || legs.length < 2) return warnings;
  const sorted = [...legs].sort((a, b) => a.arrival_date.localeCompare(b.arrival_date));
  days.forEach((day, index) => {
    const leg = legForDate(day.date, sorted);
    if (!leg) return;
    // A wrong or stale city label is corrected silently: the date decides, and
    // persistence assigns days to legs by date anyway. Nothing for the traveller to do.
    day.city = leg.city;
    const li = sorted.indexOf(leg);
    const isTransferDay = li > 0 && sorted[li].arrival_date === day.date;
    if (isTransferDay) {
      const hasTransfer = day.activities.some((a) => a.activity_type === "transport");
      if (!hasTransfer) {
        warnings.push(
          `Day ${index + 1} is the move from ${short(sorted[li - 1].city)} to ${short(leg.city)} but has no transfer scheduled.`
        );
      }
    }
  });
  return warnings;
}

// ---------------------------------------------------------------------------
// Date helpers + chaining for the trip form
// ---------------------------------------------------------------------------

export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().split("T")[0];
}

export function daysBetweenISO(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export interface LegDraftLike {
  city: string;
  arrival: string;
  departure: string;
}

/**
 * Re-chains the legs after `from` so each starts the day the previous one ends,
 * preserving every leg's length. Used when the traveller moves a city or edits
 * a date, so the visible order is always the chronological (= planned) order.
 */
export function rechainLegs<L extends LegDraftLike>(legs: readonly L[], from = 0): L[] {
  const out = legs.map((l) => ({ ...l }));
  for (let i = Math.max(1, from + 1); i < out.length; i++) {
    const len = out[i].arrival && out[i].departure ? Math.max(0, daysBetweenISO(out[i].arrival, out[i].departure)) : 2;
    out[i].arrival = out[i - 1].departure;
    out[i].departure = addDaysISO(out[i].arrival, len);
  }
  return out;
}

/** Moves leg `i` by `dir` and re-chains from the earliest start so order == dates. */
export function moveLegChronologically<L extends LegDraftLike>(legs: readonly L[], i: number, dir: -1 | 1): L[] {
  const j = i + dir;
  if (j < 0 || j >= legs.length) return [...legs];
  const start = legs[0].arrival;
  const next = legs.map((l) => ({ ...l }));
  [next[i], next[j]] = [next[j], next[i]];
  next[0].departure = addDaysISO(start, Math.max(0, daysBetweenISO(next[0].arrival, next[0].departure)));
  next[0].arrival = start;
  return rechainLegs(next, 0);
}
