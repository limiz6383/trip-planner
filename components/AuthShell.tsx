import Link from "next/link";
import { Wordmark } from "@/components/Brand";

/** Shared frame for sign-in / sign-up: brand, a calm card, and a way home. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-paper px-4 py-10">
      <div
        className="paper-grain pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <Link href="/" className="relative mb-8 rounded-lg" aria-label="Trip Planner home">
        <Wordmark />
      </Link>
      <div className="relative w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-lift sm:p-8">
        {children}
      </div>
    </main>
  );
}
