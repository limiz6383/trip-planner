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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ItineraryGeneratingOverlay } from "@/components/itinerary/ItineraryGeneratingOverlay";
import { TYPE_META, TypeChip } from "@/components/itinerary/activity-types";
import { buildICS } from "@/lib/ics";
import { sumActivityCosts, sumDayCosts, summarizeBudget } from "@/lib/planner/costs";
import { detectTripWideImpact } from "@/lib/planner/ripple";
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
  /**
   * The brief's budget, to show planned spend against it. `dailyBudgetUsd` is
   * per traveller per day; activity costs are for the whole party.
   */
  budget?: {
    dailyBudgetUsd: number;
    party: { adults?: number; children?: number };
  } | null;
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
  return <TypeChip type={type} />;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  proposed: "bg-amber-100 text-amber-900",
  confirmed: "bg-green-100 text-green-800",
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
        "inline-block rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
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
// Small stroke icons used by the redesigned timeline
// ---------------------------------------------------------------------------

function StrokeIcon({
  children,
  className = "h-4 w-4",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ClockIcon = ({ className }: { className?: string }) => (
  <StrokeIcon className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </StrokeIcon>
);
const PinIcon = ({ className }: { className?: string }) => (
  <StrokeIcon className={className}>
    <path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </StrokeIcon>
);
const MoreIcon = ({ className }: { className?: string }) => (
  <StrokeIcon className={className}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </StrokeIcon>
);
const ChevronIcon = ({ className }: { className?: string }) => (
  <StrokeIcon className={className}>
    <path d="m6 9 6 6 6-6" />
  </StrokeIcon>
);
const SendIcon = ({ className }: { className?: string }) => (
  <StrokeIcon className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </StrokeIcon>
);
const CheckIcon = ({ className }: { className?: string }) => (
  <StrokeIcon className={className}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </StrokeIcon>
);
const ArrowUpIcon = ({ className }: { className?: string }) => (
  <StrokeIcon className={className}>
    <path d="m6 15 6-6 6 6" />
  </StrokeIcon>
);
const ArrowDownIcon = ({ className }: { className?: string }) => (
  <StrokeIcon className={className}>
    <path d="m6 9 6 6 6-6" />
  </StrokeIcon>
);

/** Round icon-only button: 44px on touch screens, 32px with a mouse. */
const ICON_BTN =
  "inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-paper-2 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-30 sm:h-8 sm:w-8";

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
  const [moreOpen, setMoreOpen] = useState(false);

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
  const isFirst = !canMoveUp;
  const isLast = !canMoveDown;
  const typeKey: ActivityType = act.activity_type ?? "other";

  return (
    <div className={["group relative", isLast ? "" : "pb-3"].join(" ")}>
      {/* Rail: a continuous line through every stop of the day, with a dot
          coloured by activity type. */}
      {!(isFirst && isLast) && (
        <span
          aria-hidden="true"
          className={[
            "absolute left-[3.55rem] w-px bg-line-strong",
            isFirst ? "top-[1.15rem] bottom-0" : isLast ? "top-0 h-[1.15rem]" : "top-0 bottom-0",
          ].join(" ")}
        />
      )}
      <span
        aria-hidden="true"
        className={[
          "absolute left-[3.55rem] top-[0.8rem] h-[0.7rem] w-[0.7rem] -translate-x-1/2 rounded-full ring-4 ring-surface",
          TYPE_META[typeKey].dot,
        ].join(" ")}
      />

      {/* Time */}
      {act.start_time && (
        <p className="absolute left-0 top-[0.62rem] w-[3rem] text-right tabular-nums leading-none text-zinc-800">
          <span className="block text-[13px] font-semibold">
            {formatClock(act.start_time).replace(/ (AM|PM)$/, "")}
          </span>
          <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            {formatClock(act.start_time).slice(-2)}
          </span>
        </p>
      )}

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
          "ml-[4.6rem] flex flex-col gap-2 rounded-xl border bg-paper/70 p-3 transition-shadow sm:p-3.5",
          interactive ? "cursor-grab hover:shadow-card active:cursor-grabbing" : "",
          dragging ? "opacity-40" : "",
          dropBefore ? "border-t-2 border-t-brand-500" : "",
          act.locked ? "border-brand-300 bg-brand-50/50" : "border-line",
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
            {/* Title + type */}
            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
              <h4 className="min-w-0 flex-1 basis-40 text-[15px] font-semibold leading-snug text-ink">
                {act.name}
              </h4>
              <ActivityTypeBadge type={act.activity_type} />
            </div>

            {act.place_name && (
              <p className="flex items-center gap-1 text-xs text-zinc-600">
                <PinIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span className="min-w-0">{act.place_name}</span>
              </p>
            )}

            {act.description && (
              <p className="text-sm leading-relaxed text-zinc-700">
                {act.description}
              </p>
            )}

            {act.source_attribution && (
              <p className="text-xs italic text-zinc-500">
                via {act.source_attribution}
              </p>
            )}

            {/* Delete confirm */}
            {confirmingDelete && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                <span>Remove this activity?</span>
                <span className="flex shrink-0 gap-1">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="min-h-11 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 sm:min-h-8"
                  >
                    {deleting ? "Removing…" : "Remove"}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="min-h-11 rounded-lg px-3 text-xs font-medium text-zinc-700 hover:bg-red-100 sm:min-h-8"
                  >
                    Cancel
                  </button>
                </span>
              </div>
            )}
            {deleteError && (
              <p className="text-xs text-red-700" role="alert">
                {deleteError}
              </p>
            )}
            {lockError && (
              <p className="text-xs text-red-700" role="alert">
                {lockError}
              </p>
            )}

            {/* Meta + actions share one row. Actions are quiet until hover/focus
                on desktop and always shown on touch screens. */}
            <div className="-mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-line/80 pt-1.5">
              {(act.estimated_time_hours != null ||
                act.estimated_cost_usd != null ||
                act.locked) && (
                <div className="mr-auto flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-xs text-zinc-600">
                  {act.estimated_time_hours != null && (
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon className="h-3.5 w-3.5 text-zinc-400" />
                      {formatTime(act.estimated_time_hours)}
                    </span>
                  )}
                  {act.estimated_cost_usd != null && (
                    <span className="rounded-md bg-paper-2 px-1.5 py-0.5 font-semibold tabular-nums text-zinc-800">
                      {formatCost(act.estimated_cost_usd)}
                    </span>
                  )}
                  {act.locked && (
                    <span className="inline-flex items-center gap-1 font-medium text-brand-700">
                      <LockIcon locked={true} />
                      Locked
                    </span>
                  )}
                </div>
              )}
              <div
                className={[
                  "ml-auto flex flex-wrap items-center gap-0.5 transition-opacity",
                  "sm:opacity-60 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                  moreOpen || act.locked ? "sm:opacity-100" : "",
                ].join(" ")}
              >
              <button
                onClick={() => setRevising(true)}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:h-8"
                title="Revise with AI"
                aria-label={`Revise ${act.name} with AI`}
              >
                <SparkleIcon />
                Revise
              </button>

              <button
                onClick={() => setEditing(true)}
                className={ICON_BTN}
                title="Edit activity"
                aria-label={`Edit ${act.name}`}
              >
                <PencilIcon />
              </button>

              <button
                onClick={handleToggleLock}
                disabled={lockPending}
                className={[
                  ICON_BTN,
                  act.locked ? "bg-brand-100 text-brand-700 hover:bg-brand-200" : "",
                ].join(" ")}
                title={act.locked ? "Unlock activity" : "Lock activity"}
                aria-label={act.locked ? `Unlock ${act.name}` : `Lock ${act.name}`}
                aria-pressed={act.locked}
              >
                <LockIcon locked={act.locked} />
              </button>

              <button
                onClick={() => setMoreOpen((v) => !v)}
                className={[ICON_BTN, moreOpen ? "bg-paper-2 text-zinc-900" : ""].join(" ")}
                title="More actions"
                aria-label={`More actions for ${act.name}`}
                aria-expanded={moreOpen}
              >
                <MoreIcon />
              </button>

              {moreOpen && (
                <>
                  <span className="mx-1 hidden h-5 w-px bg-line-strong sm:block" aria-hidden="true" />
                  <button
                    onClick={() => onReorder("up")}
                    disabled={!canMoveUp}
                    className={ICON_BTN}
                    title="Move earlier"
                    aria-label={`Move ${act.name} earlier`}
                  >
                    <ArrowUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onReorder("down")}
                    disabled={!canMoveDown}
                    className={ICON_BTN}
                    title="Move later"
                    aria-label={`Move ${act.name} later`}
                  >
                    <ArrowDownIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className={[ICON_BTN, "hover:bg-red-50 hover:text-red-700"].join(" ")}
                    title="Remove activity"
                    aria-label={`Remove ${act.name}`}
                  >
                    <TrashIcon />
                  </button>
                </>
              )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day revise form (inline AI revision of a whole day)
// ---------------------------------------------------------------------------

function BudgetLine({
  summary,
  className = "mt-3 border-t border-line pt-3",
}: {
  summary: ReturnType<typeof summarizeBudget> & object;
  className?: string;
}) {
  const over = summary.remaining < 0;
  const tone = over
    ? "text-red-800"
    : summary.status === "near"
    ? "text-amber-800"
    : "text-green-800";
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-zinc-700">
          Budget {formatCost(summary.budgetTotal)}
        </span>
        <span className={["font-semibold tabular-nums", tone].join(" ")}>
          {over
            ? `${formatCost(-summary.remaining)} over`
            : `${formatCost(summary.remaining)} left`}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-zinc-600">
        {summary.days} days &times; {summary.travellers}{" "}
        {summary.travellers === 1 ? "traveller" : "travellers"} &times;{" "}
        {formatCost(summary.partyDailyBudget / summary.travellers)} a day each.
        Costs are for the whole party.
      </p>
    </div>
  );
}

interface ReviseDayFormProps {
  dayId: string;
  dayNumber: number;
  dayCount: number;
  tripId: string;
  onRevised: (result: ReviseDayResponseBody) => void;
  onCancel: () => void;
}

function ReviseDayForm({ dayId, dayNumber, dayCount, tripId, onRevised, onCancel }: ReviseDayFormProps) {
  const [instruction, setInstruction] = useState("");
  // Same deterministic check the server runs, so the traveller is told up front
  // that this will re-plan the whole trip (and why it takes longer).
  const tripWide = detectTripWideImpact(instruction, { dayNumber, dayCount });
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
      onRevised(responseBody);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRevising(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 sm:ml-8">
      <label
        htmlFor={`revise-day-${dayId}`}
        className="flex items-center gap-1.5 text-sm font-medium text-violet-800"
      >
        <SparkleIcon />
        Revise this day
      </label>
      <textarea
        id={`revise-day-${dayId}`}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        disabled={revising}
        rows={2}
        autoFocus
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-50"
        placeholder="e.g. more outdoorsy, make the morning cheaper, add a museum"
      />
      {tripWide && (
        <p className="rounded-md bg-white/70 px-2.5 py-1.5 text-xs leading-snug text-violet-950" role="status">
          This changes your travel logistics, so the planner will re-plan the
          <strong> whole trip</strong> (neighbouring days, transfers and budget),
          not just this day. It takes a little longer and creates a new version.
        </p>
      )}
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
          {revising ? (tripWide ? "Re-planning trip…" : "Revising…") : tripWide ? "Re-plan trip" : "Revise day"}
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
  dayCount: number;
  onTripReplanned: (notice: string) => void;
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
  dayCount,
  onTripReplanned,
  onReorderActivity,
  onActivityDrop,
  onActivityDeleted,
}: DaySectionProps) {
  const [dayNotes, setDayNotes] = useState<string[]>([]);
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

  const dateObj = new Date(day.date);
  const weekday = dateObj.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const monthDay = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const cityShort = day.city ? day.city.split(",")[0] : null;

  /** Free time between the end of one stop and the start of the next. */
  function gapBefore(index: number): string | null {
    if (index === 0) return null;
    const prevEnd = activityEndMinutes(activities[index - 1]);
    const start = parseClock(activities[index].start_time);
    if (prevEnd == null || start == null) return null;
    const gap = start - prevEnd;
    if (gap < 20) return null;
    const h = Math.floor(gap / 60);
    const m = Math.round(gap % 60);
    return h === 0 ? `${m} min free` : m === 0 ? `${h}h free` : `${h}h ${m}m free`;
  }

  return (
    <section
      id={`day-${dayNumber}`}
      aria-labelledby={`day-${dayNumber}-title`}
      className="scroll-mt-32 overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
    >
      {/* Day header */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line bg-paper/60 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-700 text-white"
            aria-hidden="true"
          >
            <span className="text-[9px] font-semibold uppercase leading-none tracking-widest text-brand-100">
              Day
            </span>
            <span className="font-display text-xl font-bold leading-none">{dayNumber}</span>
          </span>
          <div className="min-w-0">
            <h3
              id={`day-${dayNumber}-title`}
              className="font-display text-lg font-semibold leading-tight text-ink"
            >
              <span className="sr-only">Day {dayNumber}: </span>
              {weekday}, {monthDay}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-600">
              {cityShort && <span className="font-medium text-zinc-700">{cityShort}</span>}
              <span>
                {activities.length} {activities.length === 1 ? "stop" : "stops"}
              </span>
              {activities.some((a) => a.estimated_cost_usd != null) && (
                <span className="font-semibold tabular-nums text-zinc-800">
                  {formatCost(sumActivityCosts(activities))} / day
                </span>
              )}
              {localDay.locked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 font-medium text-brand-800">
                  <LockIcon locked={true} />
                  Locked
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* AI revise-day toggle */}
          <button
            onClick={() => setRevisingDay((v) => !v)}
            className={[
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:min-h-9",
              revisingDay
                ? "bg-violet-600 text-white"
                : "bg-violet-100 text-violet-800 hover:bg-violet-200",
            ].join(" ")}
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
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed sm:min-h-9",
              localDay.locked
                ? "bg-brand-100 text-brand-800 hover:bg-brand-200"
                : "border border-line-strong bg-surface text-zinc-700 hover:bg-paper-2",
            ].join(" ")}
            title={localDay.locked ? "Unlock this day" : "Lock this day"}
            aria-pressed={localDay.locked}
          >
            <LockIcon locked={localDay.locked} />
            {localDay.locked ? "Unlock day" : "Lock day"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {lockError && (
          <p className="text-xs text-red-700" role="alert">
            {lockError}
          </p>
        )}

        {dayNotes.length > 0 && (
          <p className="rounded-lg bg-paper-2 px-3 py-2 text-xs text-zinc-700" role="status">
            {dayNotes.join(" ")}
          </p>
        )}

        {/* AI revise-day form */}
        {revisingDay && (
          <ReviseDayForm
            dayId={day.day_id}
            dayNumber={dayNumber}
            dayCount={dayCount}
            tripId={tripId}
            onRevised={(result) => {
              if (result.scope === "trip") {
                setRevisingDay(false);
                onTripReplanned(result.notice);
                return;
              }
              onDayActivitiesReplaced(day.day_id, result.activities);
              setDayNotes(result.notes ?? []);
              setRevisingDay(false);
            }}
            onCancel={() => setRevisingDay(false)}
          />
        )}

        {/* Activity list: also a drop zone (drop here = move to end of this day) */}
        <div
          className={[
            "flex flex-col rounded-xl transition-colors",
            isDragOver ? "bg-brand-50 ring-2 ring-brand-300" : "",
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
            activities.map((activity, index) => {
              const gap = gapBefore(index);
              return (
                <div key={activity.activity_id}>
                  {gap && (
                    <p className="relative ml-[4.6rem] pb-2 text-[11px] font-medium text-zinc-500">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[1.05rem] top-0 h-full w-px bg-line-strong"
                      />
                      {gap}
                    </p>
                  )}
                  <ActivityCard
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
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-zinc-600">
              Nothing planned for this day yet. Drag an activity here, or use
              Revise day to ask for ideas.
            </p>
          )}
        </div>
      </div>
    </section>
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
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Modal behaviour: move focus in, close on Escape, keep Tab inside the panel,
  // and hand focus back to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        "button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])"
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col rounded-l-2xl bg-surface shadow-lift"
        role="dialog"
        aria-modal="true"
        aria-label="Change log"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-xl font-semibold text-ink">
            Change history
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            className={ICON_BTN}
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
        <div className="flex-1 overflow-y-auto px-5 py-4">
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
                    <span className="block h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-brand-100" />
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

/**
 * One selectable highlight, drawn as a card. The native checkbox stays in the
 * DOM (visually hidden) so keyboard + screen-reader behaviour is unchanged;
 * the box, border and status tag are driven off its :checked state.
 *
 * Two independent signals, deliberately kept apart: the checkbox is the
 * traveller's intent, the status tag says what the plan contains right now.
 */
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

  let tag: { text: string; cls: string } | null = null;
  if (item.lockedIn && selected) {
    tag = { text: "Locked in your plan", cls: "bg-brand-100 text-brand-800" };
  } else if (item.covered && selected) {
    tag = { text: "In your plan", cls: "bg-green-100 text-green-800" };
  } else if (item.covered && !selected) {
    tag = { text: "Will be removed", cls: "bg-amber-100 text-amber-900" };
  } else if (!item.covered && selected) {
    tag = { text: "Will be added", cls: "bg-violet-100 text-violet-800" };
  }

  return (
    <li>
      <label
        className={[
          "group relative flex h-full gap-3 rounded-xl border p-3 transition-colors",
          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-surface",
          selected
            ? "border-brand-400 bg-brand-50/70"
            : "border-line bg-paper/60 hover:border-line-strong hover:bg-paper",
          disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer",
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
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={[
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
            selected
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-line-strong bg-surface text-transparent",
          ].join(" ")}
        >
          <CheckIcon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug text-ink">
            {item.name}
          </span>
          {item.why ? (
            <span className="mt-0.5 block text-[13px] leading-snug text-zinc-600">
              {item.why}
            </span>
          ) : null}
          {tag && (
            <span
              className={[
                "mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                tag.cls,
              ].join(" ")}
            >
              {tag.text}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}

function CoverageBar({ hit, total }: { hit: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((hit / total) * 100);
  return (
    <span
      className="block h-1.5 w-full overflow-hidden rounded-full bg-paper-2"
      role="presentation"
    >
      <span
        className="block h-full rounded-full bg-brand-500 transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/**
 * One collapsible "About {city}" card. Collapsed by default: the header
 * already tells you how much of the city's highlights the plan covers, and the
 * day-by-day plan stays the first thing on the page.
 *
 * Coverage is a fuzzy name match, so it must never be used as the checkbox's
 * source of truth — after a rebuild the model rewords activities and the match
 * drifts.
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
  const [open, setOpen] = useState(false);

  const spots = items.filter((i) => i.kind === "spot");
  const foods = items.filter((i) => i.kind === "food");
  const spotsHit = spots.filter((i) => i.covered).length;
  const foodsHit = foods.filter((i) => i.covered).length;
  const hit = spotsHit + foodsHit;
  const total = spots.length + foods.length;
  const bodyId = `guide-${normalizeText(guide.destination).replace(/ /g, "-")}`;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-paper/60 sm:p-5"
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700"
          aria-hidden="true"
        >
          <StrokeIcon className="h-5 w-5">
            <circle cx="12" cy="12" r="9" />
            <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
          </StrokeIcon>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-semibold leading-tight text-ink">
            About {guide.destination}
          </span>
          {total > 0 && (
            <span className="mt-1 block text-xs text-zinc-600">
              Your plan covers{" "}
              <strong className="font-semibold text-zinc-800">
                {hit} of {total}
              </strong>{" "}
              highlights
              <span className="hidden sm:inline">
                {" "}
                ({spotsHit}/{spots.length} spots, {foodsHit}/{foods.length} food)
              </span>
            </span>
          )}
          {total > 0 && (
            <span className="mt-2 block max-w-xs">
              <CoverageBar hit={hit} total={total} />
            </span>
          )}
        </span>
        <span className="mt-1 flex shrink-0 items-center gap-1 text-xs font-medium text-brand-700">
          <span className="hidden sm:inline">{open ? "Hide" : "Choose highlights"}</span>
          <ChevronIcon
            className={["h-5 w-5 transition-transform", open ? "rotate-180" : ""].join(" ")}
          />
        </span>
      </button>

      {open && (
        <div
          id={bodyId}
          className="flex flex-col gap-5 border-t border-line px-4 pb-5 pt-4 sm:px-5"
        >
          {guide.known_for && (
            <p className="max-w-prose text-sm leading-relaxed text-zinc-700">
              {guide.known_for}
            </p>
          )}

          {spots.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                Top spots <span className="font-normal normal-case tracking-normal">· your plan covers {spotsHit} of {spots.length}</span>
              </h4>
              <ul className="grid gap-2 sm:grid-cols-2">
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
            <div className="flex flex-col gap-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                Must-try food <span className="font-normal normal-case tracking-normal">· {foodsHit} on your plan</span>
              </h4>
              <ul className="grid gap-2 sm:grid-cols-2">
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
    </section>
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
      <div
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
        role="status"
      >
        <span className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-brand-100" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-medium text-zinc-700">
            Loading destination highlights&#8230;
          </p>
          <span className="mt-2 block h-1.5 w-40 animate-pulse rounded-full bg-paper-2" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (!guides || guides.length === 0 || items.length === 0) return null;

  const addCount = items.filter((i) => selected.has(i.key) && !i.covered).length;
  const dropCount = items.filter(
    (i) => !selected.has(i.key) && i.covered && !i.lockedIn
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold text-ink">Destination highlights</h2>
        <p className="mt-1 max-w-prose text-sm text-zinc-600">
          Tick what you want in the plan and untick what you don&#39;t, then
          rebuild — the itinerary is regenerated around your picks.
        </p>
      </div>

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
        <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-900 px-4 py-3 text-white shadow-lift sm:bottom-4">
          <div className="text-sm" role="status">
            {addCount > 0 && (
              <span>
                Adding <strong>{addCount}</strong>
              </span>
            )}
            {addCount > 0 && dropCount > 0 && <span>, </span>}
            {dropCount > 0 && (
              <span>
                {addCount > 0 ? "removing" : "Removing"} <strong>{dropCount}</strong>
              </span>
            )}
            {addCount === 0 && dropCount === 0 && <span>Rebuilding your plan&#8230;</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOverride(new Set(baseline))}
              disabled={rebuilding}
              className="min-h-11 rounded-xl px-4 text-sm font-medium text-brand-100 transition-colors hover:bg-white/10 disabled:opacity-50 sm:min-h-9"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleRebuild}
              disabled={rebuilding}
              className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-brand-900 transition-colors hover:bg-brand-50 disabled:opacity-60 sm:min-h-9"
            >
              {rebuilding ? "Rebuilding\u2026" : "Rebuild plan"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700" role="alert">
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
  onItineraryUpdated: onItineraryUpdatedProp,
  budget,
}: ItineraryViewProps) {
  const router = useRouter();

  // Every successful mutation funnels through here. The server already resynced
  // the stored day/trip totals; refreshing re-renders the server-rendered trip
  // header (Estimate / budget) so it can't drift from the list below. Debounced
  // so a burst of edits costs one refresh. Client state (localDays) survives a
  // refresh within the same itinerary version.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    []
  );
  const onItineraryUpdated = useCallback(() => {
    onItineraryUpdatedProp?.();
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 350);
  }, [onItineraryUpdatedProp, router]);

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
  const [notesOpen, setNotesOpen] = useState(false);

  // Day-jump strip: highlight the day currently in view (scroll-spy) and keep
  // its chip visible inside the horizontally scrolling strip.
  const [activeDay, setActiveDay] = useState(1);
  const stripRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);

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

  // On narrow screens the planner opens above the fold-line the button sits on,
  // so bring it into view. (On desktop it lives in the sticky side column.)
  useEffect(() => {
    if (!chatOpen) return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    asideRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [chatOpen]);

  // Scroll-spy for the day strip. Presentation only; it reads the DOM.
  const dayCount = localDays.length;
  useEffect(() => {
    if (revising || dayCount === 0) return;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("section[id^='day-']")
    );
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          const n = Number(visible.target.id.replace("day-", ""));
          if (!Number.isNaN(n)) setActiveDay(n);
        }
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: 0 }
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [dayCount, revising]);

  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>(`[data-day='${activeDay}']`);
    if (strip && chip) {
      strip.scrollTo({
        left: chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2,
        behavior: "smooth",
      });
    }
  }, [activeDay]);

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
  // Escape closes the export menu (the click-away overlay only handles the mouse).
  useEffect(() => {
    if (!exportOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExportOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [exportOpen]);
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

  // A day-level ask turned out to be a trip-wide logistics change: the server
  // re-planned every day and saved a NEW version. Show what happened, then
  // refresh so the new version (and the server-rendered header) replace this one.
  const [tripNotice, setTripNotice] = useState<string | null>(null);
  const handleTripReplanned = useCallback(
    (notice: string) => {
      setTripNotice(notice);
      onItineraryUpdated();
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [onItineraryUpdated, router]
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

  // Costs are always derived from the activities in view, so the list, the
  // budget card and the footer agree after any edit, delete, move or revise
  // (the stored daily_cost / total can lag a render behind).
  const dayCosts = localDays.map((d) => sumActivityCosts(d.activities));
  const totalCost = localDays.length > 0 ? sumDayCosts(localDays) : null;
  const budgetSummary = budget
    ? summarizeBudget({
        dailyBudgetUsd: budget.dailyBudgetUsd,
        party: budget.party,
        dayCount: localDays.length,
        planned: totalCost ?? 0,
      })
    : null;

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

  // ---- Derived, display-only summaries (recomputed as days change) ----
  const allActivities = localDays.flatMap((d) => d.activities ?? []);
  const typeCounts = ACTIVITY_TYPES.map((t) => ({
    type: t,
    count: allActivities.filter((a) => (a.activity_type ?? "other") === t).length,
  })).filter((x) => x.count > 0);
  const maxDayCost = Math.max(1, ...dayCosts);
  const userMessageCount = chatMessages.filter((m) => m.role === "user").length;

  const SUGGESTIONS = [
    "Make day 2 more relaxed",
    "Swap one dinner for a local taverna",
    "Add a rainy-day backup",
    "Fewer long transfers",
  ];

  const MENU_ITEM =
    "block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-800 hover:bg-paper-2 focus-visible:bg-paper-2 focus-visible:outline-none";

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-8">
        {/* ============ Side column: AI planner + trip summary ============ */}
        <aside
          ref={asideRef}
          aria-label="Trip tools and summary"
          className={[
            "order-first flex scroll-mt-32 flex-col gap-4 lg:order-none lg:col-start-2 lg:row-start-1",
            "lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto lg:pb-2",
            chatOpen || (subscribeOpen && calendarSubscribeUrl) ? "" : "max-lg:hidden",
          ].join(" ")}
        >
          {/* Conversational planner: discuss, then apply */}
          {chatOpen && (
            <section
              aria-label="Plan with AI"
              className="animate-rise flex flex-col gap-3 rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-surface p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white" aria-hidden="true">
                    <SparkleIcon />
                  </span>
                  <div>
                    <h2 className="font-display text-lg font-semibold leading-tight text-violet-950">
                      Plan with AI
                    </h2>
                    <p className="text-xs text-violet-800">Talk it through, then apply.</p>
                  </div>
                </div>
                <button
                  onClick={() => setChatOpen(false)}
                  className="-mr-1.5 -mt-1 inline-flex h-11 w-11 items-center justify-center rounded-lg text-violet-700 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  aria-label="Close planner"
                >
                  <StrokeIcon>
                    <path d="M6 6l12 12M18 6 6 18" />
                  </StrokeIcon>
                </button>
              </div>

              {/* Transcript / starter prompts */}
              {chatMessages.length === 0 ? (
                <div className="flex flex-col gap-2.5">
                  <p className="text-sm leading-snug text-violet-950/80">
                    Bounce ideas about your trip, e.g. &ldquo;add svíčková for a
                    dinner&rdquo; or &ldquo;what&apos;s a good rainy-day swap for
                    day 2?&rdquo;
                  </p>
                  <ul className="flex flex-wrap gap-2" aria-label="Suggested prompts">
                    {SUGGESTIONS.map((q) => (
                      <li key={q}>
                        <button
                          type="button"
                          onClick={() => {
                            setChatInput(q);
                            chatInputRef.current?.focus();
                          }}
                          className="min-h-11 rounded-full border border-violet-200 bg-white px-3.5 text-left text-xs font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:min-h-9"
                        >
                          {q}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div
                  ref={chatScrollRef}
                  className="flex max-h-80 flex-col gap-2.5 overflow-y-auto rounded-xl bg-white/80 p-2.5 ring-1 ring-violet-100"
                  aria-live="polite"
                >
                  {chatMessages.map((m, i) => (
                    <div
                      key={i}
                      className={[
                        "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-snug",
                        m.role === "user"
                          ? "self-end rounded-br-md bg-violet-600 text-white"
                          : "self-start rounded-bl-md bg-paper-2 text-zinc-800",
                      ].join(" ")}
                    >
                      {m.content}
                    </div>
                  ))}
                  {chatSending && (
                    <div className="self-start rounded-2xl rounded-bl-md bg-paper-2 px-3.5 py-3 text-sm text-zinc-500">
                      <span className="inline-flex gap-1" role="status" aria-label="Planner is typing">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:240ms]" />
                      </span>
                    </div>
                  )}
                </div>
              )}

              {chatError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
                  {chatError}
                </p>
              )}

              {/* Composer */}
              <div className="flex items-end gap-2 rounded-2xl border border-violet-200 bg-white p-1.5 focus-within:ring-2 focus-within:ring-violet-500">
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
                  aria-label="Message the planner"
                  className="min-h-11 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2.5 py-2.5 text-base leading-relaxed text-zinc-900 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60 sm:text-sm"
                  placeholder="Ask or suggest…"
                />
                <button
                  type="button"
                  onClick={handleSendChat}
                  disabled={chatSending || !chatInput.trim()}
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-violet-100 px-3.5 text-sm font-semibold text-violet-900 transition-colors hover:bg-violet-200 disabled:cursor-not-allowed disabled:bg-paper-2 disabled:text-zinc-500"
                >
                  Send
                  <SendIcon className="h-4 w-4" />
                </button>
              </div>
              <p className="-mt-1 text-[11px] text-violet-900/70">
                Enter to send, Shift+Enter for a new line.
              </p>

              {/* Apply / discard: nothing changes until you apply */}
              <div className="rounded-xl bg-violet-100/60 p-3">
                <p className="text-xs leading-snug text-violet-950/80">
                  Chatting doesn&apos;t change your plan. Locked activities are
                  kept; Apply creates a new version.
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Button
                    variant="ai"
                    size="sm"
                    onClick={handleApplyChat}
                    disabled={chatSending || userMessageCount === 0}
                  >
                    Apply changes
                    {userMessageCount > 0 && (
                      <span className="rounded-full bg-white/25 px-1.5 text-xs">
                        {userMessageCount}
                      </span>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setChatMessages([]);
                      setChatInput("");
                      setChatError(null);
                    }}
                    disabled={chatSending || (userMessageCount === 0 && !chatInput)}
                  >
                    Discard chat
                  </Button>
                </div>
              </div>
            </section>
          )}

          {/* Subscribe-by-URL panel */}
          {subscribeOpen && calendarSubscribeUrl && (
            <section
              aria-label="Calendar subscription"
              className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-card"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-ink">
                  Subscribe in your calendar
                </h2>
                <button
                  onClick={() => setSubscribeOpen(false)}
                  className={ICON_BTN}
                  aria-label="Close subscribe panel"
                >
                  <StrokeIcon>
                    <path d="M6 6l12 12M18 6 6 18" />
                  </StrokeIcon>
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={calendarSubscribeUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Calendar feed URL"
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-paper px-3 text-xs text-zinc-700 sm:min-h-9"
                />
                <Button variant="secondary" size="sm" onClick={handleCopySubscribe}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs leading-snug text-zinc-600">
                In Google Calendar (web): <span className="font-medium">Other calendars → + → From URL</span>, paste this link. It auto-syncs when you change the trip. Anyone with the link can view this itinerary.
              </p>
            </section>
          )}

          {/* Trip summary (desktop only; mobile gets the cover stats + day strip) */}
          {localDays.length > 0 && (
            <div className="hidden flex-col gap-4 lg:flex">
              <section aria-label="Trip mix" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                <h2 className="font-display text-base font-semibold text-ink">Trip mix</h2>
                <p className="text-xs text-zinc-600">{allActivities.length} activities by type</p>
                <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-paper-2" role="img" aria-label={typeCounts.map((x) => `${TYPE_META[x.type].label} ${x.count}`).join(", ")}>
                  {typeCounts.map((x) => (
                    <span
                      key={x.type}
                      className={TYPE_META[x.type].bar}
                      style={{ width: `${(x.count / Math.max(allActivities.length, 1)) * 100}%` }}
                    />
                  ))}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {typeCounts.map((x) => (
                    <li key={x.type} className="flex items-center gap-1.5 text-xs text-zinc-700">
                      <span className={["h-2 w-2 shrink-0 rounded-full", TYPE_META[x.type].dot].join(" ")} aria-hidden="true" />
                      <span className="truncate">{TYPE_META[x.type].label}</span>
                      <span className="ml-auto font-semibold tabular-nums text-zinc-900">{x.count}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {totalCost != null && (
                <section aria-label="Budget by day" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-display text-base font-semibold text-ink">Budget by day</h2>
                    {totalCost != null && (
                      <span className="text-sm font-semibold tabular-nums text-ink">{formatCost(totalCost)}</span>
                    )}
                  </div>
                  <ol className="mt-3 flex flex-col gap-1.5">
                    {localDays.map((d, i) => (
                      <li key={d.day_id}>
                        <a
                          href={`#day-${i + 1}`}
                          className="group flex items-center gap-2.5 rounded-lg px-1 py-1 text-xs hover:bg-paper-2"
                        >
                          <span className="w-9 shrink-0 font-semibold text-zinc-700">Day {i + 1}</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper-2 group-hover:bg-white">
                            <span
                              className="block h-full rounded-full bg-brand-500"
                              style={{ width: `${(dayCosts[i] / maxDayCost) * 100}%` }}
                            />
                          </span>
                          <span className="w-12 shrink-0 text-right tabular-nums text-zinc-800">
                            {formatCost(dayCosts[i])}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ol>
                  {budgetSummary && <BudgetLine summary={budgetSummary} />}
                </section>
              )}
            </div>
          )}
        </aside>

        {/* ============ Main column ============ */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {/* ---- Overview + actions ---- */}
          <section aria-labelledby="itinerary-title" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex items-center gap-2.5">
                <h2 id="itinerary-title" className="text-2xl font-bold text-ink">
                  Your itinerary
                </h2>
                <StatusBadge status={itinerary.status} />
                <span className="text-xs text-zinc-500">v{itinerary.version}</span>
              </div>

              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                <Button
                  variant="ai"
                  size="sm"
                  className="col-span-2 sm:col-span-1"
                  onClick={() => {
                    setChatError(null);
                    setChatOpen((v) => !v);
                  }}
                  aria-expanded={chatOpen}
                  aria-label="Plan with AI"
                >
                  <SparkleIcon />
                  Plan with AI
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setChangelogOpen(true)}
                  aria-label="View changes"
                >
                  View changes
                </Button>
                <div className="relative">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => setExportOpen((v) => !v)}
                    aria-expanded={exportOpen}
                    aria-label="Export itinerary"
                  >
                    Export
                    <ChevronIcon className="h-4 w-4" />
                  </Button>
                  {exportOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        aria-hidden="true"
                        onClick={() => setExportOpen(false)}
                      />
                      <div className="absolute right-0 z-40 mt-1.5 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-lift">
                        <button onClick={handleExportPDF} className={MENU_ITEM}>
                          Save as PDF
                        </button>
                        <button onClick={handleExportICS} className={MENU_ITEM}>
                          Add to calendar (.ics)
                        </button>
                        {calendarSubscribeUrl && (
                          <button
                            onClick={() => {
                              setExportOpen(false);
                              setSubscribeOpen(true);
                            }}
                            className={MENU_ITEM}
                          >
                            Subscribe (auto-sync)…
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {itinerary.notes && (
              <div className="mt-4 border-t border-line pt-4">
                <p
                  className={[
                    "max-w-prose text-[15px] leading-relaxed text-zinc-700",
                    notesOpen ? "" : "line-clamp-3",
                  ].join(" ")}
                >
                  {itinerary.notes}
                </p>
                {itinerary.notes.length > 200 && (
                  <button
                    type="button"
                    onClick={() => setNotesOpen((v) => !v)}
                    aria-expanded={notesOpen}
                    className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:text-brand-900 sm:min-h-8"
                  >
                    {notesOpen ? "Show less" : "Read the full overview"}
                  </button>
                )}
              </div>
            )}
          </section>

          {tripNotice && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-snug text-violet-950"
            >
              <p className="flex-1">{tripNotice}</p>
              <button
                type="button"
                onClick={() => setTripNotice(null)}
                className="-mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-violet-700 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                aria-label="Dismiss message"
              >
                <StrokeIcon>
                  <path d="M6 6l12 12M18 6 6 18" />
                </StrokeIcon>
              </button>
            </div>
          )}

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

          {/* ---- Day-by-day ---- */}
          {localDays.length > 0 ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold text-ink">Day by day</h2>

              {/* Sticky day-jump strip */}
              <nav
                aria-label="Jump to day"
                className="sticky top-14 z-20 -mx-4 border-b border-line bg-paper/95 px-4 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-2"
              >
                <div
                  ref={stripRef}
                  className="no-scrollbar flex gap-1.5 overflow-x-auto py-2"
                >
                  {localDays.map((d, i) => {
                    const dt = new Date(d.date);
                    const on = activeDay === i + 1;
                    return (
                      <a
                        key={d.day_id}
                        href={`#day-${i + 1}`}
                        data-day={i + 1}
                        aria-current={on ? "true" : undefined}
                        className={[
                          "flex min-h-11 shrink-0 flex-col items-center justify-center rounded-xl px-3.5 text-center leading-tight transition-colors",
                          on
                            ? "bg-brand-700 text-white"
                            : "text-zinc-700 hover:bg-paper-2",
                        ].join(" ")}
                      >
                        <span className="text-xs font-bold">Day {i + 1}</span>
                        <span className={["text-[11px]", on ? "text-brand-100" : "text-zinc-600"].join(" ")}>
                          {dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </nav>

              <div className="flex flex-col gap-5">
                {localDays.map((day, index) => (
                  <div key={day.day_id} className="flex flex-col gap-3">
                    {cityHeaderAt.has(index) && (
                      <div className="flex items-baseline gap-3 pt-2">
                        <span className="font-display text-xl font-bold text-ink">
                          {cityHeaderAt.get(index)!.city.split(",")[0]}
                        </span>
                        <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                          {cityHeaderAt.get(index)!.from === cityHeaderAt.get(index)!.to
                            ? `Day ${cityHeaderAt.get(index)!.from}`
                            : `Days ${cityHeaderAt.get(index)!.from}–${cityHeaderAt.get(index)!.to}`}
                        </span>
                        <span className="h-px flex-1 bg-line-strong" aria-hidden="true" />
                      </div>
                    )}
                    <DaySection
                      day={day}
                      dayNumber={index + 1}
                      tripId={tripId}
                      onDayUpdated={handleDayUpdated}
                      onActivityUpdated={handleActivityUpdated}
                      onDayActivitiesReplaced={handleDayActivitiesReplaced}
                      dayCount={localDays.length}
                      onTripReplanned={handleTripReplanned}
                      onReorderActivity={handleReorderActivity}
                      onActivityDrop={handleActivityDrop}
                      onActivityDeleted={handleActivityDeleted}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-4 py-12 text-center">
              <p className="font-display text-lg font-semibold text-ink">
                No days in this itinerary yet
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Open Plan with AI to describe what you want, then apply it.
              </p>
            </div>
          )}

          {/* ---- Cost summary footer ---- */}
          {totalCost != null && localDays.length > 0 && (
            <div className="rounded-2xl border border-line bg-paper-2/70 px-5 py-4">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-zinc-700">Trip total estimate</span>
                <span className="font-display text-2xl font-bold tabular-nums text-ink">
                  {formatCost(totalCost)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-zinc-600">
                <span>Daily average</span>
                <span className="tabular-nums">{formatCost(totalCost / localDays.length)}</span>
              </div>
              {budgetSummary && <BudgetLine summary={budgetSummary} className="mt-3 border-t border-line pt-3" />}
            </div>
          )}
        </div>
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
