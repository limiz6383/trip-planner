/**
 * GET /api/trips/[id]/changelog
 *
 * Returns the change log entries for a trip, newest first.
 * Auth-gated. RLS ensures only the trip owner / collaborators can read.
 *
 * Response (200):
 *   { entries: ChangeLogEntry[] }
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: "Missing trip id" }
 *   500  { error: string }
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getChangeLogForTrip } from "@/lib/db/queries";
import type { ChangeLogEntry } from "@/lib/types";

// ---- response shapes ----

export interface GetChangelogResponseBody {
  entries: ChangeLogEntry[];
}

export interface GetChangelogErrorBody {
  error: string;
}

// ---- handler ----

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" } satisfies GetChangelogErrorBody, { status: 401 });
  }

  const { id: tripId } = await params;

  if (!tripId) {
    return Response.json({ error: "Missing trip id" } satisfies GetChangelogErrorBody, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const entries = await getChangeLogForTrip(supabase, tripId);

    const responseBody: GetChangelogResponseBody = { entries };
    return Response.json(responseBody, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch change log.";
    return Response.json({ error: message } satisfies GetChangelogErrorBody, { status: 500 });
  }
}
