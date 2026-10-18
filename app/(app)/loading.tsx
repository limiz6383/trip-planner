/** Instant skeleton while a signed-in page streams in. */
export default function AppLoading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse">
      <div className="mb-6 h-64 rounded-3xl bg-paper-2 sm:h-72" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-32 rounded-2xl bg-paper-2" />
        <div className="h-32 rounded-2xl bg-paper-2" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
