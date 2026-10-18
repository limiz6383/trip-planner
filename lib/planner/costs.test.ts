import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sumActivityCosts,
  summarizeBudget,
  travellerCount,
  deriveItineraryCosts,
  normalizeLLMCosts,
} from "./costs.ts";

test("sums valid costs and ignores null, NaN and negative values", () => {
  assert.equal(
    sumActivityCosts([
      { estimated_cost_usd: 8.5 },
      { estimated_cost_usd: 0.1 },
      { estimated_cost_usd: 0.2 },
      { estimated_cost_usd: null },
      { estimated_cost_usd: Number.NaN },
      { estimated_cost_usd: -50 },
      {},
    ]),
    8.8
  );
  assert.equal(sumActivityCosts(undefined), 0);
});

test("editing one activity changes its day and the trip total, nothing else", () => {
  const days = [
    { day_id: "a", activities: [{ estimated_cost_usd: 100 }, { estimated_cost_usd: 20 }] },
    { day_id: "b", activities: [{ estimated_cost_usd: 50 }] },
  ];
  const before = deriveItineraryCosts(days);
  assert.deepEqual(before, {
    days: [
      { day_id: "a", daily_cost: 120 },
      { day_id: "b", daily_cost: 50 },
    ],
    total: 170,
  });
  days[0].activities[0].estimated_cost_usd = 40; // user edits the price
  const after = deriveItineraryCosts(days);
  assert.equal(after.days[0].daily_cost, 60);
  assert.equal(after.days[1].daily_cost, 50);
  assert.equal(after.total, 110);
  days[0].activities.pop(); // user deletes an activity
  assert.equal(deriveItineraryCosts(days).total, 90);
});

test("normalizeLLMCosts overrides the model's wrong arithmetic", () => {
  const it = {
    total_cost_estimate: 2460,
    days: [
      { daily_cost: 480, activities: [{ estimated_cost_usd: 45 }, { estimated_cost_usd: 60 }] },
      { daily_cost: 10, activities: [{ estimated_cost_usd: 30 }] },
    ],
  };
  normalizeLLMCosts(it);
  assert.equal(it.days[0].daily_cost, 105);
  assert.equal(it.days[1].daily_cost, 30);
  assert.equal(it.total_cost_estimate, 135);
});

test("travellerCount counts adults and children, never less than 1", () => {
  assert.equal(travellerCount({ adults: 3 }), 3);
  assert.equal(travellerCount({ adults: 2, children: 1 }), 3);
  assert.equal(travellerCount(null), 1);
  assert.equal(travellerCount({ adults: 0 }), 1);
});

test("budget summary: per-traveller daily budget scales by party and days", () => {
  const s = summarizeBudget({
    dailyBudgetUsd: 150,
    party: { adults: 3 },
    dayCount: 6,
    planned: 2085,
  });
  assert.ok(s);
  assert.equal(s.budgetTotal, 2700);
  assert.equal(s.remaining, 615);
  assert.equal(s.status, "under");
  const over = summarizeBudget({ dailyBudgetUsd: 100, party: { adults: 1 }, dayCount: 2, planned: 250 });
  assert.equal(over?.remaining, -50);
  assert.equal(over?.status, "over");
  const near = summarizeBudget({ dailyBudgetUsd: 100, party: { adults: 1 }, dayCount: 2, planned: 185 });
  assert.equal(near?.status, "near");
  assert.equal(summarizeBudget({ dailyBudgetUsd: 0, party: null, dayCount: 3, planned: 1 }), null);
});
