/**
 * GET /api/airports?q=...
 *
 * Airport autocomplete that is discoverable by official IATA code (e.g. "ABQ",
 * "SAF", "JFK") as well as by airport/city name. Backed by a bundled dataset of
 * IATA-coded airports. Returns the same shape as /api/geocode so it can drop
 * into the existing place-autocomplete component.
 */

import type { NextRequest } from "next/server";
import type { GeocodeResult } from "@/app/api/geocode/route";
import airportsData from "@/lib/data/airports.json";

interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

const AIRPORTS = airportsData as Airport[];

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return Response.json([] satisfies GeocodeResult[]);
  }

  const ql = q.toLowerCase();
  const qu = q.toUpperCase();

  const scored: { a: Airport; score: number }[] = [];
  for (const a of AIRPORTS) {
    let score = -1;
    if (a.iata === qu) score = 100; // exact IATA code
    else if (a.iata.startsWith(qu)) score = 80; // IATA prefix
    else if (a.city.toLowerCase().startsWith(ql)) score = 50;
    else if (a.name.toLowerCase().startsWith(ql)) score = 45;
    else if (`${a.name} ${a.city}`.toLowerCase().includes(ql)) score = 20;
    if (score >= 0) scored.push({ a, score });
  }

  scored.sort(
    (x, y) => y.score - x.score || x.a.iata.localeCompare(y.a.iata)
  );

  const results: GeocodeResult[] = scored.slice(0, 8).map(({ a }) => ({
    label: `${a.iata} — ${a.name}${a.city ? `, ${a.city}` : ""}`,
    name: `${a.name} (${a.iata})`,
    lat: a.lat,
    lon: a.lon,
  }));

  return Response.json(results satisfies GeocodeResult[]);
}
