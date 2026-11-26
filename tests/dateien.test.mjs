// Cloudflare Workers Free: höchstens 20.000 statische Dateien je Version. Rechtzeitig warnen, bevor ein Deploy scheitert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateienZaehlen, DATEI_WARNUNG } from '../scripts/dateien.mjs';

test(`public/ hat höchstens ${DATEI_WARNUNG} Dateien`, () => {
  const { gesamt, proTyp } = dateienZaehlen(new URL('../public/', import.meta.url).pathname);
  assert.ok(gesamt <= DATEI_WARNUNG, `${gesamt} Dateien in public/ – Limit Workers Free 20.000. Größte Seitentypen: ${proTyp.slice(0, 6).map(([t, n]) => `${t} ${n}`).join(', ')}. Abhilfe: Workers Paid oder noindex-Hofseiten aus dem Worker rendern.`);
});
