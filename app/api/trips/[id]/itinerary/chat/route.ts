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
import {
  getTripById,
  getCurrentItineraryHydrated,
  getLegsForTrip,
} from "@/lib/db/queries";
import { createPlannerEngine } from "@/lib/planner/engine";
import type { DestinationGuide } from "@/lib/types";
import { isLLMConfigured } from "@/lib/llm/availability";
import { loadTripLogistics } from "@/lib/server/trip-logistics";
import { getTripBrief } from "@/lib/db/queries";
import { sumActivityCosts, sumDayCosts, summarizeBudget } from "@/lib/planner/costs";

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

  // Cap what a client can make us send to the model: the last 20 turns, 4k chars each.
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m) =>
        m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()
    )
    .slice(-20)
    .map((m) => ({ ...m, content: m.content.slice(0, 4000) }));
  if (messages.length === 0) {
    return Response.json({ error: "No messages provided" } satisfies ChatErrorBody, {
      status: 400,
    });
  }

  if (!isLLMConfigured()) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." } satisfies ChatErrorBody,
      { status: 500 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    const [trip, itinerary, legs, brief, logistics] = await Promise.all([
      getTripById(supabase, tripId),
      getCurrentItineraryHydrated(supabase, tripId),
      getLegsForTrip(supabase, tripId).catch(() => []),
      getTripBrief(supabase, tripId).catch(() => null),
      loadTripLogistics(supabase, tripId),
    ]);

    const multiCity = new Set(legs.map((l) => l.city)).size > 1;

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
              // Tag each day with its city so the assistant reasons per-city.
              const cityTag = multiCity && d.city ? ` · ${d.city}` : "";
              const cost = sumActivityCosts(d.activities);
              return `Day ${i + 1} (${d.date})${cityTag}${cost > 0 ? ` [$${Math.round(cost)}]` : ""}: ${acts || "—"}`;
            })
            .join("\n")
        : "No itinerary generated yet.";

    // Money and fixed logistics, so the assistant can talk about budget and
    // flight times instead of guessing (costs are for the whole party).
    const facts: string[] = [];
    if (itinerary && brief) {
      const b = summarizeBudget({
        dailyBudgetUsd: brief.daily_budget_usd,
        party: brief.party_composition,
        dayCount: itinerary.days.length,
        planned: sumDayCosts(itinerary.days),
      });
      if (b) {
        facts.push(
          `Budget: $${brief.daily_budget_usd} per traveller per day x ${b.travellers} travellers x ${b.days} days = $${Math.round(b.budgetTotal)}; planned $${Math.round(b.planned)} for the whole party (${b.remaining >= 0 ? `$${Math.round(b.remaining)} left` : `$${Math.round(-b.remaining)} over`}).`
        );
      }
    }
    for (const f of logistics.flights) {
      facts.push(`Flight: ${f.from_airport ?? "?"} to ${f.to_airport ?? "?"} on ${f.depart_date ?? "?"} ${f.depart_time ?? ""}`.trim());
    }
    for (const a of logistics.accommodations) {
      facts.push(`Stay: ${a.name ?? "?"}${a.neighborhood ? ` (${a.neighborhood})` : ""}, ${a.check_in ?? "?"} to ${a.check_out ?? "?"}`);
    }
    const contextText = facts.length > 0 ? `${itineraryText}\n\n${facts.join("\n")}` : itineraryText;

    // Guide context: per-city for multi-city trips (labeled by city), else the
    // single trip-level guide.
    const legGuides = legs
      .filter((l) => l.destination_guide)
      .map((l) => `## ${l.city}\n${guideToText(l.destination_guide)}`);
    const guideText =
      legGuides.length > 0
        ? legGuides.join("\n\n")
        : guideToText(trip?.destination_guide ?? null);

    const engine = createPlannerEngine(supabase);
    const reply = await engine.discussItinerary({
      itineraryText: contextText,
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
