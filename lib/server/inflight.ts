/**
 * Best-effort guard against double-submits of expensive model calls (a second
 * click, a second tab). Per server instance only: on a multi-instance deploy it
 * narrows the race rather than closing it (a DB lock would be needed for that).
 */
const running = new Set<string>();

/** Returns a release function, or null when `key` is already running. */
export function tryAcquire(key: string): (() => void) | null {
  if (running.has(key)) return null;
  running.add(key);
  return () => {
    running.delete(key);
  };
}
