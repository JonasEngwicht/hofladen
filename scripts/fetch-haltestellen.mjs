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

// Einträge (OSM und offene Quellen) als Bezugspunkte
const punkte = [];
const lies = (p) => (existsSync(new URL(p, import.meta.url)) ? JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')) : null);
for (const e of lies('../data/osm-eintraege.json') || []) punkte.push([e.lat, e.lon]);
for (const e of lies('../data/offene-quellen.json')?.neu || []) punkte.push([e.lat, e.lon]);
const zelle = (lat, lon) => `${Math.floor(lat * 50)}:${Math.floor(lon * 50)}`; // 0,02°
const raster = new Set(punkte.map(([a, b]) => zelle(a, b)));
const nahGenug = (lat, lon) => {
  const y = Math.floor(lat * 50), x = Math.floor(lon * 50);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (raster.has(`${y + dy}:${x + dx}`)) return true;
  return false;
};
// Gleicher Name und Art innerhalb von etwa 150 m: nur einmal (Haltestelle mit zwei Richtungen)
const gesehen = new Set(), behalten = [];
for (const [lat, lon, name, art] of stops) {
  if (!nahGenug(lat, lon)) continue;
  const key = `${art}|${name}|${Math.round(lat * 700)}|${Math.round(lon * 450)}`;
  if (gesehen.has(key)) continue;
  gesehen.add(key);
  behalten.push([+lat.toFixed(5), +lon.toFixed(5), name.slice(0, 80), art]);
}
behalten.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
writeFileSync(ZIEL, JSON.stringify(behalten).replace(/\],\[/g, '],\n[') + '\n');
console.error(`${stops.length} Haltestellen gesamt, ${behalten.length} im Umkreis von Einträgen gespeichert (Raster ≈ ${UMKREIS_KM} km).`);
