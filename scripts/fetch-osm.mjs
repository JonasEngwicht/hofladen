#!/usr/bin/env node
// Holt alle Hofläden (shop=farm) und Hofautomaten in Deutschland aus OpenStreetMap
// über den QLever-Dienst der Universität Freiburg (osm2rdf, deutlich schneller als Overpass).
// Ausgabe im Overpass-Format: {elements:[{type,id,lat,lon,tags}]}.
//
// Aufruf: node scripts/fetch-osm.mjs [ausgabe.json]   (Standard: data/quellen/osm-roh.json)
// Daten: © OpenStreetMap-Mitwirkende, ODbL.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ENDPUNKT = 'https://qlever.dev/api/osm-planet';
const ziel = process.argv[2] || new URL('../data/quellen/osm-roh.json', import.meta.url).pathname;

const PREFIX = `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX ogc: <http://www.opengis.net/rdf#>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
`;
// Relation 51477 = Deutschland
const AUSWAHL = `{ SELECT DISTINCT ?osm WHERE { osmrel:51477 ogc:sfContains ?osm .
  { ?osm osmkey:shop "farm" } UNION
  { ?osm osmkey:amenity "vending_machine" . ?osm osmkey:vending ?vd .
    FILTER(REGEX(?vd, "milk|eggs|meat|food|farm|potato|sausage|cheese|honey|fruit|vegetable")) } } }`;

async function abfrage(sparql, versuche = 4) {
  for (let i = 1; i <= versuche; i++) {
    try {
      const r = await fetch(ENDPUNKT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sparql-query',
          Accept: 'application/sparql-results+json',
          'User-Agent': 'hofladenliste.de-datenimport (https://github.com/JonasEngwicht/hofladen)',
        },
        body: PREFIX + sparql,
        signal: AbortSignal.timeout(180_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return (await r.json()).results.bindings;
    } catch (e) {
      console.error(`Versuch ${i}/${versuche} fehlgeschlagen: ${e.message}`);
      if (i === versuche) throw e;
      await new Promise((res) => setTimeout(res, 10_000 * i));
    }
  }
}

const OSM = 'https://www.openstreetmap.org/';
const KEY = OSM + 'wiki/Key:';
const tags = await abfrage(`SELECT ?osm ?k ?v WHERE { ${AUSWAHL} ?osm ?k ?v . FILTER(STRSTARTS(STR(?k), "${KEY}")) }`);
const geo = await abfrage(`SELECT ?osm ?wkt WHERE { ${AUSWAHL} ?osm geo:hasGeometry/geo:asWKT ?wkt }`);

const el = new Map();
for (const b of tags) {
  const id = b.osm.value.replace(OSM, '');
  if (!el.has(id)) { const [type, n] = id.split('/'); el.set(id, { type, id: +n, tags: {} }); }
  el.get(id).tags[b.k.value.replace(KEY, '')] = b.v.value;
}
for (const b of geo) {
  const e = el.get(b.osm.value.replace(OSM, ''));
  if (!e) continue;
  const punkte = b.wkt.value.match(/-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?/g) || [];
  let sx = 0, sy = 0;
  for (const p of punkte) { const [x, y] = p.split(' ').map(Number); sx += x; sy += y; }
  if (punkte.length) { e.lat = +(sy / punkte.length).toFixed(7); e.lon = +(sx / punkte.length).toFixed(7); }
}
const elements = [...el.values()];
if (elements.length < 1000) throw new Error(`Nur ${elements.length} Objekte erhalten – Abbruch, damit keine unvollständigen Daten übernommen werden.`);
mkdirSync(dirname(ziel), { recursive: true });
writeFileSync(ziel, JSON.stringify({ generator: `QLever osm-planet, abgerufen ${new Date().toISOString()}`, elements }));
console.error(`${elements.length} Objekte gespeichert in ${ziel}`);
