#!/usr/bin/env node
// Liste der dünnen Hofseiten (noindex, nicht in der Sitemap), zum Befüllen durch Jonas oder Agenten.
// Dünn = ohne Kontakt (Telefon, Website, E-Mail), ohne Straße und ohne Öffnungszeiten (Regel in scripts/build/daten.mjs).
// Sobald eine dieser Angaben über pflege/ ergänzt ist, wird die Seite beim nächsten Build wieder indexiert
// und verschwindet beim nächsten Lauf dieses Skripts aus der Liste.
//
// Ergebnis: docs/duenne-hofseiten.csv (Semikolon, UTF-8 mit BOM, öffnet direkt in Excel/Sheets).
// Die Spalten ab „Straße“ sind leer und zum Ausfüllen gedacht; übernommen werden sie über pflege/ (docs/pflege.md),
// nicht aus dieser Datei – sie wird bei jedem Lauf neu geschrieben.
//
// Aufruf: LISTE_EXPORT=/tmp/liste.json node scripts/build.mjs && node scripts/duenne-liste.mjs /tmp/liste.json [ziel.csv]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const SPALTEN = ['ID', 'Name', 'Art', 'PLZ', 'Ort', 'Kreis', 'Bundesland', 'Angebot', 'Seite', 'Quelle',
  'Straße', 'Telefon', 'Website', 'E-Mail', 'Öffnungszeiten', 'Geschlossen', 'Notiz'];

// Einträge aus dem Listen-Export (LISTE_EXPORT), die nicht indexiert sind, sortiert nach Bundesland, Kreis, Ort, Name
export function duenneZeilen(liste) {
  const vgl = (a, b) => a.localeCompare(b, 'de');
  return liste.filter((e) => e.indexiert === 'nein')
    .sort((a, b) => vgl(a.bundesland, b.bundesland) || vgl(a.kreis, b.kreis) || vgl(a.ort, b.ort) || vgl(a.name, b.name))
    .map((e) => [e.sid, e.name, e.art, e.plz, e.ort, e.kreis, e.bundesland, e.angebot, e.seite, e.quelle, '', '', '', '', '', '', '']);
}

const feld = (v) => { const t = String(v ?? ''); return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export const csv = (zeilen) => '﻿' + [SPALTEN, ...zeilen].map((z) => z.map(feld).join(';')).join('\r\n') + '\r\n';

if (import.meta.url === `file://${process.argv[1]}`) {
  const liste = JSON.parse(readFileSync(process.argv[2] || '/tmp/liste.json', 'utf8'));
  const ziel = process.argv[3] || join(ROOT, 'docs', 'duenne-hofseiten.csv');
  const zeilen = duenneZeilen(liste);
  mkdirSync(dirname(ziel), { recursive: true });
  writeFileSync(ziel, csv(zeilen));
  const proLand = {};
  for (const z of zeilen) proLand[z[6]] = (proLand[z[6]] || 0) + 1;
  console.log(`Dünne Hofseiten (noindex): ${zeilen.length} von ${liste.length} Einträgen`);
  for (const [l, n] of Object.entries(proLand).sort((a, b) => b[1] - a[1])) console.log(`- ${l}: ${n}`);
}
