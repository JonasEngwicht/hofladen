import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { wahlLesen, wahlSpeichern, SCHLUESSEL_WERBUNG } from '../static/statistik.js';

const KONFIG = JSON.parse(readFileSync(new URL('../data/analytics.json', import.meta.url), 'utf8'));
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
    assert.doesNotMatch(h, /<script[^>]+(googletagmanager|google-analytics\.com|googlesyndication)|adsbygoogle/, pfad);
    // Tag Manager: nur mit Consent Mode, der vorher alles auf „denied“ setzt
    const gtm = h.match(/data-gtm="(GTM-[A-Z0-9]+)"/)?.[1];
    if (gtm) {
      const k = h.indexOf(`gtm.js?id='+i+dl`), c = h.indexOf("gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'");
      assert.ok(c > 0 && k > c, `${pfad}: Consent-Default vor dem Tag Manager`);
      assert.ok(h.indexOf('<head>') < c && c < h.indexOf('<title>'), `${pfad}: Tag Manager weit oben im Kopf`);
      assert.match(h, new RegExp(`'dataLayer','${gtm}'\\);</script>`), pfad);
    } else assert.doesNotMatch(h, /gtag\(/, pfad);
    const ads = h.match(/data-ads="(ca-pub-\d{16})"/)?.[1];
    // Bestätigungs-Tag steht, sobald ein AdSense-Konto eingetragen ist – auch wenn Google gerade abgeschaltet ist („aktiv“: false)
    if (KONFIG.adsense) assert.match(h, new RegExp(`<meta name="google-adsense-account" content="${KONFIG.adsense}">`), pfad);
    else assert.doesNotMatch(h, /google-adsense-account/, pfad);
    if (KONFIG.aktiv === false) assert.doesNotMatch(h, /data-(ga|gtm|ads)=|gtag\(|googletagmanager/, `${pfad}: Google ist abgeschaltet`);
    if (/data-(ga|gtm)="(G|GTM)-/.test(h) || ads) assert.match(h, /data-cookie-einstellungen/, pfad);
    else assert.doesNotMatch(h, /data-cookie-einstellungen/, pfad);
  }
  const ds = readFileSync(new URL('datenschutz/index.html', pub), 'utf8');
  if (/data-(ga|gtm)="(G|GTM)-/.test(ds)) assert.match(ds, /id="google-analytics"[\s\S]*widerrufen/);
  else assert.doesNotMatch(ds, /Google Analytics/);
  // Skript lädt gtag nur in analyticsLaden(), das nur nach „ja“ aufgerufen wird
  const js = readFileSync(new URL('../static/statistik.js', import.meta.url), 'utf8');
  assert.equal((js.match(/googletagmanager/g) || []).length, 1); // gtag/js nur in analyticsLaden(); gtm.js steht im Kopf
  assert.equal((js.match(/googlesyndication/g) || []).length, 1);
  assert.match(js, /if \(w === 'ja'\) d\.laden\(\)/);
  // AdSense: ads.txt passt zur Publisher-ID, Datenschutz erklärt den Dienst
  const ads = readFileSync(new URL('index.html', pub), 'utf8').match(/data-ads="ca-(pub-\d{16})"/)?.[1];
  if (KONFIG.adsense) assert.equal(readFileSync(new URL('ads.txt', pub), 'utf8'), `google.com, ${KONFIG.adsense.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  else assert.equal(existsSync(new URL('ads.txt', pub)), false);
  if (ads) assert.match(ds, /id="google-adsense"[\s\S]*widerrufen/);
  else assert.doesNotMatch(ds, /id="google-adsense"/);
});
