#!/usr/bin/env node
// Baut die statische Website nach public/ und die Daten für den Worker nach src/generated/.
// Läuft automatisch vor jedem "wrangler deploy" (siehe wrangler.jsonc → build.command).
import { mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, domainToUnicode } from 'node:url';
import { ladePlz, naechsterOrt, slugify, distanzKm, BUNDESLAENDER } from './lib.mjs';
import { zeilen, uebersetze, parse } from '../static/oh.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');
const GEN = join(ROOT, 'src', 'generated');
const cfg = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const BUILD_DATUM = new Date().toISOString().slice(0, 10);

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

// ---------- HTML-Helfer ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telHref = (t) => 'tel:' + t.replace(/[^\d+]/g, '').replace(/^00/, '+');
const kurzUrl = (u) => { let t = u; try { const x = new URL(u); t = domainToUnicode(x.hostname) + x.pathname + x.search; } catch {} return t.replace(/^www\./, '').replace(/\/$/, ''); };
const zahl = (n) => n.toLocaleString('de-DE');
const plural = (n, s, p) => `${zahl(n)} ${n === 1 ? s : p}`;

function seite({ titel, beschreibung, pfad, inhalt, noindex = false, jsonld = [], krumen = [] }) {
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
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css?v=${BUILD_DATUM}">
${[...bc, ...jsonld].map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<header class="kopf"><div class="wrap">
  <a class="logo" href="/"><span class="logo-icon" aria-hidden="true">🌾</span> ${esc(cfg.name)}</a>
  <form class="kopf-suche" action="/suche" method="get" role="search">
    <label class="sr" for="kopf-plz">Postleitzahl</label>
    <input id="kopf-plz" name="plz" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" placeholder="PLZ" required>
    <button type="submit">Suchen</button>
  </form>
</div></header>
${krumen.length ? `<nav class="krumen wrap" aria-label="Brotkrümel"><a href="/">Start</a>${krumen.map(([n, p], i) => i === krumen.length - 1 ? ` › <span>${esc(n)}</span>` : ` › <a href="${esc(p)}">${esc(n)}</a>`).join('')}</nav>` : ''}
<main class="wrap">
${inhalt}
</main>
<footer class="fuss"><div class="wrap">
  <p><a href="/mitmachen/">Hof eintragen oder Angaben korrigieren</a> · <a href="/impressum/">Impressum</a> · <a href="/datenschutz/">Datenschutz</a></p>
  <p class="klein">Daten: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>, verfügbar unter der Open Database License (ODbL). PLZ-Daten: <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0). Alle Angaben ohne Gewähr – bitte Öffnungszeiten vor dem Besuch beim Hof prüfen. Stand: ${BUILD_DATUM}.</p>
</div></footer>
<script type="module" src="/app.js?v=${BUILD_DATUM}"></script>
</body>
</html>
`;
}

function ohBlock(e, kompakt = false) {
  if (e.oeffnungszeiten_text) return `<p class="oh-text">${esc(e.oeffnungszeiten_text)}</p>`;
  if (!e.oeffnungszeiten) return kompakt ? '' : '<p class="leer">Keine Öffnungszeiten hinterlegt.</p>';
  const z = zeilen(e.oeffnungszeiten);
  if (!z) return `<p class="oh-text">${esc(uebersetze(e.oeffnungszeiten))}</p>`;
  if (kompakt) return `<p class="oh-text">${z.map(([t, v]) => `${esc(t)} ${esc(v)}`).join(' · ')}</p>`;
  return `<table class="oh"><tbody>${z.map(([t, v]) => `<tr><th>${esc(t)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
}

function adresse(e) {
  const zeile2 = [e.plz, e.ort].filter(Boolean).join(' ');
  if (e.strasse || zeile2) return [e.strasse, zeile2].filter(Boolean).map(esc).join(', ');
  return `bei ${esc(e.ortNah)} (${esc(e.plzNah)})`;
}

function badges(e) {
  const b = [`<span class="badge ${e.typ}">${esc(e.art)}</span>`];
  if (e.bio) b.push('<span class="badge bio">Bio</span>');
  if (e.oeffnungszeiten && parse(e.oeffnungszeiten)) b.push(`<span class="badge offen" data-oh="${esc(e.oeffnungszeiten)}" hidden></span>`);
  return b.join(' ');
}

function karte(e) {
  return `<article class="karte" data-typ="${e.typ}"${e.oeffnungszeiten ? ` data-oh="${esc(e.oeffnungszeiten)}"` : ''}>
  <h3><a href="${e.pfad}">${esc(e.titel)}</a></h3>
  <p class="badges">${badges(e)}</p>
  <p class="adr">${adresse(e)}</p>
  ${ohBlock(e, true)}
  <p class="kontakt">${[
    e.telefon ? `<a href="${telHref(e.telefon)}">${esc(e.telefon)}</a>` : '',
    e.website ? `<a href="${esc(e.website)}" rel="nofollow noopener" target="_blank">${esc(kurzUrl(e.website))}</a>` : '',
  ].filter(Boolean).join(' · ')}</p>
</article>`;
}

function routeLinks(e) {
  return `<a href="https://www.openstreetmap.org/?mlat=${e.lat}&amp;mlon=${e.lon}#map=16/${e.lat}/${e.lon}" rel="nofollow noopener" target="_blank">Auf der Karte ansehen</a> · <a href="https://www.google.com/maps/dir/?api=1&amp;destination=${e.lat},${e.lon}" rel="nofollow noopener" target="_blank">Route planen</a>`;
}

// ---------- Seiten schreiben ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(GEN, { recursive: true });
const sitemap = [];
function schreibe(pfad, html, inSitemap = true) {
  const datei = join(OUT, pfad, pfad.endsWith('/') ? 'index.html' : '');
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, html);
  if (inSitemap) sitemap.push(pfad);
}

const anzHof = eintraege.filter((e) => e.typ === 'hofladen').length;
const anzAut = eintraege.length - anzHof;

// Startseite
schreibe('/', seite({
  titel: 'Hofläden in der Nähe finden – Hofladenliste',
  beschreibung: `Hofläden, Milchtankstellen, Eierautomaten und Regiomaten in ganz Deutschland: ${zahl(eintraege.length)} Einträge mit Adresse, Öffnungszeiten und Kontakt. Einfach PLZ eingeben.`,
  pfad: '/',
  jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.name, url: cfg.domain + '/',
    potentialAction: { '@type': 'SearchAction', target: cfg.domain + '/suche?plz={plz}', 'query-input': 'required name=plz' } }],
  inhalt: `
<section class="held">
  <h1>Hofläden in deiner Nähe</h1>
  <p>Frisch vom Hof: ${zahl(anzHof)} Hofläden und ${zahl(anzAut)} Hofautomaten wie Milchtankstellen, Eierautomaten und Regiomaten in ganz Deutschland.</p>
  <form class="plz-form" action="/suche" method="get">
    <label for="plz">Deine Postleitzahl</label>
    <div class="zeile">
      <input id="plz" name="plz" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" placeholder="z. B. 03149" required autofocus>
      <button type="submit">Hofläden anzeigen</button>
    </div>
    <p class="fehler" id="plz-fehler" hidden>Diese Postleitzahl kennen wir nicht. Bitte prüfe die Eingabe.</p>
  </form>
  <button type="button" class="link-knopf" id="standort">Oder: meinen Standort verwenden</button>
  <p id="zuletzt" hidden></p>
</section>
<section id="naehe" class="naehe" hidden></section>
<section>
  <h2>Hofläden nach Bundesland</h2>
  <ul class="raster">
    ${laender.map((l) => `<li><a href="/${l.slug}/"><strong>${esc(l.name)}</strong><span>${plural(l.anzahl, 'Eintrag', 'Einträge')}</span></a></li>`).join('\n    ')}
  </ul>
</section>
<section class="text">
  <h2>Was du hier findest</h2>
  <p><strong>Hofläden</strong> verkaufen Produkte direkt vom Erzeuger: Obst, Gemüse, Kartoffeln, Eier, Fleisch, Wurst, Käse, Honig und vieles mehr. <strong>Milchtankstellen</strong> geben frische Rohmilch rund um die Uhr ab, <strong>Eierautomaten</strong> und <strong>Regiomaten</strong> bieten Hofprodukte auch außerhalb der Öffnungszeiten an.</p>
  <p>Die Einträge stammen aus OpenStreetMap und werden laufend ergänzt. Dein Hof fehlt oder eine Angabe stimmt nicht? <a href="/mitmachen/">Hier kannst du ihn eintragen oder korrigieren.</a></p>
</section>`,
}));

// Bundesland- und Kreisseiten
for (const l of laender) {
  const mitDaten = l.kreise.filter((k) => proKreis.get(k.code)?.length);
  schreibe(`/${l.slug}/`, seite({
    titel: `Hofläden in ${l.name} – nach Landkreis | Hofladenliste`,
    beschreibung: `${plural(l.anzahl, 'Hofladen und Hofautomat', 'Hofläden und Hofautomaten')} in ${l.name}: nach Landkreis und kreisfreier Stadt sortiert, mit Öffnungszeiten und Kontakt.`,
    pfad: `/${l.slug}/`,
    krumen: [[l.name, `/${l.slug}/`]],
    inhalt: `
<h1>Hofläden in ${esc(l.name)}</h1>
<p class="intro">${plural(l.anzahl, 'Eintrag', 'Einträge')} in ${plural(mitDaten.length, 'Kreis', 'Kreisen')}. Wähle deinen Landkreis oder deine Stadt:</p>
<ul class="raster">
  ${l.kreise.map((k) => { const n = proKreis.get(k.code)?.length || 0;
    return `<li><a href="${k.pfad}"${n ? '' : ' class="leer"'}><strong>${esc(k.titel)}</strong><span>${n ? plural(n, 'Eintrag', 'Einträge') : 'noch keine Einträge'}</span></a></li>`; }).join('\n  ')}
</ul>`,
  }));

  for (const k of l.kreise) {
    const liste = (proKreis.get(k.code) || []).slice().sort((a, b) =>
      a.ortAnzeige.localeCompare(b.ortAnzeige, 'de') || a.titel.localeCompare(b.titel, 'de'));
    const nHof = liste.filter((e) => e.typ === 'hofladen').length;
    const nAut = liste.length - nHof;
    const orte = new Map();
    for (const e of liste) { if (!orte.has(e.ortAnzeige)) orte.set(e.ortAnzeige, []); orte.get(e.ortAnzeige).push(e); }
    const mitte = kreisMitte.get(k.code);
    const nachbarn = [...kreise.values()].filter((x) => x !== k && kreisMitte.get(x.code))
      .map((x) => [distanzKm(mitte.lat, mitte.lon, kreisMitte.get(x.code).lat, kreisMitte.get(x.code).lon), x])
      .sort((a, b) => a[0] - b[0]).slice(0, 8).map(([, x]) => x);
    const im = k.art === 'Stadt' ? `in ${k.titel}` : `im ${k.titel}`;
    schreibe(k.pfad, seite({
      titel: `Hofläden ${im}${nAut ? ' & Hofautomaten' : ''} | Hofladenliste`,
      beschreibung: liste.length
        ? `${plural(nHof, 'Hofladen', 'Hofläden')}${nAut ? ` und ${plural(nAut, 'Hofautomat', 'Hofautomaten')}` : ''} ${im}: Adressen, Öffnungszeiten, Telefon und Website auf einen Blick.`
        : `Hofläden ${im}: noch keine Einträge – hier findest du Hofläden in der Umgebung.`,
      pfad: k.pfad,
      noindex: liste.length === 0,
      krumen: [[l.name, `/${l.slug}/`], [k.titel, k.pfad]],
      inhalt: `
<h1>Hofläden ${esc(im)}</h1>
<p class="intro">${liste.length ? `${plural(nHof, 'Hofladen', 'Hofläden')}${nAut ? ` und ${plural(nAut, 'Hofautomat', 'Hofautomaten')} (Milchtankstellen, Eierautomaten, Regiomaten)` : ''} ${esc(im)}.` : `Für ${esc(k.titel)} haben wir noch keine Einträge. Unten findest du Hofläden in den Nachbarkreisen.`}</p>
<section id="naehe" class="naehe" hidden></section>
${liste.length ? `<div class="filter" role="group" aria-label="Filter">
  <button type="button" data-filter="alle" aria-pressed="true">Alle (${liste.length})</button>
  ${nHof ? `<button type="button" data-filter="hofladen" aria-pressed="false">Hofläden (${nHof})</button>` : ''}
  ${nAut ? `<button type="button" data-filter="automat" aria-pressed="false">Automaten (${nAut})</button>` : ''}
  <button type="button" data-filter="offen" aria-pressed="false">Jetzt geöffnet</button>
</div>
${[...orte].map(([ort, es]) => `<section class="ort"><h2>${esc(ort)}</h2><div class="karten">${es.map(karte).join('\n')}</div></section>`).join('\n')}` : ''}
<section class="nachbarn">
  <h2>Hofläden in der Umgebung</h2>
  <ul class="raster klein">${nachbarn.map((x) => `<li><a href="${x.pfad}"><strong>${esc(x.titel)}</strong><span>${plural(proKreis.get(x.code)?.length || 0, 'Eintrag', 'Einträge')}</span></a></li>`).join('')}</ul>
</section>`,
    }), liste.length > 0);
  }
}

// Detailseiten
for (const e of eintraege) {
  const k = e.k;
  const naehe = inDerNaehe(e);
  const ld = { '@context': 'https://schema.org', '@type': e.typ === 'hofladen' ? 'Store' : 'LocalBusiness', name: e.titel,
    geo: { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lon }, url: cfg.domain + e.pfad };
  if (e.strasse || e.plz || e.ort) ld.address = { '@type': 'PostalAddress', streetAddress: e.strasse || undefined,
    postalCode: e.plz || undefined, addressLocality: e.ort || undefined, addressCountry: 'DE' };
  if (e.telefon) ld.telephone = e.telefon;
  if (e.website) ld.sameAs = [e.website];
  if (e.oeffnungszeiten && parse(e.oeffnungszeiten)) ld.openingHours = e.oeffnungszeiten.split(';').map((s) => s.trim()).filter((s) => s && !/off|PH/.test(s));
  const ohKurz = e.oeffnungszeiten ? (zeilen(e.oeffnungszeiten) || []).map(([t, v]) => `${t} ${v}`).join(', ') : '';
  schreibe(e.pfad, seite({
    titel: `${e.titel} – ${e.art}${e.name ? ` in ${e.ortAnzeige}` : ''} | Öffnungszeiten & Kontakt`,
    beschreibung: `${e.titel}: ${e.art} in ${e.ortAnzeige} (${k.titel}).${ohKurz ? ` Öffnungszeiten: ${ohKurz}.` : ''}${e.telefon ? ` Telefon: ${e.telefon}.` : ''}`.slice(0, 300),
    pfad: e.pfad,
    jsonld: [ld],
    krumen: [[k.landName, `/${k.landSlug}/`], [k.titel, k.pfad], [e.titel, e.pfad]],
    inhalt: `
<article class="detail" data-oh="${esc(e.oeffnungszeiten || '')}">
<h1>${esc(e.titel)}</h1>
<p class="badges">${badges(e)}</p>
<div class="spalten">
  <section>
    <h2>Adresse</h2>
    <p>${adresse(e)}${e.lageUngefaehr ? '' : `<br><span class="klein">${k.titel}</span>`}</p>
    <p>${e.lageUngefaehr ? '<span class="klein">Genaue Lage noch nicht erfasst.</span>' : routeLinks(e)}</p>
    <h2>Kontakt</h2>
    ${[e.telefon && `<p>Telefon: <a href="${telHref(e.telefon)}">${esc(e.telefon)}</a></p>`,
      e.email && `<p>E-Mail: <a href="mailto:${esc(e.email)}">${esc(e.email)}</a></p>`,
      e.website && `<p>Website: <a href="${esc(e.website)}" rel="nofollow noopener" target="_blank">${esc(kurzUrl(e.website))}</a></p>`,
      e.facebook && `<p><a href="${esc(e.facebook)}" rel="nofollow noopener" target="_blank">Facebook</a></p>`,
      e.instagram && `<p><a href="${esc(e.instagram)}" rel="nofollow noopener" target="_blank">Instagram</a></p>`,
    ].filter(Boolean).join('\n    ') || '<p class="leer">Keine Kontaktdaten hinterlegt.</p>'}
  </section>
  <section>
    <h2>Öffnungszeiten</h2>
    ${ohBlock(e)}
    ${e.typ === 'automat' ? '<p class="klein">Automaten sind oft rund um die Uhr zugänglich, auch wenn keine Zeiten hinterlegt sind.</p>' : ''}
    ${e.produkte ? `<h2>Angebot</h2><p>${e.produkte.map(esc).join(', ')}</p>` : ''}
    ${e.beschreibung ? `<h2>Beschreibung</h2><p>${esc(e.beschreibung)}</p>` : ''}
    ${e.betreiber && e.betreiber !== e.name ? `<p class="klein">Betreiber: ${esc(e.betreiber)}</p>` : ''}
  </section>
</div>
<p class="hinweis">Angaben ohne Gewähr. ${e.quelle === 'osm'
  ? `Quelle: <a href="https://www.openstreetmap.org/${e.osm}" rel="nofollow noopener" target="_blank">OpenStreetMap</a>. Etwas falsch? <a href="https://www.openstreetmap.org/edit?${e.osm.replace('/', '=')}" rel="nofollow noopener" target="_blank">In OpenStreetMap korrigieren</a> oder <a href="/mitmachen/?hof=${esc(e.slug)}">uns Bescheid geben</a>.`
  : `${e.quelleUrl ? `Quelle: <a href="${esc(e.quelleUrl)}" rel="nofollow noopener" target="_blank">${esc(kurzUrl(e.quelleUrl).split('/')[0])}</a>. ` : ''}Etwas falsch? <a href="/mitmachen/?hof=${esc(e.slug)}">Gib uns Bescheid.</a>`}</p>
</article>
${naehe.length ? `<section><h2>Weitere Hofläden in der Nähe</h2><ul class="liste">${naehe.map(([d, x]) => `<li><a href="${x.pfad}">${esc(x.titel)}</a> <span class="klein">${esc(x.art)} · ${esc(x.ortAnzeige)} · ${d.toFixed(1).replace('.', ',')} km</span></li>`).join('')}</ul></section>` : ''}
<p><a href="${k.pfad}">Alle Hofläden ${k.art === 'Stadt' ? 'in' : 'im'} ${esc(k.titel)}</a></p>`,
  }));
}

// Statische Infoseiten
const imp = cfg.impressum;
const impFehlt = !imp.name || !imp.strasse || !imp.plzOrt || !imp.email;
const kontakt = cfg.kontaktEmail || imp.email;
schreibe('/impressum/', seite({
  titel: 'Impressum | Hofladenliste', beschreibung: 'Impressum von hofladenliste.de', pfad: '/impressum/', noindex: true,
  inhalt: `<h1>Impressum</h1>
${impFehlt ? '<p class="fehler">Das Impressum ist noch nicht vollständig.</p>' : ''}
<p>Angaben gemäß § 5 DDG</p>
<p>${esc(imp.name)}<br>${esc(imp.strasse)}<br>${esc(imp.plzOrt)}</p>
<p>E-Mail: ${imp.email ? `<a href="mailto:${esc(imp.email)}">${esc(imp.email)}</a>` : ''}${imp.telefon ? `<br>Telefon: ${esc(imp.telefon)}` : ''}</p>
<p>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: ${esc(imp.name)}, Anschrift wie oben.</p>
<h2>Datenquellen</h2>
<p>Einträge: © OpenStreetMap-Mitwirkende, Open Database License (ODbL), <a href="https://www.openstreetmap.org/copyright">openstreetmap.org/copyright</a>. Postleitzahlen: GeoNames, CC BY 4.0.</p>`,
}), false);

schreibe('/datenschutz/', seite({
  titel: 'Datenschutzerklärung | Hofladenliste', beschreibung: 'Datenschutzerklärung von hofladenliste.de', pfad: '/datenschutz/', noindex: true,
  inhalt: `<h1>Datenschutzerklärung</h1>
<h2>Verantwortlicher</h2>
<p>${esc(imp.name) || '[Name ergänzen]'}, ${esc(imp.strasse) || '[Straße ergänzen]'}, ${esc(imp.plzOrt) || '[PLZ Ort ergänzen]'}, ${esc(imp.email) || '[E-Mail ergänzen]'}</p>
<h2>Hosting</h2>
<p>Diese Website wird über Cloudflare (Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA) ausgeliefert. Beim Aufruf verarbeitet Cloudflare technisch notwendige Verbindungsdaten (z. B. IP-Adresse, Zeitpunkt, angeforderte Seite), um die Website auszuliefern und vor Angriffen zu schützen (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare ist unter dem EU-US Data Privacy Framework zertifiziert.</p>
<h2>Postleitzahl- und Standortsuche</h2>
<p>Wenn du eine Postleitzahl eingibst, wird sie an unseren Server übermittelt, um passende Hofläden anzuzeigen. Wenn du „Standort verwenden“ wählst, fragt dein Browser zuerst um Erlaubnis; die Koordinaten werden nur für diese Suche übertragen und nicht gespeichert. Die zuletzt gesuchte Postleitzahl speichert dein Browser lokal (localStorage), damit du sie beim nächsten Besuch schnell wieder aufrufen kannst. Du kannst sie jederzeit über die Browsereinstellungen löschen.</p>
<h2>Cookies und Tracking</h2>
<p>Diese Website setzt keine Cookies zu Werbe- oder Analysezwecken und bindet keine Inhalte Dritter ein. Links zu Karten (OpenStreetMap, Google Maps) und zu Websites der Höfe öffnen externe Seiten; dort gelten deren Datenschutzbestimmungen.</p>
<h2>Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde.</p>`,
}), false);

schreibe('/mitmachen/', seite({
  titel: 'Hof eintragen oder Angaben korrigieren | Hofladenliste', beschreibung: 'Trage deinen Hofladen, deine Milchtankstelle oder deinen Regiomaten kostenlos ein oder korrigiere bestehende Angaben.', pfad: '/mitmachen/',
  inhalt: `<h1>Hof eintragen oder Angaben korrigieren</h1>
<p>Der Eintrag ist kostenlos. Schick uns diese Angaben:</p>
<ul class="liste"><li>Name des Hofladens oder Automaten</li><li>Adresse</li><li>Öffnungszeiten</li><li>Telefon, E-Mail, Website</li><li>Angebot (z. B. Eier, Milch, Fleisch, Gemüse)</li></ul>
${kontakt ? `<p><a class="knopf" id="mail-link" href="mailto:${esc(kontakt)}?subject=${encodeURIComponent('Eintrag Hofladenliste')}">E-Mail schreiben</a></p>` : '<p class="fehler">Kontaktadresse folgt in Kürze.</p>'}
<p>Du kannst deinen Hof auch direkt in <a href="https://www.openstreetmap.org/">OpenStreetMap</a> eintragen (Kategorie „Hofladen“, Tag <code>shop=farm</code>). Änderungen dort erscheinen bei der nächsten Aktualisierung auch hier.</p>`,
}));

schreibe('/404.html', seite({
  titel: 'Seite nicht gefunden | Hofladenliste', beschreibung: 'Diese Seite gibt es nicht.', pfad: '/404.html', noindex: true,
  inhalt: '<h1>Seite nicht gefunden</h1><p>Diese Seite gibt es nicht (mehr). Gib deine Postleitzahl oben ein oder gehe zur <a href="/">Startseite</a>.</p>',
}), false);

// Statische Dateien
for (const f of ['style.css', 'app.js', 'oh.js', 'favicon.svg']) copyFileSync(join(ROOT, 'static', f), join(OUT, f));
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /suche\nDisallow: /api/\n\nSitemap: ${cfg.domain}/sitemap.xml\n`);

// Sitemaps (max. 50.000 URLs je Datei)
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
  // Ortsname nur, wenn die PLZ eindeutig zu einem Ort gehört; sonst Name des Kreises
  const orte = [...new Set(rows.filter((r) => !r.org).map((r) => r.ort))];
  const name = orte.length === 1 ? orte[0] : kreise.get(kreis).titel;
  plzIndex[p] = [+lat.toFixed(4), +lon.toFixed(4), kreise.get(kreis).pfad, name];
}
writeFileSync(join(GEN, 'plz.json'), JSON.stringify(plzIndex));
writeFileSync(join(GEN, 'eintraege.json'), JSON.stringify(eintraege.map((e) =>
  [+e.lat.toFixed(5), +e.lon.toFixed(5), e.slug, e.titel, e.art, e.ortAnzeige, e.oeffnungszeiten || '', e.typ === 'hofladen' ? 1 : 0])));

const leereKreise = [...kreise.values()].filter((k) => !proKreis.get(k.code)).length;
console.log(`Build fertig: ${eintraege.length} Einträge (${anzHof} Hofläden, ${anzAut} Automaten), ${kreise.size} Kreise (${leereKreise} ohne Einträge), ${sitemap.length} Seiten in der Sitemap.`);
if (impFehlt) console.warn('WARNUNG: Impressum in site.config.json ist unvollständig.');
