import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreUntouchedDays } from "./locked-days.ts";
import { MAX_ACTIVITIES_PER_DAY, MAX_ACTIVITIES_PER_REVISED_DAY } from "./limits.ts";
import type { LLMItinerary, LLMItineraryDay, LLMActivity } from "../types/index.ts";

const act = (name: string, start: string): LLMActivity => ({
  name,
  description: "",
  start_time: start,
  estimated_time_hours: 1,
  estimated_cost_usd: 10,
  place_name: "",
  source_attribution: "",
  activity_type: "other",
});

const day = (date: string, acts: LLMActivity[], cost: number): LLMItineraryDay => ({
  date,
  daily_cost: cost,
  activities: acts,
});

const itinerary = (days: LLMItineraryDay[]): LLMItinerary => ({
  destination: "Vienna",
  start_date: days[0].date,
  end_date: days[days.length - 1].date,
  days,
  total_cost_estimate: days.reduce((s, d) => s + d.daily_cost, 0),
  notes: "",
});

const original = itinerary([
  day("2026-12-27", [act("Arrive", "23:00")], 10),
  day("2026-12-28", [act("Schönbrunn", "10:00"), act("Concert", "20:15")], 50),
  day("2026-12-29", [act("Bratislava", "10:00")], 40),
  day("2026-12-30", [act("Museum", "09:00"), act("Train", "13:00")], 30),
]);

test("days outside the affected set come back exactly as they were", () => {
  const revised = itinerary([
    day("2026-12-27", [act("Arrive", "23:00")], 10),
    day("2026-12-28", [act("Schönbrunn", "20:15"), act("Concert", "20:15")], 99),
    day("2026-12-29", [act("Bratislava", "10:00")], 40),
    day("2026-12-30", [act("Museum", "08:00"), act("Train", "13:00"), act("Old Town", "18:00")], 45),
  ]);
  const out = restoreUntouchedDays(revised, original, ["2026-12-29", "2026-12-30"]);

  // Dec 28 was rewritten by the model but isn't reachable by a Dec 30 change.
  assert.equal(out.days[1].activities[0].start_time, "10:00");
  assert.equal(out.days[1].daily_cost, 50);
  // The affected day keeps the model's changes.
  assert.equal(out.days[3].activities.length, 3);
  assert.equal(out.total_cost_estimate, 10 + 50 + 40 + 45);
});

test("a revised day with no original counterpart is kept", () => {
  const revised = itinerary([...original.days, day("2026-12-31", [act("New", "10:00")], 5)]);
  const out = restoreUntouchedDays(revised, original, ["2026-12-30"]);
  assert.equal(out.days.length, 5);
  assert.equal(out.days[4].activities[0].name, "New");
});

test("revisions get headroom above the generation cap for explicit adds", () => {
  assert.ok(MAX_ACTIVITIES_PER_REVISED_DAY > MAX_ACTIVITIES_PER_DAY);
});
