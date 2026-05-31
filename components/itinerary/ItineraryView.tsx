/**
 * ItineraryView — renders a confirmed or proposed itinerary.
 *
 * PROP CONTRACT (final — Wave B implements the internals):
 *
 *   tripId: string
 *     UUID of the parent trip. Used to scope API calls for activity edits,
 *     lock toggles, and change-log writes.
 *
 *   itinerary: Itinerary
 *     The current itinerary record (with days and activities pre-fetched and
 *     attached as itinerary.days[].activities[]). Pass the full hydrated object
 *     so ItineraryView can render without additional data fetches.
 *
 *   onItineraryUpdated?: () => void
 *     Optional callback fired after a successful in-place edit, lock toggle,
 *     or re-plan so the parent page can refresh its server data.
 *
 * TODO(M1-WaveB): Implement the full itinerary display:
 *   - Day-by-day accordion or list (ItineraryDay → Activity list)
 *   - Activity cards with name, description, time, cost, type badge
 *   - Lock/unlock toggle on days and individual activities
 *   - Inline activity edit (name, description, cost) → PATCH /api/trips/[id]/activities/[activityId]
 *   - "Re-plan" button → POST /api/trips/[id]/itinerary/replan
 *   - Change-log drawer (read-only) → GET /api/trips/[id]/changelog
 *   - Status badge (draft / proposed / confirmed) with confirm action
 *   - Empty-day placeholder
 *   - Estimated total cost summary in footer
 *
 * DO NOT implement the API routes here — those belong to Wave B agents:
 *   - itinerary-generation agent: POST /api/trips/[id]/itinerary
 *   - activity-edit agent:        PATCH /api/trips/[id]/activities/[activityId]
 *   - change-log agent:           GET/POST /api/trips/[id]/changelog
 */

import { Card } from "@/components/ui/Card";
import type { Itinerary } from "@/lib/types";

export interface ItineraryViewProps {
  /** UUID of the parent trip */
  tripId: string;
  /** Hydrated itinerary with days and activities attached */
  itinerary: Itinerary;
  /** Fired after a successful in-place mutation so the parent page can revalidate */
  onItineraryUpdated?: () => void;
}

export function ItineraryView({
  tripId: _tripId,
  itinerary,
}: ItineraryViewProps) {
  const dayCount = itinerary.days?.length ?? 0;

  return (
    <Card>
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 6.75h7.5M8.25 9.75h7.5M8.25 12.75H12m-8.25 6a9 9 0 1 1 18 0 9 9 0 0 1-18 0Zm9-13.5V3"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-900">
          Itinerary — v{itinerary.version}
        </p>
        <p className="mt-1 max-w-xs text-xs text-zinc-500">
          {dayCount > 0
            ? `${dayCount} day${dayCount !== 1 ? "s" : ""} planned`
            : "No days yet"}
          {itinerary.total_cost_estimate != null
            ? ` · $${itinerary.total_cost_estimate.toLocaleString()} est.`
            : ""}
        </p>
        <p className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-700">
          Full view coming in Wave B
        </p>
      </div>
    </Card>
  );
}
