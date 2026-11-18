// Betreiber-Bereich: Bestätigung per Link, Anmeldung, eigene Änderungen ohne Prüfung, Hof-News, Termine, Statistik
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ladeWorker, ASSETS } from './hilfen.mjs';
import { fakeD1 } from './d1.mjs';
import { emailPasstZuWebsite, hostVon } from '../src/betrieb.js';

const TOKEN = 'b'.repeat(32);
const env = { ASSETS, STATS: fakeD1(), ADMIN_TOKEN: TOKEN, RESEND_API_KEY: 're_test', TURNSTILE_SECRET_KEY: 'ts_test', TURNSTILE_SITE_KEY: 'site' };
const warten = [];
const ctx = { waitUntil(p) { warten.push(p); } };
const EINTRAEGE = JSON.parse(readFileSync(new URL('../src/generated/eintraege.json', import.meta.url)));
// Ein Hof mit eigener Website (Domain für die Bestätigung) und einer ohne Konto
const HOF = EINTRAEGE.find((e) => e[10] && /^https:\/\/(www\.)?[a-z-]+\.de\/?$/.test(e[10]));
const ANDERER = EINTRAEGE.find((e) => e !== HOF && e[7]);
const DOMAIN = hostVon(HOF[10]);

// Resend-Aufrufe abfangen
const mails = [];
const echtesFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  if (String(u).startsWith('https://api.resend.com/')) { mails.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'm1' })); }
  if (String(u).startsWith('https://challenges.cloudflare.com/')) return new Response(JSON.stringify({ success: init.body.get('response') === 'gut' && init.body.get('secret') === 'ts_test' }));
  return echtesFetch(u, init);
};
const linkAus = (m) => m.text.match(/\/betrieb\/\?anmelden=([A-Za-z0-9_%-]+)/)[1];

let cookie = '';
async function api(pfad, { methode = 'GET', body, form, kopf = {} } = {}) {
  const w = await ladeWorker();
  const init = { method: methode, headers: { Accept: 'application/json', 'cf-connecting-ip': '9.9.9.9', ...(cookie ? { cookie } : {}), ...kopf } };
  if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  if (form) { const fd = new FormData(); for (const [k, v] of Object.entries({ t: String(Date.now() - 10000), einwilligung: 'ja', ...form })) for (const x of [].concat(v)) fd.append(k, x); init.body = fd; }
  const r = await w.fetch(new Request(`https://hofladenliste.de${pfad}`, init), env, ctx);
  await Promise.all(warten.splice(0));
  return r;
}
const verwaltung = (pfad, init = {}) => api(`/api/verwaltung/${pfad}`, { ...init, kopf: { Authorization: `Bearer ${TOKEN}` } });

test('E-Mail passt zur Website: gleiche Domain oder Subdomain, keine Freemailer', () => {
  assert.ok(emailPasstZuWebsite('info@hof-meier.de', 'https://www.hof-meier.de/'));
  assert.ok(emailPasstZuWebsite('laden@mail.hof-meier.de', 'hof-meier.de'));
  assert.ok(!emailPasstZuWebsite('hof.meier@gmail.com', 'https://gmail.com'));
  assert.ok(!emailPasstZuWebsite('info@anderer.de', 'https://www.hof-meier.de/'));
});

test('Übernahme mit passender Adresse: Bestätigungslink, danach angemeldet und freigegeben', async () => {
  const r = await api('/api/meldung', { methode: 'POST', form: { art: 'uebernahme', hof: HOF[2], kontakt_email: `info@${DOMAIN}`, telefon: '0355 123456' } });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.bestaetigung, true);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to[0], `info@${DOMAIN}`);
  assert.equal(mails[0].reply_to, 'hofladenliste@gmail.com');
  const e = await api('/api/betrieb/einloesen', { methode: 'POST', body: { token: decodeURIComponent(linkAus(mails[0])) } });
  assert.equal(e.status, 200);
  cookie = e.headers.get('set-cookie').split(';')[0];
  assert.match(e.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  // Link ist nur einmal gültig
  assert.equal((await api('/api/betrieb/einloesen', { methode: 'POST', body: { token: decodeURIComponent(linkAus(mails[0])) } })).status, 400);
  const ich = await (await api('/api/betrieb/ich')).json();
  assert.equal(ich.hoefe[0].sid, HOF[15]);
  const frei = (await (await verwaltung('freigaben')).json()).freigaben;
  assert.ok(frei.some((m) => m.id === d.id));
});

test('Angemeldet: eigene Änderung geht ohne Prüfung durch, fremde Höfe nicht', async () => {
  const r = await api('/api/meldung', { methode: 'POST', form: { art: 'korrektur', eintrag: HOF[15], mo_von1: '09:00', mo_bis1: '18:00', urlaub_von: '2026-12-24', urlaub_bis: '2027-01-06', urlaub_text: 'Weihnachtspause' } });
  const d = await r.json();
  assert.equal(d.sofort, true);
  const frei = (await (await verwaltung('freigaben')).json()).freigaben.find((m) => m.id === d.id);
  assert.equal(frei.art, 'uebernahme');
  assert.deepEqual(frei.daten.urlaub, [{ von: '2026-12-24', bis: '2027-01-06', text: 'Weihnachtspause' }]);
  const r2 = await (await api('/api/meldung', { methode: 'POST', form: { art: 'korrektur', eintrag: ANDERER[15], telefon: '0355 1' } })).json();
  assert.equal(r2.sofort, false);
  assert.equal((await api('/api/betrieb/neuigkeit', { methode: 'POST', body: { sid: ANDERER[15], art: 'da', produkt: 'Spargel' } })).status, 403);
});

test('Hof-News: „Spargel ist da!“ erscheint in der öffentlichen Liste, löschen entfernt sie', async () => {
  assert.equal((await api('/api/betrieb/neuigkeit', { methode: 'POST', body: { sid: HOF[15], art: 'da' } })).status, 400, 'Produkt fehlt');
  assert.equal((await api('/api/betrieb/neuigkeit', { methode: 'POST', body: { sid: HOF[15], art: 'da', produkt: 'Spargel', tage: 10 } })).status, 200);
  const n = (await (await api(`/api/neuigkeiten?sids=${HOF[15]}`)).json()).neuigkeiten;
  assert.equal(n[0].text, 'Spargel ist da!');
  assert.equal(n[0].pfad, `/hof/${HOF[2]}/`);
  assert.equal((await (await api('/api/neuigkeiten')).json()).neuigkeiten.length, 1);
  assert.equal((await api(`/api/betrieb/neuigkeit/${n[0].id}/loeschen`, { methode: 'POST', body: {} })).status, 200);
  assert.equal((await (await api(`/api/neuigkeiten?sids=${HOF[15]}`)).json()).neuigkeiten.length, 0);
});

test('Veranstaltung: Prüfung der Angaben und Export für den Build', async () => {
  assert.equal((await api('/api/betrieb/veranstaltung', { methode: 'POST', body: { sid: HOF[15], titel: 'Hoffest', beginn: '2020-01-01T10:00' } })).status, 400, 'Vergangenheit');
  const jahr = new Date().getFullYear() + 1;
  assert.equal((await api('/api/betrieb/veranstaltung', { methode: 'POST', body: { sid: HOF[15], titel: 'Hoffest', beginn: `${jahr}-06-14T10:00`, ende: `${jahr}-06-14T18:00`, beschreibung: 'Mit Hofführung' } })).status, 200);
  const ex = await (await verwaltung('build-export')).json();
  assert.equal(ex.veranstaltungen[0].titel, 'Hoffest');
  assert.deepEqual(ex.hoefeMitKonto, [HOF[15]]);
});

test('Statistik je Hof aus Aufrufen und Klicks, nur für eigene Höfe', async () => {
  for (const e of ['aufruf', 'aufruf', 'route']) assert.equal((await api('/api/ereignis', { methode: 'POST', body: { e, s: 'hof', h: HOF[2] } })).status, 204);
  const s = await (await api(`/api/betrieb/statistik?sid=${HOF[15]}`)).json();
  assert.equal(s.summen.aufruf, 2);
  assert.equal(s.summen.route, 1);
  assert.equal((await api(`/api/betrieb/statistik?sid=${ANDERER[15]}`)).status, 403);
});

test('Anmelden: gleiche Antwort mit und ohne Konto, Mail nur an bestehende Konten', async () => {
  const vorher = mails.length;
  assert.equal((await api('/api/betrieb/anmelden', { methode: 'POST', body: { email: 'unbekannt@example.org' } })).status, 200);
  assert.equal(mails.length, vorher);
  assert.equal((await api('/api/betrieb/anmelden', { methode: 'POST', body: { email: `INFO@${DOMAIN}` } })).status, 200);
  assert.equal(mails.length, vorher + 1);
  assert.match(mails.at(-1).subject, /Anmeldelink/);
});

test('Freigabe einer Übernahme in der Verwaltung legt ein Konto an und schickt den Zugang', async () => {
  cookie = '';
  const d = await (await api('/api/meldung', { methode: 'POST', form: { art: 'uebernahme', hof: ANDERER[2], kontakt_email: 'bauer@example.org', telefon: '0355 2' } })).json();
  assert.equal(d.bestaetigung, false);
  const vorher = mails.length;
  assert.equal((await verwaltung(`meldung/${d.id}`, { methode: 'POST', body: { status: 'freigegeben' } })).status, 200);
  assert.equal(mails.length, vorher + 1);
  assert.match(mails.at(-1).subject, /Dein Zugang/);
  const konten = (await (await verwaltung('konten')).json()).konten;
  assert.ok(konten.some((k) => k.email === 'bauer@example.org' && k.hoefe === ANDERER[15]));
  const ein = await (await verwaltung('einrichtung')).json();
  assert.equal(ein.secrets.RESEND_API_KEY, true);
  assert.equal(ein.secrets.TURNSTILE_SECRET, false);
  assert.ok(!JSON.stringify(ein).includes('re_test'));
});

test('Nachricht an den Hof: nur mit Turnstile, Antwort geht an den Absender, Adresse des Hofs bleibt verborgen', async () => {
  cookie = '';
  const text = 'Habt ihr am Samstag noch Spargel?';
  assert.equal((await api('/api/nachricht', { methode: 'POST', body: { eintrag: HOF[15], email: 'kundin@example.org', text, turnstile: 'schlecht' } })).status, 400);
  const vorher = mails.length;
  const r = await api('/api/nachricht', { methode: 'POST', body: { eintrag: HOF[15], name: 'Kundin', email: 'kundin@example.org', text, turnstile: 'gut' } });
  assert.equal(r.status, 200);
  assert.equal(mails.length, vorher + 1);
  assert.equal(mails.at(-1).to[0], `info@${DOMAIN}`);
  assert.equal(mails.at(-1).reply_to, 'kundin@example.org');
  assert.ok(!JSON.stringify(await r.json()).includes(DOMAIN));
  assert.equal((await api('/api/nachricht', { methode: 'POST', body: { eintrag: EINTRAEGE.find((e) => e !== HOF && e !== ANDERER)[15], email: 'kundin@example.org', text, turnstile: 'gut' } })).status, 400, 'Hof ohne Konto');
  assert.equal((await (await api('/api/turnstile')).json()).siteKey, 'site');
});

test('Erinnerung nach 6 Monaten: aus ohne Schalter, sonst eine Mail, Bestätigung per Klick', async () => {
  const { erinnerungenSenden } = await import('../src/betrieb.js');
  const h = { schema: async () => {}, sha256: async (t) => t, eintragIndex: () => ({ nachSid: new Map(EINTRAEGE.map((e) => [e[15], e])), nachSlug: new Map(), alteSlugs: {} }),
    aufloesen: (x, i) => i.nachSid.get(x) || null, DOMAIN: 'https://hofladenliste.de' };
  const spaeter = new Date(Date.now() + 200 * 864e5);
  assert.equal((await erinnerungenSenden(env, h, { jetzt: spaeter })).aus, true);
  const vorher = mails.length;
  const r = await erinnerungenSenden({ ...env, ERINNERUNGEN_AKTIV: 'ja' }, h, { jetzt: spaeter });
  assert.ok(r.gesendet >= 1);
  assert.match(mails[vorher].subject, /Stimmt noch alles/);
  assert.equal((await erinnerungenSenden({ ...env, ERINNERUNGEN_AKTIV: 'ja' }, h, { jetzt: spaeter })).gesendet, 0, 'nicht doppelt');
});

test('Ohne Anmeldung kein Zugriff auf den Betreiber-Bereich', async () => {
  cookie = '';
  assert.equal((await api('/api/betrieb/ich')).status, 401);
  cookie = 'hl_sitzung=falsch-falsch-falsch-falsch-falsch';
  assert.equal((await api('/api/betrieb/ich')).status, 401);
  cookie = '';
});
