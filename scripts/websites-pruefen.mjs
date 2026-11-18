#!/usr/bin/env node
// Prüft die Startseiten von Höfen aus der Prüfliste (scripts/import-quellen.mjs --pruefliste):
// Erwähnt die eigene Website des Hofs einen Hofladen, Hofverkauf, Automaten o. ä., gilt der Kandidat als bestätigt.
// Ergebnis je URL in data/website-pruefung.json ({ok, status, stand}); geprüft wird höchstens alle 180 Tage.
// Aufruf: node scripts/websites-pruefen.mjs <pruefliste.json> [--max 1500]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { websiteBestaetigt } from './quellen.mjs';

const args = process.argv.slice(2);
const liste = JSON.parse(readFileSync(args[0], 'utf8'));
const max = +(args[args.indexOf('--max') + 1] || 1500) || 1500;
const ziel = new URL('../data/website-pruefung.json', import.meta.url);
const cache = existsSync(ziel) ? JSON.parse(readFileSync(ziel, 'utf8')) : {};
const stand = new Date().toISOString().slice(0, 10);
const UA = 'Mozilla/5.0 (compatible; hofladenliste.de-Pruefung/1.0; +https://hofladenliste.de/quellen/; hofladenliste@gmail.com)';

async function pruefe(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!r.ok || !/html/i.test(r.headers.get('content-type') || 'text/html')) return { ok: false, status: r.status, stand };
    const text = (await r.text()).slice(0, 600000);
    return { ok: websiteBestaetigt(text), status: r.status, stand };
  } catch (e) {
    return { ok: false, status: String(e.name || 'Fehler').slice(0, 30), stand };
  }
}

const offen = liste.slice(0, max);
let i = 0, ok = 0;
async function arbeiter() {
  while (i < offen.length) {
    const url = offen[i++];
    cache[url] = await pruefe(url);
    if (cache[url].ok) ok++;
  }
}
await Promise.all(Array.from({ length: 12 }, arbeiter));
writeFileSync(ziel, JSON.stringify(Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b))), null, 0).replace(/\},"/g, '},\n"') + '\n');
console.log(`Websites geprüft: ${offen.length} (von ${liste.length}), Direktverkauf bestätigt: ${ok}.`);
