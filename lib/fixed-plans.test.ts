import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeFixedPlans } from "@/lib/fixed-plans";

test("keeps plans with a description and well-formed date/time", () => {
  assert.deepEqual(
    sanitizeFixedPlans([
      { description: " Ghibli Museum tickets ", date: "2026-05-03", start_time: "10:00", end_time: "12:30" },
    ]),
    [{ description: "Ghibli Museum tickets", date: "2026-05-03", start_time: "10:00", end_time: "12:30" }]
  );
});

test("nulls a malformed date or time instead of dropping the plan", () => {
  assert.deepEqual(
    sanitizeFixedPlans([{ description: "Dinner at Den", date: "Friday", start_time: "7pm" }]),
    [{ description: "Dinner at Den", date: null, start_time: null, end_time: null }]
  );
});

test("drops entries without a description and non-array input", () => {
  assert.deepEqual(sanitizeFixedPlans([{ date: "2026-05-03" }, null, "x", { description: "  " }]), []);
  assert.deepEqual(sanitizeFixedPlans(undefined), []);
  assert.deepEqual(sanitizeFixedPlans({ description: "x" }), []);
});
