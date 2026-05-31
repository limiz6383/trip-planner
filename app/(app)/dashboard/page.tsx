import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getTripsForUser } from "@/lib/db/queries";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Trip } from "@/lib/types";

function TripCard({ trip }: { trip: Trip }) {
  const start = new Date(trip.start_date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const end = new Date(trip.end_date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const statusColors: Record<string, string> = {
    planned: "bg-blue-100 text-blue-700",
    in_progress: "bg-green-100 text-green-700",
    completed: "bg-zinc-100 text-zinc-600",
  };

  return (
    <Link href={`/trips/${trip.trip_id}`} className="block group">
      <Card className="transition-shadow group-hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-zinc-900">
              {trip.title}
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {trip.destination}
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
        <p className="mt-3 text-xs text-zinc-400">
          {start} — {end}
        </p>
      </Card>
    </Link>
  );
}

export default async function DashboardPage() {
  await requireUser();

  const supabase = await createSupabaseServerClient();
  let trips: Trip[] = [];

  try {
    trips = await getTripsForUser(supabase);
  } catch {
    // Supabase not configured — show empty state gracefully
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">My Trips</h1>
        <Link href="/trips/new">
          <Button size="sm">New trip</Button>
        </Link>
      </div>

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-sm font-medium text-zinc-900">No trips yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            Create your first trip to get started.
          </p>
          <Link href="/trips/new" className="mt-4">
            <Button>Plan a trip</Button>
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {trips.map((trip) => (
            <li key={trip.trip_id}>
              <TripCard trip={trip} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
