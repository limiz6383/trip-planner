/**
 * Cost arithmetic: the single source of truth for per-day and trip totals.
 *
 * Rule: an activity's `estimated_cost_usd` is the ONLY stored input. A day's
 * cost is the sum of its activities and the trip total is the sum of its days.
 * The model's own `daily_cost` / `total_cost_estimate` are never trusted (they
 * were observed to disagree with the activities, e.g. 480 vs 105), and edits
 * must never leave stored totals stale.
 *
 * Units: activity costs are for the WHOLE PARTY. `daily_budget_usd` on the
 * brief is per TRAVELLER per day, so the trip budget is
 * daily_budget_usd * travellers * days.
 *
 * Pure module, no imports of runtime values, so it is unit-testable and safe to
 * use from both server routes and client components.
 */

export interface CostedActivity {
  estimated_cost_usd?: number | null;
}

export interface CostedDay<A extends CostedActivity = CostedActivity> {
  activities?: A[] | null;
}

/** Rounds to cents so decimal costs (8.5) don't accumulate float noise. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sum of valid (finite, non-negative) activity costs. */
export function sumActivityCosts(
  activities: readonly CostedActivity[] | null | undefined
): number {
  let total = 0;
  for (const a of activities ?? []) {
    const c = a.estimated_cost_usd;
    if (typeof c === "number" && Number.isFinite(c) && c > 0) total += c;
  }
  return roundMoney(total);
}

export function sumDayCosts(
  days: readonly CostedDay[] | null | undefined
): number {
  let total = 0;
  for (const d of days ?? []) total += sumActivityCosts(d.activities);
  return roundMoney(total);
}

/** Travellers who count toward the per-person budget (infants are free). */
export function travellerCount(
  party: { adults?: number; children?: number } | null | undefined
): number {
  const adults = Math.max(0, Math.floor(party?.adults ?? 0));
  const children = Math.max(0, Math.floor(party?.children ?? 0));
  return Math.max(1, adults + children);
}

export type BudgetStatus = "under" | "near" | "over";

export interface BudgetSummary {
  /** daily_budget_usd * travellers * days */
  budgetTotal: number;
  /** Planned spend (sum of activity costs). */
  planned: number;
  /** budgetTotal - planned (negative when over budget). */
  remaining: number;
  /** Per-day budget for the whole party. */
  partyDailyBudget: number;
  travellers: number;
  days: number;
  /** "near" = within 10% of the budget (but not over). */
  status: BudgetStatus;
}

export function summarizeBudget(input: {
  dailyBudgetUsd: number | null | undefined;
  party: { adults?: number; children?: number } | null | undefined;
  dayCount: number;
  planned: number;
}): BudgetSummary | null {
  const { dailyBudgetUsd, dayCount, planned } = input;
  if (
    typeof dailyBudgetUsd !== "number" ||
    !Number.isFinite(dailyBudgetUsd) ||
    dailyBudgetUsd <= 0 ||
    dayCount <= 0
  ) {
    return null;
  }
  const travellers = travellerCount(input.party);
  const partyDailyBudget = roundMoney(dailyBudgetUsd * travellers);
  const budgetTotal = roundMoney(partyDailyBudget * dayCount);
  const remaining = roundMoney(budgetTotal - planned);
  const status: BudgetStatus =
    remaining < 0 ? "over" : remaining <= budgetTotal * 0.1 ? "near" : "under";
  return {
    budgetTotal,
    planned,
    remaining,
    partyDailyBudget,
    travellers,
    days: dayCount,
    status,
  };
}

/** Recomputes every day's cost + the trip total from the activities. */
export function deriveItineraryCosts<
  D extends CostedDay & { day_id: string },
>(days: readonly D[]): { days: { day_id: string; daily_cost: number }[]; total: number } {
  const perDay = days.map((d) => ({
    day_id: d.day_id,
    daily_cost: sumActivityCosts(d.activities),
  }));
  return {
    days: perDay,
    total: roundMoney(perDay.reduce((s, d) => s + d.daily_cost, 0)),
  };
}

/**
 * Normalises a model-produced itinerary in place so stored totals always equal
 * the sum of the activities. Returns the same object for chaining.
 */
export function normalizeLLMCosts<
  T extends {
    total_cost_estimate: number;
    days: { daily_cost: number; activities: CostedActivity[] }[];
  },
>(itinerary: T): T {
  let total = 0;
  for (const d of itinerary.days ?? []) {
    d.daily_cost = sumActivityCosts(d.activities);
    total += d.daily_cost;
  }
  itinerary.total_cost_estimate = roundMoney(total);
  return itinerary;
}
