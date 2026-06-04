/**
 * POST /api/trips/[id]/itinerary/chat
 *
 * One conversational turn for the "discuss, then apply" itinerary planner. The
 * assistant sees the current plan + destination guide and talks through ideas
 * but does NOT change the itinerary (applying is a separate revise call).
 * Auth-gated.
 *
 * Request body: { messages: { role: "user" | "assistant"; content: string }[] }
 * Response (200): { reply: string }
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getTripById, getCurrentItineraryHydrated } from "@/lib/db/queries";
import { createPlannerEngine } from "@/lib/planner/engine";
import type { DestinationGuide } from "@/lib/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export interface ChatRequestBody {
  messages: ChatMessage[];
}
export interface ChatResponseBody {
  reply: string;
}
export interface ChatErrorBody {
  error: string;
}

function formatClock(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hh = Number(h);
  if (Number.isNaN(hh)) return "";
  const period = hh < 12 ? "am" : "pm";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${m?.slice(0, 2) ?? "00"}${period}`;
}

function guideToText(g: DestinationGuide | null): string | undefined {
  if (!g) return undefined;
  const spots = g.top_spots.map((s) => s.name).join(", ");
  const foods = g.must_try_foods.map((f) => f.name).join(", ");
  return [
    g.known_for,
    spots ? `Top spots: ${spots}` : "",
    foods ? `Must-try food: ${foods}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" } satisfies ChatErrorBody, {
      status: 401,
    });
  }

  const { id: tripId } = await params;
  if (!tripId) {
    return Response.json({ error: "Missing trip id" } satisfies ChatErrorBody, {
      status: 400,
    });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" } satisfies ChatErrorBody, {
      status: 400,
    });
  }

  const messages = (body.messages ?? []).filter(
    (m) => (m.role === "user" || m.role === "assistant") && m.content?.trim()
  );
  if (messages.length === 0) {
    return Response.json({ error: "No messages provided" } satisfies ChatErrorBody, {
      status: 400,
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." } satisfies ChatErrorBody,
      { status: 500 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    const [trip, itinerary] = await Promise.all([
      getTripById(supabase, tripId),
      getCurrentItineraryHydrated(supabase, tripId),
    ]);

    const itineraryText =
      itinerary && itinerary.days.length > 0
        ? itinerary.days
            .map((d, i) => {
              const acts = (d.activities ?? [])
                .map((a) => {
                  const t = formatClock(a.start_time);
                  return `${t ? t + " " : ""}${a.name}`;
                })
                .join("; ");
              return `Day ${i + 1} (${d.date}): ${acts || "—"}`;
            })
            .join("\n")
        : "No itinerary generated yet.";

    const guideText = guideToText(trip?.destination_guide ?? null);

    const engine = createPlannerEngine(supabase);
    const reply = await engine.discussItinerary({
      itineraryText,
      guideText,
      messages,
    });

    return Response.json({ reply } satisfies ChatResponseBody, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed.";
    return Response.json({ error: message } satisfies ChatErrorBody, {
      status: 500,
    });
  }
}
