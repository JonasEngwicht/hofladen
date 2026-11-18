#!/usr/bin/env node
// Wandelt Overpass-Rohdaten in data/osm-eintraege.json um.
//
// Aufruf: node scripts/import-osm.mjs <overpass.json> [weitere.json ...]
// Eingabe: Overpass-JSON ({elements:[...]}) oder ein Objekt {BW:[...], BY:[...]} mit Element-Listen.
// Abfrage: siehe README (shop=farm und Hofautomaten, "out center tags").
// Daten: © OpenStreetMap-Mitwirkende, ODbL.
import { readFileSync, writeFileSync } from 'node:fs';
import { ladePlz, naechsterOrt, slugify } from './lib.mjs';
import { automatArt, verbandAus, merkmaleAus } from './osm-merkmale.mjs';

const VENDING = {
  milk: 'Milch', eggs: 'Eier', meat: 'Fleisch', sausages: 'Wurst', cheese: 'Käse',
  potatoes: 'Kartoffeln', honey: 'Honig', fruit: 'Obst', vegetables: 'Gemüse',
  food: 'Lebensmittel', bread: 'Brot', noodles: 'Nudeln', pasta: 'Nudeln', jam: 'Marmelade',
  drinks: 'Getränke', juice: 'Saft', apple_juice: 'Apfelsaft', ice_cream: 'Eis', flowers: 'Blumen',
  farm: 'Hofprodukte', regional_products: 'Regionale Produkte', local_products: 'Regionale Produkte',
};
const HOF_HINWEIS = /hof|bauer|regio|milch|landw|farm|\bgut\b|direkt|eier|bio|metzg|fleisch|imker|honig|obst|kartoffel|käse|kaese|molkerei|schäferei|gärtnerei|ziegen/i;


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

// Zahlungsarten aus payment:*=yes, zusammengefasst zu verständlichen Gruppen
const ZAHLUNG = [
  ['bar', ['cash', 'coins', 'notes']],
  ['girocard', ['girocard', 'debit_cards', 'maestro', 'v_pay']],
  ['kreditkarte', ['credit_cards', 'visa', 'mastercard', 'american_express']],
  ['kontaktlos', ['contactless', 'apple_pay', 'google_pay']],
  ['paypal', ['paypal']],
  ['ueberweisung', ['wire_transfer', 'sepa', 'bank_transfer']],
];
function zahlungsarten(t) {
  const ja = new Set(Object.entries(t).filter(([k, v]) => k.startsWith('payment:') && v === 'yes').map(([k]) => k.slice(8)));
  const arten = ZAHLUNG.filter(([, keys]) => keys.some((k) => ja.has(k))).map(([name]) => name);
  return arten.length ? arten : null;
}
// Letzte Prüfung vor Ort laut OSM (check_date bzw. survey:date), Format JJJJ-MM-TT
function pruefDatum(t) {
  const d = [t.check_date, t['check_date:opening_hours'], t['survey:date']].filter((x) => /^\d{4}-\d{2}(-\d{2})?$/.test(x || '')).sort().pop();
  return d || null;
}

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
  } else if (t.craft === 'beekeeper') {
    // Imker ohne Namen sind meist nur Bienenstände – keine Verkaufsstelle
    if (!t.name) { verwirf('Imker ohne Namen'); continue; }
    typ = 'hofladen';
  } else if (t.self_harvesting === 'yes' || t.pick_your_own === 'yes') {
    // Selbsternte-Felder nur mit Namen oder bekannter Frucht (sonst nicht auffindbar)
    if (!t.name && !t.crop && !t.produce) { verwirf('Selbsternte ohne Namen und Frucht'); continue; }
    typ = 'hofladen';
  }
  else if (t.amenity === 'cafe') typ = 'hofladen';
  else { verwirf('anderer Typ'); continue; }

  const pc = (t['addr:postcode'] || '').trim();
  const kand = /^\d{5}$/.test(pc) ? (plz.get(pc) || []).filter((o) => !o.org) : null;
  const treffer = (kand && kand.length ? naechsterOrt(raster, lat, lon, kand) : null) || naechsterOrt(raster, lat, lon);
  // Die Abfrage liefert nur Objekte innerhalb Deutschlands; ohne PLZ-Ort im Umkreis von ca. 30 km verwerfen.
  if (!treffer) { verwirf('kein PLZ-Ort in der Nähe'); continue; }
  const kreis = kreise.get(treffer.ort.kreis);

  const strasse = [t['addr:street'] || t['addr:place'], t['addr:housenumber']].filter(Boolean).join(' ') || null;
  const ort = t['addr:city'] || t['addr:suburb'] || null;
  const art = typ === 'automat' ? automatArt(sorten) : t.shop === 'farm' ? 'Hofladen'
    : t.craft === 'beekeeper' ? 'Imkerei' : (t.self_harvesting === 'yes' || t.pick_your_own === 'yes') ? 'Selbstpflücken' : 'Hofcafé';
  const produkte = typ === 'automat'
    ? [...new Set(sorten.map((s) => VENDING[s]).filter(Boolean))]
    : [...new Set((t.produce || t.product || t.crop || '').split(';').map((s) => s.trim()).filter(Boolean))];

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
    zahlung: zahlungsarten(t),
    geprueft: pruefDatum(t),
    verband: verbandAus(t),
    merkmale: merkmaleAus(t),
  });
  stat[typ]++;
}

eintraege.sort((a, b) => a.osm.localeCompare(b.osm, 'en', { numeric: true }));
const ziel = new URL('../data/osm-eintraege.json', import.meta.url);
// Schutz vor unvollständigen Antworten einzelner Overpass-Server: Wenn viele bisherige Einträge
// auf einmal fehlen, nichts überschreiben (Lauf schlägt fehl, nächster Lauf versucht es erneut).
try {
  const bisher = JSON.parse(readFileSync(ziel, 'utf8'));
  const neuIds = new Set(eintraege.map((e) => e.osm));
  const weg = bisher.filter((e) => !neuIds.has(e.osm)).length;
  const grenze = Math.max(60, Math.round(bisher.length * 0.02));
  console.error(`Abgleich: ${bisher.length} bisher, ${eintraege.length} neu, ${weg} entfallen (Grenze ${grenze}).`);
  if (weg > grenze && process.env.ERLAUBE_SCHWUND !== '1') {
    console.error('Zu viele Einträge entfallen – vermutlich unvollständige Antwort. Daten werden nicht überschrieben.');
    process.exit(1);
  }
} catch (err) { if (err.code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err; }
writeFileSync(ziel, JSON.stringify(eintraege, null, 0).replace(/\},\{/g, '},\n{') + '\n');
const mit = (f) => eintraege.filter((e) => e[f]).length;
console.error(JSON.stringify({ ...stat, behalten: eintraege.length,
  mitName: mit('name'), mitAdresse: mit('strasse'), mitOeffnungszeiten: mit('oeffnungszeiten'),
  mitTelefon: mit('telefon'), mitWebsite: mit('website'), mitEmail: mit('email') }, null, 2));
