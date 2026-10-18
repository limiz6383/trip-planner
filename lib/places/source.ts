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
  "https://overpass.kumi.systems/api/interpreter",
];

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // map data barely changes day to day
const MIN_RADIUS_M = 2500;
const MAX_RADIUS_M = 8000;
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

async function geocodeCity(city: string): Promise<GeocodedCity | null> {
  const url = `https://photon.komoot.io/api?q=${encodeURIComponent(city)}&limit=1&lang=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
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

async function queryOverpass(query: string): Promise<OverpassElement[]> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements?: OverpassElement[] };
      return json.elements ?? [];
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Overpass unavailable");
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

export class OsmContentSource implements ContentSource {
  private readonly cache = new Map<string, { at: number; posts: CommunityPost[] }>();

  async fetchForDestination(destination: string): Promise<CommunityPost[]> {
    const key = destination.trim().toLowerCase();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.posts;

    try {
      const place = await geocodeCity(destination);
      if (!place) return [];
      const elements = await queryOverpass(
        buildOverpassQuery(place.center, place.radiusMeters)
      );
      const posts = elementsToPosts(elements, destination);
      if (posts.length > 0) this.cache.set(key, { at: Date.now(), posts });
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
    private readonly maxVenues = 40
  ) {}

  async fetchForDestination(
    destination: string,
    options: FetchOptions = {}
  ): Promise<CommunityPost[]> {
    const [posts, venues] = await Promise.all([
      this.curated.fetchForDestination(destination, options),
      this.venues.fetchForDestination(destination, options).catch(() => []),
    ]);

    const dial = options.localTouristyDial ?? 0.2; // default: lean local
    const topVenues = rankPosts(venues, dial).slice(0, this.maxVenues);
    return [...posts, ...topVenues];
  }
}
