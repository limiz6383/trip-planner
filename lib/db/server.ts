import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { IS_MOCK } from "@/lib/mock/flag";

/**
 * Inert stand-in returned in demo mode. The demo query layer ignores its
 * client argument entirely, so this only needs to satisfy the type and fail
 * loudly if anything ever tries to issue a real query through it.
 */
function mockClient() {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        // `await` probes for `.then` to decide whether this is a thenable, and
        // various runtime internals probe for symbols. Report "absent" for
        // those rather than throwing, or awaiting the client itself explodes.
        if (typeof prop === "symbol") return undefined;
        if (prop === "then" || prop === "catch" || prop === "finally") {
          return undefined;
        }
        throw new Error(
          `[demo] Supabase is not available in demo mode (tried to access "${String(prop)}").`
        );
      },
    }
  ) as unknown as ReturnType<typeof createServerClient>;
}

/**
 * Server-side Supabase client using the anon key + cookie-based session.
 *
 * Creates a new client per request — NEVER share across requests.
 * Call this from Server Components, Route Handlers, and Server Actions.
 *
 * The client reads/writes auth cookies via next/headers so that token
 * refreshes are reflected in the response automatically.
 *
 * Guards against missing env vars: if keys are not set the function throws
 * a descriptive error at call time (not at import time), so the build
 * succeeds without real credentials in place.
 */
export async function createSupabaseServerClient() {
  if (IS_MOCK) return mockClient();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.local.example to .env.local and fill in the values."
    );
  }

  const cookieStore = await cookies();

  const client = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _headers) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as any)
          );
        } catch {
          // setAll is called from a Server Component; cookie mutations from
          // Server Components are not supported (only from Route Handlers /
          // Server Actions). The session will be refreshed by the proxy (proxy.ts).
        }
      },
    },
  });

  // Hydrate the auth session from cookies before returning. supabase-js loads
  // the session asynchronously on client init; if a DB query is issued on a
  // fresh client before that completes, the request goes out as the anon role
  // (auth.uid() is null) and trips RLS — e.g. "new row violates row-level
  // security policy". Awaiting getUser() here forces session hydration so every
  // client returned by this helper carries the user's access token.
  await client.auth.getUser();

  return client;
}

/**
 * Service-role Supabase client for privileged server-side operations
 * (e.g., seeding, admin tasks). Bypasses RLS — use with care.
 *
 * Never expose this client to the browser or include it in Client Components.
 */
export function createSupabaseServiceClient() {
  if (IS_MOCK) return mockClient();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "These are required for service-role operations."
    );
  }

  // Service-role client does not need cookie handling
  return createServerClient(supabaseUrl, serviceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // No-op: service-role client does not manage auth cookies
      },
    },
  });
}
