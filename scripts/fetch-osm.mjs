#!/usr/bin/env node
// Holt alle Hofläden (shop=farm), Honigläden (shop=honey) und Hofautomaten (auch Rohmilch-, Regiomat- und Eierautomaten nach Name/Betreiber) in Deutschland aus OpenStreetMap
// über die Overpass API, ersatzweise über QLever (Universität Freiburg).
// Ausgabe im Overpass-Format: {elements:[{type,id,lat,lon,tags}]}.
//
// Aufruf: node scripts/fetch-osm.mjs [ausgabe.json]   (Standard: data/quellen/osm-roh.json)
//         node scripts/fetch-osm.mjs --maerkte [ausgabe.json]   Wochenmärkte (amenity=marketplace)
// Daten: © OpenStreetMap-Mitwirkende, ODbL.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ENDPUNKT = 'https://qlever.dev/api/osm-planet';
const MAERKTE = process.argv.includes('--maerkte');
const ziel = process.argv.slice(2).find((a) => !a.startsWith('--')) || new URL(MAERKTE ? '../data/quellen/maerkte-roh.json' : '../data/quellen/osm-roh.json', import.meta.url).pathname;
const MINDESTENS = MAERKTE ? 300 : 1000;

const PREFIX = `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX ogc: <http://www.opengis.net/rdf#>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
`;
// Relation 51477 = Deutschland
const AUSWAHL = MAERKTE
  ? `{ SELECT DISTINCT ?osm WHERE { osmrel:51477 ogc:sfContains ?osm . ?osm osmkey:amenity "marketplace" } }`
  : `{ SELECT DISTINCT ?osm WHERE { osmrel:51477 ogc:sfContains ?osm .
  { ?osm osmkey:shop "farm" } UNION
  { ?osm osmkey:amenity "vending_machine" . ?osm osmkey:vending ?vd .
    FILTER(REGEX(?vd, "milk|eggs|meat|food|farm|potato|sausage|cheese|honey|fruit|vegetable|noodles|pasta|groceries")) } UNION
  { ?osm osmkey:amenity "vending_machine" . ?osm osmkey:drink:raw_milk "yes" } UNION
  { ?osm osmkey:amenity "vending_machine" . ?osm osmkey:name ?an .
    FILTER(REGEX(?an, "regiomat|hofautomat|bauernautomat|eierautomat|milchtankstelle|milchautomat|hofladen", "i")) } UNION
  { ?osm osmkey:amenity "vending_machine" . ?osm osmkey:operator ?ao .
    FILTER(REGEX(?ao, "regiomat|hofautomat|bauernautomat", "i")) } UNION
  { ?osm osmkey:shop "honey" } UNION
  { ?osm osmkey:craft "beekeeper" } UNION { ?osm osmkey:self_harvesting "yes" } UNION { ?osm osmkey:pick_your_own "yes" } UNION
  { ?osm osmkey:amenity "cafe" . ?osm osmkey:name ?nm . FILTER(REGEX(?nm, "hofcaf|bauerncaf|hof-caf|bauernhofcaf|landcaf", "i")) } } }`;

const UA = 'hofladenliste.de-datenimport (https://github.com/JonasEngwicht/hofladen; hofladenliste@gmail.com)';

async function holen(url, opts, versuche, name) {
  for (let i = 1; i <= versuche; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...opts.headers }, signal: AbortSignal.timeout(600_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 160)}`);
      return await r.json();
    } catch (e) {
      console.error(`${name}: Versuch ${i}/${versuche} fehlgeschlagen: ${e.message}`);
      if (i === versuche) throw e;
      await new Promise((res) => setTimeout(res, 45_000 * i));
    }
  }
}

const OSM = 'https://www.openstreetmap.org/';
const KEY = OSM + 'wiki/Key:';

// Quelle 1: QLever (schnell). GET-Variante, weil manche Netze POST blockieren.
async function ausQlever() {
  const q = async (sparql) => (await holen(`${ENDPUNKT}?query=${encodeURIComponent(PREFIX + sparql)}`,
    { headers: { Accept: 'application/sparql-results+json' } }, 3, 'QLever')).results.bindings;
  const tags = await q(`SELECT ?osm ?k ?v WHERE { ${AUSWAHL} ?osm ?k ?v . FILTER(STRSTARTS(STR(?k), "${KEY}")) }`);
  const geo = await q(`SELECT ?osm ?wkt WHERE { ${AUSWAHL} ?osm geo:hasGeometry/geo:asWKT ?wkt }`);
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
  return { quelle: 'QLever osm-planet', elements: [...el.values()] };
}

// Quelle 2: Overpass API (langsamer, aber unabhängig).
// maps.mail.ru war zuletzt am zuverlässigsten, wenn overpass-api.de ausgelastet ist
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const OVERPASS_Q = MAERKTE
  ? `[out:json][timeout:900];area["ISO3166-1"="DE"][admin_level=2]->.de;nwr["amenity"="marketplace"](area.de);out center tags;`
  : `[out:json][timeout:900];area["ISO3166-1"="DE"][admin_level=2]->.de;(nwr["shop"="farm"](area.de);nwr["amenity"="vending_machine"]["vending"~"milk|eggs|meat|food|farm|potato|sausage|cheese|honey|fruit|vegetable|noodles|pasta|groceries"](area.de);nwr["amenity"="vending_machine"]["drink:raw_milk"="yes"](area.de);nwr["amenity"="vending_machine"]["name"~"regiomat|hofautomat|bauernautomat|eierautomat|milchtankstelle|milchautomat|hofladen",i](area.de);nwr["amenity"="vending_machine"]["operator"~"regiomat|hofautomat|bauernautomat",i](area.de);nwr["shop"="honey"](area.de);nwr["craft"="beekeeper"]["name"](area.de);nwr["self_harvesting"="yes"](area.de);nwr["pick_your_own"="yes"](area.de);nwr["amenity"="cafe"]["name"~"hofcaf|bauerncaf|hof-caf|bauernhofcaf|landcaf",i](area.de););out center tags;`;
async function ausOverpass(url) {
  const j = await holen(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(OVERPASS_Q) }, 3, 'Overpass ' + new URL(url).host);
  const elements = j.elements.map((e) => ({ type: e.type, id: e.id, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, tags: e.tags || {} }));
  return { quelle: 'Overpass ' + new URL(url).host, elements };
}

let ergebnis = null;
// Overpass zuerst (tagesaktuell), QLever als Ausweichquelle (Datenstand kann einige Monate alt sein)
for (const quelle of [...OVERPASS.map((u) => () => ausOverpass(u)), ausQlever]) {
  try {
    const r = await quelle();
    if (r.elements.length >= MINDESTENS) { ergebnis = r; break; }
    console.error(`${r.quelle}: nur ${r.elements.length} Objekte, nächste Quelle`);
  } catch (e) { console.error(`Quelle fehlgeschlagen: ${e.message}`); }
}
if (!ergebnis) throw new Error('Keine Quelle lieferte vollständige Daten – bestehende Daten bleiben unverändert.');
const { elements } = ergebnis;
mkdirSync(dirname(ziel), { recursive: true });
writeFileSync(ziel, JSON.stringify({ generator: `${ergebnis.quelle}, abgerufen ${new Date().toISOString()}`, elements }));
console.error(`${elements.length} Objekte aus ${ergebnis.quelle} gespeichert in ${ziel}`);
