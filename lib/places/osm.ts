/**
 * Real, named places from OpenStreetMap — pure logic, no network.
 *
 * Why OpenStreetMap and not a reviews site: star ratings reward whatever the
 * most tourists have already visited, which is the opposite of "somewhere
 * locals actually eat". OSM is community-mapped, includes small places with no
 * web presence, and needs no API key. It has no ratings, so we derive a
 * *locality* signal from what the map does know (see scoreLocality).
 *
 * Data © OpenStreetMap contributors, licensed under the ODbL
 * (https://www.openstreetmap.org/copyright).
 *
 * This file has no framework imports so it can be unit-tested with plain Node
 * (`npm test`). The network + caching half lives in ./source.ts.
 */

import type { CommunityPost } from "../types";

// ---------------------------------------------------------------------------
// Overpass types
// ---------------------------------------------------------------------------

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  /** Present for ways/relations when the query uses `out center`. */
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface LatLon {
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

const FOOD_AMENITIES =
  "restaurant|cafe|bar|pub|fast_food|food_court|ice_cream|biergarten";
const FOOD_SHOPS = "bakery|pastry|deli|confectionery";
// Named, genuinely visit-worthy sights only. Unnamed or tiny features (artwork,
// memorial plaques such as Berlin's thousands of Stolpersteine) would make every
// street look like a tourist zone.
const SIGHT_TOURISM = "attraction|museum|viewpoint|gallery|zoo|theme_park";
const SIGHT_HISTORIC = "monument|castle|ruins|archaeological_site|fort";

/**
 * Overpass QL (nodes and ways only: venues are never relations, and skipping
 * them makes the query much cheaper) for named food venues plus the major sights around a point.
 * Sights are fetched in a separate `out` so a dense city's thousands of
 * restaurants can't truncate them away.
 */
export function buildOverpassQuery(center: LatLon, radiusMeters: number): string {
  const around = `(around:${Math.round(radiusMeters)},${center.lat.toFixed(5)},${center.lon.toFixed(5)})`;
  return `[out:json][timeout:15];
(
  nw["amenity"~"^(${FOOD_AMENITIES})$"]["name"]${around};
  nw["shop"~"^(${FOOD_SHOPS})$"]["name"]${around};
)->.food;
(
  nw["tourism"~"^(${SIGHT_TOURISM})$"]["name"]${around};
  nw["historic"~"^(${SIGHT_HISTORIC})$"]["name"]${around};
)->.sights;
.food out center tags 1200;
.sights out center tags 800;`;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export function haversineMeters(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pointOf(el: OverpassElement): LatLon | null {
  if (typeof el.lat === "number" && typeof el.lon === "number") {
    return { lat: el.lat, lon: el.lon };
  }
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  return null;
}

// ---------------------------------------------------------------------------
// Locality heuristic
// ---------------------------------------------------------------------------

/** Sights within this distance make a venue "in the tourist zone". */
export const SIGHT_NEAR_METERS = 150;

export interface LocalityResult {
  /** 0.0 = very touristy, 1.0 = very local (same scale as community_posts). */
  score: number;
  /** Plain-language reasons, passed to the model and useful when debugging. */
  reasons: string[];
}

/**
 * Estimates how "local" a venue is from OSM tags and its surroundings.
 *
 * This is a heuristic, not a measurement. It deliberately uses only signals the
 * map actually contains:
 *   (chains are excluded before scoring - see elementsToPosts)
 *   - has its own Wikipedia/Wikidata entry      -> a famous landmark venue
 *   - tagged as a tourism feature               -> aimed at visitors
 *   - next to major sights                      -> the classic tourist-trap zone
 *   - independent, off the beaten path          -> baseline-to-high
 */
export function scoreLocality(
  tags: Record<string, string>,
  nearbySights: number
): LocalityResult {
  let score = 0.7;
  const reasons: string[] = [];

  if (tags.wikidata || tags.wikipedia) {
    score -= 0.15;
    reasons.push("a well-known landmark venue");
  }
  if (tags.tourism) {
    score -= 0.2;
    reasons.push("tagged as a visitor attraction");
  }
  if (nearbySights >= 3) {
    score -= 0.25;
    reasons.push(`in a busy sightseeing zone (${nearbySights} major sights within ${SIGHT_NEAR_METERS} m)`);
  } else if (nearbySights >= 1) {
    score -= 0.1;
    reasons.push("close to a major sight");
  }
  if (reasons.length === 0) {
    reasons.push("independent and away from the main sights");
  }
  if (tags.cuisine) score += 0.05;

  return { score: Math.min(0.95, Math.max(0.05, Number(score.toFixed(2)))), reasons };
}

// ---------------------------------------------------------------------------
// Element -> CommunityPost
// ---------------------------------------------------------------------------

function isSight(tags: Record<string, string>): boolean {
  return Boolean(tags.tourism || tags.historic) && !tags.amenity && !tags.shop;
}

/** Chains are never what "somewhere local" means, so they are not suggested. */
function isChain(tags: Record<string, string>): boolean {
  return Boolean(tags.brand || tags["brand:wikidata"]);
}

/** Prefer an English/international name so suggestions read naturally. */
function displayName(tags: Record<string, string>): string {
  return (tags["name:en"] || tags.int_name || tags.name).trim();
}

function titleCase(s: string): string {
  return s.replace(/[_;]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function venueKind(tags: Record<string, string>): string {
  const raw = tags.amenity ?? tags.shop ?? "place";
  return raw === "fast_food" ? "quick bite" : titleCase(raw).toLowerCase();
}

function address(tags: Record<string, string>): string | null {
  const street = tags["addr:street"];
  if (!street) return null;
  return [street, tags["addr:housenumber"]].filter(Boolean).join(" ");
}

/**
 * Converts a raw Overpass response into CommunityPost-shaped venues so the
 * existing ranking and prompt code can consume them unchanged.
 *
 * Unnamed elements and chains are dropped (we only suggest places we can name, and
 * 'local' excludes chains), and duplicates of the same name within 50 m (a way and its entrance node) are
 * collapsed.
 */
export function elementsToPosts(
  elements: OverpassElement[],
  destination: string,
  now: Date = new Date()
): CommunityPost[] {
  const sights: LatLon[] = [];
  const venues: { el: OverpassElement; at: LatLon; tags: Record<string, string> }[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const at = pointOf(el);
    if (!at) continue;
    if (isSight(tags)) {
      // Only named / notable sights define a "tourist zone"; anonymous map
      // features would make every street look busy.
      if (tags.name || tags.wikidata) sights.push(at);
    } else if (tags.name && (tags.amenity || tags.shop) && !isChain(tags)) {
      venues.push({ el, at, tags });
    }
  }

  const seen: { name: string; at: LatLon }[] = [];
  const posts: CommunityPost[] = [];

  for (const { el, at, tags } of venues) {
    const name = displayName(tags);
    const key = name.toLowerCase();
    if (seen.some((s) => s.name === key && haversineMeters(s.at, at) < 50)) continue;
    seen.push({ name: key, at });

    const nearby = sights.filter((s) => haversineMeters(s, at) <= SIGHT_NEAR_METERS).length;
    const { score, reasons } = scoreLocality(tags, nearby);

    const cuisines = (tags.cuisine ?? "")
      .split(";")
      .map((c) => titleCase(c))
      .filter(Boolean);
    const addr = address(tags);

    const parts = [
      `${name} is a ${cuisines.length ? cuisines.join("/") + " " : ""}${venueKind(tags)}${addr ? ` at ${addr}` : ""} in ${destination}.`,
      name !== tags.name.trim() ? `Local name: ${tags.name.trim()}.` : null,
      tags.opening_hours ? `Opening hours: ${tags.opening_hours}.` : null,
      `Locality: ${reasons.join("; ")}.`,
    ].filter(Boolean);

    posts.push({
      post_id: `osm-${el.type}-${el.id}`,
      destination,
      title: name,
      source: "openstreetmap",
      author: "OpenStreetMap contributors",
      author_type: "map",
      content: parts.join(" "),
      tags: [tags.amenity ?? tags.shop ?? "place", ...cuisines.map((c) => c.toLowerCase())],
      estimated_cost_usd: null,
      locality_score: score,
      place_name: name,
      location_lat: Number(at.lat.toFixed(6)),
      location_lon: Number(at.lon.toFixed(6)),
      created_at: now.toISOString(),
    });
  }

  return posts;
}
