#!/usr/bin/env node
// Meldet neue, geänderte und entfernte Seiten per IndexNow (Bing, Yandex, Seznam, Naver …) – liest die Sitemaps aus public/.
// Aufruf: node scripts/indexnow.mjs [--alle] [--tage 2] [--gemeldet datei.json]
// Mit --gemeldet merkt sich das Skript, welche URL mit welchem lastmod schon gemeldet wurde, und meldet nur Abweichungen.
// So wird eine unveränderte Seite nicht bei jedem Deploy erneut gemeldet (Bing drosselt sonst die Verarbeitung).
// Schlüssel: static/<schluessel>.txt (öffentlich, so verlangt es das Protokoll)
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';

const KEY = '9f1b921c5281bf09873b58a7585cf10e';
const HOST = 'hofladenliste.de';
const args = process.argv.slice(2);
const wert = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const alle = args.includes('--alle');
const tage = +(wert('--tage') || 2) || 2;
const gemeldetDatei = wert('--gemeldet');
const ab = new Date(Date.now() - (tage - 1) * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

const ORDNER = process.env.SITEMAP_ORDNER ? new URL(`file://${process.env.SITEMAP_ORDNER.replace(/\/?$/, '/')}`) : new URL('../public/sitemaps/', import.meta.url);
const aktuell = {};
for (const f of readdirSync(ORDNER)) {
  const xml = readFileSync(new URL(f, ORDNER), 'utf8');
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)) aktuell[m[1]] = m[2] || '';
}
const alt = gemeldetDatei && existsSync(gemeldetDatei) ? JSON.parse(readFileSync(gemeldetDatei, 'utf8')) : null;

if (gemeldetDatei && !alt && !alle) {
  writeFileSync(gemeldetDatei, JSON.stringify(aktuell));
  console.log(`Noch kein Meldestand: ${Object.keys(aktuell).length} URLs als gemeldet übernommen, nichts gesendet.`);
  process.exit(0);
}

let urls;
if (alle) urls = Object.keys(aktuell);
else if (alt) {
  urls = Object.keys(aktuell).filter((u) => alt[u] !== aktuell[u]);
  // entfernte Seiten (jetzt 301/410) ebenfalls melden, damit Bing sie neu abruft
  urls.push(...Object.keys(alt).filter((u) => !(u in aktuell)));
} else urls = Object.keys(aktuell).filter((u) => aktuell[u] >= ab);
console.log(`${urls.length} URLs ${alle ? 'insgesamt' : alt ? 'neu, geändert oder entfernt seit der letzten Meldung' : `geändert seit ${ab}`}.`);

const stand = { ...(alt || {}) };
for (const u of Object.keys(stand)) if (!(u in aktuell)) delete stand[u];
for (let i = 0; i < urls.length; i += 10000) {
  const teil = urls.slice(i, i + 10000);
  const r = process.env.INDEXNOW_TROCKEN ? { status: 200, text: async () => '(Probelauf)' } : await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: teil }),
  });
  console.log(`IndexNow: ${teil.length} URLs → HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  if (![200, 202].includes(r.status)) { process.exitCode = 1; continue; }
  for (const u of teil) if (u in aktuell) stand[u] = aktuell[u];
}
if (gemeldetDatei) {
  // Seiten, die nicht gemeldet werden mussten, gelten mit ihrem aktuellen Stand als gemeldet
  if (alt) for (const u of Object.keys(aktuell)) if (!urls.includes(u) && !(u in stand)) stand[u] = aktuell[u];
  writeFileSync(gemeldetDatei, JSON.stringify(alle && process.exitCode !== 1 ? aktuell : stand));
}
