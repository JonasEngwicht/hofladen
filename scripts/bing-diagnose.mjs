#!/usr/bin/env node
// Liest (nur lesend) über die Bing-Webmaster-API aus, wie Bing hofladenliste.de sieht:
// Sitemaps, Crawl-Einstellungen und -Statistik, Crawl-Fehler, gesperrte URLs, Indexstatus einzelner Seiten.
// Aufruf: BING_WEBMASTER_API_KEY=… node scripts/bing-diagnose.mjs [url …]
// Probelauf ohne Netz: BING_TROCKEN=1.
const SITE = 'https://hofladenliste.de/';
const API = 'https://ssl.bing.com/webmaster/api.svc/json';
const trocken = !!process.env.BING_TROCKEN;
const key = (process.env.BING_WEBMASTER_API_KEY || '').trim().replace(/^["']+|["']+$/g, '').trim();
if (!key && !trocken) { console.error('BING_WEBMASTER_API_KEY fehlt.'); process.exit(1); }

const seiten = process.argv.slice(2).length ? process.argv.slice(2) : [
  SITE, `${SITE}bayern/`, `${SITE}brandenburg/spree-neisse/`, `${SITE}karte/`, `${SITE}nordrhein-westfalen/koeln/`,
];

// Bing liefert Datumsangaben als "/Date(1700000000000-0800)/"
const datum = (v) => (typeof v === 'string' ? v.replace(/\/Date\((-?\d+)[^)]*\)\//g, (_, ms) => new Date(+ms).toISOString().slice(0, 10)) : v);
const lesbar = (o) => JSON.parse(JSON.stringify(o ?? null), (k, v) => (k === '__type' ? undefined : datum(v)));

async function frage(methode, extra = '') {
  if (trocken) return { ok: true, d: { Probelauf: methode } };
  const r = await fetch(`${API}/${methode}?apikey=${encodeURIComponent(key)}&siteUrl=${encodeURIComponent(SITE)}${extra}`);
  const text = await r.text();
  try { const j = JSON.parse(text); return r.ok ? { ok: true, d: lesbar(j.d) } : { ok: false, fehler: `HTTP ${r.status} ${j.Message || ''}` }; }
  catch { return { ok: false, fehler: `HTTP ${r.status} ${text.slice(0, 200)}` }; }
}

const abschnitt = async (titel, methode, extra = '', max = 4000) => {
  const r = await frage(methode, extra);
  console.log(`\n## ${titel} (${methode})`);
  console.log(r.ok ? JSON.stringify(r.d, null, 1).slice(0, max) : `Fehler: ${r.fehler}`);
  return r;
};

await abschnitt('Websites im Konto', 'GetUserSites');
await abschnitt('Sitemaps/Feeds', 'GetFeeds');
await abschnitt('Crawl-Einstellungen', 'GetCrawlSettings');
const stats = await frage('GetCrawlStats');
console.log('\n## Crawl-Statistik, letzte 14 Tage (GetCrawlStats)');
if (stats.ok && Array.isArray(stats.d)) console.log(JSON.stringify(stats.d.slice(-14), null, 1).slice(0, 6000)); else console.log(stats.ok ? JSON.stringify(stats.d) : `Fehler: ${stats.fehler}`);
await abschnitt('Crawl-Probleme', 'GetCrawlIssues', '', 6000);
await abschnitt('Gesperrte URLs', 'GetBlockedUrls');
await abschnitt('Rang und Traffic', 'GetRankAndTrafficStats', '', 3000);
await abschnitt('Kontingent URL-Übermittlung', 'GetUrlSubmissionQuota');
for (const u of seiten) await abschnitt(`Indexstatus ${u}`, 'GetUrlInfo', `&url=${encodeURIComponent(u)}`, 1500);
