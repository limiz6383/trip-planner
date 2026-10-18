"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/Brand";

function SuitcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function AppNav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const onTrips = pathname.startsWith("/dashboard") || (pathname.startsWith("/trips") && pathname !== "/trips/new");
  const onNew = pathname === "/trips/new";

  const link = (active: boolean) =>
    [
      "rounded-full px-4 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-brand-700 text-white"
        : "text-zinc-600 hover:bg-paper-2 hover:text-zinc-900",
    ].join(" ");

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href="/dashboard"
            className="rounded-lg focus-visible:outline-2"
            aria-label="Trip Planner home"
          >
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
            <Link href="/dashboard" className={link(onTrips)} aria-current={onTrips ? "page" : undefined}>
              My Trips
            </Link>
            <Link href="/trips/new" className={link(onNew)} aria-current={onNew ? "page" : undefined}>
              New Trip
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden max-w-[160px] truncate text-xs text-zinc-500 md:block">
              {userEmail}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* Mobile tab bar: the desktop links are hidden below sm, so keep both
          destinations one thumb-tap away. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        <Link
          href="/dashboard"
          aria-current={onTrips ? "page" : undefined}
          className={[
            "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
            onTrips ? "text-brand-700" : "text-zinc-500",
          ].join(" ")}
        >
          <SuitcaseIcon />
          My Trips
        </Link>
        <Link
          href="/trips/new"
          aria-current={onNew ? "page" : undefined}
          className={[
            "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
            onNew ? "text-brand-700" : "text-zinc-500",
          ].join(" ")}
        >
          <PlusIcon />
          New Trip
        </Link>
      </nav>
    </>
  );
}
