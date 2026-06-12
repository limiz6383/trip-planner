"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createTripAction, type TripActionState } from "@/app/actions/trips";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { DestinationAutocomplete } from "@/components/DestinationAutocomplete";

const initialState: TripActionState = undefined;

interface LegDraft {
  city: string;
  arrival: string; // YYYY-MM-DD
  departure: string; // YYYY-MM-DD
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().split("T")[0];
}

export default function NewTripPage() {
  const [state, action, pending] = useActionState(createTripAction, initialState);

  const today = new Date().toISOString().split("T")[0];

  // One or more city legs. Defaults to a single 3-day leg.
  const [legs, setLegs] = useState<LegDraft[]>([
    { city: "", arrival: today, departure: addDays(today, 2) },
  ]);

  function updateLeg(i: number, patch: Partial<LegDraft>) {
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLeg() {
    setLegs((prev) => {
      const last = prev[prev.length - 1];
      const start = last?.departure || today; // next city starts when the last ends
      return [...prev, { city: "", arrival: start, departure: addDays(start, 2) }];
    });
  }
  function removeLeg(i: number) {
    setLegs((prev) => prev.filter((_, idx) => idx !== i));
  }
  function moveLeg(i: number, dir: -1 | 1) {
    setLegs((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const multi = legs.length > 1;
  const canSubmit =
    legs.length > 0 &&
    legs.every((l) => l.city.trim() && l.arrival && l.departure && l.departure >= l.arrival);

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
          Add one city, or several to plan a multi-city trip — each with its own dates.
        </p>
      </div>

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
            <span className="text-sm font-medium text-zinc-700">
              {multi ? "Cities" : "Destination"}
            </span>

            {legs.map((leg, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
              >
                <div className="flex items-center gap-2">
                  {multi && (
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
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
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-30"
                        aria-label="Move city up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLeg(i, 1)}
                        disabled={i === legs.length - 1}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-30"
                        aria-label="Move city down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLeg(i)}
                        className="rounded p-1 text-zinc-400 hover:bg-red-100 hover:text-red-600"
                        aria-label="Remove city"
                      >
                        ✕
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
              className="self-start rounded-lg border border-dashed border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
            >
              + Add another city
            </button>
          </div>

          {/* Serialized legs for the server action */}
          <input type="hidden" name="legs" value={JSON.stringify(legs)} />

          {state?.error ? (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          ) : null}

          <div className="flex gap-3 pt-1">
            <Button type="submit" loading={pending} disabled={!canSubmit} className="flex-1">
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
