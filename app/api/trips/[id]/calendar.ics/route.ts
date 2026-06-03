/**
 * GET /api/trips/[id]/calendar.ics?token=...
 *
 * PUBLIC, auth-free calendar feed for subscribe-by-URL (Google Calendar "From
 * URL", Apple Calendar, Outlook). Authorized by the per-trip HMAC token, not a
 * login, so calendar clients can poll it. Returns the current itinerary as a
 * live .ics — re-fetched by the client periodically, so edits show up.
 *
 * 403 on a missing/invalid token. Uses the service-role client (no user
 * session on a subscribe request); the token is the authorization.
 */

import type { NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/db/server";
import { verifyCalendarToken } from "@/lib/calendar-token";
import { getTripById, getCurrentItineraryHydrated } from "@/lib/db/queries";
import { buildICS } from "@/lib/ics";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "trip"
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await params;
  const token = request.nextUrl.searchParams.get("token") ?? "";

  if (!tripId || !verifyCalendarToken(tripId, token)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const supabase = createSupabaseServiceClient();
    const [trip, itinerary] = await Promise.all([
      getTripById(supabase, tripId),
      getCurrentItineraryHydrated(supabase, tripId),
    ]);

    if (!trip) {
      return new Response("Not found", { status: 404 });
    }

    const title = trip.title?.trim() || "Trip itinerary";
    const ics = buildICS(itinerary?.days ?? [], title);

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${slugify(title)}.ics"`,
        // Calendar clients poll periodically; let them cache briefly.
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("Failed to build calendar feed", { status: 500 });
  }
}
