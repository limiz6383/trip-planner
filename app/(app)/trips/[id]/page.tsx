import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getTripById, getTripBrief, getCurrentItinerary } from "@/lib/db/queries";
import { requireUser } from "@/lib/auth";
import { ConsultingSession } from "@/components/consulting/ConsultingSession";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import type { Trip, TripBrief, Itinerary } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(start)} — ${fmt(end)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TripHeader({ trip }: { trip: Trip }) {
  const statusColors: Record<string, string> = {
    planned: "bg-blue-100 text-blue-700",
    in_progress: "bg-green-100 text-green-700",
    completed: "bg-zinc-100 text-zinc-600",
  };

  return (
    <div className="mb-6">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
      >
        &larr; My Trips
      </Link>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-zinc-900 truncate">{trip.title}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{trip.destination}</p>
          <p className="mt-0.5 text-xs text-zinc-400">
            {formatDateRange(trip.start_date, trip.end_date)}
          </p>
        </div>
        <span
          className={[
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
            statusColors[trip.status] ?? "bg-zinc-100 text-zinc-600",
          ].join(" ")}
        >
          {trip.status.replace("_", " ")}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();

  const { id } = await params;

  const supabase = await createSupabaseServerClient();

  let trip: Trip | null = null;
  let brief: TripBrief | null = null;
  let itinerary: Itinerary | null = null;

  try {
    trip = await getTripById(supabase, id);
  } catch {
    // RLS error or Supabase not configured — surface as not-found
  }

  if (!trip) {
    notFound();
  }

  // Load brief and itinerary in parallel; errors are non-fatal (Wave B fills in data)
  try {
    [brief, itinerary] = await Promise.all([
      getTripBrief(supabase, id),
      getCurrentItinerary(supabase, id),
    ]);
  } catch {
    // Supabase not configured or RLS error — continue with nulls
  }

  const hasBrief = brief !== null;
  const hasItinerary = itinerary !== null;

  return (
    <div>
      <TripHeader trip={trip} />

      {/*
       * Feature area routing:
       *
       * 1. No brief yet → show ConsultingSession so the user can build one.
       * 2. Brief exists but no itinerary → show ConsultingSession (Wave B will
       *    transition to itinerary generation after the brief is complete) AND
       *    a disabled itinerary placeholder.
       * 3. Itinerary exists → show ItineraryView.
       *
       * ConsultingSession and ItineraryView are Wave B seams — prop contracts
       * are defined; internals are stubs today.
       */}

      <div className="flex flex-col gap-4">
        {/* Always show consulting session until an itinerary exists */}
        {!hasItinerary && (
          <ConsultingSession tripId={trip.trip_id} />
        )}

        {/* Show brief summary if consulting produced one but no itinerary yet */}
        {hasBrief && !hasItinerary && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Trip brief collected — itinerary generation coming in Wave B.
          </div>
        )}

        {/* Show itinerary view once it exists */}
        {hasItinerary && itinerary && (
          <ItineraryView tripId={trip.trip_id} itinerary={itinerary} />
        )}
      </div>
    </div>
  );
}
