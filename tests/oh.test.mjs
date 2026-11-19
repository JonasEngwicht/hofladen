// Öffnungszeiten: Feiertage je Bundesland, PH-Regeln, Entfernungsanzeige
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { status, feiertag, parse, regeln, tagesplan, uebersetze } from '../static/oh.js';
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

const sommer = (s) => new Date(`${s}+02:00`); // Sommerzeit

test('Saisonzeiten: Monatsbereiche gelten nur in ihrer Zeit', () => {
  const oh = 'Apr-Oct: Tu-Su 10:00-18:00; Nov-Mar: Sa,Su 11:00-16:00';
  assert.equal(status(oh, sommer('2026-05-13T12:00:00')).offen, true); // Mi im Mai
  assert.equal(status(oh, berlin('2026-11-19T12:00:00')).offen, false); // Do im November
  assert.equal(status(oh, berlin('2026-11-19T12:00:00')).kurz, 'Öffnet Sa 11:00');
  assert.equal(status(oh, berlin('2026-11-21T12:00:00')).kurz, 'Geöffnet bis 16:00');
  // Bereich über den Jahreswechsel
  assert.equal(status('Nov-Feb Sa 09:00-12:00', berlin('2027-01-02T10:00:00')).offen, true);
});

test('Saisonzeiten: Saisonpause nennt den Tag der Wiedereröffnung', () => {
  const s = status('May 01-Oct 31 Su 13:00-18:00; PH off', berlin('2026-11-19T15:00:00'));
  assert.equal(s.offen, false);
  assert.equal(s.kurz, 'Saisonpause, öffnet am 2. Mai');
  assert.equal(status('Apr-Oct 09:00-18:00', berlin('2026-11-19T15:00:00')).kurz, 'Saisonpause, öffnet am 1. April');
});

test('Saisonzeiten: Tage, Jahre, spätere Regeln überschreiben, Zusatzregeln ergänzen', () => {
  assert.equal(tagesplan('Apr 15-Jun 24 Sa-Su 08:00-18:00; Dec 01-23 08:00-18:00; Dec 24 08:00-12:00', '2026-12-24').length, 1);
  assert.deepEqual(tagesplan('Apr 15-Jun 24 Sa-Su 08:00-18:00; Dec 24 08:00-12:00', '2026-12-24'), [[480, 720, false]]);
  assert.deepEqual(tagesplan('Fr-Su,PH 13:00-18:00; 2026 Dec 24-26,31 off', '2026-12-31'), []);
  assert.deepEqual(tagesplan('Fr-Su,PH 13:00-18:00; 2026 Dec 24-26,31 off', '2027-12-31'), [[780, 1080, false]]);
  assert.deepEqual(tagesplan('Mo-Sa 08:30-18:30; Su 08:30-17:00; Jan-Mar Su off', '2026-02-01'), []);
  assert.deepEqual(tagesplan('Apr 14-Oct 31: Mo-Su 09:00-18:00; Nov 01-Apr 14: Su-Fr 11:00-18:00', '2026-11-19'), [[660, 1080, false]]);
  assert.deepEqual(tagesplan('Mo-Sa 08:30-12:30, Mo,Th,Fr 14:00-18:00', '2026-11-16'), [[510, 750, false], [840, 1080, false]]);
  assert.deepEqual(tagesplan('Nov15-Apr30 off; Sa 10:00-14:00', '2026-11-21'), [[600, 840, false]]); // spätere Regel gewinnt
  assert.deepEqual(tagesplan('Sa 10:00-14:00; Nov15-Apr30 off', '2026-11-21'), []);
});

test('Erweiterte Zeiten: offenes Ende, Sonnenzeiten, Kommentar-Ausweichregel', () => {
  const ab = status('Sa,Su,PH 12:00+', berlin('2026-11-21T15:00:00'));
  assert.equal(ab.offen, null);
  assert.match(ab.kurz, /Ab 12:00 geöffnet, Ende nicht angegeben/);
  assert.equal(status('Sa,Su,PH 12:00+', berlin('2026-11-21T09:00:00')).kurz, 'Öffnet um 12:00');
  const sonne = status('sunrise-sunset', berlin('2026-11-19T12:00:00'));
  assert.equal(sonne.offen, true);
  assert.match(sonne.kurz, /^Geöffnet bis ca\. 16:[0-5]\d$/);
  assert.equal(status('sunrise-sunset', berlin('2026-11-19T19:00:00')).offen, false);
  assert.equal(status('Fr 14:00-18:00 || "nach Vereinbarung"', berlin('2026-11-20T15:00:00')).offen, true);
  assert.equal(status('Mo-Su,PH 00:00+', berlin('2026-11-20T03:00:00')).offen, true);
});

test('Erweiterte Zeiten: Feiertage und nicht auswertbare Angaben', () => {
  // Buß- und Bettag in Sachsen: ohne PH-Regel unklar, mit PH-Regel gilt sie
  assert.equal(status('Apr-Oct Mo-Sa 09:00-18:00; Nov-Mar Mo-Sa 10:00-16:00', berlin('2026-11-18T12:00:00'), 'SN').offen, null);
  assert.equal(status('Nov-Mar Mo-Sa 10:00-16:00; PH off', berlin('2026-11-18T12:00:00'), 'SN').offen, false);
  for (const oh of ['"nach Vereinbarung"', 'Mo-Sa 10:00-19:00 "Spargelzeit"', 'week 15-24 Mo-Fr 10:00-19:00', 'Sa[1] 10:00-14:00', 'Th, Fr', 'Jun 29-Aug 15', 'saisonal', 'Mo 14:00-18:00; PH,SH off']) {
    assert.equal(regeln(oh), null, oh);
    if (!parse(oh)) assert.equal(status(oh, berlin('2026-11-19T12:00:00')), null, oh);
  }
  // Bisheriger Leser bleibt für einfache Angaben zuständig
  assert.equal(status('Mo-Fr 08:00-18:00', berlin('2026-11-19T12:00:00')).kurz, 'Geöffnet bis 18:00');
});

test('Übersetzung komplexer Angaben', () => {
  assert.equal(uebersetze('May-Oct: We-Su 14:00-18:00'), 'Mai–Okt.: Mi–So 14:00–18:00');
  assert.equal(uebersetze('Apr 15-Jun 24 Sa 08:00-18:00'), '15. Apr.–24. Juni Sa 08:00–18:00');
  assert.equal(uebersetze('Mo-Sa 10:00+'), 'Mo–Sa ab 10:00');
  assert.equal(uebersetze('Fr 14:00-18:00 || "nach Vereinbarung"'), 'Fr 14:00–18:00 (sonst nach Vereinbarung)');
});
