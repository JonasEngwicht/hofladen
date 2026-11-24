// Eigene Besucherstatistik ohne Cookies (src/besuche.js): was zählt, was nicht, und die Auswertung für die Verwaltung
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './d1.mjs';
import { ladeWorker, ASSETS } from './hilfen.mjs';
import { BESUCHE_SCHEMA, herkunft, geraet, zaehlbar, besuchZaehlen, besucheAuswerten, besucheAufraeumen, seitenTyp, berlinZeit } from '../src/besuche.js';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const navigation = (pfad, kopf = {}) => new Request(`https://hofladenliste.de${pfad}`, {
  headers: { 'user-agent': CHROME, 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', ...kopf },
});
const html = new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const neueDb = async () => { const db = fakeD1(); for (const q of BESUCHE_SCHEMA) await db.prepare(q).run(); return db; };

test('herkunft: Suchmaschinen, soziale Netze, Verweise, direkt und intern', () => {
  const h = (r) => herkunft(r, 'hofladenliste.de');
  assert.deepEqual(h('https://www.google.de/'), { quelle: 'google', host: 'google.de' });
  assert.equal(h('https://www.google.com/').quelle, 'google');
  assert.equal(h('https://www.bing.com/search?q=hofladen').quelle, 'bing');
  assert.equal(h('https://www.ecosia.org/').quelle, 'ecosia');
  assert.equal(h('https://duckduckgo.com/').quelle, 'duckduckgo');
  assert.equal(h('https://suche.t-online.de/').quelle, 'andere-suche');
  assert.equal(h('https://l.facebook.com/').quelle, 'sozial');
  assert.deepEqual(h('https://www.landfrauen-beispiel.de/links/'), { quelle: 'verweis', host: 'landfrauen-beispiel.de' });
  assert.equal(h('https://hofladenliste.de/bayern/').quelle, 'intern');
  assert.equal(h('').quelle, 'direkt');
  assert.equal(h('kaputt').quelle, 'direkt');
});

test('geraet: Handy, Tablet, Rechner', () => {
  assert.equal(geraet(IPHONE), 'handy');
  assert.equal(geraet('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'), 'handy');
  assert.equal(geraet('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(geraet('Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'), 'tablet');
  assert.equal(geraet(CHROME), 'rechner');
});

test('zaehlbar: nur echte Seitenaufrufe aus dem Browser', () => {
  const u = (p) => new URL(`https://hofladenliste.de${p}`);
  assert.ok(zaehlbar(navigation('/bayern/'), u('/bayern/'), html));
  assert.ok(!zaehlbar(navigation('/bayern/', { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }), u('/bayern/'), html), 'Bot');
  assert.ok(!zaehlbar(navigation('/bayern/', { 'user-agent': 'Mozilla/5.0 HeadlessChrome/131.0' }), u('/bayern/'), html), 'Headless');
  assert.ok(!zaehlbar(navigation('/bayern/', { 'sec-purpose': 'prefetch;prerender' }), u('/bayern/'), html), 'Vorladen');
  assert.ok(!zaehlbar(new Request('https://hofladenliste.de/bayern/', { headers: { 'user-agent': CHROME } }), u('/bayern/'), html), 'ohne Sec-Fetch (Skripte, alte Clients)');
  assert.ok(!zaehlbar(navigation('/bayern/'), u('/bayern/'), new Response('', { status: 301, headers: { Location: '/' } })), 'Weiterleitung');
  assert.ok(!zaehlbar(navigation('/x/'), u('/x/'), new Response('', { status: 404, headers: { 'Content-Type': 'text/html' } })), '404');
  assert.ok(!zaehlbar(navigation('/verwaltung/'), u('/verwaltung/'), html), 'Verwaltung');
  assert.ok(!zaehlbar(navigation('/betrieb/'), u('/betrieb/'), html), 'Betreiber-Bereich');
});

test('besuchZaehlen + besucheAuswerten: Aufrufe, Besuche (von außen), Herkunft, Gerät, Live, Verweise', async () => {
  const db = await neueDb(), env = { STATS: db };
  const jetzt = new Date('2026-11-24T10:30:00Z'); // 11:30 in Berlin
  const zaehle = (pfad, kopf, t = jetzt) => besuchZaehlen(env, navigation(pfad, kopf), new URL(`https://hofladenliste.de${pfad}`), t);
  await zaehle('/', { referer: 'https://www.google.de/' });
  await zaehle('/bayern/', { referer: 'https://hofladenliste.de/' });
  await zaehle('/hof/hofladen-gut-clarenhof-frechen/', { referer: 'https://www.bing.com/', 'user-agent': IPHONE });
  await zaehle('/milchtankstelle/', { referer: 'https://www.landfrauen-beispiel.de/' });
  await zaehle('/', {}, new Date('2026-11-23T10:00:00Z')); // gestern, direkt
  const a = JSON.parse(JSON.stringify(await besucheAuswerten(env, 30, jetzt)));
  assert.equal(a.heute.tag, '2026-11-24');
  assert.deepEqual([a.heute.aufrufe, a.heute.besuche], [4, 3]);
  assert.deepEqual([a.gestern.aufrufe, a.gestern.besuche], [1, 1]);
  assert.equal(a.live.aufrufe5, 4);
  assert.deepEqual(a.tageListe, [{ tag: '2026-11-23', aufrufe: 1, besuche: 1 }, { tag: '2026-11-24', aufrufe: 4, besuche: 3 }]);
  assert.deepEqual(Object.fromEntries(a.quellen.map((q) => [q.quelle, q.anzahl])), { google: 1, bing: 1, verweis: 1, direkt: 1 });
  assert.deepEqual(Object.fromEntries(a.geraete.map((q) => [q.geraet, q.anzahl])), { rechner: 3, handy: 1 });
  assert.deepEqual(a.verweise, [{ host: 'landfrauen-beispiel.de', anzahl: 1 }]);
  assert.equal(a.stunden.find((s) => s.stunde === '2026-11-24 11').aufrufe, 4, 'Stunde in Berliner Zeit');
  assert.equal(a.einstiege[0].pfad, '/');
  assert.equal(a.typen.find((t) => t.typ === 'Hofseiten').anzahl, 1);
  // keine personenbezogenen Spalten
  for (const t of ['besuche', 'besuche_minute', 'besuche_verweise']) {
    const spalten = db._db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name).join(',');
    assert.doesNotMatch(spalten, /ip|agent|ua|kennung|id\b/i, t);
  }
});

test('besucheAufraeumen: Minutenzähler älter als 35 Tage fallen weg', async () => {
  const db = await neueDb(), env = { STATS: db };
  await besuchZaehlen(env, navigation('/'), new URL('https://hofladenliste.de/'), new Date('2026-10-01T10:00:00Z'));
  await besuchZaehlen(env, navigation('/'), new URL('https://hofladenliste.de/'), new Date('2026-11-20T10:00:00Z'));
  await besucheAufraeumen(env, new Date('2026-11-24T10:00:00Z'));
  assert.equal(db._db.prepare('SELECT COUNT(*) AS n FROM besuche_minute').get().n, 1);
  assert.equal(db._db.prepare('SELECT COUNT(*) AS n FROM besuche').get().n, 2, 'Tageszähler bleiben');
});

test('seitenTyp und Berliner Zeit (Sommer-/Winterzeit)', () => {
  assert.equal(seitenTyp('/'), 'Startseite');
  assert.equal(seitenTyp('/hof/x-y/'), 'Hofseiten');
  assert.equal(seitenTyp('/bayern/'), 'Bundesländer');
  assert.equal(seitenTyp('/bayern/landkreis-rosenheim/'), 'Kreise');
  assert.equal(seitenTyp('/bayern/landkreis-rosenheim/prien/'), 'Orte und Kategorien');
  assert.equal(seitenTyp('/milchtankstelle/'), 'Themen und Sonstiges');
  assert.equal(berlinZeit(new Date('2026-07-01T22:30:00Z')).tag, '2026-07-02');
  assert.equal(berlinZeit(new Date('2026-12-31T23:30:00Z')).minute, '2027-01-01 00:30');
});

test('Worker: Seitenaufruf aus dem Browser wird gezählt, Bot und Verwaltungs-API nicht; Auswertung nur mit Zugangsschlüssel', async () => {
  const w = await ladeWorker();
  const db = fakeD1(), warte = [];
  const env = { ASSETS, STATS: db, ADMIN_TOKEN: 'test-zugang-1234567890-abc' };
  const ctx = { waitUntil: (p) => warte.push(p) };
  const r = await w.fetch(navigation('/bayern/', { referer: 'https://www.google.de/' }), env, ctx);
  assert.equal(r.status, 200);
  await w.fetch(navigation('/bayern/', { 'user-agent': 'Googlebot/2.1' }), env, ctx);
  await Promise.all(warte);
  assert.equal(db._db.prepare('SELECT SUM(anzahl) AS n FROM besuche').get().n, 1);
  assert.equal((await w.fetch(new Request('https://hofladenliste.de/api/verwaltung/besuche'), env, ctx)).status, 401);
  const a = await w.fetch(new Request('https://hofladenliste.de/api/verwaltung/besuche?tage=7', { headers: { Authorization: 'Bearer test-zugang-1234567890-abc' } }), env, ctx);
  assert.equal(a.status, 200);
  const d = await a.json();
  assert.equal(d.tage, 7);
  assert.equal(d.quellen[0].quelle, 'google');
});
