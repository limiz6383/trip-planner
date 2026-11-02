/**
 * Re-times a day after ONE activity was edited (new start time and/or
 * duration). Pure, framework-free, so it can be unit-tested with plain Node.
 *
 * Rules:
 * - Only the duration changed (same start): everything after it shifts by how
 *   far its end moved, as before.
 * - The start time changed: the activity MOVES to its new slot. Nothing else is
 *   shifted by the size of the move; only activities that would now overlap it
 *   are pushed to start after it (and those pushes chain forward). The rest of
 *   the day keeps its times.
 * - Exception: when the edited activity is the day's arrival (the first
 *   activity, of type transport or accommodation), nothing can happen before
 *   it, so every other activity is kept after it, in order.
 * - Locked activities never move; times never go past 23:59.
 */

export interface CascadeActivity {
  activity_id: string;
  start_time: string | null;
  estimated_time_hours: number | null;
  activity_type: string | null;
  locked: boolean;
  sort_order: number;
}

export function parseClock(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

export function minutesToHHMM(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Where a start time sorts within a day. Times before 04:00 belong to the END
 * of the day (a 00:15 hotel check-in after an 23:00 arrival), never the start.
 */
export const LATE_NIGHT_CUTOFF = 4 * 60;
export function clockSortKey(t: string | null | undefined): number | null {
  const m = parseClock(t);
  if (m == null) return null;
  return m < LATE_NIGHT_CUTOFF ? m + 24 * 60 : m;
}

/** Sort comparator for a day's activities: by clock (late-night last, untimed last), then sort_order. */
export function compareByClock(
  a: { start_time: string | null; sort_order: number },
  b: { start_time: string | null; sort_order: number }
): number {
  const am = clockSortKey(a.start_time);
  const bm = clockSortKey(b.start_time);
  if (am == null && bm == null) return a.sort_order - b.sort_order;
  if (am == null) return 1;
  if (bm == null) return -1;
  if (am !== bm) return am - bm;
  return a.sort_order - b.sort_order;
}

function endMinutes(a: CascadeActivity): number | null {
  const s = parseClock(a.start_time);
  if (s == null) return null;
  return s + (a.estimated_time_hours != null ? a.estimated_time_hours * 60 : 0);
}

const byClock = compareByClock;

const ARRIVAL_TYPES = new Set(["transport", "accommodation"]);

/**
 * Returns the day's activities (edited one replaced, sorted by time) and the
 * other activities whose start_time changed, for persisting.
 */
export function cascadeAfterEdit<T extends CascadeActivity>(
  acts: T[],
  updated: T
): { activities: T[]; changed: { activity_id: string; start_time: string }[] } {
  const editedIdx = acts.findIndex((a) => a.activity_id === updated.activity_id);
  if (editedIdx === -1) return { activities: [...acts].sort(byClock), changed: [] };
  const old = acts[editedIdx];
  const replaced = acts.map((a) => (a.activity_id === updated.activity_id ? updated : a));

  const newStart = parseClock(updated.start_time);
  const oldStart = parseClock(old.start_time);
  const changed = new Map<string, string>();
  const setStart = (a: T, mins: number): T => {
    const hhmm = minutesToHHMM(mins);
    if (hhmm === a.start_time) return a;
    changed.set(a.activity_id, hhmm);
    return { ...a, start_time: hhmm };
  };

  // --- Duration-only change: shift the rest of the day by the end delta. ---
  if (newStart === oldStart) {
    const newEnd = endMinutes(updated);
    const oldEnd = endMinutes(old);
    const delta = newEnd != null && oldEnd != null ? newEnd - oldEnd : 0;
    const out = replaced.map((a, i) => {
      if (delta === 0 || i <= editedIdx || a.locked) return a;
      const s = parseClock(a.start_time);
      return s == null ? a : setStart(a, s + delta);
    });
    return { activities: out.sort(byClock), changed: toList(changed) };
  }

  if (newStart == null) {
    return { activities: replaced.sort(byClock), changed: [] };
  }

  // --- Start changed. Order the day, then push overlaps forward. ---
  const isArrival =
    editedIdx === 0 && ARRIVAL_TYPES.has(old.activity_type ?? "");
  let ordered: T[];
  let from: number;
  if (isArrival) {
    const others = replaced.filter((a) => a.activity_id !== updated.activity_id);
    ordered = [updated, ...others];
    from = 0;
  } else {
    ordered = [...replaced].sort(byClock);
    from = ordered.findIndex((a) => a.activity_id === updated.activity_id);
  }

  let cursor = endMinutes(updated) ?? newStart;
  for (let i = from + 1; i < ordered.length; i++) {
    const a = ordered[i];
    const s = parseClock(a.start_time);
    if (s == null) continue;
    if (!a.locked && s < cursor) {
      ordered[i] = setStart(a, cursor);
    }
    cursor = Math.max(cursor, endMinutes(ordered[i]) ?? cursor);
  }

  return { activities: ordered.sort(byClock), changed: toList(changed) };
}

function toList(m: Map<string, string>) {
  return [...m].map(([activity_id, start_time]) => ({ activity_id, start_time }));
}
