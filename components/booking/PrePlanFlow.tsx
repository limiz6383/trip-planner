"use client";

/**
 * PrePlanFlow
 *
 * Client wrapper for the PRE-BRIEF phase of a trip. Orchestrates two stages:
 *
 *   Stage "logistics":
 *     Render BookingForm in "preplan" mode so the user can enter flights and
 *     accommodation before the AI consultation. All fields are optional.
 *     Primary action: "Continue to consultation" — POSTs the booking (if any
 *     fields are filled), then advances to the "consult" stage.
 *     Secondary action: "Skip for now" — advances without saving.
 *
 *   Stage "consult":
 *     Render <ConsultingSession> unchanged. When the session produces a
 *     completed brief it calls onBriefComplete so the parent server page can
 *     refresh into State 2 (generate) or State 3 (itinerary).
 *
 * Props:
 *   tripId         — UUID of the trip being planned
 *   initialBooking — Existing Booking row for prefill (may be null)
 *   onBriefComplete — Forwarded to ConsultingSession; fires when the brief is saved
 */

import { useState } from "react";
import { BookingForm } from "@/components/booking/BookingForm";
import { ConsultingSession } from "@/components/consulting/ConsultingSession";
import type { Booking } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Stage = "logistics" | "consult";

export interface PrePlanFlowProps {
  tripId: string;
  initialBooking?: Booking | null;
  onBriefComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrePlanFlow({
  tripId,
  initialBooking,
  onBriefComplete,
}: PrePlanFlowProps) {
  const [stage, setStage] = useState<Stage>("logistics");

  function advanceToConsult() {
    setStage("consult");
  }

  // ---- Stage: logistics ----

  if (stage === "logistics") {
    return (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6">
        {/* Section header */}
        <div className="mb-1 text-sm font-semibold text-indigo-900">
          Flights &amp; accommodation (optional)
        </div>
        <p className="mb-4 text-sm text-indigo-700">
          Enter your flights and accommodation so the AI consultant can plan
          around your actual travel schedule. All fields are optional — you can
          always add or edit these later.
        </p>

        <BookingForm
          tripId={tripId}
          initialBooking={initialBooking}
          onContinueToConsult={advanceToConsult}
          onSkipToConsult={advanceToConsult}
        />
      </div>
    );
  }

  // ---- Stage: consult ----

  return (
    <ConsultingSession
      tripId={tripId}
      onBriefComplete={onBriefComplete}
    />
  );
}
