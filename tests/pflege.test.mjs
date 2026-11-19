import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pflegeIndex, hofAufloesen, pflegeEinlesen, feldPruefen, bloeckeLesen, felderAnwenden, stabileIdAus, MAX_SCHLIESSUNGEN } from '../scripts/pflege.mjs';

const stand = {
  hoefe: {
    'hofladen-gut-clarenhof-frechen': 'way/136216919',
    'spargelhof-elsholz-beelitz': 'overture/070e1bfa-8cbf-4719-a726-511259c37dfb',
    'eierautomat-hof-meyer-celle': 'node/42',
  },
  ersetzt: { 'overture/alt-1': 'node/42' },
};
const index = pflegeIndex(stand);
const doc = (ops) => ({ name: 'test.md', text: `Notiz\n\n\`\`\`json\n${JSON.stringify(ops)}\n\`\`\`\n` });
const heute = '2026-11-19';

test('Pflege: Hof-Angaben in allen Schreibweisen auflösen', () => {
  assert.equal(hofAufloesen('w136216919', index), 'w136216919');
  assert.equal(hofAufloesen('hofladen-gut-clarenhof-frechen', index), 'w136216919');
  assert.equal(hofAufloesen('https://hofladenliste.de/hof/hofladen-gut-clarenhof-frechen/', index), 'w136216919');
  assert.equal(hofAufloesen('/hof/w136216919/bearbeiten/', index), 'w136216919');
  assert.equal(hofAufloesen('https://hofladenliste.de/mitmachen/?eintrag=n42&aktion=ergaenzen', index), 'n42');
  assert.equal(hofAufloesen('https://www.openstreetmap.org/node/42', index), 'n42');
  assert.equal(hofAufloesen('spargelhof-elsholz-beelitz', index), stabileIdAus('overture/070e1bfa-8cbf-4719-a726-511259c37dfb'));
  assert.equal(hofAufloesen(stabileIdAus('overture/alt-1'), index), 'n42'); // ersetzte ID folgt der Weiterleitung
  assert.equal(hofAufloesen('gibt-es-nicht', index), null);
  assert.equal(hofAufloesen('', index), null);
});

test('Pflege: Felder prüfen und vereinheitlichen', () => {
  assert.deepEqual(feldPruefen('website', 'hof-meyer.de'), { wert: 'https://hof-meyer.de' });
  assert.deepEqual(feldPruefen('plz', '03149'), { wert: '03149' });
  assert.ok(feldPruefen('plz', '3149').fehler);
  assert.ok(feldPruefen('email', 'kein-at').fehler);
  assert.ok(feldPruefen('lat', 60).fehler);
  assert.deepEqual(feldPruefen('lat', '51,7432'), { wert: 51.7432 });
  assert.ok(feldPruefen('preis', '3 €').fehler);
  assert.deepEqual(feldPruefen('telefon', null), { wert: null });
  assert.deepEqual(feldPruefen('oeffnungszeiten', 'Mo-Fr 08:00-18:00'), { wert: 'Mo-Fr 08:00-18:00' });
  assert.equal(feldPruefen('oeffnungszeiten', 'freitags nachmittags').alsText, true);
});

test('Pflege: Änderungen, neue Einträge und Ablehnungen', () => {
  const { pflege, bericht } = pflegeEinlesen([doc([
    { hof: 'hofladen-gut-clarenhof-frechen', felder: { telefon: '02234 123456', oeffnungszeiten: 'nur nach Absprache' } },
    { neu: { name: 'Testhof Sonnenblume', plz: '03149', ort: 'Forst (Lausitz)' } },
    { neu: { name: 'Eierautomat Hof Meyer', plz: '29221', ort: 'Celle', typ: 'automat', art: 'Eierautomat' } }, // gibt es schon
    { neu: { name: 'Ohne Ort', plz: '03149' } },
    { hof: 'unbekannt', felder: { telefon: '0123 456789' } },
    { hof: 'n42', felder: { telefon: '0511 987654', farbe: 'rot' } },
  ])], null, index, { heute });
  assert.deepEqual(pflege.aenderungen.w136216919, { felder: { telefon: '02234 123456', oeffnungszeiten_text: 'nur nach Absprache', oeffnungszeiten: null }, stand: heute });
  assert.equal(pflege.neu['pflege-testhof-sonnenblume-forst-lausitz'].art, 'Hofladen');
  assert.equal(pflege.aenderungen.n42.felder.telefon, '0511 987654');
  assert.equal(bericht.angenommen.length, 3);
  assert.equal(bericht.abgelehnt.length, 3);
  assert.match(bericht.abgelehnt.map((x) => x.grund).join('|'), /gibt es schon.*name, plz und ort.*nicht gefunden/);
  assert.ok(bericht.hinweise.some((h) => /farbe/.test(h.hinweis)));
  assert.ok(bericht.hinweise.some((h) => /als Text/.test(h.hinweis)));
});

test('Pflege: spätere Dokumente ergänzen frühere, kaputtes JSON wird gemeldet', () => {
  const erst = pflegeEinlesen([doc([{ hof: 'n42', felder: { telefon: '0511 1111', email: 'a@hof.de' } }])], null, index, { heute: '2026-11-18' }).pflege;
  const { pflege, bericht } = pflegeEinlesen([doc([{ hof: 'n42', felder: { telefon: '0511 2222' } }]), { name: 'kaputt.md', text: '```json\n[{"hof": }]\n```' }], erst, index, { heute });
  assert.deepEqual(pflege.aenderungen.n42, { felder: { telefon: '0511 2222', email: 'a@hof.de' }, stand: heute });
  assert.equal(bericht.abgelehnt[0].datei, 'kaputt.md');
  assert.equal(bloeckeLesen('[{"hof":"n42","geschlossen":true}]').ops.length, 1); // auch ohne Codeblock
});

test('Pflege: Schließungen, Wiedereröffnung und Schutz gegen Massenschließung', () => {
  const { pflege } = pflegeEinlesen([doc([{ hof: 'n42', geschlossen: true, grund: 'Betrieb aufgegeben' }])], null, index, { heute });
  assert.deepEqual(pflege.geschlossen.n42, { stand: heute, grund: 'Betrieb aufgegeben' });
  const wieder = pflegeEinlesen([doc([{ hof: 'n42', wieder_offen: true }])], pflege, index, { heute }).pflege;
  assert.equal(wieder.geschlossen.n42, undefined);

  const viele = { hoefe: Object.fromEntries(Array.from({ length: MAX_SCHLIESSUNGEN + 1 }, (_, i) => [`hof-${i}`, `node/${i + 1}`])) };
  const vIndex = pflegeIndex(viele);
  const ops = Object.keys(viele.hoefe).map((s) => ({ hof: s, geschlossen: true }));
  const gehalten = pflegeEinlesen([doc(ops)], null, vIndex, { heute });
  assert.equal(Object.keys(gehalten.pflege.geschlossen).length, 0);
  assert.equal(gehalten.bericht.zurueckgehalten.length, MAX_SCHLIESSUNGEN + 1);
  const erlaubt = pflegeEinlesen([doc(ops)], null, vIndex, { heute, schliessungenErlauben: true });
  assert.equal(Object.keys(erlaubt.pflege.geschlossen).length, MAX_SCHLIESSUNGEN + 1);
});

test('Pflege im Build: Felder überschreiben OSM und räumen Ergänzungs-Hinweise auf', () => {
  const e = { name: 'Hof', telefon: '0000 0000', oeffnungszeiten_text: 'alt', ergaenzt: { felder: ['telefon', 'website'], quellen: [{ felder: ['telefon', 'website'], quelle: 'x' }] } };
  felderAnwenden(e, { telefon: '0511 2222', oeffnungszeiten: 'Mo 08:00-12:00', saison: 'Spargel ab April' }, heute);
  assert.equal(e.telefon, '0511 2222');
  assert.equal(e.oeffnungszeiten_text, null);
  assert.equal(e.saisonHinweis, 'Spargel ab April');
  assert.deepEqual(e.ergaenzt.felder, ['website']);
  assert.deepEqual(e.gepflegt, { art: 'pflege', stand: heute });
});

test('Pflege im Build: nur ergänzte PLZ setzt keinen Prüfvermerk', () => {
  const e = { name: 'Hof' };
  felderAnwenden(e, { plz: '03149' }, heute);
  assert.equal(e.plz, '03149');
  assert.equal(e.gepflegt, undefined);
});
