// Bearbeiten-Links mit stabiler ID: API, Kurzlink, Slug-Änderung, Formular, SEO, Export
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { anfrage, ladeWorker, ladeWorkerModul, ASSETS, ROOT, PUB, DOMAIN, sitemapUrls } from './hilfen.mjs';
import { fakeD1 } from './d1.mjs';
import { index, aufloesen, outreachCsv } from '../src/eintraege.js';
import { felderAusEintrag } from '../static/vorbelegung.js';

const gen = (n) => JSON.parse(readFileSync(join(ROOT, 'src', 'generated', `${n}.json`), 'utf8'));
const EINTRAEGE = gen('eintraege');
const clarenhof = EINTRAEGE.find((e) => e[2] === 'hofladen-gut-clarenhof-frechen');
const SID = clarenhof[15];

test('jeder Eintrag hat eine eindeutige stabile ID (OSM, Betreiber, Overture, manuell)', () => {
  assert.match(SID, /^[nwr]\d+$/);
  const ids = new Set(EINTRAEGE.map((e) => e[15]));
  assert.equal(ids.size, EINTRAEGE.length);
  for (const id of ids) assert.match(id, /^([nwr]\d+|b\d+|m-[a-z0-9-]+|o-[a-z0-9-]+)$/);
});

test('Vorbefüllung mit gültiger ID', async () => {
  const r = await anfrage(`/api/eintrag?id=${SID}`);
  assert.equal(r.status, 200);
  const { eintrag: e } = await r.json();
  assert.equal(e.slug, 'hofladen-gut-clarenhof-frechen');
  assert.equal(e.id, SID);
  assert.ok(e.vollstaendigkeit.prozent >= 0 && e.vollstaendigkeit.prozent <= 100);
  const v = felderAusEintrag(e);
  assert.equal(v.werte.name, e.name);
  assert.equal(v.werte.website, e.website);
  if (e.oeffnungszeiten) assert.ok(v.zeiten || v.bisher, 'Öffnungszeiten vorbelegt oder als Hinweis');
  // auch per Slug auffindbar
  assert.equal((await (await anfrage('/api/eintrag?id=hofladen-gut-clarenhof-frechen')).json()).eintrag.id, SID);
});

test('Zeitfelder aus Öffnungszeiten', () => {
  const v = felderAusEintrag({ oeffnungszeiten: 'Mo-Fr 08:00-12:00,14:00-18:00; Sa 08:00-13:00', angebot: ['eier'], zahlung: ['bar'], bio: true });
  assert.equal(v.zeiten.felder.mo_von1, '08:00');
  assert.equal(v.zeiten.felder.fr_bis2, '18:00');
  assert.equal(v.zeiten.felder.sa_bis1, '13:00');
  assert.equal(v.zeiten.felder.so_von1, undefined);
  assert.deepEqual(v.haken.bio, ['ja']);
  assert.equal(felderAusEintrag({ oeffnungszeiten: '24/7' }).zeiten.rund, true);
  assert.equal(felderAusEintrag({ oeffnungszeiten: 'Mo-Fr 06:00-08:00,10:00-12:00,14:00-18:00' }).bisher, 'Mo-Fr 06:00-08:00,10:00-12:00,14:00-18:00');
});

test('ungültige ID: API 404, Kurzlink führt trotzdem zum Formular', async () => {
  assert.equal((await anfrage('/api/eintrag?id=gibt-es-nicht-42')).status, 404);
  assert.equal((await anfrage('/api/eintrag?id=<script>')).status, 404);
  const r = await anfrage('/hof/gibt-es-nicht-42/bearbeiten/');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/mitmachen/?eintrag=gibt-es-nicht-42&aktion=ergaenzen');
  assert.equal((await anfrage(r.headers.get('location'))).status, 200);
});

test('Kurzlink: stabile ID und Slug, UTM wird durchgereicht', async () => {
  let r = await anfrage(`/hof/${SID}/bearbeiten/?utm_source=outreach&utm_medium=email`);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `/mitmachen/?eintrag=${SID}&aktion=ergaenzen&utm_source=outreach&utm_medium=email`);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  r = await anfrage('/hof/hofladen-gut-clarenhof-frechen/uebernehmen/');
  assert.equal(r.headers.get('location'), `/mitmachen/?eintrag=${SID}&aktion=uebernehmen`);
});

test('Slug-Änderung: Kurzlink und alter Slug führen weiter zum richtigen Eintrag', async () => {
  const { bearbeitenZiel } = await ladeWorkerModul();
  // Eintrag bekommt einen neuen Slug, der alte steht im Seitenarchiv
  const umbenannt = [...clarenhof]; umbenannt[2] = 'clarenhof-neuer-name-frechen';
  const idx = index([umbenannt], { 'hofladen-gut-clarenhof-frechen': SID });
  assert.equal(aufloesen(SID, idx)[2], 'clarenhof-neuer-name-frechen');
  assert.equal(aufloesen('hofladen-gut-clarenhof-frechen', idx)[15], SID);
  assert.equal(bearbeitenZiel(SID, 'bearbeiten', '', idx), `/mitmachen/?eintrag=${SID}&aktion=ergaenzen`);
  assert.equal(bearbeitenZiel('hofladen-gut-clarenhof-frechen', 'bearbeiten', '?utm_source=x', idx), `/mitmachen/?eintrag=${SID}&aktion=ergaenzen&utm_source=x`);
});

test('Detailseite verlinkt „Eintrag ergänzen“ und „Übernehmen“ mit stabiler ID, ohne nofollow', () => {
  const html = readFileSync(join(PUB, 'hof', 'hofladen-gut-clarenhof-frechen', 'index.html'), 'utf8');
  const ergaenzen = html.match(new RegExp(`<a [^>]*href="/mitmachen/\\?eintrag=${SID}&amp;aktion=ergaenzen"[^>]*>`));
  const uebernehmen = html.match(new RegExp(`<a [^>]*href="/mitmachen/\\?eintrag=${SID}&amp;aktion=uebernehmen"[^>]*>`));
  assert.ok(ergaenzen && uebernehmen);
  assert.doesNotMatch(ergaenzen[0] + uebernehmen[0], /nofollow/);
  assert.match(html, /Betreiber\? Eintrag kostenlos übernehmen/);
});

test('noindex und Canonical für /mitmachen/?… und keine Bearbeiten-Links in der Sitemap', async () => {
  const r = await anfrage(`/mitmachen/?eintrag=${SID}&aktion=ergaenzen&utm_source=outreach`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  assert.match(await r.text(), new RegExp(`<link rel="canonical" href="${DOMAIN}/mitmachen/">`));
  assert.equal((await anfrage('/mitmachen/')).headers.get('x-robots-tag'), null);
  assert.ok(!sitemapUrls().some((u) => /bearbeiten|\?/.test(u.loc)));
});

test('aktion=uebernehmen: E-Mail Pflicht; Einsendung mit stabiler ID, Diff, UTM und Badge-Wunsch', async () => {
  const w = await ladeWorker();
  const env = { ASSETS, STATS: fakeD1(), ADMIN_TOKEN: 'y'.repeat(32) };
  const sende = (felder) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ t: String(Date.now() - 10000), einwilligung: 'ja', ...felder })) fd.append(k, v);
    return w.fetch(new Request('https://hofladenliste.de/api/meldung', { method: 'POST', body: fd, headers: { Accept: 'application/json' } }), env, { waitUntil() {} });
  };
  assert.equal((await sende({ art: 'uebernahme', eintrag: SID, telefon: '02234 1' })).status, 400);
  const neuTel = '02234 999999';
  const r = await sende({ art: 'uebernahme', eintrag: SID, kontakt_email: 'hof@example.org', telefon: neuTel, name: clarenhof[16], website: clarenhof[10], badge: 'ja', utm_source: 'outreach', utm_medium: 'email' });
  assert.equal(r.status, 200);
  const liste = await (await w.fetch(new Request('https://hofladenliste.de/api/verwaltung/meldungen', { headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` } }), env, {})).json();
  const m = liste.meldungen[0];
  assert.equal(m.hof, 'hofladen-gut-clarenhof-frechen');
  assert.equal(m.daten.eintrag, SID);
  assert.deepEqual(m.daten.utm, { utm_source: 'outreach', utm_medium: 'email' });
  assert.equal(m.daten.badge, true);
  assert.deepEqual(m.daten.diff.telefon, [clarenhof[9], neuTel]);
  assert.equal(m.daten.diff.name, undefined, 'unveränderte Felder stehen nicht im Diff');
});

test('CSV-Export für die Outreach-Liste', async () => {
  const slugs = ['hofladen-gut-clarenhof-frechen', 'gertrudenhof-bauernmarkt-huerth', 'hofladen-hof-grothues-potthoff-senden', 'https://hofladenliste.de/hof/bioland-lammertzhof-kaarst/', 'gibt-es-nicht'];
  const csv = outreachCsv(slugs, index(EINTRAEGE, gen('routen').alteSlugs), DOMAIN, gen('vollstaendigkeit'));
  const zeilen = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(zeilen.length, 6);
  assert.match(zeilen[0], /^Eingabe;Slug;Stabile ID;Name;Detail-URL;Bearbeiten-Kurzlink;Übernehmen-Link;Vollständigkeit %;Fehlende Felder$/);
  assert.match(zeilen[1], new RegExp(`;${SID};.*/hof/${SID}/bearbeiten/\\?utm_source=outreach&utm_medium=email;.*aktion=uebernehmen&utm_source=outreach&utm_medium=email;\\d+;`));
  assert.match(zeilen[4], /bioland-lammertzhof-kaarst/);
  assert.match(zeilen[5], /nicht gefunden/);
  // geschützter Endpoint liefert dasselbe
  const w = await ladeWorker();
  const env = { ASSETS, STATS: fakeD1(), ADMIN_TOKEN: 'z'.repeat(32) };
  const r = await w.fetch(new Request('https://hofladenliste.de/api/verwaltung/export', { method: 'POST', body: slugs.join('\n'), headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` } }), env, {});
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.equal((await r.text()).replace(/^\ufeff/, ''), csv.replace(/^\ufeff/, ''));
});
