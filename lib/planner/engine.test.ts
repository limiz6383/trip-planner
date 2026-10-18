import { test } from "node:test";
import assert from "node:assert/strict";
import { PlannerEngine } from "./engine.ts";
import type { LLMProvider } from "../llm/provider.ts";

const post = (place: string, lat: number, lon: number, dest = "Athens") => ({
  post_id: place, destination: dest, title: place, source: "t", author: "a",
  author_type: "map", content: "", tags: [], estimated_cost_usd: 10,
  locality_score: 0.8, place_name: place, location_lat: lat, location_lon: lon, created_at: "",
});

const brief: any = {
  brief_id: "b", trip_id: "t", destination: "Athens", start_date: "2026-08-27",
  end_date: "2026-08-29", daily_budget_usd: 100, vibe_keywords: [], party_composition: { adults: 2 },
  local_touristy_dial: 0.5, dietary_constraints: [], accessibility_needs: [], pace: "moderate",
};

function stubProvider(overrides: Partial<LLMProvider>): LLMProvider {
  const boom = () => { throw new Error("not stubbed"); };
  return {
    consultingTurn: boom, generateItinerary: boom, reviseItinerary: boom,
    reviseActivity: boom, reviseDay: boom, generateDestinationGuide: boom,
    discussItinerary: boom, ...overrides,
  } as LLMProvider;
}

const source = {
  fetchForDestination: async (dest: string) => [
    post("Acropolis", 37.9715, 23.7257, dest),
    post("Ancient Agora", 37.9746, 23.7222, dest),
    post("Kifissia Park", 38.0738, 23.8112, dest),
    post("Kifissia Museum", 38.0745, 23.8101, dest),
  ],
} as any;

const act = (name: string, start: string, place: string, type = "culture", cost = 10) => ({
  name, description: "", start_time: start, estimated_time_hours: 1.5,
  estimated_cost_usd: cost, place_name: place, source_attribution: "", activity_type: type as any,
});

test("generation: wrong model arithmetic is replaced and a zig-zag day is re-ordered", async () => {
  const llm = stubProvider({
    generateItinerary: async () => ({
      destination: "Athens", start_date: "2026-08-27", end_date: "2026-08-27",
      total_cost_estimate: 999, notes: "n",
      days: [{
        date: "2026-08-27", daily_cost: 999,
        activities: [
          act("Acropolis", "09:00", "Acropolis"),
          act("Kifissia Park", "11:30", "Kifissia Park"),
          act("Ancient Agora", "14:00", "Ancient Agora"),
          act("Kifissia Museum", "16:30", "Kifissia Museum"),
        ],
      }],
    }),
  });
  const engine = new PlannerEngine(source, llm);
  const { itinerary } = await engine.plan({ brief });
  const day = itinerary.days[0];
  assert.equal(day.daily_cost, 40);
  assert.equal(itinerary.total_cost_estimate, 40);
  const names = day.activities.map((a) => a.name);
  const k = names.map((n, i) => (n.startsWith("Kifissia") ? i : -1)).filter((i) => i >= 0);
  assert.equal(Math.abs(k[0] - k[1]), 1, names.join(", "));
});

test("trip revision passes legs/flights through and the logistics instruction reaches the model", async () => {
  let seen: any;
  const llm = stubProvider({
    reviseItinerary: async (p) => { seen = p; return p.currentItinerary; },
  });
  const engine = new PlannerEngine(source, llm);
  const current: any = {
    itinerary_id: "i", trip_id: "t", version: 1, total_cost_estimate: 0, notes: "",
    days: [
      { day_id: "d1", date: "2026-08-27", daily_cost: 0, locked: false, activities: [] },
      { day_id: "d2", date: "2026-08-29", daily_cost: 0, locked: false, activities: [] },
    ],
  };
  const legs: any = [
    { leg_id: "l1", city: "Paros", arrival_date: "2026-08-24", departure_date: "2026-08-27" },
    { leg_id: "l2", city: "Athens", arrival_date: "2026-08-27", departure_date: "2026-08-29" },
  ];
  await engine.reviseItinerary({
    brief, currentItinerary: current, instruction: "LOGISTICS change: leaving early",
    legs, flights: [{ flight_id: "f" } as any],
  });
  assert.match(seen.instruction, /leaving early/);
  assert.equal(seen.legs.length, 2);
  assert.equal(seen.flights.length, 1);
});

test("day revision keeps locked activities and surfaces the model's ripple flag", async () => {
  const llm = stubProvider({
    reviseDay: async () => ({
      activities: [act("Replacement", "10:00", "x")],
      ripple: { reason: "Earlier departure." },
    }),
  });
  const engine = new PlannerEngine(source, llm);
  const existing: any[] = [
    { activity_id: "a1", day_id: "d", name: "Booked tour", description: "", start_time: "14:00",
      estimated_time_hours: 2, estimated_cost_usd: 50, place_name: "p", source_attribution: "",
      activity_type: "culture", locked: true, sort_order: 0, created_at: "" },
  ];
  const out = await engine.reviseDay({
    brief, dayDate: "2026-08-27", activities: existing, instruction: "x",
  });
  assert.equal(out.ripple?.reason, "Earlier departure.");
  assert.ok(out.activities.some((a) => a.name === "Booked tour" && a.locked));
});
