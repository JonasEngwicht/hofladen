#!/usr/bin/env node
// Übernimmt Pflege-Dokumente aus dem Claude-Projekt (Ordner pflege/) nach data/pflege.json.
// Aufruf: node scripts/pflege-uebernehmen.mjs [--schliessungen-erlauben] [--bericht datei.md] dok1.md dok2.md …
// Format der Dokumente: siehe docs/pflege.md. Der Bericht (Markdown) geht nach stdout und optional in eine Datei,
// zusätzlich als JSON nach <bericht>.json. Exit-Code 0 auch bei abgelehnten Einträgen; 1 nur bei Fehlern im Ablauf.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { pflegeIndex, pflegeEinlesen, leerePflege, berichtMarkdown } from './pflege.mjs';

const args = process.argv.slice(2);
const schliessungenErlauben = args.includes('--schliessungen-erlauben');
const bi = args.indexOf('--bericht');
const berichtDatei = bi >= 0 ? args[bi + 1] : null;
const eingang = args.filter((a, i) => !a.startsWith('--') && !(bi >= 0 && i === bi + 1));
if (!eingang.length) { console.log('Keine Pflege-Dokumente übergeben.'); process.exit(0); }

const ZIEL = new URL('../data/pflege.json', import.meta.url);
const STAND = new URL('../data/seiten-stand.json', import.meta.url);
const bestand = existsSync(ZIEL) ? JSON.parse(readFileSync(ZIEL, 'utf8')) : leerePflege();
const index = pflegeIndex(JSON.parse(readFileSync(STAND, 'utf8')));
const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

const { pflege, bericht } = pflegeEinlesen(eingang.map((p) => ({ name: basename(p), text: readFileSync(p, 'utf8') })), bestand, index, { heute, schliessungenErlauben });
const sortiert = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
writeFileSync(ZIEL, JSON.stringify({ aenderungen: sortiert(pflege.aenderungen), neu: sortiert(pflege.neu), geschlossen: sortiert(pflege.geschlossen) }, null, 1) + '\n');

const md = berichtMarkdown(bericht);
console.log(md);
if (berichtDatei) { writeFileSync(berichtDatei, md + '\n'); writeFileSync(`${berichtDatei}.json`, JSON.stringify(bericht, null, 1)); }
