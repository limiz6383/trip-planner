"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
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
  planned: "bg-blue-100 text-blue-700",
  in_progress: "bg-green-100 text-green-700",
  completed: "bg-zinc-100 text-zinc-600",
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

  const start = new Date(trip.start_date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    // Date-only value: format in UTC to avoid an off-by-one in timezones west of UTC.
    timeZone: "UTC",
  });
  const end = new Date(trip.end_date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  function handleConfirmDelete() {
    setDeleteOpen(false);
    const fd = new FormData();
    fd.set("trip_id", trip.trip_id);
    deleteDispatch(fd);
  }

  return (
    <>
      <Card className="transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          {/* Title / destination — clicking navigates to the trip */}
          <Link
            href={`/trips/${trip.trip_id}`}
            className="min-w-0 flex-1 group"
          >
            <h2 className="truncate text-sm font-semibold text-zinc-900 group-hover:underline">
              {trip.title}
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {trip.destination}
            </p>
          </Link>

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

        {/* Action row */}
        <div className="mt-3 flex items-center gap-2">
          {/* Archive / Unarchive */}
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

          {/* Delete — opens confirm dialog */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            loading={deletePending}
            className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            Delete
          </Button>
        </div>

        {/* Inline error feedback */}
        {archiveState?.error && (
          <p className="mt-2 text-xs text-red-600">{archiveState.error}</p>
        )}
        {deleteState?.error && (
          <p className="mt-2 text-xs text-red-600">{deleteState.error}</p>
        )}
      </Card>

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
