// Build, Teil „abschluss“: robots.txt, Sitemaps, Seitenarchiv und Daten für den Worker.
// Wird von scripts/build.mjs in fester Reihenfolge geladen; nutzt die Ergebnisse der vorherigen Teile.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ORT_KORREKTUREN, distanzKm, slugify } from '../lib.mjs';
import { stabileIdAus } from '../pflege.mjs';
import { zeilen } from '../../static/oh.js';
import { KATEGORIEN } from '../../static/karte.js';
import { BUILD_DATUM, GEN, OUT, ROOT, VOLLSTAENDIGKEIT, betreiber, cfg, eintraege, ergaenztAnzahl, ersetzt, geschlossenAnzahl, impressumAnzahl, kreise, laender, manuell, mitKindern, offenErgaenzt, offenErgaenztSumme, offenErsetzt, offenNeu, offenNeuSumme, pflegeAnzahl, plz, proKreis, rechercheAnzahl } from './daten.mjs';
import { HASH_VERSION } from '../seitenhash.mjs';
import { DATEI_LIMIT, DATEI_WARNUNG, dateienZaehlen } from '../dateien.mjs';
import { ADSENSE_KONTO, KATEGORIE_PFADE, SEITENTEXTE, SEITENTEXT_GENUTZT, seite } from './html.mjs';
import { pruefeSeitentexte } from '../seitentexte.mjs';
import { SEITENTEXT_KANDIDATEN } from './regionen.mjs';
import { ALLE_SEITEN, ORTE, ORTSMITTE, STAND_DATEI, UMGEBUNG, anzHof, sitemap, stand, umgebungIndexiert } from './grundlagen.mjs';
import { ANGEBOT_SEITEN, SAISON_SEITEN, SORTEN } from './startseite.mjs';
import { impFehlt } from './themen.mjs';

// ---------- Robots, Sitemap ----------
// /kacheln/: Kartenhintergrund. Googles Renderer lädt sonst je Seite mehrere Kacheln (eigene Adressen je Kartenausschnitt),
// das kostet Crawlbudget und bringt für die Indexierung nichts – die Liste steht im HTML.
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /suche\nDisallow: /api/\nDisallow: /merkliste/\nDisallow: /verwaltung/\nDisallow: /kacheln/\n\nSitemap: ${cfg.domain}/sitemap.xml\n`);
// ads.txt: autorisierte Verkäufer für Google AdSense (f08c47fec0942fa0 ist Googles feste TAG-ID)
if (ADSENSE_KONTO) writeFileSync(join(OUT, 'ads.txt'), `google.com, ${ADSENSE_KONTO.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);

// Seitenarchiv (data/seiten-stand.json): Inhalts-Hash und Änderungsdatum je Seite, auch für Seiten,
// die es nicht mehr gibt. Daraus entstehen echtes lastmod, 301-Weiterleitungen und 410 für entfernte Höfe.
for (const e of eintraege) stand.hoefe[e.slug] = e.osm || e.id;
const sortiert = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// Weiterleitungen für Seiten aus dem Archiv, die es nicht mehr gibt
const slugNachId = new Map(eintraege.map((e) => [e.osm || e.id, e.slug]));
// Einträge aus offenen Quellen, deren Hof früher unter einer anderen ID (anderer Quelle) veröffentlicht war
const ersetztDurch = new Map();
for (const e of eintraege) for (const alt of e.alteIds || []) if (!slugNachId.has(alt)) { slugNachId.set(alt, e.slug); ersetztDurch.set(alt, e.id); }
for (const [alt, neu] of offenErsetzt) if (!slugNachId.has(alt) && slugNachId.has(neu)) { slugNachId.set(alt, slugNachId.get(neu)); ersetztDurch.set(alt, neu); }
// Einmal festgestellte Ersetzungen bleiben im Archiv (sonst würde eine 301 zur 410, sobald die Quelle das Duplikat nicht mehr führt)
stand.ersetzt ??= {};
for (const [alt, neu] of Object.entries(stand.ersetzt)) {
  let ziel = neu, n = 0;
  while (stand.ersetzt[ziel] && !slugNachId.has(ziel) && n++ < 5) ziel = stand.ersetzt[ziel];
  if (!slugNachId.has(alt) && slugNachId.has(ziel)) { slugNachId.set(alt, slugNachId.get(ziel)); ersetztDurch.set(alt, ziel); }
}
for (const [alt, neu] of ersetztDurch) stand.ersetzt[alt] = neu;
// Nur in CI schreiben (die Workflows committen die Datei); lokale Builds lassen das Repo sauber
if (process.env.CI || process.env.SEITEN_STAND_SCHREIBEN) writeFileSync(STAND_DATEI, JSON.stringify({ version: HASH_VERSION, seiten: sortiert(stand.seiten), hoefe: sortiert(stand.hoefe), ersetzt: sortiert(stand.ersetzt) }));
const umleitungen = {}, entfernt = [];
const KORR_SLUGS = new Set(ORT_KORREKTUREN.map((k) => slugify(k.alt)));
for (const pfad of Object.keys(stand.seiten)) {
  if (ALLE_SEITEN.has(pfad)) continue;
  const hof = pfad.match(/^\/hof\/([^/]+)\/$/);
  if (hof) {
    const neu = slugNachId.get(stand.hoefe[hof[1]]);
    if (neu && neu !== hof[1]) umleitungen[pfad] = `/hof/${neu}/`; else entfernt.push(pfad);
    continue;
  }
  // korrigierter Ortsname (ORT_KORREKTUREN): auf die Seite des richtigen Orts im selben Kreis
  const korr = pfad.match(/^(\/[^/]+\/[^/]+\/)([^/]+)\/(.*)$/);
  const neuOrt = korr && ORT_KORREKTUREN.map((k) => `${korr[1]}${slugify(k.neu)}/${korr[3]}`).find((p) => KORR_SLUGS.has(korr[2]) && ALLE_SEITEN.has(p));
  if (neuOrt) { umleitungen[pfad] = neuOrt; continue; }
  // nächste übergeordnete Seite, z. B. aufgelöste Ortsseite → Kreisseite
  let ziel = pfad;
  do ziel = ziel.replace(/[^/]+\/$/, ''); while (ziel !== '/' && !ALLE_SEITEN.has(ziel));
  umleitungen[pfad] = ziel;
}
const alteSlugs = {};
for (const [slug, roh] of Object.entries(stand.hoefe)) if (!ALLE_SEITEN.has(`/hof/${slug}/`)) alteSlugs[slug] = stabileIdAus(ersetztDurch.get(roh) || roh);
for (const [alt, neuId] of ersetztDurch) alteSlugs[stabileIdAus(alt)] = stabileIdAus(neuId); // alte stabile ID → neue
writeFileSync(join(GEN, 'routen.json'), JSON.stringify({ umleitungen, entfernt, alteSlugs }));
console.log(`Seitenarchiv: ${Object.keys(stand.seiten).length} Seiten, ${Object.keys(umleitungen).length} Weiterleitungen, ${entfernt.length} entfernte Höfe (410)`);

// Sitemaps nach Seitentyp mit Sitemap-Index
const sitemapTyp = (p) => p.startsWith('/hof/') ? 'hoefe'
  : KATEGORIE_PFADE.has(p) || p.startsWith('/angebot/') || p.startsWith('/wochenmaerkte/') ? 'kategorien'
  : /^\/[^/]+\/[^/]+\/[^/]+\/$/.test(p) ? 'orte'
  : /^\/[^/]+\/[^/]+\/$/.test(p) && laender.some((l) => p.startsWith(`/${l.slug}/`)) ? 'kreise'
  : 'seiten';
const gruppen = new Map();
for (const p of sitemap.filter((x) => x.endsWith('/'))) {
  const t = sitemapTyp(p);
  if (!gruppen.has(t)) gruppen.set(t, []);
  gruppen.get(t).push(p);
}
mkdirSync(join(OUT, 'sitemaps'), { recursive: true });
const indexEintraege = [];
for (const t of ['seiten', 'kategorien', 'kreise', 'orte', 'hoefe']) {
  const liste = (gruppen.get(t) || []).sort();
  for (let i = 0; i < liste.length; i += 40000) {
    const teil = liste.slice(i, i + 40000);
    const name = `${t}${liste.length > 40000 ? `-${i / 40000 + 1}` : ''}.xml`;
    const lastmod = teil.reduce((m, p) => (stand.seiten[p][1] > m ? stand.seiten[p][1] : m), '');
    writeFileSync(join(OUT, 'sitemaps', name), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${teil.map((p) => `<url><loc>${cfg.domain}${p}</loc><lastmod>${stand.seiten[p][1]}</lastmod></url>`).join('\n')}\n</urlset>\n`);
    indexEintraege.push([name, lastmod]);
  }
}
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexEintraege.map(([n, l]) => `<sitemap><loc>${cfg.domain}/sitemaps/${n}</loc><lastmod>${l}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`);

// ---------- Optional: Gesamtliste als JSON (LISTE_EXPORT=pfad node scripts/build.mjs) ----------
if (process.env.LISTE_EXPORT) {
  writeFileSync(process.env.LISTE_EXPORT, JSON.stringify(eintraege.map((e) => ({
    schluessel: e.osm || e.id, sid: e.sid, typ: e.typ, name: e.titelSeite, art: e.art, strasse: e.strasse || '', plz: e.plz || '', ort: e.ortAnzeige, adresse: e.adresse,
    kreis: e.k.titel, bundesland: e.k.landName, telefon: e.telefon || '', email: e.email || '', website: e.website || '',
    facebook: e.facebook || '', instagram: e.instagram || '', oeffnungszeiten: e.oeffnungszeiten ? ((zeilen(e.oeffnungszeiten) || []).map(([t, v]) => `${t} ${v}`).join(', ') || e.oeffnungszeiten) : (e.oeffnungszeiten_text || ''),
    oeffnungszeitenOsm: e.oeffnungszeiten || '', bio: e.bio ? 'ja' : '', angebot: e.kat.map((x) => KATEGORIEN[x]).join(', '),
    betreiber: e.betreiber || '', ergaenzt: e.ergaenzt ? e.ergaenzt.felder.join(', ') : '',
    quelle: e.osm ? `https://www.openstreetmap.org/${e.osm}` : (e.quelleUrl || 'manuell'), seite: cfg.domain + e.pfad,
    indexiert: e.duenn ? 'nein' : 'ja', lat: e.lat, lon: e.lon,
  }))));
  console.log(`Liste exportiert: ${process.env.LISTE_EXPORT}`);
}

// ---------- Daten für den Worker ----------
const plzIndex = {};
for (const [p, rows] of plz) {
  const zaehl = new Map();
  for (const r of rows) zaehl.set(r.kreis, (zaehl.get(r.kreis) || 0) + 1);
  const kreis = [...zaehl].sort((a, b) => b[1] - a[1])[0][0];
  const lat = rows.reduce((s, r) => s + r.lat, 0) / rows.length;
  const lon = rows.reduce((s, r) => s + r.lon, 0) / rows.length;
  const orte = [...new Set(rows.filter((r) => !r.org).map((r) => r.ort))];
  const name = orte.length === 1 ? orte[0] : kreise.get(kreis).titel;
  plzIndex[p] = [+lat.toFixed(4), +lon.toFixed(4), kreise.get(kreis).pfad, name];
}
writeFileSync(join(GEN, 'plz.json'), JSON.stringify(plzIndex));

// Ortsnamen für die Suche: Name → zentrale PLZ, Kreis und (falls vorhanden) eigene Ortsseite
{
  const kListe = [...kreise.values()];
  const kIdx = new Map(kListe.map((k, i) => [k.code, i]));
  const gruppen = new Map();
  for (const rows of plz.values()) for (const r of rows) {
    if (r.org) continue;
    const key = r.ort + '|' + r.kreis;
    if (!gruppen.has(key)) gruppen.set(key, { ort: r.ort, kreis: r.kreis, rows: [] });
    gruppen.get(key).rows.push(r);
  }
  // Orte, die nur in den Einträgen vorkommen (Ortsteile aus OSM-Adressen)
  for (const m of ORTE.values()) for (const o of m.values()) {
    const key = o.ort + '|' + o.k.code;
    if (gruppen.has(key)) continue;
    const e = o.liste[0];
    const p = e.plz && plz.has(e.plz) ? e.plz : e.plzNah;
    if (p && plz.has(p)) gruppen.set(key, { ort: o.ort, kreis: o.k.code, rows: [{ plz: p, lat: o.lat, lon: o.lon }] });
  }
  const orteIndex = [];
  for (const g of gruppen.values()) {
    if (!kIdx.has(g.kreis)) continue;
    const lat = g.rows.reduce((x, r) => x + r.lat, 0) / g.rows.length;
    const lon = g.rows.reduce((x, r) => x + r.lon, 0) / g.rows.length;
    const mitte = g.rows.slice().sort((a, b) => distanzKm(lat, lon, a.lat, a.lon) - distanzKm(lat, lon, b.lat, b.lon))[0];
    const seiteOrt = ORTE.get(g.kreis)?.get(g.ort);
    orteIndex.push([g.ort, mitte.plz, kIdx.get(g.kreis), seiteOrt?.eigen ? seiteOrt.pfad : '', new Set(g.rows.map((r) => r.plz)).size]);
  }
  orteIndex.sort((a, b) => a[0].localeCompare(b[0], 'de'));
  writeFileSync(join(GEN, 'orte.json'), JSON.stringify({ k: kListe.map((k) => [k.pfad, k.titel]), o: orteIndex }));
  console.log(`Ortsnamen für die Suche: ${orteIndex.length}`);
}
// Für den Worker zusätzlich als Modul mit einem Text (wird dort erst bei Bedarf geparst, siehe src/worker.js)
const alsTextModul = (name) => writeFileSync(join(GEN, `${name}.js`), `export default ${JSON.stringify(readFileSync(join(GEN, `${name}.json`), 'utf8'))};\n`);
const KAT_CODES = Object.keys(KATEGORIEN);
writeFileSync(join(GEN, 'eintraege.json'), JSON.stringify(eintraege.map((e) => [
  +e.lat.toFixed(5), +e.lon.toFixed(5), e.slug, e.titel, e.art, e.ortAnzeige, e.oeffnungszeiten || '', e.typ === 'hofladen' ? 1 : 0,
  e.adresse, e.telefon || '', e.website || '', e.kat.map((x) => 'abcdefghijklmnopqrstuvwxyz'[KAT_CODES.indexOf(x)]).join(''), e.bio ? 1 : 0,
  e.oeffnungszeiten_text || '', e.sonntag ? 1 : 0,
  // ab hier: Daten für das Bearbeiten-Formular und den Outreach-Export
  e.sid, e.name || '', e.strasse || '', e.plz || '', e.ort || e.ortAnzeige || '', e.email || '', (e.zahlung || []).join(','),
  (e.beschreibung || '').slice(0, 600), e.fotos?.length || 0, e.vollst.prozent, e.vollst.fehlt.map((k) => 'abcdefghijklmnopqrstuvwxyz'[VOLLSTAENDIGKEIT.findIndex(([x]) => x === k)]).join(''), e.k?.land || '', mitKindern(e) ? 1 : 0, (e.verband || []).join(','), e.haltestelle ? 1 : 0])));
for (const n of ['plz', 'orte', 'eintraege']) alsTextModul(n);
writeFileSync(join(GEN, 'vollstaendigkeit.json'), JSON.stringify(VOLLSTAENDIGKEIT.map(([k, label]) => [k, label])));
writeFileSync(join(GEN, 'kategorien.json'), JSON.stringify(KAT_CODES));
// „Was + Wo“-Suche: Produktwörter → Kategorie, dazu die Zielseite, wenn nur das Produkt gesucht wird
const KAT_WOERTER = { eier: 'eier?|eierautomat', milch: 'milch|rohmilch|frischmilch|milchtankstelle', kaese: 'k(ä|ae)se', fleisch: 'fleisch|wurst|rindfleisch|schweinefleisch|lammfleisch|lamm|rind',
  gefluegel: 'gefl(ü|ue)gel|h(ä|ae)hnchen|gans|g(ä|ae)nse|enten?|puten?', wild: 'wild|wildfleisch|reh|hirsch|wildschwein', fisch: 'fisch|forellen?|karpfen',
  gemuese: 'gem(ü|ue)se', obst: 'obst', kartoffeln: 'kartoffeln?', honig: 'honig|imker(ei)?', brot: 'brot|br(ö|oe)tchen|backwaren', nudeln: 'nudeln|pasta',
  marmelade: 'marmelade|konfit(ü|ue)re', getraenke: 's(ä|ae)fte?|apfelsaft|most|wein', blumen: 'blumen|tulpen|sonnenblumen|blumenfeld',
  weihnachtsbaeume: 'weihnachtsb(ä|ae|a)ume?|tannenb(ä|ae|a)ume?|christb(ä|ae|a)ume?|tannen?', tierfutter: 'tierfutter|heu|stroh' };
writeFileSync(join(GEN, 'suchwoerter.json'), JSON.stringify([
  ...SAISON_SEITEN.map((sp) => [sp.re.source, SORTEN[sp.name][3], sp.indexiert ? sp.pfad : null]),
  ...Object.entries(KAT_WOERTER).map(([k, w]) => [w, k, ANGEBOT_SEITEN.includes(k) ? `/angebot/${k}/` : null]),
]));

const leereKreise = [...kreise.values()].filter((k) => !proKreis.get(k.code)).length;
const mitKat = eintraege.filter((e) => e.kat.length).length;
// ---------- Gepflegte Seitentexte: Prüfung und Liste offener lokaler Seiten ----------
for (const f of pruefeSeitentexte(SEITENTEXTE)) console.warn(`Seitentext: ${f}`);
for (const p of Object.keys(SEITENTEXTE)) if (!SEITENTEXT_GENUTZT.has(p) || !sitemap.includes(p)) console.warn(`Seitentext ${p}: keine indexierbare Seite – Text wird nicht oder nur auf einer noindex-Seite angezeigt`);
if (process.env.SEITENTEXTE_OFFEN) {
  const top = SEITENTEXT_KANDIDATEN.filter((x) => sitemap.includes(x.pfad)).sort((a, b) => b.n - a.n || a.pfad.localeCompare(b.pfad)).slice(0, 150);
  writeFileSync(join(ROOT, 'docs', 'seitentexte-offen.md'), `# Lokale Seiten ohne gepflegten Text\n\nStand ${BUILD_DATUM}. Die ${top.length} indexierbaren lokalen Seiten mit den meisten eigenen Einträgen (bei Orten und Städten: Einträge im Ort selbst), für die es noch keinen Eintrag in \`data/seitentexte.json\` und kein Regionsprofil in \`data/regionen/\` gibt. Format: \`scripts/seitentexte.mjs\`.\nNeu erzeugen: \`SEITENTEXTE_OFFEN=1 node scripts/build.mjs\` (danach \`git checkout data/seiten-stand.json\`).\n\n| Seite | Art | eigene Einträge | Schlüssel in data/seitentexte.json |\n|---|---|---:|---|\n${top.map((x) => `| [${x.titel}](${cfg.domain}${x.pfad}) | ${x.art} | ${x.n} | \`${x.pfad}\` |`).join('\n')}\n`);
  console.log(`Seitentexte: Liste offener Seiten geschrieben (${top.length})`);
}
// Orts- und Stadtseiten in Paketen à 25, absteigend nach Relevanz – Arbeitsliste für gepflegte Ortstexte.
// Relevanz = 3 × Zahl der Postleitzahlen des Orts (Maß für die Größe, also die Suchnachfrage) + eigene Einträge im Ort.
if (process.env.SEITENTEXTE_OFFEN) {
  const orte = UMGEBUNG.filter((z) => umgebungIndexiert(z) && sitemap.includes(z.pfad)).map((z) => {
    const plzZahl = ORTSMITTE.get(z.name + '|' + z.k.code)?.plz.size || 0;
    return { z, plzZahl, rel: 3 * plzZahl + z.eigene.length };
  }).sort((a, b) => b.rel - a.rel || b.z.eigene.length - a.z.eigene.length || a.z.pfad.localeCompare(b.z.pfad));
  const pakete = [];
  for (let i = 0; i < orte.length; i += 25) pakete.push(orte.slice(i, i + 25));
  const fertig = orte.filter((x) => SEITENTEXTE[x.z.pfad]).length;
  writeFileSync(join(ROOT, 'docs', 'ortstexte-pakete.md'), `# Ortstexte: Pakete à 25 nach Relevanz\n\nStand ${BUILD_DATUM}. Alle ${orte.length} indexierbaren Orts- und Stadtseiten („Hofläden in X und Umgebung“), absteigend nach Relevanz: 3 × Zahl der Postleitzahlen (Größe des Orts) + eigene Einträge im Ort. ${fertig} haben schon einen gepflegten Text in \`data/seitentexte.json\` (✓).\nNeu erzeugen: \`SEITENTEXTE_OFFEN=1 node scripts/build.mjs\` (danach \`git checkout data/seiten-stand.json\`).\n\n${pakete.map((p, i) => `## Paket ${i + 1} (${p.filter((x) => SEITENTEXTE[x.z.pfad]).length}/${p.length} fertig)\n\n| | Seite | Kreis | PLZ | eigene | Relevanz |\n|---|---|---|---:|---:|---:|\n${p.map((x) => `| ${SEITENTEXTE[x.z.pfad] ? '✓' : ''} | [${x.z.titelName || x.z.name}](${cfg.domain}${x.z.pfad}) \`${x.z.pfad}\` | ${x.z.k.titel} | ${x.plzZahl} | ${x.z.eigene.length} | ${x.rel} |`).join('\n')}\n`).join('\n')}`);
  console.log(`Ortstexte: ${orte.length} Orts- und Stadtseiten in ${pakete.length} Paketen (${fertig} fertig)`);
  // Fakten je Ort als Arbeitsgrundlage für die Texte (nicht im Repo)
  if (process.env.ORTSTEXTE_DATEN) writeFileSync(process.env.ORTSTEXTE_DATEN, JSON.stringify(orte.map(({ z, plzZahl, rel }, i) => ({
    paket: Math.floor(i / 25) + 1, pfad: z.pfad, name: z.titelName || z.name, ort: z.name, kreis: z.k.titel, land: z.k.landName, kreisPfad: z.k.pfad, landSlug: z.k.landSlug, plzZahl, rel,
    lat: +z.lat.toFixed(4), lon: +z.lon.toFixed(4), kreisSeite: !!z.kreisSeite, fertig: !!SEITENTEXTE[z.pfad],
    eigene: z.eigene.map((e) => ({ titel: e.titel, art: e.art, kat: e.kat, bio: !!e.bio, ort: e.ortAnzeige })),
    umkreis25: z.umkreis.filter(([d]) => d <= 25).length,
    naheTitel: z.umkreis.slice(0, 12).map(([d, e]) => `${e.titel} (${e.art}, ${e.ortAnzeige}, ${d.toFixed(1)} km)`),
  })), null, 1));
}
console.log(`Seitentexte: ${SEITENTEXT_GENUTZT.size} angezeigt,${SEITENTEXT_KANDIDATEN.length} lokale Seiten noch ohne gepflegten Text`);
console.log(`Build fertig: ${eintraege.length} Einträge (${ergaenztAnzahl} mit Website-Ergänzungen, ${rechercheAnzahl} mit Recherche-Funden, ${impressumAnzahl} mit Kontakt aus dem Impressum, ${pflegeAnzahl} gepflegt, ${offenNeuSumme} neu aus offenen Quellen ${JSON.stringify(offenNeu)}, ${offenErgaenztSumme} Ergänzungen ${JSON.stringify(offenErgaenzt)}, ${geschlossenAnzahl} als geschlossen entfernt, ${anzHof} Hofläden, ${eintraege.length - anzHof} Automaten, ${mitKat} mit Angebot), ${kreise.size} Kreise (${leereKreise} ohne Einträge), ${sitemap.length} Seiten in der Sitemap.`);
{
  const { gesamt, proTyp } = dateienZaehlen(OUT);
  console.log(`Dateien in public/: ${gesamt.toLocaleString('de-DE')} von ${DATEI_LIMIT.toLocaleString('de-DE')} (Cloudflare Workers Free), am meisten: ${proTyp.slice(0, 4).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  if (gesamt > DATEI_WARNUNG) console.warn(`WARNUNG: ${gesamt} Dateien – nahe am Limit von ${DATEI_LIMIT} statischen Dateien je Worker-Version (Workers Free).`);
}
if (impFehlt) console.warn('WARNUNG: Impressum in site.config.json ist unvollständig.');

export { KAT_CODES, KAT_WOERTER, alteSlugs, entfernt, ersetztDurch, gruppen, indexEintraege, leereKreise, mitKat, plzIndex, sitemapTyp, slugNachId, sortiert, umleitungen };
