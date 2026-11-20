// SEO-Check: Pixelbreite von Titel und Beschreibung, https, Zeichensatz, Links ohne Parameter, keine doppelten Linktexte
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seiten, ladeWorker, ASSETS } from './hilfen.mjs';
import { titelBreite, beschreibungBreite, kuerzeBeschreibung, titelMitMarke, TITEL_MAX, BESCHREIBUNG_MAX } from '../scripts/pixel.mjs';

const dec = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const alle = [...seiten()].filter(([p]) => p !== '/404.html');
const indexiert = alle.filter(([, h]) => !/<meta name="robots" content="noindex/.test(h));

test('Pixelbreite stimmt mit dem SEO-Checker überein (±2 %)', () => {
  // Werte aus dem SEO-Check vom 20.11.2026
  const nah = (ist, soll) => assert.ok(Math.abs(ist - soll) / soll < 0.025, `${ist} statt ${soll}`);
  nah(titelBreite('Hofladen in der Nähe finden – Hofläden, Milchtankstellen & Eierautomaten | Hofladenliste'), 798);
  nah(titelBreite('Hofladen finden | Frische regionale Lebensmittel in deiner Nähe'), 567);
  nah(beschreibungBreite('Finde Hofläden, Biohöfe & Selbstbedienungsläden in deiner Nähe. Mit interaktiver Standortsuchen-Karte, Öffnungszeiten & frischen Produkten aus der Region.'), 976);
});

test('kuerzeBeschreibung: passt in 1000 px, zerschneidet keine Wörter, lässt Kurzes unverändert', () => {
  const kurz = 'Hofläden in Forst: 5 Einträge. Mit Öffnungszeiten und Route.';
  assert.equal(kuerzeBeschreibung(kurz), kurz);
  const lang = 'Hofläden in Wallersdorf und Umgebung: 70 Einträge im Umkreis von 25 km, davon 41 Hofläden und 29 Automaten. Direkt in Wallersdorf: 2 Hofläden und 1 Regiomat. Mit Entfernung, Öffnungszeiten und Route.';
  const k = kuerzeBeschreibung(lang);
  assert.ok(beschreibungBreite(k) <= BESCHREIBUNG_MAX, k);
  assert.match(k, /^Hofläden in Wallersdorf und Umgebung: 70 Einträge/);
  assert.match(k, /Mit Entfernung, Öffnungszeiten und Route\.$/, 'Schlusssatz bleibt, mittlerer Satz fällt weg');
  const ohneSatz = kuerzeBeschreibung('Wort '.repeat(80).trim());
  assert.ok(beschreibungBreite(ohneSatz) <= BESCHREIBUNG_MAX);
  assert.match(ohneSatz, /Wort …$/);
  assert.match(kuerzeBeschreibung(`A: Hofladen in Ort. Angebot: Eier, Milch. Telefon: +49 123. ${'Adresse, Kontakt, Karte und Route '.repeat(3)}– plus Hofläden in der Nähe von Ort.`), /^A: Hofladen in Ort\. Angebot: Eier, Milch\./);
});

test('titelMitMarke: Marke nur, solange der Titel in 580 px passt', () => {
  assert.equal(titelMitMarke('Hofläden in Forst'), 'Hofläden in Forst | Hofladenliste');
  assert.equal(titelMitMarke('Hofläden in Forst | Hofladenliste'), 'Hofläden in Forst | Hofladenliste');
  const lang = 'Hofladen-Automaten im Landkreis Pfaffenhofen an der Ilm – 9 Stück';
  assert.equal(titelMitMarke(lang), lang);
});

test('indexierbare Seiten: Titel höchstens 580 px, Beschreibung höchstens 1000 px', () => {
  const fehler = [];
  for (const [p, h] of indexiert) {
    const t = dec(h.match(/<title>([^<]*)<\/title>/)?.[1] || '');
    const b = dec(h.match(/<meta name="description" content="([^"]*)">/)?.[1] || '');
    if (titelBreite(t) > TITEL_MAX) fehler.push(`${p}: Titel ${titelBreite(t)} px „${t}“`);
    if (beschreibungBreite(b) > BESCHREIBUNG_MAX) fehler.push(`${p}: Beschreibung ${beschreibungBreite(b)} px`);
    if (/…$/.test(b) && !/ …$/.test(b)) fehler.push(`${p}: Beschreibung mitten im Wort abgeschnitten`);
  }
  assert.deepEqual(fehler.slice(0, 15), [], `${fehler.length} Seiten zu lang`);
});

test('Startseite: kurzer Titel mit „Hofladen in der Nähe“, Beschreibung ohne Kürzung', () => {
  const h = alle.find(([p]) => p === '/')[1];
  const t = dec(h.match(/<title>([^<]*)<\/title>/)[1]);
  assert.match(t, /^Hofladen in der Nähe finden.* \| Hofladenliste$/);
  assert.ok(titelBreite(t) <= TITEL_MAX);
  const b = dec(h.match(/<meta name="description" content="([^"]*)">/)[1]);
  assert.doesNotMatch(b, /…$/);
  assert.ok(beschreibungBreite(b) <= BESCHREIBUNG_MAX);
});

test('interne Links ohne Parameter – Funktionslinks mit Parametern sind nofollow (außer Bearbeiten-Links, Ziel ist noindex)', () => {
  const fehler = [];
  for (const [p, h] of alle) {
    for (const m of h.matchAll(/<a ([^>]*)>/g)) {
      const href = m[1].match(/href="([^"]*)"/)?.[1] || '';
      if (/^\/[^#]*\?/.test(href) && !href.startsWith('/mitmachen/') && !/\brel="[^"]*nofollow/.test(m[1])) fehler.push(`${p}: ${href}`);
    }
    if (fehler.length > 10) break;
  }
  assert.deepEqual(fehler, []);
});

test('Startseite: keine doppelten Linktexte, Filterlinks der Übersichten nutzen #produkt=', () => {
  const h = alle.find(([p]) => p === '/')[1];
  const texte = [...h.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/[\d.]+$/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const doppelt = [...new Set(texte.filter((t, i) => texte.indexOf(t) !== i))];
  assert.deepEqual(doppelt, []);
  const eier = alle.find(([p]) => p === '/angebot/eier/')[1];
  assert.match(eier, /href="\/[a-z-]+\/[a-z0-9-]+\/#produkt=eier"/);
  assert.doesNotMatch(eier, /\?produkt=/);
});

test('Worker: http leitet per 301 auf https um, www und http in einem Schritt', async () => {
  const w = await ladeWorker();
  const env = { ASSETS };
  const ctx = { waitUntil() {} };
  for (const [von, nach] of [
    ['http://hofladenliste.de/', 'https://hofladenliste.de/'],
    ['http://hofladenliste.de/bayern/?plz=83022', 'https://hofladenliste.de/bayern/?plz=83022'],
    ['http://www.hofladenliste.de/bayern/', 'https://hofladenliste.de/bayern/'],
  ]) {
    const r = await w.fetch(new Request(von, { redirect: 'manual' }), env, ctx);
    assert.equal(r.status, 301, von);
    assert.equal(r.headers.get('location'), nach, von);
  }
});

test('Worker: HTML-Seiten mit Zeichensatz im Header und HSTS', async () => {
  const w = await ladeWorker();
  // Cloudflare liefert HTML ohne charset aus – so nachgebaut
  const ohneCharset = { async fetch(req) { const r = await ASSETS.fetch(req); const k = new Response(r.body, r); if (/html/.test(k.headers.get('Content-Type'))) k.headers.set('Content-Type', 'text/html'); return k; } };
  for (const p of ['/', '/bayern/']) {
    const r = await w.fetch(new Request(`https://hofladenliste.de${p}`, { redirect: 'manual' }), { ASSETS: ohneCharset }, { waitUntil() {} });
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8', p);
    assert.match(r.headers.get('strict-transport-security') || '', /max-age=31536000/, p);
  }
});

test('jede Seite: Teilen-Links als einfache Links (kein Skript von Dritten), mit der eigenen Adresse', () => {
  for (const [p, h] of alle.slice(0, 400)) {
    const teil = h.match(/<p class="fuss-teilen">([\s\S]*?)<\/p>/)?.[1] || '';
    const u = encodeURIComponent(`https://hofladenliste.de${p}`);
    assert.ok(teil.includes(`https://wa.me/?text=`) && teil.includes(`facebook.com/sharer/sharer.php?u=${u}"`), p);
    assert.doesNotMatch(h, /<script[^>]+src="https?:\/\//, p);
    for (const m of teil.matchAll(/<a [^>]*href="https[^"]*"[^>]*>/g)) assert.match(m[0], /rel="nofollow noopener"/, p);
  }
});
