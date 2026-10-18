/**
 * Pure helpers for editing a single activity from a free-text instruction.
 * No framework imports so they can be unit-tested with plain Node.
 *
 * The model interprets the instruction, but a clock time the traveller typed
 * ("breakfast at 8am") is a hard fact, so it is parsed here and enforced rather
 * than left to the model to remember.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:MM" (24h) if the text names a clear time of day, else null. */
export function requestedStartTime(instruction: string): string | null {
  const t = instruction.toLowerCase();

  const ampm = t.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] ?? 0);
    if (h >= 1 && h <= 12) {
      const pm = ampm[3].startsWith("p");
      if (h === 12) h = pm ? 12 : 0;
      else if (pm) h += 12;
      return `${pad(h)}:${pad(m)}`;
    }
  }

  const h24 = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) return `${pad(Number(h24[1]))}:${h24[2]}`;

  if (/\bnoon\b/.test(t)) return "12:00";
  return null;
}

export function isValidClock(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/**
 * Settles the start time of a revised activity: a time the user typed wins,
 * then a valid time from the model, then the time it already had.
 */
export function resolveStartTime(
  instruction: string,
  modelTime: unknown,
  currentTime: string | null | undefined
): string | null {
  const asked = requestedStartTime(instruction);
  if (asked) return asked;
  if (isValidClock(modelTime)) return modelTime;
  return isValidClock(currentTime) ? currentTime : null;
}
