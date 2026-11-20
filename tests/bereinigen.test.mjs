// Bereinigung im Build: Feldfehler, Typ aus Namen, Dopplungen (scripts/bereinigen.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, anfrage } from './hilfen.mjs';
import { websiteSauber, socialSauber, emailSauber, telefonPraefix, zeitenSauber, istDublette, dublettenFinden, automatArtAusName } from '../scripts/bereinigen.mjs';

test('Website: doppelte Schemata reparieren, Wettbewerber/Verzeichnisse und Hosts ohne Domain leeren', () => {
  assert.equal(websiteSauber('https://https//oelmuehle-schoenefeld.de/'), 'https://oelmuehle-schoenefeld.de/');
  assert.equal(websiteSauber('https://htpps//www.meinbauer.de'), 'https://www.meinbauer.de/');
  assert.equal(websiteSauber('https://www.schmauder/'), null);
  assert.equal(websiteSauber('https://www.hofladen-bauernladen.info/adressen/x.php'), null);
  assert.equal(websiteSauber('https://www.heimischehoflaeden.de/hofladen/x'), null);
  assert.equal(websiteSauber('https://www.mein-bauernhof.de/verkaufstelle/x/'), null);
  assert.equal(websiteSauber('https://www.landservice.de/rd?ap=5&curl=https://www.hofcafe-zur-muedehorst.de'), 'https://www.hofcafe-zur-muedehorst.de/');
  assert.equal(websiteSauber('https://sites.google.com/view/imkerei'), 'https://sites.google.com/view/imkerei');
  assert.equal(websiteSauber('https://www.hof-sonnenschein.de/'), 'https://www.hof-sonnenschein.de/');
});

test('Social: Name ohne Domain wird zum richtigen Link, fremde Websites fliegen raus', () => {
  assert.equal(socialSauber('https://hof_kirchhoff/', 'instagram'), 'https://www.instagram.com/hof_kirchhoff/');
  assert.equal(socialSauber('@obsthofzink', 'instagram'), 'https://www.instagram.com/obsthofzink/');
  assert.equal(socialSauber('https://maerkischerhofladenselbelang/', 'facebook'), 'https://www.facebook.com/maerkischerhofladenselbelang/');
  assert.equal(socialSauber('https://www.facebook.com/abc', 'facebook'), 'https://www.facebook.com/abc');
  assert.equal(socialSauber('https://www.hof.de/', 'facebook'), null);
});

test('E-Mail: rückwärts, Trennzeichen, Wettbewerber, Google', () => {
  assert.equal(emailSauber('ed.teneerf@hcsibi-fohtsbo'), 'obsthof-ibisch@freenet.de');
  assert.equal(emailSauber('milch­hof@t-on­line.de'), 'milchhof@t-online.de');
  assert.equal(emailSauber('info@hofladen-bauernladen.info'), null);
  assert.equal(emailSauber('dpo-google@google.com'), null);
  assert.equal(emailSauber('Info@Hof-Sonne.de'), 'info@hof-sonne.de');
});

test('Telefon-Präfixe und 00:00-00:00', () => {
  assert.equal(telefonPraefix('+0371 335622666'), '0371 335622666');
  assert.equal(telefonPraefix('+0049 05943-4488'), '+49 5943-4488');
  assert.equal(telefonPraefix('+49 (0) 35 62 - 12345'), '+49 35 62 - 12345');
  assert.equal(zeitenSauber('Mo-Su,PH 00:00-00:00'), '24/7');
  assert.equal(zeitenSauber('Apr-Sep: Mo-Su 00:00-00:00'), 'Apr-Sep: Mo-Su 00:00-24:00');
  assert.equal(zeitenSauber('Mo-Fr 08:00-18:00'), 'Mo-Fr 08:00-18:00');
});

test('Automat-Typ nur bei eindeutigem Namen', () => {
  const h = (name) => ({ typ: 'hofladen', art: 'Hofladen', name });
  assert.equal(automatArtAusName(h('Reinerts Milchtankstelle')), 'Milchtankstelle');
  assert.equal(automatArtAusName(h('Eierhäusle Furtwangen')), 'Eierautomat');
  assert.equal(automatArtAusName(h('Hagg‘s Hüttenautomat')), 'Regiomat');
  assert.equal(automatArtAusName(h('Hofladen mit Milchtankstelle')), null);
  assert.equal(automatArtAusName(h('Biohof Meyer')), null);
});

const e = (o) => ({ typ: 'hofladen', art: 'Hofladen', quelle: 'osm', lat: 51, lon: 14, ...o });
test('Dopplung: sehr nah und ähnlicher Name, oder gleiche Adresse und Kontakt', () => {
  assert.ok(istDublette(e({ name: 'Capriolenhof' }), e({ name: 'Ziegenkäserei Capriolenhof', lat: 51.0001 })));
  assert.ok(istDublette(e({ name: null }), e({ name: 'Hofladen Schacht', lon: 14.0002 })));
  assert.ok(istDublette(e({ name: 'Köcherhof', quelle: 'kvm', strasse: 'Babenhauser Str. 30', website: 'https://koeckerhof.de/' }), e({ name: 'Köckerhof', strasse: 'Babenhauser Straße 30', website: 'https://koeckerhof.de/', lat: 51.005 })));
});
test('Dopplung: nur Hausnummer, fehlende Hausnummer, Unterseite, Paketshop', () => {
  assert.ok(istDublette(e({ name: 'Christines Hofladen', strasse: 'Hauptstraße 52' }), e({ name: 'Christines Hofladen', strasse: '52', lat: 51.00001 })));
  assert.ok(istDublette(e({ name: 'Johannishof', strasse: 'Johannishof' }), e({ name: 'Johannishof', strasse: 'Johannishof 1' })));
  assert.ok(istDublette(e({ name: null, website: 'https://milchviehbetrieb-schaefer.de/milchtankstelle', typ: 'automat', art: 'Milchtankstelle' }), e({ name: 'Milchtankstelle Schäfer', quelle: 'overture', website: 'https://milchviehbetrieb-schaefer.de/', typ: 'automat', art: 'Milchtankstelle', lat: 51.002 })));
  const [[ver]] = dublettenFinden([e({ name: 'DHL Paketshop', strasse: 'Dorfstraße 2', osm: 'node/1' }), e({ name: 'Der Schülldorfer Hofladen', strasse: 'Dorfstraße 2', osm: 'node/2' })]);
  assert.equal(ver.name, 'DHL Paketshop');
  assert.ok(!istDublette(e({ name: 'Hof A', strasse: 'Dorfstraße 2' }), e({ name: 'Hof A', strasse: 'Dorfstraße 4' })));
});
test('Keine Dopplung: andere Art, andere Straße, nur gleiches Branchenwort, Verkaufsstände weiter weg', () => {
  assert.ok(!istDublette(e({ name: 'Hofladen Zapf' }), e({ name: 'Café Zapf', art: 'Hofcafé' })));
  assert.ok(!istDublette(e({ name: 'Regiomat', typ: 'automat', art: 'Regiomat' }), e({ name: 'Milchtankstelle', typ: 'automat', art: 'Milchtankstelle' })));
  assert.ok(!istDublette(e({ name: 'Hagenlocher', strasse: 'Hirschlander Höfe 1', website: 'https://h.de/' }), e({ name: 'Hagenlocher', strasse: 'Krebsäckerweg 6', website: 'https://h.de/', lat: 51.007 })));
  assert.ok(!istDublette(e({ name: 'Gärtnerei Seifried', telefon: '09073 3756' }), e({ name: 'Gärtnerei Salzmann', telefon: '+49 90733756', lat: 51.002 })));
  assert.ok(!istDublette(e({ name: 'Wendel', website: 'https://spargel-wendel.de/' }), e({ name: 'Wendel', website: 'https://spargel-wendel.de/', lat: 51.011 })));
});
test('Gewinner: Betriebsangaben vor OSM vor Overture', () => {
  const osm = e({ name: 'Hof A', osm: 'node/1' }), ov = e({ name: 'Hof A', quelle: 'overture', id: 'overture/x' }), b = e({ name: 'Hof A', osm: 'node/2', vomBetrieb: { telefon: '2026-01-01' } });
  const [[v1, g1]] = dublettenFinden([ov, osm]);
  assert.equal(g1, osm); assert.equal(v1, ov);
  const r = dublettenFinden([osm, b]);
  assert.equal(r[0][1], b);
});

test('Build: entfernte Dublette (Köcherhof aus Karte von morgen) leitet per 301 auf den OSM-Eintrag weiter', async () => {
  const routen = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'routen.json'), 'utf8'));
  assert.equal(routen.umleitungen['/hof/koecherhof-bielefeld/'], '/hof/koeckerhof-bielefeld/');
  const r = await anfrage('/hof/koecherhof-bielefeld/');
  assert.equal(r.status, 301);
  assert.equal(new URL(r.headers.get('location'), 'https://x').pathname, '/hof/koeckerhof-bielefeld/');
});

test('adresseTrennen: PLZ und Ort aus der Straße lösen, Hausnummer behalten, Zweifelsfälle unverändert', async () => {
  const { adresseTrennen } = await import('../scripts/bereinigen.mjs');
  const fall = (strasse, plz) => { const e = { strasse, plz }; adresseTrennen(e); return [e.strasse, e.plz]; };
  assert.deepEqual(fall('Deutwanger Str. 30 78355 Hohenfels'), ['Deutwanger Str. 30', '78355']);
  assert.deepEqual(fall('Brögberner Str., 49811 Lingen (Ems) 21'), ['Brögberner Str. 21', '49811']);
  assert.deepEqual(fall('Mayerhof, 76661 Philippsburg, Deutschland', '76661'), ['Mayerhof', '76661']);
  assert.deepEqual(fall('Hauptstraße 5 12345 Neustadt', '99999'), ['Hauptstraße 5', '99999'], 'vorhandene PLZ bleibt');
  assert.deepEqual(fall('Dorfstr. 1 12345 Neustadt 4'), ['Dorfstr. 1 12345 Neustadt 4', undefined], 'zwei Hausnummern: nichts ändern');
  assert.deepEqual(fall('Am Hof 12, 12345'), ['Am Hof 12, 12345', undefined]);
  assert.deepEqual(fall('Hauptstraße 5'), ['Hauptstraße 5', undefined]);
});

test('nameGeschlossen: dauerhaft geschlossen ja, vorübergehend oder Ruhetage nein', async () => {
  const { nameGeschlossen } = await import('../scripts/bereinigen.mjs');
  for (const n of ['Hofladen & Imbiss geschlossen', 'ehemaliger Milchautomat', 'Hofladen Meier (closed)', 'Hofladen dauerhaft geschlossen']) assert.ok(nameGeschlossen(n), n);
  for (const n of ['Hofladen (vorübergehend geschlossen)', 'Hofladen montags geschlossen', 'Gut Geschlossenhof', 'Hofladen Winterpause geschlossen', 'Hofladen Ehemann']) assert.ok(!nameGeschlossen(n), n);
});

test('automatArtAusName: Obst-, Hof- und Warenautomaten sind Regiomaten', () => {
  const art = (name) => automatArtAusName({ typ: 'hofladen', art: 'Hofladen', name });
  for (const n of ['24h Obstautomat', "Loibl's Hofautomat", "Brodbeck's Hofautomaten", 'Warenautomat', 'Automaten Eis und Lebensmittel']) assert.equal(art(n), 'Regiomat', n);
  assert.equal(art('Hofladen mit Automat'), null);
  assert.equal(art('Gärtnerei Automatenweg'), null);
});
