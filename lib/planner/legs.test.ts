import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLegs, legForDate, alignDaysToLegs } from "./legs.ts";

const paros = { city: "Paros Municipality, Aegean, Greece", arrival_date: "2026-08-24", departure_date: "2026-08-27" };
const athens = { city: "Athens, Attica, Greece", arrival_date: "2026-08-27", departure_date: "2026-08-29" };

test("a clean chain (shared transfer date) is valid, in any input order", () => {
  assert.equal(validateLegs([paros, athens]), null);
  assert.equal(validateLegs([athens, paros]), null);
});

test("overlaps, gaps and reversed legs are rejected with a readable message", () => {
  assert.match(validateLegs([paros, { ...athens, arrival_date: "2026-08-26" }]) ?? "", /overlap/);
  assert.match(validateLegs([paros, { ...athens, arrival_date: "2026-08-28" }]) ?? "", /gap/);
  assert.match(validateLegs([{ ...paros, departure_date: "2026-08-20" }]) ?? "", /on or after arrival/);
});

test("the transfer date belongs to the arriving city", () => {
  assert.equal(legForDate("2026-08-26", [paros, athens])?.city, paros.city);
  assert.equal(legForDate("2026-08-27", [paros, athens])?.city, athens.city);
  assert.equal(legForDate("2026-08-29", [paros, athens])?.city, athens.city);
  assert.equal(legForDate("2026-09-30", [paros, athens]), null);
});

test("day cities are corrected to the date's leg and a missing transfer is flagged", () => {
  const days = [
    { date: "2026-08-26", city: "Athens", activities: [{ activity_type: "food" }] },
    { date: "2026-08-27", city: "Paros", activities: [{ activity_type: "culture" }] },
    { date: "2026-08-28", activities: [] },
  ];
  const w = alignDaysToLegs(days, [paros, athens]);
  assert.equal(days[0].city, paros.city);
  assert.equal(days[1].city, athens.city);
  assert.equal(days[2].city, athens.city);
  assert.ok(w.some((x) => /Day 1 was labelled athens/.test(x)));
  assert.ok(w.some((x) => /Day 2 is the move from paros municipality to athens but has no transfer/.test(x)));
});

test("single-city trips are untouched", () => {
  const days = [{ date: "2026-08-26", city: "X", activities: [] }];
  assert.deepEqual(alignDaysToLegs(days, [paros]), []);
  assert.equal(days[0].city, "X");
});
