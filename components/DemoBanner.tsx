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
    <div className="bg-brand-900 px-4 py-2 text-xs text-brand-50">
      <p className="mx-auto flex max-w-6xl items-center justify-center gap-2.5 text-center leading-snug sm:text-[13px]">
        <span className="shrink-0 rounded-full bg-sun-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Demo mode
        </span>
        <span className="sm:hidden">Sample data, no account needed. Changes reset on restart.</span>
        <span className="hidden sm:inline">
          Sample data, no account needed. Itineraries are generated from
          fixtures, so nothing calls an external API and changes reset when the
          server restarts.
        </span>
      </p>
    </div>
  );
}
