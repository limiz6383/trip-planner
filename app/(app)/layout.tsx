import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { DemoBanner } from "@/components/DemoBanner";
import { IS_MOCK } from "@/lib/mock/flag";

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
    <div className="flex min-h-svh flex-col bg-paper">
      <DemoBanner />
      <AppNav userEmail={user.email ?? ""} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pb-12 sm:pt-8">
        {children}
      </main>
      {!IS_MOCK && (
        <footer className="px-4 pb-24 text-center text-xs text-zinc-500 sm:pb-8">
          Place data ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap contributors
          </a>
        </footer>
      )}
    </div>
  );
}
