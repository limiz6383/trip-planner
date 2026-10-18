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
import { TYPE_META, TypeIcon } from "@/components/itinerary/activity-types";
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

  const quiet =
    "inline-flex items-center rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-zinc-700 ring-1 ring-line-strong";

  return (
    <section
      aria-labelledby="travel-style"
      className="mb-8 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
        <div className="sm:w-64 sm:shrink-0">
          <h2 id="travel-style" className="font-display text-lg font-semibold text-ink">
            Your travel style
          </h2>
          <p className="mt-1 text-sm leading-snug text-zinc-600">
            Learned from your past trips. It gently shapes new itineraries.
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <ul className="flex flex-wrap gap-2" aria-label="Your travel style">
            {profile.liked_activity_types.map((t) => (
              <li
                key={t}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                  TYPE_META[t]?.chip ?? "bg-paper-2 text-zinc-700",
                ].join(" ")}
              >
                <TypeIcon type={t} />
                {TYPE_LABELS[t] ?? t}
              </li>
            ))}
            {paceLabel && <li className={quiet}>{paceLabel} pace</li>}
            {priceLabel && <li className={quiet}>{priceLabel}</li>}
            <li className={quiet}>{localityLabel}</li>
          </ul>
          {profile.disliked_activity_types.length > 0 && (
            <p className="text-xs text-zinc-600">
              Tends to skip:{" "}
              {profile.disliked_activity_types
                .map((t) => TYPE_LABELS[t] ?? t)
                .join(", ")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state helper
// ---------------------------------------------------------------------------

function EmptyIllustration() {
  return (
    <svg viewBox="0 0 160 110" className="h-28 w-40" aria-hidden="true">
      <circle cx="104" cy="44" r="34" fill="var(--color-brand-100)" />
      <circle cx="104" cy="44" r="20" fill="var(--color-brand-200)" opacity="0.7" />
      <path d="M10 92c24-26 40 6 64-18s34-12 58-40" fill="none" stroke="var(--color-brand-700)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 7" />
      <circle cx="10" cy="92" r="5" fill="var(--color-brand-700)" />
      <circle cx="132" cy="34" r="7" fill="var(--color-sun-500)" />
      <circle cx="132" cy="34" r="2.5" fill="#fff" />
    </svg>
  );
}

function EmptyState({ archived }: { archived: boolean }) {
  if (archived) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-4 py-12 text-center">
        <p className="font-display text-lg font-semibold text-ink">No archived trips</p>
        <p className="mt-1 text-sm text-zinc-600">
          Trips you archive are kept here, out of the way.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-4 py-14 text-center">
      <EmptyIllustration />
      <p className="mt-3 font-display text-xl font-semibold text-ink">No trips yet</p>
      <p className="mt-1 max-w-sm text-sm text-zinc-600">
        Tell the planner where and when. It will ask a few questions, then draft a
        day-by-day itinerary you can reshape.
      </p>
      <Link href="/trips/new" className="mt-5">
        <Button size="lg">Plan a trip</Button>
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
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {trips.map((trip, i) => (
        <li
          key={trip.trip_id}
          className="animate-rise"
          style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
        >
          <TripCard trip={trip} />
        </li>
      ))}
      {!archived && (
        <li>
          <Link
            href="/trips/new"
            className="flex h-full min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface/50 p-6 text-center text-sm font-medium text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-50"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-2xl leading-none text-brand-700" aria-hidden="true">
              +
            </span>
            Plan another trip
          </Link>
        </li>
      )}
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
      <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
        <div>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">My Trips</h1>
          <p className="mt-1 text-sm text-zinc-600 sm:text-base">
            Plan, reshape and revisit your itineraries.
          </p>
        </div>
        <Link href="/trips/new" className="hidden sm:block">
          <Button>New trip</Button>
        </Link>
      </div>

      {showStyle && profile && <TravelStyleCard profile={profile} />}

      {/* Active / Archived toggle */}
      <div className="mb-5 flex w-fit gap-1 rounded-full border border-line bg-paper-2 p-1" role="group" aria-label="Trip filter">
        <Link
          href="/dashboard"
          className={[
            "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors",
            !showArchived
              ? "bg-surface text-ink shadow-card"
              : "text-zinc-600 hover:text-zinc-900",
          ].join(" ")}
        >
          Active
        </Link>
        <Link
          href="/dashboard?view=archived"
          className={[
            "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors",
            showArchived
              ? "bg-surface text-ink shadow-card"
              : "text-zinc-600 hover:text-zinc-900",
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
