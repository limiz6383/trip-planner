/**
 * Offline stand-in for the Photon geocoding service.
 *
 * A small city list is enough for a demo: destination autocomplete only needs
 * to return plausible, well-formed suggestions with real coordinates so the
 * create-trip and booking flows behave normally with no network access.
 */

export interface MockPlace {
  label: string;
  name: string;
  lat: number;
  lon: number;
}

const PLACES: MockPlace[] = [
  { label: "Paros Municipality, Aegean, Greece", name: "Paros Municipality", lat: 37.0853, lon: 25.1489 },
  { label: "Athens, Attica, Greece", name: "Athens", lat: 37.9838, lon: 23.7275 },
  { label: "Santorini, Aegean, Greece", name: "Santorini", lat: 36.3932, lon: 25.4615 },
  { label: "Tokyo, Japan", name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { label: "Kyoto, Kansai, Japan", name: "Kyoto", lat: 35.0116, lon: 135.7681 },
  { label: "Osaka, Kansai, Japan", name: "Osaka", lat: 34.6937, lon: 135.5023 },
  { label: "Berlin, Germany", name: "Berlin", lat: 52.52, lon: 13.405 },
  { label: "Munich, Bavaria, Germany", name: "Munich", lat: 48.1351, lon: 11.582 },
  { label: "Paris, Île-de-France, France", name: "Paris", lat: 48.8566, lon: 2.3522 },
  { label: "Lisbon, Portugal", name: "Lisbon", lat: 38.7223, lon: -9.1393 },
  { label: "Porto, Portugal", name: "Porto", lat: 41.1579, lon: -8.6291 },
  { label: "Barcelona, Catalonia, Spain", name: "Barcelona", lat: 41.3874, lon: 2.1686 },
  { label: "Madrid, Spain", name: "Madrid", lat: 40.4168, lon: -3.7038 },
  { label: "Rome, Lazio, Italy", name: "Rome", lat: 41.9028, lon: 12.4964 },
  { label: "Florence, Tuscany, Italy", name: "Florence", lat: 43.7696, lon: 11.2558 },
  { label: "Mexico City, Mexico", name: "Mexico City", lat: 19.4326, lon: -99.1332 },
  { label: "New York, New York, United States", name: "New York", lat: 40.7128, lon: -74.006 },
  { label: "San Francisco, California, United States", name: "San Francisco", lat: 37.7749, lon: -122.4194 },
  { label: "Santa Fe, New Mexico, United States", name: "Santa Fe", lat: 35.687, lon: -105.9378 },
  { label: "Prague, Czechia", name: "Prague", lat: 50.0755, lon: 14.4378 },
  { label: "Vienna, Austria", name: "Vienna", lat: 48.2082, lon: 16.3738 },
  { label: "Seoul, South Korea", name: "Seoul", lat: 37.5665, lon: 126.978 },
  { label: "Bangkok, Thailand", name: "Bangkok", lat: 13.7563, lon: 100.5018 },
  { label: "Istanbul, Turkey", name: "Istanbul", lat: 41.0082, lon: 28.9784 },
];

/** Prefix matches first, then substring — mirrors how a geocoder ranks. */
export function searchPlaces(query: string, limit = 5): MockPlace[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const starts = PLACES.filter((p) => p.name.toLowerCase().startsWith(q));
  const contains = PLACES.filter(
    (p) => !starts.includes(p) && p.label.toLowerCase().includes(q)
  );
  return [...starts, ...contains].slice(0, limit);
}
