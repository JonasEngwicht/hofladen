// Routing im Worker: Seiten, 301-Varianten, 410, 404, Suche und API
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { anfrage, ROOT } from './hilfen.mjs';

const routen = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'routen.json'), 'utf8'));
const ziel = (r) => r.headers.get('location');

test('Seiten mit Schrägstrich liefern 200 und HTML', async () => {
  for (const p of ['/', '/bayern/', '/bayern/landkreis-rosenheim/', '/milchtankstelle/', '/saisonkalender/', '/sonntags-geoeffnet/']) {
    const r = await anfrage(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /text\/html/, p);
  }
});

test('Schreibvarianten leiten dauerhaft (301) um', async () => {
  const faelle = [
    ['/bayern', '/bayern/'],
    ['/bayern/index.html', '/bayern/'],
    ['/index.html', '/'],
    ['/Bayern/Landkreis-Rosenheim/', '/bayern/landkreis-rosenheim/'],
    ['/bayern/m%C3%BCnchen-stadt/', '/bayern/muenchen-stadt/'],
    ['/baden-w%C3%BCrttemberg/', '/baden-wuerttemberg/'],
    ['/bayern//landkreis-rosenheim/', '/bayern/landkreis-rosenheim/'],
    ['/bayern/landkreis-rosenheim?plz=83022', '/bayern/landkreis-rosenheim/?plz=83022'],
  ];
  for (const [von, nach] of faelle) {
    const r = await anfrage(von);
    assert.equal(r.status, 301, von);
    assert.equal(ziel(r), nach, von);
  }
});

test('www leitet auf die Domain ohne www um', async () => {
  const r = await anfrage('https://www.hofladenliste.de/bayern/');
  assert.equal(r.status, 301);
  assert.equal(ziel(r), 'https://hofladenliste.de/bayern/');
});

test('Archivierte Seiten leiten auf ihr Ziel, das selbst existiert', async () => {
  for (const [von, nach] of Object.entries(routen.umleitungen).slice(0, 200)) {
    const r = await anfrage(von);
    assert.equal(r.status, 301, von);
    assert.equal(ziel(r), nach, von);
    assert.equal((await anfrage(nach)).status, 200, `Ziel ${nach}`);
  }
});

test('Entfernte Höfe liefern 410', async () => {
  for (const p of routen.entfernt.slice(0, 50)) assert.equal((await anfrage(p)).status, 410, p);
});

test('Der Worker lädt Seiten über die interne Adresse /…/index.html (darf nicht umgeleitet werden)', async () => {
  // Cloudflare wendet _redirects auch auf env.ASSETS.fetch an – eine Regel für index.html legt alle Seiten lahm
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(join(ROOT, 'static', '_redirects')), false);
});

test('Unbekannte Seiten liefern 404 mit Fehlerseite', async () => {
  const r = await anfrage('/gibt-es-nicht/');
  assert.equal(r.status, 404);
  assert.match(await r.text(), /Diese Seite gibt es nicht/);
  assert.equal((await anfrage('/hof/gibt-es-sicher-nicht-123/')).status, 404);
});

test('Suche und API', async () => {
  let r = await anfrage('/suche?q=88069');
  assert.equal(r.status, 302);
  assert.match(ziel(r), /^\/baden-wuerttemberg\/bodenseekreis\/.*\?plz=88069$/);
  r = await anfrage('/suche?q=Tettnang');
  assert.equal(r.status, 302);
  assert.match(ziel(r), /\?plz=88069$/);
  r = await anfrage('/suche?q=Forst');
  assert.match(ziel(r), /fehler=ort/);
  r = await anfrage('/suche?q=Forst%20(Lausitz)');
  assert.equal(ziel(r), '/brandenburg/spree-neisse/forst-lausitz/?plz=03149');
  r = await anfrage('/plz/03149');
  assert.equal(r.status, 302);
  r = await anfrage('/api/umkreis?plz=03149&limit=3');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ergebnisse.length, 3);
  r = await anfrage('/api/umkreis?plz=88069&bio=1&limit=10');
  assert.ok((await r.json()).ergebnisse.every((e) => e.bio), 'Bio-Filter');
  r = await anfrage('/api/umkreis?plz=88069&typ=automat&limit=10');
  assert.ok((await r.json()).ergebnisse.every((e) => e.typ === 'automat'), 'Automaten-Filter');
  r = await anfrage('/api/umkreis?plz=88069&art=Milchtankstelle&limit=5');
  assert.ok((await r.json()).ergebnisse.every((e) => e.art === 'Milchtankstelle'), 'Art-Filter');
  r = await anfrage('/api/orte?q=Cottb');
  assert.ok((await r.json()).treffer.some((t) => t.name === 'Cottbus'));
});

test('Statische Dateien und Sitemaps', async () => {
  for (const p of ['/robots.txt', '/sitemap.xml', '/sitemaps/hoefe.xml', '/style.css', '/app.js']) assert.equal((await anfrage(p)).status, 200, p);
  assert.equal((await anfrage('/fehlt.css')).status, 404);
});

test('Suche nach Hofnamen', async () => {
  let r = await anfrage('/suche?q=Kittlers%20Hofladen');
  assert.equal(r.status, 302);
  assert.equal(ziel(r), '/hof/kittlers-hofladen-riesa/');
  r = await anfrage('/suche?q=gut%20clarenhof');
  assert.equal(ziel(r), '/hof/hofladen-gut-clarenhof-frechen/');
  r = await anfrage('/suche?q=Biohof');
  assert.equal(ziel(r), '/hofsuche/?q=Biohof');
  r = await anfrage('/suche?q=xyzunbekannt');
  assert.match(ziel(r), /fehler=ort-unbekannt/);
  r = await anfrage('/suche?q=Forst'); // Orte haben Vorrang
  assert.match(ziel(r), /fehler=ort/);
  let d = await (await anfrage('/api/hoefe?q=hofladen%20forst')).json();
  assert.ok(d.treffer.some((e) => e.ort === 'Forst (Lausitz)'));
  assert.ok(d.treffer.every((e) => /hofladen/i.test(e.titel) && /forst/i.test(`${e.titel} ${e.ort}`)));
  d = await (await anfrage('/api/orte?hoefe=1&q=Kittl')).json();
  assert.ok(d.hoefe.some((h) => h.wert === 'Kittlers Hofladen'));
  r = await anfrage('/hofsuche/?q=Biohof');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /noindex/);
});

test('Eintrag aus offener Quelle, der jetzt doppelt ist, leitet auf den bestehenden Eintrag weiter', async () => {
  const ziele = Object.values(routen.umleitungen);
  assert.ok(ziele.includes('/hof/hofladen-gut-clarenhof-frechen/'));
});
