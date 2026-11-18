import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { istHofladen, hofTyp, namenAehnlich, gleicherHof, sauberName, kontakt, adresse, zusammenfuehren } from '../scripts/overture.mjs';

const o = (name, kat, konf = 0.9, hier = '') => ({ name, kat, konf, hier });

test('Overture-Auswahl: eindeutige Hofläden ja, Fehltreffer nein', () => {
  assert.ok(istHofladen(o('Hofladen Kerstin Schottenhamel', 'farm')));
  assert.ok(istHofladen(o('Cohrs Hofladen', 'farmers_market')));
  assert.ok(istHofladen(o('Hartwich Hofladen', 'greengrocer', 0.7)));
  assert.ok(istHofladen(o('Milchtankstelle Hof Meyer', 'dairy_farm')));
  assert.ok(istHofladen(o('Obsthof Rieke', 'farm', 0.9)));
  assert.ok(istHofladen(o('Hofladen & Café Sonnenhof', 'cafe')));
  // Konfidenz zu niedrig
  assert.ok(!istHofladen(o('Hofladen Konstanz', 'agriculture', 0.47)));
  assert.ok(!istHofladen(o('Obsthof Müller', 'produce_store', 0.75)));
  // falsche Kategorie oder kein Hof
  assert.ok(!istHofladen(o('Gartenmöbel Hofverkauf', 'furniture_store', 1)));
  assert.ok(!istHofladen(o('Aa-ambiente Blumen & Hofladen', 'florist', 1)));
  assert.ok(!istHofladen(o('Deutsche Direktvermarktung', 'telecommunications_company', 0.9)));
  assert.ok(!istHofladen(o('Verband der unabhängigen Direktvermarkter e.V.', 'social_or_community_service', 0.9)));
  assert.ok(!istHofladen(o('Geflügelhof Valznerweiher', 'restaurant', 1)));
  assert.ok(!istHofladen(o('Biohof Ihlow: Essen & Übernachten', 'holiday_rental_home', 1)));
  assert.ok(!istHofladen(o('Spargelhof Mysegades', 'restaurant', 1)));
  assert.ok(!istHofladen(o('Hof Schulze', 'farm', 1))); // kein Hinweis auf Verkauf
  assert.ok(!istHofladen(o('Landgasthof Hofladen Krone', 'farm', 1)));
});

test('Overture: Typ aus dem Namen', () => {
  assert.deepEqual(hofTyp('Milchtankstelle Hof Meyer'), { typ: 'automat', art: 'Milchtankstelle' });
  assert.deepEqual(hofTyp('Eierautomat am Feld'), { typ: 'automat', art: 'Eierautomat' });
  assert.deepEqual(hofTyp('Regiomat Bauer Lange'), { typ: 'automat', art: 'Regiomat' });
  assert.deepEqual(hofTyp('Hofladen Lange'), { typ: 'hofladen', art: 'Hofladen' });
});

test('Overture: Namen vergleichen und aufräumen', () => {
  assert.ok(namenAehnlich('Kittlers Hofladen', 'Hofladen Kittler'));
  assert.ok(namenAehnlich('Hofladen Gut Clarenhof', 'Gut Clarenhof GbR'));
  assert.ok(!namenAehnlich('Hofladen Meyer', 'Hofladen Schulze'));
  assert.ok(!namenAehnlich('Hofladen', 'Bio Hofladen'));
  assert.equal(sauberName('Eier Und Geflügelhof Fuhrmann Gbr'), 'Eier und Geflügelhof Fuhrmann GbR');
  assert.equal(sauberName('Winklhofer´s  Hofladen'), 'Winklhofer’s Hofladen');
});

test('Overture: gleicher Hof nach Abstand und Name', () => {
  const a = { name: 'Hofladen Meyer', lat: 52.5, lon: 13.4 };
  assert.ok(gleicherHof(a, { name: 'Ganz anders', lat: 52.5005, lon: 13.4 })); // ca. 55 m
  assert.ok(gleicherHof(a, { name: 'Meyers Hofladen', lat: 52.51, lon: 13.4 })); // ca. 1,1 km, gleicher Name
  assert.ok(!gleicherHof(a, { name: 'Hofladen Schulze', lat: 52.51, lon: 13.4 }));
  assert.ok(!gleicherHof(a, { name: 'Hofladen Meyer', lat: 52.6, lon: 13.4 })); // 11 km
});

test('Overture: Kontaktdaten ohne Verzeichnisse, Social Media getrennt', () => {
  const k = kontakt({ websites: ['https://www.gelbeseiten.de/x', 'http://www.facebook.com/hofmeyer', 'hof-meyer.de'],
    socials: ['https://www.instagram.com/hofmeyer'], phones: ['+4935621234'], emails: ['Info@Hof-Meyer.de'] });
  assert.equal(k.website, 'https://hof-meyer.de/');
  assert.equal(k.facebook, 'http://www.facebook.com/hofmeyer');
  assert.equal(k.instagram, 'https://www.instagram.com/hofmeyer');
  assert.equal(k.telefon, '+49 35621234');
  assert.equal(k.email, 'info@hof-meyer.de');
  assert.equal(kontakt({ websites: ['https://www.hofladenfinder.org/hof/1'] }).website, null);
  assert.deepEqual(adresse({ strasse: 'Dorfstraße 5', plz: '03149', ort: 'Forst' }), { strasse: 'Dorfstraße 5', plz: '03149', ort: 'Forst' });
  assert.equal(adresse({ strasse: 'Dorfstraße', plz: '3149' }).strasse, null);
});

test('Overture: Doppelungen zusammenführen, beste Konfidenz bleibt', () => {
  const liste = [
    { id: 'a', name: 'Hofladen Meyer', konf: 0.7, lat: 52.5, lon: 13.4, k: { telefon: '+49 1' }, a: { strasse: 'Dorfstr. 1' } },
    { id: 'b', name: 'Meyer Hofladen GbR', konf: 0.95, lat: 52.501, lon: 13.4, k: { website: 'https://meyer.de/' }, a: {} },
    { id: 'c', name: 'Hofladen Schulze', konf: 0.9, lat: 52.6, lon: 13.4, k: {}, a: {} },
  ];
  const r = zusammenfuehren(liste);
  assert.equal(r.length, 2);
  const meyer = r.find((x) => x.id === 'b');
  assert.equal(meyer.k.telefon, '+49 1');
  assert.equal(meyer.k.website, 'https://meyer.de/');
  assert.equal(meyer.a.strasse, 'Dorfstr. 1');
});

test('Overture-Import: neue Höfe ohne OSM-Doppelungen, Ergänzungen nur für leere Felder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'overture-'));
  const osm = [
    { osm: 'node/1', typ: 'hofladen', art: 'Hofladen', name: 'Hofladen Meyer', strasse: null, plz: null, ort: null, lat: 51.74, lon: 14.63, telefon: null, website: 'https://osm-meyer.de/' },
    { osm: 'node/2', typ: 'hofladen', art: 'Hofladen', name: 'Hofladen', lat: 51.80, lon: 14.70, telefon: null },
  ];
  const roh = { release: '2026-10-21.0', orte: [
    // gleicher Hof wie node/1 → keine neue Seite, aber Telefon und Adresse ergänzen
    { id: 'aaa', name: 'Meyers Hofladen', kat: 'farm', konf: 0.9, lat: 51.741, lon: 14.631, websites: ['https://meyer.de'], phones: ['+4935621111'], strasse: 'Dorfstraße 1', plz: '03149', ort: 'Forst (Lausitz)', quelle: 'meta', lizenz: 'CDLA-Permissive-2.0' },
    // neuer Hof
    { id: 'bbb', name: 'Spargelhof Elsholz Hofladen', kat: 'farm', konf: 0.95, lat: 51.70, lon: 14.55, websites: ['http://www.spargelhof-elsholz.de'], phones: [], strasse: 'Feldweg 2', plz: '03149', ort: 'Forst (Lausitz)', quelle: 'BrightQuery', lizenz: 'CDLA-Permissive-2.0' },
    // Doppelung des neuen Hofs aus einer anderen Quelle
    { id: 'ccc', name: 'Hofladen Elsholz', kat: 'produce_store', konf: 0.8, lat: 51.7004, lon: 14.5502, phones: ['+4935622222'], quelle: 'meta', lizenz: 'CDLA-Permissive-2.0' },
    // kein Hofladen
    { id: 'ddd', name: 'Gartenmöbel Hofverkauf', kat: 'furniture_store', konf: 1, lat: 51.72, lon: 14.6, quelle: 'BrightQuery', lizenz: 'CDLA-Permissive-2.0' },
  ] };
  writeFileSync(join(dir, 'roh.json'), JSON.stringify(roh));
  writeFileSync(join(dir, 'osm.json'), JSON.stringify(osm));
  execFileSync(process.execPath, ['scripts/import-overture.mjs', join(dir, 'roh.json'), '--osm', join(dir, 'osm.json'), '--ziel', join(dir, 'ziel.json')]);
  const z = JSON.parse(readFileSync(join(dir, 'ziel.json'), 'utf8'));
  assert.equal(z.neu.length, 1);
  const n = z.neu[0];
  assert.equal(n.overture, 'bbb');
  assert.equal(n.name, 'Spargelhof Elsholz Hofladen');
  assert.equal(n.telefon, '+49 35622222'); // aus der Doppelung übernommen
  assert.equal(n.website, 'http://www.spargelhof-elsholz.de/');
  assert.equal(n.plz, '03149');
  assert.ok(n.kreis && n.ortNah);
  const e = z.ergaenzungen['node/1'];
  assert.equal(e.telefon, '+49 35621111');
  assert.equal(e.strasse, 'Dorfstraße 1');
  assert.equal(e.website, undefined); // OSM hat schon eine Website
  assert.equal(z.ergaenzungen['node/2'], undefined); // generischer Name, nichts in 40 m
});
