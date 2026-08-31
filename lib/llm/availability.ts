import { IS_MOCK } from "@/lib/mock/flag";

/**
 * Whether itinerary generation can run.
 *
 * Route handlers guard on this so a missing key fails with a clear message
 * rather than a crash. Demo mode is always available — the mock provider needs
 * no key, so the absence of one is not an error there.
 */
export function isLLMConfigured(): boolean {
  return IS_MOCK || Boolean(process.env.ANTHROPIC_API_KEY);
}
