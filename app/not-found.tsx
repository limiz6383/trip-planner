import Link from "next/link";
import { Wordmark } from "@/components/Brand";

/** Global 404 for URLs that match no route. */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col bg-paper">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-4 sm:px-6">
        <Wordmark />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 pb-24 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">404</p>
        <h1 className="text-3xl font-bold text-ink">This page doesn&apos;t exist</h1>
        <p className="text-zinc-700">Check the address, or head back to your trips.</p>
        <Link
          href="/dashboard"
          className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          Go to My Trips
        </Link>
      </main>
    </div>
  );
}
