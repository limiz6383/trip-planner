import { test } from "node:test";
import assert from "node:assert/strict";
import { requestedStartTime, resolveStartTime } from "./activity-edit.ts";

test("parses 12-hour times", () => {
  assert.equal(requestedStartTime("breakfast at 8am"), "08:00");
  assert.equal(requestedStartTime("Dinner 7:30 PM please"), "19:30");
  assert.equal(requestedStartTime("lunch at 12pm"), "12:00");
  assert.equal(requestedStartTime("coffee 12 am"), "00:00");
  assert.equal(requestedStartTime("brunch at 10 a.m."), "10:00");
});

test("parses 24-hour times and noon", () => {
  assert.equal(requestedStartTime("move to 18:45"), "18:45");
  assert.equal(requestedStartTime("lunch at noon"), "12:00");
});

test("ignores text with no time", () => {
  assert.equal(requestedStartTime("something cheaper"), null);
  assert.equal(requestedStartTime("find 3 options"), null);
  assert.equal(requestedStartTime("a 2 hour tour"), null);
});

test("typed time beats the model, then model beats current", () => {
  assert.equal(resolveStartTime("breakfast at 8am", "09:00", "10:00"), "08:00");
  assert.equal(resolveStartTime("cheaper", "09:15", "10:00"), "09:15");
  assert.equal(resolveStartTime("cheaper", "nonsense", "10:00"), "10:00");
  assert.equal(resolveStartTime("cheaper", undefined, null), null);
});
