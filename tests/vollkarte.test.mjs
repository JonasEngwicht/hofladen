// Vollkarte: Datenformat von /punkte.json, Filter in der Adresse, Cluster und das Markup der Kartenseite
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { punkteLesen, filterAusUrl, filterInUrl, passt, clustern } from '../static/vollkarte.js';

const daten = JSON.parse(readFileSync(new URL('../public/punkte.json', import.meta.url)));
const punkte = punkteLesen(daten);
const html = readFileSync(new URL('../public/karte/index.html', import.meta.url), 'utf8');

test('punkte.json: Höfe mit Typ, Slug, Zeiten, Angebot, Land; Märkte mit Link auf die Marktseite', () => {
  assert.ok(daten.h.length > 1000 && Array.isArray(daten.k));
  for (const z of daten.h.slice(0, 500)) {
    assert.equal(z.length, 11);
    assert.ok(['h', 'm', 'e', 'r'].includes(z[2]), z[2]);
    assert.match(z[3], /^[a-z0-9-]+$/);
    assert.match(z[7], /^[a-p]*$/);
  }
  for (const z of daten.m.slice(0, 200)) assert.match(z[4], /^\/wochenmaerkte\/[a-z-]+\/([a-z0-9-]+\/)?#markt-/);
  assert.ok(punkte.some((p) => p.typ === 'markt') && punkte.some((p) => p.kat.includes('eier')));
});

test('Filter: Zustand aus der Adresse lesen und unverändert wieder schreiben', () => {
  const f = filterAusUrl('?typ=h&bio=1&offen=1&rund=1&zahlung=karte&produkt=eier,milch,unsinn');
  assert.deepEqual([f.typ, f.bio, f.offen, f.rund, f.karte, [...f.kat]], ['h', true, true, true, true, ['eier', 'milch']]);
  assert.equal(filterInUrl(f), 'typ=h&offen=1&bio=1&rund=1&zahlung=karte&produkt=eier%2Cmilch');
  assert.equal(filterInUrl(filterAusUrl('')), '');
});

test('Filter: Typ, Bio, Angebot und 24/7 grenzen ein; „Jetzt geöffnet“ nutzt die Öffnungszeiten', () => {
  const p = { typ: 'h', bio: true, karte: false, oh: 'Mo-Fr 08:00-18:00', land: 'BY', kat: ['eier', 'milch'] };
  const mo10 = new Date('2026-11-16T09:00:00Z');
  assert.ok(passt(p, filterAusUrl('?typ=h&bio=1&produkt=eier'), mo10));
  assert.ok(!passt(p, filterAusUrl('?typ=e'), mo10));
  assert.ok(!passt(p, filterAusUrl('?zahlung=karte'), mo10));
  assert.ok(!passt(p, filterAusUrl('?rund=1'), mo10));
  assert.ok(passt(p, filterAusUrl('?offen=1'), mo10));
  assert.ok(!passt(p, filterAusUrl('?offen=1'), new Date('2026-11-15T09:00:00Z')));
  assert.ok(!passt({ ...p, oh: '' }, filterAusUrl('?offen=1'), mo10));
});

test('Cluster fassen nahe Punkte zusammen und behalten alle Punkte', () => {
  const c = clustern(punkte, (p) => ({ x: p.lon * 40, y: -p.lat * 60 }));
  assert.ok(c.length < punkte.length / 5);
  assert.equal(c.reduce((s, x) => s + x.punkte.length, 0), punkte.length);
});

test('/karte/: Filterleiste, „Mein Standort“, Legende und Liste mit Text ohne JavaScript', () => {
  for (const t of ['data-vollkarte', 'data-kf-typ="markt"', 'data-kf-schalter="offen"', 'data-kf-schalter="bio"', 'data-kf-kat="eier"', 'data-mein-standort', 'data-kl-liste', 'data-kl-griff', 'punkt markt'])
    assert.ok(html.includes(t), t);
  assert.match(html, /Hofläden nach Bundesland/);
  assert.doesNotMatch(html, /tile\.openstreetmap\.org/, 'Kacheln erst nach Zustimmung');
});
