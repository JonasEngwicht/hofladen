import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const SKRIPT = new URL('../scripts/bing-diagnose.mjs', import.meta.url).pathname;

test('Bing-Diagnose: ohne Schlüssel Abbruch, im Probelauf alle Abschnitte', () => {
  const ohne = spawnSync('node', [SKRIPT], { env: { ...process.env, BING_WEBMASTER_API_KEY: '', BING_TROCKEN: '' }, encoding: 'utf8' });
  assert.equal(ohne.status, 1);
  assert.match(ohne.stderr, /BING_WEBMASTER_API_KEY fehlt/);
  const r = spawnSync('node', [SKRIPT, 'https://hofladenliste.de/x/'], { env: { ...process.env, BING_TROCKEN: '1' }, encoding: 'utf8' });
  assert.equal(r.status, 0);
  for (const m of ['GetFeeds', 'GetCrawlSettings', 'GetCrawlStats', 'GetCrawlIssues', 'GetBlockedUrls', 'GetUrlSubmissionQuota']) assert.match(r.stdout, new RegExp(m));
  assert.match(r.stdout, /Indexstatus https:\/\/hofladenliste\.de\/x\//);
});
