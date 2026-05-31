"use client";

/**
 * GenerateItineraryButton
 *
 * Client component that triggers itinerary generation by calling
 * POST /api/trips/[id]/itinerary, then reloads the page so the server
 * component re-fetches and renders ItineraryView.
 *
 * Manages its own loading + error state so the parent page (server component)
 * stays simple.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type {
  GenerateItineraryResponseBody,
  GenerateItineraryErrorBody,
} from "@/app/api/trips/[id]/itinerary/route";

export interface GenerateItineraryButtonProps {
  tripId: string;
}

export function GenerateItineraryButton({
  tripId,
}: GenerateItineraryButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/trips/${tripId}/itinerary`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = (await res.json()) as GenerateItineraryErrorBody;
        setError(body.error ?? "Itinerary generation failed. Please try again.");
        return;
      }

      // Successful — cast to verify shape, then refresh to let the server
      // component re-render with the new itinerary.
      const _body = (await res.json()) as GenerateItineraryResponseBody;
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="primary"
        size="lg"
        loading={loading}
        onClick={handleGenerate}
        className="w-full sm:w-auto"
      >
        {loading ? "Generating itinerary..." : "Generate my itinerary"}
      </Button>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
