import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTripWideImpact, buildRippleInstruction } from "./ripple.ts";

const last = { dayNumber: 6, dayCount: 6 };
const mid = { dayNumber: 3, dayCount: 6 };
const first = { dayNumber: 1, dayCount: 6 };

test("leaving early on the last day is a trip-wide departure change", () => {
  for (const t of [
    "I'm leaving early on the last day",
    "we have to leave at 6am",
    "my flight is at 7:00, need to be at the airport early",
    "checkout is early and we depart before 9",
  ]) {
    const d = detectTripWideImpact(t, last);
    assert.equal(d?.kind, "departure", t);
  }
});

test("mentioning the last day works from any day (e.g. from the chat)", () => {
  assert.equal(detectTripWideImpact("leaving early on the last day", mid)?.kind, "departure");
  assert.equal(detectTripWideImpact("leaving early on the last day", null)?.kind, "departure");
});

test("late arrival on day 1 is an arrival change", () => {
  assert.equal(detectTripWideImpact("our flight lands late, around 11pm", first)?.kind, "arrival");
});

test("a mid-trip ferry time is a transfer change", () => {
  assert.equal(detectTripWideImpact("the ferry leaves at 8am", mid)?.kind, "transfer");
});

test("ordinary day-level asks stay inside the day", () => {
  for (const t of [
    "more outdoorsy",
    "make the morning cheaper",
    "add a museum",
    "swap dinner for something local",
    "start the day later with a slow breakfast",
    "visit the airport viewpoint museum",
    "catch the sunrise early",
    "take a taxi to dinner at 8pm",
    "arrive at the temple early",
  ]) {
    assert.equal(detectTripWideImpact(t, mid), null, t);
  }
});

test("empty instruction is ignored", () => {
  assert.equal(detectTripWideImpact("   ", last), null);
});

test("the composed instruction keeps the user's words and names the cascade", () => {
  const text = buildRippleInstruction({
    userInstruction: "I'm leaving early on the last day",
    dayDate: "2026-08-29",
    dayNumber: 6,
    dayCount: 6,
    kind: "departure",
  });
  assert.match(text, /I'm leaving early on the last day/);
  assert.match(text, /Day 5:.*late-evening/);
  assert.match(text, /airport transfer/);
  assert.match(text, /Re-estimate every cost/);
});
