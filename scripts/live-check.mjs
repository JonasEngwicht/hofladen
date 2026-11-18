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
