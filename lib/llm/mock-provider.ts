/**
 * Demo-mode LLM provider.
 *
 * Implements the same LLMProvider contract as AnthropicProvider but never
 * makes a network call. Output is synthesised from the trip brief, legs, and
 * community posts so it adapts to whatever a visitor enters rather than
 * replaying one hard-coded trip.
 *
 * Deterministic by construction: the same inputs always produce the same plan,
 * which makes the demo reproducible.
 */

import { requestedStartTime } from "@/lib/planner/activity-edit";
import { travellerCount } from "@/lib/planner/costs";
import type {
  LLMProvider,
  ConsultingTurnParams,
  ConsultingTurnResult,
  GenerateItineraryParams,
  ReviseItineraryParams,
  ReviseActivityParams,
  ReviseDayParams,
  ReviseDayResult,
  DiscussItineraryParams,
} from "./provider";
import { findCityGuide } from "@/lib/mock/city-guides";
import type {
  LLMItinerary,
  LLMItineraryDay,
  LLMActivity,
  DestinationGuide,
  GuidePick,
  ActivityType,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Latency so loading states and progress overlays are actually visible. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Small deterministic hash — lets "random-looking" picks stay reproducible. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(items: T[], seed: string): T {
  return items[hash(seed) % items.length];
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && out.length < 60) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out.length > 0 ? out : [start];
}

/** Strips the ", Region, Country" tail so labels read naturally in copy. */
function shortCity(name: string): string {
  return name.split(",")[0].trim();
}

function activityCountFor(pace: string | undefined): number {
  if (pace === "relaxed") return 4;
  if (pace === "fast") return 6;
  return 5;
}

// ---------------------------------------------------------------------------
// Activity templates
// ---------------------------------------------------------------------------

interface Template {
  label: string;
  type: ActivityType;
  time: string;
  hours: number;
  cost: number;
  blurb: string;
  /** Centres on meat. Dropped for vegetarian/vegan travellers. */
  meat?: boolean;
  /** Centres on fish or shellfish. Kept for pescatarians, dropped for vegans. */
  fish?: boolean;
  /** Involves a climb or rough ground. Dropped when mobility is a constraint. */
  steep?: boolean;
  /** Contains dairy or eggs. Dropped for vegans. */
  dairy?: boolean;
}

const BREAKFAST: Template[] = [
  { label: "Breakfast at a neighbourhood bakery", type: "food", time: "08:30", hours: 1, cost: 12, blurb: "Pastries and strong coffee a short walk from the flat.", dairy: true },
  { label: "Morning market breakfast", type: "food", time: "08:15", hours: 1, cost: 14, blurb: "Fresh fruit and something hot from a market stall." },
];

const MORNING: Template[] = [
  { label: "Old town walking loop", type: "culture", time: "10:00", hours: 2, cost: 0, blurb: "A self-guided loop through the historic centre before the crowds." },
  { label: "City museum", type: "culture", time: "10:00", hours: 2, cost: 18, blurb: "The main collection, worth a slow two hours." },
  { label: "Harbour-front stroll", type: "outdoor", time: "09:45", hours: 1.5, cost: 0, blurb: "Easy waterfront walk with good photo stops." },
  { label: "Botanical gardens", type: "outdoor", time: "10:15", hours: 1.5, cost: 8, blurb: "Shaded paths and a quiet spot to reset." },
];

const LUNCH: Template[] = [
  { label: "Lunch at a family-run taverna", type: "food", time: "13:00", hours: 1, cost: 22, blurb: "Small menu, packed with locals at midday.", meat: true },
  { label: "Street-food lunch", type: "food", time: "12:45", hours: 1, cost: 15, blurb: "Quick, cheap, and the best bite of the day.", meat: true },
  { label: "Vegetarian mezze lunch", type: "food", time: "13:00", hours: 1, cost: 18, blurb: "Small sharing plates, all plant-based.", dairy: true },
  { label: "Market salad and flatbread lunch", type: "food", time: "12:45", hours: 1, cost: 14, blurb: "Built from whatever the morning market had." },
];

const AFTERNOON: Template[] = [
  { label: "Neighbourhood browse", type: "shopping", time: "15:00", hours: 1.5, cost: 25, blurb: "Independent shops and a few makers' studios." },
  { label: "Viewpoint climb", type: "outdoor", time: "15:30", hours: 1.5, cost: 5, blurb: "Steep but short, best light in late afternoon.", steep: true },
  { label: "Gallery district", type: "culture", time: "14:45", hours: 2, cost: 12, blurb: "Contemporary spaces clustered within a few blocks." },
  { label: "Swim and beach time", type: "outdoor", time: "15:00", hours: 2, cost: 0, blurb: "Flat water and easy entry, quiet on weekdays." },
];

const DINNER: Template[] = [
  { label: "Dinner at a local favourite", type: "food", time: "19:30", hours: 1.5, cost: 38, blurb: "Book ahead — it fills up by eight.", meat: true },
  { label: "Seafood dinner by the water", type: "food", time: "19:45", hours: 1.5, cost: 45, blurb: "Whatever came in that morning, simply grilled.", fish: true },
  { label: "Vegetarian kitchen dinner", type: "food", time: "19:30", hours: 1.5, cost: 32, blurb: "A set menu built around what is in season.", dairy: true },
  { label: "Garden-to-table dinner", type: "food", time: "19:45", hours: 1.5, cost: 30, blurb: "Everything grown within a few miles; entirely plant-based." },
];

const EVENING: Template[] = [
  { label: "Wine bar nightcap", type: "entertainment", time: "21:30", hours: 1, cost: 18, blurb: "Natural wine list and a short, good snack menu." },
  { label: "Dessert and mint tea", type: "food", time: "21:30", hours: 1, cost: 12, blurb: "A sweet stop on the way back to the flat.", dairy: true },
  { label: "Evening square people-watching", type: "other", time: "21:15", hours: 1, cost: 6, blurb: "The square comes alive after dinner." },
];

/**
 * Picks the template pool that fits a time of day, so a revision never moves
 * breakfast to the evening. `outdoorsy` biases non-meal slots toward outdoor
 * options when the instruction asks for them.
 */
function poolForTime(startTime: string | null, outdoorsy: boolean): Template[] {
  const t = startTime ?? "12:00";
  const outdoorOnly = (list: Template[]) => {
    const filtered = list.filter((x) => x.type === "outdoor");
    return outdoorsy && filtered.length > 0 ? filtered : list;
  };

  if (t < "10:00") return BREAKFAST;
  if (t < "12:00") return outdoorOnly(MORNING);
  if (t < "14:30") return LUNCH;
  if (t < "18:00") return outdoorOnly(AFTERNOON);
  if (t < "21:00") return DINNER;
  return EVENING;
}

/** Accent- and punctuation-insensitive comparison key. */
function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Does this activity already represent the named guide item? */
function activityMatches(a: LLMActivity, name: string): boolean {
  const needle = normalise(name.replace(/\([^)]*\)/g, " "));
  if (needle.length < 3) return false;
  const hay = normalise(`${a.name} ${a.place_name ?? ""} ${a.description ?? ""}`);
  return hay.includes(needle);
}

/**
 * Where a ticked dish belongs in the day. A pastry is not a dinner, and a
 * liqueur is not a lunch — slotting everything as "Dinner — X" reads as broken
 * the moment someone ticks a custard tart.
 */
function foodSlot(name: string): {
  time: string;
  label: (n: string) => string;
  hours: number;
  cost: number;
} {
  const n = name.toLowerCase();

  if (
    /pastry|pastel|tart|doughnut|donut|croissant|bagel|simit|bread|bun|cake|torte|strudel|churro|baklava|gelato|ice|bingsu|sweet|biscuit|cantucci|loukoumades|yatsuhashi|trdelník|trdelnik/.test(n)
  ) {
    return {
      time: "10:30",
      label: (x) => `Coffee stop — ${x}`,
      hours: 0.75,
      cost: 8,
    };
  }

  if (/breakfast|brunch/.test(n)) {
    return { time: "08:30", label: (x) => `Breakfast — ${x}`, hours: 1, cost: 14 };
  }

  if (
    /wine|beer|port|vermut|vermouth|liqueur|ginjinha|souma|coffee|melange|radler|pilsner|mezcal|tea|aperitif|raki|soju/.test(n)
  ) {
    return {
      time: "18:00",
      label: (x) => `Drinks — ${x}`,
      hours: 1,
      cost: 16,
    };
  }

  if (/sandwich|bifana|snack|street|simit|elote|esquites|supplì|suppli|taco|slice|skewer|kebab|souvlaki|lampredotto|bocadillo/.test(n)) {
    return { time: "13:00", label: (x) => `Lunch — ${x}`, hours: 1, cost: 18 };
  }

  return { time: "19:30", label: (x) => `Dinner — ${x}`, hours: 1.5, cost: 34 };
}

/**
 * Splices a ticked guide item into a day at a slot that suits it: a dish lands
 * at the right time of day for what it actually is, a spot mid-afternoon. If
 * the day is already at the cap, the lowest-value non-locked activity gives way
 * — dropping the traveller's explicit pick would be the worse failure.
 */
function insertPick(day: LLMItineraryDay, pick: GuidePick): void {
  const isFood = pick.kind === "food";
  const slot = isFood ? foodSlot(pick.name) : null;

  const activity: LLMActivity = {
    name: slot ? slot.label(pick.name) : `Visit ${pick.name}`,
    description: isFood
      ? `${pick.name} — the dish you picked from the guide.`
      : `${pick.name} — added because you picked it from the guide.`,
    start_time: slot ? slot.time : "15:00",
    estimated_time_hours: slot ? slot.hours : 2,
    estimated_cost_usd: slot ? slot.cost : 16,
    place_name: pick.name,
    source_attribution: "Your picks",
    activity_type: isFood ? "food" : "culture",
    locked: false,
  };

  const MAX = 8;
  if (day.activities.length >= MAX) {
    const victim = day.activities
      .filter((a) => !a.locked && a.activity_type !== "transport")
      .sort((a, b) => (a.estimated_cost_usd ?? 0) - (b.estimated_cost_usd ?? 0))[0];
    if (victim) {
      day.activities = day.activities.filter((a) => a !== victim);
    }
  }

  day.activities.push(activity);
}

/**
 * Narrows the template pools to what the brief actually allows.
 *
 * Vegetarian/vegan/pescatarian filter the meal pools outright — offering a
 * vegetarian "Seafood dinner by the water" is the most visible way to look
 * like the answers were ignored. Halal/kosher/gluten-free instead annotate the
 * meal, since the constraint is about how a dish is prepared rather than
 * whether the meal happens. Mobility needs drop anything that involves a climb.
 */
function poolsFor(
  dietary: string[] | undefined,
  accessibility: string[] | undefined
): Record<string, Template[]> {
  const diet = (dietary ?? []).map((d) => d.toLowerCase());
  const access = (accessibility ?? []).map((a) => a.toLowerCase());

  const vegan = diet.includes("vegan");
  const vegetarian = vegan || diet.includes("vegetarian");
  const pescatarian = diet.includes("pescatarian");
  const limitedMobility = access.some((a) =>
    /walk|mobility|wheelchair|stair|stroller/.test(a)
  );

  const allowFood = (t: Template) => {
    if (vegan && (t.meat || t.fish || t.dairy)) return false;
    if (vegetarian && (t.meat || t.fish)) return false;
    if (pescatarian && t.meat) return false;
    return true;
  };
  const allowPlace = (t: Template) => !(limitedMobility && t.steep);

  // Never return an empty pool — falling back to the unfiltered list is better
  // than generating a day with no lunch.
  const narrow = (list: Template[], ok: (t: Template) => boolean) => {
    const kept = list.filter(ok);
    return kept.length > 0 ? kept : list;
  };

  return {
    breakfast: narrow(BREAKFAST, allowFood),
    morning: narrow(MORNING, allowPlace),
    lunch: narrow(LUNCH, allowFood),
    afternoon: narrow(AFTERNOON, (t) => allowPlace(t) && allowFood(t)),
    dinner: narrow(DINNER, allowFood),
    evening: narrow(EVENING, allowFood),
  };
}

/**
 * Nudges a day's costs toward the traveller's stated daily budget.
 *
 * Without this a $50/day brief and a $500/day brief produce identical plans,
 * which is the clearest possible sign the brief was ignored. Transport is left
 * alone — a flight transfer does not get cheaper because the budget is lower.
 */
function applyBudget(day: LLMItineraryDay, dailyBudget: number | undefined): void {
  if (!dailyBudget || dailyBudget <= 0) return;

  const flexible = day.activities.filter((a) => a.activity_type !== "transport");
  const fixedCost = day.activities
    .filter((a) => a.activity_type === "transport")
    .reduce((sum, a) => sum + (a.estimated_cost_usd ?? 0), 0);
  const rawFlexible = flexible.reduce(
    (sum, a) => sum + (a.estimated_cost_usd ?? 0),
    0
  );
  if (rawFlexible <= 0) return;

  const target = Math.max(dailyBudget - fixedCost, dailyBudget * 0.25);
  const factor = Math.min(Math.max(target / rawFlexible, 0.25), 4);

  for (const a of flexible) {
    a.estimated_cost_usd = Math.max(
      1,
      Math.round((a.estimated_cost_usd ?? 0) * factor)
    );
  }
}

function toActivity(t: Template, city: string, seed: string): LLMActivity {
  return {
    name: t.label,
    description: t.blurb,
    start_time: t.time,
    estimated_time_hours: t.hours,
    estimated_cost_usd: t.cost,
    place_name: `${shortCity(city)} — ${t.label.split(" ").slice(-2).join(" ")}`,
    source_attribution: hash(seed) % 3 === 0 ? "Community post" : "",
    activity_type: t.type,
  };
}

// ---------------------------------------------------------------------------
// Reading the traveller's answers
// ---------------------------------------------------------------------------

/**
 * What the traveller has actually told us, pulled out of their own words.
 *
 * Re-derived from the whole conversation on every turn rather than accumulated
 * turn by turn: that way a later correction ("actually make it $60") simply
 * wins, and a client that mis-round-trips the partial brief can't strand a
 * stale value.
 */
interface Extracted {
  daily_budget_usd?: number;
  party_composition?: { adults: number; children?: number; infants?: number };
  pace?: "relaxed" | "moderate" | "fast";
  dietary_constraints?: string[];
  accessibility_needs?: string[];
  vibe_keywords?: string[];
  local_touristy_dial?: number;
}

const DIETARY_PATTERNS: [RegExp, string][] = [
  [/\bvegan\b/, "vegan"],
  [/\bvegetarian\b|\bveggie\b|\bno meat\b|\bdon'?t eat meat\b/, "vegetarian"],
  [/\bpescatarian\b/, "pescatarian"],
  [/\bgluten[- ]?free\b|\bceliac\b|\bcoeliac\b/, "gluten-free"],
  [/\bhalal\b/, "halal"],
  [/\bkosher\b/, "kosher"],
  [/\bdairy[- ]?free\b|\blactose\b/, "dairy-free"],
  [/\bnut allerg|\ballergic to nuts\b/, "nut allergy"],
  [/\bshellfish\b/, "no shellfish"],
  [/\bno pork\b/, "no pork"],
];

const ACCESS_PATTERNS: [RegExp, string][] = [
  [/\bwheelchair\b|\bstep[- ]?free\b/, "wheelchair access"],
  // Catches "rather not do a lot of walking", "avoid too much walking",
  // "can't walk far" — the negation and the word "walking" are often several
  // words apart, so match across the gap rather than requiring adjacency.
  [/\b(?:not|avoid|less|no|limit|minimal|hate|dislike)\b[^.!?]{0,24}\bwalk/, "limited walking"],
  [/\bcan'?t walk far\b|\btoo much walking\b/, "limited walking"],
  [/\bbad knee|\bbad back|\bbad hip|\bsore (?:knee|feet|back)\b/, "limited walking"],
  [/\bmobility\b/, "limited mobility"],
  [/\bstroller\b|\bpushchair\b|\bpram\b/, "stroller access"],
  [/\bno stairs\b|\bavoid stairs\b/, "no stairs"],
];

const VIBE_PATTERNS: [RegExp, string][] = [
  [/\bfood\b|\bfoodie\b|\beat|\brestaurant|\bculinary\b/, "food"],
  [/\bart\b|\bgaller/, "art"],
  [/\bmuseum/, "museums"],
  [/\bhistor|\bancient\b|\bruins\b/, "history"],
  [/\bnature\b|\boutdoor|\bhik|\bpark\b/, "outdoors"],
  [/\bbeach|\bswim|\bsea\b|\bcoast/, "coastal"],
  [/\bnightlife\b|\bbars?\b|\bclub|\bdrink/, "nightlife"],
  [/\bshopping\b|\bmarket/, "shopping"],
  [/\barchitect/, "architecture"],
  [/\bromantic\b|\bhoneymoon\b|\banniversary\b/, "romantic"],
  [/\bwalkab|\bwander|\bstroll/, "walkable"],
];

function extractFromText(text: string): Extracted {
  const t = text.toLowerCase();
  const out: Extracted = {};

  // --- budget -------------------------------------------------------------
  // "$60 a day", "60 per day", "around 200 a night", "budget of 150"
  const perDay =
    t.match(/\$?\s*(\d{2,5})\s*(?:usd|dollars?|bucks|\$)?\s*(?:a|per|each|\/)\s*(?:day|night|person|pp)/) ??
    t.match(/(?:budget|spend|around|about|roughly|up to|max)\s*(?:of|is|:)?\s*\$?\s*(\d{2,5})/) ??
    t.match(/\$\s*(\d{2,5})\b/);
  if (perDay) {
    const n = Number(perDay[1]);
    if (n >= 10 && n <= 100000) out.daily_budget_usd = n;
  } else if (/\bcheap\b|\bbudget\b|\bshoestring\b|\bbackpack/.test(t)) {
    out.daily_budget_usd = 80;
  } else if (/\bluxur|\bsplurge\b|\bhigh[- ]end\b|\bno budget\b|\bmoney (?:is )?no object\b/.test(t)) {
    out.daily_budget_usd = 450;
  }

  // --- party --------------------------------------------------------------
  const adultsMatch = t.match(/(\d+)\s*(?:adults?|of us|people|persons?|travell?ers?)/);
  const kidsMatch = t.match(/(\d+)\s*(?:kids?|children|child)/);
  const infantsMatch = t.match(/(\d+)\s*(?:infants?|babies|baby|toddlers?)/);
  if (adultsMatch) {
    out.party_composition = { adults: Math.min(Number(adultsMatch[1]), 12) };
  } else if (/\bjust me\b|\bsolo\b|\balone\b|\bmyself\b|\bi'?m travell?ing alone\b|\bon my own\b/.test(t)) {
    out.party_composition = { adults: 1 };
  } else if (/\bcouple\b|\btwo of us\b|\bmy (?:partner|wife|husband|girlfriend|boyfriend)\b|\bme and my\b/.test(t)) {
    out.party_composition = { adults: 2 };
  }
  if (kidsMatch) {
    out.party_composition = {
      adults: out.party_composition?.adults ?? 2,
      children: Math.min(Number(kidsMatch[1]), 10),
    };
  }
  if (infantsMatch) {
    out.party_composition = {
      adults: out.party_composition?.adults ?? 2,
      ...(out.party_composition?.children
        ? { children: out.party_composition.children }
        : {}),
      infants: Math.min(Number(infantsMatch[1]), 5),
    };
  }

  // --- pace ---------------------------------------------------------------
  if (/\brelax|\bslow\b|\bchill\b|\beasy\b|\bleisurel|\bunhurried\b|\btake it easy\b|\blaid[- ]back\b/.test(t)) {
    out.pace = "relaxed";
  } else if (/\bfast\b|\bpacked\b|\bcover a lot\b|\bsee everything\b|\bas much as\b|\bbusy\b|\bwhirlwind\b|\bcram\b/.test(t)) {
    out.pace = "fast";
  } else if (/\bmoderate\b|\bbalanced\b|\bin between\b|\bmix of both\b/.test(t)) {
    out.pace = "moderate";
  }

  // --- constraints --------------------------------------------------------
  const diet = DIETARY_PATTERNS.filter(([re]) => re.test(t)).map(([, v]) => v);
  if (diet.length > 0) out.dietary_constraints = diet;

  const access = ACCESS_PATTERNS.filter(([re]) => re.test(t)).map(([, v]) => v);
  if (access.length > 0) out.accessibility_needs = Array.from(new Set(access));

  const vibes = VIBE_PATTERNS.filter(([re]) => re.test(t)).map(([, v]) => v);
  if (vibes.length > 0) out.vibe_keywords = Array.from(new Set(vibes));

  // --- local vs touristy --------------------------------------------------
  if (/\blocal\b|\boff the beaten\b|\bauthentic\b|\bnon[- ]tourist|\bavoid tourist|\bhidden gem/.test(t)) {
    out.local_touristy_dial = 0.2;
  } else if (/\bhighlights?\b|\bmain sights?\b|\bfirst time\b|\bclassics?\b|\bmust[- ]see|\bbucket list\b/.test(t)) {
    out.local_touristy_dial = 0.8;
  }

  return out;
}

/** Later statements win, so a correction mid-conversation takes effect. */
function extractFromConversation(messages: string[]): Extracted {
  const merged: Extracted = {};
  for (const m of messages) {
    const e = extractFromText(m);
    if (e.daily_budget_usd !== undefined) merged.daily_budget_usd = e.daily_budget_usd;
    if (e.party_composition) merged.party_composition = e.party_composition;
    if (e.pace) merged.pace = e.pace;
    if (e.local_touristy_dial !== undefined) merged.local_touristy_dial = e.local_touristy_dial;
    // Constraints accumulate — mentioning a second one shouldn't erase the first.
    if (e.dietary_constraints) {
      merged.dietary_constraints = Array.from(
        new Set([...(merged.dietary_constraints ?? []), ...e.dietary_constraints])
      );
    }
    if (e.accessibility_needs) {
      merged.accessibility_needs = Array.from(
        new Set([...(merged.accessibility_needs ?? []), ...e.accessibility_needs])
      );
    }
    if (e.vibe_keywords) {
      merged.vibe_keywords = Array.from(
        new Set([...(merged.vibe_keywords ?? []), ...e.vibe_keywords])
      );
    }
  }
  return merged;
}

/** Human-readable restatement, so the traveller can see they were heard. */
function echoBrief(e: Extracted): string {
  const bits: string[] = [];
  if (e.daily_budget_usd) bits.push(`about $${e.daily_budget_usd} a day`);
  if (e.party_composition) {
    const { adults, children, infants } = e.party_composition;
    const parts = [`${adults} adult${adults === 1 ? "" : "s"}`];
    if (children) parts.push(`${children} child${children === 1 ? "" : "ren"}`);
    if (infants) parts.push(`${infants} infant${infants === 1 ? "" : "s"}`);
    bits.push(adults === 1 && !children && !infants ? "just you" : parts.join(" and "));
  }
  if (e.pace) bits.push(`a ${e.pace} pace`);
  if (e.dietary_constraints?.length) bits.push(e.dietary_constraints.join(" and "));
  if (e.accessibility_needs?.length) bits.push(e.accessibility_needs.join(" and "));
  if (e.vibe_keywords?.length) bits.push(`leaning ${e.vibe_keywords.slice(0, 3).join(", ")}`);
  return bits.join(", ");
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class MockProvider implements LLMProvider {
  async consultingTurn(
    params: ConsultingTurnParams
  ): Promise<ConsultingTurnResult> {
    await pause(600);

    const city = shortCity(params.knownTrip.destination);
    const days = datesBetween(
      params.knownTrip.start_date,
      params.knownTrip.end_date
    ).length;

    // Everything the traveller has said, including this turn. The client sends
    // history WITHOUT the in-flight message, so append it here.
    const said = [
      ...params.history.filter((m) => m.role === "user").map((m) => m.content),
      params.userMessage,
    ].filter((m) => m && !m.startsWith("__"));

    const turn = said.length;
    const heard = extractFromConversation(said);

    const brief = {
      ...params.partialBrief,
      ...params.knownTrip,
      ...heard,
    };

    // Opening turn: greet and ask the two things that shape a plan most.
    if (turn <= 1 && !heard.daily_budget_usd && !heard.pace) {
      return {
        assistantMessage: `Let's plan your ${days}-day trip to ${city}. Two things to start: roughly what are you happy to spend per day, and what kind of trip is this — relaxed and food-led, or trying to cover a lot of ground?`,
        updatedBrief: brief,
        briefComplete: false,
      };
    }

    // Ask about whatever is still missing, most load-bearing first.
    const missing: string[] = [];
    if (heard.daily_budget_usd === undefined)
      missing.push("roughly what you're happy to spend per day");
    if (!heard.party_composition) missing.push("who's travelling with you");
    if (!heard.pace)
      missing.push("whether you'd rather take it slow or pack the days");
    if (!heard.dietary_constraints && !heard.accessibility_needs && turn < 3)
      missing.push(
        "anything I should plan around — dietary needs, or anything that makes a lot of walking hard"
      );

    const ack = echoBrief(heard);
    const acknowledgement = ack ? `Got it — ${ack}.` : "Understood.";

    // Hard floor: never trap someone who won't answer. After four turns, fill
    // the gaps with sensible defaults and say so.
    const forced = turn >= 4;
    const ready = missing.length === 0;

    if (!ready && !forced) {
      const asks = missing.slice(0, 2);
      const question =
        asks.length === 1
          ? `And ${asks[0]}?`
          : `A couple more things: ${asks[0]}, and ${asks[1]}?`;
      return {
        assistantMessage: `${acknowledgement} ${question}`,
        updatedBrief: brief,
        briefComplete: false,
      };
    }

    // Complete. Every TripBrief field is required downstream, so fill any gap
    // rather than handing the confirm step a partial object.
    const defaulted: string[] = [];
    if (heard.daily_budget_usd === undefined) defaulted.push("a $150/day budget");
    if (!heard.party_composition) defaulted.push("two adults");
    if (!heard.pace) defaulted.push("a moderate pace");

    const finalBrief = {
      ...brief,
      daily_budget_usd: heard.daily_budget_usd ?? 150,
      party_composition: heard.party_composition ?? { adults: 2 },
      pace: heard.pace ?? ("moderate" as const),
      vibe_keywords: heard.vibe_keywords ?? ["food", "walkable"],
      local_touristy_dial: heard.local_touristy_dial ?? 0.4,
      dietary_constraints: heard.dietary_constraints ?? [],
      accessibility_needs: heard.accessibility_needs ?? [],
    };

    const summary = echoBrief({
      daily_budget_usd: finalBrief.daily_budget_usd,
      party_composition: finalBrief.party_composition,
      pace: finalBrief.pace,
      dietary_constraints: finalBrief.dietary_constraints,
      accessibility_needs: finalBrief.accessibility_needs,
      vibe_keywords: finalBrief.vibe_keywords,
    });

    const assumed =
      defaulted.length > 0
        ? ` I've assumed ${defaulted.join(" and ")} — change it and regenerate if that's off.`
        : "";

    return {
      assistantMessage: `That's everything I need. For your ${days} days in ${city}: ${summary}.${assumed} Generate the itinerary whenever you're ready.

\`\`\`json
{ "brief_complete": true }
\`\`\``,
      updatedBrief: finalBrief,
      briefComplete: true,
    };
  }

  async generateItinerary(
    params: GenerateItineraryParams
  ): Promise<LLMItinerary> {
    // Long enough that the generating overlay reads as real work.
    await pause(2200);
    return this.buildItinerary(params);
  }

  private buildItinerary(
    params: GenerateItineraryParams,
    note?: string
  ): LLMItinerary {
    const { brief } = params;
    const dates = datesBetween(brief.start_date, brief.end_date);
    const legs = params.legs ?? [];
    const perDay = activityCountFor(brief.pace);
    const pools = poolsFor(brief.dietary_constraints, brief.accessibility_needs);

    const days: LLMItineraryDay[] = dates.map((date, index) => {
      const isFirst = index === 0;
      const isLast = index === dates.length - 1 && dates.length > 1;

      // A date that is both one leg's departure and the next's arrival is a
      // transfer day, and belongs to the city being travelled TO.
      const arrivingLegIndex = legs.findIndex(
        (l, i) => i > 0 && l.arrival_date === date
      );
      const isTransfer = arrivingLegIndex > 0 && !isFirst;

      const leg = isTransfer
        ? legs[arrivingLegIndex]
        : legs.find(
            (l) => date >= l.arrival_date && date <= l.departure_date
          );
      const city = leg?.city ?? brief.destination;

      const activities: LLMActivity[] = [];

      if (isLast) {
        // Departure day: nothing that needs a full morning.
        activities.push({
          name: "Last coffee and pack up",
          description: "One more coffee nearby before heading to the airport.",
          start_time: "09:00",
          estimated_time_hours: 1.5,
          estimated_cost_usd: 10,
          place_name: shortCity(city),
          source_attribution: "",
          activity_type: "food",
        });
        activities.push({
          name: "Depart",
          description: "Transfer to the airport with time to spare.",
          start_time: "11:30",
          estimated_time_hours: 3,
          estimated_cost_usd: 40,
          place_name: shortCity(city),
          source_attribution: "",
          activity_type: "transport",
        });
      } else if (isTransfer) {
        const from = legs[arrivingLegIndex - 1];
        activities.push({
          name: `Travel to ${shortCity(city)}`,
          description: `Transfer from ${shortCity(from.city)} to ${shortCity(city)}, then drop bags.`,
          start_time: "09:30",
          estimated_time_hours: 3,
          estimated_cost_usd: 65,
          place_name: `${shortCity(from.city)} → ${shortCity(city)}`,
          source_attribution: "",
          activity_type: "transport",
        });
        activities.push(toActivity(pick(pools.lunch, date + city), city, date + "l"));
        activities.push(
          toActivity(pick(pools.afternoon, date + city), city, date + "a")
        );
        activities.push(toActivity(pick(pools.dinner, date + city), city, date + "d"));
      } else if (isFirst) {
        // Arrival day starts mid-afternoon — no morning, no lunch.
        activities.push({
          name: `Arrive in ${shortCity(city)}`,
          description: "Land, clear the airport, and get to the accommodation.",
          start_time: "14:00",
          estimated_time_hours: 2,
          estimated_cost_usd: 40,
          place_name: shortCity(city),
          source_attribution: "",
          activity_type: "transport",
        });
        activities.push(
          toActivity(pick(pools.afternoon, date + city), city, date + "a")
        );
        activities.push(toActivity(pick(pools.dinner, date + city), city, date + "d"));
        activities.push(toActivity(pick(pools.evening, date + city), city, date + "e"));
      } else {
        activities.push(
          toActivity(pick(pools.breakfast, date + city), city, date + "b")
        );
        activities.push(toActivity(pick(pools.morning, date + city), city, date + "m"));
        activities.push(toActivity(pick(pools.lunch, date + city), city, date + "l"));
        activities.push(
          toActivity(pick(pools.afternoon, date + city), city, date + "a")
        );
        activities.push(toActivity(pick(pools.dinner, date + city), city, date + "d"));
        activities.push(toActivity(pick(pools.evening, date + city), city, date + "e"));
      }

      // The array order IS the schedule, so guarantee it is chronological.
      const ordered = activities
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .slice(0, Math.max(perDay, isFirst || isLast || isTransfer ? 4 : perDay));

      const built: LLMItineraryDay = {
        date,
        city: shortCity(city),
        activities: ordered,
        daily_cost: 0,
      };
      applyBudget(
        built,
        // daily_budget_usd is per traveller; activity costs are for the whole party.
        brief.daily_budget_usd
          ? brief.daily_budget_usd * travellerCount(brief.party_composition)
          : undefined
      );
      built.daily_cost = ordered.reduce(
        (sum, a) => sum + (a.estimated_cost_usd ?? 0),
        0
      );
      return built;
    });

    const total = days.reduce((sum, d) => sum + (d.daily_cost ?? 0), 0);
    const cities = legs.length > 1 ? legs.map((l) => shortCity(l.city)) : [];

    return {
      destination: brief.destination,
      start_date: brief.start_date,
      end_date: brief.end_date,
      total_cost_estimate: total,
      notes:
        note ??
        [
          `A ${dates.length}-day ${brief.pace ?? "moderate"}-paced plan`,
          cities.length > 1 ? ` across ${cities.join(" and ")}` : "",
          brief.daily_budget_usd
            ? `, budgeted around $${brief.daily_budget_usd} a day`
            : "",
          brief.dietary_constraints?.length
            ? `, ${brief.dietary_constraints.join(" and ")} throughout`
            : "",
          brief.accessibility_needs?.length
            ? `, keeping ${brief.accessibility_needs.join(" and ")} in mind`
            : "",
          brief.vibe_keywords?.length
            ? `, leaning ${brief.vibe_keywords.slice(0, 3).join(", ")}`
            : "",
          ". Generated in demo mode — no model was called.",
        ].join(""),
      days,
    };
  }

  async reviseItinerary(
    params: ReviseItineraryParams
  ): Promise<LLMItinerary> {
    await pause(1800);

    const instruction = params.instruction.toLowerCase();
    const cheaper = /cheap|budget|afford|less money|lower cost/.test(instruction);
    const slower = /relax|slow|calm|chill|fewer|less busy/.test(instruction);

    const revised: LLMItinerary = structuredClone(params.currentItinerary);
    const include = params.mustInclude ?? [];
    const exclude = params.mustExclude ?? [];

    // --- 1. Drop un-ticked items. Locked activities are never removed. ---
    if (exclude.length > 0) {
      for (const day of revised.days ?? []) {
        day.activities = day.activities.filter(
          (a) => a.locked || !exclude.some((p) => activityMatches(a, p.name))
        );
      }
    }

    // --- 2. Apply the free-text intent, as before. ---
    for (const day of revised.days ?? []) {
      if (slower) {
        const locked = day.activities.filter((a) => a.locked);
        const rest = day.activities.filter((a) => !a.locked);
        day.activities = [...locked, ...rest].slice(0, 4);
      }
      for (const activity of day.activities) {
        if (cheaper && !activity.locked) {
          activity.estimated_cost_usd = Math.round(
            (activity.estimated_cost_usd ?? 0) * 0.6
          );
          if (activity.activity_type === "food") {
            activity.description = `${activity.description.replace(/\.$/, "")} — swapped for a cheaper spot nearby.`;
          }
        }
      }
    }

    // --- 2b. Logistics ripple ("leaving early on the last day"): the neighbouring
    // days change too, which is the behaviour the real prompt asks for. ---
    const rippled = /LOGISTICS change/.test(params.instruction);
    const rippleNotes: string[] = [];
    if (rippled) {
      const days = revised.days ?? [];
      const lastIdx = days.length - 1;
      const dep = /departure|leav|depart/i.test(params.instruction);
      if (dep && lastIdx >= 1) {
        const last = days[lastIdx];
        const before = last.activities.length;
        last.activities = last.activities.filter(
          (a) => a.locked || a.activity_type === "transport" || (a.start_time ?? "") < "08:00"
        );
        const prev = days[lastIdx - 1];
        const late = prev.activities.filter(
          (a) => !a.locked && (a.start_time ?? "") >= "21:30"
        ).length;
        prev.activities = prev.activities.filter(
          (a) => a.locked || (a.start_time ?? "") < "21:30"
        );
        const removedLast = before - last.activities.length;
        const parts: string[] = [];
        if (removedLast > 0) parts.push(`the last day was trimmed to what fits before an early departure (${removedLast} removed)`);
        if (late > 0) parts.push(`the evening before no longer runs late (${late} removed)`);
        rippleNotes.push(
          (parts.length > 0
            ? `${parts.join("; ")}.`.replace(/^./, (c) => c.toUpperCase())
            : "The last day already ended early enough, so nothing needed trimming.") +
            " Costs re-estimated."
        );
      }
    }

    // --- 3. Work in the ticked items that aren't already covered. ---
    const candidateDays = (revised.days ?? []).filter(
      (_d, i) => i > 0 && i < (revised.days ?? []).length - 1
    );
    const targetDays = candidateDays.length > 0 ? candidateDays : revised.days ?? [];

    let cursor = 0;
    for (const pick of include) {
      const present = (revised.days ?? []).some((d) =>
        d.activities.some((a) => activityMatches(a, pick.name))
      );
      if (present) continue;

      // Prefer a day in the pick's own city; otherwise round-robin so several
      // picks don't all pile onto day 2.
      // A day's city may be the full leg label ("Athens, Attica, Greece") or
      // already shortened, depending on whether it came from persistence or
      // from generation — compare both sides on the short form.
      const cityDays = pick.city
        ? targetDays.filter(
            (d) =>
              normalise(shortCity(d.city ?? "")) ===
              normalise(shortCity(pick.city ?? ""))
          )
        : [];
      const pool = cityDays.length > 0 ? cityDays : targetDays;
      if (pool.length === 0) continue;
      const day = pool[cursor % pool.length];
      cursor += 1;

      insertPick(day, pick);
    }

    // --- 4. Re-sort and recost every touched day. ---
    for (const day of revised.days ?? []) {
      day.activities.sort((a, b) =>
        (a.start_time ?? "").localeCompare(b.start_time ?? "")
      );
      day.daily_cost = day.activities.reduce(
        (sum, a) => sum + (a.estimated_cost_usd ?? 0),
        0
      );
    }

    revised.total_cost_estimate = (revised.days ?? []).reduce(
      (sum, d) => sum + (d.daily_cost ?? 0),
      0
    );

    const parts: string[] = [];
    if (include.length > 0)
      parts.push(`added ${include.map((p) => p.name).join(", ")}`);
    if (exclude.length > 0)
      parts.push(`dropped ${exclude.map((p) => p.name).join(", ")}`);
    revised.notes = rippled
      ? `${rippleNotes.join(" ") || "Re-planned around the new timing."} Demo mode — no model was called.`
      : parts.length > 0
        ? `Rebuilt around your picks — ${parts.join("; ")}. Demo mode — no model was called.`
        : `Revised for "${params.instruction}". Demo mode — no model was called.`;

    return revised;
  }

  async reviseActivity(params: ReviseActivityParams): Promise<LLMActivity> {
    await pause(900);

    const instruction = params.instruction.toLowerCase();
    const cheaper = /cheap|budget|afford|less/.test(instruction);
    const current = params.activity;
    const baseCost = current.estimated_cost_usd ?? 20;

    const pool =
      current.activity_type === "food"
        ? [...LUNCH, ...DINNER]
        : [...MORNING, ...AFTERNOON];
    const replacement = pick(pool, params.instruction + current.activity_id);
    const typedTime = requestedStartTime(params.instruction);

    return {
      name: replacement.label,
      description: `${replacement.blurb} Swapped in for "${params.instruction}".`,
      start_time: typedTime ?? current.start_time ?? replacement.time,
      estimated_time_hours:
        current.estimated_time_hours ?? replacement.hours,
      estimated_cost_usd: cheaper
        ? Math.round(baseCost * 0.5)
        : replacement.cost,
      place_name: current.place_name ?? replacement.label,
      source_attribution: "",
      activity_type: replacement.type,
    };
  }

  async reviseDay(params: ReviseDayParams): Promise<ReviseDayResult> {
    await pause(1100);

    const instruction = params.instruction.toLowerCase();
    const cheaper = /cheap|budget|afford|less money/.test(instruction);
    const outdoorsy = /outdoor|nature|hike|walk|beach|swim|air/.test(instruction);

    // Locked activities are reproduced verbatim, as the real prompt requires.
    const locked = params.currentActivities.filter((a) => a.locked);
    const open = params.currentActivities.filter((a) => !a.locked);

    const used = new Set<string>();

    const rebuilt = open.map((a, i) => {
      const pool = poolForTime(a.start_time, outdoorsy);
      // Prefer an option not already used elsewhere in the day, so a revision
      // never produces the same meal twice.
      const seed = params.dayDate + instruction + i;
      const fresh = pool.filter((t) => !used.has(t.label));
      const t = pick(fresh.length > 0 ? fresh : pool, seed);
      used.add(t.label);

      return {
        ...a,
        name: t.label,
        description: `${t.blurb} Adjusted for "${params.instruction}".`,
        estimated_cost_usd: cheaper
          ? Math.round((a.estimated_cost_usd ?? t.cost) * 0.55)
          : t.cost,
        activity_type: t.type,
      };
    });

    return {
      activities: [...locked, ...rebuilt]
        .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))
        .slice(0, 8),
      ripple: null,
    };
  }

  async generateDestinationGuide(
    destination: string
  ): Promise<DestinationGuide> {
    await pause(1200);
    const city = shortCity(destination);

    // Real highlights for every city the demo's autocomplete offers. Falls back
    // to a generic shape for anything else so an unknown destination still
    // renders a usable guide rather than failing.
    const curated = findCityGuide(destination);
    if (curated) {
      return {
        destination,
        known_for: curated.known_for,
        top_spots: curated.top_spots,
        must_try_foods: curated.must_try_foods,
      };
    }

    return {
      destination,
      known_for: `${city} rewards slow wandering: a dense, walkable centre, a strong café culture, and food that is better at the small family-run places than anywhere with a printed English menu. Mornings are for markets and museums, late afternoons for the water or a viewpoint.`,
      top_spots: [
        { name: `${city} old town`, why: "The historic core — best walked early before tour groups arrive." },
        { name: `${city} central market`, why: "Where to understand what people actually eat here." },
        { name: `${city} waterfront`, why: "An easy flat walk with the best light around sunset." },
        { name: `${city} main museum`, why: "The one collection worth building a morning around." },
        { name: `${city} viewpoint`, why: "Short steep climb, the postcard view at the top." },
        { name: `${city} gallery quarter`, why: "Contemporary spaces clustered in a few walkable blocks." },
      ],
      must_try_foods: [
        { name: "The regional house speciality", why: "Every neighbourhood argues about who makes it best." },
        { name: "Market-stall breakfast", why: "Cheap, fast, and how locals actually start the day." },
        { name: "Grilled catch of the day", why: "Simply done, priced by weight, worth the splurge once." },
        { name: "The local aperitif", why: "Ordered before dinner, never after." },
        { name: "Street pastry", why: "Best from the place with the queue and no sign." },
      ],
    };
  }

  async discussItinerary(params: DiscussItineraryParams): Promise<string> {
    await pause(800);

    const last =
      [...params.messages].reverse().find((m) => m.role === "user")?.content ??
      "";
    const asksAboutFood = /eat|food|restaurant|dinner|lunch|breakfast/i.test(last);
    const asksAboutPace = /busy|packed|tired|slow|rush|pace/i.test(last);

    if (asksAboutFood) {
      return `Food-wise you're in decent shape — there's a sit-down dinner most evenings and a market breakfast built in. If you want one standout meal, I'd protect the seafood dinner and make the rest casual. Want me to swap a lunch for something more memorable? Hit "Apply changes" once you've decided.`;
    }

    if (asksAboutPace) {
      return `Looking at it, the middle days are the heaviest — five or six stops each, which is a lot in the heat. The easiest fix is dropping the evening item on one of them and letting dinner run long instead. Say the word and hit "Apply changes".`;
    }

    return `Happy to dig in. The plan currently balances a museum-or-walk morning, a proper sit-down lunch, and something outdoors in the late afternoon. Tell me what you'd shift — more food, more outdoors, fewer stops — and I'll suggest specifics before you hit "Apply changes". (Demo mode: replies are canned, no model is called.)`;
  }
}
