import type { ActivityType } from "@/lib/types";

/**
 * Single source of truth for how each activity type looks.
 * Colour is always paired with an icon and a text label, never alone.
 * Class strings are written out in full so Tailwind can see them.
 */
export const TYPE_META: Record<
  ActivityType,
  { label: string; dot: string; chip: string; bar: string; ring: string }
> = {
  food: { label: "Food", dot: "bg-t-food", chip: "bg-t-food-bg text-t-food-fg", bar: "bg-t-food", ring: "ring-t-food/40" },
  culture: { label: "Culture", dot: "bg-t-culture", chip: "bg-t-culture-bg text-t-culture-fg", bar: "bg-t-culture", ring: "ring-t-culture/40" },
  outdoor: { label: "Outdoor", dot: "bg-t-outdoor", chip: "bg-t-outdoor-bg text-t-outdoor-fg", bar: "bg-t-outdoor", ring: "ring-t-outdoor/40" },
  shopping: { label: "Shopping", dot: "bg-t-shopping", chip: "bg-t-shopping-bg text-t-shopping-fg", bar: "bg-t-shopping", ring: "ring-t-shopping/40" },
  transport: { label: "Transport", dot: "bg-t-transport", chip: "bg-t-transport-bg text-t-transport-fg", bar: "bg-t-transport", ring: "ring-t-transport/40" },
  accommodation: { label: "Stay", dot: "bg-t-stay", chip: "bg-t-stay-bg text-t-stay-fg", bar: "bg-t-stay", ring: "ring-t-stay/40" },
  entertainment: { label: "Entertainment", dot: "bg-t-fun", chip: "bg-t-fun-bg text-t-fun-fg", bar: "bg-t-fun", ring: "ring-t-fun/40" },
  other: { label: "Other", dot: "bg-t-other", chip: "bg-t-other-bg text-t-other-fg", bar: "bg-t-other", ring: "ring-t-other/40" },
};

const PATHS: Record<ActivityType, React.ReactNode> = {
  food: (
    <>
      <path d="M4 3v6a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V3M7 3v18" />
      <path d="M20 21V3c-2.5 1-4 3.5-4 7v3h4" />
    </>
  ),
  culture: (
    <>
      <path d="M3 21h18M5 18v-7M9.5 18v-7M14.5 18v-7M19 18v-7" />
      <path d="M12 3 3 8h18l-9-5Z" />
    </>
  ),
  outdoor: <path d="m3 20 6-11 4 6 2.5-4L21 20H3Z" />,
  shopping: (
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  transport: (
    <>
      <path d="M4 17V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10H4Z" />
      <path d="M4 12h16M8 20v-3M16 20v-3" />
    </>
  ),
  accommodation: (
    <>
      <path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6" />
      <circle cx="7" cy="11" r="1.6" />
    </>
  ),
  entertainment: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />,
  other: (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
};

export function TypeIcon({
  type,
  className = "h-3.5 w-3.5",
}: {
  type: ActivityType | null;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[type ?? "other"]}
    </svg>
  );
}

export function TypeChip({ type }: { type: ActivityType | null }) {
  const t = type ?? "other";
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        TYPE_META[t].chip,
      ].join(" ")}
    >
      <TypeIcon type={t} />
      {TYPE_META[t].label}
    </span>
  );
}
