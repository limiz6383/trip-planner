/**
 * Pure iCalendar (.ics) builder — no DOM, no Node-only APIs — so it can run in
 * both the browser (client export) and a Route Handler (subscribe-by-URL feed).
 *
 * Times are emitted as "floating" local times (no Z, no TZID): a calendar shows
 * each event at the clock time set, interpreted in the viewer's timezone, which
 * is what travellers expect for an itinerary.
 */

export interface ICSActivityInput {
  activity_id: string;
  name: string;
  description?: string | null;
  start_time?: string | null;
  estimated_time_hours?: number | null;
  estimated_cost_usd?: number | null;
  place_name?: string | null;
  source_attribution?: string | null;
}

export interface ICSDayInput {
  date: string; // YYYY-MM-DD
  activities?: ICSActivityInput[];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "HH:MM(:SS)" → minutes since midnight, or null. */
function parseClock(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function icsDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

function icsTime(min: number): string {
  return pad2(Math.floor(min / 60)) + pad2(min % 60) + "00";
}

/** Add days to a "YYYY-MM-DD" using UTC component math → "YYYYMMDD". */
function icsDatePlus(iso: string, addDays: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + addDays));
  return `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}`;
}

function icsStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/** RFC 5545 text escaping. */
function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Build a VCALENDAR string from itinerary days. `now` defaults to the current
 * time (DTSTAMP); pass one in for deterministic output (e.g. tests).
 */
export function buildICS(
  days: ICSDayInput[],
  title: string,
  now: Date = new Date()
): string {
  const stamp = icsStamp(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//trip-planner//itinerary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (title) lines.push("X-WR-CALNAME:" + icsEscape(title));

  for (const day of days) {
    for (const a of day.activities ?? []) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${a.activity_id}@trip-planner`);
      lines.push("DTSTAMP:" + stamp);

      const startMin = parseClock(a.start_time);
      if (startMin != null) {
        const durMin =
          a.estimated_time_hours != null
            ? Math.round(a.estimated_time_hours * 60)
            : 60;
        const endTotal = startMin + durMin;
        lines.push(`DTSTART:${icsDate(day.date)}T${icsTime(startMin)}`);
        lines.push(
          `DTEND:${icsDatePlus(day.date, Math.floor(endTotal / 1440))}T${icsTime(
            endTotal % 1440
          )}`
        );
      } else {
        lines.push(`DTSTART;VALUE=DATE:${icsDate(day.date)}`);
      }

      lines.push("SUMMARY:" + icsEscape(a.name));
      if (a.place_name) lines.push("LOCATION:" + icsEscape(a.place_name));
      const desc: string[] = [];
      if (a.description) desc.push(a.description);
      if (a.estimated_cost_usd != null) desc.push(`Est. $${a.estimated_cost_usd}`);
      if (a.source_attribution) desc.push(`via ${a.source_attribution}`);
      if (desc.length) lines.push("DESCRIPTION:" + icsEscape(desc.join(" — ")));
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  // RFC 5545: content lines are folded at 75 octets and the file ends with CRLF.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Folds one content line at 75 octets (UTF-8 aware), continuing with a space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  // First physical line may hold 75 octets; continuation lines 74 plus the leading space.
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74;
    }
    cur += ch;
    curBytes += b;
  }
  if (cur) out.push(cur);
  return out.join("\r\n ");
}
