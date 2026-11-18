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
  r = await anfrage('/plz/03149');
  assert.equal(r.status, 302);
  r = await anfrage('/api/umkreis?plz=03149&limit=3');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ergebnisse.length, 3);
  r = await anfrage('/api/orte?q=Cottb');
  assert.ok((await r.json()).treffer.some((t) => t.name === 'Cottbus'));
});

test('Statische Dateien und Sitemaps', async () => {
  for (const p of ['/robots.txt', '/sitemap.xml', '/sitemaps/hoefe.xml', '/style.css', '/app.js']) assert.equal((await anfrage(p)).status, 200, p);
  assert.equal((await anfrage('/fehlt.css')).status, 404);
});
