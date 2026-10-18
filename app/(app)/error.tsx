"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary for the signed-in app. Keeps the nav, says what happened in
 * plain words and offers a retry (Next 16: `unstable_retry`, not `reset`).
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-3xl font-bold text-ink">Something went wrong</h1>
      <p className="text-zinc-700">
        We couldn&apos;t load this page. Nothing you saved was lost. Try again,
        or go back to your trips.
      </p>
      {error.digest ? (
        <p className="text-xs text-zinc-600">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-5 text-sm font-medium text-zinc-800 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          My Trips
        </Link>
      </div>
    </div>
  );
}
