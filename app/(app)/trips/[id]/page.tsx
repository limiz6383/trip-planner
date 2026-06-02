import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  getTripById,
  getTripBrief,
  getCurrentItinerary,
  getDaysForItinerary,
  getActivitiesForDay,
  getBookingForTrip,
} from "@/lib/db/queries";
import { requireUser } from "@/lib/auth";
import { ConsultingSession } from "@/components/consulting/ConsultingSession";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { BookingStep } from "@/components/booking/BookingStep";
import { PostItineraryBookingPanel } from "@/components/booking/PostItineraryBookingPanel";
import type { Trip, TripBrief, Booking, Itinerary, ItineraryDay, Activity } from "@/lib/types";

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

  const statusLabels: Record<string, string> = {
    planned: "Upcoming",
    in_progress: "On trip",
    completed: "Completed",
  };

  const statusLabel =
    statusLabels[trip.status] ??
    trip.status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

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
          {statusLabel}
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
  let booking: Booking | null = null;
  let itinerary: (Itinerary & { days: (ItineraryDay & { activities: Activity[] })[] }) | null = null;

  try {
    trip = await getTripById(supabase, id);
  } catch {
    // RLS error or Supabase not configured — surface as not-found
  }

  if (!trip) {
    notFound();
  }

  // Load brief, booking, and itinerary header in parallel; errors are non-fatal
  try {
    let itineraryHeader: Itinerary | null = null;
    [brief, booking, itineraryHeader] = await Promise.all([
      getTripBrief(supabase, id),
      getBookingForTrip(supabase, id),
      getCurrentItinerary(supabase, id),
    ]);

    // If an itinerary exists, hydrate its days and activities
    if (itineraryHeader) {
      const days = await getDaysForItinerary(supabase, itineraryHeader.itinerary_id);
      const hydratedDays = await Promise.all(
        days.map(async (day) => {
          const activities = await getActivitiesForDay(supabase, day.day_id);
          return { ...day, activities };
        })
      );
      itinerary = { ...itineraryHeader, days: hydratedDays };
    }
  } catch {
    // Supabase not configured or RLS error — continue with nulls
  }

  const hasBrief = brief !== null;
  const hasItinerary = itinerary !== null;

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="flex flex-col gap-4">
        {/*
         * Three-state feature area routing:
         *
         * State 1 — No brief yet:
         *   Show ConsultingSession so the user can build a trip brief.
         *
         * State 2 — Brief exists but no itinerary yet:
         *   ConsultingSession is dismissed; show BookingStep so the user can
         *   enter flights + accommodation before generation (or skip).
         *   BookingStep shows BookingForm with any existing booking prefilled,
         *   then drives itinerary generation once the user is ready.
         *
         * State 3 — Itinerary exists:
         *   Show ItineraryView with the hydrated itinerary.
         */}

        {/* State 1: no brief — show consulting session */}
        {!hasBrief && (
          <ConsultingSession tripId={trip.trip_id} />
        )}

        {/* State 2: brief done, no itinerary — show booking entry + generate */}
        {hasBrief && !hasItinerary && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6">
            <div className="mb-1 text-sm font-semibold text-indigo-900">
              Trip brief complete
            </div>
            <p className="mb-4 text-sm text-indigo-700">
              Enter your flights and accommodation so we can plan your itinerary
              around your actual travel schedule. All fields are optional.
            </p>
            <BookingStep tripId={trip.trip_id} initialBooking={booking} />
          </div>
        )}

        {/* State 3: itinerary exists — show full itinerary view and editable bookings */}
        {hasItinerary && itinerary && (
          <>
            <ItineraryView tripId={trip.trip_id} itinerary={itinerary} />
            {/*
             * PostItineraryBookingPanel lets the user view and edit their
             * flights/accommodation at any time after generation. It starts
             * collapsed so the itinerary remains the visual focus. Booking
             * data is already loaded on this page (getBookingForTrip runs
             * in the parallel Promise.all above), so no extra fetch is needed.
             */}
            <PostItineraryBookingPanel
              tripId={trip.trip_id}
              initialBooking={booking}
            />
          </>
        )}
      </div>
    </div>
  );
}
