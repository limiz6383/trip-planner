/**
 * Server-side auth helpers.
 *
 * Use these in Server Components, Route Handlers, and Server Actions.
 * Never import from Client Components.
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { IS_MOCK, DEMO_USER_ID, DEMO_USER_EMAIL } from "@/lib/mock/flag";
import type { User } from "@supabase/supabase-js";

/** Signed-in identity used for the whole demo session. */
const DEMO_USER = {
  id: DEMO_USER_ID,
  email: DEMO_USER_EMAIL,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: { full_name: "Demo Traveller" },
  created_at: "2026-01-01T00:00:00.000Z",
} as unknown as User;

/**
 * Returns the currently authenticated Supabase user, or null if not signed in.
 * Does NOT redirect — use requireUser() for protected pages.
 */
export async function getUser(): Promise<User | null> {
  // Demo mode is always "signed in" — there is no auth service to ask, and a
  // recruiter should land in the product rather than on a login wall.
  if (IS_MOCK) return DEMO_USER;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the currently authenticated user.
 * Redirects to /login if not authenticated.
 *
 * Use this at the top of every protected Server Component / page.
 */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
