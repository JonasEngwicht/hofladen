import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SKRIPT = new URL('../scripts/indexnow.mjs', import.meta.url).pathname;
const D = 'https://hofladenliste.de';
const sitemap = (ordner, seiten) => writeFileSync(join(ordner, 'hoefe.xml'), `<urlset>${Object.entries(seiten).map(([p, l]) => `<url><loc>${D}${p}</loc><lastmod>${l}</lastmod></url>`).join('')}</urlset>`);
const lauf = (ordner, stand) => execFileSync('node', [SKRIPT, '--gemeldet', stand], { env: { ...process.env, SITEMAP_ORDNER: ordner, INDEXNOW_TROCKEN: '1' }, encoding: 'utf8' });

test('IndexNow: unveränderte Seiten werden nicht erneut gemeldet, geänderte und entfernte schon', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'indexnow-'));
  const ordner = join(tmp, 'sitemaps'); mkdirSync(ordner);
  const stand = join(tmp, 'gemeldet.json');
  sitemap(ordner, { '/hof/a/': '2026-11-18', '/hof/b/': '2026-11-18', '/hof/c/': '2026-11-19' });
  assert.match(lauf(ordner, stand), /Noch kein Meldestand: 3 URLs/); // erster Lauf legt nur den Stand an
  assert.match(lauf(ordner, stand), /^0 URLs/); // nochmaliger Deploy ohne Änderung: nichts
  sitemap(ordner, { '/hof/a/': '2026-11-20', '/hof/c/': '2026-11-19', '/hof/d/': '2026-11-20' });
  const aus = lauf(ordner, stand);
  assert.match(aus, /^3 URLs/); // a geändert, d neu, b entfernt
  assert.match(aus, /3 URLs → HTTP 200/);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(stand, 'utf8'))).sort(), [`${D}/hof/a/`, `${D}/hof/c/`, `${D}/hof/d/`]);
  assert.match(lauf(ordner, stand), /^0 URLs/);
});
