#!/usr/bin/env node
// Bericht über mögliche Dubletten: Einträge mit ähnlichem Namen unter 50 m Abstand (z. B. derselbe Hof doppelt in OSM
// oder aus zwei Quellen). Nicht gemeint: Hofladen und Automat am selben Hof mit unterschiedlichem Namen.
// Aufruf nach dem Build: node scripts/dubletten-bericht.mjs [docs/berichte/dubletten.csv]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { distanzKm } from './lib.mjs';
import { namenAehnlich, rasterIndex } from './quellen.mjs';

const roh = JSON.parse(readFileSync(new URL('../src/generated/eintraege.json', import.meta.url), 'utf8'));
const liste = (Array.isArray(roh) ? roh : roh.eintraege).map((e) => ({ lat: e[0], lon: e[1], slug: e[2], titel: e[3], art: e[4], ort: e[5], id: e[15], name: e[16] || e[3] }));
const idx = rasterIndex(liste);
const paare = [];
for (const a of liste) for (const b of idx.nahe(a.lat, a.lon)) {
  if (a.id >= b.id) continue;
  const d = distanzKm(a.lat, a.lon, b.lat, b.lon);
  if (d <= 0.05 && (a.name === b.name || namenAehnlich(a.name, b.name))) paare.push([Math.round(d * 1000), a, b]);
}
paare.sort((x, y) => x[0] - y[0]);
const ziel = process.argv[2] || new URL('../docs/berichte/dubletten.csv', import.meta.url).pathname;
mkdirSync(dirname(ziel), { recursive: true });
const f = (v) => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
writeFileSync(ziel, '﻿' + [['Abstand (m)', 'ID 1', 'Name 1', 'Art 1', 'ID 2', 'Name 2', 'Art 2', 'Ort', 'Seite 1', 'Seite 2'],
  ...paare.map(([d, a, b]) => [d, a.id, a.titel, a.art, b.id, b.titel, b.art, a.ort, `https://hofladenliste.de/hof/${a.slug}/`, `https://hofladenliste.de/hof/${b.slug}/`])]
  .map((z) => z.map(f).join(';')).join('\r\n') + '\r\n');
console.log(`Mögliche Dubletten: ${paare.length} Paare → ${ziel}`);
