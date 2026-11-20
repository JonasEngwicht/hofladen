#!/usr/bin/env node
// Reicht ausgewählte Seiten per IndexNow bei Bing (und den anderen IndexNow-Suchmaschinen) ein.
// Aufruf: BING_API_KEY=… node scripts/bing-melden.mjs [--datei data/bing-wichtig.txt] [--max 100]
// BING_API_KEY ist der in Bing Webmaster (IndexNow → Get started) erzeugte Schlüssel.
// Die zugehörige Schlüsseldatei liegt öffentlich unter /<schlüssel>.txt (static/), so verlangt es das Protokoll.
// Die Datei enthält eine URL oder einen Pfad (/bayern/) pro Zeile; # leitet Kommentare ein.
// Vor dem Senden prüft das Skript, ob die Schlüsseldatei live erreichbar ist und den Schlüssel enthält.
// Probelauf ohne Netz: BING_TROCKEN=1.
import { readFileSync } from 'node:fs';

const HOST = 'hofladenliste.de';
const SITE = `https://${HOST}`;
const API = 'https://api.indexnow.org/indexnow';
const args = process.argv.slice(2);
const wert = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const datei = wert('--datei') || new URL('../data/bing-wichtig.txt', import.meta.url).pathname;
const max = +(wert('--max') || 0) || Infinity;
const trocken = !!process.env.BING_TROCKEN;
// Leerzeichen, Zeilenumbrüche oder Anführungszeichen aus dem Secret entfernen
const key = (process.env.BING_API_KEY || '').trim().replace(/^["']+|["']+$/g, '').trim();

if (!key && !trocken) {
  console.error('BING_API_KEY fehlt (GitHub-Secret BING_API_KEY anlegen).');
  process.exit(1);
}
if (key && !/^[0-9a-zA-Z-]{8,128}$/.test(key)) {
  console.error(`BING_API_KEY hat kein gültiges IndexNow-Format (${key.length} Zeichen; erlaubt: a-z, A-Z, 0-9, -; 8 bis 128 Zeichen).`);
  process.exit(1);
}

function leseListe(text) {
  const urls = [];
  for (const roh of text.split('\n')) {
    const z = roh.replace(/#.*/, '').trim();
    if (!z) continue;
    const u = z.startsWith('http') ? z : `${SITE}${z.startsWith('/') ? '' : '/'}${z}`;
    if (!u.startsWith(`${SITE}/`)) throw new Error(`Fremde URL in der Liste: ${u}`);
    if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

const BEDEUTUNG = { 200: 'OK', 202: 'angenommen, Schlüssel wird noch geprüft', 400: 'ungültiges Format', 403: 'Schlüssel ungültig oder Schlüsseldatei nicht gefunden', 422: 'URLs passen nicht zum Host oder Schlüssel', 429: 'zu viele Anfragen' };

const urls = leseListe(readFileSync(datei, 'utf8')).slice(0, max);
const keyLocation = `${SITE}/${key}.txt`;
console.log(`${urls.length} URLs werden per IndexNow gemeldet (Schlüssel: ${key.length} Zeichen).`);
if (!urls.length) process.exit(0);

if (!trocken) {
  const r = await fetch(keyLocation);
  const inhalt = r.ok ? (await r.text()).trim() : '';
  if (inhalt !== key) {
    console.error(`Schlüsseldatei ist nicht live oder enthält einen anderen Schlüssel (HTTP ${r.status}). Erst static/<schlüssel>.txt deployen.`);
    process.exit(1);
  }
  console.log('Schlüsseldatei live geprüft: OK');
}

for (let i = 0; i < urls.length; i += 10000) {
  const teil = urls.slice(i, i + 10000);
  const r = trocken ? { status: 200, text: async () => '(Probelauf)' } : await fetch(API, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation, urlList: teil }),
  });
  const text = (await r.text()).slice(0, 300);
  console.log(`IndexNow: ${teil.length} URLs → HTTP ${r.status} (${BEDEUTUNG[r.status] || 'unbekannt'}) ${text}`);
  if (![200, 202].includes(r.status)) process.exitCode = 1;
}
