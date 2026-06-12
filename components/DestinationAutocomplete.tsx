"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  KeyboardEvent,
  useId,
} from "react";
import type { GeocodeResult } from "@/app/api/geocode/route";

interface DestinationAutocompleteProps {
  /** Initial value for the field (e.g. when editing an existing trip). */
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  /** Field label (default "Destination"). */
  label?: string;
  /** Show the label (default true). */
  showLabel?: boolean;
  /** Hidden input name for plain-form submission; pass null when controlled. */
  name?: string | null;
  /** Controlled value — when provided with onValueChange, parent owns the value. */
  value?: string;
  onValueChange?: (label: string) => void;
}

// Input field classes mirroring components/ui/Input.tsx exactly.
const INPUT_BASE =
  "w-full rounded-lg border px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent " +
  "disabled:bg-zinc-50 disabled:text-zinc-500 disabled:cursor-not-allowed " +
  "border-zinc-300 bg-white";

export function DestinationAutocomplete({
  defaultValue = "",
  required,
  placeholder,
  label = "Destination",
  showLabel = true,
  name = "destination",
  value,
  onValueChange,
}: DestinationAutocompleteProps) {
  const inputId = useId();
  const listboxId = useId();

  const controlled = onValueChange !== undefined;

  // The visible text the user is typing.
  const [query, setQuery] = useState(controlled ? value ?? "" : defaultValue);
  // The committed value that goes into the hidden form field (uncontrolled mode).
  const [committed, setCommitted] = useState(defaultValue);

  // Controlled: sync internal query when the parent's value changes.
  const [prevValue, setPrevValue] = useState(value);
  if (controlled && value !== prevValue) {
    setPrevValue(value);
    setQuery(value ?? "");
  }

  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions with debounce.
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/geocode?q=${encodeURIComponent(q)}`,
        { cache: "no-store" }
      );
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

  // When the user types, update the visible query and schedule a fetch.
  // The committed value tracks the typed text until the user picks a suggestion.
  function handleChange(v: string) {
    setQuery(v);
    if (controlled) onValueChange!(v);
    else setCommitted(v); // free-typed value is always valid for submission

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(v);
    }, 250);
  }

  // Commit a specific suggestion.
  function commit(result: GeocodeResult) {
    setQuery(result.label);
    if (controlled) onValueChange!(result.label);
    else setCommitted(result.label);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  // Keyboard navigation.
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
          e.preventDefault(); // prevent form submit while list is open
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

  // Close dropdown when clicking outside.
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

  // Cleanup debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      {showLabel && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-zinc-700"
        >
          {label}
          {required && <span className="sr-only"> (required)</span>}
        </label>
      )}

      <div className="relative">
        {/* Visible text input — drives the autocomplete UI */}
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

        {/* Hidden input for plain-form submission (uncontrolled mode only) */}
        {name && !controlled && (
          <input type="hidden" name={name} required={required} value={committed} />
        )}

        {/* Loading indicator — subtle spinner inside the right edge */}
        {loading && (
          <span
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          >
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-500" />
          </span>
        )}

        {/* Suggestions dropdown */}
        {open && suggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Destination suggestions"
            className={[
              "absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200",
              "bg-white shadow-lg",
            ].join(" ")}
          >
            {suggestions.map((result, index) => (
              <li
                key={`${result.lat}-${result.lon}-${index}`}
                id={`${listboxId}-item-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // min-h-11 gives ~44px tap targets on mobile
                className={[
                  "flex min-h-11 cursor-pointer items-center px-3 py-2.5 text-sm",
                  index === activeIndex
                    ? "bg-indigo-50 text-indigo-900"
                    : "text-zinc-800 hover:bg-zinc-50",
                ].join(" ")}
                // onPointerDown instead of onClick prevents the blur-then-click
                // race condition that would close the list before the click fires.
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

        {/* "No results" hint — only shown when we finished loading with nothing */}
        {open && !loading && suggestions.length === 0 && query.trim().length >= 2 && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-500 shadow-lg">
            No suggestions found — you can still type any destination.
          </div>
        )}
      </div>
    </div>
  );
}
