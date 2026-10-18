/**
 * OpenStreetMap-backed ContentSource (network + caching half of lib/places).
 *
 * Resolves a city name to a point (Photon geocoder), asks Overpass for named
 * food venues and nearby sights, and converts them into CommunityPost-shaped
 * records via ./osm.ts. Any failure degrades to "no venues" so itinerary
 * generation never breaks because a free public service is slow or down.
 *
 * Data © OpenStreetMap contributors (ODbL). Both services are free public
 * infrastructure with usage policies, so results are cached in memory and every
 * request identifies the app.
 */

import type { CommunityPost } from "@/lib/types";
import type { ContentSource, FetchOptions } from "@/lib/retrieval/source";
import { rankPosts } from "@/lib/retrieval/ranking";
import {
  buildOverpassQuery,
  elementsToPosts,
  haversineMeters,
  type LatLon,
  type OverpassElement,
} from "./osm";

const USER_AGENT =
  "trip-planner/1.0 (+https://github.com/limiz6383/trip-planner)";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // map data barely changes day to day
// One budget for the whole lookup (geocode + Overpass). Generation waits on this,
// so a slow public service must cost seconds, not a failed itinerary.
const LOOKUP_BUDGET_MS = 20000;
// Public Overpass servers are often slow. Rather than waiting for one to time out,
// start the next mirror a few seconds later and take whichever answers first.
const HEDGE_DELAY_MS = 4000;
const MIN_RADIUS_M = 2500;
const MAX_RADIUS_M = 6000; // smaller area = a much cheaper query on busy public servers
const DEFAULT_RADIUS_M = 5000;

// ---------------------------------------------------------------------------
// Geocoding (Photon, same service the autocomplete already uses)
// ---------------------------------------------------------------------------

interface GeocodedCity {
  center: LatLon;
  radiusMeters: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { extent?: [number, number, number, number] };
}

async function geocodeCity(city: string, signal: AbortSignal): Promise<GeocodedCity | null> {
  const url = `https://photon.komoot.io/api?q=${encodeURIComponent(city)}&limit=1&lang=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal,
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { features?: PhotonFeature[] };
  const f = body.features?.[0];
  if (!f) return null;

  const [lon, lat] = f.geometry.coordinates;
  const center = { lat, lon };

  // Photon's extent is [minLon, maxLat, maxLon, minLat]. Use half the diagonal
  // so a small town gets a tight search and an island/metro a wider one.
  let radius = DEFAULT_RADIUS_M;
  const e = f.properties.extent;
  if (e) {
    const diag = haversineMeters({ lat: e[1], lon: e[0] }, { lat: e[3], lon: e[2] });
    radius = Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, diag / 2));
  }
  return { center, radiusMeters: radius };
}

// ---------------------------------------------------------------------------
// Overpass
// ---------------------------------------------------------------------------

async function queryOverpass(query: string, signal: AbortSignal): Promise<OverpassElement[]> {
  // Remember why each server said no, so a failure is diagnosable.
  const failures: string[] = [];
  const stop = new AbortController(); // cancels the losers once one succeeds
  const combined = AbortSignal.any([signal, stop.signal]);
  let settled = false;

  const attempt = async (endpoint: string, index: number): Promise<OverpassElement[]> => {
    const host = new URL(endpoint).host;
    // Hedged start: mirror N waits N * HEDGE_DELAY_MS unless an earlier one has
    // already answered.
    if (index > 0) await new Promise((r) => setTimeout(r, index * HEDGE_DELAY_MS));
    if (settled || combined.aborted) throw new Error("skipped");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          Referer: "https://github.com/limiz6383/trip-planner",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
        cache: "no-store",
        signal: combined,
      });
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
        throw new Error(`HTTP ${res.status}${body ? ` ${body}` : ""}`);
      }
      const json = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
      // Overpass reports a server-side timeout / out-of-memory as HTTP 200 with a
      // `remark` and a partial result. Treat that as a failure so a truncated
      // answer is neither used nor cached for hours.
      if (json.remark) throw new Error(json.remark.slice(0, 120));
      return json.elements ?? [];
    } catch (err) {
      if (!settled) failures.push(`${host}: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  };

  try {
    const elements = await Promise.any(OVERPASS_ENDPOINTS.map(attempt));
    settled = true;
    return elements;
  } catch {
    throw new Error(`Overpass unavailable - ${failures.join(" | ") || "no response"}`);
  } finally {
    settled = true;
    stop.abort();
  }
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

export class OsmContentSource implements ContentSource {
  private readonly cache = new Map<string, { at: number; posts: CommunityPost[] }>();
  /** Concurrent callers asking for the same city share one upstream request. */
  private readonly inflight = new Map<string, Promise<CommunityPost[]>>();

  async fetchForDestination(destination: string): Promise<CommunityPost[]> {
    const key = destination.trim().toLowerCase();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.posts;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const lookup = this.lookup(destination, key).finally(() =>
      this.inflight.delete(key)
    );
    this.inflight.set(key, lookup);
    return lookup;
  }

  private async lookup(destination: string, key: string): Promise<CommunityPost[]> {
    const signal = AbortSignal.timeout(LOOKUP_BUDGET_MS);
    try {
      const place = await geocodeCity(destination, signal);
      if (!place) return [];
      const elements = await queryOverpass(
        buildOverpassQuery(place.center, place.radiusMeters),
        signal
      );
      const posts = elementsToPosts(elements, destination);
      if (posts.length > 0) {
        if (this.cache.size >= 200) this.cache.clear(); // keep memory bounded
        this.cache.set(key, { at: Date.now(), posts });
      }
      return posts;
    } catch (err) {
      console.warn(`[places] OpenStreetMap lookup failed for "${destination}":`, err);
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Composite: curated posts + real venues
// ---------------------------------------------------------------------------

/**
 * Merges the curated community posts with real venues. Venues are pre-ranked
 * against the traveller's local/touristy dial and capped, so a food-heavy map
 * result can't crowd every sight and tip out of the model's limited context.
 */
export class CompositeContentSource implements ContentSource {
  constructor(
    private readonly curated: ContentSource,
    private readonly venues: ContentSource,
    /** Venues kept in total for a single city; shared out across several. */
    private readonly maxVenues = 24
  ) {}

  async fetchForDestination(
    destination: string,
    options: FetchOptions = {}
  ): Promise<CommunityPost[]> {
    // Multi-city trips store their destination as "Athens → Paros → Naxos"
    // (revise flows pass that string). Look each city up on its own.
    const cities = destination
      .split(/\s*(?:→|->)\s*/)
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 5);
    const lookups = cities.length > 0 ? cities : [destination];
    const perCity = Math.max(6, Math.floor(this.maxVenues / lookups.length));
    const dial = options.localTouristyDial ?? 0.2; // default: lean local

    const [posts, venueSets] = await Promise.all([
      this.curated.fetchForDestination(destination, options),
      Promise.all(
        lookups.map((city) =>
          this.venues.fetchForDestination(city, options).catch(() => [])
        )
      ),
    ]);

    const venues = venueSets.flatMap((set) =>
      rankPosts(set, dial).slice(0, perCity)
    );
    return [...posts, ...venues];
  }
}
