/**
 * Demo ("mock") mode flag.
 *
 * When enabled the app runs fully self-contained: no Supabase, no Anthropic,
 * no geocoding service. Every external dependency is served from fixtures so
 * the whole product can be clicked through with no API keys and no signup.
 *
 * NEXT_PUBLIC_ prefix is deliberate — client components read it to render the
 * demo banner. It is a display flag, not a secret.
 */
export const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === "1";

/** Stable identity used for the demo session in place of a real auth user. */
export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_USER_EMAIL = "demo@example.com";
