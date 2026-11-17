#!/usr/bin/env node
// Baut die statische Website nach public/ und die Daten für den Worker nach src/generated/.
// Läuft automatisch vor jedem "wrangler deploy" (siehe wrangler.jsonc → build.command).
import { mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, domainToUnicode } from 'node:url';
import { ladePlz, naechsterOrt, slugify, distanzKm, BUNDESLAENDER } from './lib.mjs';
import { zeilen, uebersetze, parse } from '../static/oh.js';
import { KATEGORIEN, ICON, typIcon, karteHtml, statusHtml } from '../static/karte.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');
const GEN = join(ROOT, 'src', 'generated');
const cfg = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const BUILD_DATUM = new Date().toISOString().slice(0, 10);
const VERSION = Date.now().toString(36);

// Saisonkalender: [Sorte, Monate frisch, Monate aus dem Lager] – Richtwerte Freiland Deutschland
const SAISON = [
  ['Spargel', [4, 5, 6]], ['Rhabarber', [4, 5, 6]], ['Erdbeeren', [5, 6, 7, 8]], ['Kirschen', [6, 7, 8]],
  ['Himbeeren', [6, 7, 8, 9]], ['Heidelbeeren', [7, 8, 9]], ['Pflaumen und Zwetschgen', [7, 8, 9, 10]],
  ['Äpfel', [8, 9, 10, 11], [12, 1, 2, 3, 4, 5, 6, 7]], ['Birnen', [8, 9, 10], [11, 12, 1, 2]],
  ['Walnüsse', [9, 10, 11]], ['Kartoffeln', [6, 7, 8, 9, 10], [11, 12, 1, 2, 3, 4, 5]],
  ['Möhren', [6, 7, 8, 9, 10, 11], [12, 1, 2, 3, 4, 5]], ['Zwiebeln', [7, 8, 9, 10], [11, 12, 1, 2, 3, 4, 5, 6]],
  ['Kohlrabi', [5, 6, 7, 8, 9, 10]], ['Kopfsalat', [5, 6, 7, 8, 9, 10]], ['Erbsen', [6, 7, 8]],
  ['Gurken', [6, 7, 8, 9]], ['Zucchini', [6, 7, 8, 9, 10]], ['Tomaten', [7, 8, 9, 10]],
  ['Grüne Bohnen', [7, 8, 9, 10]], ['Zuckermais', [8, 9, 10]], ['Blumenkohl', [6, 7, 8, 9, 10, 11]],
  ['Brokkoli', [6, 7, 8, 9, 10]], ['Spinat', [4, 5, 6, 9, 10, 11]], ['Weißkohl', [6, 7, 8, 9, 10, 11], [12, 1, 2, 3, 4, 5]],
  ['Rote Bete', [7, 8, 9, 10, 11], [12, 1, 2, 3, 4]], ['Kürbis', [8, 9, 10, 11], [12, 1, 2]],
  ['Porree', [7, 8, 9, 10, 11, 12, 1, 2, 3]], ['Feldsalat', [10, 11, 12, 1, 2, 3]], ['Pastinaken', [10, 11, 12, 1, 2, 3]],
  ['Rosenkohl', [10, 11, 12, 1, 2]], ['Grünkohl', [11, 12, 1, 2]],
];

// ---------- Daten laden ----------
const { kreise, plz, raster } = ladePlz(join(ROOT, 'data', 'quellen', 'plz-de.csv'));
const osm = existsSync(join(ROOT, 'data', 'osm-eintraege.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data', 'osm-eintraege.json'), 'utf8')) : [];
const manuell = JSON.parse(readFileSync(join(ROOT, 'data', 'manuell.json'), 'utf8'));

const ersetzt = new Set(manuell.map((m) => m.ersetztOsm).filter(Boolean));
const eintraege = osm.filter((e) => !ersetzt.has(e.osm)).map((e) => ({ ...e, quelle: 'osm' }));
for (const m of manuell) {
  const e = { ...m, quelle: 'manuell', quelleUrl: m.quelle };
  if (e.lat == null) {
    const rows = (plz.get(e.plz) || []).filter((r) => !r.org);
    const row = rows.find((r) => r.ort === e.ort) || rows[0];
    if (!row) { console.warn(`Manueller Eintrag ${m.id}: PLZ ${m.plz} unbekannt, übersprungen`); continue; }
    e.lat = row.lat; e.lon = row.lon; e.lageUngefaehr = true;
    e.kreis = row.kreis; e.ortNah = row.ort; e.plzNah = row.plz;
  } else {
    const t = naechsterOrt(raster, e.lat, e.lon);
    e.kreis = t.ort.kreis; e.ortNah = t.ort.ort; e.plzNah = t.ort.plz;
  }
  eintraege.push(e);
}

// Anzeige-Felder und eindeutige Slugs
for (const e of eintraege) {
  e.ortAnzeige = e.ort || e.ortNah;
  e.titel = e.name || `${e.art} in ${e.ortAnzeige}`;
  e.k = kreise.get(e.kreis);
}
const slugZaehler = new Map();
for (const e of eintraege.sort((a, b) => (a.osm || a.id).localeCompare(b.osm || b.id, 'en', { numeric: true }))) {
  let s = slugify(e.name ? `${e.name}-${e.ortAnzeige}` : `${e.art}-${e.ortAnzeige}`).slice(0, 80).replace(/-+$/, '');
  if (e.name && slugify(e.name).includes(slugify(e.ortAnzeige))) s = slugify(e.name).slice(0, 80);
  const n = (slugZaehler.get(s) || 0) + 1;
  slugZaehler.set(s, n);
  e.slug = n > 1 ? `${s}-${n}` : s;
  e.pfad = `/hof/${e.slug}/`;
}

// Gruppierung nach Kreis und Land
const proKreis = new Map();
for (const e of eintraege) {
  if (!proKreis.has(e.kreis)) proKreis.set(e.kreis, []);
  proKreis.get(e.kreis).push(e);
}
const laender = Object.entries(BUNDESLAENDER).map(([code, name]) => {
  const ks = [...kreise.values()].filter((k) => k.land === code)
    .sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  return { code, name, slug: slugify(name), kreise: ks,
    anzahl: ks.reduce((s, k) => s + (proKreis.get(k.code)?.length || 0), 0) };
});
// Kreis-Mittelpunkte (Mittel der PLZ-Orte) für Nachbarkreise
const kreisMitte = new Map();
for (const rows of plz.values()) for (const r of rows) {
  const m = kreisMitte.get(r.kreis) || { lat: 0, lon: 0, n: 0 };
  m.lat += r.lat; m.lon += r.lon; m.n++; kreisMitte.set(r.kreis, m);
}
for (const m of kreisMitte.values()) { m.lat /= m.n; m.lon /= m.n; }

// Räumliches Raster für "in der Nähe"
const raster2 = new Map();
for (const e of eintraege) {
  const key = Math.floor(e.lat * 5) + ':' + Math.floor(e.lon * 5);
  if (!raster2.has(key)) raster2.set(key, []);
  raster2.get(key).push(e);
}
function inDerNaehe(e, n = 6) {
  const la = Math.floor(e.lat * 5), lo = Math.floor(e.lon * 5), kand = [];
  for (let i = la - 1; i <= la + 1; i++) for (let j = lo - 1; j <= lo + 1; j++)
    for (const x of raster2.get(i + ':' + j) || []) if (x !== e) kand.push([distanzKm(e.lat, e.lon, x.lat, x.lon), x]);
  return kand.sort((a, b) => a[0] - b[0]).slice(0, n).filter(([d]) => d <= 30);
}

// ---------- Produkt-Kategorien (aus OSM-Angaben und Namen abgeleitet) ----------
const KAT_REGELN = [
  ['eier', /\beggs?\b|\beier|\bei\b|hühner|huehner|geflügel|gefluegel|legehenne/i],
  ['milch', /\bmilk\b|milch|molkerei|joghurt|\bdairy/i],
  ['kaese', /cheese|käse|kaese/i],
  ['fleisch', /\bmeat\b|sausage|fleisch|wurst|metzger|schlacht|\brind|weiderind|schwein|\blamm|\bwild\b|wildhandel|galloway|angus|geflügel|gefluegel|hähnchen|puten|\bgans\b|gänse/i],
  ['gemuese', /vegetable|gemüse|gemuese|spargel|asparagus|salat|gärtnerei|gaertnerei|tomate|kürbis|kuerbis|pumpkin/i],
  ['obst', /fruit|\bobst|apfel|äpfel|aepfel|apple|erdbeer|strawberr|kirsch|beere|berry|pflaume|zwetsch|birne/i],
  ['kartoffeln', /potato|kartoffel/i],
  ['honig', /honey|honig|imker/i],
  ['brot', /bread|\bbrot|bäcker|baecker|backwaren|bakery|backhaus/i],
  ['getraenke', /juice|saft|\bwein|weingut|winzer|\bmost\b|wine|cider/i],
  ['blumen', /flower|blumen|tulpen|sonnenblume/i],
];
const ART_KAT = { Milchtankstelle: ['milch'], Eierautomat: ['eier'], Fleischautomat: ['fleisch'], Kartoffelautomat: ['kartoffeln'] };
for (const e of eintraege) {
  const text = [e.name, e.betreiber, e.beschreibung, ...(e.produkte || [])].filter(Boolean).join(' ');
  const kat = new Set(ART_KAT[e.art] || []);
  for (const [k, re] of KAT_REGELN) if (re.test(text)) kat.add(k);
  e.kat = Object.keys(KATEGORIEN).filter((k) => kat.has(k));
  e.adresse = [e.strasse, [e.plz, e.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || `bei ${e.ortNah} (${e.plzNah})`;
}

// ---------- HTML-Helfer ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telHref = (t) => 'tel:' + t.replace(/[^\d+]/g, '').replace(/^00/, '+');
const kurz = (u) => { let t = u; try { const x = new URL(u); t = domainToUnicode(x.hostname) + x.pathname + x.search; } catch {} return t.replace(/^www\./, '').replace(/\/$/, ''); };
const zahl = (n) => n.toLocaleString('de-DE');
const plural = (n, s, p) => `${zahl(n)} ${n === 1 ? s : p}`;
const kartenDaten = (e, km) => ({ pfad: e.pfad, slug: e.slug, titel: e.titel, art: e.art, typ: e.typ, adresse: e.adresse,
  oh: e.oeffnungszeiten, ohText: e.oeffnungszeiten_text, telefon: e.telefon, website: e.website, kat: e.kat,
  lat: e.lat, lon: e.lon, bio: e.bio, km });

const LOGO = `<svg class="logo-mark" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#F4C430"/><path d="M6 15 16 7l10 8v11H6z" fill="#173B2C"/><path d="M13 26v-6h6v6" fill="#F4C430"/></svg>`;

function seite({ titel, beschreibung, pfad, inhalt, noindex = false, jsonld = [], krumen = [], klasse = '', kopfSuche = true }) {
  const url = cfg.domain + pfad;
  const bc = krumen.length ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [['Start', '/'], ...krumen].map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: cfg.domain + p })) }] : [];
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)}</title>
<meta name="description" content="${esc(beschreibung)}">
<link rel="canonical" href="${esc(url)}">
${noindex ? '<meta name="robots" content="noindex, follow">\n' : ''}<meta property="og:title" content="${esc(titel)}">
<meta property="og:description" content="${esc(beschreibung)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta name="theme-color" content="#173B2C">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/zilla-slab-bold.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="/fonts/atkinson-next.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="/style.css?v=${VERSION}">
${[...bc, ...jsonld].map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body class="${klasse}">
<a class="sprung" href="#inhalt">Zum Inhalt</a>
<header class="kopf"><div class="kopf-innen">
  <a class="logo" href="/">${LOGO}<span>Hofladenliste</span></a>
  <nav class="kopf-nav" aria-label="Hauptnavigation">
    <a href="/karte/"${pfad === '/karte/' ? ' aria-current="page"' : ''}>Karte</a>
    <a href="/saisonkalender/"${pfad === '/saisonkalender/' ? ' aria-current="page"' : ''}>Saisonkalender</a>
    <a href="/mitmachen/"${pfad === '/mitmachen/' ? ' aria-current="page"' : ''}>Hof eintragen</a>
  </nav>
  ${kopfSuche ? `<form class="kopf-suche" action="/suche" method="get" role="search">
    <label class="sr" for="kopf-plz">Postleitzahl</label>
    <input id="kopf-plz" name="plz" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" placeholder="PLZ" required>
    <button type="submit">Suchen</button>
  </form>` : ''}
</div></header>
${krumen.length ? `<nav class="krumen" aria-label="Brotkrümel"><a href="/">Start</a>${krumen.map(([n, p], i) => i === krumen.length - 1 ? `<span aria-current="page">${esc(n)}</span>` : `<a href="${esc(p)}">${esc(n)}</a>`).join('')}</nav>` : ''}
<main id="inhalt">
${inhalt}
</main>
<footer class="fuss"><div class="fuss-innen">
  <div>
    <p class="fuss-logo">${LOGO}<span>Hofladenliste</span></p>
    <p>Hofläden, Milchtankstellen und Hofautomaten in ganz Deutschland. Alle Angaben ohne Gewähr – Öffnungszeiten ändern sich, besonders saisonal.</p>
  </div>
  <ul class="fuss-links">
    <li><a href="/karte/">Karte</a></li>
    <li><a href="/saisonkalender/">Saisonkalender</a></li>
    <li><a href="/mitmachen/">Hof eintragen oder korrigieren</a></li>
    <li><a href="/impressum/">Impressum</a></li>
    <li><a href="/datenschutz/">Datenschutz</a></li>
  </ul>
  <p class="fuss-quelle">Daten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a> (ODbL), PLZ-Daten <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0). Stand ${BUILD_DATUM.split('-').reverse().join('.')}.</p>
</div></footer>
<script type="module" src="/app.js?v=${VERSION}"></script>
</body>
</html>
`;
}

function kartenPanel({ titel = 'Karte', hinweis = 'Die Karte lädt Kartenbilder von OpenStreetMap. Dabei wird deine IP-Adresse an die OpenStreetMap Foundation übertragen.' } = {}) {
  return `<div class="kartenpanel" data-karte>
  <div class="karte-flaeche" aria-label="${esc(titel)}"></div>
  <div class="karte-zustimmung">
    <p><b>Karte anzeigen?</b> ${esc(hinweis)}</p>
    <button type="button" class="knopf" data-karte-laden>Karte laden</button>
    <label class="merken"><input type="checkbox" data-karte-merken checked> Für diese Website merken</label>
  </div>
</div>`;
}

function filterLeiste(liste) {
  const nHof = liste.filter((e) => e.typ === 'hofladen').length;
  const nAut = liste.length - nHof;
  const katZahl = new Map();
  for (const e of liste) for (const k of e.kat) katZahl.set(k, (katZahl.get(k) || 0) + 1);
  const kats = Object.keys(KATEGORIEN).filter((k) => katZahl.get(k));
  return `<div class="werkzeug" role="group" aria-label="Filter">
  <div class="segment" role="radiogroup" aria-label="Art">
    <button type="button" data-typ-filter="alle" aria-pressed="true">Alle <span>${liste.length}</span></button>
    ${nHof ? `<button type="button" data-typ-filter="hofladen" aria-pressed="false">Hofläden <span>${nHof}</span></button>` : ''}
    ${nAut ? `<button type="button" data-typ-filter="automat" aria-pressed="false">Automaten <span>${nAut}</span></button>` : ''}
  </div>
  <button type="button" class="umschalter" data-offen-filter aria-pressed="false">Jetzt geöffnet</button>
  ${kats.length ? `<div class="kat-filter" aria-label="Angebot">${kats.map((k) => `<button type="button" data-kat-filter="${k}" aria-pressed="false">${esc(KATEGORIEN[k])}</button>`).join('')}</div>` : ''}
  <p class="treffer" aria-live="polite"><span data-trefferzahl>${liste.length}</span> ${liste.length === 1 ? 'Eintrag' : 'Einträge'}</p>
</div>`;
}

// ---------- Ausgabe vorbereiten ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(GEN, { recursive: true });
cpSync(join(ROOT, 'static'), OUT, { recursive: true });
const sitemap = [];
function schreibe(pfad, html, inSitemap = true) {
  const datei = join(OUT, pfad, pfad.endsWith('/') ? 'index.html' : '');
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, html);
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
  const punkte = new Set(eintraege.map((e) => `${Math.round(px(e.lon) + 4)} ${Math.round(py(e.lat) + 4)}`));
  const pfadPunkte = [...punkte].map((p) => `M${p}h0`).join('');
  mkdirSync(join(OUT, 'img'), { recursive: true });
  writeFileSync(join(OUT, 'img', 'deutschland.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${pfadUmriss}" fill="#1E4A37" stroke="#2F6249" stroke-width="1.2"/><path d="${pfadPunkte}" stroke="#F4C430" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`);
  globalThis.KARTE_GROESSE = [W, H];
}

// ---------- Startseite ----------
const saisonJetzt = JSON.stringify(SAISON.map(([n, frisch, lager]) => [n, frisch, lager || []]));
schreibe('/', seite({
  titel: 'Hofläden in deiner Nähe – Hofladenliste',
  beschreibung: `${zahl(eintraege.length)} Hofläden, Milchtankstellen, Eierautomaten und Regiomaten in ganz Deutschland – mit Öffnungszeiten, Angebot und Route. PLZ eingeben und loslegen.`,
  pfad: '/',
  klasse: 'start',
  kopfSuche: false,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.name, url: cfg.domain + '/',
    potentialAction: { '@type': 'SearchAction', target: cfg.domain + '/suche?plz={plz}', 'query-input': 'required name=plz' } }],
  inhalt: `
<section class="held">
  <div class="held-text">
    <h1>Hofläden in deiner Nähe</h1>
    <p class="held-lead">${zahl(eintraege.length)} Hofläden und Hofautomaten in ganz Deutschland – mit Öffnungszeiten, Angebot und Weg dorthin.</p>
    <form class="plz-gross" action="/suche" method="get">
      <label for="plz">Deine Postleitzahl</label>
      <div class="plz-zeile">
        <input id="plz" name="plz" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" placeholder="03149" required autocomplete="postal-code">
        <button type="submit">Hofläden finden</button>
      </div>
      <p class="fehler" id="plz-fehler" hidden>Diese Postleitzahl kennen wir nicht. Bitte prüfe die fünf Ziffern.</p>
      <fieldset class="wunsch">
        <legend>Bestimmtes Angebot? (optional)</legend>
        ${['eier', 'milch', 'fleisch', 'gemuese', 'obst', 'kartoffeln', 'honig', 'kaese'].map((k) => `<label><input type="checkbox" name="produkt" value="${k}"><span>${esc(KATEGORIEN[k])}</span></label>`).join('\n        ')}
      </fieldset>
    </form>
    <button type="button" class="standort" id="standort">${ICON.route}Meinen Standort verwenden</button>
    <p class="zuletzt" id="zuletzt" hidden></p>
  </div>
  <figure class="held-karte">
    <img src="/img/deutschland.svg?v=${VERSION}" width="${KARTE_GROESSE[0]}" height="${KARTE_GROESSE[1]}" alt="Deutschlandkarte aus ${zahl(eintraege.length)} gelben Punkten – jeder Punkt ist ein Hofladen oder Hofautomat.">
    <figcaption>Jeder Punkt ein Hof. <a href="/karte/">Zur Karte</a></figcaption>
  </figure>
</section>
<section id="naehe" class="abschnitt naehe" hidden></section>
<section class="abschnitt arten">
  <h2>Was du hier findest</h2>
  <ul class="arten-liste">
    <li>${ICON.hofladen}<div><h3>Hofläden</h3><p>Verkauf direkt auf dem Hof: Gemüse, Obst, Eier, Fleisch, Käse und was die Saison hergibt.</p><p class="anzahl">${zahl(anzHof)} Einträge</p></div></li>
    <li>${ICON.milch}<div><h3>Milchtankstellen</h3><p>Frische Rohmilch zum Selbstzapfen, meist rund um die Uhr. Flasche mitbringen oder vor Ort kaufen.</p><p class="anzahl">${zahl(anzArt('Milchtankstelle'))} Einträge</p></div></li>
    <li>${ICON.eier}<div><h3>Eierautomaten</h3><p>Eier vom Hof, oft aus Freilandhaltung, auch abends und am Wochenende.</p><p class="anzahl">${zahl(anzArt('Eierautomat'))} Einträge</p></div></li>
    <li>${ICON.automat}<div><h3>Regiomaten</h3><p>Verkaufsautomaten mit Wurst, Kartoffeln, Nudeln, Honig und mehr aus der Region.</p><p class="anzahl">${zahl(eintraege.length - anzHof - anzArt('Milchtankstelle') - anzArt('Eierautomat'))} Einträge</p></div></li>
  </ul>
</section>
<section class="abschnitt saison-jetzt" data-saison='${esc(saisonJetzt)}'>
  <h2>Gerade frisch vom Feld</h2>
  <p class="saison-monat" data-saison-monat></p>
  <ul class="saison-chips" data-saison-liste></ul>
  <p><a href="/saisonkalender/">Ganzen Saisonkalender ansehen</a></p>
</section>
<section class="abschnitt laender">
  <h2>Hofläden nach Bundesland</h2>
  <ul class="laender-liste">
    ${laender.map((l) => `<li><a href="/${l.slug}/"><span>${esc(l.name)}</span><span class="zahl">${zahl(l.anzahl)}</span></a></li>`).join('\n    ')}
  </ul>
</section>`,
}));

// ---------- Bundesland- und Kreisseiten ----------
for (const l of laender) {
  const mitDaten = l.kreise.filter((k) => proKreis.get(k.code)?.length);
  schreibe(`/${l.slug}/`, seite({
    titel: `Hofläden in ${l.name} – nach Landkreis | Hofladenliste`,
    beschreibung: `${plural(l.anzahl, 'Hofladen und Hofautomat', 'Hofläden und Hofautomaten')} in ${l.name}: nach Landkreis und kreisfreier Stadt sortiert, mit Öffnungszeiten, Angebot und Karte.`,
    pfad: `/${l.slug}/`,
    krumen: [[l.name, `/${l.slug}/`]],
    inhalt: `
<section class="seitenkopf">
  <h1>Hofläden in ${esc(l.name)}</h1>
  <p>${plural(l.anzahl, 'Eintrag', 'Einträge')} in ${plural(mitDaten.length, 'Kreis', 'Kreisen')}. Wähle deinen Landkreis oder deine Stadt – oder gib oben deine Postleitzahl ein.</p>
</section>
<section class="abschnitt">
  <ul class="kreis-liste">
    ${l.kreise.map((k) => { const n = proKreis.get(k.code)?.length || 0;
      return `<li><a href="${k.pfad}"${n ? '' : ' class="leer"'}><span>${esc(k.titel)}</span><span class="zahl">${n ? zahl(n) : '–'}</span></a></li>`; }).join('\n    ')}
  </ul>
</section>`,
  }));

  for (const k of l.kreise) {
    const liste = (proKreis.get(k.code) || []).slice().sort((a, b) =>
      a.ortAnzeige.localeCompare(b.ortAnzeige, 'de') || a.titel.localeCompare(b.titel, 'de'));
    const nHof = liste.filter((e) => e.typ === 'hofladen').length;
    const nAut = liste.length - nHof;
    const mitte = kreisMitte.get(k.code);
    const nachbarn = [...kreise.values()].filter((x) => x !== k && kreisMitte.get(x.code))
      .map((x) => [distanzKm(mitte.lat, mitte.lon, kreisMitte.get(x.code).lat, kreisMitte.get(x.code).lon), x])
      .sort((a, b) => a[0] - b[0]).slice(0, 8).map(([, x]) => x);
    const im = k.art === 'Stadt' ? `in ${k.titel}` : `im ${k.titel}`;
    const orte = [...new Set(liste.map((e) => e.ortAnzeige))];
    schreibe(k.pfad, seite({
      titel: `Hofläden ${im}${nAut ? ' & Hofautomaten' : ''} | Hofladenliste`,
      beschreibung: liste.length
        ? `${[nHof && plural(nHof, 'Hofladen', 'Hofläden'), nAut && plural(nAut, 'Hofautomat', 'Hofautomaten')].filter(Boolean).join(' und ')} ${im}${orte.length > 1 ? `, u. a. in ${orte.slice(0, 3).join(', ')}` : ''}: Öffnungszeiten, Angebot, Karte und Route.`
        : `Hofläden ${im}: noch keine Einträge – hier findest du Hofläden in der Umgebung.`,
      pfad: k.pfad,
      noindex: liste.length === 0,
      klasse: 'kreis',
      krumen: [[l.name, `/${l.slug}/`], [k.titel, k.pfad]],
      inhalt: `
<section class="seitenkopf">
  <h1>Hofläden ${esc(im)}</h1>
  <p>${liste.length ? `${[nHof && plural(nHof, 'Hofladen', 'Hofläden'), nAut && plural(nAut, 'Hofautomat', 'Hofautomaten')].filter(Boolean).join(' und ')} – mit Öffnungszeiten, Angebot und Route.` : `Für ${esc(k.titel)} haben wir noch keine Einträge. In den Nachbarkreisen gibt es welche – oder du <a href="/mitmachen/">trägst einen Hof ein</a>.`}</p>
  <p class="plz-hinweis" data-plz-hinweis hidden></p>
</section>
${liste.length ? filterLeiste(liste) : ''}
<div class="geteilt">
  <div class="liste" data-liste>
    ${liste.map((e) => karteHtml(kartenDaten(e))).join('\n    ')}
    <p class="leer-filter" data-leer-filter hidden>Keine Einträge passen zu deinem Filter. <button type="button" class="link" data-filter-zuruecksetzen>Filter zurücksetzen</button></p>
    <section class="umgebung" data-umgebung hidden><h2>Ganz in der Nähe, aber in anderen Kreisen</h2><div data-umgebung-liste></div></section>
  </div>
  <aside class="karten-spalte">${kartenPanel({ titel: `Karte: Hofläden ${im}` })}</aside>
</div>
<section class="abschnitt nachbarn">
  <h2>Hofläden in der Umgebung</h2>
  <ul class="kreis-liste">${nachbarn.map((x) => `<li><a href="${x.pfad}"><span>${esc(x.titel)}</span><span class="zahl">${zahl(proKreis.get(x.code)?.length || 0)}</span></a></li>`).join('')}</ul>
</section>`,
    }), liste.length > 0);
  }
}

// ---------- Detailseiten ----------
const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
for (const e of eintraege) {
  const k = e.k;
  const naehe = inDerNaehe(e, 4);
  const ld = { '@context': 'https://schema.org', '@type': e.typ === 'hofladen' ? 'Store' : 'LocalBusiness', name: e.titel,
    geo: { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lon }, url: cfg.domain + e.pfad };
  if (e.strasse || e.plz || e.ort) ld.address = { '@type': 'PostalAddress', streetAddress: e.strasse || undefined,
    postalCode: e.plz || undefined, addressLocality: e.ort || undefined, addressCountry: 'DE' };
  if (e.telefon) ld.telephone = e.telefon;
  if (e.website) ld.sameAs = [e.website];
  const woche = e.oeffnungszeiten ? parse(e.oeffnungszeiten) : null;
  if (woche) ld.openingHours = e.oeffnungszeiten.split(';').map((s) => s.trim()).filter((s) => s && !/off|PH/.test(s));
  const ohKurz = e.oeffnungszeiten ? (zeilen(e.oeffnungszeiten) || []).map(([t, v]) => `${t} ${v}`).join(', ') : '';
  const uhr = (m) => `${String(Math.floor(m / 60) % 24 || (m >= 1440 ? 24 : 0)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const ohTabelle = woche
    ? `<table class="woche"><tbody>${woche.map((iv, i) => `<tr data-tag="${i}"><th>${TAGE[i]}</th><td>${iv.length ? iv.map(([a, b]) => `${uhr(a)}–${uhr(b)}`).join(', ') : '<span class="zu">geschlossen</span>'}</td></tr>`).join('')}</tbody></table>`
    : e.oeffnungszeiten_text ? `<p>${esc(e.oeffnungszeiten_text)}</p>`
    : e.oeffnungszeiten ? `<p>${esc(uebersetze(e.oeffnungszeiten))}</p>`
    : `<p class="leise">Keine Öffnungszeiten hinterlegt. ${e.typ === 'automat' ? 'Automaten sind meist rund um die Uhr zugänglich.' : 'Am besten vorher anrufen.'}</p>`;
  const kontakt = [
    e.telefon && `<li>${ICON.telefon}<a href="${telHref(e.telefon)}">${esc(e.telefon)}</a></li>`,
    e.email && `<li>${ICON.web}<a href="mailto:${esc(e.email)}">${esc(e.email)}</a></li>`,
    e.website && `<li>${ICON.web}<a href="${esc(e.website)}" rel="nofollow noopener" target="_blank">${esc(kurz(e.website))}</a></li>`,
    e.facebook && `<li>${ICON.web}<a href="${esc(e.facebook)}" rel="nofollow noopener" target="_blank">Facebook</a></li>`,
    e.instagram && `<li>${ICON.web}<a href="${esc(e.instagram)}" rel="nofollow noopener" target="_blank">Instagram</a></li>`,
  ].filter(Boolean);
  schreibe(e.pfad, seite({
    titel: `${e.titel} – ${e.art}${e.name ? ` in ${e.ortAnzeige}` : ''} | Öffnungszeiten & Angebot`,
    beschreibung: `${e.titel}: ${e.art} in ${e.ortAnzeige} (${k.titel}).${e.kat.length ? ` Angebot: ${e.kat.map((x) => KATEGORIEN[x]).join(', ')}.` : ''}${ohKurz ? ` Öffnungszeiten: ${ohKurz}.` : ''}${e.telefon ? ` Telefon: ${e.telefon}.` : ''}`.slice(0, 300),
    pfad: e.pfad,
    klasse: 'hof',
    jsonld: [ld],
    krumen: [[k.landName, `/${k.landSlug}/`], [k.titel, k.pfad], [e.titel, e.pfad]],
    inhalt: `
<section class="hof-kopf laden-${e.typ}" data-lat="${e.lat}" data-lon="${e.lon}" data-titel="${esc(e.titel)}" data-typ="${e.typ}">
  <p class="hof-art">${typIcon(e.art)}<span>${esc(e.art)}${e.bio ? ' · Bio' : ''}</span></p>
  <h1>${esc(e.titel)}</h1>
  <p class="hof-adr">${esc(e.adresse)}</p>
  ${statusHtml(e.oeffnungszeiten, e.oeffnungszeiten_text)}
  <p class="aktionen gross">
    <a class="akt" href="https://www.google.com/maps/dir/?api=1&amp;destination=${e.lat},${e.lon}" rel="nofollow noopener" target="_blank">${ICON.route}Route planen</a>${e.telefon ? `<a class="akt" href="${telHref(e.telefon)}">${ICON.telefon}Anrufen</a>` : ''}${e.website ? `<a class="akt" href="${esc(e.website)}" rel="nofollow noopener" target="_blank">${ICON.web}Website</a>` : ''}
  </p>
</section>
<div class="hof-inhalt">
  <div class="hof-info">
    <section><h2>Öffnungszeiten</h2>${ohTabelle}</section>
    ${e.kat.length ? `<section><h2>Angebot</h2><ul class="chips gross">${e.kat.map((x) => `<li>${esc(KATEGORIEN[x])}</li>`).join('')}</ul>${e.quelle === 'osm' ? '<p class="leise">Abgeleitet aus dem Eintrag und dem Namen des Hofs – das Sortiment kann je nach Saison abweichen.</p>' : ''}</section>` : ''}
    ${e.beschreibung ? `<section><h2>Über den Hof</h2><p>${esc(e.beschreibung)}</p></section>` : ''}
    <section><h2>Kontakt</h2>${kontakt.length ? `<ul class="kontakt">${kontakt.join('')}</ul>` : '<p class="leise">Keine Kontaktdaten hinterlegt.</p>'}${e.betreiber && e.betreiber !== e.name ? `<p class="leise">Betreiber: ${esc(e.betreiber)}</p>` : ''}</section>
    <p class="hinweis">Angaben ohne Gewähr. ${e.quelle === 'osm'
      ? `Quelle: <a href="https://www.openstreetmap.org/${e.osm}" rel="nofollow noopener" target="_blank">OpenStreetMap</a>. Etwas stimmt nicht? <a href="https://www.openstreetmap.org/edit?${e.osm.replace('/', '=')}" rel="nofollow noopener" target="_blank">In OpenStreetMap korrigieren</a> oder <a href="/mitmachen/?hof=${esc(e.slug)}">uns Bescheid geben</a>.`
      : `${e.quelleUrl ? `Quelle: <a href="${esc(e.quelleUrl)}" rel="nofollow noopener" target="_blank">${esc(kurz(e.quelleUrl).split('/')[0])}</a>. ` : ''}Etwas stimmt nicht? <a href="/mitmachen/?hof=${esc(e.slug)}">Gib uns Bescheid.</a>`}</p>
  </div>
  <aside class="hof-karte">
    ${e.lageUngefaehr ? '<p class="leise">Die genaue Lage ist noch nicht erfasst.</p>' : kartenPanel({ titel: `Karte: ${e.titel}` })}
    <p class="leise"><a href="https://www.openstreetmap.org/?mlat=${e.lat}&amp;mlon=${e.lon}#map=16/${e.lat}/${e.lon}" rel="nofollow noopener" target="_blank">Auf OpenStreetMap öffnen</a></p>
  </aside>
</div>
${naehe.length ? `<section class="abschnitt"><h2>In der Nähe</h2><div class="karten-reihe">${naehe.map(([d, x]) => karteHtml(kartenDaten(x, Math.round(d * 10) / 10))).join('')}</div></section>` : ''}
<p class="abschnitt"><a class="mehr" href="${k.pfad}">Alle Hofläden ${k.art === 'Stadt' ? 'in' : 'im'} ${esc(k.titel)}${ICON.pfeil}</a></p>`,
  }));
}

// ---------- Deutschlandkarte ----------
writeFileSync(join(OUT, 'punkte.json'), JSON.stringify(eintraege.map((e) =>
  [+e.lat.toFixed(4), +e.lon.toFixed(4), e.typ === 'hofladen' ? 1 : 0, e.slug, e.titel, e.art])));
schreibe('/karte/', seite({
  titel: 'Karte aller Hofläden in Deutschland | Hofladenliste',
  beschreibung: `Alle ${zahl(eintraege.length)} Hofläden, Milchtankstellen, Eierautomaten und Regiomaten in Deutschland auf einer Karte.`,
  pfad: '/karte/',
  klasse: 'vollkarte',
  inhalt: `
<section class="seitenkopf kompakt">
  <h1>Alle Hofläden auf der Karte</h1>
  <p>${zahl(anzHof)} Hofläden und ${zahl(eintraege.length - anzHof)} Hofautomaten. Hineinzoomen und einen Punkt antippen.</p>
</section>
<div class="vollkarte-rahmen" data-vollkarte>${kartenPanel({ titel: 'Karte aller Hofläden in Deutschland' })}
  <div class="legende"><span class="punkt hofladen"></span>Hofladen <span class="punkt automat"></span>Automat</div>
</div>`,
}));

// ---------- Saisonkalender ----------
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
schreibe('/saisonkalender/', seite({
  titel: 'Saisonkalender: Obst und Gemüse aus Deutschland | Hofladenliste',
  beschreibung: 'Wann gibt es Spargel, Erdbeeren, Kürbis und Grünkohl aus der Region? Der Saisonkalender für Obst und Gemüse aus deutschem Anbau – Monat für Monat.',
  pfad: '/saisonkalender/',
  klasse: 'saison',
  inhalt: `
<section class="seitenkopf">
  <h1>Saisonkalender für Obst und Gemüse</h1>
  <p>Was bei uns gerade wächst und was aus dem Lager kommt. Im Hofladen findest du vor allem, was Saison hat – frischer und oft günstiger.</p>
  <p class="legende-saison"><span class="frisch"></span>frisch vom Feld <span class="lager"></span>aus dem Lager</p>
</section>
<div class="abschnitt saison-tabelle-rahmen">
  <table class="saison-tabelle">
    <thead><tr><th scope="col">Sorte</th>${MONATE.map((m, i) => `<th scope="col" data-monat="${i + 1}">${m}</th>`).join('')}</tr></thead>
    <tbody>
      ${SAISON.map(([n, frisch, lager = []]) => `<tr><th scope="row">${esc(n)}</th>${MONATE.map((m, i) => { const mo = i + 1; const c = frisch.includes(mo) ? 'frisch' : lager.includes(mo) ? 'lager' : ''; return `<td data-monat="${mo}"${c ? ` class="${c}"` : ''}><span class="sr">${c === 'frisch' ? 'frisch' : c === 'lager' ? 'Lager' : '–'}</span></td>`; }).join('')}</tr>`).join('\n      ')}
    </tbody>
  </table>
</div>
<p class="abschnitt leise">Richtwerte für den Freilandanbau in Deutschland; je nach Region und Wetter verschiebt sich die Saison um einige Wochen.</p>`,
}));

// ---------- Infoseiten ----------
const imp = cfg.impressum;
const impFehlt = !imp.name || !imp.strasse || !imp.plzOrt || !imp.email;
const kontaktMail = cfg.kontaktEmail || imp.email;
const textSeite = (pfad, titel, beschreibung, html, noindex = true) => schreibe(pfad, seite({ titel: `${titel} | Hofladenliste`, beschreibung, pfad, noindex, klasse: 'textseite', inhalt: `<article class="text">${html}</article>` }), !noindex);
textSeite('/impressum/', 'Impressum', 'Impressum von hofladenliste.de', `<h1>Impressum</h1>
${impFehlt ? '<p class="fehler">Das Impressum wird gerade vervollständigt.</p>' : ''}
<p>Angaben gemäß § 5 DDG</p>
<p>${esc(imp.name)}<br>${esc(imp.strasse)}<br>${esc(imp.plzOrt)}</p>
<p>E-Mail: ${imp.email ? `<a href="mailto:${esc(imp.email)}">${esc(imp.email)}</a>` : ''}${imp.telefon ? `<br>Telefon: ${esc(imp.telefon)}` : ''}</p>
<p>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: ${esc(imp.name)}, Anschrift wie oben.</p>
<h2>Datenquellen und Lizenzen</h2>
<p>Einträge: © OpenStreetMap-Mitwirkende, Open Database License (ODbL), <a href="https://www.openstreetmap.org/copyright">openstreetmap.org/copyright</a>. Postleitzahlen: GeoNames, CC BY 4.0. Umriss Deutschlands: Natural Earth (gemeinfrei). Karte: Leaflet (BSD-2-Clause). Schriften: Zilla Slab und Atkinson Hyperlegible Next (SIL Open Font License).</p>`);
textSeite('/datenschutz/', 'Datenschutzerklärung', 'Datenschutzerklärung von hofladenliste.de', `<h1>Datenschutzerklärung</h1>
<h2>Verantwortlicher</h2>
<p>${esc(imp.name) || '[Name]'}, ${esc(imp.strasse) || '[Straße]'}, ${esc(imp.plzOrt) || '[PLZ Ort]'}, ${esc(imp.email) || '[E-Mail]'}</p>
<h2>Hosting</h2>
<p>Diese Website wird über Cloudflare (Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA) ausgeliefert. Beim Aufruf verarbeitet Cloudflare technisch notwendige Verbindungsdaten (z. B. IP-Adresse, Zeitpunkt, angeforderte Seite), um die Website auszuliefern und vor Angriffen zu schützen (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare ist unter dem EU-US Data Privacy Framework zertifiziert.</p>
<h2>Schriften und Skripte</h2>
<p>Schriften und Programmbibliotheken liegen auf unserem eigenen Server. Es werden keine Inhalte von Google Fonts oder anderen Schriftanbietern geladen.</p>
<h2>Karten</h2>
<p>Karten werden erst geladen, wenn du auf „Karte laden“ klickst. Dann ruft dein Browser Kartenbilder von den Servern der OpenStreetMap Foundation (St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS, Großbritannien) ab; dabei wird deine IP-Adresse übertragen (Art. 6 Abs. 1 lit. a DSGVO). Wenn du „Für diese Website merken“ auswählst, speichert dein Browser diese Entscheidung lokal (localStorage). Du kannst sie jederzeit über die Browsereinstellungen löschen. Datenschutzhinweise der OpenStreetMap Foundation: <a href="https://osmfoundation.org/wiki/Privacy_Policy">osmfoundation.org/wiki/Privacy_Policy</a>.</p>
<h2>Postleitzahl- und Standortsuche</h2>
<p>Wenn du eine Postleitzahl eingibst, wird sie an unseren Server übermittelt, um passende Hofläden anzuzeigen. Wenn du „Meinen Standort verwenden“ wählst, fragt dein Browser zuerst um Erlaubnis; die Koordinaten werden nur für diese Suche übertragen und nicht gespeichert. Die zuletzt gesuchte Postleitzahl speichert dein Browser lokal (localStorage).</p>
<h2>Cookies und Tracking</h2>
<p>Diese Website setzt keine Cookies und nutzt kein Tracking. Links zu Routenplanern und zu Websites der Höfe öffnen externe Seiten; dort gelten deren Datenschutzbestimmungen.</p>
<h2>Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde.</p>`);
textSeite('/mitmachen/', 'Hof eintragen oder Angaben korrigieren', 'Trage deinen Hofladen, deine Milchtankstelle oder deinen Regiomaten kostenlos ein oder korrigiere bestehende Angaben.', `<h1>Hof eintragen oder Angaben korrigieren</h1>
<p>Der Eintrag ist kostenlos. Schick uns diese Angaben, wir nehmen sie in der Regel innerhalb weniger Tage auf:</p>
<ul><li>Name des Hofladens oder Automaten</li><li>Adresse</li><li>Öffnungszeiten</li><li>Telefon, E-Mail, Website</li><li>Angebot, z. B. Eier, Milch, Fleisch, Gemüse</li></ul>
${kontaktMail ? `<p><a class="knopf" id="mail-link" href="mailto:${esc(kontaktMail)}?subject=${encodeURIComponent('Eintrag Hofladenliste')}">E-Mail schreiben</a></p>` : '<p class="fehler">Die Kontaktadresse folgt in Kürze.</p>'}
<h2>Direkt in OpenStreetMap eintragen</h2>
<p>Die Einträge stammen aus <a href="https://www.openstreetmap.org/">OpenStreetMap</a>. Wenn du deinen Hof dort einträgst (Kategorie „Hofladen“, Merkmal <code>shop=farm</code>; für Automaten <code>amenity=vending_machine</code> mit <code>vending=milk</code>, <code>eggs</code> usw.), erscheint er bei der nächsten wöchentlichen Aktualisierung auch hier – inklusive Öffnungszeiten.</p>`, false);
schreibe('/404.html', seite({
  titel: 'Seite nicht gefunden | Hofladenliste', beschreibung: 'Diese Seite gibt es nicht.', pfad: '/404.html', noindex: true, klasse: 'textseite',
  inhalt: '<article class="text"><h1>Diese Seite gibt es nicht</h1><p>Vielleicht wurde der Eintrag verschoben. Gib oben deine Postleitzahl ein oder starte auf der <a href="/">Startseite</a>.</p></article>',
}), false);

// ---------- Robots, Sitemap ----------
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /suche\nDisallow: /api/\n\nSitemap: ${cfg.domain}/sitemap.xml\n`);
const urls = sitemap.filter((p) => !p.endsWith('.html'));
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `<url><loc>${cfg.domain}${p}</loc><lastmod>${BUILD_DATUM}</lastmod></url>`).join('\n')}\n</urlset>\n`);

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
const KAT_CODES = Object.keys(KATEGORIEN);
writeFileSync(join(GEN, 'eintraege.json'), JSON.stringify(eintraege.map((e) => [
  +e.lat.toFixed(5), +e.lon.toFixed(5), e.slug, e.titel, e.art, e.ortAnzeige, e.oeffnungszeiten || '', e.typ === 'hofladen' ? 1 : 0,
  e.adresse, e.telefon || '', e.website || '', e.kat.map((x) => 'abcdefghijklmnop'[KAT_CODES.indexOf(x)]).join(''), e.bio ? 1 : 0,
  e.oeffnungszeiten_text || ''])));
writeFileSync(join(GEN, 'kategorien.json'), JSON.stringify(KAT_CODES));

const leereKreise = [...kreise.values()].filter((k) => !proKreis.get(k.code)).length;
const mitKat = eintraege.filter((e) => e.kat.length).length;
console.log(`Build fertig: ${eintraege.length} Einträge (${anzHof} Hofläden, ${eintraege.length - anzHof} Automaten, ${mitKat} mit Angebot), ${kreise.size} Kreise (${leereKreise} ohne Einträge), ${sitemap.length} Seiten in der Sitemap.`);
if (impFehlt) console.warn('WARNUNG: Impressum in site.config.json ist unvollständig.');
