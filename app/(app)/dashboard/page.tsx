import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  getTripsForUser,
  getArchivedTripsForUser,
  learnPreferenceProfile,
} from "@/lib/db/queries";
import { hasPreferenceSignal } from "@/lib/preferences";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { TripCard } from "@/components/TripCard";
import type { Trip, PreferenceProfile, ActivityType } from "@/lib/types";

// ---------------------------------------------------------------------------
// "Your travel style" — learned from past trips
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<ActivityType, string> = {
  food: "Food",
  culture: "Culture",
  outdoor: "Outdoor",
  shopping: "Shopping",
  transport: "Transport",
  accommodation: "Stay",
  entertainment: "Entertainment",
  other: "Other",
};

function TravelStyleCard({ profile }: { profile: PreferenceProfile }) {
  const paceLabel = profile.travel_pace
    ? profile.travel_pace[0].toUpperCase() + profile.travel_pace.slice(1)
    : null;
  const priceLabel =
    profile.price_sensitivity === "high"
      ? "Budget-conscious"
      : profile.price_sensitivity === "mid"
      ? "Mid-range"
      : profile.price_sensitivity === "low"
      ? "Splurge-friendly"
      : null;
  const loc = profile.locality_preference;
  const localityLabel =
    loc <= 0.35 ? "Leans local" : loc >= 0.65 ? "Leans touristy" : "Balanced local/touristy";

  return (
    <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <div className="mb-2 text-sm font-semibold text-indigo-900">
        Your travel style
      </div>
      <p className="mb-3 text-xs text-indigo-700">
        Learned from your past trips — it gently shapes new itineraries.
      </p>
      <div className="flex flex-wrap gap-2">
        {profile.liked_activity_types.map((t) => (
          <span
            key={t}
            className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200"
          >
            {TYPE_LABELS[t] ?? t}
          </span>
        ))}
        {paceLabel && (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
            {paceLabel} pace
          </span>
        )}
        {priceLabel && (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
            {priceLabel}
          </span>
        )}
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
          {localityLabel}
        </span>
      </div>
      {profile.disliked_activity_types.length > 0 && (
        <p className="mt-2 text-xs text-indigo-700/80">
          Tends to skip:{" "}
          {profile.disliked_activity_types
            .map((t) => TYPE_LABELS[t] ?? t)
            .join(", ")}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state helper
// ---------------------------------------------------------------------------

function EmptyState({ archived }: { archived: boolean }) {
  if (archived) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white py-10 text-center">
        <p className="text-sm font-medium text-zinc-900">No archived trips</p>
        <p className="mt-1 text-xs text-zinc-500">
          Archived trips will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white py-16 text-center">
      <p className="text-sm font-medium text-zinc-900">No trips yet</p>
      <p className="mt-1 text-xs text-zinc-500">
        Create your first trip to get started.
      </p>
      <Link href="/trips/new" className="mt-4">
        <Button>Plan a trip</Button>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trip list
// ---------------------------------------------------------------------------

function TripList({ trips, archived }: { trips: Trip[]; archived: boolean }) {
  if (trips.length === 0) return <EmptyState archived={archived} />;

  return (
    <ul className="flex flex-col gap-3">
      {trips.map((trip) => (
        <li key={trip.trip_id}>
          <TripCard trip={trip} />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface DashboardSearchParams {
  view?: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const user = await requireUser();

  // Next 16 App Router: searchParams is a Promise
  const { view } = await searchParams;
  const showArchived = view === "archived";

  const supabase = await createSupabaseServerClient();

  let activeTrips: Trip[] = [];
  let archivedTrips: Trip[] = [];
  let profile: PreferenceProfile | null = null;

  try {
    if (showArchived) {
      archivedTrips = await getArchivedTripsForUser(supabase);
    } else {
      activeTrips = await getTripsForUser(supabase);
      // Learn (and cache) the travel-style profile from past trips.
      profile = await learnPreferenceProfile(supabase, user.id);
    }
  } catch {
    // Supabase not configured — show empty state gracefully
  }

  const showStyle = !showArchived && profile && hasPreferenceSignal(profile);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">My Trips</h1>
        <Link href="/trips/new">
          <Button size="sm">New trip</Button>
        </Link>
      </div>

      {showStyle && profile && <TravelStyleCard profile={profile} />}

      {/* Active / Archived toggle */}
      <div className="mb-4 flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 w-fit">
        <Link
          href="/dashboard"
          className={[
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            !showArchived
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700",
          ].join(" ")}
        >
          Active
        </Link>
        <Link
          href="/dashboard?view=archived"
          className={[
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            showArchived
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700",
          ].join(" ")}
        >
          Archived
        </Link>
      </div>

      {/* Trip list */}
      {showArchived ? (
        <TripList trips={archivedTrips} archived />
      ) : (
        <TripList trips={activeTrips} archived={false} />
      )}
    </div>
  );
}
