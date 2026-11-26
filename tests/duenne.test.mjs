// Dünne Hofseiten: ohne Kontakt, Straße und Öffnungszeiten → noindex und nicht in der Sitemap; Liste zum Befüllen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, PUB, sitemapUrls, DOMAIN } from './hilfen.mjs';
import { duenneZeilen, csv, SPALTEN } from '../scripts/duenne-liste.mjs';

const EINTRAEGE = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'eintraege.json'), 'utf8'));
const ohneAlles = (e) => e[7] && !e[9] && !e[10] && !e[20] && !e[17] && !e[6] && !e[13]; // e[7]: Hofladen (1), Automat (0)
const noindex = (slug) => /<meta name="robots" content="noindex/.test(readFileSync(join(PUB, 'hof', slug, 'index.html'), 'utf8'));

test('Hofseiten ohne Kontakt, Straße und Öffnungszeiten sind noindex und fehlen in der Sitemap', () => {
  const karte = new Set(sitemapUrls().map((u) => u.loc));
  const duenn = EINTRAEGE.filter(ohneAlles);
  assert.ok(duenn.length > 100, `zu wenige dünne Einträge: ${duenn.length}`);
  for (const e of duenn) {
    assert.ok(noindex(e[2]), `/hof/${e[2]}/ sollte noindex sein`);
    assert.ok(!karte.has(`${DOMAIN}/hof/${e[2]}/`), `/hof/${e[2]}/ steht in der Sitemap`);
  }
});

test('Eine einzige Angabe (Telefon, Website, E-Mail, Straße oder Zeiten) reicht für die Indexierung', () => {
  const karte = new Set(sitemapUrls().map((u) => u.loc));
  // je Feld eine Stichprobe mit genau dieser Angabe (und Name), damit die alte Regel nicht greift
  const felder = { telefon: 9, website: 10, email: 20, strasse: 17, zeiten: 6 };
  for (const [name, i] of Object.entries(felder)) {
    const andere = Object.values(felder).filter((j) => j !== i);
    const e = EINTRAEGE.find((x) => x[i] && x[16] && andere.every((j) => !x[j]) && !x[13]);
    if (!e) continue; // nicht jede Kombination kommt in den Daten vor
    assert.ok(!noindex(e[2]), `/hof/${e[2]}/ mit nur ${name} sollte indexiert sein`);
    assert.ok(karte.has(`${DOMAIN}/hof/${e[2]}/`), `/hof/${e[2]}/ mit nur ${name} fehlt in der Sitemap`);
  }
});

test('Automaten ohne Kontakt, Straße und Zeiten bleiben indexiert (kontaktlos)', () => {
  const karte = new Set(sitemapUrls().map((u) => u.loc));
  const automaten = EINTRAEGE.filter((e) => !e[7] && !e[9] && !e[10] && !e[20] && !e[17] && !e[6] && !e[13]);
  assert.ok(automaten.length > 100, `zu wenige Automaten ohne Angaben: ${automaten.length}`);
  for (const e of automaten) {
    assert.ok(!noindex(e[2]), `/hof/${e[2]}/ (Automat) sollte indexiert sein`);
    assert.ok(karte.has(`${DOMAIN}/hof/${e[2]}/`), `/hof/${e[2]}/ (Automat) fehlt in der Sitemap`);
  }
});

test('Liste der dünnen Hofseiten: nur nicht indexierte, sortiert, leere Spalten zum Ausfüllen, Semikolon-CSV', () => {
  const liste = [
    { sid: 'n2', name: 'Hof B', art: 'Hofladen', plz: '03149', ort: 'Forst', kreis: 'Spree-Neiße', bundesland: 'Brandenburg', angebot: '', seite: 'https://x/hof/b/', quelle: 'q', indexiert: 'nein' },
    { sid: 'n1', name: 'Hof A; "Alt"', art: 'Regiomat', plz: '80331', ort: 'München', kreis: 'München', bundesland: 'Bayern', angebot: 'Eier', seite: 'https://x/hof/a/', quelle: 'q', indexiert: 'nein' },
    { sid: 'n3', name: 'Hof C', art: 'Hofladen', plz: '03149', ort: 'Forst', kreis: 'Spree-Neiße', bundesland: 'Brandenburg', angebot: '', seite: 'https://x/hof/c/', quelle: 'q', indexiert: 'ja' },
  ];
  const z = duenneZeilen(liste);
  assert.deepEqual(z.map((r) => r[0]), ['n1', 'n2'], 'nur nicht indexierte, Bayern vor Brandenburg');
  assert.equal(z[0].length, SPALTEN.length);
  assert.ok(z.every((r) => r.slice(SPALTEN.indexOf('Straße')).every((v) => v === '')), 'Spalten zum Ausfüllen sind leer');
  const text = csv(z);
  assert.ok(text.startsWith('﻿ID;Name;Art;'));
  assert.match(text, /;"Hof A; ""Alt""";/, 'Semikolon und Anführungszeichen werden maskiert');
});
