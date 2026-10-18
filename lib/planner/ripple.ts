/**
 * Scope of a revision: does an instruction stay inside one day, or does it
 * change trip logistics that ripple through the rest of the plan?
 *
 * PM decision: "I'm leaving early on the last day" is not a day-level style
 * preference ("more outdoorsy"), it is a logistics change. It moves the airport
 * transfer and check-out, shortens the last day, constrains the previous
 * evening (no late night before a dawn departure), removes or relocates things
 * that no longer fit, and changes the budget. So when a day-level revision
 * carries such a constraint, we escalate to a whole-trip revision (new version,
 * locks respected) instead of rewriting one day in isolation.
 *
 * Detection is deterministic (this file) with a model-reported fallback
 * (`affects_other_days` in the day-revision JSON) for phrasings the patterns
 * miss. Pure module: no runtime imports.
 */

export type RippleKind = "departure" | "arrival" | "transfer";

export interface RippleDetection {
  kind: RippleKind;
  /** Short human reason, shown to the traveller. */
  reason: string;
}

export interface DayPosition {
  /** 1-based */
  dayNumber: number;
  dayCount: number;
}

const LOGISTICS_WORDS =
  /\b(leav(?:e|es|ing)|depart(?:s|ing|ure)?|flight|fly(?:ing)?|ferry|train|check[\s-]?out|checkout|airport|transfer|land(?:s|ing)?|arriv(?:e|es|ing|al))\b/i;

const TIME_WORDS =
  /\b(early|earlier|earliest|late|later|dawn|sunrise|noon|midday|morning|tonight|before\s+\d|by\s+\d|at\s+\d|\d{1,2}\s?(?:am|pm)|\d{1,2}:\d{2}|o'?clock)\b/i;

const LAST_DAY_WORDS = /\b(last|final)\s+day\b|\bday\s+of\s+departure\b|\bdeparture\s+day\b/i;
const FIRST_DAY_WORDS = /\b(first|opening)\s+day\b|\barrival\s+day\b|\bday\s+of\s+arrival\b/i;

/**
 * Returns a detection when the instruction changes trip logistics, else null.
 * `position` is the day being revised (null when unknown).
 */
export function detectTripWideImpact(
  instruction: string,
  position: DayPosition | null
): RippleDetection | null {
  const text = (instruction ?? "").trim();
  if (!text) return null;
  if (!LOGISTICS_WORDS.test(text) || !TIME_WORDS.test(text)) return null;

  const isLast = !!position && position.dayCount > 1 && position.dayNumber === position.dayCount;
  const isFirst = !!position && position.dayCount > 1 && position.dayNumber === 1;
  const mentionsLast = LAST_DAY_WORDS.test(text);
  const mentionsFirst = FIRST_DAY_WORDS.test(text);

  const arrivalish = /\b(arriv(?:e|es|ing|al)|land(?:s|ing)?|get(?:ting)? in)\b/i.test(text);
  const departish =
    /\b(leav(?:e|es|ing)|depart(?:s|ing|ure)?|check[\s-]?out|checkout|fly(?:ing)?\s+out|flight\s+(?:out|home))\b/i.test(
      text
    );

  const strongDeparture = departish || /\b(flight|airport|ferry|train|transfer)\b/i.test(text);
  if ((isLast || mentionsLast) && strongDeparture && !(arrivalish && !departish)) {
    return {
      kind: "departure",
      reason: "Leaving earlier or later on the last day changes the airport transfer, check-out, the evening before, and the budget.",
    };
  }
  if ((isFirst || mentionsFirst) && (arrivalish || /\b(flight|airport|transfer)\b/i.test(text)) && !departish) {
    return {
      kind: "arrival",
      reason: "A different arrival time changes how much of the first day is usable and when you can check in.",
    };
  }
  // A mid-trip ferry/flight/train time moves a city transfer.
  if (/\b(ferry|train|flight|fly|transfer)\b/i.test(text)) {
    return {
      kind: "transfer",
      reason: "A different transfer time shifts that day and the evening before it.",
    };
  }
  return null;
}

/**
 * The instruction handed to the whole-trip reviser. Keeps the traveller's own
 * words verbatim and spells out the cascade the model must work through.
 */
export function buildRippleInstruction(args: {
  userInstruction: string;
  dayDate: string;
  dayNumber: number;
  dayCount: number;
  kind: RippleKind;
}): string {
  const { userInstruction, dayDate, dayNumber, dayCount, kind } = args;
  const head = `The traveller said, about day ${dayNumber} of ${dayCount} (${dayDate}): "${userInstruction.trim()}". This is a LOGISTICS change, so re-plan the WHOLE trip around it, not just that day.`;
  const common = [
    "Treat the traveller's stated time as a hard constraint that overrides the booked time in this one respect, and mention the assumption in the notes.",
    "Re-estimate every cost on every affected day; drop or shorten activities that no longer fit rather than cramming them in.",
    "Do not move a dropped highlight onto another day unless that day genuinely has room; never exceed the per-day cap.",
    "Keep locked days and activities exactly as they are; if a locked item now conflicts, leave it and say so in the notes.",
    "State in the notes, in one or two sentences, which days you changed and why.",
  ];
  const byKind: Record<RippleKind, string[]> = {
    departure: [
      `Day ${dayNumber}: end the day early enough for check-out, the airport transfer (use the real transit time) and the airport buffer; keep only the meals and activities that fit before then.`,
      `Day ${dayNumber - 1}: no late-evening activities or late dinner that clash with an early start; pack-up and an earlier night take priority. Move anything on day ${dayNumber} that you cut to day ${dayNumber - 1} only if it fits comfortably.`,
      "Make sure the accommodation check-out time and the airport/station transfer appear as activities on the departure day.",
    ],
    arrival: [
      `Day ${dayNumber}: start the day only after arrival plus transit; schedule check-in and a light first evening.`,
      `Day ${dayNumber + 1}: it may take on a highlight that no longer fits on day ${dayNumber}, if there is room.`,
    ],
    transfer: [
      `Day ${dayNumber}: put the transfer at the stated time, split the day's activities around it between the two cities, and keep the arriving city's activities in the arriving city.`,
      `Day ${dayNumber - 1}: end early enough to make the transfer comfortably.`,
    ],
  };
  return [head, ...byKind[kind], ...common].join("\n- ");
}
