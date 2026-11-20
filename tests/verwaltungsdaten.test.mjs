// Namensnennung für offene Verwaltungsdaten: Datensätze und Lizenzen auf /quellen/, im Impressum und auf Hofseiten
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const pub = new URL('../public/', import.meta.url);
const lies = (p) => readFileSync(new URL(p, pub), 'utf8');
const offen = JSON.parse(readFileSync(new URL('../data/offene-quellen.json', import.meta.url), 'utf8'));

test('/quellen/ und Impressum nennen die eingebundenen Verwaltungsdatensätze mit Lizenz', () => {
  const quellen = lies('quellen/index.html');
  assert.match(quellen, /Datenlizenz Deutschland \(Zero bzw\. Namensnennung 2\.0\)/);
  assert.match(quellen, /keine Share-Alike-Lizenzen/);
  const datensaetze = new Set(offen.neu.filter((e) => e.quelle === 'kommunal').map((e) => e.datensatz));
  for (const z of Object.values(offen.ergaenzungen)) for (const h of Object.values(z.herkunft || {})) datensaetze.add(h.datensatz);
  for (const d of datensaetze) assert.ok(quellen.includes(d.replace(/&/g, '&amp;')), `Datensatz ${d} fehlt auf /quellen/`);
  if (existsSync(new URL('impressum/index.html', pub))) assert.match(lies('impressum/index.html'), /offene Verwaltungsdaten/);
});

test('Lizenzen der Verwaltungsdaten sind verlinkt', () => {
  const quellen = lies('quellen/index.html');
  if (offen.neu.some((e) => e.quelle === 'kommunal' && e.lizenz === 'CC-BY-4.0')) assert.match(quellen, /creativecommons\.org\/licenses\/by\/4\.0\//);
  if (offen.neu.some((e) => e.lizenz === 'DL-DE-BY-2.0')) assert.match(quellen, /govdata\.de\/dl-de\/by-2-0/);
});
