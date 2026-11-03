import type { FixedPlan } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Cleans the fixed-plan list the consulting model emitted: keeps entries with a
 * non-empty description, and drops a date or time that isn't well-formed
 * rather than dropping the whole plan.
 */
export function sanitizeFixedPlans(input: unknown): FixedPlan[] {
  if (!Array.isArray(input)) return [];
  const plans: FixedPlan[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const description =
      typeof r.description === "string" ? r.description.trim() : "";
    if (!description) continue;
    const str = (v: unknown, re: RegExp) =>
      typeof v === "string" && re.test(v.trim()) ? v.trim() : null;
    plans.push({
      description: description.slice(0, 500),
      date: str(r.date, DATE_RE),
      start_time: str(r.start_time, TIME_RE),
      end_time: str(r.end_time, TIME_RE),
    });
  }
  return plans.slice(0, 50);
}
