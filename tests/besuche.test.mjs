// Eigene Besucherstatistik ohne Cookies (src/besuche.js): was zählt, was nicht, und die Auswertung für die Verwaltung
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './d1.mjs';
import { ladeWorker, ASSETS } from './hilfen.mjs';
import { BESUCHE_SCHEMA, herkunft, geraet, besuchPruefen, besuchZaehlen, auslieferungArt, besucheAuswerten, besucheAufraeumen, seitenTyp, berlinZeit, botName, botTyp, botAbruf } from '../src/besuche.js';

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

const meldung = (daten, kopf = {}) => [new Request('https://hofladenliste.de/api/besuch', { method: 'POST', body: JSON.stringify(daten),
  headers: { 'user-agent': CHROME, 'sec-fetch-site': 'same-origin', ...kopf } }), daten];
test('auslieferungArt: Seiten an Browser, vorab geladen getrennt, ohne Bots und Unterseiten', () => {
  assert.equal(auslieferungArt(navigation('/bayern/'), '/bayern/'), 'seite');
  assert.equal(auslieferungArt(navigation('/bayern/', { 'sec-purpose': 'prefetch;anonymous-client-ip' }), '/bayern/'), 'vorab');
  assert.equal(auslieferungArt(navigation('/bayern/', { 'sec-purpose': 'prefetch;prerender' }), '/bayern/'), 'vorab');
  assert.equal(auslieferungArt(navigation('/bayern/', { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }), '/bayern/'), 'bot', 'Bot');
  assert.equal(auslieferungArt(navigation('/bayern/', { 'sec-fetch-dest': 'iframe' }), '/bayern/'), null, 'kein Dokument');
  assert.equal(auslieferungArt(navigation('/verwaltung/'), '/verwaltung/'), null, 'Verwaltung');
  assert.equal(auslieferungArt(new Request('https://hofladenliste.de/', { headers: { 'user-agent': CHROME, accept: 'text/html' } }), '/'), 'seite', 'ohne Sec-Fetch');
});

test('besuchPruefen: nur Meldungen der eigenen Seite, ohne Bots, mit gültigem Pfad', () => {
  assert.deepEqual(besuchPruefen(...meldung({ p: '/bayern/', r: 'https://www.google.de/' })), { pfad: '/bayern/', referer: 'https://www.google.de/', ua: CHROME });
  assert.equal(besuchPruefen(...meldung({ p: '/bayern/' }, { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' })), null, 'Bot');
  assert.equal(besuchPruefen(...meldung({ p: '/bayern/' }, { 'user-agent': 'Mozilla/5.0 HeadlessChrome/131.0' })), null, 'Headless');
  assert.equal(besuchPruefen(...meldung({ p: '/bayern/' }, { 'sec-fetch-site': 'cross-site' })), null, 'fremde Seite');
  assert.equal(besuchPruefen(...meldung({ p: 'https://x.de/' })), null, 'kein Pfad');
  assert.equal(besuchPruefen(...meldung({ p: '/<script>/' })), null, 'ungültige Zeichen');
  assert.equal(besuchPruefen(...meldung({ p: '/verwaltung/' })), null, 'Verwaltung');
  assert.equal(besuchPruefen(...meldung({ p: '/betrieb/' })), null, 'Betreiber-Bereich');
  assert.equal(besuchPruefen(...meldung(null)), null, 'leer');
  assert.ok(besuchPruefen(...meldung({ p: '/hof/hofladen-gut-clarenhof-frechen/' }, { 'sec-fetch-site': '' })), 'alter Browser ohne Sec-Fetch');
});

test('besuchZaehlen + besucheAuswerten: Aufrufe, Besuche (von außen), Herkunft, Gerät, Live, Verweise', async () => {
  const db = await neueDb(), env = { STATS: db };
  const jetzt = new Date('2026-11-24T10:30:00Z'); // 11:30 in Berlin
  const zaehle = (pfad, kopf = {}, t = jetzt) => besuchZaehlen(env, { pfad, referer: kopf.referer || '', ua: kopf['user-agent'] || CHROME }, 'hofladenliste.de', t);
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
  await besuchZaehlen(env, { pfad: '/', referer: '', ua: CHROME }, 'hofladenliste.de', new Date('2026-10-01T10:00:00Z'));
  await besuchZaehlen(env, { pfad: '/', referer: '', ua: CHROME }, 'hofladenliste.de', new Date('2026-11-20T10:00:00Z'));
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

test('Worker: /api/besuch zählt Meldungen der Seite, Bots nicht; Auswertung nur mit Zugangsschlüssel; jede Seite meldet sich', async () => {
  const w = await ladeWorker();
  const db = fakeD1(), warte = [];
  const env = { ASSETS, STATS: db, ADMIN_TOKEN: 'test-zugang-1234567890-abc' };
  const ctx = { waitUntil: (p) => warte.push(p) };
  assert.equal((await w.fetch(meldung({ p: '/bayern/', r: 'https://www.google.de/' })[0], env, ctx)).status, 204);
  await w.fetch(meldung({ p: '/bayern/' }, { 'user-agent': 'Googlebot/2.1' })[0], env, ctx);
  const seite = await w.fetch(navigation('/bayern/'), env, ctx);
  assert.match(await seite.text(), /navigator\.sendBeacon\('\/api\/besuch'[\s\S]*prerenderingchange/, 'Beacon im Seitenkopf');
  await Promise.all(warte);
  assert.equal(db._db.prepare('SELECT SUM(anzahl) AS n FROM besuche').get().n, 1, 'nur die eine Meldung zählt, nicht das Ausliefern');
  assert.equal(db._db.prepare("SELECT anzahl FROM besuche_kontrolle WHERE art = 'seite'").get().anzahl, 1, 'Ausliefern zählt nur zur Kontrolle');
  assert.equal((await w.fetch(new Request('https://hofladenliste.de/api/verwaltung/besuche'), env, ctx)).status, 401);
  const a = await w.fetch(new Request('https://hofladenliste.de/api/verwaltung/besuche?tage=7', { headers: { Authorization: 'Bearer test-zugang-1234567890-abc' } }), env, ctx);
  assert.equal(a.status, 200);
  const d = await a.json();
  assert.equal(d.tage, 7);
  assert.equal(d.quellen[0].quelle, 'google');
  assert.equal(d.kontrolle.heute.seite, 1);
});

const GOOGLE_HANDY = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
test('Bot-Abrufe: Bot und Seitentyp erkennen', () => {
  assert.equal(botName(GOOGLE_HANDY), 'googlebot-handy');
  assert.equal(botName('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), 'googlebot-rechner');
  assert.equal(botName('Mediapartners-Google'), 'google-anzeigen');
  assert.equal(botName('Mozilla/5.0 (compatible; GoogleOther)'), 'google-andere');
  assert.equal(botName('Googlebot-Image/1.0'), 'google-bild');
  assert.equal(botName('Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)'), 'google-pruefung');
  assert.equal(botName('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'), 'bing');
  assert.equal(botName('Mozilla/5.0 (compatible; GPTBot/1.2)'), 'ki');
  assert.equal(botName('Mozilla/5.0 (compatible; AhrefsBot/7.0)'), 'seo-werkzeug');
  assert.equal(botName('curl/8.0'), 'andere');
  for (const [p, t] of [['/', 'start'], ['/hof/beispielhof-forst/', 'hof'], ['/bayern/', 'land'], ['/bayern/rosenheim/', 'kreis'], ['/bayern/rosenheim/riedering/', 'ort'],
    ['/angebot/eier/bayern/', 'angebot'], ['/saisonkalender/kartoffeln/', 'saisonkalender'], ['/kacheln/20261101/10/1/2.mvt', 'kacheln'], ['/milchtankstelle/', 'sonst']]) assert.equal(botTyp(p), t, p);
  assert.equal(botAbruf(navigation('/bayern/'), '/bayern/'), null, 'Browser zählt nicht');
  assert.deepEqual(botAbruf(navigation('/bayern/', { 'user-agent': GOOGLE_HANDY }), '/bayern/'), { bot: 'googlebot-handy', typ: 'land' });
});

test('Worker: Bot-Abrufe von Seiten und Kacheln landen in bot_abrufe, Browser nicht', async () => {
  const w = await ladeWorker();
  const db = await neueDb(), warte = []; // Schema direkt anlegen: der Worker legt es je Instanz nur einmal an
  const env = { ASSETS, STATS: db };
  const ctx = { waitUntil: (p) => warte.push(p) };
  await w.fetch(navigation('/bayern/', { 'user-agent': GOOGLE_HANDY }), env, ctx);
  await w.fetch(navigation('/bayern/', { 'user-agent': GOOGLE_HANDY }), env, ctx);
  await w.fetch(navigation('/angebot/eier/', { 'user-agent': 'Mediapartners-Google' }), env, ctx);
  await w.fetch(navigation('/kacheln/20261101/6/33/21.mvt', { 'user-agent': GOOGLE_HANDY }), env, ctx);
  await w.fetch(navigation('/bayern/'), env, ctx);
  await Promise.all(warte);
  const zeilen = db._db.prepare('SELECT bot, typ, anzahl FROM bot_abrufe ORDER BY bot, typ').all().map((z) => `${z.bot} ${z.typ} ${z.anzahl}`);
  assert.deepEqual(zeilen, ['google-anzeigen angebot 1', 'googlebot-handy kacheln 1', 'googlebot-handy land 2']);
});
