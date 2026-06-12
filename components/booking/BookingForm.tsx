"use client";

/**
 * BookingForm
 *
 * Mobile-first form to capture flight and accommodation logistics before
 * itinerary generation. Supports OPTIONAL, MULTIPLE flights and accommodations
 * (multi-city). The user may add zero, one, or many of each.
 *
 * On mount it loads existing logistics via GET /api/trips/[id]/logistics and
 * prefills both lists. On save it POSTs the full lists to
 * POST /api/trips/[id]/logistics (which replaces both), then invokes the
 * relevant action callback depending on the mode the wrappers select:
 *   - "preplan"  → onContinueToConsult after save (onSkipToConsult skips, no save)
 *   - "generate" → onSaveAndGenerate after save (onSkip skips, no save)
 *   - "save"     → onSaveOnly after save
 *
 * Airport fields reuse PlaceAutocomplete with endpoint="/api/airports".
 * Accommodation location reuses PlaceAutocomplete with the default /api/geocode
 * endpoint so neighborhood + lat/lon are captured when a suggestion is picked.
 * Free-typed text is also accepted, with null lat/lon.
 */

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useId,
  KeyboardEvent,
} from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { Booking } from "@/lib/types";
import type { GeocodeResult } from "@/app/api/geocode/route";
import type {
  LogisticsResponseBody,
  LogisticsErrorBody,
} from "@/app/api/trips/[id]/logistics/route";
import type { FlightInput, AccommodationInput } from "@/lib/db/queries";

// ---------------------------------------------------------------------------
// Row types (client-side editable rows, each with a stable local key)
// ---------------------------------------------------------------------------

interface FlightRow {
  key: string;
  from_airport: string;
  to_airport: string;
  depart_date: string;
  depart_time: string;
}

interface AccommodationRow {
  key: string;
  name: string;
  neighborhood: string;
  lat: number | null;
  lon: number | null;
  check_in: string;
  check_out: string;
}

let rowKeyCounter = 0;
function nextKey(prefix: string): string {
  rowKeyCounter += 1;
  return `${prefix}-${rowKeyCounter}`;
}

function emptyFlightRow(): FlightRow {
  return {
    key: nextKey("flight"),
    from_airport: "",
    to_airport: "",
    depart_date: "",
    depart_time: "",
  };
}

function emptyAccommodationRow(): AccommodationRow {
  return {
    key: nextKey("stay"),
    name: "",
    neighborhood: "",
    lat: null,
    lon: null,
    check_in: "",
    check_out: "",
  };
}

// ---------------------------------------------------------------------------
// Place autocomplete (shared by accommodation location + airports)
// ---------------------------------------------------------------------------

const INPUT_BASE =
  "w-full rounded-lg border px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent " +
  "disabled:bg-zinc-50 disabled:text-zinc-500 disabled:cursor-not-allowed " +
  "border-zinc-300 bg-white";

interface PlaceAutocompleteProps {
  label: string;
  placeholder: string;
  defaultValue?: string;
  defaultLat?: number | null;
  defaultLon?: number | null;
  /** Suggestion endpoint (returns GeocodeResult[]). Defaults to general geocode. */
  endpoint?: string;
  onSelect: (label: string, lat: number | null, lon: number | null) => void;
}

function PlaceAutocomplete({
  label,
  placeholder,
  defaultValue = "",
  defaultLat,
  defaultLon,
  endpoint = "/api/geocode",
  onSelect,
}: PlaceAutocompleteProps) {
  const inputId = useId();
  const listboxId = useId();

  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // track committed lat/lon separately — updated when a suggestion is picked
  const latRef = useRef<number | null>(defaultLat ?? null);
  const lonRef = useRef<number | null>(defaultLon ?? null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      const data: GeocodeResult[] = await res.json();
      setSuggestions(data);
      setOpen(data.length > 0);
      setActiveIndex(-1);
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  function handleChange(value: string) {
    setQuery(value);
    // When the user free-types, clear the captured coords and notify parent with null coords
    latRef.current = null;
    lonRef.current = null;
    onSelect(value, null, null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 250);
  }

  function commit(result: GeocodeResult) {
    setQuery(result.label);
    latRef.current = result.lat;
    lonRef.current = result.lon;
    onSelect(result.label, result.lat, result.lon);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        break;
      case "Enter":
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          e.preventDefault();
          commit(suggestions[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      <label htmlFor={inputId} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-item-${activeIndex}` : undefined
          }
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={INPUT_BASE}
        />

        {loading && (
          <span
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          >
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-500" />
          </span>
        )}

        {open && suggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Location suggestions"
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
          >
            {suggestions.map((result, index) => (
              <li
                key={`${result.lat}-${result.lon}-${index}`}
                id={`${listboxId}-item-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={[
                  "flex min-h-11 cursor-pointer items-center px-3 py-2.5 text-sm",
                  index === activeIndex
                    ? "bg-indigo-50 text-indigo-900"
                    : "text-zinc-800 hover:bg-zinc-50",
                ].join(" ")}
                onPointerDown={(e) => {
                  e.preventDefault();
                  commit(result);
                }}
              >
                {result.label}
              </li>
            ))}
          </ul>
        )}

        {open && !loading && suggestions.length === 0 && query.trim().length >= 2 && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-500 shadow-lg">
            No suggestions — free-typed text will be saved as-is.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// BookingForm
// ---------------------------------------------------------------------------

export interface BookingFormProps {
  tripId: string;
  /**
   * Legacy prop kept for wrapper compatibility. The form now self-loads its
   * lists from GET /api/trips/[id]/logistics, so this value is ignored.
   */
  initialBooking?: Booking | null;
  /**
   * Called after logistics are saved AND itinerary generation should proceed.
   * Required when used in State 2 (pre-itinerary).
   * Omit when used in State 3 (post-itinerary) — use onSaveOnly instead.
   */
  onSaveAndGenerate?: () => void;
  /**
   * Called when the user wants to skip logistics entry and generate directly.
   * Required when used in State 2 (pre-itinerary).
   */
  onSkip?: () => void;
  /**
   * Called after logistics are saved without triggering generation.
   * Used in State 3 (post-itinerary) where the user may save without
   * regenerating. When provided, renders a "Save bookings" primary action
   * instead of "Save & generate itinerary".
   */
  onSaveOnly?: () => void;
  /**
   * Called after logistics are saved (or skipped) in the pre-brief step.
   * When provided, the primary action reads "Continue to consultation" and the
   * secondary action reads "Skip for now". Distinct from onSaveAndGenerate so
   * existing State 2 usages are not affected.
   */
  onContinueToConsult?: () => void;
  /**
   * Called when the user wants to skip logistics entry in the pre-brief step.
   * Companion to onContinueToConsult. Used only when mode === "preplan".
   */
  onSkipToConsult?: () => void;
}

export function BookingForm({
  tripId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  initialBooking,
  onSaveAndGenerate,
  onSkip,
  onSaveOnly,
  onContinueToConsult,
  onSkipToConsult,
}: BookingFormProps) {
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [stays, setStays] = useState<AccommodationRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Load existing logistics on mount ----
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/trips/${tripId}/logistics`, {
          cache: "no-store",
        });
        if (!res.ok) {
          // Non-fatal: start with empty lists.
          if (!cancelled) setLoading(false);
          return;
        }
        const data = (await res.json()) as LogisticsResponseBody;
        if (cancelled) return;
        setFlights(
          data.flights.map((f) => ({
            key: nextKey("flight"),
            from_airport: f.from_airport ?? "",
            to_airport: f.to_airport ?? "",
            depart_date: f.depart_date ?? "",
            depart_time: f.depart_time ?? "",
          }))
        );
        setStays(
          data.accommodations.map((a) => ({
            key: nextKey("stay"),
            name: a.name ?? "",
            neighborhood: a.neighborhood ?? "",
            lat: a.lat,
            lon: a.lon,
            check_in: a.check_in ?? "",
            check_out: a.check_out ?? "",
          }))
        );
      } catch {
        // Non-fatal: start with empty lists.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  // ---- Flight row mutators ----
  function updateFlight(key: string, patch: Partial<FlightRow>) {
    setFlights((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  }
  function addFlight() {
    setFlights((rows) => [...rows, emptyFlightRow()]);
  }
  function removeFlight(key: string) {
    setFlights((rows) => rows.filter((r) => r.key !== key));
  }

  // ---- Accommodation row mutators ----
  function updateStay(key: string, patch: Partial<AccommodationRow>) {
    setStays((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  }
  function addStay() {
    setStays((rows) => [...rows, emptyAccommodationRow()]);
  }
  function removeStay(key: string) {
    setStays((rows) => rows.filter((r) => r.key !== key));
  }

  // ---- Save ----
  async function saveLogistics(): Promise<boolean> {
    setSaving(true);
    setError(null);

    const flightPayload: FlightInput[] = flights.map((f) => ({
      from_airport: f.from_airport || null,
      to_airport: f.to_airport || null,
      depart_date: f.depart_date || null,
      depart_time: f.depart_time || null,
    }));
    const stayPayload: AccommodationInput[] = stays.map((a) => ({
      name: a.name || null,
      neighborhood: a.neighborhood || null,
      lat: a.lat,
      lon: a.lon,
      check_in: a.check_in || null,
      check_out: a.check_out || null,
    }));

    try {
      const res = await fetch(`/api/trips/${tripId}/logistics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flights: flightPayload,
          accommodations: stayPayload,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as LogisticsErrorBody;
        setError(err.error ?? "Failed to save. Please try again.");
        return false;
      }

      // Re-sync local rows with the server's canonical response so subsequent
      // saves replace cleanly.
      const data = (await res.json()) as LogisticsResponseBody;
      setFlights(
        data.flights.map((f) => ({
          key: nextKey("flight"),
          from_airport: f.from_airport ?? "",
          to_airport: f.to_airport ?? "",
          depart_date: f.depart_date ?? "",
          depart_time: f.depart_time ?? "",
        }))
      );
      setStays(
        data.accommodations.map((a) => ({
          key: nextKey("stay"),
          name: a.name ?? "",
          neighborhood: a.neighborhood ?? "",
          lat: a.lat,
          lon: a.lon,
          check_in: a.check_in ?? "",
          check_out: a.check_out ?? "",
        }))
      );
      return true;
    } catch {
      setError("Network error. Please check your connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndGenerate() {
    const ok = await saveLogistics();
    if (ok) onSaveAndGenerate?.();
  }

  async function handleSaveOnly() {
    const ok = await saveLogistics();
    if (ok) onSaveOnly?.();
  }

  async function handleSaveAndContinueToConsult() {
    const ok = await saveLogistics();
    if (ok) onContinueToConsult?.();
  }

  // Determine which action mode is active:
  //   "preplan"  — Pre-brief logistics step: "Continue to consultation" + "Skip for now"
  //   "generate" — State 2 (pre-itinerary): "Save & generate" + "Skip"
  //   "save"     — State 3 (post-itinerary): "Save bookings" only
  const mode: "preplan" | "generate" | "save" = onContinueToConsult
    ? "preplan"
    : onSaveOnly
    ? "save"
    : "generate";

  return (
    <div className="flex flex-col gap-6">
      {/* ---- Flights section ---- */}
      <div className="flex flex-col gap-4">
        <SectionHeading>Flights</SectionHeading>
        <p className="text-xs text-zinc-500 -mt-2">
          Add each flight in your trip. Your travel times let us plan around
          your actual schedule. All optional.
        </p>

        {flights.length === 0 && (
          <p className="text-sm text-zinc-400">No flights added yet.</p>
        )}

        {flights.map((flight, index) => (
          <div
            key={flight.key}
            className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Flight {index + 1}
              </span>
              <button
                type="button"
                onClick={() => removeFlight(flight.key)}
                disabled={saving}
                className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PlaceAutocomplete
                label="From airport"
                placeholder="Airport code or name, e.g. JFK, Santa Fe"
                endpoint="/api/airports"
                defaultValue={flight.from_airport}
                onSelect={(labelText) =>
                  updateFlight(flight.key, { from_airport: labelText })
                }
              />
              <PlaceAutocomplete
                label="To airport"
                placeholder="Airport code or name, e.g. SAF, ABQ"
                endpoint="/api/airports"
                defaultValue={flight.to_airport}
                onSelect={(labelText) =>
                  updateFlight(flight.key, { to_airport: labelText })
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Departure date"
                type="date"
                value={flight.depart_date}
                onChange={(e) =>
                  updateFlight(flight.key, { depart_date: e.target.value })
                }
                placeholder="YYYY-MM-DD"
              />
              <Input
                label="Departure time"
                type="time"
                value={flight.depart_time}
                onChange={(e) =>
                  updateFlight(flight.key, { depart_time: e.target.value })
                }
              />
            </div>
          </div>
        ))}

        <div>
          <Button
            variant="secondary"
            size="md"
            onClick={addFlight}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            + Add flight
          </Button>
        </div>
      </div>

      {/* ---- Accommodations section ---- */}
      <div className="flex flex-col gap-4">
        <SectionHeading>Accommodations</SectionHeading>
        <p className="text-xs text-zinc-500 -mt-2">
          Add each place you&apos;re staying. Lodging locations help us cluster
          activities nearby and factor in transit. All optional.
        </p>

        {stays.length === 0 && (
          <p className="text-sm text-zinc-400">No accommodations added yet.</p>
        )}

        {stays.map((stay, index) => (
          <div
            key={stay.key}
            className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Stay {index + 1}
              </span>
              <button
                type="button"
                onClick={() => removeStay(stay.key)}
                disabled={saving}
                className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            </div>

            <Input
              label="Property name"
              type="text"
              value={stay.name}
              onChange={(e) => updateStay(stay.key, { name: e.target.value })}
              placeholder="Hotel, Airbnb, hostel name…"
            />

            <PlaceAutocomplete
              label="Location"
              placeholder="Neighborhood, district, or address"
              defaultValue={stay.neighborhood}
              defaultLat={stay.lat}
              defaultLon={stay.lon}
              onSelect={(labelText, lat, lon) =>
                updateStay(stay.key, {
                  neighborhood: labelText,
                  lat,
                  lon,
                })
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Check-in date"
                type="date"
                value={stay.check_in}
                onChange={(e) =>
                  updateStay(stay.key, { check_in: e.target.value })
                }
              />
              <Input
                label="Check-out date"
                type="date"
                value={stay.check_out}
                onChange={(e) =>
                  updateStay(stay.key, { check_out: e.target.value })
                }
              />
            </div>
          </div>
        ))}

        <div>
          <Button
            variant="secondary"
            size="md"
            onClick={addStay}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            + Add stay
          </Button>
        </div>
      </div>

      {/* ---- Error message ---- */}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* ---- Actions ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {mode === "preplan" ? (
          <>
            <Button
              variant="primary"
              size="lg"
              loading={saving}
              disabled={loading}
              onClick={handleSaveAndContinueToConsult}
              className="w-full sm:w-auto"
            >
              {saving ? "Saving…" : "Continue to consultation"}
            </Button>

            <Button
              variant="ghost"
              size="lg"
              disabled={saving}
              onClick={onSkipToConsult}
              className="w-full sm:w-auto text-zinc-500"
            >
              Skip for now
            </Button>
          </>
        ) : mode === "generate" ? (
          <>
            <Button
              variant="primary"
              size="lg"
              loading={saving}
              disabled={loading}
              onClick={handleSaveAndGenerate}
              className="w-full sm:w-auto"
            >
              {saving ? "Saving…" : "Save & generate itinerary"}
            </Button>

            <Button
              variant="ghost"
              size="lg"
              disabled={saving}
              onClick={onSkip}
              className="w-full sm:w-auto text-zinc-500"
            >
              Skip — generate without bookings
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="lg"
            loading={saving}
            disabled={loading}
            onClick={handleSaveOnly}
            className="w-full sm:w-auto"
          >
            {saving ? "Saving…" : "Save bookings"}
          </Button>
        )}
      </div>
    </div>
  );
}
