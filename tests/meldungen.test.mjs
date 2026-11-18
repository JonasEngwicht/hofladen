// Formular /api/meldung und Verwaltung /api/verwaltung/* mit nachgebautem D1
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ladeWorker, ASSETS } from './hilfen.mjs';
import { fakeD1 } from './d1.mjs';

const TOKEN = 'x'.repeat(32);
const env = { ASSETS, STATS: fakeD1(), ADMIN_TOKEN: TOKEN };
const ctx = { waitUntil() {} };
async function sende(felder, { fotos = [], json = true } = {}) {
  const w = await ladeWorker();
  const fd = new FormData();
  for (const [k, v] of Object.entries({ t: String(Date.now() - 10000), einwilligung: 'ja', ...felder })) for (const x of [].concat(v)) fd.append(k, x);
  for (const f of fotos) fd.append('fotos', f);
  return w.fetch(new Request('https://hofladenliste.de/api/meldung', { method: 'POST', body: fd, headers: json ? { Accept: 'application/json', 'cf-connecting-ip': '1.2.3.4' } : {} }), env, ctx);
}
const verwaltung = async (pfad, init = {}, token = TOKEN) => (await ladeWorker()).fetch(new Request(`https://hofladenliste.de/api/verwaltung/${pfad}`,
  { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }), env, ctx);

test('neuer Eintrag wird gespeichert, Öffnungszeiten im OSM-Format', async () => {
  const r = await sende({ art: 'neu', name: 'Testhof', plz: '03149', ort: 'Forst (Lausitz)', mo_von1: '08:00', mo_bis1: '12:00', fr_von1: '09:00', fr_bis1: '18:00', angebot: ['eier', 'quatsch'] });
  assert.equal(r.status, 200);
  const d = await (await verwaltung('meldungen')).json();
  const m = d.meldungen.find((x) => x.daten.name === 'Testhof');
  assert.equal(m.daten.oeffnungszeiten, 'Mo 08:00-12:00; Fr 09:00-18:00');
  assert.deepEqual(m.daten.angebot, ['eier']);
});

test('ohne JavaScript leitet das Formular auf die Danke-Seite', async () => {
  const r = await sende({ art: 'neu', name: 'Hof ohne JS', plz: '03149' }, { json: false });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/mitmachen/danke/');
});

test('Pflichtangaben und Prüfungen', async () => {
  assert.equal((await sende({ art: 'neu', name: 'X' })).status, 400, 'PLZ fehlt');
  assert.equal((await sende({ art: 'korrektur', hof: 'gibt-es-nicht' })).status, 400, 'unbekannter Hof');
  assert.equal((await sende({ art: 'uebernahme', hof: 'kittlers-hofladen-riesa', telefon: '1' })).status, 400, 'E-Mail fehlt');
  assert.equal((await sende({ art: 'neu', name: 'X', plz: '03149', einwilligung: '' })).status, 400, 'Einwilligung fehlt');
  const foto = new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' });
  assert.equal((await sende({ art: 'neu', name: 'X', plz: '03149' }, { fotos: [foto] })).status, 400, 'Fotorechte fehlen');
});

test('Spam-Falle: verstecktes Feld wird still verworfen', async () => {
  const vorher = (await (await verwaltung('meldungen')).json()).meldungen.length;
  assert.equal((await sende({ art: 'neu', name: 'Spam', plz: '03149', firma: 'spam' })).status, 200);
  assert.equal((await (await verwaltung('meldungen')).json()).meldungen.length, vorher);
});

test('Übernahme mit Foto, Freigabe und Export', async () => {
  const foto = new File([new Uint8Array([255, 216, 255, 0])], 'hof.jpg', { type: 'image/jpeg' });
  const r = await sende({ art: 'uebernahme', hof: 'kittlers-hofladen-riesa', kontakt_email: 'jonas@example.org', saison: 'Spargel ab April', fotorechte: 'ja' }, { fotos: [foto] });
  assert.equal(r.status, 200);
  const { id } = await r.json();
  const liste = (await (await verwaltung('meldungen')).json()).meldungen;
  const m = liste.find((x) => x.id === id);
  assert.equal(m.fotos.length, 1);
  assert.equal((await verwaltung(`foto/${m.fotos[0]}`)).status, 200);
  assert.equal((await verwaltung(`meldung/${id}`, { method: 'POST', body: JSON.stringify({ status: 'freigegeben', notiz: 'ok', daten: m.daten }) })).status, 200);
  const f = (await (await verwaltung('freigaben')).json()).freigaben;
  assert.ok(f.some((x) => x.id === id && x.hof === 'kittlers-hofladen-riesa' && x.fotos.length === 1));
});

test('Verwaltung nur mit richtigem Schlüssel', async () => {
  assert.equal((await verwaltung('meldungen', {}, 'falsch')).status, 401);
  const ohne = { ...env, ADMIN_TOKEN: undefined };
  const r = await (await ladeWorker()).fetch(new Request('https://hofladenliste.de/api/verwaltung/meldungen'), ohne, ctx);
  assert.equal(r.status, 503);
});

test('höchstens 10 Meldungen pro Tag und Absender', async () => {
  let letzte;
  for (let i = 0; i < 12; i++) letzte = await sende({ art: 'neu', name: `Hof ${i}`, plz: '03149' });
  assert.equal(letzte.status, 429);
});
