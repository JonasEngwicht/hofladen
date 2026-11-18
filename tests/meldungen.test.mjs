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

test('Nutzungsstatistik zählt Klicks anonym und ist nur in der Verwaltung lesbar', async () => {
  const w = await ladeWorker();
  const klick = (b, ua = 'Mozilla/5.0') => w.fetch(new Request('https://hofladenliste.de/api/ereignis', { method: 'POST', body: JSON.stringify(b), headers: { 'user-agent': ua } }), env, { waitUntil: (p) => p });
  assert.equal((await klick({ e: 'route', s: 'hof' })).status, 204);
  await klick({ e: 'route', s: 'hof' });
  await klick({ e: 'filter', s: 'kreis', d: 'bio' });
  assert.equal((await klick({ e: 'hack', s: 'hof' })).status, 400);
  await klick({ e: 'route', s: 'hof' }, 'Googlebot/2.1');
  await new Promise((r) => setTimeout(r, 50));
  const d = await (await verwaltung('statistik?tage=7')).json();
  const route = d.ereignisse.find((x) => x.ereignis === 'route' && x.seite === 'hof');
  assert.equal(route.anzahl, 2, 'Bots werden nicht gezählt');
  assert.ok(d.ereignisse.some((x) => x.ereignis === 'filter' && x.detail === 'bio'));
  assert.equal((await verwaltung('statistik', {}, 'falsch')).status, 401);
});

test('Ein-Klick-Rückmeldung: zählt einmal pro Tag und Anschluss, Schließung über die Verwaltung', async () => {
  const w = await ladeWorker();
  const rm = (body, ip = '5.6.7.8') => w.fetch(new Request('https://hofladenliste.de/api/rueckmeldung', { method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, 'user-agent': 'Mozilla/5.0' } }), env, ctx);
  assert.equal((await rm({ eintrag: 'w136216919', art: 'stimmt' })).status, 200);
  assert.equal((await (await rm({ eintrag: 'w136216919', art: 'stimmt' })).json()).doppelt, true); // gleicher Anschluss, gleicher Tag
  assert.equal((await rm({ eintrag: 'w136216919', art: 'stimmt' }, '9.9.9.9')).status, 200);
  assert.equal((await rm({ eintrag: 'kittlers-hofladen-riesa', art: 'geschlossen' })).status, 200); // Slug wird zur stabilen ID
  assert.equal((await rm({ eintrag: 'kittlers-hofladen-riesa', art: 'geschlossen' }, '9.9.9.9')).status, 200);
  assert.equal((await rm({ eintrag: 'gibt-es-nicht', art: 'stimmt' })).status, 404);
  assert.equal((await rm({ eintrag: 'w136216919', art: 'quatsch' })).status, 400);
  assert.equal((await w.fetch(new Request('https://hofladenliste.de/api/rueckmeldung'), env, ctx)).status, 405);
  // Verwaltung: gemeldete Schließung sichtbar, Stand enthält Bestätigungen
  const liste = await (await verwaltung('rueckmeldungen')).json();
  const kittler = liste.rueckmeldungen.find((x) => x.pfad === '/hof/kittlers-hofladen-riesa/');
  assert.equal(kittler.anzahl, 2);
  let stand = await (await verwaltung('rueckmeldungen/stand')).json();
  assert.equal(stand.bestaetigt.w136216919.anzahl, 2);
  assert.equal(stand.gemeldet[kittler.eintrag].anzahl, 2);
  assert.deepEqual(stand.geschlossen, {});
  assert.equal((await verwaltung(`rueckmeldung/${kittler.eintrag}`, { method: 'POST', body: JSON.stringify({ aktion: 'geschlossen' }) })).status, 200);
  stand = await (await verwaltung('rueckmeldungen/stand')).json();
  assert.ok(stand.geschlossen[kittler.eintrag]);
  assert.equal(stand.gemeldet[kittler.eintrag], undefined);
  assert.equal((await verwaltung('rueckmeldungen/stand', {}, 'falsch'.repeat(6))).status, 401);
});
