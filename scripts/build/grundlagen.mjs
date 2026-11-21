// Build, Teil „grundlagen“: Ausgabe vorbereiten, Texte aus Daten, Orte und Umkreise, strukturierte Daten.
// Wird von scripts/build.mjs in fester Reihenfolge geladen; nutzt die Ergebnisse der vorherigen Teile.
import { mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { slugify, distanzKm } from '../lib.mjs';
import { esc } from '../../static/helfer.js';
import { titelBreite, TITEL_MAX } from '../pixel.mjs';
import { KATEGORIEN } from '../../static/karte.js';
import { BUILD_DATUM, GEN, OUT, ROOT, cfg, eintraege, ersetzt, istRund, kreisMitte, kreise, plz, proKreis, raster2, wocheVon } from './daten.mjs';
import { SEITEN_HASH, kurz, plural, zahl } from './html.mjs';

// ---------- Ausgabe vorbereiten ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(GEN, { recursive: true });
cpSync(join(ROOT, 'static'), OUT, { recursive: true });
if (existsSync(join(ROOT, 'data', 'fotos'))) cpSync(join(ROOT, 'data', 'fotos'), join(OUT, 'fotos'), { recursive: true, filter: (q) => !q.endsWith('.gitkeep') });
const sitemap = [];
const ALLE_SEITEN = new Set();
// Seitenarchiv (data/seiten-stand.json): Inhalts-Hash und Änderungsdatum je Seite, auch für Seiten,
// die es nicht mehr gibt. Daraus entstehen echtes lastmod, 301-Weiterleitungen und 410 für entfernte Höfe.
const STAND_DATEI = join(ROOT, 'data', 'seiten-stand.json');
const stand = existsSync(STAND_DATEI) ? JSON.parse(readFileSync(STAND_DATEI, 'utf8')) : { seiten: {}, hoefe: {} };
const ARCHIV_AUSNAHMEN = new Set(['/merkliste/', '/verwaltung/']);
// Google Analytics 4 (Mess-ID ist öffentlich). Leer = aus. Geladen wird nur nach Einwilligung (static/statistik.js).
const STAND_PLATZHALTER = '%%SEITENSTAND%%'; // wird nach dem Hashen durch das Änderungsdatum ersetzt
function schreibe(pfad, html, inSitemap = true) {
  const datei = join(OUT, pfad, pfad.endsWith('/') ? 'index.html' : '');
  mkdirSync(dirname(datei), { recursive: true });
  if (pfad.endsWith('/') && !ARCHIV_AUSNAHMEN.has(pfad)) {
    const h = SEITEN_HASH.get(pfad);
    const alt = stand.seiten[pfad];
    if (!alt) stand.seiten[pfad] = [h, BUILD_DATUM];
    else if (alt[0] !== h) stand.seiten[pfad] = [h, alt[0] == null ? alt[1] : BUILD_DATUM];
    html = html.replaceAll(STAND_PLATZHALTER, stand.seiten[pfad][1].split('-').reverse().join('.'));
  }
  writeFileSync(datei, html);
  if (pfad.endsWith('/')) ALLE_SEITEN.add(pfad);
  if (inSitemap) sitemap.push(pfad);
}

const anzHof = eintraege.filter((e) => e.typ === 'hofladen').length;
const anzArt = (a) => eintraege.filter((e) => e.art === a).length;

// ---------- Deutschlandkarte aus Punkten (Startseite) ----------
{
  const umriss = JSON.parse(readFileSync(join(ROOT, 'data', 'quellen', 'deutschland-umriss.geojson'), 'utf8'));
  const LON0 = 5.8, LAT1 = 55.1, K = 100, KX = Math.cos(51 * Math.PI / 180) * K;
  const px = (lon) => (lon - LON0) * KX, py = (lat) => (LAT1 - lat) * K;
  const W = Math.ceil(px(15.1) + 8), H = Math.ceil(py(47.2) + 8);
  const r1 = (v) => Math.round(v * 2) / 2;
  const pfadUmriss = umriss.geometry.coordinates.map((poly) => 'M' + poly[0].map(([x, y]) => `${r1(px(x) + 4)} ${r1(py(y) + 4)}`).join('L') + 'Z').join('');
  const r2 = (v) => Math.round(v / 2) * 2;
  const punkte = new Set(eintraege.map((e) => `${r2(px(e.lon) + 4)} ${r2(py(e.lat) + 4)}`));
  // relative Bewegungen zwischen sortierten Punkten: deutlich kürzerer Pfad
  const sortiertePunkte = [...punkte].map((p) => p.split(' ').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  let px0 = 0, py0 = 0;
  const pfadPunkte = sortiertePunkte.map(([x, y], i) => { const t = i ? `m${x - px0} ${y - py0}h0` : `M${x} ${y}h0`; px0 = x; py0 = y; return t; }).join('').replace(/ -/g, '-');
  mkdirSync(join(OUT, 'img'), { recursive: true });
  writeFileSync(join(OUT, 'img', 'deutschland.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${pfadUmriss}" fill="#1E4A37" stroke="#2F6249" stroke-width="1.2"/><path d="${pfadPunkte}" stroke="#F4C430" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`);
  globalThis.KARTE_GROESSE = [W, H];
  globalThis.KARTE_VERSION = createHash('sha1').update(readFileSync(join(OUT, 'img', 'deutschland.svg'))).digest('hex').slice(0, 8);
}

// ---------- SEO-Hilfen: Texte aus den Daten ----------
const PLURAL_ART = { Hofladen: 'Hofläden', Milchtankstelle: 'Milchtankstellen', Eierautomat: 'Eierautomaten', Regiomat: 'Regiomaten', Fleischautomat: 'Fleischautomaten', Kartoffelautomat: 'Kartoffelautomaten',
  Honigautomat: 'Honigautomaten', Nudelautomat: 'Nudelautomaten', Imkerei: 'Imkereien', Solawi: 'Solawis', 'Selbstpflücken': 'Selbstpflückfelder', 'Hofcafé': 'Hofcafés' };
const nennung = (arr) => arr.length <= 1 ? (arr[0] || '') : `${arr.slice(0, -1).join(', ')} und ${arr[arr.length - 1]}`;
const gross = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const link = (e) => `<a href="${e.pfad}">${esc(e.titel)}</a>`;

function zaehlung(liste) {
  const nHof = liste.filter((e) => e.typ === 'hofladen').length;
  const arten = new Map();
  for (const e of liste) if (e.typ !== 'hofladen') arten.set(e.art, (arten.get(e.art) || 0) + 1);
  const teile = [];
  if (nHof) teile.push(plural(nHof, 'Hofladen', 'Hofläden'));
  for (const [a, n] of [...arten].sort((x, y) => y[1] - x[1])) teile.push(`${zahl(n)} ${n === 1 ? a : PLURAL_ART[a] || a}`);
  return nennung(teile);
}

// Automatenart → Themenseite
// ---------- Bausteine für Snippets (Meta-Beschreibungen) ----------
// Öffnungszeiten kompakt: nur offene Tage, „07:00–18:00“ → „7–18 Uhr“; rund um die Uhr → „rund um die Uhr“
// max: höchstens so viele Zeichen; sonst nur die ersten Tage mit „u. a.“ davor
function zeitenSnippet(zl, max = Infinity) {
  if (!zl?.length) return '';
  if (zl.some(([, v]) => v === 'durchgehend') && zl.every(([, v]) => v === 'durchgehend')) return 'rund um die Uhr';
  const kurzZeit = (v) => v === 'durchgehend' ? 'rund um die Uhr' : `${v.replace(/\b0(\d):/g, '$1:').replace(/:00\b/g, '')} Uhr`;
  const teile = zl.filter(([, v]) => v !== 'geschlossen').map(([t, v]) => `${t} ${kurzZeit(v)}`);
  let text = teile.join(', ');
  for (let n = teile.length - 1; text.length > max && n >= 1; n--) text = `u. a. ${teile.slice(0, n).join(', ')}`;
  return text.length > max ? '' : text;
}
// Häufigstes Angebot in einer Liste (nur Kategorien, die mindestens zweimal vorkommen)
function angebotHaeufig(liste, n = 3) {
  const z = {};
  for (const e of liste) for (const k of e.kat || []) z[k] = (z[k] || 0) + 1;
  return Object.entries(z).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => KATEGORIEN[k]);
}
const ART_TYP = { Milchtankstelle: 'milchtankstelle', Eierautomat: 'eierautomat', Regiomat: 'regiomat', Fleischautomat: 'regiomat', Kartoffelautomat: 'regiomat', Honigautomat: 'regiomat', Nudelautomat: 'regiomat',
  Imkerei: 'imker', Solawi: 'solawi', 'Selbstpflücken': 'selbstpfluecken', 'Hofcafé': 'hofcafe' };
function zaehlungLinks(liste, anker = '') {
  const nHof = liste.filter((e) => e.typ === 'hofladen').length;
  const arten = new Map();
  for (const e of liste) if (e.typ !== 'hofladen') arten.set(e.art, (arten.get(e.art) || 0) + 1);
  const teile = [];
  if (nHof) teile.push(plural(nHof, 'Hofladen', 'Hofläden'));
  for (const [a, n] of [...arten].sort((x, y) => y[1] - x[1])) {
    const wort = n === 1 ? a : PLURAL_ART[a] || a;
    teile.push(`${zahl(n)} ${ART_TYP[a] ? `<a href="/${ART_TYP[a]}/${anker ? '#' + anker : ''}">${wort}</a>` : wort}`);
  }
  return nennung(teile);
}

function zaehlungKurz(liste) {
  const nHof = liste.filter((e) => e.typ === 'hofladen').length, nAut = liste.length - nHof;
  const arten = [...new Set(liste.filter((e) => e.typ !== 'hofladen').map((e) => e.art))];
  const aut = nAut ? (arten.length === 1 ? `${zahl(nAut)} ${nAut === 1 ? arten[0] : PLURAL_ART[arten[0]] || arten[0]}` : `${zahl(nAut)} Hofautomaten`) : '';
  return [nHof && plural(nHof, 'Hofladen', 'Hofläden'), aut].filter(Boolean).join(' & ');
}

function analyse(liste) {
  const mitZeiten = liste.filter(wocheVon);
  const sa = liste.filter((e) => wocheVon(e)?.[5].length);
  const so = liste.filter((e) => wocheVon(e)?.[6].length);
  const rund = liste.filter((e) => istRund(wocheVon(e)));
  const kat = new Map();
  for (const e of liste) for (const k of e.kat) kat.set(k, (kat.get(k) || 0) + 1);
  const orte = new Map();
  for (const e of liste) orte.set(e.ortAnzeige, (orte.get(e.ortAnzeige) || 0) + 1);
  return {
    mitZeiten, sa, so, rund, bio: liste.filter((e) => e.bio),
    kat: [...kat].sort((a, b) => b[1] - a[1]),
    orte: [...orte].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).map(([o]) => o),
    milch: liste.filter((e) => e.art === 'Milchtankstelle'),
    eier: liste.filter((e) => e.kat.includes('eier')),
  };
}

// Nächster Eintrag (außerhalb von "ausser"), der eine Bedingung erfüllt – Suche im 0,2°-Raster
function naechster(lat, lon, bedingung, ausser = new Set()) {
  const la = Math.floor(lat * 5), lo = Math.floor(lon * 5);
  let best = null;
  for (let r = 0; r <= 6; r++) {
    for (let i = la - r; i <= la + r; i++) for (let j = lo - r; j <= lo + r; j++) {
      if (Math.max(Math.abs(i - la), Math.abs(j - lo)) !== r) continue;
      for (const x of raster2.get(i + ':' + j) || []) {
        if (ausser.has(x) || !bedingung(x)) continue;
        const d = distanzKm(lat, lon, x.lat, x.lon);
        if (!best || d < best[0]) best = [d, x];
      }
    }
    if (best && best[0] < r * 15) break;
  }
  return best;
}
// Entfernung: unter 1 km in Metern, unter 50 m „am selben Ort“
const km = (d) => d < 0.05 ? 'am selben Ort' : d < 1 ? `${Math.max(50, Math.round(d * 20) * 50)} m` : `${d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} km`;

function gebietsText(liste, wo, { orteNennen = true, anker = '' } = {}) {
  const a = analyse(liste);
  const p = [];
  const hof = liste.filter((e) => e.typ === 'hofladen').length;
  p.push(`${gross(wo)} findest du ${zaehlungLinks(liste, anker)}${orteNennen && a.orte.length > 1 ? ` – unter anderem in ${nennung(a.orte.slice(0, 4))}` : ''}. ${hof ? 'Im Hofladen kaufst du direkt beim Erzeuger: frisch, regional und ohne Umweg über den Supermarkt.' : 'Die Automaten sind meist rund um die Uhr zugänglich – praktisch, wenn der Hofladen schon geschlossen hat.'}`);
  const saisonal = a.kat.some(([k]) => ['obst', 'gemuese', 'kartoffeln'].includes(k));
  if (a.kat.length) p.push(`Am häufigsten im Angebot sind ${nennung(a.kat.slice(0, 4).map(([k]) => KATEGORIEN[k]))}.${a.bio.length ? ` ${a.bio.length === 1 ? 'Ein Hof verkauft' : `${zahl(a.bio.length)} Höfe verkaufen`} Bio-Produkte.` : ''}${saisonal ? ' Welches Obst und Gemüse gerade Saison hat, zeigt unser <a href="/saisonkalender/">Saisonkalender</a>.' : ''}`);
  const z = [];
  if (a.mitZeiten.length) z.push(`Für ${plural(a.mitZeiten.length, 'Eintrag', 'Einträge')} sind Öffnungszeiten hinterlegt`);
  if (a.sa.length) z.push(`${zahl(a.sa.length)} ${a.sa.length === 1 ? 'hat' : 'haben'} samstags geöffnet`);
  if (a.so.length) z.push(`${zahl(a.so.length)} sogar sonntags`);
  if (z.length) p.push(`${z.join(', ')}.${a.rund.length ? ` ${a.rund.length === 1 ? 'Ein Angebot ist' : `${zahl(a.rund.length)} Angebote sind`} rund um die Uhr erreichbar.` : ''} Mit dem Filter „Jetzt geöffnet“ siehst du sofort, wo du gerade einkaufen kannst.`);
  p.push(`Alle Höfe in Deutschland auf einen Blick zeigt die <a href="/karte/">Hofladen-Karte</a>. Dein Hof fehlt? <a href="/mitmachen/">Hofladen kostenlos eintragen</a>.`);
  return p.map((x) => `<p>${x}</p>`).join('\n');
}

function fragen(liste, wo, mitte, { orteLinks = [] } = {}) {
  const a = analyse(liste);
  const im = new Set(liste);
  const f = [];
  const hoefe = liste.filter((e) => e.typ === 'hofladen');
  if (hoefe.length) f.push([`Wo finde ich einen Hofladen ${wo}?`,
    `${gross(wo)} gibt es ${plural(hoefe.length, 'Hofladen', 'Hofläden')}${a.orte.length > 1 ? `, zum Beispiel in ${nennung(a.orte.slice(0, 3))}` : ''}: ${nennung(hoefe.slice(0, 3).map(link))}${hoefe.length > 3 ? ' und weitere' : ''}. Mit deiner Postleitzahl sortieren wir alle Einträge nach Entfernung.`]);
  if (a.sa.length) f.push([`Welche Hofläden haben ${wo} am Samstag geöffnet?`,
    `Laut den hinterlegten Öffnungszeiten haben samstags geöffnet: ${nennung(a.sa.slice(0, 5).map(link))}${a.sa.length > 5 ? ` und ${zahl(a.sa.length - 5)} weitere` : ''}.`]);
  f.push([`Hat ein Hofladen ${wo} sonntags geöffnet?`, a.so.length
    ? `Ja: ${nennung(a.so.slice(0, 5).map(link))}${a.so.length > 5 ? ` und ${zahl(a.so.length - 5)} weitere` : ''}. Rund um die Saison ändern sich die Zeiten oft – kurz anrufen lohnt sich.`
    : `Für keinen Eintrag ${wo} sind Sonntagszeiten hinterlegt.${a.rund.length ? ` Rund um die Uhr erreichbar sind aber ${nennung(a.rund.slice(0, 3).map(link))}.` : ' Viele <a href="/regiomat/">Regiomaten</a> und <a href="/eierautomat/">Eierautomaten</a> sind trotzdem auch sonntags zugänglich.'}`]);
  if (a.milch.length) f.push([`Gibt es eine Milchtankstelle ${wo}?`, `Ja, ${a.milch.length === 1 ? 'eine' : zahl(a.milch.length)}: ${nennung(a.milch.slice(0, 5).map((e) => `${link(e)} (${esc(e.ortAnzeige)})`))}. Dort zapfst du frische Rohmilch selbst – vor dem Trinken bitte abkochen. Alle Standorte findest du unter <a href="/milchtankstelle/">Milchtankstellen in Deutschland</a>.`]);
  else { const n = naechster(mitte.lat, mitte.lon, (x) => x.art === 'Milchtankstelle', im);
    if (n) f.push([`Gibt es eine Milchtankstelle ${wo}?`, `${gross(wo)} ist bisher keine Milchtankstelle eingetragen. Die nächste ist ${link(n[1])} in ${esc(n[1].ortAnzeige)}, etwa ${km(n[0])} entfernt. Weitere findest du unter <a href="/milchtankstelle/">Milchtankstellen in Deutschland</a>.`]); }
  if (a.eier.length) f.push([`Wo bekomme ich Eier vom Hof ${wo}?`, `Eier gibt es zum Beispiel bei ${nennung(a.eier.slice(0, 4).map(link))}${a.eier.length > 4 ? ` und ${zahl(a.eier.length - 4)} weiteren` : ''}. Auch abends und am Wochenende gibt es Eier oft am <a href="/eierautomat/">Eierautomaten</a>.`]);
  else { const n = naechster(mitte.lat, mitte.lon, (x) => x.kat.includes('eier'), im);
    if (n) f.push([`Wo bekomme ich Eier vom Hof ${wo}?`, `Der nächste Hof mit Eiern ist ${link(n[1])} in ${esc(n[1].ortAnzeige)}, etwa ${km(n[0])} entfernt. Eine Übersicht bietet die Seite <a href="/eierautomat/">Eierautomaten in Deutschland</a>.`]); }
  if (orteLinks.length > 1) f.push([`In welchen Orten ${wo} gibt es Hofläden?`, `${nennung(orteLinks.slice(0, 12))}${orteLinks.length > 12 ? ` und ${zahl(orteLinks.length - 12)} weiteren Orten` : ''}.`]);
  return f;
}
function fragenHtml(f, titel) {
  if (!f.length) return { html: '', ld: [] };
  const html = `<section class="abschnitt faq"><h2>${esc(titel)}</h2>${f.map(([q, a]) => `<h3>${esc(q)}</h3><p>${a}</p>`).join('\n')}</section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: f.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) }];
  return { html, ld };
}

// ---------- Regionsprofile (recherchiert, mit Quellen) ----------
const REGIONEN = new Map();
const regionDir = join(ROOT, 'data', 'regionen');
if (existsSync(regionDir)) for (const f of readdirSync(regionDir).filter((x) => x.endsWith('.json'))) {
  const r = JSON.parse(readFileSync(join(regionDir, f), 'utf8'));
  REGIONEN.set(r.kreis, r);
}
function regionHtml(r) {
  return `<section class="region" id="region"><div class="region-innen">
  <h2>${esc(r.ueberschrift)}</h2>${r.absaetze.map((a) => `<p>${esc(a)}</p>`).join('')}
  <ul class="region-highlights">${r.highlights.map((h) => `<li><b>${esc(h.titel)}</b><span>${esc(h.zeit)}</span></li>`).join('')}</ul>
  <p class="region-hinweis"><a href="/saisonkalender/">Was gerade Saison hat</a> · <a href="#quellen">Quellen</a></p>
</div></section>`;
}
const quellenHtml = (r) => `<section class="abschnitt quellen" id="quellen"><h2>Quellen</h2><ol>${r.quellen.map((q) => `<li><a href="${esc(q.url)}" rel="nofollow noopener" target="_blank">${esc(q.titel)}</a></li>`).join('')}</ol></section>`;
const regionTeaser = (k) => { const r = REGIONEN.get(k.code); return r ? `<p class="region-teaser">${esc(r.teaser)} <a href="${k.pfad}#region">Mehr über die Region</a></p>` : ''; };

// ---------- Orte ----------
const MIN_SEITE = 3; // Listenseiten mit weniger Einträgen gelten als dünn
const ORTE = new Map(); // kreis-Code → Map(ort → { ort, pfad, liste })
for (const [code, liste] of proKreis) {
  const k = kreise.get(code);
  const m = new Map();
  for (const e of liste) {
    if (!m.has(e.ortAnzeige)) m.set(e.ortAnzeige, { ort: e.ortAnzeige, liste: [], k });
    m.get(e.ortAnzeige).liste.push(e);
  }
  const slugs = new Set();
  for (const o of m.values()) {
    let s = slugify(o.ort) || 'ort';
    while (slugs.has(s)) s += '-2';
    slugs.add(s);
    // Eigene Ortsseite erst ab MIN_SEITE Einträgen und nur, wenn sie sich von der Kreisseite unterscheidet
    // (die gleichnamige kreisfreie Stadt ist die Kreisseite selbst). Bei einem Eintrag ist die Hofseite
    // die Seite für "Hofladen in <Ort>", bei zwei die Kreisseite.
    const istKreisStadt = k.art === 'Stadt' && (o.ort === k.name || o.ort === k.titel);
    o.pfad = o.liste.length === liste.length || istKreisStadt ? k.pfad : o.liste.length === 1 ? null : o.liste.length < MIN_SEITE ? k.pfad : `${k.pfad}${s}/`;
    o.eigen = !!o.pfad && o.pfad !== k.pfad;
    o.lat = o.liste.reduce((x, e) => x + e.lat, 0) / o.liste.length;
    o.lon = o.liste.reduce((x, e) => x + e.lon, 0) / o.liste.length;
    for (const e of o.liste) e.ortSeite = o;
  }
  ORTE.set(code, m);
}
const ortSeiten = [...ORTE.values()].flatMap((m) => [...m.values()]).filter((o) => o.eigen);
// Bei einem Eintrag verlinkt der Ort direkt auf die Hofseite (Pfad steht erst nach der Slug-Vergabe fest)
for (const m of ORTE.values()) for (const o of m.values()) if (!o.pfad) o.pfad = o.liste[0].pfad;

// ---------- Orte mit Umgebung: "Hofläden in <Ort> und Umgebung" ----------
// Mittelpunkt eines Orts aus den PLZ-Daten (name|kreis) – das "Ortszentrum" für die Entfernungen
const ORTSMITTE = new Map();
for (const rows of plz.values()) for (const r of rows) {
  if (r.org) continue;
  const key = r.ort + '|' + r.kreis;
  const m = ORTSMITTE.get(key) || { lat: 0, lon: 0, n: 0, plz: new Set() };
  m.lat += r.lat; m.lon += r.lon; m.n++; m.plz.add(r.plz);
  ORTSMITTE.set(key, m);
}
for (const m of ORTSMITTE.values()) { m.lat /= m.n; m.lon /= m.n; }
const UMKREIS_MAX = 50;
const UMKREISE = [10, 25, 50];
function umkreis(lat, lon, maxKm = UMKREIS_MAX) {
  const dLat = maxKm / 111, dLon = maxKm / (111 * Math.cos(lat * Math.PI / 180));
  return eintraege.filter((e) => Math.abs(e.lat - lat) <= dLat && Math.abs(e.lon - lon) <= dLon)
    .map((e) => [distanzKm(lat, lon, e.lat, e.lon), e]).filter(([d]) => d <= maxKm).sort((a, b) => a[0] - b[0]);
}
// Zusätzliche Zielorte ohne eigene Ortsseite: größere Städte (ab 3 Postleitzahlen) und die Städte rund um Forst (Lausitz)
const LAUSITZ = ['Forst (Lausitz)', 'Guben', 'Spremberg', 'Peitz', 'Döbern', 'Drebkau', 'Welzow', 'Burg (Spreewald)', 'Kolkwitz',
  'Senftenberg', 'Calau', 'Vetschau', 'Lübbenau/Spreewald', 'Lübben (Spreewald)', 'Finsterwalde', 'Lauchhammer', 'Großräschen',
  'Eisenhüttenstadt', 'Weißwasser', 'Weißwasser/Oberlausitz', 'Bad Muskau', 'Niesky', 'Hoyerswerda', 'Bautzen', 'Görlitz'];
const UMGEBUNG = []; // { name, k, pfad, lat, lon, eigene, umkreis, kreisSeite }
{
  const typKreisSlugs = new Set(['milchtankstellen', 'eierautomaten', 'regiomaten']);
  const gesehen = new Set();
  const ziel = (name, k, pfad, mitte, eigene, kreisSeite) => {
    if (gesehen.has(pfad)) return null;
    const um = umkreis(mitte.lat, mitte.lon);
    if (um.length < MIN_SEITE) return null;
    gesehen.add(pfad);
    const z = { name, k, pfad, lat: mitte.lat, lon: mitte.lon, eigene, umkreis: um, kreisSeite };
    UMGEBUNG.push(z);
    return z;
  };
  // 1. Kreisfreie Städte: die Kreisseite wird zur Stadtseite mit Umgebung
  for (const k of kreise.values()) if (k.art === 'Stadt') {
    const m = ORTSMITTE.get(k.name + '|' + k.code) || kreisMitte.get(k.code);
    if (m) ziel(k.name, k, k.pfad, m, proKreis.get(k.code) || [], true);
  }
  // 2. Bestehende Ortsseiten
  for (const o of ortSeiten) {
    const m = ORTSMITTE.get(o.ort + '|' + o.k.code) || o;
    const z = ziel(o.ort, o.k, o.pfad, m, o.liste, false);
    if (z) { o.umgebung = z; o.lat = m.lat; o.lon = m.lon; }
  }
  // 3. Größere Städte und Lausitz ohne eigene Seite
  for (const [key, m] of ORTSMITTE) {
    const [name, code] = key.split('|');
    if (m.plz.size < 3 && !LAUSITZ.includes(name)) continue;
    const k = kreise.get(code);
    if (!k || (k.art === 'Stadt' && (k.name === name || k.titel === name))) continue;
    const slug = slugify(name);
    if (!slug || typKreisSlugs.has(slug)) continue;
    let o = ORTE.get(code)?.get(name);
    if (o?.eigen) continue;
    const pfad = `${k.pfad}${slug}/`;
    const z = ziel(name, k, pfad, m, o ? o.liste : [], false);
    if (!z) continue;
    if (!o) { o = { ort: name, liste: [], k }; if (!ORTE.has(code)) ORTE.set(code, new Map()); ORTE.get(code).set(name, o); }
    Object.assign(o, { pfad, eigen: true, lat: m.lat, lon: m.lon, umgebung: z });
    for (const e of o.liste) e.ortSeite = o;
    ortSeiten.push(o);
  }
}
const UMGEBUNG_PFAD = new Map(UMGEBUNG.map((z) => [z.pfad, z]));
// Fast gleiche Umgebungsseiten: Zeigen zwei Seiten zu mindestens 90 % dieselben Höfe und ist es derselbe Ort
// ("Schwabach" / "Stadt Schwabach", "Kreis Paderborn" / "Paderborn", Ortsteil) oder hat der schwächere Ort selbst
// kaum Einträge, bleibt nur die stärkere indexiert (kreisfreie Stadt vor Ort, dann mehr Postleitzahlen, mehr eigene
// Einträge, kürzerer Pfad). Die andere bleibt erreichbar, verweist auf die stärkere und ist noindex.
const UEBERDECKT = new Map(); // schwächere Umgebungsseite → stärkere
// Ortsname ohne Zusätze wie "Stadt", "Kreis", "(Westf.)", ", Sachsen" – erkennt Schreibvarianten desselben Orts
const ortKern = (n) => slugify(n).replace(/^(stadt|kreis|landkreis|gemeinde|markt)-/, '').replace(/-(sachsen|westf|westfalen|ruhr|sieg|main|oder)$/, '');
{
  const DOPPELT_AB = 0.9;
  // Höfe im Umkreis wie auf der Seite (25 km, bei wenigen Treffern 50 km; eigene Einträge immer)
  const hofSet = (z) => { const R = z.umkreis.filter(([d]) => d <= 25).length >= 10 ? 25 : 50; const eig = new Set(z.eigene);
    return new Set(z.umkreis.filter(([d, e]) => d <= R || eig.has(e)).map(([, e]) => e)); };
  const kandidaten = UMGEBUNG.filter((z) => z.eigene.length > 0)
    .map((z) => ({ z, plzZahl: ORTSMITTE.get(z.name + '|' + z.k.code)?.plz.size || 0, set: hofSet(z) }))
    .sort((a, b) => b.z.kreisSeite - a.z.kreisSeite || b.plzZahl - a.plzZahl || b.z.eigene.length - a.z.eigene.length || a.z.pfad.length - b.z.pfad.length || a.z.pfad.localeCompare(b.z.pfad));
  const behalten = [];
  for (const c of kandidaten) {
    const st = behalten.find((x) => Math.abs(x.z.lat - c.z.lat) < 0.5 && Math.abs(x.z.lon - c.z.lon) < 0.8 && (() => {
      let g = 0; for (const e of c.set) if (x.set.has(e)) g++;
      return g / (c.set.size + x.set.size - g) >= DOPPELT_AB; })());
    const gleicherOrt = st && (ortKern(c.z.name) === ortKern(st.z.name) || ortKern(c.z.name).startsWith(ortKern(st.z.name) + '-'));
    if (st && (gleicherOrt || (c.z.eigene.length < MIN_SEITE && c.plzZahl <= st.plzZahl))) UEBERDECKT.set(c.z, st.z); else behalten.push(c);
  }
}
// Indexiert werden Umgebungsseiten nur, wenn im Ort selbst mindestens ein Eintrag liegt (sonst wäre die Seite nur eine
// Weiterleitung auf Nachbarorte – Doorway-Muster) und keine fast gleiche Seite stärker ist
const umgebungIndexiert = (z) => z.eigene.length > 0 && !UEBERDECKT.has(z);
function naechsteUmgebungsSeite(e) {
  let best = null, bd = 25;
  for (const z of UMGEBUNG) {
    if (Math.abs(z.lat - e.lat) > 0.3 || Math.abs(z.lon - e.lon) > 0.5) continue;
    const d = distanzKm(e.lat, e.lon, z.lat, z.lon);
    if (d < bd) { bd = d; best = z; }
  }
  return best;
}
// Nächstgelegene Ortsseiten (für die Verlinkung zwischen Orten, auch über Kreisgrenzen)
function naheOrte(lat, lon, n, ausser = new Set()) {
  return ortSeiten.filter((o) => !ausser.has(o) && (!o.umgebung || umgebungIndexiert(o.umgebung)) && Math.abs(o.lat - lat) < 0.5 && Math.abs(o.lon - lon) < 0.8)
    .map((o) => [distanzKm(lat, lon, o.lat, o.lon), o]).filter(([d]) => d <= 40).sort((a, b) => a[0] - b[0]).slice(0, n);
}
const ortListe = (paare, titel) => paare.length ? `<section class="abschnitt"><h2>${esc(titel)}</h2><ul class="kreis-liste">${paare.map(([d, o]) => `<li><a href="${o.pfad}"><span>${esc(ortUeberschrift(o).replace(/ in .*/, ''))} in ${esc(o.ortTitel || o.ort)}</span><span class="zahl">${km(d)}</span></a></li>`).join('')}</ul></section>` : '';

// Gleichnamige Orte in verschiedenen Kreisen im Titel unterscheiden
const ortNamenZahl = new Map();
for (const o of ortSeiten) ortNamenZahl.set(o.ort, (ortNamenZahl.get(o.ort) || 0) + 1);
for (const o of ortSeiten) o.ortTitel = ortNamenZahl.get(o.ort) > 1 ? `${o.ort} (${o.k.titel})` : o.ort;
for (const o of ortSeiten) if (o.umgebung) o.umgebung.titelName = o.ortTitel;
function ortUeberschrift(o) {
  if (o.umgebung) return `Hofläden in ${o.ort} und Umgebung`;
  const nHof = o.liste.filter((e) => e.typ === 'hofladen').length;
  if (nHof) return nHof === 1 ? `Hofladen in ${o.ort}` : `Hofläden in ${o.ort}`;
  const arten = [...new Set(o.liste.map((e) => e.art))];
  if (arten.length === 1) return `${o.liste.length === 1 ? arten[0] : PLURAL_ART[arten[0]] || arten[0]} in ${o.ort}`;
  return `Hofautomaten in ${o.ort}`;
}

// Titel eindeutig machen, wenn derselbe Name im selben Ort mehrfach vorkommt
const titelZahl = new Map();
for (const e of eintraege) { const key = e.titel + '|' + e.ortAnzeige; titelZahl.set(key, (titelZahl.get(key) || 0) + 1); }
for (const e of eintraege) e.titelSeite = titelZahl.get(e.titel + '|' + e.ortAnzeige) > 1 ? (e.strasse ? `${e.titel}, ${e.strasse}` : `${e.titel} (${e.plz || e.plzNah})`) : e.titel;
{ const n = new Map();
  for (const e of eintraege.slice().sort((a, b) => (a.osm || a.id).localeCompare(b.osm || b.id, 'en', { numeric: true }))) {
    const z = (n.get(e.titelSeite) || 0) + 1; n.set(e.titelSeite, z);
    if (z > 1) e.titelSeite = `${e.titelSeite} – Nr. ${z}`;
  } }
// ---------- Strukturierte Daten ----------
const SCHEMA_TAGE = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function oeffnungsSpezifikation(woche) {
  const gruppen = new Map();
  woche.forEach((iv, tag) => {
    for (const [a, b] of iv) {
      const key = `${a}-${b}`;
      if (!gruppen.has(key)) gruppen.set(key, { a, b, tage: [] });
      gruppen.get(key).tage.push(tag);
    }
  });
  return [...gruppen.values()].map(({ a, b, tage }) => ({ '@type': 'OpeningHoursSpecification',
    dayOfWeek: tage.map((t) => `https://schema.org/${SCHEMA_TAGE[t]}`),
    opens: hhmm(a), closes: b === 1440 ? '23:59' : hhmm(b) }));
}
// ItemList für Listenseiten: Einträge [titel, pfad] in der angezeigten Reihenfolge
const itemList = (name, eintraegeListe) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name,
  numberOfItems: eintraegeListe.length,
  itemListElement: eintraegeListe.map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, url: cfg.domain + p })) });
const hofItems = (liste) => liste.map((e) => [e.titelSeite, e.pfad]);

// Längste Titelvariante, die (mit Marke) in ~65 Zeichen passt
// Erste Variante, die mit „| Hofladenliste“ in 580 px passt – sonst die erste, die ohne Marke passt
const passend = (...varianten) => varianten.find((v) => titelBreite(`${v} | Hofladenliste`) <= TITEL_MAX) || varianten.find((v) => titelBreite(v) <= TITEL_MAX) || varianten[varianten.length - 1];

// Große Städte (gemessen an der Zahl ihrer Postleitzahlen) mit ihrer Seite – für die Startseite
const GROSSSTAEDTE = (() => {
  const plzJeOrt = new Map();
  for (const rows of plz.values()) for (const r of rows) if (!r.org) {
    const key = r.ort + '|' + r.kreis;
    if (!plzJeOrt.has(key)) plzJeOrt.set(key, new Set());
    plzJeOrt.get(key).add(r.plz);
  }
  return [...plzJeOrt].sort((a, b) => b[1].size - a[1].size).map(([key]) => {
    const [name, code] = key.split('|');
    const k = kreise.get(code);
    const stadtKreis = k.art === 'Stadt' && (k.name === name || k.titel === name);
    const o = ORTE.get(code)?.get(name);
    const ziel = stadtKreis ? { pfad: k.pfad, n: proKreis.get(code)?.length || 0 } : o?.eigen ? { pfad: o.pfad, n: o.liste.length } : null;
    return ziel && ziel.n >= MIN_SEITE ? { name, ...ziel } : null;
  }).filter(Boolean).filter((x, i, a) => a.findIndex((y) => y.pfad === x.pfad) === i).slice(0, 20);
})();

export { angebotHaeufig, zeitenSnippet, ALLE_SEITEN, ARCHIV_AUSNAHMEN, ART_TYP, UEBERDECKT, umgebungIndexiert, GROSSSTAEDTE, LAUSITZ, MIN_SEITE, ORTE, ORTSMITTE, PLURAL_ART, REGIONEN, SCHEMA_TAGE, STAND_DATEI, STAND_PLATZHALTER, UMGEBUNG, UMGEBUNG_PFAD, UMKREISE, UMKREIS_MAX, analyse, anzArt, anzHof, fragen, fragenHtml, gebietsText, gross, hhmm, hofItems, itemList, km, link, naechsteUmgebungsSeite, naechster, naheOrte, nennung, oeffnungsSpezifikation, ortListe, ortNamenZahl, ortSeiten, ortUeberschrift, passend, quellenHtml, regionDir, regionHtml, regionTeaser, schreibe, sitemap, stand, titelZahl, umkreis, zaehlung, zaehlungKurz, zaehlungLinks };
