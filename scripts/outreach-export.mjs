#!/usr/bin/env node
// Outreach-Liste: Bearbeiten- und Übernehmen-Links je Hof als CSV (Semikolon, UTF-8 mit BOM für Excel).
// Eingabe: Slugs, stabile IDs oder Detail-URLs als Argumente oder in einer Datei (eine pro Zeile).
// Aufruf: node scripts/outreach-export.mjs slug1 https://hofladenliste.de/hof/slug2/ > outreach.csv
//         node scripts/outreach-export.mjs --datei liste.txt > outreach.csv
// Vorher einmal bauen (node scripts/build.mjs), damit src/generated/ aktuell ist.
// Online geht das auch über die Verwaltung: POST /api/verwaltung/export (Liste im Text, mit ADMIN_TOKEN).
import { readFileSync } from 'node:fs';
import { index, outreachCsv } from '../src/eintraege.js';

const lies = (n) => JSON.parse(readFileSync(new URL(`../src/generated/${n}.json`, import.meta.url), 'utf8'));
const args = process.argv.slice(2);
const i = args.indexOf('--datei');
const eingaben = i >= 0 ? readFileSync(args[i + 1], 'utf8').split(/\r?\n/) : args;
if (!eingaben.filter(Boolean).length) { console.error('Bitte Slugs, IDs oder URLs angeben.'); process.exit(1); }
const domain = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8')).domain;
process.stdout.write(outreachCsv(eingaben, index(lies('eintraege'), lies('routen').alteSlugs || {}), domain, lies('vollstaendigkeit')));
