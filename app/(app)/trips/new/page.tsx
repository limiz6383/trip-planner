"use client";

import { ArrowLeftIcon, ArrowUpIcon, ArrowDownIcon, CloseIcon } from "@/components/ui/Icons";
import { useActionState, useState } from "react";
import Link from "next/link";
import { createTripAction, type TripActionState } from "@/app/actions/trips";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { DestinationAutocomplete } from "@/components/DestinationAutocomplete";
import { addDaysISO, rechainLegs, moveLegChronologically, validateLegs } from "@/lib/planner/legs";

const initialState: TripActionState = undefined;

interface LegDraft {
  city: string;
  arrival: string; // YYYY-MM-DD
  departure: string; // YYYY-MM-DD
}

const addDays = addDaysISO;

/** Today in the traveller's own timezone (toISOString would be UTC, a day off in the evening). */
function localToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function NewTripPage() {
  const [state, action, pending] = useActionState(createTripAction, initialState);

  const today = localToday();

  // One or more city legs. Defaults to a single 3-day leg.
  const [legs, setLegs] = useState<LegDraft[]>([
    { city: "", arrival: today, departure: addDays(today, 2) },
  ]);

  // Cities run in date order, so editing a date or moving a city re-chains the
  // following cities (each starts the day the previous one ends).
  function updateLeg(i: number, patch: Partial<LegDraft>) {
    setLegs((prev) => {
      const next = prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
      return "arrival" in patch || "departure" in patch ? rechainLegs(next, i) : next;
    });
  }
  function addLeg() {
    setLegs((prev) => {
      const last = prev[prev.length - 1];
      const start = last?.departure || today; // next city starts when the last ends
      return [...prev, { city: "", arrival: start, departure: addDays(start, 2) }];
    });
  }
  function removeLeg(i: number) {
    setLegs((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      // Close the gap the removed city leaves.
      return next.length > 0 ? rechainLegs(next, Math.max(0, i - 1)) : next;
    });
  }
  function moveLeg(i: number, dir: -1 | 1) {
    setLegs((prev) => moveLegChronologically(prev, i, dir));
  }

  const multi = legs.length > 1;
  const missingCity = legs.some((l) => !l.city.trim());
  const dateProblem = legs.every((l) => l.arrival && l.departure)
    ? validateLegs(
        legs.map((l) => ({ city: l.city || "A city", arrival_date: l.arrival, departure_date: l.departure }))
      )
    : "Pick an arrival and departure date for every city.";
  const canSubmit = legs.length > 0 && !missingCity && !dateProblem;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 sm:mb-8">
        <Link
          href="/dashboard"
          className="-ml-2 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-paper-2 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="mr-1.5 h-4 w-4" /> Back to trips
        </Link>
        <h1 className="mt-1 text-3xl font-bold text-ink sm:text-4xl">Plan a new trip</h1>
        <p className="mt-1.5 max-w-xl text-sm text-zinc-600 sm:text-base">
          Add one city, or several to plan a multi-city trip — each with its own dates.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8">
      <Card>
        <form action={action} className="flex flex-col gap-5">
          <Input
            label="Trip name"
            name="title"
            required
            placeholder="e.g. Greece Summer 2026"
            autoFocus
          />

          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-zinc-800">
              {multi ? "Cities" : "Destination"}
            </span>

            {legs.map((leg, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-3 sm:p-4"
              >
                <div className="flex items-center gap-2">
                  {multi && (
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                  )}
                  <div className="flex-1">
                    <DestinationAutocomplete
                      showLabel={false}
                      placeholder="e.g. Athens, Greece"
                      value={leg.city}
                      onValueChange={(v) => updateLeg(i, { city: v })}
                    />
                  </div>
                  {multi && (
                    <div className="flex flex-none items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveLeg(i, -1)}
                        disabled={i === 0}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-paper-2 hover:text-zinc-900 disabled:opacity-30 sm:h-9 sm:w-9"
                        aria-label="Move city up"
                      >
                        <ArrowUpIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLeg(i, 1)}
                        disabled={i === legs.length - 1}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-paper-2 hover:text-zinc-900 disabled:opacity-30 sm:h-9 sm:w-9"
                        aria-label="Move city down"
                      >
                        <ArrowDownIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLeg(i)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-30 sm:h-9 sm:w-9"
                        aria-label="Remove city"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Arrival"
                    type="date"
                    value={leg.arrival}
                    min={today}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateLeg(i, {
                        arrival: v,
                        ...(leg.departure < v ? { departure: v } : {}),
                      });
                    }}
                  />
                  <Input
                    label="Departure"
                    type="date"
                    value={leg.departure}
                    min={leg.arrival || today}
                    onChange={(e) => updateLeg(i, { departure: e.target.value })}
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addLeg}
              className="inline-flex min-h-11 items-center self-start rounded-xl border border-dashed border-brand-400 px-4 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              + Add another city
            </button>
          </div>

          {/* Serialized legs for the server action */}
          <input type="hidden" name="legs" value={JSON.stringify(legs)} />

          {!canSubmit && (missingCity || dateProblem) ? (
            <p className="text-sm text-zinc-600" id="create-trip-hint">
              {dateProblem ?? "Choose a destination for every city to continue."}
            </p>
          ) : null}

          {state?.error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {state.error}
            </p>
          ) : null}

          <div className="flex gap-3 pt-1">
            <Button type="submit" loading={pending} disabled={!canSubmit} aria-describedby={!canSubmit ? "create-trip-hint" : undefined} className="flex-1">
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

        <aside aria-label="How planning works" className="rounded-2xl border border-line bg-paper-2/60 p-5 lg:sticky lg:top-20">
          <h2 className="font-display text-lg font-semibold text-ink">What happens next</h2>
          <ol className="mt-4 flex flex-col gap-4">
            {[
              ["Create the trip", "Name it and pick your cities and dates."],
              ["Tell us your style", "Optionally add flights and a stay, then a short chat about what you enjoy."],
              ["Shape your plan", "Get a day-by-day itinerary, then revise, lock or reorder anything."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 font-display text-sm font-bold text-white" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{t}</span>
                  <span className="block text-sm leading-snug text-zinc-600">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
