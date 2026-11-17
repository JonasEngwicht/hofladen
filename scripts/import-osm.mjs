#!/usr/bin/env node
// Wandelt Overpass-Rohdaten in data/osm-eintraege.json um.
//
// Aufruf: node scripts/import-osm.mjs <overpass.json> [weitere.json ...]
// Eingabe: Overpass-JSON ({elements:[...]}) oder ein Objekt {BW:[...], BY:[...]} mit Element-Listen.
// Abfrage: siehe README (shop=farm und Hofautomaten, "out center tags").
// Daten: © OpenStreetMap-Mitwirkende, ODbL.
import { readFileSync, writeFileSync } from 'node:fs';
import { ladePlz, naechsterOrt, slugify } from './lib.mjs';

const VENDING = {
  milk: 'Milch', eggs: 'Eier', meat: 'Fleisch', sausages: 'Wurst', cheese: 'Käse',
  potatoes: 'Kartoffeln', honey: 'Honig', fruit: 'Obst', vegetables: 'Gemüse',
  food: 'Lebensmittel', bread: 'Brot', noodles: 'Nudeln', pasta: 'Nudeln', jam: 'Marmelade',
  drinks: 'Getränke', juice: 'Saft', apple_juice: 'Apfelsaft', ice_cream: 'Eis', flowers: 'Blumen',
  farm: 'Hofprodukte', regional_products: 'Regionale Produkte', local_products: 'Regionale Produkte',
};
const HOF_HINWEIS = /hof|bauer|regio|milch|landw|farm|\bgut\b|direkt|eier|bio|metzg|fleisch|imker|honig|obst|kartoffel|käse|kaese|molkerei|schäferei|gärtnerei|ziegen/i;

function automatArt(sorten) {
  const s = new Set(sorten);
  if (s.size === 1 && s.has('milk')) return 'Milchtankstelle';
  if (s.size === 1 && s.has('eggs')) return 'Eierautomat';
  if ([...s].every((x) => ['meat', 'sausages'].includes(x))) return 'Fleischautomat';
  if (s.size === 1 && s.has('potatoes')) return 'Kartoffelautomat';
  return 'Regiomat';
}

function sauberUrl(u) {
  if (!u) return null;
  u = u.split(';')[0].trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  try { return new URL(u).href; } catch { return null; }
}

function erstes(tags, ...keys) {
  for (const k of keys) if (tags[k]) return tags[k].split(';')[0].trim();
  return null;
}

const dateien = process.argv.slice(2);
if (!dateien.length) { console.error('Aufruf: node scripts/import-osm.mjs <overpass.json>'); process.exit(1); }

const elemente = new Map();
for (const f of dateien) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const listen = Array.isArray(j.elements) ? [j.elements] : Object.values(j);
  for (const l of listen) for (const el of l) elemente.set(el.type + '/' + el.id, el);
}

const { kreise, plz, raster } = ladePlz(new URL('../data/quellen/plz-de.csv', import.meta.url));
const stat = { gesamt: elemente.size, verworfen: {}, hofladen: 0, automat: 0 };
const verwirf = (g) => { stat.verworfen[g] = (stat.verworfen[g] || 0) + 1; };
const eintraege = [];

for (const [osm, el] of elemente) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) { verwirf('ohne Koordinaten'); continue; }
  if (Object.keys(t).some((k) => /^(disused|abandoned|was|removed|razed|demolished):/.test(k))) { verwirf('stillgelegt'); continue; }

  let typ, sorten = [];
  if (t.shop === 'farm') typ = 'hofladen';
  else if (t.amenity === 'vending_machine') {
    typ = 'automat';
    sorten = (t.vending || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    const nurFood = sorten.every((s) => ['food', 'drinks', 'sweets', 'snacks', 'ice_cream', 'cigarettes', 'coffee'].includes(s));
    const text = [t.name, t.operator, t.brand, t.description].filter(Boolean).join(' ');
    if (nurFood && !HOF_HINWEIS.test(text)) { verwirf('Automat ohne Hofbezug'); continue; }
  } else { verwirf('anderer Typ'); continue; }

  const pc = (t['addr:postcode'] || '').trim();
  const kand = /^\d{5}$/.test(pc) ? plz.get(pc) : null;
  const treffer = naechsterOrt(raster, lat, lon, kand) || naechsterOrt(raster, lat, lon);
  // Die Abfrage liefert nur Objekte innerhalb Deutschlands; ohne PLZ-Ort im Umkreis von ca. 30 km verwerfen.
  if (!treffer) { verwirf('kein PLZ-Ort in der Nähe'); continue; }
  const kreis = kreise.get(treffer.ort.kreis);

  const strasse = [t['addr:street'] || t['addr:place'], t['addr:housenumber']].filter(Boolean).join(' ') || null;
  const ort = t['addr:city'] || t['addr:suburb'] || null;
  const art = typ === 'automat' ? automatArt(sorten) : 'Hofladen';
  const produkte = typ === 'automat'
    ? [...new Set(sorten.map((s) => VENDING[s]).filter(Boolean))]
    : [...new Set((t.produce || t.product || '').split(';').map((s) => s.trim()).filter(Boolean))];

  eintraege.push({
    osm,
    typ,
    art,
    name: t.name ? t.name.trim() : null,
    strasse,
    plz: /^\d{5}$/.test(pc) ? pc : null,
    ort,
    ortNah: treffer.ort.ort,
    plzNah: treffer.ort.plz,
    kreis: kreis.code,
    lat: +lat.toFixed(6),
    lon: +lon.toFixed(6),
    oeffnungszeiten: t.opening_hours || null,
    telefon: erstes(t, 'contact:phone', 'phone', 'contact:mobile', 'mobile'),
    email: erstes(t, 'contact:email', 'email'),
    website: sauberUrl(erstes(t, 'contact:website', 'website', 'url')),
    facebook: sauberUrl(erstes(t, 'contact:facebook', 'facebook')),
    instagram: sauberUrl(erstes(t, 'contact:instagram', 'instagram')),
    betreiber: t.operator || null,
    beschreibung: t.description || null,
    bio: t.organic === 'only' || t.organic === 'yes' ? true : null,
    produkte: produkte.length ? produkte : null,
    selbstbedienung: t.self_service === 'yes' || typ === 'automat' ? true : null,
  });
  stat[typ]++;
}

eintraege.sort((a, b) => a.osm.localeCompare(b.osm, 'en', { numeric: true }));
const ziel = new URL('../data/osm-eintraege.json', import.meta.url);
writeFileSync(ziel, JSON.stringify(eintraege, null, 0).replace(/\},\{/g, '},\n{') + '\n');
const mit = (f) => eintraege.filter((e) => e[f]).length;
console.error(JSON.stringify({ ...stat, behalten: eintraege.length,
  mitName: mit('name'), mitAdresse: mit('strasse'), mitOeffnungszeiten: mit('oeffnungszeiten'),
  mitTelefon: mit('telefon'), mitWebsite: mit('website'), mitEmail: mit('email') }, null, 2));
