import type { NextRequest } from "next/server";
import { IS_MOCK } from "@/lib/mock/flag";
import { searchPlaces } from "@/lib/mock/places";

// Shape returned to the client for each autocomplete suggestion.
export interface GeocodeResult {
  label: string;
  name: string;
  lat: number;
  lon: number;
}

// Shape of a single feature in the Photon GeoJSON response.
interface PhotonProperties {
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  county?: string;
}

interface PhotonFeature {
  geometry: {
    coordinates: [number, number]; // [lon, lat]
  };
  properties: PhotonProperties;
}

interface PhotonResponse {
  features: PhotonFeature[];
}

function buildLabel(props: PhotonProperties): string {
  const parts: string[] = [];

  if (props.name) {
    parts.push(props.name);
  }

  // Add city only when it differs from name (avoids "Paris, Paris, France")
  if (props.city && props.city !== props.name) {
    parts.push(props.city);
  }

  if (props.state) {
    parts.push(props.state);
  }

  if (props.country) {
    parts.push(props.country);
  }

  return parts.join(", ");
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";

  if (q.trim().length < 2) {
    return Response.json([] satisfies GeocodeResult[]);
  }

  // Demo mode: serve suggestions from a local list instead of calling Photon.
  if (IS_MOCK) {
    return Response.json(searchPlaces(q) satisfies GeocodeResult[]);
  }

  const results = await searchPhoton(q);
  // Photon is a free public service and sometimes refuses connections; fall
  // back to Open-Meteo's city search (also keyless, and fine for autocomplete,
  // unlike Nominatim whose usage policy forbids it).
  return Response.json(
    (results ?? (await searchOpenMeteo(q)) ?? []) satisfies GeocodeResult[]
  );
}

const USER_AGENT =
  "trip-planner-autocomplete/1.0 (+https://github.com/limiz6383/trip-planner)";

/** Photon suggestions, or null when Photon is unreachable or errors. */
async function searchPhoton(q: string): Promise<GeocodeResult[] | null> {
  const url =
    `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=5&lang=en`;

  let photon: PhotonResponse;
  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      // Don't let Next.js cache this at the framework layer — results should
      // always reflect the live query.
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (!upstream.ok) return null;

    photon = (await upstream.json()) as PhotonResponse;
  } catch {
    // Network error or JSON parse failure — let the caller fall back.
    return null;
  }

  return (photon.features ?? [])
    .map((feature) => {
      const props = feature.properties;
      const [lon, lat] = feature.geometry.coordinates;
      const label = buildLabel(props);

      return {
        label: label || q,
        name: props.name ?? q,
        lat,
        lon,
      };
    })
    // Drop entries where we couldn't build a meaningful label.
    .filter((r) => r.label.length > 0);
}

interface OpenMeteoPlace {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

/** Open-Meteo city suggestions, or null when it is unreachable or errors. */
async function searchOpenMeteo(q: string): Promise<GeocodeResult[] | null> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en`;
  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!upstream.ok) return null;
    const body = (await upstream.json()) as { results?: OpenMeteoPlace[] };
    return (body.results ?? []).map((p) => ({
      // Skip admin1 when it repeats the name ("Prague, Prague, Czechia").
      label: [p.name, p.admin1 !== p.name ? p.admin1 : undefined, p.country]
        .filter(Boolean)
        .join(", "),
      name: p.name,
      lat: p.latitude,
      lon: p.longitude,
    }));
  } catch {
    return null;
  }
}
