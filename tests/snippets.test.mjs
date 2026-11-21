// Snippets für die Google-Ergebnisse: Hofseiten beginnen mit Art, Ort und Angebot, Ortsseiten nennen den nächsten Hof
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seiten } from './hilfen.mjs';

const dec = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const beschreibung = (h) => dec((h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
const alle = [...seiten()].filter(([p]) => p !== '/404.html');
const indexiert = alle.filter(([, h]) => !/<meta name="robots" content="noindex/.test(h));
const hoefe = indexiert.filter(([p]) => p.startsWith('/hof/'));

test('Hofseiten: Beschreibung beginnt mit „<Art> in <Ort>“ statt mit dem Namen aus dem Titel', () => {
  assert.ok(hoefe.length > 1000);
  const falsch = hoefe.filter(([, h]) => !/^(Bio-)?[A-ZÄÖÜ][\wäöüßé-]* in /.test(beschreibung(h))).map(([p, h]) => `${p}: ${beschreibung(h)}`);
  assert.deepEqual(falsch.slice(0, 10), []);
});

test('Hofseiten: Öffnungszeiten kompakt (ohne „geschlossen“-Tage und ohne „:00“)', () => {
  const mitZeiten = hoefe.map(([p, h]) => [p, beschreibung(h)]).filter(([, b]) => b.includes('Geöffnet '));
  assert.ok(mitZeiten.length > 500, `nur ${mitZeiten.length} mit Zeiten`);
  const falsch = mitZeiten.filter(([, b]) => /geschlossen|\d:00\b|\b0\d:/.test(b.match(/Geöffnet [^.]*(?:\.[^ ][^.]*)*\./)?.[0] || ''));
  assert.deepEqual(falsch.slice(0, 10), []);
});

test('Ortsseiten: Beschreibung nennt meist den nächsten Hof mit Namen', () => {
  const orte = indexiert.filter(([p, h]) => /^\/[^/]+\/[^/]+\/[^/]+\/$/.test(p) && beschreibung(h).startsWith('Hofläden in '));
  assert.ok(orte.length > 500, `nur ${orte.length} Ortsseiten`);
  const mit = orte.filter(([, h]) => beschreibung(h).includes('Am nächsten: ')).length;
  assert.ok(mit / orte.length > 0.8, `nur ${mit} von ${orte.length} mit nächstem Hof`);
  assert.ok(!orte.some(([, h]) => /am selben Ort|\)\s*\(/.test(beschreibung(h))), 'keine Doppelklammern oder „am selben Ort“');
});

const titel = (h) => dec((h.match(/<title>([^<]*)<\/title>/) || [])[1] || '');

test('Hofseiten: „Öffnungszeiten“ im Titel nur, wenn welche hinterlegt sind, und deutlich öfter als früher', () => {
  const mit = hoefe.filter(([, h]) => titel(h).includes('Öffnungszeiten'));
  assert.ok(mit.length > 4000, `nur ${mit.length} Titel mit „Öffnungszeiten“`);
  const ohneZeiten = mit.filter(([, h]) => h.includes('<p class="leise">Keine Öffnungszeiten hinterlegt.')).map(([p]) => p);
  assert.deepEqual(ohneZeiten.slice(0, 10), []);
});

test('Hofseiten: Rechtsformen (GmbH, GbR …) nur noch im Titel, wenn der Name sonst doppelt wäre', () => {
  // Vorher (21.11.) 142 Titel mit Rechtsform; übrig bleiben nur Namensgleiche wie „Hofladen Fischer“
  const mit = hoefe.filter(([, h]) => /\b(GmbH|GbR|OHG)\b/.test(titel(h)));
  assert.ok(mit.length < 20, `${mit.length} Titel mit Rechtsform: ${mit.slice(0, 5).map(([p]) => p).join(', ')}`);
});

test('Automaten-Übersicht nennt „24/7“ in der Beschreibung', () => {
  const [, h] = alle.find(([p]) => p === '/hofladen-automaten/');
  assert.match(beschreibung(h), /24\/7/);
});
