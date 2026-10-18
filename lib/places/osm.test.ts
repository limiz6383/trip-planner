import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOverpassQuery,
  elementsToPosts,
  haversineMeters,
  scoreLocality,
  type OverpassElement,
} from "./osm.ts";

const node = (id: number, lat: number, lon: number, tags: Record<string, string>): OverpassElement => ({
  type: "node", id, lat, lon, tags,
});

test("an independent venue away from sights scores as local", () => {
  const indie = scoreLocality({ amenity: "restaurant", cuisine: "greek" }, 0);
  assert.ok(indie.score >= 0.7, `independent should be clearly local, got ${indie.score}`);
  assert.ok(indie.score <= 0.95);
});

test("a famous or attraction-tagged venue scores lower", () => {
  const plain = scoreLocality({ amenity: "restaurant" }, 0).score;
  const famous = scoreLocality({ amenity: "restaurant", wikidata: "Q1" }, 0).score;
  const attraction = scoreLocality({ amenity: "restaurant", tourism: "attraction" }, 0).score;
  assert.ok(famous < plain && attraction < plain);
});

test("chains are never suggested", () => {
  const els: OverpassElement[] = [
    node(1, 37.0, 25.0, { amenity: "fast_food", name: "Burger Co", brand: "Burger Co" }),
    node(2, 37.0, 25.001, { amenity: "cafe", name: "Chain Cafe", "brand:wikidata": "Q42" }),
    node(3, 37.0, 25.002, { amenity: "cafe", name: "Kafeneio Mitsos" }),
  ];
  const names = elementsToPosts(els, "X").map((p) => p.place_name);
  assert.deepEqual(names, ["Kafeneio Mitsos"]);
});

test("prefers the English name and keeps the local one as context", () => {
  const els: OverpassElement[] = [
    node(1, 37.0, 25.0, { amenity: "restaurant", name: "Κλαρίνος", "name:en": "Klarinos" }),
  ];
  const [p] = elementsToPosts(els, "Paros");
  assert.equal(p.place_name, "Klarinos");
  assert.equal(p.title, "Klarinos");
  assert.match(p.content!, /Local name: Κλαρίνος/);
});

test("unnamed sights do not make a street look touristy", () => {
  const els: OverpassElement[] = [
    node(1, 37.0, 25.0, { amenity: "restaurant", name: "Quiet Place" }),
    node(2, 37.0001, 25.0, { tourism: "artwork" }),
    node(3, 37.0001, 25.0001, { historic: "memorial" }),
    node(4, 37.0002, 25.0, { tourism: "attraction" }),
  ];
  const [p] = elementsToPosts(els, "X");
  assert.doesNotMatch(p.content!, /sightseeing zone|close to a major sight/);
  assert.ok(p.locality_score >= 0.7);
});

test("sitting among major sights lowers the score", () => {
  const away = scoreLocality({ amenity: "restaurant" }, 0).score;
  const some = scoreLocality({ amenity: "restaurant" }, 2).score;
  const trap = scoreLocality({ amenity: "restaurant" }, 5).score;
  assert.ok(away > some && some > trap);
});

test("score is clamped to 0.05..0.95", () => {
  const worst = scoreLocality({ wikidata: "Q1", tourism: "attraction" }, 9).score;
  const best = scoreLocality({ amenity: "cafe", cuisine: "greek" }, 0).score;
  assert.ok(worst >= 0.05 && worst <= 0.15, `worst case should be near the floor, got ${worst}`);
  assert.ok(best <= 0.95);
});

test("elementsToPosts keeps only named venues and maps fields", () => {
  const els: OverpassElement[] = [
    node(1, 37.04, 25.15, { amenity: "restaurant", name: "Taverna Nikos", cuisine: "greek", "addr:street": "Odos Agoras", "addr:housenumber": "4" }),
    node(2, 37.04, 25.15, { amenity: "restaurant" }), // no name -> dropped
    { type: "way", id: 3, center: { lat: 37.05, lon: 25.16 }, tags: { shop: "bakery", name: "Fournos" } },
  ];
  const posts = elementsToPosts(els, "Paros", new Date("2026-01-01T00:00:00Z"));
  assert.equal(posts.length, 2);
  const nikos = posts.find((p) => p.place_name === "Taverna Nikos")!;
  assert.equal(nikos.author_type, "map");
  assert.equal(nikos.source, "openstreetmap");
  assert.equal(nikos.destination, "Paros");
  assert.equal(nikos.post_id, "osm-node-1");
  assert.equal(nikos.location_lat, 37.04);
  assert.match(nikos.content!, /Greek restaurant at Odos Agoras 4/);
  const way = posts.find((p) => p.place_name === "Fournos")!;
  assert.equal(way.location_lat, 37.05); // used the way's centre
});

test("venues near several sights are marked touristy", () => {
  const sight = (id: number, dLat: number) => node(id, 37.0 + dLat, 25.0, { tourism: "attraction", name: "Sight" });
  const els: OverpassElement[] = [
    node(10, 37.0, 25.0, { amenity: "restaurant", name: "Tourist Corner" }),
    node(11, 37.02, 25.0, { amenity: "restaurant", name: "Back Street Kafenio" }),
    sight(20, 0.0003), sight(21, 0.0004), sight(22, 0.0005),
  ];
  const posts = elementsToPosts(els, "X");
  const trap = posts.find((p) => p.place_name === "Tourist Corner")!;
  const quiet = posts.find((p) => p.place_name === "Back Street Kafenio")!;
  assert.ok(trap.locality_score < quiet.locality_score);
  assert.match(trap.content!, /sightseeing zone/);
});

test("same-named duplicates within 50 m collapse", () => {
  const els = [
    node(1, 37.0, 25.0, { amenity: "cafe", name: "Kafeneio" }),
    node(2, 37.00005, 25.0, { amenity: "cafe", name: "Kafeneio" }),
    node(3, 37.01, 25.0, { amenity: "cafe", name: "Kafeneio" }), // far away -> kept
  ];
  assert.equal(elementsToPosts(els, "X").length, 2);
});

test("query targets the point and radius, and separates sights", () => {
  const q = buildOverpassQuery({ lat: 37.9755, lon: 23.7348 }, 5000);
  assert.match(q, /around:5000,37\.97550,23\.73480/);
  assert.match(q, /\.food out center/);
  assert.match(q, /\.sights out center/);
});

test("sights query asks only for named, notable features", () => {
  const q = buildOverpassQuery({ lat: 0, lon: 0 }, 1000);
  const sights = q.slice(q.indexOf("->.food;"));
  assert.doesNotMatch(sights, /artwork|memorial/);
  assert.match(sights, /\["name"\]/);
});

test("haversine is roughly right", () => {
  const d = haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  assert.ok(Math.abs(d - 111195) < 500);
});
