// Alle erzeugten HTML-Seiten: Meta-Angaben, Inhalt ohne JavaScript, JSON-LD und Sitemaps
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seiten, sitemapUrls, DOMAIN } from './hilfen.mjs';
import { pruefe, ladeVokabular } from './schema.mjs';

const alle = [...seiten()].filter(([p]) => p !== '/404.html');
const info = new Map(alle.map(([p, html]) => [p, {
  html,
  h1: (html.match(/<h1[\s>]/g) || []).length,
  canonical: [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map((m) => m[1]),
  titel: html.match(/<title>([^<]*)<\/title>/)?.[1] || '',
  beschreibung: html.match(/<meta name="description" content="([^"]*)">/)?.[1] || '',
  noindex: /<meta name="robots" content="noindex/.test(html),
  ld: [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])),
  // Einträge der Liste selbst (ohne „in der Nähe“)
  karten: ((html.match(/data-liste>([\s\S]*?)<p class="leer-filter"/) || [])[1]?.match(/<article class="laden /g) || []).length,
}]));
const sm = sitemapUrls();
const inSitemap = new Set(sm.map((x) => x.loc));
// Listenseiten mit Karten; kompakte Kategorieseiten (Bundesland) zeigen Linklisten statt Karten
const art = (p) => p.startsWith('/hof/') ? 'hof' : p.startsWith('/wochenmaerkte/') ? 'maerkte' : /^\/(ratgeber|betrieb|aushang)\//.test(p) ? 'sonstige' : /<body class="kompakt"/.test(info.get(p)?.html || '') ? 'kompakt'
  : /^\/[^/]+\/[^/]+\/[^/]+\/$/.test(p) && !p.startsWith('/angebot/') ? 'unterseite' : /^\/[^/]+\/[^/]+\/$/.test(p) && !p.startsWith('/angebot/') ? 'kreis' : 'sonstige';

test('jede Seite: genau eine H1, ein Canonical auf sich selbst, Title und Description', () => {
  const fehler = [];
  for (const [p, s] of info) {
    if (s.h1 !== 1) fehler.push(`${p}: ${s.h1} H1`);
    if (s.canonical.length !== 1 || s.canonical[0] !== DOMAIN + p) fehler.push(`${p}: Canonical ${s.canonical}`);
    if (s.titel.length < 10 || s.titel.length > 100) fehler.push(`${p}: Title-Länge ${s.titel.length}`);
    if (s.beschreibung.length < 70 || s.beschreibung.length > 320) fehler.push(`${p}: Description-Länge ${s.beschreibung.length}`);
  }
  assert.deepEqual(fehler.slice(0, 20), []);
});

test('indexierbare Seiten haben eindeutige Titel und Beschreibungen', () => {
  const titel = new Map(), beschr = new Map();
  for (const [p, s] of info) if (!s.noindex) {
    titel.set(s.titel, [...(titel.get(s.titel) || []), p]);
    beschr.set(s.beschreibung, [...(beschr.get(s.beschreibung) || []), p]);
  }
  const doppelt = (m) => [...m].filter(([, ps]) => ps.length > 1).map(([t, ps]) => `${t}: ${ps.join(', ')}`);
  assert.deepEqual(doppelt(titel).slice(0, 10), []);
  assert.deepEqual(doppelt(beschr).slice(0, 10), []);
});

test('Inhalte stehen ohne JavaScript im HTML', () => {
  const fehler = [];
  for (const [p, s] of info) {
    if (s.noindex) continue;
    const a = art(p);
    if ((a === 'kreis' || a === 'unterseite') && s.karten < 3) fehler.push(`${p}: nur ${s.karten} Einträge im HTML`);
    if (a === 'hof' && !/class="kontaktkarte"/.test(s.html)) fehler.push(`${p}: Kontaktkarte fehlt`);
    if (a === 'hof' && !/class="hof-adr"/.test(s.html)) fehler.push(`${p}: Adresse fehlt`);
  }
  assert.deepEqual(fehler.slice(0, 20), []);
});

test('JSON-LD ist gültig und passt zum sichtbaren Inhalt', () => {
  if (ladeVokabular()) console.log('# Schema.org-Vokabular geladen: Eigenschaften werden gegen Typen geprüft');
  const fehler = [];
  for (const [p, s] of info) {
    const typen = s.ld.map((x) => x['@type']);
    for (const obj of s.ld) for (const m of pruefe(obj)) fehler.push(`${p}: ${m}`);
    if (p !== '/' && !typen.includes('BreadcrumbList')) fehler.push(`${p}: BreadcrumbList fehlt`);
    const bc = s.ld.find((x) => x['@type'] === 'BreadcrumbList');
    if (bc && bc.itemListElement.at(-1).item !== DOMAIN + p) fehler.push(`${p}: letzter Brotkrümel ist nicht die Seite`);
    if (p.startsWith('/hof/') && !typen.some((t) => t === 'Store' || t === 'LocalBusiness')) fehler.push(`${p}: Store fehlt`);
    if ((art(p) === 'kreis' || art(p) === 'unterseite') && s.karten && !typen.includes('ItemList')) fehler.push(`${p}: ItemList fehlt`);
    const il = s.ld.find((x) => x['@type'] === 'ItemList');
    if (il && (art(p) === 'kreis' || art(p) === 'unterseite') && il.numberOfItems !== s.karten)
      fehler.push(`${p}: ItemList ${il.numberOfItems} ≠ ${s.karten} Karten`);
    const faq = s.ld.find((x) => x['@type'] === 'FAQPage');
    if (faq) {
      const text = s.html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<');
      for (const q of faq.mainEntity) if (!text.includes(q.name)) fehler.push(`${p}: FAQ-Frage nicht sichtbar: ${q.name}`);
    }
    if (s.ld.find((x) => x['@type'] === 'Store' || x['@type'] === 'LocalBusiness')?.openingHoursSpecification && !/<table class="woche">/.test(s.html))
      fehler.push(`${p}: Öffnungszeiten im JSON-LD, aber nicht sichtbar`);
  }
  assert.deepEqual(fehler.slice(0, 25), []);
});

test('Sitemaps enthalten genau die indexierbaren Seiten mit gültigem lastmod', () => {
  const fehler = [];
  const gesehen = new Set();
  for (const { loc, lastmod } of sm) {
    if (gesehen.has(loc)) fehler.push(`doppelt: ${loc}`);
    gesehen.add(loc);
    const p = loc.replace(DOMAIN, '');
    const s = info.get(p);
    if (!s) fehler.push(`existiert nicht: ${loc}`);
    else if (s.noindex) fehler.push(`noindex in Sitemap: ${loc}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) fehler.push(`lastmod ${lastmod}: ${loc}`);
  }
  for (const [p, s] of info) if (!s.noindex && !inSitemap.has(DOMAIN + p)) fehler.push(`indexierbar, aber nicht in Sitemap: ${p}`);
  assert.deepEqual(fehler.slice(0, 20), []);
});

test('dünne Listenseiten (unter 3 Einträgen) sind nicht indexierbar', () => {
  const fehler = [];
  for (const [p, s] of info) if (!s.noindex && (art(p) === 'kreis' || art(p) === 'unterseite') && s.karten < 3) fehler.push(p);
  assert.deepEqual(fehler, []);
});

test('Startorte haben Seiten "Hofläden in <Ort> und Umgebung" mit Entfernungen', () => {
  for (const [p, name] of [['/berlin/berlin/', 'Berlin'], ['/brandenburg/cottbus/', 'Cottbus'], ['/sachsen/dresden/', 'Dresden'],
    ['/sachsen/leipzig-stadt/', 'Leipzig'], ['/bayern/muenchen-stadt/', 'München'], ['/brandenburg/spree-neisse/forst-lausitz/', 'Forst (Lausitz)']]) {
    const s = info.get(p);
    assert.ok(s, p);
    assert.match(s.html, new RegExp(`<h1>Hofläden in ${name.replace(/[()]/g, '\\$&')} und Umgebung</h1>`), p);
    assert.ok(!s.noindex, `${p} indexierbar`);
    assert.ok(s.karten >= 3, `${p}: ${s.karten} Einträge`);
    assert.match(s.html, /data-radius-filter="10"/, `${p}: Umkreisfilter`);
    assert.match(s.html, /<span class="km">/, `${p}: Entfernungen`);
  }
});

test('Hofseiten zeigen Aktualität, Korrektur und Übernahme', () => {
  const s = info.get('/hof/kittlers-hofladen-riesa/');
  assert.match(s.html, /Seite aktualisiert: \d{2}\.\d{2}\.\d{4}/);
  assert.match(s.html, /eintrag=n[0-9]+&amp;aktion=uebernehmen/);
  assert.doesNotMatch(s.html, /%%SEITENSTAND%%/);
});

test('Kategorieseiten auf Bundes-, Landes- und Kreisebene', () => {
  for (const p of ['/hofladen-automaten/', '/bio-hofladen/', '/angebot/eier/', '/bayern/bio-hofladen/', '/bayern/hofladen-automaten/', '/bayern/milchtankstellen/']) {
    const s = info.get(p);
    assert.ok(s && !s.noindex, p);
    assert.match(s.html, /data-naehe=/, `${p}: Nähe-Suche`);
  }
  const kompakt = info.get('/bayern/bio-hofladen/');
  assert.ok((kompakt.html.match(/<ul class="eintrag-liste">/g) || []).length >= 3, 'Einträge nach Kreis');
  // mindestens eine Kreis-Seite je neuer Kategorie
  const pfade = [...info.keys()];
  assert.ok(pfade.some((p) => /^\/[^/]+\/[^/]+\/bio-hofladen\/$/.test(p)), 'Bio je Kreis');
  assert.ok(pfade.some((p) => /^\/[^/]+\/[^/]+\/hofladen-automaten\/$/.test(p)), 'Automaten je Kreis');
});

test('Hofseiten haben Platz für die Entfernung, Listen den Schalter „Jetzt geöffnet“', () => {
  const hoefe = alle.filter(([p]) => art(p) === 'hof');
  assert.ok(hoefe.length > 1000);
  for (const [p, html] of hoefe) assert.match(html, /data-entfernung hidden/, p);
  const kreise = alle.filter(([p]) => art(p) === 'kreis' && info.get(p).karten > 0);
  assert.ok(kreise.length > 100);
  for (const [p, html] of kreise) assert.match(html, /data-offen-filter/, p);
});

test('Hofseiten: Rückmeldung „Stimmt das noch?“ und Datum der letzten Prüfung, wo bekannt', () => {
  const hoefe = alle.filter(([p]) => art(p) === 'hof');
  for (const [p, html] of hoefe) assert.match(html, /data-rueckmeldung="[a-z0-9-]+"/, p);
  const mitDatum = hoefe.filter(([, html]) => /Zuletzt geprüft: <time datetime="\d{4}-\d{2}-\d{2}">/.test(html));
  assert.ok(mitDatum.length > 500, `nur ${mitDatum.length} Seiten mit Prüfdatum`);
});

test('Wochenmärkte: Kreisseiten nur ab drei Märkten, dünne Landesseiten noindex', () => {
  const m = alle.filter(([p]) => p.startsWith('/wochenmaerkte/'));
  if (!m.length) return; // ohne Marktdaten keine Seiten
  for (const [p, html] of m) {
    const n = (html.match(/<article class="laden laden-markt"/g) || []).length;
    if (/^\/wochenmaerkte\/[^/]+\/[^/]+\/$/.test(p)) assert.ok(n >= 3, `${p}: nur ${n} Märkte`);
    if (info.get(p).noindex) assert.ok(!inSitemap.has(DOMAIN + p), `${p} ist noindex, steht aber in der Sitemap`);
  }
  assert.ok(m.some(([p]) => p === '/wochenmaerkte/'));
});

test('Orts- und Umgebungsseiten: Titel, Intro, Filter und Liste nennen dieselbe Zahl', () => {
  const zahl = (t) => +String(t).replace(/\./g, '');
  let geprueft = 0;
  for (const [p, html] of alle) {
    if (!/data-radius-filter/.test(html)) continue;
    const karten = info.get(p).karten;
    const titel = info.get(p).titel.match(/– ([\d.]+) Höfe/)?.[1];
    const alleKnopf = html.match(/data-typ-filter="alle" aria-pressed="true">Alle <span>([\d.]+)<\/span>/)?.[1];
    const intro = html.match(/<section class="seitenkopf">[\s\S]*?<p>(?:Die ([\d.]+) nächsten|([\d.]+) Einträge?)/);
    assert.equal(zahl(alleKnopf), karten, `${p}: Filter „Alle“ ≠ Liste`);
    assert.ok(intro, `${p}: Intro ohne Zahl`);
    assert.equal(zahl(intro[1] || intro[2]), karten, `${p}: Intro ≠ Liste`);
    // Bei gekappter Liste („Die 150 nächsten von 412 Einträgen“) nennt der Titel die Gesamtzahl
    const gesamt = intro[1] ? html.match(/nächsten von ([\d.]+) Einträgen/)?.[1] : null;
    if (titel) assert.equal(zahl(titel), gesamt ? zahl(gesamt) : karten, `${p}: Titel ≠ Liste`);
    geprueft++;
  }
  assert.ok(geprueft > 100, `nur ${geprueft} Seiten geprüft`);
});

test('Saison: alle Sorten haben eine Seite, dünne Seiten sind noindex; Startseite zeigt die Sorten im HTML', () => {
  const sorten = alle.filter(([p]) => /^\/saisonkalender\/[^/]+\/$/.test(p));
  assert.ok(sorten.length >= 30, `nur ${sorten.length} Sortenseiten`);
  for (const [p, html] of sorten) {
    const n = (html.match(/<li><a href="\/hof\//g) || []).length;
    if (n < 3) assert.ok(info.get(p).noindex, `${p} hat ${n} Höfe, ist aber indexierbar`);
    assert.match(html, /Hier gibt’s .* in deiner Nähe/, p);
  }
  const start = info.get('/').html;
  assert.match(start, /data-saison-inhalt><p class="saison-monat">Im \w+ frisch vom Feld/);
  assert.match(start, /<ul class="saison-chips"><li><a href="\/saisonkalender\//);
});

test('Hofseiten: Einträge am selben Hof getrennt, mit eigenen Zeiten', () => {
  const html = info.get('/hof/waldhausener-hofladen-aachen/')?.html;
  if (!html) return;
  assert.match(html, /<h3 class="kk-unter">Am selben Hof<\/h3>/);
  assert.match(html, /zeiten-hinweis/);
  assert.doesNotMatch(html, />0,0 km</);
});

test('Produkt-Land-Seiten: nur ab drei Einträgen, verlinkt von der Produktseite', () => {
  const seitenPL = [...info.keys()].filter((p) => /^\/angebot\/[a-z]+\/[a-z-]+\/$/.test(p));
  assert.ok(seitenPL.length > 20);
  for (const p of seitenPL) {
    const s = info.get(p);
    assert.ok(!s.noindex, p);
    assert.ok((s.html.match(/<ul class="eintrag-liste">[\s\S]*?<\/ul>/g) || []).join('').split('<li>').length - 1 >= 3, p);
    assert.ok(info.get(p.replace(/[a-z-]+\/$/, '')).html.includes(`href="${p}"`), `${p} nicht verlinkt`);
  }
});

test('Vertrauensseiten und Statistik: indexierbar, im Footer verlinkt, Zahlen stimmen', () => {
  for (const p of ['/ueber-uns/', '/kontakt/', '/presse/', '/statistik/']) {
    assert.ok(info.has(p) && !info.get(p).noindex, p);
    assert.ok(info.get('/').html.includes(`href="${p}"`), `${p} im Footer`);
  }
  assert.match(info.get('/kontakt/').html, /hofladenliste@gmail\.com/);
  const stat = info.get('/statistik/').html;
  const zeilen = [...stat.matchAll(/<tr><th scope="row"><a href="\/[a-z-]+\/">[^<]+<\/a><\/th><td>([\d.]+)<\/td><td>([\d.]+)<\/td>/g)];
  assert.equal(zeilen.length, 16);
  const summe = zeilen.reduce((s, m) => s + +m[1].replace(/\./g, '') + +m[2].replace(/\./g, ''), 0);
  const eintraege = JSON.parse(readFileSync(new URL('../src/generated/eintraege.json', import.meta.url))).length;
  assert.equal(summe, eintraege);
});

test('PWA: Manifest mit Kurzbefehlen, Service Worker und Offline-Seite', () => {
  const m = JSON.parse(readFileSync(new URL('../public/site.webmanifest', import.meta.url)));
  assert.equal(m.display, 'standalone');
  assert.ok(m.shortcuts.some((s) => s.url === '/karte/?offen=1&standort=1'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  assert.match(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), /addEventListener\('fetch'/);
  assert.ok(info.get('/offline/').noindex);
});

test('Ratgeber: Artikel mit Article-JSON-LD, verlinkt von passenden Seiten, keine toten Links', () => {
  const artikel = [...info.keys()].filter((p) => /^\/ratgeber\/[a-z-]+\/$/.test(p));
  assert.ok(artikel.length >= 8);
  for (const p of artikel) {
    const h = info.get(p).html;
    assert.match(h, /"@type":"Article"/, p);
    assert.ok(!info.get(p).noindex, p);
    for (const m of h.matchAll(/<section class="passend">[\s\S]*?<\/section>/g)) for (const l of m[0].matchAll(/href="(\/[^"]*)"/g)) assert.ok(info.has(l[1]), `${p} → ${l[1]}`);
  }
  assert.match(info.get('/milchtankstelle/').html, /href="\/ratgeber\/rohmilch-milchtankstelle\/"/);
});

test('Datenqualität im Build: neue PLZ aus Adressen suchbar, keine „geschlossen“-Namen, keine Firmen als Ortsnamen', () => {
  const PLZ = JSON.parse(readFileSync(new URL('../src/generated/plz.json', import.meta.url)));
  assert.ok(PLZ['64760'], '64760 Oberzent (Gemeinde seit 2018) fehlt');
  const E = JSON.parse(readFileSync(new URL('../src/generated/eintraege.json', import.meta.url)));
  assert.ok(!E.some((e) => /\bgeschlossen\b/i.test(e[3]) && !/vorübergehend|montags|sonntags/i.test(e[3])), 'Eintrag mit „geschlossen“ im Namen');
  assert.ok(!E.some((e) => /Gate Gourmet|Feldpostleitstelle|St\.?-? ?\w+-Hospital/.test(e[5])), 'Firma/Klinik als Ortsname');
  assert.ok(!E.some((e) => /—>|-->/.test(e[3])), 'Pfeile im Namen');
});
