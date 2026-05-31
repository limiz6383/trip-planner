/**
 * ItineraryView — renders a confirmed or proposed itinerary.
 *
 * PROP CONTRACT (final):
 *
 *   tripId: string
 *     UUID of the parent trip. Passed through to child components; will be
 *     used by the activity-edit agent (Wave B) to scope PATCH/re-plan calls.
 *
 *   itinerary: Itinerary
 *     The current itinerary record with days and activities pre-fetched and
 *     attached as itinerary.days[].activities[].
 *
 *   onItineraryUpdated?: () => void
 *     Callback fired after a successful in-place mutation. Reserved for Wave B.
 *
 * READ-ONLY for M1. Edit controls, lock toggles, re-plan, and change-log
 * drawer are Wave B concerns — see TODO comments for mount points.
 */

import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { Itinerary, ItineraryDay, Activity, ActivityType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Prop contract — FINAL
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
// Activity type badge
// ---------------------------------------------------------------------------

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
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatTime(hours: number | null | undefined): string {
  if (hours == null) return "";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Activity card
// ---------------------------------------------------------------------------

function ActivityCard({ activity }: { activity: Activity }) {
  return (
    /*
     * TODO (Wave B — activity-edit agent): wrap this div in an editable form.
     * Mount the inline edit trigger (pencil icon button) in the top-right corner
     * of this card. The activity_id for PATCH /api/trips/[id]/activities/[activityId]
     * is `activity.activity_id`. Lock toggle button also mounts here.
     */
    <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-100 bg-zinc-50 p-3">
      {/* Header row: name + type badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900 leading-snug">
          {activity.name}
        </p>
        <ActivityTypeBadge type={activity.activity_type} />
      </div>

      {/* Place name */}
      {activity.place_name && (
        <p className="text-xs text-zinc-500">{activity.place_name}</p>
      )}

      {/* Description */}
      {activity.description && (
        <p className="text-xs text-zinc-600 leading-relaxed">
          {activity.description}
        </p>
      )}

      {/* Meta row: time + cost */}
      {(activity.estimated_time_hours != null ||
        activity.estimated_cost_usd != null) && (
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {activity.estimated_time_hours != null && (
            <span>{formatTime(activity.estimated_time_hours)}</span>
          )}
          {activity.estimated_cost_usd != null && (
            <span className="font-medium text-zinc-700">
              {formatCost(activity.estimated_cost_usd)}
            </span>
          )}
        </div>
      )}

      {/* Source attribution */}
      {activity.source_attribution && (
        <p className="text-xs text-zinc-400 italic">
          via {activity.source_attribution}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day section
// ---------------------------------------------------------------------------

function DaySection({
  day,
  dayNumber,
}: {
  day: ItineraryDay & { activities?: Activity[] };
  dayNumber: number;
}) {
  const activities = day.activities ?? [];

  return (
    /*
     * TODO (Wave B — activity-edit agent): add the day-level lock toggle button
     * in the header row (next to the date/cost line). The day_id for that toggle
     * is `day.day_id` and the trip-scoped API will be
     * PATCH /api/trips/[id]/days/[dayId].
     */
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
        </div>
        {day.daily_cost != null && (
          <span className="text-xs font-medium text-zinc-500">
            {formatCost(day.daily_cost)} / day
          </span>
        )}
      </div>

      {/* Activity list */}
      {activities.length > 0 ? (
        <div className="flex flex-col gap-2 pl-8">
          {activities.map((activity) => (
            <ActivityCard key={activity.activity_id} activity={activity} />
          ))}
        </div>
      ) : (
        <p className="pl-8 text-xs text-zinc-400 italic">No activities planned for this day.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ItineraryView({
  tripId: _tripId,
  itinerary,
  onItineraryUpdated: _onItineraryUpdated,
}: ItineraryViewProps) {
  const days = itinerary.days ?? [];

  // Compute total from day costs if total_cost_estimate is missing
  const totalCost =
    itinerary.total_cost_estimate ??
    (days.length > 0
      ? days.reduce((sum, d) => sum + (d.daily_cost ?? 0), 0)
      : null);

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Itinerary header card ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Your Itinerary</CardTitle>
          {/*
           * TODO (Wave B — change-log agent): add "View changes" button here that
           * opens the change-log drawer. Trigger: GET /api/trips/[id]/changelog.
           */}
          <div className="flex items-center gap-2">
            <StatusBadge status={itinerary.status} />
            <span className="text-xs text-zinc-400">v{itinerary.version}</span>
          </div>
        </CardHeader>

        {itinerary.notes && (
          <p className="mb-3 text-sm text-zinc-600">{itinerary.notes}</p>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-zinc-600">
          <span>
            <span className="font-medium text-zinc-900">{days.length}</span>{" "}
            {days.length === 1 ? "day" : "days"}
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
      {days.length > 0 ? (
        <Card>
          <div className="flex flex-col gap-6 divide-y divide-zinc-100">
            {days.map((day, index) => (
              <div
                key={day.day_id}
                className={index === 0 ? "" : "pt-6"}
              >
                <DaySection day={day} dayNumber={index + 1} />
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
      {totalCost != null && days.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-600">Trip total estimate</span>
            <span className="font-semibold text-zinc-900">
              {formatCost(totalCost)}
            </span>
          </div>
          {days.length > 0 && totalCost != null && (
            <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
              <span>Daily average</span>
              <span>{formatCost(totalCost / days.length)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
