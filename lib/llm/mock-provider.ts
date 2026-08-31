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

import type {
  LLMProvider,
  ConsultingTurnParams,
  ConsultingTurnResult,
  GenerateItineraryParams,
  ReviseItineraryParams,
  ReviseActivityParams,
  ReviseDayParams,
  DiscussItineraryParams,
} from "./provider";
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
}

const BREAKFAST: Template[] = [
  { label: "Breakfast at a neighbourhood bakery", type: "food", time: "08:30", hours: 1, cost: 12, blurb: "Pastries and strong coffee a short walk from the flat." },
  { label: "Morning market breakfast", type: "food", time: "08:15", hours: 1, cost: 14, blurb: "Fresh fruit and something hot from a market stall." },
];

const MORNING: Template[] = [
  { label: "Old town walking loop", type: "culture", time: "10:00", hours: 2, cost: 0, blurb: "A self-guided loop through the historic centre before the crowds." },
  { label: "City museum", type: "culture", time: "10:00", hours: 2, cost: 18, blurb: "The main collection, worth a slow two hours." },
  { label: "Harbour-front stroll", type: "outdoor", time: "09:45", hours: 1.5, cost: 0, blurb: "Easy waterfront walk with good photo stops." },
  { label: "Botanical gardens", type: "outdoor", time: "10:15", hours: 1.5, cost: 8, blurb: "Shaded paths and a quiet spot to reset." },
];

const LUNCH: Template[] = [
  { label: "Lunch at a family-run taverna", type: "food", time: "13:00", hours: 1, cost: 22, blurb: "Small menu, packed with locals at midday." },
  { label: "Street-food lunch", type: "food", time: "12:45", hours: 1, cost: 15, blurb: "Quick, cheap, and the best bite of the day." },
];

const AFTERNOON: Template[] = [
  { label: "Neighbourhood browse", type: "shopping", time: "15:00", hours: 1.5, cost: 25, blurb: "Independent shops and a few makers' studios." },
  { label: "Viewpoint climb", type: "outdoor", time: "15:30", hours: 1.5, cost: 5, blurb: "Steep but short, best light in late afternoon." },
  { label: "Gallery district", type: "culture", time: "14:45", hours: 2, cost: 12, blurb: "Contemporary spaces clustered within a few blocks." },
  { label: "Swim and beach time", type: "outdoor", time: "15:00", hours: 2, cost: 0, blurb: "Flat water and easy entry, quiet on weekdays." },
];

const DINNER: Template[] = [
  { label: "Dinner at a local favourite", type: "food", time: "19:30", hours: 1.5, cost: 38, blurb: "Book ahead — it fills up by eight." },
  { label: "Seafood dinner by the water", type: "food", time: "19:45", hours: 1.5, cost: 45, blurb: "Whatever came in that morning, simply grilled." },
];

const EVENING: Template[] = [
  { label: "Wine bar nightcap", type: "entertainment", time: "21:30", hours: 1, cost: 18, blurb: "Natural wine list and a short, good snack menu." },
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
 * Splices a ticked guide item into a day at a slot that suits its kind: a dish
 * lands at dinner, a spot mid-afternoon. If the day is already at the cap, the
 * lowest-value non-locked activity in that part of the day gives way — dropping
 * the traveller's explicit pick would be the worse failure.
 */
function insertPick(day: LLMItineraryDay, pick: GuidePick): void {
  const isFood = pick.kind === "food";
  const slot = isFood ? "19:30" : "15:00";

  const activity: LLMActivity = {
    name: isFood ? `Dinner — ${pick.name}` : `Visit ${pick.name}`,
    description: isFood
      ? `${pick.name}, the dish you picked from the guide.`
      : `${pick.name} — added because you picked it from the guide.`,
    start_time: slot,
    estimated_time_hours: isFood ? 1.5 : 2,
    estimated_cost_usd: isFood ? 34 : 16,
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
    const turn = params.history.filter((m) => m.role === "user").length;

    // Three scripted turns, then the brief completes. Enough to show the
    // consulting loop without making a visitor type through a real interview.
    if (turn === 0) {
      return {
        assistantMessage: `Let's plan your ${days}-day trip to ${city}. Two things to start: roughly what daily budget are you working with, and what kind of trip is this — relaxed and food-led, or are you trying to cover a lot of ground?`,
        updatedBrief: { ...params.partialBrief, ...params.knownTrip },
        briefComplete: false,
      };
    }

    if (turn === 1) {
      return {
        assistantMessage: `Got it. Who's travelling, and is there anything I should plan around — dietary needs, accessibility, or anything you'd rather skip?`,
        updatedBrief: {
          ...params.partialBrief,
          ...params.knownTrip,
          daily_budget_usd: 180,
          vibe_keywords: ["food", "walkable", "coastal"],
        },
        briefComplete: false,
      };
    }

    return {
      assistantMessage: `That's everything I need. Here's the brief for your ${days} days in ${city}: a moderate pace, around $180 a day, leaning local rather than touristy, with food as the through-line. Generate the itinerary whenever you're ready.

\`\`\`json
{ "brief_complete": true }
\`\`\``,
      updatedBrief: {
        ...params.partialBrief,
        ...params.knownTrip,
        daily_budget_usd: 180,
        vibe_keywords: ["food", "walkable", "coastal"],
        party_composition: { adults: 2 },
        local_touristy_dial: 0.35,
        dietary_constraints: [],
        accessibility_needs: [],
        pace: "moderate",
      },
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
        activities.push(toActivity(pick(LUNCH, date + city), city, date + "l"));
        activities.push(
          toActivity(pick(AFTERNOON, date + city), city, date + "a")
        );
        activities.push(toActivity(pick(DINNER, date + city), city, date + "d"));
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
          toActivity(pick(AFTERNOON, date + city), city, date + "a")
        );
        activities.push(toActivity(pick(DINNER, date + city), city, date + "d"));
        activities.push(toActivity(pick(EVENING, date + city), city, date + "e"));
      } else {
        activities.push(
          toActivity(pick(BREAKFAST, date + city), city, date + "b")
        );
        activities.push(toActivity(pick(MORNING, date + city), city, date + "m"));
        activities.push(toActivity(pick(LUNCH, date + city), city, date + "l"));
        activities.push(
          toActivity(pick(AFTERNOON, date + city), city, date + "a")
        );
        activities.push(toActivity(pick(DINNER, date + city), city, date + "d"));
        activities.push(toActivity(pick(EVENING, date + city), city, date + "e"));
      }

      // The array order IS the schedule, so guarantee it is chronological.
      const ordered = activities
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .slice(0, Math.max(perDay, isFirst || isLast || isTransfer ? 4 : perDay));

      return {
        date,
        city: shortCity(city),
        activities: ordered,
        daily_cost: ordered.reduce(
          (sum, a) => sum + (a.estimated_cost_usd ?? 0),
          0
        ),
      };
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
        `A ${dates.length}-day ${brief.pace ?? "moderate"}-paced plan${
          cities.length > 1 ? ` across ${cities.join(" and ")}` : ""
        }, built around food and walkable neighbourhoods. Generated in demo mode — no model was called.`,
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
    revised.notes =
      parts.length > 0
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

    return {
      name: replacement.label,
      description: `${replacement.blurb} Swapped in for "${params.instruction}".`,
      start_time: current.start_time ?? replacement.time,
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

  async reviseDay(params: ReviseDayParams): Promise<LLMActivity[]> {
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

    return [...locked, ...rebuilt]
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))
      .slice(0, 8);
  }

  async generateDestinationGuide(
    destination: string
  ): Promise<DestinationGuide> {
    await pause(1200);
    const city = shortCity(destination);

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
