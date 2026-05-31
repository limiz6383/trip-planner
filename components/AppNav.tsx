"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";

export function AppNav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        {/* Logo / home link */}
        <Link
          href="/dashboard"
          className="text-base font-semibold text-zinc-900 hover:text-indigo-600 transition-colors"
        >
          Trip Planner
        </Link>

        {/* Nav links — visible on wider screens */}
        <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
          <Link
            href="/dashboard"
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              pathname === "/dashboard" || pathname.startsWith("/dashboard")
                ? "bg-indigo-50 text-indigo-700"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
            ].join(" ")}
          >
            My Trips
          </Link>
          <Link
            href="/trips/new"
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              pathname === "/trips/new"
                ? "bg-indigo-50 text-indigo-700"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
            ].join(" ")}
          >
            New Trip
          </Link>
        </nav>

        {/* User + sign out */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-xs text-zinc-400 truncate max-w-[140px]">
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
  );
}
