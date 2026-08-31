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

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  DestinationGuide,
  GuidePick,
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
  ChatRequestBody,
  ChatResponseBody,
  ChatErrorBody,
} from "@/app/api/trips/[id]/itinerary/chat/route";
import type {
  ReviseDayRequestBody,
  ReviseDayResponseBody,
  ReviseDayErrorBody,
} from "@/app/api/trips/[id]/days/[dayId]/revise/route";
import type { RescheduleRequestBody } from "@/app/api/trips/[id]/days/[dayId]/schedule/route";
import type {
  GuideResponseBody,
  CityGuide,
} from "@/app/api/trips/[id]/guide/route";
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

// ---------------------------------------------------------------------------
// Destination guide card (overview + coverage cross-reference)
// ---------------------------------------------------------------------------

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // fold accents: svickova etc.
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function CheckDot({ on }: { on: boolean }) {
  return (
    <span
      className={[
        "flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold",
        on ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-300",
      ].join(" ")}
      title={on ? "Already in your plan" : "Not in your plan yet"}
      aria-label={on ? "In your plan" : "Not in your plan"}
    >
      {on ? "\u2713" : "\u25cb"}
    </span>
  );
}

/** The activity that covers this highlight, if any. */
function coveringActivity(
  name: string,
  activities: Activity[]
): Activity | undefined {
  const sp = normalizeText(name.replace(/\([^)]*\)/g, " "));
  if (sp.length < 3) return undefined;
  return activities.find((a) => {
    const at = normalizeText(
      `${a.name} ${a.place_name ?? ""} ${a.description ?? ""}`
    );
    if (!at) return false;
    if (at.includes(sp)) return true;
    const an = normalizeText(a.name);
    return an.length > 4 && sp.includes(an);
  });
}

/** Stable key for a guide item across rebuilds. */
function pickKey(city: string, name: string): string {
  return `${city}::${name}`;
}

interface GuideItemState {
  key: string;
  name: string;
  why: string;
  kind: "spot" | "food";
  city: string;
  covered: boolean;
  /** Covered by an activity the traveller locked — cannot be dropped. */
  lockedIn: boolean;
}

/** One selectable highlight row. */
function PickRow({
  item,
  selected,
  onToggle,
}: {
  item: GuideItemState;
  selected: boolean;
  onToggle: () => void;
}) {
  const disabled = item.lockedIn && selected;

  return (
    <li>
      <label
        className={[
          "flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm transition-colors",
          disabled ? "cursor-not-allowed opacity-70" : "hover:bg-zinc-50",
        ].join(" ")}
        title={
          disabled
            ? "This is part of a locked activity — unlock it in the plan to remove it."
            : undefined
        }
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 flex-none rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
        />
        <CheckDot on={item.covered} />
        <span>
          <span className="font-medium text-zinc-800">{item.name}</span>
          {item.why ? <span className="text-zinc-500"> — {item.why}</span> : null}
        </span>
      </label>
    </li>
  );
}

/**
 * One collapsible "About {city}" card.
 *
 * Two independent signals per row, deliberately kept apart: the checkbox is the
 * traveller's intent (what they want in the plan) and the dot is coverage (what
 * the plan currently contains). Coverage is a fuzzy name match, so it must
 * never be used as the checkbox's source of truth — after a rebuild the model
 * rewords activities and the match drifts.
 */
function DestinationGuideCard({
  guide,
  items,
  selected,
  onToggle,
}: {
  guide: DestinationGuide;
  items: GuideItemState[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(true);

  const spots = items.filter((i) => i.kind === "spot");
  const foods = items.filter((i) => i.kind === "food");
  const spotsHit = spots.filter((i) => i.covered).length;
  const foodsHit = foods.filter((i) => i.covered).length;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <CardTitle>About {guide.destination}</CardTitle>
        <span
          className={[
            "shrink-0 text-zinc-400 transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        >
          &#9662;
        </span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-4">
          {guide.known_for && (
            <p className="text-sm leading-relaxed text-zinc-600">
              {guide.known_for}
            </p>
          )}

          {spots.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Top spots — your plan covers {spotsHit} of {spots.length}
              </h4>
              <ul className="flex flex-col">
                {spots.map((i) => (
                  <PickRow
                    key={i.key}
                    item={i}
                    selected={selected.has(i.key)}
                    onToggle={() => onToggle(i.key)}
                  />
                ))}
              </ul>
            </div>
          )}

          {foods.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Must-try food — {foodsHit} on your plan
              </h4>
              <ul className="flex flex-col">
                {foods.map((i) => (
                  <PickRow
                    key={i.key}
                    item={i}
                    selected={selected.has(i.key)}
                    onToggle={() => onToggle(i.key)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Fetches the per-city destination guides and renders one card per city, each
 * with its coverage scoped to that city's own days.
 *
 * Selection state lives here rather than in the cards so a multi-city trip
 * still rebuilds once, from one combined set of picks.
 *
 * Restoring picks: the traveller's ticks are stored on the change-log entry of
 * the revision that applied them, and re-read here. Coverage is only used as
 * the initial default on a trip that has never been rebuilt from picks.
 */
function DestinationGuides({
  tripId,
  days,
  onRebuilt,
}: {
  tripId: string;
  days: (ItineraryDay & { activities?: Activity[] })[];
  onRebuilt?: () => void;
}) {
  const [guides, setGuides] = useState<CityGuide[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [storedPicks, setStoredPicks] = useState<GuidePick[] | null>(null);
  // null = "traveller hasn't touched the ticks yet", so the derived default
  // below stays live while the guides and change log are still arriving.
  const [override, setOverride] = useState<Set<string> | null>(null);
  const [appliedBaseline, setAppliedBaseline] = useState<Set<string> | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [guideRes, logRes] = await Promise.all([
          fetch(`/api/trips/${tripId}/guide`),
          fetch(`/api/trips/${tripId}/changelog`),
        ]);
        if (!guideRes.ok) return; // no guide — hide silently
        const body = (await guideRes.json()) as GuideResponseBody;
        if (!cancelled) setGuides(body.guides);

        if (logRes.ok) {
          const log = (await logRes.json()) as GetChangelogResponseBody;
          const latest = log.entries.find(
            (e) => Array.isArray((e.metadata as { include?: unknown })?.include)
          );
          if (!cancelled && latest) {
            setStoredPicks(
              ((latest.metadata as { include?: GuidePick[] }).include ?? [])
            );
          }
        }
      } catch {
        /* network error — hide */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  /** Activities of the days whose city matches `city` (case-insensitive). */
  const activitiesForCity = useCallback(
    (city: string): Activity[] => {
      const target = city.trim().toLowerCase();
      const matched = days.filter(
        (d) => (d.city ?? "").trim().toLowerCase() === target
      );
      if (matched.length === 0 || (guides?.length ?? 0) === 1) {
        return days.flatMap((d) => d.activities ?? []);
      }
      return matched.flatMap((d) => d.activities ?? []);
    },
    [days, guides]
  );

  // Flatten every guide into one addressable list, with coverage resolved.
  const items: GuideItemState[] = useMemo(() => {
    if (!guides) return [];
    const out: GuideItemState[] = [];
    for (const cg of guides) {
      const acts = activitiesForCity(cg.city);
      const add = (h: { name: string; why: string }, kind: "spot" | "food") => {
        const covering = coveringActivity(h.name, acts);
        out.push({
          key: pickKey(cg.city, h.name),
          name: h.name,
          why: h.why,
          kind,
          city: cg.city,
          covered: Boolean(covering),
          lockedIn: Boolean(covering?.locked),
        });
      };
      for (const sp of cg.guide.top_spots) add(sp, "spot");
      for (const fd of cg.guide.must_try_foods) add(fd, "food");
    }
    return out;
  }, [guides, activitiesForCity]);

  // Derived, not stored: stored picks if this trip has been rebuilt from picks
  // before, otherwise whatever the plan already covers. Locked-in items are
  // always ticked because they cannot be removed anyway.
  const defaultSelection = useMemo(() => {
    const initial = new Set<string>();
    if (storedPicks && storedPicks.length > 0) {
      const stored = new Set(
        storedPicks.map((p) => pickKey(p.city ?? "", p.name))
      );
      for (const i of items) {
        if (stored.has(i.key) || (i.lockedIn && i.covered)) initial.add(i.key);
      }
    } else {
      for (const i of items) if (i.covered) initial.add(i.key);
    }
    return initial;
  }, [items, storedPicks]);

  const selected = override ?? defaultSelection;
  const baseline = appliedBaseline ?? defaultSelection;

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOverride(next);
  }

  async function handleRebuild() {
    const toPick = (i: GuideItemState): GuidePick => ({
      name: i.name,
      kind: i.kind,
      city: i.city,
    });

    const include = items.filter((i) => selected.has(i.key)).map(toPick);
    // Only ask to remove things that are actually in the plan — otherwise the
    // exclude list is mostly items that were never there.
    const exclude = items
      .filter((i) => !selected.has(i.key) && i.covered && !i.lockedIn)
      .map(toPick);

    if (include.length === 0 && exclude.length === 0) return;

    setRebuilding(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/itinerary/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "picks",
          include,
          exclude,
        } satisfies ReviseItineraryRequestBody),
      });
      if (!res.ok) {
        const errBody = (await res.json()) as ReviseItineraryErrorBody;
        setError(errBody.error ?? "Failed to rebuild the plan.");
        return;
      }
      setAppliedBaseline(new Set(selected));
      onRebuilt?.();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRebuilding(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
          Loading destination highlights&#8230;
        </div>
      </Card>
    );
  }

  if (!guides || guides.length === 0 || items.length === 0) return null;

  const addCount = items.filter((i) => selected.has(i.key) && !i.covered).length;
  const dropCount = items.filter(
    (i) => !selected.has(i.key) && i.covered && !i.lockedIn
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-500">
        Tick what you want in the plan and untick what you don&#39;t, then
        rebuild — the itinerary is regenerated around your picks.
      </p>

      {guides.map((cg) => (
        <DestinationGuideCard
          key={cg.city}
          guide={cg.guide}
          items={items.filter((i) => i.city === cg.city)}
          selected={selected}
          onToggle={toggle}
        />
      ))}

      {(addCount > 0 || dropCount > 0 || rebuilding) && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="text-sm text-indigo-900">
            {addCount > 0 && (
              <span>
                Adding <strong>{addCount}</strong>
              </span>
            )}
            {addCount > 0 && dropCount > 0 && <span>, </span>}
            {dropCount > 0 && (
              <span>
                removing <strong>{dropCount}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOverride(new Set(baseline))}
              disabled={rebuilding}
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleRebuild}
              disabled={rebuilding}
            >
              {rebuilding ? "Rebuilding\u2026" : "Rebuild plan"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

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

  // When a revise/regenerate produces a NEW version, router.refresh() feeds a
  // new itinerary as props WITHOUT remounting this component — so reset the
  // day state to the new version. (Without this, only the prop-driven header
  // updated and the day list stayed stale.) Within a version, local edits
  // (reorder/cascade) are preserved because the itinerary_id is unchanged.
  const [syncedItineraryId, setSyncedItineraryId] = useState(
    itinerary.itinerary_id
  );
  if (itinerary.itinerary_id !== syncedItineraryId) {
    setSyncedItineraryId(itinerary.itinerary_id);
    setLocalDays(itinerary.days ?? []);
  }

  const [changelogOpen, setChangelogOpen] = useState(false);

  // Conversational planner: discuss, then apply.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [revising, setRevising] = useState(false); // Apply overlay
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatSending]);

  // Auto-grow the composer so a multi-line message is fully visible (up to a cap).
  useEffect(() => {
    const el = chatInputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    }
  }, [chatInput]);

  async function handleSendChat() {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    const next = [...chatMessages, { role: "user" as const, content: text }];
    setChatMessages(next);
    setChatInput("");
    setChatSending(true);
    setChatError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/itinerary/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next } satisfies ChatRequestBody),
      });
      if (!res.ok) {
        const e = (await res.json()) as ChatErrorBody;
        setChatError(e.error ?? "Chat failed.");
        return;
      }
      const { reply } = (await res.json()) as ChatResponseBody;
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setChatError("Network error. Please try again.");
    } finally {
      setChatSending(false);
    }
  }

  // Apply the conversation as a single revise (creates a new version).
  async function handleApplyChat() {
    const asks = chatMessages
      .filter((m) => m.role === "user")
      .map((m) => m.content.trim())
      .filter(Boolean);
    if (asks.length === 0) {
      setChatError("Chat about what you'd like to change first.");
      return;
    }
    const instruction =
      "Apply the changes the traveller asked for in our conversation:\n" +
      asks.map((a) => `- ${a}`).join("\n");

    setRevising(true);
    setChatError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/itinerary/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction } satisfies ReviseItineraryRequestBody),
      });
      if (!res.ok) {
        const errBody = (await res.json()) as ReviseItineraryErrorBody;
        setChatError(errBody.error ?? "Failed to apply changes.");
        return;
      }
      // New version persisted — refresh so the server re-renders it. The
      // itinerary_id change resets the day list (see the sync above).
      setChatMessages([]);
      setChatOpen(false);
      onItineraryUpdated?.();
      router.refresh();
    } catch {
      setChatError("Network error. Please try again.");
    } finally {
      setRevising(false);
    }
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

  // Multi-city: a header before the first day of each city block ("Athens · Days 1–3").
  const distinctCities = new Set(
    localDays.map((d) => d.city).filter((c): c is string => !!c)
  );
  const multiCity = distinctCities.size > 1;
  const cityHeaderAt = new Map<number, { city: string; from: number; to: number }>();
  if (multiCity) {
    let i = 0;
    while (i < localDays.length) {
      const city = localDays[i].city ?? null;
      let j = i;
      while (j + 1 < localDays.length && (localDays[j + 1].city ?? null) === city)
        j++;
      if (city) cityHeaderAt.set(i, { city, from: i + 1, to: j + 1 });
      i = j + 1;
    }
  }

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
                  setChatError(null);
                  setChatOpen((v) => !v);
                }}
                aria-expanded={chatOpen}
                aria-label="Plan with AI"
              >
                <span className="flex items-center gap-1.5">
                  <SparkleIcon />
                  Plan with AI
                </span>
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

          {/* Conversational planner: discuss, then apply */}
          {chatOpen && (
            <div className="mb-3 flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-violet-800">
                  <SparkleIcon />
                  Plan with AI
                </span>
                <button
                  onClick={() => setChatOpen(false)}
                  className="rounded p-1 text-violet-400 hover:bg-violet-100 hover:text-violet-700"
                  aria-label="Close planner"
                >
                  ✕
                </button>
              </div>

              {/* Transcript */}
              {chatMessages.length === 0 ? (
                <p className="text-xs text-violet-700/80">
                  Bounce ideas about your trip — e.g. &ldquo;add svíčková for a
                  dinner&rdquo; or &ldquo;what&apos;s a good rainy-day swap for
                  day 2?&rdquo; When you&apos;re happy, hit{" "}
                  <span className="font-medium">Apply changes</span>.
                </p>
              ) : (
                <div
                  ref={chatScrollRef}
                  className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg bg-white p-2"
                >
                  {chatMessages.map((m, i) => (
                    <div
                      key={i}
                      className={[
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        m.role === "user"
                          ? "self-end bg-violet-600 text-white"
                          : "self-start bg-zinc-100 text-zinc-800",
                      ].join(" ")}
                    >
                      {m.content}
                    </div>
                  ))}
                  {chatSending && (
                    <div className="self-start rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-400">
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:240ms]" />
                      </span>
                    </div>
                  )}
                </div>
              )}

              {chatError && (
                <p className="text-xs text-red-600" role="alert">
                  {chatError}
                </p>
              )}

              {/* Composer */}
              <div className="flex items-end gap-2">
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendChat();
                    }
                  }}
                  disabled={chatSending}
                  autoFocus
                  rows={1}
                  className="min-w-0 flex-1 resize-none overflow-y-auto rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-zinc-50"
                  placeholder="Ask or suggest something…  (Enter to send, Shift+Enter for a new line)"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSendChat}
                  loading={chatSending}
                  disabled={chatSending || !chatInput.trim()}
                >
                  Send
                </Button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-violet-700/70">
                  Chatting doesn&apos;t change your plan. Locked activities are
                  kept; Apply creates a new version.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApplyChat}
                  disabled={
                    chatSending ||
                    chatMessages.filter((m) => m.role === "user").length === 0
                  }
                >
                  Apply changes
                </Button>
              </div>
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

        {/* ---- Destination guide(s) (overview + per-city coverage) ---- */}
        <DestinationGuides
          tripId={tripId}
          days={localDays}
          onRebuilt={() => {
            // A rebuild persists a new version; refresh so the server re-renders
            // it, matching how the chat "Apply changes" path updates state.
            onItineraryUpdated?.();
            router.refresh();
          }}
        />

        {/* ---- Day-by-day list ---- */}
        {localDays.length > 0 ? (
          <Card>
            <div className="flex flex-col gap-6 divide-y divide-zinc-100">
              {localDays.map((day, index) => (
                <div
                  key={day.day_id}
                  className={index === 0 ? "" : "pt-6"}
                >
                  {cityHeaderAt.has(index) && (
                    <div className="mb-3 flex items-baseline gap-2 border-l-4 border-indigo-500 pl-3">
                      <span className="text-base font-bold text-zinc-900">
                        {cityHeaderAt.get(index)!.city.split(",")[0]}
                      </span>
                      <span className="text-xs font-medium text-zinc-500">
                        {cityHeaderAt.get(index)!.from === cityHeaderAt.get(index)!.to
                          ? `Day ${cityHeaderAt.get(index)!.from}`
                          : `Days ${cityHeaderAt.get(index)!.from}–${cityHeaderAt.get(index)!.to}`}
                      </span>
                    </div>
                  )}
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
