#!/usr/bin/env node
// Wandelt Wochenmärkte aus OpenStreetMap (amenity=marketplace, scripts/fetch-osm.mjs --maerkte) in data/osm-maerkte.json um.
// Flohmärkte, Weihnachts- und Kunstmärkte sowie Plätze ohne Namen und ohne Marktzeiten werden ausgelassen.
// Aufruf: node scripts/import-maerkte.mjs [data/quellen/maerkte-roh.json]
// Daten: © OpenStreetMap-Mitwirkende, ODbL.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ladePlz, naechsterOrt, istOrganisation } from './lib.mjs';

const roh = JSON.parse(readFileSync(process.argv[2] || new URL('../data/quellen/maerkte-roh.json', import.meta.url), 'utf8'));
const { kreise, plz, raster } = ladePlz(new URL('../data/quellen/plz-de.csv', import.meta.url));
const KEIN_WOCHENMARKT = /floh|tr(ö|oe)del|antik|weihnacht|advent|christkindl|kunst|handwerker|kirmes|kram|jahrmarkt|herbstmarkt|ostermarkt|nachtflohmarkt|second|kinderkleider|b(ü|ue)cher/i;
const stat = { gesamt: roh.elements.length, verworfen: 0 };
const maerkte = [];
const url = (u) => { if (!u) return null; u = u.split(';')[0].trim(); if (!/^https?:\/\//i.test(u)) u = `https://${u}`; try { return new URL(u).href; } catch { return null; } };
for (const el of roh.elements) {
  const t = el.tags || {};
  if (el.lat == null || el.lon == null) { stat.verworfen++; continue; }
  if (Object.keys(t).some((k) => /^(disused|abandoned|was|removed):/.test(k))) { stat.verworfen++; continue; }
  const name = (t.name || '').trim();
  const text = [name, t.description, t['market'], t['marketplace']].filter(Boolean).join(' ');
  if (KEIN_WOCHENMARKT.test(text) || t.second_hand === 'only' || t.flea_market === 'yes') { stat.verworfen++; continue; }
  if (!name && !t.opening_hours) { stat.verworfen++; continue; }
  const pc = (t['addr:postcode'] || '').trim();
  const kand = /^\d{5}$/.test(pc) ? (plz.get(pc) || []).filter((o) => !o.org) : null;
  let tr = (kand && kand.length ? naechsterOrt(raster, el.lat, el.lon, kand) : null) || naechsterOrt(raster, el.lat, el.lon);
  if (!tr) { stat.verworfen++; continue; }
  if (istOrganisation(tr.ort.ort)) tr = naechsterOrt(raster, el.lat, el.lon) || tr;
  const ort = t['addr:city'] || null;
  maerkte.push({
    osm: `${el.type}/${el.id}`,
    name: name || null,
    bio: t.organic === 'only' || /\bbio|öko/i.test(name) || null,
    strasse: [t['addr:street'] || t['addr:place'], t['addr:housenumber']].filter(Boolean).join(' ') || null,
    plz: /^\d{5}$/.test(pc) ? pc : null, ort,
    ortNah: tr.ort.ort, plzNah: tr.ort.plz, kreis: kreise.get(tr.ort.kreis).code,
    lat: +(+el.lat).toFixed(6), lon: +(+el.lon).toFixed(6),
    oeffnungszeiten: t.opening_hours || null, website: url(t['contact:website'] || t.website), betreiber: t.operator || null,
    beschreibung: t.description || null, ueberdacht: t.covered === 'yes' || /markthalle/i.test(name) || null,
  });
}
maerkte.sort((a, b) => a.osm.localeCompare(b.osm, 'en', { numeric: true }));
const ziel = new URL('../data/osm-maerkte.json', import.meta.url);
if (existsSync(ziel)) {
  const bisher = JSON.parse(readFileSync(ziel, 'utf8'));
  if (maerkte.length < bisher.length * 0.8 && process.env.ERLAUBE_SCHWUND !== '1') {
    console.error(`Nur ${maerkte.length} statt bisher ${bisher.length} Märkte – vermutlich unvollständige Antwort, nichts überschrieben.`);
    process.exit(1);
  }
}
writeFileSync(ziel, JSON.stringify(maerkte).replace(/\},\{/g, '},\n{') + '\n');
console.log(`Märkte: ${stat.gesamt} aus OSM, ${stat.verworfen} verworfen, ${maerkte.length} übernommen (${maerkte.filter((m) => m.oeffnungszeiten).length} mit Marktzeiten).`);
