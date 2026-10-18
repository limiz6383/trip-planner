/** Logo mark: a looping dotted route ending in a pin. Inline SVG, no assets. */
export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--color-brand-700)" />
      <path
        d="M7 22c3-8 7 1 10-6s4-3 7-6"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.85"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="0.5 3.4"
      />
      <circle cx="7" cy="22" r="2.2" fill="#fff" />
      <circle cx="24.5" cy="9.5" r="3.6" fill="var(--color-sun-500)" />
      <circle cx="24.5" cy="9.5" r="1.3" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={["flex items-center gap-2.5", className].join(" ")}>
      <BrandMark />
      <span className="font-display text-lg font-bold tracking-tight text-ink">
        Trip Planner
      </span>
    </span>
  );
}
