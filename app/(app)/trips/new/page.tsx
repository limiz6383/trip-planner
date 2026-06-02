"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createTripAction, type TripActionState } from "@/app/actions/trips";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { DestinationAutocomplete } from "@/components/DestinationAutocomplete";

const initialState: TripActionState = undefined;

export default function NewTripPage() {
  const [state, action, pending] = useActionState(createTripAction, initialState);

  // Today's date as YYYY-MM-DD for default values
  const today = new Date().toISOString().split("T")[0];

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          &larr; Back to trips
        </Link>
        <h1 className="mt-2 text-xl font-bold text-zinc-900">Plan a new trip</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Fill in the basics — you can add details during planning.
        </p>
      </div>

      <Card>
        <form action={action} className="flex flex-col gap-5">
          <Input
            label="Trip name"
            name="title"
            required
            placeholder="e.g. Japan Spring 2026"
            autoFocus
          />

          <DestinationAutocomplete
            required
            placeholder="e.g. Tokyo, Japan"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start date"
              name="start_date"
              type="date"
              required
              defaultValue={today}
            />
            <Input
              label="End date"
              name="end_date"
              type="date"
              required
              defaultValue={today}
            />
          </div>

          {state?.error ? (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          ) : null}

          <div className="flex gap-3 pt-1">
            <Button type="submit" loading={pending} className="flex-1">
              Create trip
            </Button>
            <Link href="/dashboard" className="flex-1">
              <Button type="button" variant="secondary" className="w-full">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
