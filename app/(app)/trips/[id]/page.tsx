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
import { calendarToken } from "@/lib/calendar-token";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { GenerateItineraryButton } from "@/components/itinerary/GenerateItineraryButton";
import { PrePlanFlow } from "@/components/booking/PrePlanFlow";
import { PostItineraryBookingPanel } from "@/components/booking/PostItineraryBookingPanel";
import { TripCover, RouteChips, splitStops, formatDateRangeShort, tripDays } from "@/components/TripCover";
import type { Trip, TripBrief, Booking, Itinerary, ItineraryDay, Activity } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  planned: "bg-white/90 text-brand-800",
  in_progress: "bg-green-100 text-green-900",
  completed: "bg-zinc-200 text-zinc-800",
};

const STATUS_LABELS: Record<string, string> = {
  planned: "Upcoming",
  in_progress: "On trip",
  completed: "Completed",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-black/20 px-3.5 py-3 ring-1 ring-white/15 backdrop-blur-sm">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/75">{label}</dt>
      <dd className="mt-0.5 font-display text-2xl font-semibold leading-none text-white">
        {value}
        {hint ? <span className="ml-1 font-sans text-xs font-medium text-white/75">{hint}</span> : null}
      </dd>
    </div>
  );
}

/**
 * Trip cover header: destination-themed art, title, route, dates and an
 * at-a-glance stat strip. Stats come straight from the saved itinerary; when
 * there is no itinerary yet only the facts we already know are shown.
 */
function TripHeader({
  trip,
  itinerary,
}: {
  trip: Trip;
  itinerary: (Itinerary & { days: (ItineraryDay & { activities: Activity[] })[] }) | null;
}) {
  const stops = splitStops(trip.destination);
  const days = tripDays(trip.start_date, trip.end_date);
  const statusLabel =
    STATUS_LABELS[trip.status] ??
    trip.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const planDays = itinerary?.days ?? [];
  const activityCount = planDays.reduce((n, d) => n + (d.activities?.length ?? 0), 0);
  const total =
    itinerary?.total_cost_estimate ??
    (planDays.length > 0 ? planDays.reduce((sum, d) => sum + (d.daily_cost ?? 0), 0) : null);

  return (
    <header className="relative mb-6 overflow-hidden rounded-3xl text-white shadow-lift sm:mb-8">
      <TripCover seed={trip.destination} stops={stops.length} />
      {/* Scrim keeps text legible on any palette */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-black/0" aria-hidden="true" />

      <div className="relative flex min-h-[17rem] flex-col justify-between gap-8 p-5 sm:min-h-[20rem] sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <Link
            href="/dashboard"
            className="-ml-2 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/15 hover:text-white"
          >
            <span aria-hidden="true" className="mr-1.5">&larr;</span> My Trips
          </Link>
          <span
            className={[
              "shrink-0 rounded-full px-3 py-1 text-xs font-semibold shadow-sm",
              STATUS_STYLES[trip.status] ?? "bg-zinc-200 text-zinc-800",
            ].join(" ")}
          >
            {statusLabel}
          </span>
        </div>

        <div>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-white drop-shadow-sm sm:text-6xl">
            {trip.title}
          </h1>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <RouteChips stops={stops} />
            <p className="text-sm font-medium text-white/90">
              {formatDateRangeShort(trip.start_date, trip.end_date)}
              <span className="mx-2 text-white/50" aria-hidden="true">/</span>
              {days} days, {Math.max(days - 1, 0)} nights
            </p>
          </div>
        </div>

        {itinerary && (
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <Stat label="Days" value={String(planDays.length || days)} />
            <Stat label="Stops" value={String(stops.length)} hint={stops.length === 1 ? "city" : "cities"} />
            <Stat label="Activities" value={String(activityCount)} />
            <Stat label="Estimate" value={total != null ? `$${Math.round(total).toLocaleString("en-US")}` : "n/a"} hint={total != null ? "total" : undefined} />
          </dl>
        )}
      </div>
    </header>
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
      <TripHeader trip={trip} itinerary={itinerary} />

      <div
        className={
          hasItinerary
            ? "flex flex-col gap-6"
            : "mx-auto flex w-full max-w-3xl flex-col gap-4"
        }
      >
        {/*
         * Three-state feature area routing:
         *
         * State 1 — No brief yet (pre-brief):
         *   Show PrePlanFlow, which first collects flights + accommodation
         *   (logistics stage), then hands off to ConsultingSession (consult
         *   stage). Logistics is optional — the user may skip to the AI
         *   consultation immediately. Booking data is prefilled from any
         *   existing booking row loaded above.
         *
         * State 2 — Brief exists but no itinerary yet:
         *   Logistics were already collected in State 1. Show only the
         *   GenerateItineraryButton so the user can trigger generation.
         *
         * State 3 — Itinerary exists:
         *   Show ItineraryView with the hydrated itinerary, and the
         *   PostItineraryBookingPanel so the user can view/edit bookings
         *   and optionally regenerate.
         */}

        {/* State 1: no brief — collect logistics then run consulting session */}
        {!hasBrief && (
          <PrePlanFlow
            tripId={trip.trip_id}
            initialBooking={booking}
          />
        )}

        {/* State 2: brief done, no itinerary — generate (logistics already collected) */}
        {hasBrief && !hasItinerary && (
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6">
            <div className="mb-1 font-display text-lg font-semibold text-brand-900">
              Trip brief complete
            </div>
            <p className="mb-4 text-sm text-brand-800">
              Your trip preferences have been saved. Generate your itinerary
              whenever you&apos;re ready.
            </p>
            <GenerateItineraryButton tripId={trip.trip_id} />
          </div>
        )}

        {/* State 3: itinerary exists — show full itinerary view and editable bookings */}
        {hasItinerary && itinerary && (
          <>
            <ItineraryView
              tripId={trip.trip_id}
              itinerary={itinerary}
              tripTitle={trip.title}
              calendarSubscribeUrl={
                process.env.NEXT_PUBLIC_SITE_URL
                  ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/trips/${trip.trip_id}/calendar.ics?token=${calendarToken(trip.trip_id)}`
                  : undefined
              }
            />
            {/*
             * PostItineraryBookingPanel lets the user view and edit their
             * flights/accommodation at any time after generation. It starts
             * collapsed so the itinerary remains the visual focus. Booking
             * data is already loaded on this page (getBookingForTrip runs
             * in the parallel Promise.all above), so no extra fetch is needed.
             */}
            <div className="lg:mr-[23rem]">
              <PostItineraryBookingPanel
                tripId={trip.trip_id}
                initialBooking={booking}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
