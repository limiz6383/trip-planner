"use client";

/**
 * ItineraryView — renders a confirmed or proposed itinerary with:
 *   - Inline activity editing (name, description, cost, time, type)
 *   - Per-activity lock toggle
 *   - Per-day lock toggle
 *   - "View changes" drawer (changelog)
 *
 * PROP CONTRACT (final — unchanged from Wave A):
 *
 *   tripId: string
 *   itinerary: Itinerary  (hydrated — .days[].activities[])
 *   onItineraryUpdated?: () => void   fired after any successful mutation
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ItineraryGeneratingOverlay } from "@/components/itinerary/ItineraryGeneratingOverlay";
import { buildICS } from "@/lib/ics";
import type {
  Itinerary,
  ItineraryDay,
  Activity,
  ActivityType,
  ChangeLogEntry,
} from "@/lib/types";
import type {
  PatchActivityRequestBody,
  PatchActivityResponseBody,
  PatchActivityErrorBody,
  DeleteActivityErrorBody,
} from "@/app/api/trips/[id]/activities/[activityId]/route";
import type {
  PatchDayRequestBody,
  PatchDayResponseBody,
  PatchDayErrorBody,
} from "@/app/api/trips/[id]/days/[dayId]/route";
import type {
  GetChangelogResponseBody,
  GetChangelogErrorBody,
} from "@/app/api/trips/[id]/changelog/route";
import type {
  ReviseActivityRequestBody,
  ReviseActivityResponseBody,
  ReviseActivityErrorBody,
} from "@/app/api/trips/[id]/activities/[activityId]/revise/route";
import type {
  ReviseItineraryRequestBody,
  ReviseItineraryErrorBody,
} from "@/app/api/trips/[id]/itinerary/revise/route";
import type {
  ReviseDayRequestBody,
  ReviseDayResponseBody,
  ReviseDayErrorBody,
} from "@/app/api/trips/[id]/days/[dayId]/revise/route";
import type { RescheduleRequestBody } from "@/app/api/trips/[id]/days/[dayId]/schedule/route";
import type {
  MoveActivityRequestBody,
  MoveActivityResponseBody,
  MoveActivityErrorBody,
} from "@/app/api/trips/[id]/activities/[activityId]/move/route";

// ---------------------------------------------------------------------------
// Prop contract — FINAL (unchanged)
// ---------------------------------------------------------------------------

export interface ItineraryViewProps {
  /** UUID of the parent trip */
  tripId: string;
  /** Hydrated itinerary with days and activities attached */
  itinerary: Itinerary;
  /** Trip title — used for export filenames/headings. */
  tripTitle?: string;
  /** Public, tokenized .ics feed URL for calendar subscribe-by-URL. */
  calendarSubscribeUrl?: string;
  /** Fired after a successful in-place mutation so the parent page can revalidate */
  onItineraryUpdated?: () => void;
}

// ---------------------------------------------------------------------------
// Activity type constants
// ---------------------------------------------------------------------------

/** Canned instruction for the "Tidy up trip" action (whole-itinerary revise). */
const TIDY_UP_INSTRUCTION =
  "Tidy up the whole trip: remove duplicate or redundant activities, fix " +
  "scheduling conflicts and unrealistic timing, and make each day flow " +
  "coherently. Keep the destination, dates, day count, and all locked items " +
  "unchanged.";

const ACTIVITY_TYPES: ActivityType[] = [
  "food",
  "culture",
  "outdoor",
  "shopping",
  "transport",
  "accommodation",
  "entertainment",
  "other",
];

const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  food: "Food",
  culture: "Culture",
  outdoor: "Outdoor",
  shopping: "Shopping",
  transport: "Transport",
  accommodation: "Stay",
  entertainment: "Entertainment",
  other: "Other",
};

const ACTIVITY_TYPE_COLORS: Record<ActivityType, string> = {
  food: "bg-orange-100 text-orange-700",
  culture: "bg-purple-100 text-purple-700",
  outdoor: "bg-green-100 text-green-700",
  shopping: "bg-pink-100 text-pink-700",
  transport: "bg-blue-100 text-blue-700",
  accommodation: "bg-indigo-100 text-indigo-700",
  entertainment: "bg-yellow-100 text-yellow-700",
  other: "bg-zinc-100 text-zinc-600",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    // Date-only value: format in UTC so the day doesn't shift back one in
    // timezones west of UTC (e.g. "2026-06-05" must read Jun 5, not Jun 4).
    timeZone: "UTC",
  });
}

function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "";
  return `$${usd.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatTime(hours: number | null | undefined): string {
  if (hours == null) return "";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ----- clock-time helpers (start_time is "HH:MM" or DB "HH:MM:SS") -----

/** Parse "HH:MM"/"HH:MM:SS" to minutes-since-midnight, or null. */
function parseClock(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

/** Minutes-since-midnight to "HH:MM" (clamped to a single day). */
function minutesToHHMM(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM(:SS)" to a friendly "12:30 PM"; "" if absent. */
function formatClock(t: string | null | undefined): string {
  const mins = parseClock(t);
  if (mins == null) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** End time (start + duration) in minutes, or null if untimed. */
function activityEndMinutes(a: Activity): number | null {
  const s = parseClock(a.start_time);
  if (s == null) return null;
  const durMin = a.estimated_time_hours != null ? a.estimated_time_hours * 60 : 0;
  return s + durMin;
}

/** Sort comparator: by start_time (untimed last), tiebreak by sort_order. */
function byClock(a: Activity, b: Activity): number {
  const am = parseClock(a.start_time);
  const bm = parseClock(b.start_time);
  if (am == null && bm == null) return a.sort_order - b.sort_order;
  if (am == null) return 1;
  if (bm == null) return -1;
  if (am !== bm) return am - bm;
  return a.sort_order - b.sort_order;
}

/**
 * Reassigns a day's time-slots to a newly-ordered activity list. The set of
 * non-locked start_times (the "slots") is kept and handed out in the new visual
 * order; locked activities keep their own time (fixed anchors). Returns the
 * updated activities plus the list of changes to persist.
 */
function reassignTimeSlots(ordered: Activity[]): {
  acts: Activity[];
  changed: { activity_id: string; start_time: string | null }[];
} {
  const slots = ordered
    .filter((a) => !a.locked)
    .map((a) => parseClock(a.start_time))
    .filter((x): x is number => x != null)
    .sort((x, y) => x - y);

  let si = 0;
  const changed: { activity_id: string; start_time: string | null }[] = [];
  const acts = ordered.map((a) => {
    if (a.locked) return a;
    const slot = slots[si++];
    if (slot == null) return a;
    if (parseClock(a.start_time) !== slot) {
      const ns = minutesToHHMM(slot);
      changed.push({ activity_id: a.activity_id, start_time: ns });
      return { ...a, start_time: ns };
    }
    return a;
  });
  return { acts, changed };
}

// ---------------------------------------------------------------------------
// Export helpers (ICS calendar + printable PDF)
// ---------------------------------------------------------------------------

type ExportDay = ItineraryDay & { activities?: Activity[] };

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "trip"
  );
}

/** Trigger a client-side file download. */
function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Build a clean printable HTML document (for Save as PDF via the print dialog). */
function buildPrintHTML(days: ExportDay[], title: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const dayBlocks = days
    .map((day, i) => {
      const acts = (day.activities ?? [])
        .map((a) => {
          const time = formatClock(a.start_time);
          const meta = [
            a.estimated_time_hours != null ? formatTime(a.estimated_time_hours) : "",
            a.estimated_cost_usd != null ? formatCost(a.estimated_cost_usd) : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return `<li>
            <div class="t">${esc(time || "")}</div>
            <div class="b">
              <div class="n">${esc(a.name)}</div>
              ${a.place_name ? `<div class="p">${esc(a.place_name)}</div>` : ""}
              ${a.description ? `<div class="d">${esc(a.description)}</div>` : ""}
              ${meta ? `<div class="m">${esc(meta)}</div>` : ""}
            </div>
          </li>`;
        })
        .join("");
      return `<section>
        <h2>Day ${i + 1} — ${esc(formatDate(day.date))}</h2>
        <ul>${acts || "<li><div class='b'><div class='d'>No activities.</div></div></li>"}</ul>
      </section>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(
    title
  )}</title><style>
    *{box-sizing:border-box}
    body{font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;margin:32px;max-width:760px}
    h1{font-size:22px;margin:0 0 4px}
    .sub{color:#71717a;margin:0 0 24px}
    section{margin:0 0 20px;page-break-inside:avoid}
    h2{font-size:15px;border-bottom:1px solid #e4e4e7;padding-bottom:4px;margin:0 0 8px}
    ul{list-style:none;padding:0;margin:0}
    li{display:flex;gap:12px;padding:6px 0;border-bottom:1px solid #f4f4f5}
    .t{width:74px;flex:none;font-weight:600;color:#4f46e5}
    .n{font-weight:600}
    .p{color:#52525b;font-size:13px}
    .d{color:#52525b;font-size:13px}
    .m{color:#71717a;font-size:12px;margin-top:2px}
    @media print{body{margin:0}}
  </style></head><body>
    <h1>${esc(title)}</h1>
    <p class="sub">Itinerary</p>
    ${dayBlocks}
  </body></html>`;
}

function formatChangelogDate(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const CHANGE_TYPE_LABELS: Record<ChangeLogEntry["change_type"], string> = {
  consulting_plan: "Plan generated",
  manual_edit: "Manual edit",
  revision: "Revision",
  booking_replan: "Booking replan",
  intrip_adjustment: "In-trip adjustment",
  collaborator_edit: "Collaborator edit",
};

const CHANGE_TYPE_COLORS: Record<ChangeLogEntry["change_type"], string> = {
  consulting_plan: "bg-indigo-100 text-indigo-700",
  manual_edit: "bg-amber-100 text-amber-700",
  revision: "bg-blue-100 text-blue-700",
  booking_replan: "bg-purple-100 text-purple-700",
  intrip_adjustment: "bg-green-100 text-green-700",
  collaborator_edit: "bg-pink-100 text-pink-700",
};

// ---------------------------------------------------------------------------
// Activity type badge
// ---------------------------------------------------------------------------

function ActivityTypeBadge({ type }: { type: ActivityType | null }) {
  const resolved = type ?? "other";
  return (
    <span
      className={[
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
        ACTIVITY_TYPE_COLORS[resolved],
      ].join(" ")}
    >
      {ACTIVITY_TYPE_LABELS[resolved]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  proposed: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
};

const STATUS_LABELS: Record<string, string> = {
  planned: "Upcoming",
  in_progress: "On trip",
  completed: "Completed",
};

function getTripStatusLabel(status: string): string {
  return (
    STATUS_LABELS[status] ??
    status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={[
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-600",
      ].join(" ")}
    >
      {getTripStatusLabel(status)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Lock icon (inline SVG — no extra dep)
// ---------------------------------------------------------------------------

function LockIcon({ locked }: { locked: boolean }) {
  return locked ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
        clipRule="evenodd"
      />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pencil (edit) icon
// ---------------------------------------------------------------------------

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sparkle (AI revise) icon
// ---------------------------------------------------------------------------

function SparkleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 1.5l1.6 4.2a3 3 0 001.7 1.7l4.2 1.6-4.2 1.6a3 3 0 00-1.7 1.7L10 16.5l-1.6-4.2a3 3 0 00-1.7-1.7L2.5 9l4.2-1.6a3 3 0 001.7-1.7L10 1.5zM16 13l.6 1.6a1.5 1.5 0 00.8.8L19 16l-1.6.6a1.5 1.5 0 00-.8.8L16 19l-.6-1.6a1.5 1.5 0 00-.8-.8L13 16l1.6-.6a1.5 1.5 0 00.8-.8L16 13z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Activity revise form (inline AI revision)
// ---------------------------------------------------------------------------

interface ReviseActivityFormProps {
  activity: Activity;
  tripId: string;
  onRevised: (updated: Activity) => void;
  onCancel: () => void;
}

function ReviseActivityForm({
  activity,
  tripId,
  onRevised,
  onCancel,
}: ReviseActivityFormProps) {
  const [instruction, setInstruction] = useState("");
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevise() {
    const trimmed = instruction.trim();
    if (!trimmed) {
      setError("Tell the planner what to change.");
      return;
    }
    setRevising(true);
    setError(null);

    const body: ReviseActivityRequestBody = { instruction: trimmed };

    try {
      const res = await fetch(
        `/api/trips/${tripId}/activities/${activity.activity_id}/revise`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const errBody = (await res.json()) as ReviseActivityErrorBody;
        setError(errBody.error ?? "Failed to revise this activity.");
        return;
      }

      const responseBody = (await res.json()) as ReviseActivityResponseBody;
      onRevised(responseBody.activity);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRevising(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1.5 text-sm font-medium text-violet-800">
          <SparkleIcon />
          Revise &ldquo;{activity.name}&rdquo;
        </label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={revising}
          rows={2}
          autoFocus
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500"
          placeholder="e.g. swap for something cheaper, find a more local option, different cuisine"
        />
      </div>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={handleRevise}
          loading={revising}
          disabled={revising}
        >
          {revising ? "Revising…" : "Revise"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={revising}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Activity edit form (inline)
// ---------------------------------------------------------------------------

interface ActivityEditFormProps {
  activity: Activity;
  tripId: string;
  onSaved: (updated: Activity) => void;
  onCancel: () => void;
}

function ActivityEditForm({
  activity,
  tripId,
  onSaved,
  onCancel,
}: ActivityEditFormProps) {
  const [name, setName] = useState(activity.name);
  const [description, setDescription] = useState(activity.description ?? "");
  const [cost, setCost] = useState(
    activity.estimated_cost_usd != null
      ? String(activity.estimated_cost_usd)
      : ""
  );
  const [time, setTime] = useState(
    activity.estimated_time_hours != null
      ? String(activity.estimated_time_hours)
      : ""
  );
  const [activityType, setActivityType] = useState<ActivityType | "">(
    activity.activity_type ?? ""
  );
  const [startTime, setStartTime] = useState(
    activity.start_time ? activity.start_time.slice(0, 5) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const body: PatchActivityRequestBody = {
      name: name.trim(),
      description: description.trim() || null,
      estimated_cost_usd:
        cost.trim() !== "" && !isNaN(Number(cost)) ? Number(cost) : null,
      estimated_time_hours:
        time.trim() !== "" && !isNaN(Number(time)) ? Number(time) : null,
      activity_type: (activityType as ActivityType) || null,
      start_time: startTime || null,
    };

    try {
      const res = await fetch(
        `/api/trips/${tripId}/activities/${activity.activity_id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const errBody = (await res.json()) as PatchActivityErrorBody;
        setError(errBody.error ?? "Failed to save changes.");
        return;
      }

      const responseBody = (await res.json()) as PatchActivityResponseBody;
      onSaved(responseBody.activity);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
      <div className="flex flex-col gap-2">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
          autoFocus
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-700">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
            rows={2}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500"
            placeholder="Optional description"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Start time"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={saving}
          />
          <Input
            label="Duration (hours)"
            type="number"
            min="0"
            step="0.25"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={saving}
            placeholder="e.g. 1.5"
          />
        </div>
        <Input
          label="Cost (USD)"
          type="number"
          min="0"
          step="0.01"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          disabled={saving}
          placeholder="e.g. 25"
        />
        <p className="text-xs text-zinc-500">
          Changing the start time or duration shifts the rest of the day.
        </p>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-700">Type</label>
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value as ActivityType | "")}
            disabled={saving}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-50"
          >
            <option value="">Select type</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          loading={saving}
          disabled={saving}
        >
          Save
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity card (with edit + lock controls)
// ---------------------------------------------------------------------------

interface ActivityCardProps {
  activity: Activity;
  tripId: string;
  onActivityUpdated: (updated: Activity) => void;
  dayId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onReorder: (direction: "up" | "down") => void;
  onDropBeforeMe: (dragged: { activityId: string; fromDayId: string }) => void;
  onDeleted: () => void;
}

function ActivityCard({
  activity,
  tripId,
  dayId,
  onActivityUpdated,
  canMoveUp,
  canMoveDown,
  onReorder,
  onDropBeforeMe,
  onDeleted,
}: ActivityCardProps) {
  const [editing, setEditing] = useState(false);
  const [revising, setRevising] = useState(false);
  const [lockPending, setLockPending] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropBefore, setDropBefore] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/activities/${activity.activity_id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const errBody = (await res.json()) as DeleteActivityErrorBody;
        setDeleteError(errBody.error ?? "Failed to remove activity.");
        setDeleting(false);
        return;
      }
      onDeleted(); // parent removes this card from the day
    } catch {
      setDeleteError("Network error. Please try again.");
      setDeleting(false);
    }
  }

  // Controlled by the parent (ItineraryView.localDays is the single source of
  // truth, and onActivityUpdated drives all updates incl. the cascade), so the
  // card renders straight from its prop — no derived local copy to keep in sync.
  const act = activity;

  async function handleToggleLock() {
    setLockPending(true);
    setLockError(null);
    const newLocked = !act.locked;

    try {
      const body: PatchActivityRequestBody = { locked: newLocked };
      const res = await fetch(
        `/api/trips/${tripId}/activities/${act.activity_id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const errBody = (await res.json()) as PatchActivityErrorBody;
        setLockError(errBody.error ?? "Failed to toggle lock.");
        return;
      }

      const responseBody = (await res.json()) as PatchActivityResponseBody;
      onActivityUpdated(responseBody.activity);
    } catch {
      setLockError("Network error. Please try again.");
    } finally {
      setLockPending(false);
    }
  }

  function handleSaved(updated: Activity) {
    setEditing(false);
    onActivityUpdated(updated);
  }

  function handleRevised(updated: Activity) {
    setRevising(false);
    onActivityUpdated(updated);
  }

  const interactive = !editing && !revising;

  return (
    <div
      draggable={interactive}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ activityId: act.activity_id, fromDayId: dayId })
        );
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        if (!interactive) return;
        e.preventDefault();
        e.stopPropagation();
        setDropBefore(true);
      }}
      onDragLeave={() => setDropBefore(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDropBefore(false);
        const dragged = readDrag(e);
        if (dragged && dragged.activityId !== act.activity_id) {
          onDropBeforeMe(dragged);
        }
      }}
      className={[
        "flex flex-col gap-1.5 rounded-lg border bg-zinc-50 p-3",
        interactive ? "cursor-grab active:cursor-grabbing" : "",
        dragging ? "opacity-40" : "",
        dropBefore ? "border-t-2 border-t-indigo-500" : "",
        act.locked ? "border-indigo-200" : "border-zinc-100",
      ].join(" ")}
    >
      {editing ? (
        <ActivityEditForm
          activity={act}
          tripId={tripId}
          onSaved={handleSaved}
          onCancel={() => setEditing(false)}
        />
      ) : revising ? (
        <ReviseActivityForm
          activity={act}
          tripId={tripId}
          onRevised={handleRevised}
          onCancel={() => setRevising(false)}
        />
      ) : (
        <>
          {/* Start time */}
          {act.start_time && (
            <p className="text-xs font-semibold text-indigo-600">
              {formatClock(act.start_time)}
            </p>
          )}

          {/* Header row: name + type badge + action buttons */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug text-zinc-900">
              {act.name}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <ActivityTypeBadge type={act.activity_type} />

              {/* Reorder up */}
              <button
                onClick={() => onReorder("up")}
                disabled={!canMoveUp}
                className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-30"
                title="Move earlier"
                aria-label={`Move ${act.name} earlier`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 5a1 1 0 01.7.29l5 5a1 1 0 01-1.4 1.42L10 7.41l-4.3 4.3a1 1 0 01-1.4-1.42l5-5A1 1 0 0110 5z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Reorder down */}
              <button
                onClick={() => onReorder("down")}
                disabled={!canMoveDown}
                className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-30"
                title="Move later"
                aria-label={`Move ${act.name} later`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 15a1 1 0 01-.7-.29l-5-5a1 1 0 011.4-1.42L10 12.59l4.3-4.3a1 1 0 011.4 1.42l-5 5A1 1 0 0110 15z" clipRule="evenodd" />
                </svg>
              </button>

              {/* AI revise button */}
              <button
                onClick={() => setRevising(true)}
                className="rounded p-1 text-zinc-400 transition-colors hover:bg-violet-100 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                title="Revise with AI"
                aria-label={`Revise ${act.name} with AI`}
              >
                <SparkleIcon />
              </button>

              {/* Edit button */}
              <button
                onClick={() => setEditing(true)}
                className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Edit activity"
                aria-label={`Edit ${act.name}`}
              >
                <PencilIcon />
              </button>

              {/* Lock toggle */}
              <button
                onClick={handleToggleLock}
                disabled={lockPending}
                className={[
                  "rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed",
                  act.locked
                    ? "text-indigo-600 hover:bg-indigo-100"
                    : "text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700",
                ].join(" ")}
                title={act.locked ? "Unlock activity" : "Lock activity"}
                aria-label={act.locked ? `Unlock ${act.name}` : `Lock ${act.name}`}
                aria-pressed={act.locked}
              >
                <LockIcon locked={act.locked} />
              </button>

              {/* Delete */}
              <button
                onClick={() => setConfirmingDelete(true)}
                className="rounded p-1 text-zinc-400 transition-colors hover:bg-red-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                title="Remove activity"
                aria-label={`Remove ${act.name}`}
              >
                <TrashIcon />
              </button>
            </div>
          </div>

          {/* Delete confirm */}
          {confirmingDelete && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
              <span>Remove this activity?</span>
              <span className="flex shrink-0 gap-1">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded bg-red-600 px-2 py-0.5 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "Removing…" : "Remove"}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="rounded px-2 py-0.5 font-medium text-zinc-600 hover:bg-zinc-200"
                >
                  Cancel
                </button>
              </span>
            </div>
          )}
          {deleteError && (
            <p className="text-xs text-red-600" role="alert">
              {deleteError}
            </p>
          )}

          {/* Place name */}
          {act.place_name && (
            <p className="text-xs text-zinc-500">{act.place_name}</p>
          )}

          {/* Description */}
          {act.description && (
            <p className="text-xs leading-relaxed text-zinc-600">
              {act.description}
            </p>
          )}

          {/* Meta row: time + cost */}
          {(act.estimated_time_hours != null ||
            act.estimated_cost_usd != null) && (
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {act.estimated_time_hours != null && (
                <span>{formatTime(act.estimated_time_hours)}</span>
              )}
              {act.estimated_cost_usd != null && (
                <span className="font-medium text-zinc-700">
                  {formatCost(act.estimated_cost_usd)}
                </span>
              )}
            </div>
          )}

          {/* Source attribution */}
          {act.source_attribution && (
            <p className="text-xs italic text-zinc-400">
              via {act.source_attribution}
            </p>
          )}

          {/* Lock error */}
          {lockError && (
            <p className="text-xs text-red-600" role="alert">
              {lockError}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day revise form (inline AI revision of a whole day)
// ---------------------------------------------------------------------------

interface ReviseDayFormProps {
  dayId: string;
  tripId: string;
  onRevised: (activities: Activity[]) => void;
  onCancel: () => void;
}

function ReviseDayForm({ dayId, tripId, onRevised, onCancel }: ReviseDayFormProps) {
  const [instruction, setInstruction] = useState("");
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevise() {
    const trimmed = instruction.trim();
    if (!trimmed) {
      setError("Tell the planner how to change this day.");
      return;
    }
    setRevising(true);
    setError(null);

    const body: ReviseDayRequestBody = { instruction: trimmed };
    try {
      const res = await fetch(`/api/trips/${tripId}/days/${dayId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json()) as ReviseDayErrorBody;
        setError(errBody.error ?? "Failed to revise this day.");
        return;
      }
      const responseBody = (await res.json()) as ReviseDayResponseBody;
      onRevised(responseBody.activities);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRevising(false);
    }
  }

  return (
    <div className="ml-8 flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
      <label className="flex items-center gap-1.5 text-sm font-medium text-violet-800">
        <SparkleIcon />
        Revise this day
      </label>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        disabled={revising}
        rows={2}
        autoFocus
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-50"
        placeholder="e.g. more outdoorsy, make the morning cheaper, add a museum"
      />
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={handleRevise}
          loading={revising}
          disabled={revising}
        >
          {revising ? "Revising…" : "Revise day"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={revising}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-violet-700/70">Locked activities are kept.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day section (with lock toggle)
// ---------------------------------------------------------------------------

interface DaySectionProps {
  day: ItineraryDay & { activities?: Activity[] };
  dayNumber: number;
  tripId: string;
  onDayUpdated: (updated: ItineraryDay) => void;
  onActivityUpdated: (updated: Activity) => void;
  onDayActivitiesReplaced: (dayId: string, activities: Activity[]) => void;
  onReorderActivity: (
    dayId: string,
    activityId: string,
    direction: "up" | "down"
  ) => void;
  onActivityDrop: (
    targetDayId: string,
    beforeActivityId: string | null,
    draggedActivityId: string,
    fromDayId: string
  ) => void;
  onActivityDeleted: (dayId: string, activityId: string) => void;
}

/** Reads the dragged activity payload from a drop event. */
function readDrag(
  e: DragEvent
): { activityId: string; fromDayId: string } | null {
  try {
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { activityId: string; fromDayId: string };
    if (!parsed.activityId || !parsed.fromDayId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function DaySection({
  day,
  dayNumber,
  tripId,
  onDayUpdated,
  onActivityUpdated,
  onDayActivitiesReplaced,
  onReorderActivity,
  onActivityDrop,
  onActivityDeleted,
}: DaySectionProps) {
  const [localDay, setLocalDay] = useState<ItineraryDay>(day);
  const [lockPending, setLockPending] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [revisingDay, setRevisingDay] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const activities = day.activities ?? [];

  async function handleToggleDayLock() {
    setLockPending(true);
    setLockError(null);
    const newLocked = !localDay.locked;

    try {
      const body: PatchDayRequestBody = { locked: newLocked };
      const res = await fetch(
        `/api/trips/${tripId}/days/${localDay.day_id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const errBody = (await res.json()) as PatchDayErrorBody;
        setLockError(errBody.error ?? "Failed to toggle day lock.");
        return;
      }

      const responseBody = (await res.json()) as PatchDayResponseBody;
      setLocalDay(responseBody.day);
      onDayUpdated(responseBody.day);
    } catch {
      setLockError("Network error. Please try again.");
    } finally {
      setLockPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Day header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
            {dayNumber}
          </span>
          <span className="text-sm font-semibold text-zinc-800">
            {formatDate(day.date)}
          </span>
          {localDay.locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              <LockIcon locked={true} />
              Locked
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {day.daily_cost != null && (
            <span className="text-xs font-medium text-zinc-500">
              {formatCost(day.daily_cost)} / day
            </span>
          )}

          {/* AI revise-day toggle */}
          <button
            onClick={() => setRevisingDay((v) => !v)}
            className="flex items-center gap-1 rounded-lg bg-violet-100 px-2 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            title="Revise this day with AI"
            aria-expanded={revisingDay}
          >
            <SparkleIcon />
            Revise day
          </button>

          {/* Day lock toggle */}
          <button
            onClick={handleToggleDayLock}
            disabled={lockPending}
            className={[
              "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed",
              localDay.locked
                ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
            ].join(" ")}
            title={localDay.locked ? "Unlock this day" : "Lock this day"}
            aria-pressed={localDay.locked}
          >
            <LockIcon locked={localDay.locked} />
            {localDay.locked ? "Unlock day" : "Lock day"}
          </button>
        </div>
      </div>

      {lockError && (
        <p className="text-xs text-red-600" role="alert">
          {lockError}
        </p>
      )}

      {/* AI revise-day form */}
      {revisingDay && (
        <ReviseDayForm
          dayId={day.day_id}
          tripId={tripId}
          onRevised={(acts) => {
            onDayActivitiesReplaced(day.day_id, acts);
            setRevisingDay(false);
          }}
          onCancel={() => setRevisingDay(false)}
        />
      )}

      {/* Activity list — also a drop zone (drop here = move to end of this day) */}
      <div
        className={[
          "flex flex-col gap-2 rounded-lg pl-8 transition-colors",
          isDragOver ? "bg-indigo-50 ring-2 ring-indigo-300" : "",
        ].join(" ")}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          // Only clear when leaving the container, not when moving over a child.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const dragged = readDrag(e);
          if (dragged) {
            onActivityDrop(day.day_id, null, dragged.activityId, dragged.fromDayId);
          }
        }}
      >
        {activities.length > 0 ? (
          activities.map((activity, index) => (
            <ActivityCard
              key={activity.activity_id}
              activity={activity}
              tripId={tripId}
              dayId={day.day_id}
              onActivityUpdated={onActivityUpdated}
              canMoveUp={index > 0}
              canMoveDown={index < activities.length - 1}
              onReorder={(direction) =>
                onReorderActivity(day.day_id, activity.activity_id, direction)
              }
              onDropBeforeMe={(dragged) =>
                onActivityDrop(
                  day.day_id,
                  activity.activity_id,
                  dragged.activityId,
                  dragged.fromDayId
                )
              }
              onDeleted={() =>
                onActivityDeleted(day.day_id, activity.activity_id)
              }
            />
          ))
        ) : (
          <p className="py-2 text-xs italic text-zinc-400">
            No activities planned for this day. Drag one here to move it.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Changelog drawer
// ---------------------------------------------------------------------------

interface ChangelogDrawerProps {
  tripId: string;
  onClose: () => void;
}

function ChangelogDrawer({ tripId, onClose }: ChangelogDrawerProps) {
  const [entries, setEntries] = useState<ChangeLogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/trips/${tripId}/changelog`);
        if (!res.ok) {
          const errBody = (await res.json()) as GetChangelogErrorBody;
          if (!cancelled) setError(errBody.error ?? "Failed to load changelog.");
          return;
        }
        const body = (await res.json()) as GetChangelogResponseBody;
        if (!cancelled) setEntries(body.entries);
      } catch {
        if (!cancelled) setError("Network error. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Change log"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-base font-semibold text-zinc-900">
            Change history
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Close change history"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && entries !== null && entries.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-400">
              No changes recorded yet.
            </p>
          )}

          {!loading && !error && entries && entries.length > 0 && (
            <ol className="flex flex-col gap-4">
              {entries.map((entry) => (
                <li key={entry.log_id} className="flex gap-3">
                  {/* Timeline dot */}
                  <div className="mt-1 flex-none">
                    <span className="block h-2 w-2 rounded-full bg-indigo-400" />
                  </div>

                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={[
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          CHANGE_TYPE_COLORS[entry.change_type],
                        ].join(" ")}
                      >
                        {CHANGE_TYPE_LABELS[entry.change_type]}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {formatChangelogDate(entry.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-700">{entry.summary}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ItineraryView({
  tripId,
  itinerary,
  tripTitle,
  calendarSubscribeUrl,
  onItineraryUpdated,
}: ItineraryViewProps) {
  const router = useRouter();

  // Local copy of days so mutations reflect immediately without a full page refresh
  const [localDays, setLocalDays] = useState<
    (ItineraryDay & { activities?: Activity[] })[]
  >(itinerary.days ?? []);

  const [changelogOpen, setChangelogOpen] = useState(false);

  // Whole-itinerary AI revision
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseInstruction, setReviseInstruction] = useState("");
  const [revising, setRevising] = useState(false);
  const [reviseError, setReviseError] = useState<string | null>(null);

  async function runWholeItineraryRevise(
    instruction: string,
    kind: "user" | "tidy" = "user"
  ) {
    setRevising(true);
    setReviseError(null);

    const body: ReviseItineraryRequestBody = { instruction, kind };

    try {
      const res = await fetch(`/api/trips/${tripId}/itinerary/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = (await res.json()) as ReviseItineraryErrorBody;
        setReviseError(errBody.error ?? "Failed to revise the itinerary.");
        return;
      }

      // Revision creates a NEW current version. Refresh so the server component
      // re-fetches and renders it. router.refresh() does NOT remount this
      // client component, so `revising` must be reset explicitly (in finally) —
      // otherwise the overlay would stay up forever.
      setReviseInstruction("");
      setReviseOpen(false);
      onItineraryUpdated?.();
      router.refresh();
    } catch {
      setReviseError("Network error. Please try again.");
    } finally {
      setRevising(false);
    }
  }

  function handleReviseItinerary() {
    const trimmed = reviseInstruction.trim();
    if (!trimmed) {
      setReviseError("Tell the planner what to change across the trip.");
      return;
    }
    void runWholeItineraryRevise(trimmed);
  }

  function handleTidyUp() {
    void runWholeItineraryRevise(TIDY_UP_INSTRUCTION, "tidy");
  }

  const [exportOpen, setExportOpen] = useState(false);
  const exportTitle = tripTitle?.trim() || "Trip itinerary";

  function handleExportICS() {
    const ics = buildICS(localDays, exportTitle);
    downloadFile(ics, `${slugify(exportTitle)}.ics`, "text/calendar;charset=utf-8");
    setExportOpen(false);
  }

  function handleExportPDF() {
    const html = buildPrintHTML(localDays, exportTitle);
    const w = window.open("", "_blank");
    if (!w) {
      // Popup blocked — fall back to downloading the printable HTML.
      downloadFile(html, `${slugify(exportTitle)}.html`, "text/html");
      setExportOpen(false);
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
    setExportOpen(false);
  }

  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopySubscribe() {
    if (!calendarSubscribeUrl) return;
    try {
      await navigator.clipboard.writeText(calendarSubscribeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the URL is shown for manual copy */
    }
  }

  const handleDayUpdated = useCallback(
    (updated: ItineraryDay) => {
      setLocalDays((prev) =>
        prev.map((d) =>
          d.day_id === updated.day_id ? { ...d, ...updated } : d
        )
      );
      onItineraryUpdated?.();
    },
    [onItineraryUpdated]
  );

  // Mirror localDays into a ref so the cascade handler can read the current
  // (pre-update) activity values without going stale across renders.
  const localDaysRef = useRef(localDays);
  useEffect(() => {
    localDaysRef.current = localDays;
  }, [localDays]);

  const handleActivityUpdated = useCallback(
    (updated: Activity) => {
      const prev = localDaysRef.current;
      const dayIdx = prev.findIndex((d) =>
        (d.activities ?? []).some((a) => a.activity_id === updated.activity_id)
      );

      // Activity not found in any loaded day — fall back to a plain replace.
      if (dayIdx === -1) {
        onItineraryUpdated?.();
        return;
      }

      const acts = prev[dayIdx].activities ?? [];
      const editedIdx = acts.findIndex(
        (a) => a.activity_id === updated.activity_id
      );
      const old = acts[editedIdx];

      // How far the edited activity's END moved (start and/or duration change).
      const newEnd = activityEndMinutes(updated);
      const oldEnd = old ? activityEndMinutes(old) : null;
      const delta = newEnd != null && oldEnd != null ? newEnd - oldEnd : 0;

      // Replace the edited activity; shift everything after it by the delta.
      const downstream: { activity_id: string; start_time: string | null }[] = [];
      let newActs = acts.map((a, i) => {
        if (a.activity_id === updated.activity_id) return updated;
        if (delta === 0 || i <= editedIdx) return a;
        // A locked activity is a fixed anchor — never shift its time via cascade.
        if (a.locked) return a;
        const s = parseClock(a.start_time);
        if (s == null) return a;
        const shifted = minutesToHHMM(s + delta);
        downstream.push({ activity_id: a.activity_id, start_time: shifted });
        return { ...a, start_time: shifted };
      });

      // Re-sort by clock time so a retimed activity lands in the right slot.
      newActs = [...newActs].sort(byClock);

      const newDays = prev.map((d, i) =>
        i === dayIdx ? { ...d, activities: newActs } : d
      );
      setLocalDays(newDays);
      localDaysRef.current = newDays;

      // Persist the cascaded downstream times (the edited activity itself was
      // already saved by whoever called this). Fire-and-forget.
      if (downstream.length > 0) {
        void fetch(
          `/api/trips/${tripId}/days/${prev[dayIdx].day_id}/schedule`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ updates: downstream }),
          }
        ).catch(() => {
          /* non-fatal; a refresh will reconcile from the server */
        });
      }

      onItineraryUpdated?.();
    },
    [tripId, onItineraryUpdated]
  );

  // Per-day AI revise replaced the whole day's activity set — swap them in
  // (already ordered by start_time from the server).
  const handleDayActivitiesReplaced = useCallback(
    (dayId: string, activities: Activity[]) => {
      setLocalDays((prev) =>
        prev.map((d) => (d.day_id === dayId ? { ...d, activities } : d))
      );
      onItineraryUpdated?.();
    },
    [onItineraryUpdated]
  );

  // Manual reorder within a day: swap an activity's start_time with its
  // neighbour (start_time is the primary sort key), then persist both.
  const handleReorderActivity = useCallback(
    (dayId: string, activityId: string, direction: "up" | "down") => {
      const prev = localDaysRef.current;
      const dayIdx = prev.findIndex((d) => d.day_id === dayId);
      if (dayIdx === -1) return;
      const acts = [...(prev[dayIdx].activities ?? [])];
      const idx = acts.findIndex((a) => a.activity_id === activityId);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= acts.length) return;

      const a = acts[idx];
      const b = acts[swapIdx];
      // Can't reorder across a locked anchor — its time must stay fixed.
      if (a.locked || b.locked) return;
      acts[idx] = { ...a, start_time: b.start_time };
      acts[swapIdx] = { ...b, start_time: a.start_time };
      const sorted = [...acts].sort(byClock);

      const newDays = prev.map((d, i) =>
        i === dayIdx ? { ...d, activities: sorted } : d
      );
      setLocalDays(newDays);
      localDaysRef.current = newDays;

      const updates: RescheduleRequestBody["updates"] = [
        { activity_id: a.activity_id, start_time: b.start_time },
        { activity_id: b.activity_id, start_time: a.start_time },
      ];
      void fetch(`/api/trips/${tripId}/days/${dayId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates } satisfies RescheduleRequestBody),
      }).catch(() => {
        /* non-fatal; a refresh reconciles */
      });
      onItineraryUpdated?.();
    },
    [tripId, onItineraryUpdated]
  );

  // Manual move to another day (deterministic, server-validated).
  const handleMoveToDay = useCallback(
    async (activityId: string, fromDayId: string, targetDayId: string) => {
      if (fromDayId === targetDayId) return;
      try {
        const res = await fetch(
          `/api/trips/${tripId}/activities/${activityId}/move`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              target_day_id: targetDayId,
            } satisfies MoveActivityRequestBody),
          }
        );
        if (!res.ok) {
          const err = (await res.json()) as MoveActivityErrorBody;
          // Surface via console; a refresh will reconcile. (Errors here are rare.)
          console.error("Move failed:", err.error);
          return;
        }
        const { activity } = (await res.json()) as MoveActivityResponseBody;
        setLocalDays((prev) =>
          prev.map((d) => {
            if (d.day_id === fromDayId) {
              return {
                ...d,
                activities: (d.activities ?? []).filter(
                  (x) => x.activity_id !== activityId
                ),
              };
            }
            if (d.day_id === targetDayId) {
              return {
                ...d,
                activities: [...(d.activities ?? []), activity].sort(byClock),
              };
            }
            return d;
          })
        );
        onItineraryUpdated?.();
      } catch {
        /* network error; non-fatal */
      }
    },
    [tripId, onItineraryUpdated]
  );

  // Remove an activity from its day.
  const handleActivityDeleted = useCallback(
    (dayId: string, activityId: string) => {
      setLocalDays((prev) =>
        prev.map((d) =>
          d.day_id === dayId
            ? {
                ...d,
                activities: (d.activities ?? []).filter(
                  (a) => a.activity_id !== activityId
                ),
              }
            : d
        )
      );
      onItineraryUpdated?.();
    },
    [onItineraryUpdated]
  );

  // Drag-and-drop: reorder within a day, or move to another day.
  const handleActivityDrop = useCallback(
    (
      targetDayId: string,
      beforeActivityId: string | null,
      draggedActivityId: string,
      fromDayId: string
    ) => {
      if (!draggedActivityId || draggedActivityId === beforeActivityId) return;

      // Cross-day: move it (keeps its time, re-sorts into place on the new day).
      if (fromDayId !== targetDayId) {
        void handleMoveToDay(draggedActivityId, fromDayId, targetDayId);
        return;
      }

      // Within-day reorder: splice to the new position, then reassign time-slots.
      const prev = localDaysRef.current;
      const dayIdx = prev.findIndex((d) => d.day_id === targetDayId);
      if (dayIdx === -1) return;
      const acts = [...(prev[dayIdx].activities ?? [])];
      const fromIdx = acts.findIndex((a) => a.activity_id === draggedActivityId);
      if (fromIdx === -1) return;

      const [moved] = acts.splice(fromIdx, 1);
      let insertIdx = beforeActivityId
        ? acts.findIndex((a) => a.activity_id === beforeActivityId)
        : acts.length;
      if (insertIdx === -1) insertIdx = acts.length;
      acts.splice(insertIdx, 0, moved);

      const { acts: reassigned, changed } = reassignTimeSlots(acts);
      const sorted = [...reassigned].sort(byClock);
      const newDays = prev.map((d, i) =>
        i === dayIdx ? { ...d, activities: sorted } : d
      );
      setLocalDays(newDays);
      localDaysRef.current = newDays;

      if (changed.length > 0) {
        void fetch(`/api/trips/${tripId}/days/${targetDayId}/schedule`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates: changed } satisfies RescheduleRequestBody),
        }).catch(() => {
          /* non-fatal */
        });
      }
      onItineraryUpdated?.();
    },
    [tripId, onItineraryUpdated, handleMoveToDay]
  );

  // Compute total from day costs if total_cost_estimate is missing
  const totalCost =
    itinerary.total_cost_estimate ??
    (localDays.length > 0
      ? localDays.reduce((sum, d) => sum + (d.daily_cost ?? 0), 0)
      : null);

  // While a whole-itinerary revision is in flight, replace the view with the
  // prominent overlay (revision regenerates the plan — takes 10-20s). The
  // overlay stays up through router.refresh(), which remounts this component
  // with the new version.
  if (revising) {
    return <ItineraryGeneratingOverlay />;
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* ---- Itinerary header card ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Your Itinerary</CardTitle>
            {/* View changes drawer trigger (change-log mount point) */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReviseError(null);
                  setReviseOpen((v) => !v);
                }}
                aria-expanded={reviseOpen}
                aria-label="Revise itinerary with AI"
              >
                <span className="flex items-center gap-1.5">
                  <SparkleIcon />
                  Revise
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTidyUp}
                aria-label="Tidy up the whole trip with AI"
                title="Remove redundancy and fix timing across the whole trip"
              >
                Tidy up
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChangelogOpen(true)}
                aria-label="View change history"
              >
                View changes
              </Button>
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExportOpen((v) => !v)}
                  aria-expanded={exportOpen}
                  aria-label="Export itinerary"
                >
                  Export
                </Button>
                {exportOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      aria-hidden="true"
                      onClick={() => setExportOpen(false)}
                    />
                    <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
                      <button
                        onClick={handleExportPDF}
                        className="block w-full rounded px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                      >
                        Save as PDF
                      </button>
                      <button
                        onClick={handleExportICS}
                        className="block w-full rounded px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                      >
                        Add to calendar (.ics)
                      </button>
                      {calendarSubscribeUrl && (
                        <button
                          onClick={() => {
                            setExportOpen(false);
                            setSubscribeOpen(true);
                          }}
                          className="block w-full rounded px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                        >
                          Subscribe (auto-sync)…
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              <StatusBadge status={itinerary.status} />
              <span className="text-xs text-zinc-400">
                v{itinerary.version}
              </span>
            </div>
          </CardHeader>

          {/* Whole-itinerary AI revision panel */}
          {reviseOpen && (
            <div className="mb-3 flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
              <label className="flex items-center gap-1.5 text-sm font-medium text-violet-800">
                <SparkleIcon />
                Revise the whole trip
              </label>
              <textarea
                value={reviseInstruction}
                onChange={(e) => setReviseInstruction(e.target.value)}
                rows={2}
                autoFocus
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. make it cheaper, more outdoorsy, less walking on day 2"
              />
              {reviseError && (
                <p className="text-xs text-red-600" role="alert">
                  {reviseError}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleReviseItinerary}
                >
                  Revise itinerary
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReviseOpen(false);
                    setReviseError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-violet-700/70">
                Locked activities are kept as-is. Creates a new version — your
                current plan stays in history.
              </p>
            </div>
          )}

          {/* Subscribe-by-URL panel */}
          {subscribeOpen && calendarSubscribeUrl && (
            <div className="mb-3 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-800">
                  Subscribe in your calendar (auto-syncs)
                </span>
                <button
                  onClick={() => setSubscribeOpen(false)}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                  aria-label="Close subscribe panel"
                >
                  ✕
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={calendarSubscribeUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700"
                />
                <Button variant="secondary" size="sm" onClick={handleCopySubscribe}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-zinc-500">
                In Google Calendar (web): <span className="font-medium">Other calendars → + → From URL</span>, paste this link. It updates automatically when you change the trip. Anyone with the link can view this itinerary.
              </p>
            </div>
          )}

          {itinerary.notes && (
            <p className="mb-3 text-sm text-zinc-600">{itinerary.notes}</p>
          )}

          <div className="flex flex-wrap gap-4 text-sm text-zinc-600">
            <span>
              <span className="font-medium text-zinc-900">
                {localDays.length}
              </span>{" "}
              {localDays.length === 1 ? "day" : "days"}
            </span>
            {totalCost != null && (
              <span>
                Total estimate:{" "}
                <span className="font-medium text-zinc-900">
                  {formatCost(totalCost)}
                </span>
              </span>
            )}
          </div>
        </Card>

        {/* ---- Day-by-day list ---- */}
        {localDays.length > 0 ? (
          <Card>
            <div className="flex flex-col gap-6 divide-y divide-zinc-100">
              {localDays.map((day, index) => (
                <div
                  key={day.day_id}
                  className={index === 0 ? "" : "pt-6"}
                >
                  <DaySection
                    day={day}
                    dayNumber={index + 1}
                    tripId={tripId}
                    onDayUpdated={handleDayUpdated}
                    onActivityUpdated={handleActivityUpdated}
                    onDayActivitiesReplaced={handleDayActivitiesReplaced}
                    onReorderActivity={handleReorderActivity}
                    onActivityDrop={handleActivityDrop}
                    onActivityDeleted={handleActivityDeleted}
                  />
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card>
            <p className="py-6 text-center text-sm text-zinc-400">
              No days in this itinerary yet.
            </p>
          </Card>
        )}

        {/* ---- Cost summary footer ---- */}
        {totalCost != null && localDays.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-600">Trip total estimate</span>
              <span className="font-semibold text-zinc-900">
                {formatCost(totalCost)}
              </span>
            </div>
            {localDays.length > 0 && totalCost != null && (
              <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
                <span>Daily average</span>
                <span>{formatCost(totalCost / localDays.length)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Changelog drawer (portal-style, rendered at root) ---- */}
      {changelogOpen && (
        <ChangelogDrawer
          tripId={tripId}
          onClose={() => setChangelogOpen(false)}
        />
      )}
    </>
  );
}
