/**
 * GET /api/keepalive
 *
 * Keeps the Supabase project from being paused. Free-plan projects are paused
 * after 7 days with no database activity, so a Vercel Cron (see vercel.json)
 * calls this once a day and it runs one real, tiny query against Postgres.
 *
 * - Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Any other
 *   caller gets 401, so the endpoint cannot be used to hammer the database.
 * - Demo mode: there is no database to keep awake, so it reports "skipped".
 * - It must hit Postgres (not just Auth): pausing is judged on database
 *   activity. A `head` count on `trips` touches the table without returning rows.
 */

import type { NextRequest } from "next/server";
import { IS_MOCK } from "@/lib/mock/flag";
import { createSupabaseServiceClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (IS_MOCK) {
    return Response.json({ ok: true, skipped: "demo mode has no database" });
  }

  const supabase = createSupabaseServiceClient();
  const { count, error } = await supabase
    .from("trips")
    .select("id", { count: "exact", head: true });

  if (error) {
    // A 500 shows up as a failed run in Vercel's Cron Jobs tab.
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, trips: count, at: new Date().toISOString() });
}
