/**
 * ConsultingSession — AI consulting conversation component.
 *
 * PROP CONTRACT (final — Wave B implements the internals):
 *
 *   tripId: string
 *     The UUID of the trip being planned. Used to POST to /api/trips/[id]/consult
 *     and to save the resulting TripBrief to trip_briefs.
 *
 *   onBriefComplete?: () => void
 *     Optional callback fired when the consulting session produces a completed
 *     TripBrief. The trip detail page uses this to conditionally render
 *     ItineraryView once a brief exists.
 *
 * TODO(M1-WaveB): Implement the full conversational UI:
 *   - Chat bubble list (history of ConversationMessages)
 *   - Text input + send button
 *   - Call POST /api/trips/[id]/consult with { userMessage, history, partialBrief }
 *   - Display the assistant's response (stream via ReadableStream)
 *   - When briefComplete === true: persist the brief, call onBriefComplete()
 *   - Loading / typing indicator while awaiting LLM response
 *   - Error state with retry option
 *
 * DO NOT implement the /api/trips/[id]/consult route here — that belongs to
 * the Wave B consulting-api agent.
 */

import { Card } from "@/components/ui/Card";

export interface ConsultingSessionProps {
  /** UUID of the trip being planned */
  tripId: string;
  /** Called when the consulting session produces a completed TripBrief */
  onBriefComplete?: () => void;
}

export function ConsultingSession({ tripId: _tripId }: ConsultingSessionProps) {
  return (
    <Card>
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
          <svg
            className="h-6 w-6 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-900">
          AI Trip Consulting
        </p>
        <p className="mt-1 max-w-xs text-xs text-zinc-500">
          Chat with our AI to build your trip brief — dates, budget, vibe, and more.
        </p>
        <p className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-700">
          Coming in Wave B
        </p>
      </div>
    </Card>
  );
}
