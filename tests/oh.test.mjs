// Öffnungszeiten: Feiertage je Bundesland, PH-Regeln, Entfernungsanzeige
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { status, feiertag, parse } from '../static/oh.js';
import { kmAnzeige } from '../static/karte.js';

const berlin = (s) => new Date(`${s}+01:00`); // Winterzeit

test('Feiertage je Bundesland', () => {
  assert.equal(feiertag('2026-11-18', 'SN'), 'Buß- und Bettag');
  assert.equal(feiertag('2026-11-18', 'BB'), null);
  assert.equal(feiertag('2026-06-04', 'BY'), 'Fronleichnam');
  assert.equal(feiertag('2026-06-04', 'NI'), null);
  assert.equal(feiertag('2026-04-05', 'BB'), 'Ostersonntag');
  assert.equal(feiertag('2026-04-03', ''), 'Karfreitag');
  assert.equal(feiertag('2026-10-31', 'TH'), 'Reformationstag');
  assert.equal(feiertag('2026-11-01', 'NW'), 'Allerheiligen');
  assert.equal(feiertag('2026-03-08', 'BE'), 'Frauentag');
  assert.equal(feiertag('2026-12-25', 'HH'), '1. Weihnachtstag');
});

test('Status an Feiertagen: PH-Regel gilt, sonst unklar', () => {
  const mittwoch = berlin('2026-11-18T10:00:00'); // Buß- und Bettag in Sachsen
  assert.equal(status('Mo-Sa 09:00-18:00', mittwoch, 'BB').offen, true);
  const s = status('Mo-Sa 09:00-18:00', mittwoch, 'SN');
  assert.equal(s.offen, null);
  assert.match(s.kurz, /Buß- und Bettag: Öffnungszeiten an Feiertagen unklar/);
  assert.equal(status('Mo-Sa 09:00-18:00; PH off', mittwoch, 'SN').offen, false);
  assert.equal(status('Mo-Sa 09:00-18:00; PH 09:00-12:00', mittwoch, 'SN').offen, true);
  assert.equal(status('24/7', mittwoch, 'SN').offen, true);
  assert.ok(parse('Mo-Fr 08:00-12:00; PH off').ph);
});

test('Entfernung: Meter unter 1 km, „am selben Ort“ unter 50 m', () => {
  assert.equal(kmAnzeige(0.01), 'am selben Ort');
  assert.equal(kmAnzeige(0.34), '350 m');
  assert.equal(kmAnzeige(2.24), '2,2 km');
  assert.equal(kmAnzeige(12.6), '13 km');
});
