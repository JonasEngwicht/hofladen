#!/usr/bin/env node
// Meldet neue und geänderte Seiten per IndexNow (Bing, Yandex, Seznam, Naver …) – liest die Sitemaps aus public/.
// Aufruf: node scripts/indexnow.mjs [--alle] [--tage 2]
// Schlüssel: static/<schluessel>.txt (öffentlich, so verlangt es das Protokoll)
import { readFileSync, readdirSync } from 'node:fs';

const KEY = '9f1b921c5281bf09873b58a7585cf10e';
const HOST = 'hofladenliste.de';
const args = process.argv.slice(2);
const alle = args.includes('--alle');
const tage = +(args[args.indexOf('--tage') + 1] || 2) || 2;
const ab = new Date(Date.now() - (tage - 1) * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

const urls = [];
for (const f of readdirSync(new URL('../public/sitemaps/', import.meta.url))) {
  const xml = readFileSync(new URL(`../public/sitemaps/${f}`, import.meta.url), 'utf8');
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)) if (alle || (m[2] || '') >= ab) urls.push(m[1]);
}
console.log(`${urls.length} URLs ${alle ? 'insgesamt' : `geändert seit ${ab}`}.`);
for (let i = 0; i < urls.length; i += 10000) {
  const teil = urls.slice(i, i + 10000);
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: teil }),
  });
  console.log(`IndexNow: ${teil.length} URLs → HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  if (![200, 202].includes(r.status)) process.exitCode = 1;
}
