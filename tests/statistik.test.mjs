import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { wahlLesen, wahlSpeichern, SCHLUESSEL_WERBUNG } from '../static/statistik.js';

const speicher = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('Statistik: Wahl wird gemerkt, unbekannte Werte zählen als „noch nicht gewählt“', () => {
  const s = speicher();
  assert.equal(wahlLesen(s), null);
  wahlSpeichern('ja', s); assert.equal(wahlLesen(s), 'ja');
  wahlSpeichern('nein', s); assert.equal(wahlLesen(s), 'nein');
  s.setItem('statistik', 'vielleicht'); assert.equal(wahlLesen(s), null);
  assert.equal(wahlLesen({ getItem() { throw new Error('gesperrt'); } }), null);
});

test('Werbung: eigene Wahl, unabhängig von der Statistik', () => {
  const s = speicher();
  wahlSpeichern('ja', s);
  assert.equal(wahlLesen(s, SCHLUESSEL_WERBUNG), null);
  wahlSpeichern('nein', s, SCHLUESSEL_WERBUNG);
  assert.equal(wahlLesen(s, SCHLUESSEL_WERBUNG), 'nein');
  assert.equal(wahlLesen(s), 'ja');
});

test('Statistik: keine Seite lädt Google ohne Einwilligung', () => {
  const pub = new URL('../public/', import.meta.url);
  if (!existsSync(new URL('index.html', pub))) return;
  // Unabhängig davon, mit welcher Einstellung der letzte Build lief: nie fest eingebunden, Mess-ID nur mit Widerrufsmöglichkeit
  for (const pfad of ['index.html', 'datenschutz/index.html', 'impressum/index.html']) {
    const h = readFileSync(new URL(pfad, pub), 'utf8');
    assert.doesNotMatch(h, /<script[^>]+(googletagmanager|google-analytics\.com|googlesyndication)|gtag\(|adsbygoogle/, pfad);
    const ads = h.match(/data-ads="(ca-pub-\d{16})"/)?.[1];
    if (ads) assert.match(h, new RegExp(`<meta name="google-adsense-account" content="${ads}">`), pfad);
    else assert.doesNotMatch(h, /google-adsense-account/, pfad);
    if (/data-ga="G-/.test(h) || ads) assert.match(h, /data-cookie-einstellungen/, pfad);
    else assert.doesNotMatch(h, /data-cookie-einstellungen/, pfad);
  }
  const ds = readFileSync(new URL('datenschutz/index.html', pub), 'utf8');
  if (/data-ga="G-/.test(ds)) assert.match(ds, /id="google-analytics"[\s\S]*widerrufen/);
  else assert.doesNotMatch(ds, /Google Analytics/);
  // Skript lädt gtag nur in analyticsLaden(), das nur nach „ja“ aufgerufen wird
  const js = readFileSync(new URL('../static/statistik.js', import.meta.url), 'utf8');
  assert.equal((js.match(/googletagmanager/g) || []).length, 1);
  assert.equal((js.match(/googlesyndication/g) || []).length, 1);
  assert.match(js, /if \(w === 'ja'\) d\.laden\(\)/);
  // AdSense: ads.txt passt zur Publisher-ID, Datenschutz erklärt den Dienst
  const ads = readFileSync(new URL('index.html', pub), 'utf8').match(/data-ads="ca-(pub-\d{16})"/)?.[1];
  if (ads) {
    assert.equal(readFileSync(new URL('ads.txt', pub), 'utf8'), `google.com, ${ads}, DIRECT, f08c47fec0942fa0\n`);
    assert.match(ds, /id="google-adsense"[\s\S]*widerrufen/);
  } else assert.equal(existsSync(new URL('ads.txt', pub)), false);
});
