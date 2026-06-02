"use client";

/**
 * BookingStep
 *
 * Client wrapper rendered in State 2 of the trip page (brief done, no itinerary).
 *
 * Renders BookingForm and wires both actions:
 *   - "Save & generate itinerary"  → saves booking via BookingForm, then calls
 *                                    POST /api/trips/[id]/itinerary, then router.refresh()
 *   - "Skip — generate without bookings" → calls POST /api/trips/[id]/itinerary
 *                                          directly, then router.refresh()
 *
 * Keeps generation logic here (not in BookingForm) so BookingForm stays
 * responsible only for booking CRUD.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookingForm } from "@/components/booking/BookingForm";
import type { Booking } from "@/lib/types";
import type {
  GenerateItineraryResponseBody,
  GenerateItineraryErrorBody,
} from "@/app/api/trips/[id]/itinerary/route";

export interface BookingStepProps {
  tripId: string;
  initialBooking?: Booking | null;
}

export function BookingStep({ tripId, initialBooking }: BookingStepProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function triggerGeneration() {
    setGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch(`/api/trips/${tripId}/itinerary`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = (await res.json()) as GenerateItineraryErrorBody;
        setGenerateError(
          body.error ?? "Itinerary generation failed. Please try again."
        );
        return;
      }

      // Verify shape; result unused — router.refresh() re-renders the server page
      const _body = (await res.json()) as GenerateItineraryResponseBody;
      router.refresh();
    } catch {
      setGenerateError("Network error. Please check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  }

  // Shown while generation is running (covers both the "save+generate" and
  // "skip" paths). BookingForm is replaced so the user can't submit twice.
  if (generating) {
    return (
      <div className="flex items-center gap-3 py-4">
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600"
          aria-hidden="true"
        />
        <span className="text-sm text-indigo-700">Generating your itinerary…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BookingForm
        tripId={tripId}
        initialBooking={initialBooking}
        onSaveAndGenerate={triggerGeneration}
        onSkip={triggerGeneration}
      />

      {generateError && (
        <p className="text-sm text-red-600" role="alert">
          {generateError}
        </p>
      )}
    </div>
  );
}
