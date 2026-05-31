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

import { useState, useCallback, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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

// ---------------------------------------------------------------------------
// Prop contract — FINAL (unchanged)
// ---------------------------------------------------------------------------

export interface ItineraryViewProps {
  /** UUID of the parent trip */
  tripId: string;
  /** Hydrated itinerary with days and activities attached */
  itinerary: Itinerary;
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={[
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-600",
      ].join(" ")}
    >
      {status}
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
            label="Cost (USD)"
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            disabled={saving}
            placeholder="e.g. 25"
          />
          <Input
            label="Time (hours)"
            type="number"
            min="0"
            step="0.25"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={saving}
            placeholder="e.g. 1.5"
          />
        </div>
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
}

function ActivityCard({ activity, tripId, onActivityUpdated }: ActivityCardProps) {
  const [editing, setEditing] = useState(false);
  const [localActivity, setLocalActivity] = useState<Activity>(activity);
  const [lockPending, setLockPending] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  async function handleToggleLock() {
    setLockPending(true);
    setLockError(null);
    const newLocked = !localActivity.locked;

    try {
      const body: PatchActivityRequestBody = { locked: newLocked };
      const res = await fetch(
        `/api/trips/${tripId}/activities/${localActivity.activity_id}`,
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
      setLocalActivity(responseBody.activity);
      onActivityUpdated(responseBody.activity);
    } catch {
      setLockError("Network error. Please try again.");
    } finally {
      setLockPending(false);
    }
  }

  function handleSaved(updated: Activity) {
    setLocalActivity(updated);
    setEditing(false);
    onActivityUpdated(updated);
  }

  const act = localActivity;

  return (
    <div
      className={[
        "flex flex-col gap-1.5 rounded-lg border bg-zinc-50 p-3",
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
      ) : (
        <>
          {/* Header row: name + type badge + action buttons */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug text-zinc-900">
              {act.name}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <ActivityTypeBadge type={act.activity_type} />

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
            </div>
          </div>

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
// Day section (with lock toggle)
// ---------------------------------------------------------------------------

interface DaySectionProps {
  day: ItineraryDay & { activities?: Activity[] };
  dayNumber: number;
  tripId: string;
  onDayUpdated: (updated: ItineraryDay) => void;
  onActivityUpdated: (updated: Activity) => void;
}

function DaySection({
  day,
  dayNumber,
  tripId,
  onDayUpdated,
  onActivityUpdated,
}: DaySectionProps) {
  const [localDay, setLocalDay] = useState<ItineraryDay>(day);
  const [lockPending, setLockPending] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

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

      {/* Activity list */}
      {activities.length > 0 ? (
        <div className="flex flex-col gap-2 pl-8">
          {activities.map((activity) => (
            <ActivityCard
              key={activity.activity_id}
              activity={activity}
              tripId={tripId}
              onActivityUpdated={onActivityUpdated}
            />
          ))}
        </div>
      ) : (
        <p className="pl-8 text-xs italic text-zinc-400">
          No activities planned for this day.
        </p>
      )}
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
  onItineraryUpdated,
}: ItineraryViewProps) {
  // Local copy of days so mutations reflect immediately without a full page refresh
  const [localDays, setLocalDays] = useState<
    (ItineraryDay & { activities?: Activity[] })[]
  >(itinerary.days ?? []);

  const [changelogOpen, setChangelogOpen] = useState(false);

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

  const handleActivityUpdated = useCallback(
    (updated: Activity) => {
      setLocalDays((prev) =>
        prev.map((d) => ({
          ...d,
          activities: d.activities?.map((a) =>
            a.activity_id === updated.activity_id ? updated : a
          ),
        }))
      );
      onItineraryUpdated?.();
    },
    [onItineraryUpdated]
  );

  // Compute total from day costs if total_cost_estimate is missing
  const totalCost =
    itinerary.total_cost_estimate ??
    (localDays.length > 0
      ? localDays.reduce((sum, d) => sum + (d.daily_cost ?? 0), 0)
      : null);

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
                onClick={() => setChangelogOpen(true)}
                aria-label="View change history"
              >
                View changes
              </Button>
              <StatusBadge status={itinerary.status} />
              <span className="text-xs text-zinc-400">
                v{itinerary.version}
              </span>
            </div>
          </CardHeader>

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
