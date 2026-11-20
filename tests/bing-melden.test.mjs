import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SKRIPT = new URL('../scripts/bing-melden.mjs', import.meta.url).pathname;
const lauf = (datei, env = {}, extra = []) => execFileSync('node', [SKRIPT, '--datei', datei, ...extra], { env: { ...process.env, BING_API_KEY: '', BING_TROCKEN: '1', ...env }, encoding: 'utf8' });
const liste = (inhalt) => { const f = join(mkdtempSync(join(tmpdir(), 'bing-')), 'l.txt'); writeFileSync(f, inhalt); return f; };

test('Bing: Pfade werden zu URLs, Kommentare und Doppelte fallen weg', () => {
  const aus = lauf(liste('# Kommentar\n/bayern/\nhttps://hofladenliste.de/bayern/\n\n/karte/ # Karte\n'));
  assert.match(aus, /^2 URLs in der Liste, Tageskontingent frei: 100, sende 2\./);
  assert.match(aus, /2 URLs → OK/);
});

test('Bing: sendet nie mehr als das freie Kontingent und nennt den Rest', () => {
  const aus = lauf(liste('/a/\n/b/\n/c/\n'), { BING_TROCKEN_KONTINGENT: '2' });
  assert.match(aus, /sende 2\./);
  assert.match(aus, /Nicht gesendet \(Kontingent\): https:\/\/hofladenliste\.de\/c\//);
  assert.match(lauf(liste('/a/\n/b/\n'), {}, ['--max', '1']), /sende 1\./);
  assert.match(lauf(liste('/a/\n'), { BING_TROCKEN_KONTINGENT: '0' }), /sende 0\./);
});

test('Bing: fremde Domains werden abgelehnt, ohne Schlüssel bricht es ab', () => {
  const r = spawnSync('node', [SKRIPT, '--datei', liste('https://example.com/x/\n')], { env: { ...process.env, BING_TROCKEN: '1' }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Fremde URL/);
  const ohne = spawnSync('node', [SKRIPT], { env: { ...process.env, BING_API_KEY: '', BING_TROCKEN: '' }, encoding: 'utf8' });
  assert.equal(ohne.status, 1);
  assert.match(ohne.stderr, /BING_API_KEY fehlt/);
});

test('Bing: die Liste der wichtigsten Seiten enthält nur Seiten aus der Sitemap', () => {
  const pfade = readFileSync(new URL('../data/bing-wichtig.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);
  assert.ok(pfade.length > 0 && pfade.length <= 100);
  assert.equal(new Set(pfade).size, pfade.length);
  let xml = '';
  try { xml = ['seiten', 'kreise', 'orte', 'kategorien', 'hoefe'].map((s) => readFileSync(new URL(`../public/sitemaps/${s}.xml`, import.meta.url), 'utf8')).join(''); } catch { return; } // ohne Build nur Formatprüfung
  for (const p of pfade) assert.ok(xml.includes(`<loc>https://hofladenliste.de${p}</loc>`), `${p} fehlt in der Sitemap`);
});
