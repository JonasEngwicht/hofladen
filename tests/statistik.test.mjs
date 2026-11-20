import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { wahlLesen, wahlSpeichern } from '../static/statistik.js';

const speicher = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('Statistik: Wahl wird gemerkt, unbekannte Werte zählen als „noch nicht gewählt“', () => {
  const s = speicher();
  assert.equal(wahlLesen(s), null);
  wahlSpeichern('ja', s); assert.equal(wahlLesen(s), 'ja');
  wahlSpeichern('nein', s); assert.equal(wahlLesen(s), 'nein');
  s.setItem('statistik', 'vielleicht'); assert.equal(wahlLesen(s), null);
  assert.equal(wahlLesen({ getItem() { throw new Error('gesperrt'); } }), null);
});

test('Statistik: keine Seite lädt Google ohne Einwilligung', () => {
  const ga = JSON.parse(readFileSync(new URL('../data/analytics.json', import.meta.url), 'utf8')).ga4;
  const pub = new URL('../public/', import.meta.url);
  if (!existsSync(pub)) return;
  for (const pfad of ['index.html', 'datenschutz/index.html', 'impressum/index.html']) {
    const h = readFileSync(new URL(pfad, pub), 'utf8');
    assert.doesNotMatch(h, /<script[^>]+(googletagmanager|google-analytics\.com)|gtag\(/, pfad); // nie fest eingebunden
    if (ga) {
      assert.match(h, new RegExp(`data-ga="${ga}"`), pfad);
      assert.match(h, /data-cookie-einstellungen/, pfad);
    } else assert.doesNotMatch(h, /data-ga=|data-cookie-einstellungen/, pfad);
  }
  const ds = readFileSync(new URL('datenschutz/index.html', pub), 'utf8');
  if (ga) assert.match(ds, /id="google-analytics"[\s\S]*widerrufen/);
  else assert.doesNotMatch(ds, /Google Analytics/);
  // Skript lädt gtag nur in analyticsLaden(), das nur nach „ja“ aufgerufen wird
  const js = readFileSync(new URL('../static/statistik.js', import.meta.url), 'utf8');
  assert.equal((js.match(/googletagmanager/g) || []).length, 1);
  assert.match(js, /if \(w === 'ja'\) analyticsLaden\(id\)/);
});
