import Link from "next/link";

/** Shown inside the app shell when a trip (or other record) doesn't exist or isn't yours. */
export default function AppNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-3xl font-bold text-ink">We couldn&apos;t find that trip</h1>
      <p className="text-zinc-700">
        It may have been deleted, or the link is wrong. Your other trips are
        still where you left them.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        Back to My Trips
      </Link>
    </div>
  );
}
