#!/usr/bin/env node
// Holt Bus-, Straßenbahn- und Bahnhaltestellen in Deutschland aus OpenStreetMap (QLever, ersatzweise Overpass)
// und behält nur die, die höchstens 1,2 km von einem Eintrag entfernt sind.
// Ausgabe: data/haltestellen.json = [[lat, lon, Name, Art (bus|tram|bahn)], …]
// Daten: © OpenStreetMap-Mitwirkende, ODbL.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ZIEL = new URL('../data/haltestellen.json', import.meta.url);
const UA = 'hofladenliste.de-datenimport (https://github.com/JonasEngwicht/hofladen; hofladenliste@gmail.com)';
const UMKREIS_KM = 1.2;

const SPARQL = `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX ogc: <http://www.opengis.net/rdf#>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
SELECT ?art ?name ?wkt WHERE {
  osmrel:51477 ogc:sfContains ?osm .
  { ?osm osmkey:highway "bus_stop" . BIND("bus" AS ?art) } UNION
  { ?osm osmkey:railway "halt" . BIND("bahn" AS ?art) } UNION
  { ?osm osmkey:railway "station" . BIND("bahn" AS ?art) } UNION
  { ?osm osmkey:railway "tram_stop" . BIND("tram" AS ?art) }
  ?osm osmkey:name ?name .
  ?osm geo:hasGeometry/geo:asWKT ?wkt .
}`;
const OVERPASS = `[out:json][timeout:900];area["ISO3166-1"="DE"][admin_level=2]->.de;(node["highway"="bus_stop"]["name"](area.de);node["railway"~"^(halt|station|tram_stop)$"]["name"](area.de););out;`;

async function ausQlever() {
  // GET wie in fetch-osm.mjs (POST wird abgewiesen)
  const r = await fetch(`https://qlever.dev/api/osm-planet?query=${encodeURIComponent(SPARQL)}`, {
    headers: { 'User-Agent': UA, Accept: 'text/tab-separated-values' }, signal: AbortSignal.timeout(900_000),
  });
  if (!r.ok) throw new Error(`QLever HTTP ${r.status}`);
  const zeilen = (await r.text()).split('\n').slice(1);
  const out = [];
  const wert = (s) => (s || '').replace(/^"|"(\^\^<[^>]+>|@\w+)?$/g, '').replace(/\\"/g, '"');
  for (const z of zeilen) {
    const [art, name, wkt] = z.split('\t');
    const m = wert(wkt).match(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/);
    if (m && name) out.push([+m[2], +m[1], wert(name), wert(art)]);
  }
  return out;
}
async function ausOverpass(url = 'https://overpass-api.de/api/interpreter') {
  const r = await fetch(url, {
    method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(OVERPASS), signal: AbortSignal.timeout(900_000),
  });
  if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
  return (await r.json()).elements.map((e) => [e.lat, e.lon, e.tags.name, e.tags.highway === 'bus_stop' ? 'bus' : e.tags.railway === 'tram_stop' ? 'tram' : 'bahn']);
}

let stops = null;
const kumi = () => ausOverpass('https://overpass.kumi.systems/api/interpreter');
for (const quelle of [ausQlever, ausOverpass, kumi]) {
  try { stops = await quelle(); if (stops.length > 50_000) break; console.error(`${quelle.name}: nur ${stops.length}`); } catch (e) { console.error(`${quelle.name}: ${e.message}`); }
}
if (!stops || stops.length < 50_000) { console.error('Keine vollständigen Haltestellendaten – bestehende Datei bleibt.'); process.exit(1); }

// Einträge (OSM und offene Quellen) als Bezugspunkte: je Eintrag die nächste Haltestelle bis 1 km (Bahn bei ähnlicher Entfernung bevorzugt)
const punkte = [];
const lies = (p) => (existsSync(new URL(p, import.meta.url)) ? JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')) : null);
for (const e of lies('../data/osm-eintraege.json') || []) punkte.push([e.lat, e.lon]);
for (const e of lies('../data/offene-quellen.json')?.neu || []) punkte.push([e.lat, e.lon]);
const zelle = (lat, lon) => `${Math.floor(lat * 100)}:${Math.floor(lon * 60)}`; // ≈ 1,1 km × 1,1 km
const raster = new Map();
for (const s of stops) { const k = zelle(s[0], s[1]); if (!raster.has(k)) raster.set(k, []); raster.get(k).push(s); }
const km = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r; return 6371 * Math.hypot(x, y); };
const ergebnis = {};
for (const [lat, lon] of punkte) {
  const y = Math.floor(lat * 100), x = Math.floor(lon * 60);
  let best = null;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const [sl, so, name, art] of raster.get(`${y + dy}:${x + dx}`) || []) {
    const d = km(lat, lon, sl, so), wert = d - (art === 'bahn' ? 0.15 : 0);
    if (d <= 1 && (!best || wert < best.wert)) best = { name, art, d, wert };
  }
  if (best) ergebnis[`${(+lat).toFixed(4)},${(+lon).toFixed(4)}`] = [best.name.slice(0, 80), best.art, Math.round(best.d * 100) * 10];
}
const n = Object.keys(ergebnis).length;
writeFileSync(ZIEL, '{\n' + Object.keys(ergebnis).sort().map((k) => `${JSON.stringify(k)}:${JSON.stringify(ergebnis[k])}`).join(',\n') + '\n}\n');
console.error(`${stops.length} Haltestellen gesamt; ${n} von ${punkte.length} Einträgen haben eine Haltestelle im Umkreis von 1 km.`);
