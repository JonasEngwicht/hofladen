// Probelauf offene Verwaltungsdaten: Einordnung in Ergänzungen (a) und neue Einträge (b)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vergleiche } from '../scripts/quellen-probe.mjs';

const eintrag = (quelle, qid, name, lat, lon, extra = {}) => ({ quelle, qid, name, lat, lon, ortNah: 'Hamm', ...extra });

test('Probelauf trennt Ergänzungen und neue Einträge', () => {
  const vorher = {
    neu: [
      eintrag('overture', 'o1', 'Hofladen Schulze', 51.7, 7.8, { telefon: '+49 2381 1' }),
      eintrag('kommunal', 'alt-1', 'Biohof Alt', 49.3, 10.2),
    ],
    ergaenzungen: { 'node/1': { website: 'https://a.de', quellen: { website: 'overture' } } },
  };
  const nachher = {
    neu: [
      eintrag('overture', 'o1', 'Hofladen Schulze', 51.7, 7.8, { telefon: '+49 2381 1' }),
      eintrag('kommunal', 'alt-1', 'Biohof Alt', 49.3, 10.2),
      // gleicher Hof wie o1, bringt Website und Öffnungszeiten mit → a)
      eintrag('kommunal', 'hamm-1', 'Hofladen Schulze', 51.7003, 7.8002, { website: 'https://schulze.de', oeffnungszeiten_text: 'Fr 9-18', telefon: '+49 2381 1', datensatz: 'Stadt Hamm' }),
      // wirklich neu → b)
      eintrag('kommunal', 'hamm-2', 'Spargelhof Wiese', 51.65, 7.9, { datensatz: 'Stadt Hamm', lizenz: 'DL-DE-BY-2.0' }),
    ],
    ergaenzungen: {
      'node/1': { website: 'https://a.de', telefon: '+49 2381 9', quellen: { website: 'overture', telefon: 'kommunal' }, herkunft: { telefon: { datensatz: 'Stadt Hamm' } } },
      'node/2': { email: 'x@y.de', quellen: { email: 'kommunal' }, herkunft: { email: { datensatz: 'Stadt Hamm' } } },
    },
  };
  const e = vergleiche(vorher, nachher);
  assert.equal(e.osmEintraege, 2);
  assert.deepEqual(e.osmNeu, { telefon: 1, email: 1 });
  assert.equal(e.offenEintraege, 1);
  assert.deepEqual(e.offenFelder, { website: 1, oeffnungszeiten_text: 1 });
  assert.deepEqual(e.neu.map((x) => x.qid), ['hamm-2']);
  assert.deepEqual(e.proDatensatz['Stadt Hamm'], { neu: 1, ergaenzt: 3 });
  assert.equal(e.entfernt.length, 0);
});

test('Probelauf zählt Felder, die künftig aus Verwaltungsdaten kommen, getrennt', () => {
  const vorher = { neu: [], ergaenzungen: { 'node/1': { telefon: '1', quellen: { telefon: 'overture' } } } };
  const nachher = { neu: [], ergaenzungen: { 'node/1': { telefon: '2', quellen: { telefon: 'kommunal' } } } };
  const e = vergleiche(vorher, nachher);
  assert.equal(e.osmEintraege, 0);
  assert.deepEqual(e.osmErsetzt, { telefon: 1 });
});
