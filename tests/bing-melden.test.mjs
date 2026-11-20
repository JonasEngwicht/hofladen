import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SKRIPT = new URL('../scripts/bing-melden.mjs', import.meta.url).pathname;
const lauf = (datei, env = {}, extra = []) => execFileSync('node', [SKRIPT, '--datei', datei, ...extra], { env: { ...process.env, BING_API_KEY: '', BING_TROCKEN: '1', ...env }, encoding: 'utf8' });
const liste = (inhalt) => { const f = join(mkdtempSync(join(tmpdir(), 'bing-')), 'l.txt'); writeFileSync(f, inhalt); return f; };

test('Bing: Pfade werden zu URLs, Kommentare und Doppelte fallen weg', () => {
  const aus = lauf(liste('# Kommentar\n/bayern/\nhttps://hofladenliste.de/bayern/\n\n/karte/ # Karte\n'));
  assert.match(aus, /^2 URLs werden per IndexNow gemeldet/);
  assert.match(aus, /2 URLs → HTTP 200 \(OK\)/);
});

test('Bing: --max begrenzt die Anzahl', () => {
  assert.match(lauf(liste('/a/\n/b/\n/c/\n'), {}, ['--max', '2']), /^2 URLs/);
  assert.match(lauf(liste('# nur Kommentar\n')), /^0 URLs/);
});

test('Bing: fremde Domains werden abgelehnt, ohne Schlüssel bricht es ab', () => {
  const r = spawnSync('node', [SKRIPT, '--datei', liste('https://example.com/x/\n')], { env: { ...process.env, BING_TROCKEN: '1' }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Fremde URL/);
  const ohne = spawnSync('node', [SKRIPT], { env: { ...process.env, BING_API_KEY: '', BING_TROCKEN: '' }, encoding: 'utf8' });
  assert.equal(ohne.status, 1);
  assert.match(ohne.stderr, /BING_API_KEY fehlt/);
});

test('Bing: Leerzeichen und Anführungszeichen im Secret zählen nicht als Schlüssel, falsches Format wird abgelehnt', () => {
  const leer = spawnSync('node', [SKRIPT], { env: { ...process.env, BING_API_KEY: ' "" \n', BING_TROCKEN: '' }, encoding: 'utf8' });
  assert.equal(leer.status, 1);
  assert.match(leer.stderr, /BING_API_KEY fehlt/);
  const falsch = spawnSync('node', [SKRIPT], { env: { ...process.env, BING_API_KEY: 'ab cd/ef', BING_TROCKEN: '1' }, encoding: 'utf8' });
  assert.equal(falsch.status, 1);
  assert.match(falsch.stderr, /kein gültiges IndexNow-Format/);
  assert.match(lauf(liste('/a/\n'), { BING_API_KEY: ' "c16e49cc39fb44e59119c6a9b9f6d9dd"\n' }), /Schlüssel: 32 Zeichen/);
});

test('IndexNow-Schlüsseldateien enthalten genau ihren eigenen Schlüssel', () => {
  const dateien = readdirSync(new URL('../static/', import.meta.url)).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  assert.ok(dateien.includes('c16e49cc39fb44e59119c6a9b9f6d9dd.txt'));
  for (const f of dateien) assert.equal(readFileSync(new URL(`../static/${f}`, import.meta.url), 'utf8').trim(), f.slice(0, -4));
});

test('Bing: die Liste der wichtigsten Seiten enthält nur Seiten aus der Sitemap', () => {
  const pfade = readFileSync(new URL('../data/bing-wichtig.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);
  assert.ok(pfade.length > 0 && pfade.length <= 100);
  assert.equal(new Set(pfade).size, pfade.length);
  let xml = '';
  try { xml = ['seiten', 'kreise', 'orte', 'kategorien', 'hoefe'].map((s) => readFileSync(new URL(`../public/sitemaps/${s}.xml`, import.meta.url), 'utf8')).join(''); } catch { return; } // ohne Build nur Formatprüfung
  for (const p of pfade) assert.ok(xml.includes(`<loc>https://hofladenliste.de${p}</loc>`), `${p} fehlt in der Sitemap`);
});
