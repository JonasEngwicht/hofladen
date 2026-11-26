// Sprachliche Qualität der erzeugten Seiten: Einzahl/Mehrzahl und Entfernungsangaben aus den Vorlagen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seiten } from './hilfen.mjs';

// Muster, die nur durch falsche Einzahl/Mehrzahl oder 0-km-Entfernungen entstehen
const FEHLER = [' sind 1 ', ' 1 Höfe', ' 1 Einträge', ' 1 Kreisen', ' 1 Bundesländern', 'am selben Ort vom', 'etwa am selben Ort entfernt', 'davon 1 Automaten', ' 1 Hofläden'];

test('keine Zahlwort- und Entfernungsfehler in den Seiten', () => {
  const treffer = new Map(FEHLER.map((m) => [m, []]));
  for (const [pfad, html] of seiten()) {
    for (const m of FEHLER) if (html.includes(m)) treffer.get(m).push(pfad);
  }
  const rest = [...treffer].filter(([, p]) => p.length).map(([m, p]) => `„${m.trim()}“ auf ${p.length} Seiten, z. B. ${p.slice(0, 3).join(', ')}`);
  assert.deepEqual(rest, []);
});

// Kannibalisierung: Zwei indexierbare Listen- oder Themenseiten sollen nicht mit demselben Titel (bis zum ersten „–“) um
// dieselbe Suche konkurrieren. Hofseiten dürfen gleich heißen (der Ort steht hinter dem Strich).
// Ausnahme bis zur Entscheidung B3 (SEO-Plan 26.11., ab ca. 7.12.): Landes- und Stadtseiten der Stadtstaaten.
const STADTSTAATEN = /^\/(?:wochenmaerkte\/)?(berlin|hamburg|bremen)\//;
test('keine zwei indexierbaren Listenseiten mit gleichem Titelanfang', () => {
  const nachAnfang = new Map();
  for (const [pfad, html] of seiten()) {
    if (pfad.startsWith('/hof/') || /<meta name="robots" content="noindex/.test(html)) continue;
    const titel = (html.match(/<title>([^<]*)/) || [])[1] || '';
    const anfang = titel.split(' – ')[0].replace(/ \| Hofladenliste$/, '').trim();
    (nachAnfang.get(anfang) || nachAnfang.set(anfang, []).get(anfang)).push(pfad);
  }
  const doppelt = [...nachAnfang].filter(([, p]) => p.length > 1 && !p.every((x) => STADTSTAATEN.test(x))).map(([t, p]) => `${t}: ${p.join(', ')}`);
  assert.deepEqual(doppelt, []);
});

test('Saisonseite mit eigener Angebotsseite: kurze Auswahl und Link auf die vollständige Liste', () => {
  const s = [...seiten()].find(([p]) => p === '/saisonkalender/kartoffeln/')[1];
  assert.match(s, /<title>Kartoffel-Saison: /);
  assert.match(s, /href="\/angebot\/kartoffeln\/">Alle [\d.]+ Höfe mit Kartoffeln</);
  const hoefe = (s.match(/<main[\s\S]*<\/main>/)[0].match(/href="\/hof\//g) || []).length;
  assert.ok(hoefe > 0 && hoefe <= 20, `${hoefe} Hof-Links`);
});

test('jede indexierbare Hofseite wird von mindestens einer indexierbaren Listen- oder Themenseite verlinkt', () => {
  const alle = [...seiten()];
  const idx = new Set(alle.filter(([, h]) => !/<meta name="robots" content="noindex/.test(h)).map(([p]) => p));
  const verlinkt = new Set();
  for (const [p, h] of alle) {
    if (!idx.has(p) || p.startsWith('/hof/')) continue;
    const main = (h.match(/<main[\s\S]*<\/main>/) || [''])[0];
    for (const m of main.matchAll(/href="(\/hof\/[^"#?]+)"/g)) verlinkt.add(m[1]);
  }
  const ohne = [...idx].filter((p) => p.startsWith('/hof/') && !verlinkt.has(p));
  assert.deepEqual(ohne.slice(0, 10), [], `${ohne.length} Hofseiten ohne Link`);
});
