import type { NextRequest } from "next/server";

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

  const url =
    `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=5&lang=en`;

  let photon: PhotonResponse;
  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "trip-planner-autocomplete/1.0 (mizuho.li@king.com)",
      },
      // Don't let Next.js cache this at the framework layer — results should
      // always reflect the live query.
      cache: "no-store",
    });

    if (!upstream.ok) {
      return Response.json([] satisfies GeocodeResult[]);
    }

    photon = (await upstream.json()) as PhotonResponse;
  } catch {
    // Network error or JSON parse failure — degrade gracefully.
    return Response.json([] satisfies GeocodeResult[]);
  }

  const results: GeocodeResult[] = (photon.features ?? [])
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

  return Response.json(results satisfies GeocodeResult[]);
}
