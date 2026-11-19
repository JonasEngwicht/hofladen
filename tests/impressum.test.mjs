// Kontaktdaten aus dem Impressum: Parser-Selbsttest und Übernahme im Build (nur leere Felder, Quelle sichtbar)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './hilfen.mjs';
import { besteMail, mailsAusHtml } from '../scripts/impressum-kontakte.mjs';

test('Parser-Selbsttest des Impressum-Crawlers', () => {
  const aus = execFileSync('node', [join(ROOT, 'scripts', 'impressum-kontakte.mjs'), '--test'], { encoding: 'utf8' });
  assert.match(aus, /(\d+)\/\1 Fälle bestanden/);
});

test('Adresse eines Webdesigners wird nie dem Hof zugeordnet', () => {
  const html = '<h1>Impressum</h1><p>Hof Linde, Dorfstr. 2</p><p>Design und Umsetzung: info@pixelwerk.de</p>';
  assert.equal(besteMail(mailsAusHtml(html), 'https://hof-linde.de'), null);
});
