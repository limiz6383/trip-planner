/**
 * Geography checks for a day's plan.
 *
 * The model is asked for approximate lat/lon per activity, and ranked community
 * posts carry reliable coordinates for named venues. We resolve a coordinate for
 * each stop (model value if it looks valid, else a venue lookup by place name),
 * measure the day's walking/driving path, and compare it with the best
 * ordering of the *movable* stops.
 *
 * Re-ordering is deliberately conservative:
 *   - only unlocked sightseeing-type stops move (meals, transport, check-in and
 *     locked items are time anchors and stay where they are);
 *   - stops swap TIME SLOTS with each other, so the day's rhythm (meals, lunch
 *     break) is unchanged;
 *   - a swap is accepted only if it saves a meaningful distance AND leaves no
 *     activity overlapping the next one.
 * Anything we cannot fix safely is reported as a warning instead.
 *
 * Pure module (no runtime imports) so it runs under node:test.
 */

export interface GeoActivity {
  name: string;
  place_name?: string | null;
  start_time?: string | null;
  estimated_time_hours?: number | null;
  activity_type?: string | null;
  locked?: boolean;
  lat?: number | null;
  lon?: number | null;
}

export interface Venue {
  place_name: string;
  location_lat: number | null;
  location_lon: number | null;
}

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_KM = 6371;

export function haversineKm(a: LatLon, b: LatLon): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidCoord(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0) // the classic "unknown" placeholder
  );
}

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildVenueIndex(venues: readonly Venue[]): Map<string, LatLon> {
  const idx = new Map<string, LatLon>();
  for (const v of venues) {
    if (!isValidCoord(v.location_lat, v.location_lon)) continue;
    const key = norm(v.place_name);
    if (key) idx.set(key, { lat: v.location_lat as number, lon: v.location_lon as number });
  }
  return idx;
}

/** Model coordinate if valid, else an exact venue match on place name / name. */
export function resolveCoords(
  a: GeoActivity,
  venues: ReadonlyMap<string, LatLon>
): LatLon | null {
  if (isValidCoord(a.lat, a.lon)) return { lat: a.lat as number, lon: a.lon as number };
  for (const candidate of [a.place_name, a.name]) {
    const key = norm(candidate);
    if (!key) continue;
    const exact = venues.get(key);
    if (exact) return exact;
  }
  // "Lunch at Lokal" vs venue "Lokal": accept a whole-word containment match.
  const hay = ` ${norm(a.name)} ${norm(a.place_name)} `;
  for (const [key, ll] of venues) {
    if (key.length >= 4 && hay.includes(` ${key} `)) return ll;
  }
  return null;
}

export function pathKm(points: readonly LatLon[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  return km;
}

function startMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m);
  return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
}

function toHHMM(mins: number): string {
  const c = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

/** Kinds of stop that keep their time slot and position. */
function isAnchor(a: GeoActivity): boolean {
  if (a.locked) return true;
  const t = a.activity_type ?? "";
  return t === "food" || t === "transport" || t === "accommodation";
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

export interface RouteReport {
  /** Stops with a resolved coordinate. */
  located: number;
  total: number;
  pathKm: number;
  /** Shortest path found by re-ordering the movable stops (== pathKm if none). */
  bestKm: number;
  /** True when re-ordering the movable stops would save a meaningful distance. */
  zigzag: boolean;
}

export const ZIGZAG_MIN_SAVING_KM = 2;
export const ZIGZAG_MIN_SAVING_RATIO = 0.25;
/** Brute force is exact and instant up to this many movable stops. */
const MAX_MOVABLE = 7;

interface Plan {
  order: GeoActivity[]; // chronological input order
  coords: (LatLon | null)[];
  movableIdx: number[]; // indexes (into order) of movable, located stops
}

function planFor(
  activities: readonly GeoActivity[],
  venues: ReadonlyMap<string, LatLon>
): Plan {
  const order = [...activities];
  const coords = order.map((a) => resolveCoords(a, venues));
  const movableIdx: number[] = [];
  order.forEach((a, i) => {
    if (!isAnchor(a) && coords[i] && startMinutes(a.start_time) != null) movableIdx.push(i);
  });
  return { order, coords, movableIdx };
}

function pathOfAssignment(plan: Plan, perm: number[] | null): number {
  const pts: LatLon[] = [];
  const slotToMovable = new Map<number, number>();
  if (perm) plan.movableIdx.forEach((slot, k) => slotToMovable.set(slot, perm[k]));
  plan.order.forEach((_, i) => {
    const src = slotToMovable.has(i) ? (slotToMovable.get(i) as number) : i;
    const c = plan.coords[src];
    if (c) pts.push(c);
  });
  return pathKm(pts);
}

/**
 * Activities must be in chronological order. Reports the day's path length and
 * whether a better ordering of the movable stops exists.
 */
export function analyzeDayRoute(
  activities: readonly GeoActivity[],
  venues: ReadonlyMap<string, LatLon>
): RouteReport {
  const plan = planFor(activities, venues);
  const located = plan.coords.filter(Boolean).length;
  const base = pathOfAssignment(plan, null);
  let best = base;
  if (plan.movableIdx.length >= 2 && plan.movableIdx.length <= MAX_MOVABLE) {
    for (const perm of permutations(plan.movableIdx)) {
      best = Math.min(best, pathOfAssignment(plan, perm));
    }
  }
  const saving = base - best;
  return {
    located,
    total: plan.order.length,
    pathKm: base,
    bestKm: best,
    zigzag: saving >= ZIGZAG_MIN_SAVING_KM && saving >= base * ZIGZAG_MIN_SAVING_RATIO,
  };
}

function overlapFree(order: GeoActivity[], toleranceMin = 10): boolean {
  const timed = order
    .map((a) => ({ s: startMinutes(a.start_time), d: (a.estimated_time_hours ?? 0) * 60 }))
    .filter((x): x is { s: number; d: number } => x.s != null)
    .sort((a, b) => a.s - b.s);
  for (let i = 1; i < timed.length; i++) {
    if (timed[i - 1].s + timed[i - 1].d > timed[i].s + toleranceMin) return false;
  }
  return true;
}

export interface ReorderResult<A extends GeoActivity> {
  activities: A[];
  changed: boolean;
  before: RouteReport;
  /** Path length after the change (== before.pathKm when unchanged). */
  afterKm: number;
  /** Set when the day zig-zags but no safe reordering was possible. */
  unresolved: boolean;
}

/**
 * Re-orders the movable stops of one day (swapping their time slots) when that
 * saves a meaningful distance and keeps the schedule overlap-free. Returns the
 * activities in chronological order either way.
 */
export function reorderDayForGeography<A extends GeoActivity>(
  activities: readonly A[],
  venues: ReadonlyMap<string, LatLon>
): ReorderResult<A> {
  const sorted = [...activities].sort(
    (a, b) => (startMinutes(a.start_time) ?? 1e9) - (startMinutes(b.start_time) ?? 1e9)
  );
  const before = analyzeDayRoute(sorted, venues);
  const unchanged: ReorderResult<A> = {
    activities: sorted,
    changed: false,
    before,
    afterKm: before.pathKm,
    unresolved: false,
  };
  if (!before.zigzag) return unchanged;

  const plan = planFor(sorted, venues);
  const slots = plan.movableIdx.map((i) => ({
    start: sorted[i].start_time as string,
  }));
  const candidates = permutations(plan.movableIdx)
    .map((perm) => ({ perm, km: pathOfAssignment(plan, perm) }))
    .sort((a, b) => a.km - b.km);

  for (const { perm, km } of candidates) {
    if (before.pathKm - km < ZIGZAG_MIN_SAVING_KM) break;
    const next = sorted.map((a) => ({ ...a })) as A[];
    plan.movableIdx.forEach((slotIdx, k) => {
      const moved = sorted[perm[k]];
      next[slotIdx] = { ...moved, start_time: slots[k].start } as A;
    });
    if (!overlapFree(next)) continue;
    const ordered = next.sort(
      (a, b) => (startMinutes(a.start_time) ?? 1e9) - (startMinutes(b.start_time) ?? 1e9)
    );
    return { activities: ordered, changed: true, before, afterKm: km, unresolved: false };
  }
  return { ...unchanged, unresolved: true };
}

/** "08:30" style normaliser used when slots are rewritten. */
export { toHHMM };
