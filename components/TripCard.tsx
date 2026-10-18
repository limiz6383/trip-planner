"use client";

import { ArrowRightIcon } from "@/components/ui/Icons";
import { useState, useActionState } from "react";
import Link from "next/link";
import { TripCover, RouteChips, splitStops, formatDateRangeShort, tripDays } from "@/components/TripCover";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  archiveTripAction,
  unarchiveTripAction,
  deleteTripAction,
  type TripMutationState,
} from "@/app/actions/trips";
import type { Trip } from "@/lib/types";

const statusColors: Record<string, string> = {
  planned: "bg-brand-100 text-brand-800",
  in_progress: "bg-green-100 text-green-800",
  completed: "bg-zinc-200 text-zinc-700",
};

const statusLabels: Record<string, string> = {
  planned: "Upcoming",
  in_progress: "On trip",
  completed: "Completed",
};

interface TripCardProps {
  trip: Trip;
}

export function TripCard({ trip }: TripCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [archiveState, archiveDispatch, archivePending] = useActionState<
    TripMutationState,
    FormData
  >(trip.archived ? unarchiveTripAction : archiveTripAction, undefined);

  const [deleteState, deleteDispatch, deletePending] = useActionState<
    TripMutationState,
    FormData
  >(deleteTripAction, undefined);

  const stops = splitStops(trip.destination);
  const days = tripDays(trip.start_date, trip.end_date);

  function handleConfirmDelete() {
    setDeleteOpen(false);
    const fd = new FormData();
    fd.set("trip_id", trip.trip_id);
    deleteDispatch(fd);
  }

  return (
    <>
      <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
        {/* Cover */}
        <div className="relative h-32 shrink-0 sm:h-36">
          <TripCover seed={trip.destination} stops={stops.length} compact />
          <span
            className={[
              "absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm",
              statusColors[trip.status] ?? "bg-zinc-200 text-zinc-700",
            ].join(" ")}
          >
            {statusLabels[trip.status] ?? trip.status.replace("_", " ")}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          {/* Title: the stretched link makes the whole card open the trip */}
          <h2 className="font-display text-xl font-semibold leading-snug text-ink">
            <Link
              href={`/trips/${trip.trip_id}`}
              className="rounded after:absolute after:inset-0 after:z-0 after:content-[''] focus-visible:outline-2"
            >
              {trip.title}
            </Link>
          </h2>

          <div className="mt-2">
            <RouteChips stops={stops} tone="dark" />
          </div>

          <p className="mt-3 text-sm text-zinc-600">
            {formatDateRangeShort(trip.start_date, trip.end_date)}
            <span className="mx-1.5 text-zinc-300" aria-hidden="true">
              /
            </span>
            {days} {days === 1 ? "day" : "days"}
          </p>

          {/* Action row */}
          <div className="relative z-10 mt-auto flex items-center gap-1 pt-4">
            <form action={archiveDispatch}>
              <input type="hidden" name="trip_id" value={trip.trip_id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                loading={archivePending}
                className="text-xs"
              >
                {trip.archived ? "Unarchive" : "Archive"}
              </Button>
            </form>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              loading={deletePending}
              className="text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              Delete
            </Button>

            <span
              className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-brand-700 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              Open <ArrowRightIcon className="h-4 w-4" />
            </span>
          </div>

          {archiveState?.error && (
            <p className="mt-2 text-xs text-red-600">{archiveState.error}</p>
          )}
          {deleteState?.error && (
            <p className="mt-2 text-xs text-red-600">{deleteState.error}</p>
          )}
        </div>
      </article>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete trip"
        description={`Permanently delete "${trip.title}"? This can't be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
