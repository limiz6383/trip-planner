import { test } from "node:test";
import assert from "node:assert/strict";
import {
  haversineKm,
  isValidCoord,
  buildVenueIndex,
  resolveCoords,
  analyzeDayRoute,
  reorderDayForGeography,
  type GeoActivity,
} from "./geo.ts";

// Real Athens-ish points. North-to-south: Gazi (west), Syntagma (centre),
// Acropolis (south), Kifissia (far north, ~12 km).
const P = {
  acropolis: { lat: 37.9715, lon: 23.7257 },
  plaka: { lat: 37.9726, lon: 23.7305 },
  agora: { lat: 37.9746, lon: 23.7222 },
  kifissia: { lat: 38.0738, lon: 23.8112 },
  piraeus: { lat: 37.9427, lon: 23.6469 },
};

const stop = (
  name: string,
  start: string,
  c?: { lat: number; lon: number },
  extra: Partial<GeoActivity> = {}
): GeoActivity => ({
  name,
  place_name: name,
  start_time: start,
  estimated_time_hours: 1.5,
  activity_type: "culture",
  ...(c ?? {}),
  ...extra,
});

const none = new Map();

test("haversine is roughly right (Acropolis to Kifissia ~ 13-14 km)", () => {
  const km = haversineKm(P.acropolis, P.kifissia);
  assert.ok(km > 12 && km < 16, String(km));
});

test("coordinate validation rejects 0,0 and out-of-range values", () => {
  assert.equal(isValidCoord(0, 0), false);
  assert.equal(isValidCoord(95, 10), false);
  assert.equal(isValidCoord(37.9, 23.7), true);
  assert.equal(isValidCoord("37", 23), false);
});

test("coordinates fall back to the ranked venue list by place name", () => {
  const idx = buildVenueIndex([
    { place_name: "Taverna Psaras", location_lat: 37.973, location_lon: 23.7315 },
    { place_name: "No Coords", location_lat: null, location_lon: null },
  ]);
  const c = resolveCoords({ name: "Dinner at Taverna Psaras", place_name: "" }, idx);
  assert.deepEqual(c, { lat: 37.973, lon: 23.7315 });
  assert.equal(resolveCoords({ name: "Mystery", place_name: "Nowhere" }, idx), null);
  // model coordinates win over the venue list
  assert.deepEqual(
    resolveCoords({ name: "x", lat: 1, lon: 2, place_name: "Taverna Psaras" }, idx),
    { lat: 1, lon: 2 }
  );
});

test("a tidy day is not flagged", () => {
  const day = [
    stop("Acropolis", "09:00", P.acropolis),
    stop("Plaka stroll", "11:30", P.plaka),
    stop("Ancient Agora", "14:00", P.agora),
  ];
  assert.equal(analyzeDayRoute(day, none).zigzag, false);
});

test("a zig-zag day (south, far north, south, far north) is flagged and reordered", () => {
  const day = [
    stop("Acropolis", "09:00", P.acropolis),
    stop("Kifissia park", "11:30", P.kifissia),
    stop("Ancient Agora", "14:00", P.agora),
    stop("Kifissia museum", "16:30", { lat: 38.0745, lon: 23.8101 }),
  ];
  const report = analyzeDayRoute(day, none);
  assert.equal(report.zigzag, true);
  assert.ok(report.pathKm > report.bestKm * 2);

  const fixed = reorderDayForGeography(day, none);
  assert.equal(fixed.changed, true);
  assert.ok(fixed.afterKm < fixed.before.pathKm / 2, `${fixed.afterKm} vs ${fixed.before.pathKm}`);
  // Same four stops, same four time slots, no duplicates, still chronological.
  assert.deepEqual(fixed.activities.map((a) => a.start_time), ["09:00", "11:30", "14:00", "16:30"]);
  assert.equal(new Set(fixed.activities.map((a) => a.name)).size, 4);
  // Kifissia stops are now adjacent.
  const names = fixed.activities.map((a) => a.name);
  const k = names.map((n, i) => (n.startsWith("Kifissia") ? i : -1)).filter((i) => i >= 0);
  assert.equal(Math.abs(k[0] - k[1]), 1);
});

test("meals, transport and locked stops never move", () => {
  const day = [
    stop("Acropolis", "09:00", P.acropolis),
    stop("Kifissia park", "11:00", P.kifissia),
    stop("Lunch", "13:00", P.plaka, { activity_type: "food" }),
    stop("Agora", "15:00", P.agora),
    stop("Kifissia museum", "17:00", { lat: 38.0745, lon: 23.8101 }, { locked: true }),
  ];
  const out = reorderDayForGeography(day, none);
  const byName = new Map(out.activities.map((a) => [a.name, a.start_time]));
  assert.equal(byName.get("Lunch"), "13:00");
  assert.equal(byName.get("Kifissia museum"), "17:00");
});

test("a swap that would cause an overlap is refused and reported as unresolved", () => {
  const day = [
    stop("Acropolis", "09:00", P.acropolis, { estimated_time_hours: 0.5 }),
    stop("Kifissia park", "09:45", P.kifissia, { estimated_time_hours: 0.5 }),
    // Long stop in the third slot; moving it earlier would collide with the next one.
    stop("Agora", "10:30", P.agora, { estimated_time_hours: 5 }),
    stop("Kifissia museum", "12:00", { lat: 38.0745, lon: 23.8101 }, { estimated_time_hours: 0.25 }),
  ];
  const out = reorderDayForGeography(day, none);
  if (out.changed) {
    // If a different, safe permutation exists, it must be overlap-free.
    const t = out.activities.map((a) => [a.start_time, a.estimated_time_hours]);
    for (let i = 1; i < t.length; i++) {
      const prev = t[i - 1];
      const [h, m] = (prev[0] as string).split(":").map(Number);
      const [h2, m2] = (t[i][0] as string).split(":").map(Number);
      assert.ok(h * 60 + m + (prev[1] as number) * 60 <= h2 * 60 + m2 + 10);
    }
  } else {
    assert.equal(out.unresolved, true);
  }
});

test("days without coordinates are left alone", () => {
  const day = [stop("A", "09:00"), stop("B", "11:00"), stop("C", "14:00")];
  const out = reorderDayForGeography(day, none);
  assert.equal(out.changed, false);
  assert.equal(out.unresolved, false);
  assert.equal(out.before.located, 0);
});
