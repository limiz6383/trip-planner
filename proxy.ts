/**
 * Next.js proxy (called `middleware` before Next 16) — runs on every matching request before the page renders.
 *
 * Responsibilities:
 *   1. Refreshes the Supabase session (rotates the access token if needed).
 *   2. Redirects unauthenticated users away from protected routes to /login.
 *   3. Redirects authenticated users away from /login and /signup to /dashboard.
 *
 * Protected routes: everything under /dashboard and /trips.
 * Public routes: /, /login, /signup, /auth/callback.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { IS_MOCK } from "@/lib/mock/flag";

export async function proxy(request: NextRequest) {
  // Demo mode has no session to refresh and no auth service to reach. Checked
  // before the env-var guard below, because a developer running the demo on
  // their own machine still has a populated .env.local.
  if (IS_MOCK) {
    const { pathname } = request.nextUrl;
    // The demo is always authenticated, so the login/signup pages would be a
    // dead end — send visitors straight into the product.
    if (pathname === "/login" || pathname === "/signup") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env vars are missing (e.g. CI with no .env.local) allow the request
  // through so the build does not fail — the page itself will throw a
  // descriptive error when a Supabase client is actually needed.
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the session — this is the primary purpose of the proxy for Supabase SSR.
  // getUser() re-validates the JWT with Supabase Auth server on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Auth routes: redirect authenticated users away from login/signup
  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protected routes: redirect unauthenticated users to login
  const isProtectedRoute =
    pathname.startsWith("/dashboard") || pathname.startsWith("/trips");
  if (isProtectedRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *   - _next/static  (static files)
     *   - _next/image   (image optimisation)
     *   - favicon.ico   (browser default)
     *   - public/       (public assets)
     *   - auth/callback (must be reachable unauthenticated for magic-link)
     */
    "/((?!_next/static|_next/image|favicon.ico|public/|auth/callback).*)",
  ],
};
