// Prüft die ausgerollte Seite: Statuscodes und Weiterleitungen, dazu PageSpeed Insights (mobil).
// Aufruf: node scripts/live-check.mjs [https://hofladenliste.de] [--ohne-pagespeed]
const BASIS = process.argv.find((a) => a.startsWith('http')) || 'https://hofladenliste.de';
const routen = JSON.parse((await import('node:fs')).readFileSync(new URL('../src/generated/routen.json', import.meta.url), 'utf8'));
const ersteUmleitung = Object.entries(routen.umleitungen)[0];

const FAELLE = [
  ['/', 200], ['/bayern/', 200], ['/bayern/landkreis-rosenheim/', 200], ['/hof/kittlers-hofladen-riesa/', 200],
  ['/sitemap.xml', 200], ['/sitemaps/hoefe.xml', 200], ['/robots.txt', 200], ['/style.css', 200],
  ['/bayern', 301, '/bayern/'], ['/bayern/index.html', 301, '/bayern/'], ['/Bayern/', 301, '/bayern/'],
  ['/baden-w%C3%BCrttemberg/', 301, '/baden-wuerttemberg/'],
  ...(ersteUmleitung ? [[ersteUmleitung[0], 301, ersteUmleitung[1]]] : []),
  ...(routen.entfernt[0] ? [[routen.entfernt[0], 410]] : []),
  ['/gibt-es-nicht/', 404], ['/suche?q=Tettnang', 302], ['/api/orte?q=Cottbus', 200],
  // Bearbeiten-Link für Gut Clarenhof (stabile ID w136216919)
  ['/hof/w136216919/bearbeiten/?utm_source=outreach&utm_medium=email', 302, '/mitmachen/?eintrag=w136216919&aktion=ergaenzen&utm_source=outreach&utm_medium=email'],
  ['/hof/hofladen-gut-clarenhof-frechen/uebernehmen/', 302, '/mitmachen/?eintrag=w136216919&aktion=uebernehmen'],
  ['/mitmachen/?eintrag=w136216919&aktion=ergaenzen', 200], ['/api/eintrag?id=w136216919', 200], ['/api/eintrag?id=gibt-es-nicht', 404],
];
let fehler = 0;
for (const [pfad, status, ziel] of FAELLE) {
  const r = await fetch(BASIS + pfad, { redirect: 'manual', headers: { 'User-Agent': 'HofladenlisteLiveCheck/1.0', 'Sec-Fetch-Mode': 'navigate' } });
  const loc = r.headers.get('location');
  const ok = r.status === status && (!ziel || loc === ziel || loc === BASIS + ziel);
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FEHL'} ${r.status} ${pfad}${loc ? ` → ${loc}` : ''}${ok ? '' : `  (erwartet ${status}${ziel ? ` → ${ziel}` : ''})`}`);
}

{
  const r = await fetch(`${BASIS}/mitmachen/?eintrag=w136216919&aktion=ergaenzen`);
  const ok = r.headers.get('x-robots-tag') === 'noindex';
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FEHL'} noindex für /mitmachen/?eintrag=…`);
  const d = await (await fetch(`${BASIS}/api/eintrag?id=w136216919`)).json().catch(() => ({}));
  const ok2 = d.eintrag?.slug === 'hofladen-gut-clarenhof-frechen';
  if (!ok2) fehler++;
  console.log(`${ok2 ? 'OK  ' : 'FEHL'} /api/eintrag liefert Gut Clarenhof (${d.eintrag?.titel || '–'}, ${d.eintrag?.vollstaendigkeit?.prozent ?? '–'} %)`);
}

// SEO-Check (20.11.2026): http → https, Zeichensatz und HSTS im Header, Titel ≤ 580 px
{
  const { titelBreite } = await import('./pixel.mjs');
  const http = await fetch(BASIS.replace(/^https:/, 'http:') + '/bayern/?x=1', { redirect: 'manual' });
  const ok = http.status === 301 && http.headers.get('location') === `${BASIS}/bayern/?x=1`;
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FEHL'} http → https (${http.status} → ${http.headers.get('location')})`);
  const r = await fetch(`${BASIS}/`);
  const typ = r.headers.get('content-type') || '', hsts = r.headers.get('strict-transport-security') || '';
  const html = await r.text();
  const titel = (html.match(/<title>([^<]*)<\/title>/)?.[1] || '').replace(/&amp;/g, '&');
  const ok2 = /charset=utf-8/i.test(typ) && /max-age=\d+/.test(hsts) && titelBreite(titel) <= 580 && !/\?produkt=/.test(html);
  if (!ok2) fehler++;
  console.log(`${ok2 ? 'OK  ' : 'FEHL'} Startseite: ${typ} · HSTS ${hsts || '–'} · Titel ${titelBreite(titel)} px „${titel}“`);
}

// Indexierbarkeit lokaler Seiten (20.11.2026): je Seitentyp 200, kein noindex (Header oder Meta), Canonical auf sich selbst,
// in der Sitemap; robots.txt sperrt nichts davon und nennt die Sitemap. Dazu ein Abruf mit Googlebot-Kennung (nur Hinweis:
// Cloudflare darf eine gefälschte Googlebot-Kennung aus GitHub Actions ablehnen, echte Googlebots sind davon nicht betroffen).
{
  const robots = await (await fetch(`${BASIS}/robots.txt`)).text();
  const okR = /^Sitemap: https:\/\/hofladenliste\.de\/sitemap\.xml$/m.test(robots) && !/^Disallow: \/\s*$/m.test(robots);
  if (!okR) fehler++;
  console.log(`${okR ? 'OK  ' : 'FEHL'} robots.txt: Sitemap genannt, keine Komplettsperre`);
  const index = await (await fetch(`${BASIS}/sitemap.xml`)).text();
  const teile = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const inSitemap = new Set();
  for (const t of teile.filter((u) => /\/(kreise|orte|kategorien)\.xml$/.test(u))) for (const m of (await (await fetch(t)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)) inSitemap.add(m[1]);
  const lokal = [...inSitemap].filter((u) => /^\/[^/]+\/[^/]+\/$/.test(u.slice(BASIS.length)));
  const probe = ['/', '/bayern/oberallgaeu/', '/berlin/berlin/', '/bayern/oberallgaeu/milchtankstellen/', '/brandenburg/spree-neisse/burg-spreewald/', '/hof/kittlers-hofladen-riesa/'];
  for (const pfad of probe) {
    const r = await fetch(BASIS + pfad, { redirect: 'manual', headers: { 'User-Agent': 'HofladenlisteLiveCheck/1.0' } });
    const html = r.status === 200 ? await r.text() : '';
    const xr = r.headers.get('x-robots-tag') || '', challenge = r.headers.get('cf-mitigated') || '';
    const can = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
    const sitemapOk = pfad === '/' || pfad.startsWith('/hof/') || inSitemap.has(BASIS + pfad);
    const ok = r.status === 200 && !/noindex/i.test(xr) && !challenge && !/<meta name="robots" content="noindex/.test(html) && can === BASIS + pfad && sitemapOk;
    if (!ok) fehler++;
    console.log(`${ok ? 'OK  ' : 'FEHL'} indexierbar ${pfad} (${r.status}${xr ? `, X-Robots-Tag ${xr}` : ''}${challenge ? `, Cloudflare-Abfrage ${challenge}` : ''}${can === BASIS + pfad ? '' : `, Canonical ${can || '–'}`}${sitemapOk ? '' : ', fehlt in der Sitemap'})`);
  }
  console.log(`INFO ${inSitemap.size} Kreis-, Orts- und Kategorieseiten in der Sitemap (${lokal.length} davon auf Kreisebene)`);
  // Inhalte aus #88: Kurztext und Saison auf Burg (Spreewald), Doppelseite noindex mit Hinweis
  const burg = await (await fetch(`${BASIS}/brandenburg/spree-neisse/burg-spreewald/`)).text();
  const okB = /<div class="ortstext"><p>Burg liegt mitten im UNESCO-Biosphärenreservat/.test(burg) && /class="abschnitt saison-lokal"/.test(burg) && /Quellen: <a /.test(burg);
  if (!okB) fehler++;
  console.log(`${okB ? 'OK  ' : 'FEHL'} Burg (Spreewald): Kurztext oben, Saison-Block, Quellen`);
  const dop = await fetch(`${BASIS}/bayern/schwabach/stadt-schwabach/`);
  const dopHtml = dop.status === 200 ? await dop.text() : '';
  const okD = /<meta name="robots" content="noindex/.test(dopHtml) && /Fast dieselben Höfe zeigt auch die Seite <a href="\/bayern\/schwabach\/"/.test(dopHtml) && !inSitemap.has(`${BASIS}/bayern/schwabach/stadt-schwabach/`);
  if (!okD) fehler++;
  console.log(`${okD ? 'OK  ' : 'FEHL'} Doppelseite /bayern/schwabach/stadt-schwabach/ noindex, verweist auf /bayern/schwabach/ (${dop.status})`);
  const g = await fetch(`${BASIS}/bayern/oberallgaeu/`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } });
  console.log(`INFO Abruf mit Googlebot-Kennung: ${g.status}${g.headers.get('cf-mitigated') ? ` (Cloudflare-Abfrage: ${g.headers.get('cf-mitigated')})` : ''}`);
}

// Antwortzeiten (Zeit bis zur ersten Antwort, Startseite und Hofseite, je 5×)
{
  const ms = async (url, init = {}) => { const t = performance.now(); const r = await fetch(url, { redirect: 'manual', ...init }); await r.arrayBuffer(); return [Math.round(performance.now() - t), r.headers.get('cf-cache-status') || '–']; };
  for (const url of [`${BASIS}/`, `${BASIS}/hof/kittlers-hofladen-riesa/`, `${BASIS}/bayern/`, BASIS.replace(/^https:/, 'http:') + '/']) {
    const werte = []; for (let i = 0; i < 5; i++) werte.push(await ms(url));
    console.log(`ZEIT ${url}: ${werte.map(([z, c]) => `${z} ms (${c})`).join(', ')}`);
  }
}

// Overture-Einträge sind ausgerollt: erster Eintrag mit stabiler ID o-… und die Quellenseite
{
  const roh = JSON.parse((await import('node:fs')).readFileSync(new URL('../src/generated/eintraege.json', import.meta.url), 'utf8'));
  const liste = Array.isArray(roh) ? roh : roh.eintraege;
  // je Quelle ein Eintrag: o- Overture, f- Foursquare, k- Karte von morgen, g- Verwaltungsdaten
  for (const [praefix, quelle, muster] of [['o-', 'Overture', /Overture Maps Foundation/], ['f-', 'Foursquare', /Foursquare Open Source Places/],
    ['k-', 'Karte von morgen', /Karte von morgen/], ['g-', 'Verwaltungsdaten', /offene Verwaltungsdaten/]]) {
    const o = liste.find((e) => String(e[15]).startsWith(praefix));
    if (!o) continue;
    const d = await (await fetch(`${BASIS}/api/eintrag?id=${o[15]}`)).json().catch(() => ({}));
    const seite = await fetch(`${BASIS}/hof/${o[2]}/`);
    const text = seite.status === 200 ? await seite.text() : '';
    const ok = d.eintrag?.slug === o[2] && muster.test(text);
    if (!ok) fehler++;
    console.log(`${ok ? 'OK  ' : 'FEHL'} ${quelle}-Eintrag ${o[3]} (/hof/${o[2]}/, ${seite.status})`);
  }
  const q = await (await fetch(`${BASIS}/quellen/`)).text();
  const ok = /Overture Maps/.test(q);
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FEHL'} /quellen/ nennt Overture Maps`);
}

if (!process.argv.includes('--ohne-pagespeed')) {
  console.log('\nPageSpeed Insights, mobil (Labordaten):');
  if (!process.env.PAGESPEED_API_KEY) console.log('  (ohne API-Schlüssel – Secret PAGESPEED_API_KEY fehlt, Kontingent ist oft erschöpft)');
  for (const pfad of ['/', '/berlin/berlin/', '/brandenburg/spree-neisse/forst-lausitz/', '/baden-wuerttemberg/bodenseekreis/', '/hof/kittlers-hofladen-riesa/']) {
    try {
      const key = process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : '';
      const kat = ['performance', 'accessibility', 'best-practices', 'seo'].map((c) => `&category=${c}`).join('');
      const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile${kat}&locale=de&url=${encodeURIComponent(BASIS + pfad)}${key}`);
      const d = await r.json();
      if (!d.lighthouseResult) { console.log(`  ${pfad}: keine Daten (${d.error?.message || r.status})`); continue; }
      const a = d.lighthouseResult.audits;
      const wert = (k) => a[k]?.displayValue || '–';
      const punkte = Math.round(d.lighthouseResult.categories.performance.score * 100);
      const kats = d.lighthouseResult.categories;
      const p = (k) => Math.round((kats[k]?.score ?? 0) * 100);
      console.log(`  ${pfad}: Performance ${punkte}, Barrierefreiheit ${p('accessibility')}, Best Practices ${p('best-practices')}, SEO ${p('seo')} | LCP ${wert('largest-contentful-paint')}, CLS ${wert('cumulative-layout-shift')}, TBT ${wert('total-blocking-time')}, FCP ${wert('first-contentful-paint')}`);
      // Nicht bestandene Prüfungen mit Details (für die Nachbesserung)
      for (const [kid, kat] of Object.entries(kats)) for (const ref of kat.auditRefs) {
        const au = a[ref.id];
        if (!au || au.score === null || au.score >= 0.9 || ['notApplicable', 'informative', 'manual'].includes(au.scoreDisplayMode)) continue;
        const items = (au.details?.items || []).slice(0, 4).map((it) => it.node?.selector || it.node?.snippet || it.url || it.source?.url || it.label || '').filter(Boolean);
        console.log(`    – [${kid}] ${au.id}: ${au.title}${au.displayValue ? ` (${au.displayValue})` : ''}${items.length ? ` → ${items.join(' | ').slice(0, 300)}` : ''}`);
      }
    } catch (e) { console.log(`  ${pfad}: ${e.message}`); }
  }
}
if (fehler) { console.error(`\n${fehler} Prüfung(en) fehlgeschlagen`); process.exit(1); }
