import { ArrowRightIcon } from "@/components/ui/Icons";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { IS_MOCK } from "@/lib/mock/flag";
import { Wordmark } from "@/components/Brand";
import { TripCover } from "@/components/TripCover";
import { TYPE_META, TypeIcon } from "@/components/itinerary/activity-types";
import type { ActivityType } from "@/lib/types";

/**
 * Root route.
 *
 * Signed-in visitors still go straight to /dashboard. Everyone else (and the
 * always-signed-in demo) gets a one-screen introduction, so a first-time
 * visitor sees what the product is before being asked for anything.
 * Guards Supabase env access so build succeeds without real credentials.
 */
export default async function Home() {
  let isAuthenticated = false;
  try {
    const user = await getUser();
    isAuthenticated = user !== null;
  } catch {
    // Supabase not configured — treat as signed out
  }

  if (isAuthenticated && !IS_MOCK) {
    redirect("/dashboard");
  }

  return <Landing demo={IS_MOCK} />;
}

// ---------------------------------------------------------------------------

const SAMPLE_STOPS: {
  time: string;
  period: string;
  name: string;
  place: string;
  type: ActivityType;
  cost: string;
  lock?: boolean;
}[] = [
  { time: "9:30", period: "AM", name: "Naoussa Village Exploration", place: "Naoussa", type: "culture", cost: "$0" },
  { time: "12:00", period: "PM", name: "Kolimbithres Beach", place: "Kolimbithres", type: "outdoor", cost: "$60" },
  { time: "2:30", period: "PM", name: "Lunch at Beach Taverna", place: "Kolimbithres", type: "food", cost: "$90", lock: true },
];

function PlanPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-md"
      role="img"
      aria-label="Preview of a day-by-day itinerary: Day 2 in Paros with three timed stops"
    >
      <div className="absolute -inset-3 -z-10 rotate-2 rounded-[2rem] bg-brand-100/70" aria-hidden="true" />
      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lift" aria-hidden="true">
        <div className="relative h-28">
          <TripCover seed="Paros Greece" stops={2} compact />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-3 left-4 text-white">
            <p className="flex items-center gap-2 font-display text-2xl font-bold leading-none">Paros <ArrowRightIcon className="h-5 w-5" /> Athens</p>
            <p className="mt-1 text-xs font-medium text-white/85">6 days, sample itinerary</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-b border-line bg-paper/60 px-4 py-3">
          <span className="flex h-10 w-10 flex-col items-center justify-center rounded-xl bg-brand-700 text-white">
            <span className="text-[10px] font-semibold uppercase leading-none tracking-wider text-brand-100">Day</span>
            <span className="font-display text-lg font-bold leading-none">2</span>
          </span>
          <div>
            <p className="font-display text-base font-semibold leading-tight text-ink">Tuesday, Aug 25</p>
            <p className="text-xs text-zinc-600">3 stops</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1.5 text-xs font-semibold text-violet-800">
            Revise day
          </span>
        </div>
        <ul className="relative flex flex-col gap-2.5 p-4">
          <span className="absolute bottom-9 left-[4.55rem] top-9 w-px bg-line-strong" />
          {SAMPLE_STOPS.map((s) => (
            <li key={s.name} className="relative flex items-start gap-3">
              <span className="w-10 shrink-0 pt-2.5 text-right leading-none tabular-nums text-zinc-800">
                <span className="block text-[13px] font-semibold">{s.time}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-zinc-600">{s.period}</span>
              </span>
              <span className={["relative z-10 mt-3 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-surface", TYPE_META[s.type].dot].join(" ")} />
              <div className={["min-w-0 flex-1 rounded-xl border p-2.5", s.lock ? "border-brand-300 bg-brand-50/60" : "border-line bg-paper/70"].join(" ")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug text-ink">{s.name}</p>
                  <span className={["inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", TYPE_META[s.type].chip].join(" ")}>
                    <TypeIcon type={s.type} className="h-3 w-3" />
                    {TYPE_META[s.type].label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-600">
                  {s.place} · {s.cost}
                  {s.lock ? " · Locked in place" : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const FEATURES: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Talk it through",
    body: "A short chat about your budget, pace and tastes, so the plan starts from you rather than a template.",
    icon: <path d="M4 5h16v11H9l-5 4V5Z" />,
  },
  {
    title: "Reshape anything",
    body: "Revise a day or a single stop with AI, lock what you love, drag the rest into a new order.",
    icon: (
      <>
        <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3Z" />
        <path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" />
      </>
    ),
  },
  {
    title: "See what is covered",
    body: "Each destination guide shows which highlights your plan already includes, so you can tick the ones you want and rebuild.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 3 3 5-6" />
      </>
    ),
  },
];

function Landing({ demo }: { demo: boolean }) {
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip bg-paper">
      {demo && (
        <aside aria-label="Demo mode" className="bg-brand-900 px-4 py-2 text-center text-xs text-brand-50">
          <span className="mr-2 rounded-full bg-sun-700 px-2 py-0.5 text-[11px] font-bold text-white">
            Demo mode
          </span>
          Sample data, no account needed. Nothing calls an external API.
        </aside>
      )}

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Wordmark />
        {!demo && (
          <nav aria-label="Account" className="flex items-center gap-1">
            <Link href="/login" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-zinc-700 hover:bg-paper-2">
              Sign in
            </Link>
            <Link href="/signup" className="inline-flex min-h-11 items-center rounded-full bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800">
              Create account
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-14 pt-6 sm:px-6 sm:pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-20">
          <div>
            <h1 className="text-[2.6rem] font-bold leading-[1.02] text-ink sm:text-6xl lg:text-[4.25rem]">
              A trip plan that sounds like <em className="text-brand-700">you</em>, and like the place.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-700">
              Tell the planner where and when. It asks about your style, drafts a
              day-by-day itinerary {demo ? "from sample local tips" : "using local tips and mapped venues"},
              and lets you revise, lock or reorder any part of it.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {demo ? (
                <>
                  <Link href="/dashboard" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-700 px-7 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-800">
                    Explore the demo
                    <ArrowRightIcon className="ml-2 h-4 w-4" />
                  </Link>
                  <Link href="/trips/52979ee0-af40-4777-93b6-6f9f707559f7" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line-strong bg-surface px-6 text-base font-semibold text-zinc-800 transition-colors hover:bg-paper-2">
                    Open the sample Greece trip
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/signup" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-700 px-7 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-800">
                    Start planning
                    <ArrowRightIcon className="ml-2 h-4 w-4" />
                  </Link>
                  <Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line-strong bg-surface px-6 text-base font-semibold text-zinc-800 transition-colors hover:bg-paper-2">
                    Sign in
                  </Link>
                </>
              )}
            </div>
            {demo && (
              <p className="mt-3 text-sm text-zinc-600">
                The demo runs entirely on sample data. Changes reset when the server restarts.
              </p>
            )}
          </div>

          <PlanPreview />
        </section>

        <section aria-label="What you can do" className="border-t border-line bg-paper-2/60">
          <ul className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-3 md:gap-8">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-700 ring-1 ring-line" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {f.icon}
                  </svg>
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">{f.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-700">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
