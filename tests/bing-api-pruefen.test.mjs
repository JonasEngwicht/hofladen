import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const SKRIPT = new URL('../scripts/bing-api-pruefen.mjs', import.meta.url).pathname;
const lauf = (env) => {
  const sauber = Object.fromEntries(Object.entries(process.env).filter(([n]) => !n.startsWith('KANDIDAT_')));
  return spawnSync('node', [SKRIPT], { env: { ...sauber, BING_TROCKEN: '1', ...env }, encoding: 'utf8' });
};

test('Bing-API-Prüfung: ohne gesetzte Secrets Abbruch mit Hinweis', () => {
  const r = lauf({ KANDIDAT_A: '  ', KANDIDAT_B: '""' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Keines der geprüften Secrets ist gesetzt/);
});

test('Bing-API-Prüfung: nennt Secret-Namen und Länge, nie den Schlüssel', () => {
  const r = lauf({ KANDIDAT_BING_WEBMASTER_API_KEY: ' abcdef0123456789abcdef0123456789\n' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /BING_WEBMASTER_API_KEY \(32 Zeichen\): gültig/);
  assert.match(r.stdout, /Kontingent heute: 100 URLs/);
  assert.doesNotMatch(r.stdout, /abcdef0123/);
});
