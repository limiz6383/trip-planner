"use client";

/**
 * ItineraryGeneratingOverlay
 *
 * Prominent, centered loading panel shown while POST /api/trips/[id]/itinerary
 * is in flight. Replaces interactive elements so the user cannot trigger a
 * second request while one is already running.
 *
 * Used by both GenerateItineraryButton (first-time generation) and
 * PostItineraryBookingPanel (regeneration after booking update).
 */

export function ItineraryGeneratingOverlay() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-xl border border-indigo-200 bg-indigo-50 px-6 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      {/* Spinner */}
      <span
        className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
        aria-hidden="true"
      />

      {/* Primary copy */}
      <p className="text-base font-semibold text-indigo-900">
        Generating your itinerary&hellip;
      </p>

      {/* Reassurance copy */}
      <p className="max-w-xs text-sm text-indigo-700">
        This usually takes 30&ndash;60 seconds. Hang tight while we plan your
        trip.
      </p>
    </div>
  );
}
