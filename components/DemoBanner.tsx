import { IS_MOCK } from "@/lib/mock/flag";

/**
 * Demo-mode notice. Renders nothing in normal operation.
 *
 * Sets expectations up front: everything is explorable, nothing is billed,
 * and changes are not persisted.
 */
export function DemoBanner() {
  if (!IS_MOCK) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
      <span className="font-semibold">Demo mode</span> — sample data, no account
      needed. Itineraries are generated from fixtures, so nothing calls an
      external API and changes reset when the server restarts.
    </div>
  );
}
