"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser (client-side) Supabase client.
 *
 * Safe to call from Client Components. Uses the public anon key which is
 * protected by Row-Level Security on every table.
 *
 * Call once per component tree; do NOT call it at module-level so that
 * Next.js can tree-shake it in Server Components.
 */
export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.local.example to .env.local and fill in the values."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
