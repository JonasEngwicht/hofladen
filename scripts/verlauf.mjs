#!/usr/bin/env node
// Hält den Verlauf der Eintragszahlen fest (data/verlauf.json), einmal pro Tag, für /statistik/.
// Läuft im Workflow „Daten aktualisieren“ nach dem Build (liest src/generated/eintraege.json).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DATEI = new URL('../data/verlauf.json', import.meta.url);
const E = JSON.parse(readFileSync(new URL('../src/generated/eintraege.json', import.meta.url), 'utf8'));
const M = JSON.parse(readFileSync(new URL('../data/osm-maerkte.json', import.meta.url), 'utf8'));
const AUTOMAT = new Set(['Regiomat', 'Milchtankstelle', 'Eierautomat', 'Fleischautomat', 'Kartoffelautomat', 'Honigautomat', 'Nudelautomat']);
const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const verlauf = existsSync(DATEI) ? JSON.parse(readFileSync(DATEI, 'utf8')) : [];
const zeile = { datum: heute, eintraege: E.length, hoefe: E.filter((e) => !AUTOMAT.has(e[4])).length, automaten: E.filter((e) => AUTOMAT.has(e[4])).length,
  maerkte: (M.eintraege || M).length, mitZeiten: E.filter((e) => e[6]).length };
const i = verlauf.findIndex((v) => v.datum === heute);
if (i >= 0) verlauf[i] = zeile; else verlauf.push(zeile);
writeFileSync(DATEI, JSON.stringify(verlauf, null, 1) + '\n');
console.log(`Verlauf: ${verlauf.length} Tage, heute ${zeile.eintraege} Einträge.`);
