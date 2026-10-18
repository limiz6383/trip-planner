import { test } from "node:test";
import assert from "node:assert/strict";
import { buildICS, foldLine } from "./ics.ts";

test("long lines fold at 75 octets and unfold back to the original", () => {
  const long = "DESCRIPTION:" + "Grilled octopus, a salad; and très long text ".repeat(8);
  const folded = foldLine(long);
  for (const line of folded.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75, line);
  }
  assert.equal(folded.replace(/\r\n /g, ""), long);
});

test("calendar ends with CRLF and escapes text", () => {
  const ics = buildICS(
    [{ date: "2026-08-25", activities: [{ activity_id: "a1", name: "Lunch, view; \\ x", start_time: "12:30:00", estimated_time_hours: 1.5 }] }],
    "Greece 2026",
    new Date("2026-01-01T00:00:00Z")
  );
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(ics.includes("SUMMARY:Lunch\\, view\\; \\\\ x"), ics);
  assert.match(ics, /DTSTART:20260825T123000/);
  assert.match(ics, /DTEND:20260825T140000/);
});
