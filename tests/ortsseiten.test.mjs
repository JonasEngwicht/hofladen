// Lokale Seiten: gepflegte Texte (Prüfung, Kurztext oben), „Jetzt in der Saison“, Schutz vor Doorway- und Doppelseiten, FAQ der Kategorieseiten
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, seiten, sitemapUrls, DOMAIN } from './hilfen.mjs';
import { pruefeSeitentexte, seitentext, seitentextOben } from '../scripts/seitentexte.mjs';

const alle = new Map(seiten());
const sitemap = new Set(sitemapUrls().map((x) => x.loc.slice(DOMAIN.length)));
const noindex = (html) => /<meta name="robots" content="noindex/.test(html);
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
const SEITENTEXTE = JSON.parse(readFileSync(join(ROOT, 'data', 'seitentexte.json'), 'utf8'));

test('Seitentexte prüfen: Platzhalter, HTML, externe Links, fremde Felder und zu lange Kurztexte werden erkannt', () => {
  assert.deepEqual(pruefeSeitentexte({ '/bayern/oberallgaeu/': { oben: 'Rund um Oberstdorf prägen Sennereien das Angebot.', faq: [{ frage: 'Wo gibt es Bergkäse?', antwort: 'In den Sennereien.' }],
    saison: [{ titel: 'Bergkäse', zeit: 'ganzjährig' }], quellen: [{ titel: 'Quelle', url: 'https://example.org/' }], links: [{ text: 'Oberstdorf', pfad: '/bayern/oberallgaeu/oberstdorf/' }] } }), []);
  const f = (e, pfad = '/bayern/') => pruefeSeitentexte({ [pfad]: e }).join(' | ');
  assert.match(f({ oben: 'Hofläden in [ort] gibt es viele.' }), /Platzhalter/);
  assert.match(f({ einleitung: 'TODO: Text schreiben' }), /Platzhalter/);
  assert.match(f({ einleitung: 'Mehr bei https://example.org' }), /Web-Adressen/);
  assert.match(f({ einleitung: '<b>fett</b>' }), /ohne HTML/);
  assert.match(f({ untertitel: 'x' }), /unbekanntes Feld/);
  assert.match(f({ oben: 'x'.repeat(451) }), /zu lang/);
  assert.match(f({ faq: [{ frage: 'ohne Fragezeichen', antwort: 'a' }] }), /FAQ/);
  assert.match(f({ links: [{ text: 'x', pfad: 'https://example.org/' }] }), /kein interner Pfad/);
  assert.match(f({}, '/bayern'), /Schrägstrich/);
});

test('Seitentexte: Quellen werden als nofollow verlinkt, Kurztext oben wird maskiert', () => {
  assert.equal(seitentext({ quellen: [{ titel: 'Q', url: 'https://example.org/' }] }), null, 'Quellen allein sind kein Text');
  const st = seitentext({ einleitung: 'Text', quellen: [{ titel: 'Q', url: 'https://example.org/' }, { titel: 'böse', url: 'javascript:alert(1)' }] });
  assert.match(st.html, /Quellen: <a href="https:\/\/example\.org\/" rel="nofollow noopener" target="_blank">Q<\/a><\/p>/);
  assert.doesNotMatch(st.html, /javascript:/);
  assert.equal(seitentextOben({ oben: 'Käse & <b>Wurst</b>' }), '<div class="ortstext"><p>Käse &amp; &lt;b&gt;Wurst&lt;/b&gt;</p></div>');
  assert.equal(seitentextOben({}), '');
});

test('data/seitentexte.json: gültig, nur für indexierbare Seiten, Kurztext steht über der Liste', () => {
  assert.deepEqual(pruefeSeitentexte(SEITENTEXTE), []);
  for (const [pfad, e] of Object.entries(SEITENTEXTE)) {
    assert.ok(sitemap.has(pfad) && !noindex(alle.get(pfad)), `${pfad} ist keine indexierbare Seite`);
    const html = alle.get(pfad);
    if (e.oben) {
      const i = html.indexOf(seitentextOben(e)), liste = html.indexOf('data-liste>');
      assert.ok(i > html.indexOf('</h1>') && (liste < 0 || i < liste), `${pfad}: Kurztext nicht zwischen Überschrift und Liste`);
    }
    for (const q of e.faq || []) assert.ok(ld(html).some((j) => j['@type'] === 'FAQPage' && j.mainEntity.some((x) => x.name === q.frage)), `${pfad}: Frage fehlt im JSON-LD`);
    for (const l of e.links || []) assert.ok(alle.has(l.pfad), `${pfad}: Link ${l.pfad} zeigt auf keine Seite`);
  }
});

test('Gepflegte Ortstexte sind individuell: kein Kurztext und keine Einleitung doppelt', () => {
  for (const feld of ['oben', 'einleitung']) {
    const gesehen = new Map();
    for (const [pfad, e] of Object.entries(SEITENTEXTE)) {
      if (!e[feld]) continue;
      const kern = e[feld].toLowerCase().replace(/[^a-zäöüß]+/g, ' ').trim().slice(0, 80);
      assert.ok(!gesehen.has(kern), `${pfad}: "${feld}" beginnt wie bei ${gesehen.get(kern)}`);
      gesehen.set(kern, pfad);
    }
  }
});

test('Jetzt in der Saison: nur mit echten Treffern, Monat beim Bauen, verlinkte Höfe stehen auf der Seite', () => {
  const monat = +new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(5, 7);
  let n = 0;
  for (const [pfad, html] of alle) {
    const m = html.match(/<section class="abschnitt saison-lokal" id="saison"( data-saison-monat="(\d+)")?>([\s\S]*?)<\/section>/);
    if (!m) continue;
    n++;
    const hoefe = [...m[3].matchAll(/href="(\/hof\/[^"]+)"/g)].map((x) => x[1]);
    if (m[1]) assert.equal(+m[2], monat, `${pfad}: Monat`);
    assert.ok(m[1] ? hoefe.length : /region-highlights/.test(m[3]), `${pfad}: Saison-Block ohne Inhalt`);
    const liste = html.slice(html.indexOf('data-liste>'), html.indexOf('karten-spalte'));
    for (const h of hoefe) assert.ok(liste.includes(`href="${h}"`), `${pfad}: ${h} steht nicht in der Liste der Seite`);
  }
  assert.ok(n > 100, `nur ${n} Seiten mit Saison-Block`);
});

test('Umgebungsseiten ohne eigenen Eintrag und Doppelseiten sind noindex und fehlen in der Sitemap', () => {
  let leer = 0, doppelt = 0;
  for (const [pfad, html] of alle) {
    if (!html.includes('und Umgebung</h1>')) continue;
    if (/Direkt in .{1,80}? ist noch kein Hof eingetragen/.test(html)) {
      leer++;
      assert.ok(noindex(html) && !sitemap.has(pfad), `${pfad}: leere Umgebungsseite indexierbar`);
    }
    const ziel = html.match(/Fast dieselben Höfe zeigt auch die Seite <a href="([^"]+)">/)?.[1];
    if (ziel) {
      doppelt++;
      assert.ok(noindex(html) && !sitemap.has(pfad), `${pfad}: Doppelseite indexierbar`);
      assert.ok(sitemap.has(ziel) && !noindex(alle.get(ziel)), `${pfad}: Ziel ${ziel} nicht indexierbar`);
    }
    // Links auf andere Orte in der Nähe zeigen nur auf indexierbare Seiten
    const nah = html.match(/<h2>Hofläden in Orten in der Nähe von [^<]*<\/h2>([\s\S]*?)<\/section>/)?.[1] || '';
    for (const [, p] of nah.matchAll(/href="([^"]+)"/g)) assert.ok(sitemap.has(p), `${pfad}: verlinkt ${p} (noindex) als Ort in der Nähe`);
  }
  assert.ok(leer > 0 && doppelt > 0, `${leer} leer, ${doppelt} doppelt`);
  // Schreibvarianten desselben Orts: nur eine Seite indexierbar
  assert.ok(sitemap.has('/bayern/schwabach/') && !sitemap.has('/bayern/schwabach/stadt-schwabach/'));
});

test('Kategorieseiten im Kreis: FAQ nur mit sichtbaren Fragen', () => {
  const html = alle.get('/bayern/oberallgaeu/milchtankstellen/');
  const faq = ld(html).find((x) => x['@type'] === 'FAQPage');
  assert.ok(faq && faq.mainEntity.length >= 2);
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test('Orts- und Stadtseiten zeigen ihre Umgebung, nicht den halben Kreis (SEO-Plan B1)', async () => {
  const { messen } = await import('../scripts/ueberschneidung.mjs');
  const m = messen(join(ROOT, 'public'));
  assert.ok(m.seiten > 1500, `${m.seiten} Seiten gemessen`);
  // vor dem Umbau (27.11.2026): 1.076 Paare ab 70 %, 406 ab 80 %, im Mittel 118 Höfe und 310 KB je Seite
  assert.ok(m.paare80 < 80, `${m.paare80} Seitenpaare im selben Kreis zeigen zu mindestens 80 % dieselben Höfe`);
  assert.ok(m.paare70 < 200, `${m.paare70} Seitenpaare ab 70 %`);
  assert.ok(m.hoefeMedian >= 12 && m.hoefeMedian <= 40, `Median ${m.hoefeMedian} Höfe je Seite`);
  assert.ok(m.bytesMedian < 130 * 1024, `Median ${Math.round(m.bytesMedian / 1024)} KB HTML`);
});

test('Orts- und Stadtseiten: Umkreis steht im Text, eigene Höfe sind immer dabei, Hinweis auf Kreis und Karte', () => {
  for (const p of ['/baden-wuerttemberg/breisgau-hochschwarzwald/stegen/', '/sachsen/dresden/', '/brandenburg/spree-neisse/forst-lausitz/']) {
    const html = alle.get(p);
    assert.ok(html, p);
    const R = +html.match(/im Umkreis von (\d+) km/)?.[1];
    assert.ok([5, 10, 15, 25, 50].includes(R), `${p}: Umkreis ${R}`);
    assert.match(html, /class="liste-mehr">[^<]*Weiter weg suchen/, `${p}: Hinweis unter der Liste`);
    const karten = (html.match(/<article class="laden /g) || []).length;
    assert.ok(karten >= 3 && karten <= 90, `${p}: ${karten} Einträge`);
  }
  // Großstadt: alle eigenen Höfe plus einige aus dem Umland
  const dresden = alle.get('/sachsen/dresden/');
  const eigene = +dresden.match(/(\d+) direkt im Ort/)?.[1];
  assert.ok((dresden.match(/<article class="laden /g) || []).length >= eigene + 5, 'Dresden: Umland fehlt');
});
