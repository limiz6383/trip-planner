import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";

// Authenticated routes depend on the user's session (cookies) and must never be
// statically prerendered at build time — doing so would run client code (the
// Supabase browser client) before env vars exist. Force dynamic rendering.
export const dynamic = "force-dynamic";

/**
 * Authenticated app shell layout.
 *
 * Wraps all routes under app/(app)/ — dashboard, trip detail, new trip.
 * Calls requireUser() which redirects unauthenticated visitors to /login.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-svh flex-col bg-zinc-50">
      <AppNav userEmail={user.email ?? ""} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
