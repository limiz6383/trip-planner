import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getTripsForUser, getArchivedTripsForUser } from "@/lib/db/queries";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { TripCard } from "@/components/TripCard";
import type { Trip } from "@/lib/types";

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
  await requireUser();

  // Next 16 App Router: searchParams is a Promise
  const { view } = await searchParams;
  const showArchived = view === "archived";

  const supabase = await createSupabaseServerClient();

  let activeTrips: Trip[] = [];
  let archivedTrips: Trip[] = [];

  try {
    if (showArchived) {
      archivedTrips = await getArchivedTripsForUser(supabase);
    } else {
      activeTrips = await getTripsForUser(supabase);
    }
  } catch {
    // Supabase not configured — show empty state gracefully
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">My Trips</h1>
        <Link href="/trips/new">
          <Button size="sm">New trip</Button>
        </Link>
      </div>

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
