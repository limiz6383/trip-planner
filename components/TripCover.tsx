/**
 * Destination-themed cover art, drawn entirely in CSS gradients + inline SVG
 * (no photos, no network). The palette is picked deterministically from the
 * destination so a trip always keeps the same look; coastal/Mediterranean
 * destinations get the "Aegean" palette, everything else is hashed.
 *
 * Purely decorative: aria-hidden, no interactivity, safe in server components.
 */

type Palette = {
  from: string;
  mid: string;
  to: string;
  sun: string;
  hill: string;
};

const PALETTES: Record<string, Palette> = {
  aegean: { from: "#083f57", mid: "#157f93", to: "#e9b36c", sun: "#fbdc9f", hill: "#052f44" },
  dusk: { from: "#2e2354", mid: "#a24a73", to: "#f0a05a", sun: "#ffd9a8", hill: "#1c1438" },
  forest: { from: "#0d3a30", mid: "#2b7656", to: "#d9c47c", sun: "#f4e6ad", hill: "#082a22" },
  clay: { from: "#6d2915", mid: "#c25b33", to: "#f2c48c", sun: "#ffe2b8", hill: "#4a1a0c" },
  alpine: { from: "#10284f", mid: "#386aa8", to: "#bfd9f1", sun: "#fff1cf", hill: "#0a1b38" },
};

const COASTAL = [
  "greece", "athens", "paros", "santorini", "crete", "naxos", "mykonos",
  "italy", "amalfi", "sicily", "croatia", "dubrovnik", "split", "spain",
  "barcelona", "portugal", "lisbon", "malta", "turkey", "cyprus",
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function paletteFor(seed: string): Palette {
  const lower = seed.toLowerCase();
  if (COASTAL.some((k) => lower.includes(k))) return PALETTES.aegean;
  const keys = Object.keys(PALETTES);
  return PALETTES[keys[hash(lower) % keys.length]];
}

/** "Paros Municipality → Athens" -> ["Paros Municipality", "Athens"] */
export function splitStops(destination: string): string[] {
  return destination
    .split(/\s*(?:→|->|→)\s*/)
    .map((s) => s.split(",")[0].trim())
    .filter(Boolean);
}

export function TripCover({
  seed,
  stops = 2,
  compact = false,
  className = "",
}: {
  seed: string;
  /** Number of route pins to draw along the dotted route (1-5). */
  stops?: number;
  compact?: boolean;
  className?: string;
}) {
  const p = paletteFor(seed);
  const n = Math.max(2, Math.min(5, stops));
  // Pins along a gentle arc across the upper half of the artwork.
  const pins = Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = 520 + t * 220;
    const y = 168 - Math.sin(t * Math.PI) * 46 + (i % 2) * 6;
    return { x, y };
  });
  const path = pins
    .map((pt, i) => (i === 0 ? `M${pt.x},${pt.y}` : `S${(pins[i - 1].x + pt.x) / 2},${Math.min(pins[i - 1].y, pt.y) - 40} ${pt.x},${pt.y}`))
    .join(" ");

  return (
    <div
      aria-hidden="true"
      className={["absolute inset-0 overflow-hidden", className].join(" ")}
      style={{
        background: `linear-gradient(165deg, ${p.from} 0%, ${p.mid} 58%, ${p.to} 135%)`,
      }}
    >
      <svg
        viewBox="0 0 800 320"
        preserveAspectRatio="xMaxYMax slice"
        className="absolute inset-0 h-full w-full"
      >
        {/* sun + glow */}
        <circle cx="610" cy="222" r="120" fill={p.sun} opacity="0.12" />
        <circle cx="610" cy="222" r="70" fill={p.sun} opacity="0.2" />
        <circle cx="610" cy="222" r="38" fill={p.sun} opacity="0.95" />
        {/* far + near hills / sea swells */}
        <path
          d="M0 250 C90 210 170 232 260 214 C360 194 430 236 540 224 C650 212 720 190 800 214 L800 320 L0 320 Z"
          fill={p.hill}
          opacity="0.35"
        />
        <path
          d="M0 276 C100 248 190 280 300 262 C410 244 500 286 620 268 C700 256 760 250 800 258 L800 320 L0 320 Z"
          fill={p.hill}
          opacity="0.6"
        />
        {!compact && (
          <>
            {/* dotted route with pins */}
            <path d={path} fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.5" strokeDasharray="2 8" strokeLinecap="round" />
            {pins.map((pt, i) => (
              <g key={i}>
                <circle cx={pt.x} cy={pt.y} r="11" fill="#fff" opacity="0.25" />
                <circle cx={pt.x} cy={pt.y} r="5.5" fill="#fff" />
              </g>
            ))}
          </>
        )}
        {compact &&
          pins.slice(0, 2).map((pt, i) => (
            <circle key={i} cx={i === 0 ? 560 : 700} cy={i === 0 ? 120 : 96} r="5" fill="#fff" opacity="0.9" />
          ))}
      </svg>
    </div>
  );
}

export function RouteChips({
  stops,
  tone = "light",
}: {
  stops: string[];
  tone?: "light" | "dark";
}) {
  const base =
    tone === "light"
      ? "bg-white/15 text-white ring-1 ring-white/25"
      : "bg-paper-2 text-zinc-700 ring-1 ring-line";
  const arrow = tone === "light" ? "text-white/70" : "text-zinc-400";
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Route">
      {stops.map((s, i) => (
        <li key={`${s}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && (
            <span className={arrow} aria-hidden="true">
              &rarr;
            </span>
          )}
          <span className={["rounded-full px-2.5 py-0.5 text-xs font-medium", base].join(" ")}>
            {s}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function formatDateRangeShort(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts = { timeZone: "UTC" } as const;
  const sm = s.toLocaleDateString("en-US", { month: "short", ...opts });
  const em = e.toLocaleDateString("en-US", { month: "short", ...opts });
  const sd = s.toLocaleDateString("en-US", { day: "numeric", ...opts });
  const ed = e.toLocaleDateString("en-US", { day: "numeric", ...opts });
  const sy = s.toLocaleDateString("en-US", { year: "numeric", ...opts });
  const ey = e.toLocaleDateString("en-US", { year: "numeric", ...opts });
  if (sy !== ey) return `${sm} ${sd}, ${sy} – ${em} ${ed}, ${ey}`;
  if (sm === em) return `${sm} ${sd}–${ed}, ${sy}`;
  return `${sm} ${sd} – ${em} ${ed}, ${sy}`;
}

/** Inclusive number of days between two ISO dates (UTC). */
export function tripDays(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}
