// Inhalts-Hash je Seite (lastmod): nur der Kern zählt
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hofKern, listenKern, HASH_VERSION } from '../scripts/seitenhash.mjs';

const hof = () => ({ titel: 'Hof Müller', titelSeite: 'Hof Müller', art: 'Hofladen', typ: 'hofladen', strasse: 'Dorfstraße 1', plz: '03149', ortAnzeige: 'Forst (Lausitz)',
  lat: 51.7, lon: 14.6, telefon: '03562 123', oeffnungszeiten: 'Mo-Fr 09:00-18:00', kat: ['eier'], k: { code: '12071' } });
const json = (x) => JSON.stringify(x);

test('Hofseite: Nachbarn, Ortsseiten und Umgebung ändern den Kern nicht, eigene Angaben schon', () => {
  const a = hof(), b = { ...hof(), naehe: [[1.2, { titel: 'Anderer Hof' }]], ortSeite: { pfad: '/x/' }, umgebung: { n: 7 }, saison: 'Spargel' };
  assert.equal(json(hofKern(a)), json(hofKern(b)));
  assert.notEqual(json(hofKern(a)), json(hofKern({ ...hof(), oeffnungszeiten: 'Mo-Sa 09:00-18:00' })));
  assert.notEqual(json(hofKern(a)), json(hofKern({ ...hof(), telefon: '03562 999' })));
  assert.notEqual(json(hofKern(a)), json(hofKern({ ...hof(), kat: ['eier', 'milch'] })));
});

test('Listenseite: Öffnungszeiten und Entfernungen in den Karten ändern den Kern nicht, die Liste der Höfe schon', () => {
  const landPfad = /^\/(brandenburg)\//;
  const seite = (karten) => listenKern({ pfad: '/brandenburg/spree-neisse/forst-lausitz/', titel: 'Hofladen Forst', noindex: false, krumen: [], landPfad,
    inhalt: karten.map(([p, z]) => `<article><a href="/hof/${p}/">x</a><span>${z}</span></article>`).join('') });
  const a = seite([['a', 'Mo 9–18'], ['b', '2,1 km']]);
  assert.deepEqual(a, seite([['b', '2,0 km'], ['a', 'Mo 8–18']]));
  assert.notDeepEqual(a, seite([['a', 'Mo 9–18'], ['c', '2,1 km']]));
  assert.equal(listenKern({ pfad: '/ratgeber/x/', titel: 't', noindex: false, krumen: [], landPfad, inhalt: '<a href="/hof/a/">' }), null);
});

test('Seitenarchiv trägt die Version der Hash-Berechnung (oder wird beim nächsten CI-Lauf umgestellt)', () => {
  const stand = JSON.parse(readFileSync(new URL('../data/seiten-stand.json', import.meta.url), 'utf8'));
  assert.ok([undefined, 1, HASH_VERSION].includes(stand.version));
});
