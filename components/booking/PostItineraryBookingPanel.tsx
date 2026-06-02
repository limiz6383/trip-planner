"use client";

/**
 * PostItineraryBookingPanel
 *
 * Collapsible "Flights & accommodation" section rendered in State 3 of the
 * trip detail page (itinerary already exists). Lets the user view and edit
 * their booking at any time after generation.
 *
 * Two actions are available after saving:
 *   1. "Save bookings" — persists the booking without regenerating.
 *      The itinerary stays as-is.
 *   2. "Regenerate itinerary with these bookings" — saves booking first (if
 *      unsaved) then calls POST /api/trips/[id]/itinerary, which reads the
 *      current booking and generates a new itinerary version.
 *
 * Shows the same ItineraryGeneratingOverlay used elsewhere so the prominent
 * loading state is consistent during the 10-20s generation window.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookingForm } from "@/components/booking/BookingForm";
import { ItineraryGeneratingOverlay } from "@/components/itinerary/ItineraryGeneratingOverlay";
import { Button } from "@/components/ui/Button";
import type { Booking } from "@/lib/types";
import type {
  GenerateItineraryResponseBody,
  GenerateItineraryErrorBody,
} from "@/app/api/trips/[id]/itinerary/route";

export interface PostItineraryBookingPanelProps {
  tripId: string;
  initialBooking: Booking | null;
}

export function PostItineraryBookingPanel({
  tripId,
  initialBooking,
}: PostItineraryBookingPanelProps) {
  const router = useRouter();

  // Collapse state — start collapsed so the itinerary view is the focus
  const [open, setOpen] = useState(false);

  // Post-save state — after a successful "Save bookings" we offer regeneration
  const [savedSinceLastGenerate, setSavedSinceLastGenerate] = useState(false);

  // Regeneration state
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  // Save-confirmation message
  const [saveConfirmed, setSaveConfirmed] = useState(false);

  function handleSaveOnly() {
    setSavedSinceLastGenerate(true);
    setSaveConfirmed(true);
    setRegenerateError(null);
    // Hide the save confirmation after 4 seconds
    setTimeout(() => setSaveConfirmed(false), 4000);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setRegenerateError(null);
    setSaveConfirmed(false);

    try {
      const res = await fetch(`/api/trips/${tripId}/itinerary`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = (await res.json()) as GenerateItineraryErrorBody;
        setRegenerateError(
          body.error ?? "Regeneration failed. Please try again."
        );
        return;
      }

      // Cast to verify shape; result unused — router.refresh() re-renders
      // the server component with the new itinerary version.
      const _body = (await res.json()) as GenerateItineraryResponseBody;
      router.refresh();
    } catch {
      setRegenerateError(
        "Network error. Please check your connection and try again."
      );
    } finally {
      setRegenerating(false);
    }
  }

  // While regeneration is in flight, replace the entire panel with the
  // prominent loading overlay so the user gets clear progress feedback.
  if (regenerating) {
    return (
      <section aria-label="Flights & accommodation" className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-zinc-800">
          Flights &amp; accommodation
        </h2>
        <ItineraryGeneratingOverlay />
      </section>
    );
  }

  return (
    <section aria-label="Flights & accommodation" className="flex flex-col gap-2">
      {/* ---- Section header / toggle ---- */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex w-full items-center justify-between rounded-xl border px-4 py-3",
          "text-left text-sm font-semibold transition-colors",
          open
            ? "border-indigo-200 bg-indigo-50 text-indigo-900"
            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
        ].join(" ")}
        aria-expanded={open}
      >
        <span>Flights &amp; accommodation</span>
        <span
          className={[
            "ml-2 shrink-0 text-zinc-400 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        >
          {/* Chevron down */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* ---- Collapsible body ---- */}
      {open && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 flex flex-col gap-5">
          <p className="text-sm text-zinc-500">
            Edit your flights and accommodation below. Changes are saved
            independently from your itinerary — you can also regenerate the
            itinerary to reflect any updates.
          </p>

          <BookingForm
            tripId={tripId}
            initialBooking={initialBooking}
            onSaveOnly={handleSaveOnly}
          />

          {/* ---- Save confirmation + regenerate prompt ---- */}
          {saveConfirmed && (
            <div
              className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
              role="status"
              aria-live="polite"
            >
              Booking saved.
            </div>
          )}

          {savedSinceLastGenerate && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-sm font-medium text-amber-900">
                Your booking has been updated. Regenerate the itinerary to
                plan around your new flights and accommodation.
              </p>
              <Button
                variant="primary"
                size="md"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="w-full sm:w-auto"
              >
                Regenerate itinerary with these bookings
              </Button>

              {regenerateError && (
                <p className="text-sm text-red-600" role="alert">
                  {regenerateError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
