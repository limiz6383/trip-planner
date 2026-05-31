/**
 * Server-side auth helpers.
 *
 * Use these in Server Components, Route Handlers, and Server Actions.
 * Never import from Client Components.
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { User } from "@supabase/supabase-js";

/**
 * Returns the currently authenticated Supabase user, or null if not signed in.
 * Does NOT redirect — use requireUser() for protected pages.
 */
export async function getUser(): Promise<User | null> {
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
