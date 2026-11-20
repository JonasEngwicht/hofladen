#!/usr/bin/env node
// Reicht ausgewählte Seiten über die Bing-Webmaster-API (URL-Übermittlung) zur Indexierung ein.
// Aufruf: BING_API_KEY=… node scripts/bing-melden.mjs [--datei data/bing-wichtig.txt] [--max 100]
// Die Datei enthält eine URL oder einen Pfad (/bayern/) pro Zeile; # leitet Kommentare ein.
// Vor dem Senden fragt das Skript das Tageskontingent ab und sendet höchstens so viele URLs, wie noch frei sind.
// Probelauf ohne Netz: BING_TROCKEN=1 (Kontingent = BING_TROCKEN_KONTINGENT oder 100).
import { readFileSync } from 'node:fs';

const SITE = 'https://hofladenliste.de';
const API = 'https://ssl.bing.com/webmaster/api.svc/json';
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

// Antwort von Bing in eine Fehlermeldung ohne Schlüssel verwandeln
const fehler = async (r) => `HTTP ${r.status} ${(await r.text()).slice(0, 300)}`;

async function kontingent() {
  if (trocken) return +(process.env.BING_TROCKEN_KONTINGENT ?? 100);
  const r = await fetch(`${API}/GetUrlSubmissionQuota?siteUrl=${encodeURIComponent(SITE)}&apikey=${key}`);
  if (!r.ok) throw new Error(`Kontingent nicht abrufbar: ${await fehler(r)}`);
  const j = await r.json();
  return j?.d?.DailyQuota ?? 0;
}

async function senden(urlList) {
  if (trocken) return { ok: true, text: '(Probelauf)' };
  const r = await fetch(`${API}/SubmitUrlbatch?apikey=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ siteUrl: SITE, urlList }),
  });
  return { ok: r.ok, text: r.ok ? await r.text() : await fehler(r) };
}

if (!trocken) console.log(`Schlüssel: ${key.length} Zeichen${/^[0-9a-f]{32}$/i.test(key) ? '' : ' (erwartet: 32 Hex-Zeichen)'}`);
const urls = leseListe(readFileSync(datei, 'utf8'));
const frei = await kontingent();
const teil = urls.slice(0, Math.min(frei, max));
console.log(`${urls.length} URLs in der Liste, Tageskontingent frei: ${frei}, sende ${teil.length}.`);
if (!teil.length) process.exit(0);
// Bing nimmt Pakete bis 500 URLs an
for (let i = 0; i < teil.length; i += 500) {
  const paket = teil.slice(i, i + 500);
  const r = await senden(paket);
  console.log(`Bing: ${paket.length} URLs → ${r.ok ? 'OK' : 'Fehler'} ${r.text}`);
  if (!r.ok) process.exitCode = 1;
}
if (teil.length < urls.length) console.log(`Nicht gesendet (Kontingent): ${urls.slice(teil.length).join(' ')}`);
