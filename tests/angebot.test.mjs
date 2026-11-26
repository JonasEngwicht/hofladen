// Angebotsseiten (/angebot/<produkt>/ und /angebot/<produkt>/<bundesland>/): intern gut erreichbar und mit eigenem Text.
// Hintergrund: Search Console meldete sie im Nov. 2026 als „Gefunden – zurzeit nicht indexiert“ (nie gecrawlt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PUB = new URL('../public/', import.meta.url).pathname;
const html = (pfad) => readFileSync(join(PUB, pfad, 'index.html'), 'utf8');
const ordner = (pfad) => readdirSync(join(PUB, pfad), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const noindex = (h) => /<meta name="robots" content="noindex/.test(h);
const produkte = ordner('angebot');
const LAENDER = ordner('angebot/eier');

test('Startseite und /angebot/ verlinken jede Produktseite', () => {
  assert.ok(produkte.length >= 12, `nur ${produkte.length} Produktseiten`);
  for (const seite of ['', 'angebot']) { const h = html(seite); for (const p of produkte) assert.ok(h.includes(`href="/angebot/${p}/"`), `${seite || 'Startseite'} → ${p}`); }
});

test('Jede Produkt-Land-Seite ist von der Bundeslandseite und von Kreisseiten verlinkt', () => {
  const eingehend = new Map();
  for (const land of LAENDER) {
    const seiten = [land, ...ordner(land).map((k) => join(land, k)).filter((k) => existsSync(join(PUB, k, 'index.html')))];
    for (const s of seiten) for (const m of html(s).matchAll(/href="(\/angebot\/[a-z-]+\/[a-z-]+\/)"/g)) (eingehend.get(m[1]) || eingehend.set(m[1], new Set()).get(m[1])).add(s);
  }
  let n = 0;
  for (const p of produkte) for (const land of ordner(join('angebot', p))) {
    const pfad = `/angebot/${p}/${land}/`, von = eingehend.get(pfad) || new Set();
    n++;
    assert.ok(von.has(land), `${pfad}: Link von /${land}/ fehlt`);
    assert.ok(von.size >= 2, `${pfad}: kein Link von einer Kreisseite`);
  }
  assert.ok(n > 100, `nur ${n} Produkt-Land-Seiten`);
});

test('Kreisseiten verlinken nur Produkt-Land-Seiten, die es gibt, und nur im eigenen Bundesland', () => {
  for (const land of LAENDER) for (const k of ordner(land)) {
    if (!existsSync(join(PUB, land, k, 'index.html'))) continue;
    const teil = html(join(land, k)).match(/<section class="abschnitt angebot-land">[\s\S]*?<\/section>/)?.[0] || '';
    for (const m of teil.matchAll(/href="(\/angebot\/([a-z-]+)\/([a-z-]+)\/)"/g)) {
      assert.equal(m[3], land, `${land}/${k} verlinkt ${m[1]}`);
      assert.ok(existsSync(join(PUB, m[1], 'index.html')), `${m[1]} fehlt`);
    }
  }
});

test('Produktseiten haben eigenen Text (nicht nur Linklisten)', () => {
  for (const p of produkte) {
    const h = html(join('angebot', p));
    assert.ok(!noindex(h), p);
    const teil = h.match(/<section class="abschnitt seo-text angebot-wissen">([\s\S]*?)<\/section>/)?.[1];
    assert.ok(teil, `${p}: Wissensblock fehlt`);
    const woerter = teil.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    assert.ok(woerter >= (p === 'kartoffeln' ? 40 : 55), `${p}: nur ${woerter} Wörter`);
    for (const m of teil.matchAll(/href="(\/[^"#]+)"/g)) assert.ok(existsSync(join(PUB, m[1], 'index.html')), `${p}: ${m[1]} fehlt`);
  }
});
