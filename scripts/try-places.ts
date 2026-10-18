/**
 * End-to-end check of the OpenStreetMap places feature. No database needed.
 *
 *   1. looks up real venues for a city (Photon + Overpass)
 *   2. ranks them with the local/touristy dial
 *   3. asks Claude to plan a few days using them
 *   4. reports whether each meal names a venue that really came from the map
 *
 * Usage (your key stays in your shell; this script never prints it):
 *
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/try-places.ts \
 *     "Paros Municipality, Aegean, Greece" 0.2 3
 *
 * Args: <city label> [dial 0..1, 0 = very local] [days]
 * Costs one itinerary generation on your Anthropic account (a few cents).
 */

import { CompositeContentSource, OsmContentSource } from "@/lib/places/source";
import { rankPosts } from "@/lib/retrieval/ranking";
import { AnthropicProvider } from "@/lib/llm/provider";
import type { CommunityPost, TripBrief } from "@/lib/types";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const city = process.argv[2] ?? "Paros Municipality, Aegean, Greece";
  const dial = Number(process.argv[3] ?? 0.2);
  const days = Math.min(6, Math.max(1, Number(process.argv[4] ?? 3)));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY in your shell first (see usage at the top of this file).");
    process.exit(1);
  }
  if (process.env.NEXT_PUBLIC_MOCK_MODE) {
    console.error("NEXT_PUBLIC_MOCK_MODE is set, which swaps the real model for fixtures. Unset it.");
    process.exit(1);
  }

  // 1. Real venues ---------------------------------------------------------
  console.log(`\n[1/3] Looking up venues for "${city}" ...`);
  const t0 = Date.now();
  const osm = new OsmContentSource();
  const venues = await osm.fetchForDestination(city);
  console.log(`      ${venues.length} named independent venues in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (venues.length === 0) {
    console.error("      No venues came back (service busy or city not found). Nothing to test.");
    process.exit(1);
  }

  const empty = { fetchForDestination: async (): Promise<CommunityPost[]> => [] };
  const source = new CompositeContentSource(empty, osm);
  const posts = await source.fetchForDestination(city, { localTouristyDial: dial });
  const ranked = rankPosts(posts, dial).slice(0, 30);

  console.log(`\n      Top venues the model will see (dial ${dial}, 0 = most local):`);
  for (const p of ranked.slice(0, 8)) {
    console.log(`        ${p.locality_score.toFixed(2)}  ${p.place_name}  [${p.tags.join(", ")}]`);
  }

  // 2. Generate -------------------------------------------------------------
  const start = addDays(new Date().toISOString().slice(0, 10), 30);
  const end = addDays(start, days - 1);
  const now = new Date().toISOString();
  const brief: TripBrief = {
    brief_id: "try-places",
    trip_id: "try-places",
    destination: city,
    start_date: start,
    end_date: end,
    daily_budget_usd: 150,
    vibe_keywords: ["food", "walkable", "local"],
    party_composition: { adults: 2 },
    local_touristy_dial: dial,
    dietary_constraints: [],
    accessibility_needs: [],
    pace: "moderate",
    created_at: now,
    updated_at: now,
  };

  console.log(`\n[2/3] Asking Claude for a ${days}-day plan ...`);
  const t1 = Date.now();
  const itinerary = await new AnthropicProvider().generateItinerary({ brief, rankedPosts: ranked });
  console.log(`      done in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  // 3. Report ----------------------------------------------------------------
  const known = new Set(venues.map((v) => v.place_name.toLowerCase()));
  const fromMap = (s: string | undefined) => !!s && known.has(s.trim().toLowerCase());

  let meals = 0;
  let grounded = 0;
  console.log("\n[3/3] Meals in the plan:");
  for (const day of itinerary.days) {
    console.log(`\n  ${day.date}${day.city ? ` (${day.city})` : ""}`);
    for (const a of day.activities) {
      if (a.activity_type !== "food") continue;
      meals++;
      const ok = fromMap(a.place_name) || fromMap(a.name);
      if (ok) grounded++;
      console.log(`    ${ok ? "✓ real venue " : "✗ generic/other"}  ${a.start_time ?? "--:--"}  ${a.name}${a.place_name && a.place_name !== a.name ? `  @ ${a.place_name}` : ""}`);
    }
  }

  console.log(`\n  ${grounded}/${meals} meals name a venue that exists in the map data.`);
  console.log("  Anything marked ✗ should be a generic description (e.g. \"Lunch at a family-run taverna\").");
  console.log("  A made-up restaurant name marked ✗ would be a bug: please send me that line.\n");
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
