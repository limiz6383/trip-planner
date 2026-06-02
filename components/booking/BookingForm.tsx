"use client";

/**
 * BookingForm
 *
 * Mobile-first form to capture flight and accommodation details before itinerary
 * generation. All fields are optional — the user may not have everything booked.
 *
 * On submit it POSTs to /api/trips/[id]/booking, then:
 *   - "Save & generate itinerary" calls onSaveAndGenerate after a successful save
 *   - "Skip — generate without bookings" calls onSkip directly (no save)
 *
 * Prefills from an existing Booking when one is passed in.
 *
 * Accommodation location reuses the geocode autocomplete pattern so
 * accommodation_lat/lon are captured when a suggestion is picked.
 * Free-typed neighborhood text is also accepted, with null lat/lon.
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
  BookingResponseBody,
  BookingErrorBody,
} from "@/app/api/trips/[id]/booking/route";

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

type BookingFields = Omit<Booking, "booking_id" | "trip_id" | "created_at" | "updated_at">;

// ---------------------------------------------------------------------------
// Accommodation autocomplete
// ---------------------------------------------------------------------------

const INPUT_BASE =
  "w-full rounded-lg border px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent " +
  "disabled:bg-zinc-50 disabled:text-zinc-500 disabled:cursor-not-allowed " +
  "border-zinc-300 bg-white";

interface AccommodationAutocompleteProps {
  defaultValue?: string;
  defaultLat?: number | null;
  defaultLon?: number | null;
  onSelect: (label: string, lat: number | null, lon: number | null) => void;
}

function AccommodationAutocomplete({
  defaultValue = "",
  defaultLat,
  defaultLon,
  onSelect,
}: AccommodationAutocompleteProps) {
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
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
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
  }, []);

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
        Accommodation location
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
          placeholder="Neighborhood, district, or address"
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
  /** Pre-fill from an existing booking record, if one exists. */
  initialBooking?: Booking | null;
  /** Called after booking is saved AND itinerary generation should proceed. */
  onSaveAndGenerate: () => void;
  /** Called when the user wants to skip booking entry and generate directly. */
  onSkip: () => void;
}

export function BookingForm({
  tripId,
  initialBooking,
  onSaveAndGenerate,
  onSkip,
}: BookingFormProps) {
  // Flight fields
  const [flightArrivalDate, setFlightArrivalDate] = useState(
    initialBooking?.flight_arrival_date ?? ""
  );
  const [flightArrivalTime, setFlightArrivalTime] = useState(
    initialBooking?.flight_arrival_time ?? ""
  );
  const [flightDepartureDate, setFlightDepartureDate] = useState(
    initialBooking?.flight_departure_date ?? ""
  );
  const [flightDepartureTime, setFlightDepartureTime] = useState(
    initialBooking?.flight_departure_time ?? ""
  );

  // Accommodation fields
  const [accommodationName, setAccommodationName] = useState(
    initialBooking?.accommodation_name ?? ""
  );
  const [accommodationNeighborhood, setAccommodationNeighborhood] = useState(
    initialBooking?.accommodation_neighborhood ?? ""
  );
  const [accommodationLat, setAccommodationLat] = useState<number | null>(
    initialBooking?.accommodation_lat ?? null
  );
  const [accommodationLon, setAccommodationLon] = useState<number | null>(
    initialBooking?.accommodation_lon ?? null
  );
  const [accommodationCheckIn, setAccommodationCheckIn] = useState(
    initialBooking?.accommodation_check_in ?? ""
  );
  const [accommodationCheckOut, setAccommodationCheckOut] = useState(
    initialBooking?.accommodation_check_out ?? ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLocationSelect(
    label: string,
    lat: number | null,
    lon: number | null
  ) {
    setAccommodationNeighborhood(label);
    setAccommodationLat(lat);
    setAccommodationLon(lon);
  }

  async function saveBooking(): Promise<boolean> {
    setSaving(true);
    setError(null);

    const body: BookingFields = {
      flight_arrival_date: flightArrivalDate || null,
      flight_arrival_time: flightArrivalTime || null,
      flight_departure_date: flightDepartureDate || null,
      flight_departure_time: flightDepartureTime || null,
      accommodation_name: accommodationName || null,
      accommodation_neighborhood: accommodationNeighborhood || null,
      accommodation_lat: accommodationLat,
      accommodation_lon: accommodationLon,
      accommodation_check_in: accommodationCheckIn || null,
      accommodation_check_out: accommodationCheckOut || null,
    };

    try {
      const res = await fetch(`/api/trips/${tripId}/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = (await res.json()) as BookingErrorBody;
        setError(err.error ?? "Failed to save booking. Please try again.");
        return false;
      }

      // Verify shape; discard result — we just need confirmation it saved.
      const _data = (await res.json()) as BookingResponseBody;
      return true;
    } catch {
      setError("Network error. Please check your connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndGenerate() {
    const ok = await saveBooking();
    if (ok) onSaveAndGenerate();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ---- Flight section ---- */}
      <div className="flex flex-col gap-4">
        <SectionHeading>Flight details</SectionHeading>
        <p className="text-xs text-zinc-500 -mt-2">
          Your arrival and departure times let us plan around your actual travel hours.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Arrival date"
            type="date"
            value={flightArrivalDate}
            onChange={(e) => setFlightArrivalDate(e.target.value)}
            placeholder="YYYY-MM-DD"
          />
          <Input
            label="Arrival time"
            type="time"
            value={flightArrivalTime}
            onChange={(e) => setFlightArrivalTime(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Departure date"
            type="date"
            value={flightDepartureDate}
            onChange={(e) => setFlightDepartureDate(e.target.value)}
            placeholder="YYYY-MM-DD"
          />
          <Input
            label="Departure time"
            type="time"
            value={flightDepartureTime}
            onChange={(e) => setFlightDepartureTime(e.target.value)}
          />
        </div>
      </div>

      {/* ---- Accommodation section ---- */}
      <div className="flex flex-col gap-4">
        <SectionHeading>Accommodation</SectionHeading>
        <p className="text-xs text-zinc-500 -mt-2">
          Your lodging location helps us cluster activities nearby and factor in transit.
        </p>

        <Input
          label="Property name"
          type="text"
          value={accommodationName}
          onChange={(e) => setAccommodationName(e.target.value)}
          placeholder="Hotel, Airbnb, hostel name…"
        />

        <AccommodationAutocomplete
          defaultValue={accommodationNeighborhood}
          defaultLat={accommodationLat}
          defaultLon={accommodationLon}
          onSelect={handleLocationSelect}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Check-in date"
            type="date"
            value={accommodationCheckIn}
            onChange={(e) => setAccommodationCheckIn(e.target.value)}
          />
          <Input
            label="Check-out date"
            type="date"
            value={accommodationCheckOut}
            onChange={(e) => setAccommodationCheckOut(e.target.value)}
          />
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
        <Button
          variant="primary"
          size="lg"
          loading={saving}
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
      </div>
    </div>
  );
}
