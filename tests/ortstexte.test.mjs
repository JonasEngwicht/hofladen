// Lokale Seiten: pflegbare Ortstexte, „Jetzt in der Saison“, Schutz vor Doorway- und Doppelseiten, strukturierte Daten
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, seiten, sitemapUrls, DOMAIN } from './hilfen.mjs';
import { pruefeOrtstext, ladeOrtstexte, textHtml, einleitungHtml, einleitungRestHtml, eigeneFragen } from '../scripts/ortstexte.mjs';

const gut = {
  pfad: '/bayern/oberallgaeu/',
  einleitung: ['Rund um Oberstdorf und Sonthofen prägen Alpwirtschaft und Sennereien das Angebot – viele Höfe verkaufen Bergkäse.'],
  fragen: [{ frage: 'Wo gibt es Bergkäse direkt vom Hof?', antwort: 'Zum Beispiel in den Sennereien rund um [Oberstdorf](/bayern/oberallgaeu/oberstdorf/).' }],
  saison: [{ titel: 'Allgäuer Bergkäse', zeit: 'ganzjährig' }],
};

test('Ortstext: gültiger Text wird angenommen', () => {
  assert.deepEqual(pruefeOrtstext(gut), []);
});

test('Ortstext: Platzhalter, fremde Felder, externe Links und falsche Pfade werden abgelehnt', () => {
  const fehler = (o) => pruefeOrtstext({ ...gut, ...o });
  assert.ok(fehler({ einleitung: ['TODO: hier kommt noch ein schöner Text über den Ort hin, bitte später ausfüllen.'] }).some((x) => /Platzhalter/.test(x)));
  assert.ok(fehler({ einleitung: ['Hofläden in [ort] gibt es viele, und alle verkaufen frische Produkte aus der Region.'] }).some((x) => /Platzhalter/.test(x)));
  assert.ok(fehler({ einleitung: ['Mehr Infos gibt es bei [einem anderen Verzeichnis](https://example.org/hofladen) für die Region.'] }).some((x) => /interne Links/.test(x)));
  assert.ok(fehler({ titel: 'x' }).some((x) => /unbekanntes Feld/.test(x)));
  assert.ok(fehler({ pfad: '/bayern/oberallgaeu' }).some((x) => /pfad/.test(x)));
  assert.ok(fehler({ einleitung: ['zu kurz'] }).some((x) => /60 bis 900/.test(x)));
  assert.ok(fehler({ fragen: [{ frage: 'Ohne Fragezeichen', antwort: 'Antwort' }] }).some((x) => /\?/.test(x)));
  assert.ok(pruefeOrtstext({ pfad: '/bayern/' }).some((x) => /mindestens/.test(x)));
});

test('Ortstext: Text wird maskiert, nur interne Links werden zu HTML', () => {
  assert.equal(textHtml('Käse & <b>Wurst</b> in [Oberstdorf](/bayern/oberallgaeu/oberstdorf/)'),
    'Käse &amp; &lt;b&gt;Wurst&lt;/b&gt; in <a href="/bayern/oberallgaeu/oberstdorf/">Oberstdorf</a>');
  assert.match(einleitungHtml(gut), /^<div class="ortstext"><p>Rund um Oberstdorf/);
  assert.equal(einleitungRestHtml(gut), '');
  assert.equal(einleitungRestHtml({ einleitung: ['a', 'b & c'] }), '<p>b &amp; c</p>');
  assert.deepEqual(eigeneFragen(gut)[0], ['Wo gibt es Bergkäse direkt vom Hof?', 'Zum Beispiel in den Sennereien rund um <a href="/bayern/oberallgaeu/oberstdorf/">Oberstdorf</a>.']);
  assert.equal(einleitungHtml(null), '');
});

test('Ortstexte laden: Vorlagen übersprungen, Fehler gesammelt, doppelte Pfade erkannt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ortstexte-'));
  writeFileSync(join(dir, '_vorlage.json'), JSON.stringify({ pfad: 'kaputt' }));
  writeFileSync(join(dir, 'a.json'), JSON.stringify(gut));
  writeFileSync(join(dir, 'b.json'), JSON.stringify(gut));
  writeFileSync(join(dir, 'c.json'), '{ kein json');
  const { texte, fehler } = ladeOrtstexte(dir);
  assert.deepEqual([...texte.keys()], ['/bayern/oberallgaeu/']);
  assert.equal(texte.get('/bayern/oberallgaeu/').datei, 'a.json');
  assert.ok(fehler.some((x) => x.startsWith('b.json') && /steht schon/.test(x)));
  assert.ok(fehler.some((x) => x.startsWith('c.json')));
  assert.ok(!fehler.some((x) => x.startsWith('_vorlage')));
});

const alle = new Map(seiten());
const sitemap = new Set(sitemapUrls().map((x) => x.loc.slice(DOMAIN.length)));
const noindex = (html) => /<meta name="robots" content="noindex/.test(html);
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));

test('Ortstexte im Repo: alle Dateien gültig und auf einer indexierbaren Seite angezeigt', () => {
  const { texte, fehler } = ladeOrtstexte(join(ROOT, 'data', 'ortstexte'));
  assert.deepEqual(fehler, []);
  for (const [pfad, t] of texte) {
    assert.ok(sitemap.has(pfad), `${t.datei}: ${pfad} ist keine indexierbare Seite`);
    const html = alle.get(pfad);
    if (t.einleitung) {
      const kopf = html.slice(html.indexOf('<section class="seitenkopf">'), html.indexOf('data-liste>'));
      assert.ok(kopf.includes(einleitungHtml(t)), `${t.datei}: erster Absatz fehlt über der Liste`);
      assert.ok(html.includes(einleitungRestHtml(t)), `${t.datei}: weitere Absätze fehlen`);
    }
    for (const [q] of eigeneFragen(t)) assert.ok(html.includes(`<h3>${q.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</h3>`), `${t.datei}: Frage fehlt`);
  }
  // Die Vorlage zum Kopieren bleibt im gültigen Format
  assert.deepEqual(pruefeOrtstext(JSON.parse(readFileSync(join(ROOT, 'data', 'ortstexte', '_vorlage.json'), 'utf8'))), []);
  assert.ok(readdirSync(join(ROOT, 'data', 'ortstexte')).includes('README.md'));
});

test('Jetzt in der Saison: nur mit echten Treffern, aktueller Monat, Links auf Höfe der Seite', () => {
  const monat = +new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(5, 7);
  let n = 0;
  for (const [pfad, html] of alle) {
    const m = html.match(/<section class="abschnitt saison-lokal" id="saison" data-saison-monat="(\d+)">([\s\S]*?)<\/section>/);
    if (!m) continue;
    n++;
    assert.equal(+m[1], monat, `${pfad}: Monat`);
    const hoefe = [...m[2].matchAll(/href="(\/hof\/[^"]+)"/g)].map((x) => x[1]);
    assert.ok(hoefe.length || /region-highlights/.test(m[2]), `${pfad}: Saison-Block ohne Inhalt`);
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
  }
  assert.ok(leer > 0 && doppelt > 0);
  // Schreibvarianten desselben Orts: nur eine Seite indexierbar
  assert.ok(sitemap.has('/bayern/schwabach/') && !sitemap.has('/bayern/schwabach/stadt-schwabach/'));
});

test('Kategorieseiten im Kreis: FAQ nur mit sichtbaren Fragen', () => {
  const html = alle.get('/bayern/oberallgaeu/milchtankstellen/');
  const faq = ld(html).find((x) => x['@type'] === 'FAQPage');
  assert.ok(faq && faq.mainEntity.length >= 2);
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test('Startseite: WebSite mit SearchAction auf die Suche', () => {
  const w = ld(alle.get('/')).find((x) => x['@type'] === 'WebSite');
  assert.equal(w.potentialAction['@type'], 'SearchAction');
  assert.equal(w.potentialAction.target.urlTemplate, `${DOMAIN}/suche?q={search_term_string}`);
  assert.equal(w.potentialAction['query-input'], 'required name=search_term_string');
});

test('Hofseiten: Angebot und Beschreibung im JSON-LD nur, wenn sie sichtbar sind', () => {
  let mitAngebot = 0, mitText = 0;
  for (const [pfad, html] of alle) {
    if (!pfad.startsWith('/hof/')) continue;
    const hof = ld(html).find((x) => x['@type'] === 'Store' || x['@type'] === 'LocalBusiness');
    if (hof.hasOfferCatalog) {
      mitAngebot++;
      const chips = html.match(/<h2>Angebot<\/h2><ul class="chips gross">([\s\S]*?)<\/ul>/)?.[1] || '';
      for (const o of hof.hasOfferCatalog.itemListElement) assert.ok(chips.includes(o.itemOffered.name.replace(/&/g, '&amp;')), `${pfad}: ${o.itemOffered.name}`);
    }
    if (hof.description) {
      mitText++;
      assert.ok(html.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').includes(hof.description.slice(0, 80)), `${pfad}: Beschreibung nicht sichtbar`);
    }
  }
  assert.ok(mitAngebot > 1000 && mitText > 100);
});
