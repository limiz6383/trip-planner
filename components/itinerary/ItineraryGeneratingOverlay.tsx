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
 *
 * The animation is deliberately indeterminate (a dotted route being drawn,
 * skeleton day cards behind it): we don't know real progress, so we don't
 * pretend to. Motion is disabled for reduced-motion users via globals.css.
 */

export function ItineraryGeneratingOverlay() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-b from-brand-50 to-surface px-6 py-10 text-center shadow-card"
      role="status"
      aria-live="polite"
    >
      <svg viewBox="0 0 240 90" className="mx-auto h-24 w-60" aria-hidden="true">
        <path
          id="route"
          d="M14 66C48 18 78 78 118 44S190 8 226 30"
          fill="none"
          stroke="var(--color-brand-300)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="2 9"
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-44" dur="1.6s" repeatCount="indefinite" />
        </path>
        <circle cx="14" cy="66" r="6" fill="var(--color-brand-700)" />
        <circle cx="226" cy="30" r="8" fill="var(--color-sun-500)" />
        <circle cx="226" cy="30" r="3" fill="#fff" />
        <circle r="5" fill="var(--color-brand-700)">
          <animateMotion dur="3.2s" repeatCount="indefinite" path="M14 66C48 18 78 78 118 44S190 8 226 30" />
        </circle>
      </svg>

      {/* Primary copy */}
      <p className="mt-2 font-display text-xl font-semibold text-brand-900">
        Generating your itinerary&hellip;
      </p>

      {/* Reassurance copy */}
      <p className="mx-auto mt-1 max-w-xs text-sm text-brand-800">
        This usually takes 30&ndash;60 seconds. Hang tight while we plan your
        trip.
      </p>

      {/* Skeleton preview of what's coming */}
      <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex animate-pulse items-center gap-3 rounded-xl border border-line bg-surface p-3"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <span className="h-9 w-9 rounded-lg bg-brand-100" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="h-2.5 w-2/3 rounded-full bg-paper-2" />
              <span className="h-2 w-1/2 rounded-full bg-paper-2" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
