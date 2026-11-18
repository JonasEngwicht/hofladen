import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { telefon, istHofladen, hofTyp, namenAehnlich, gleicherHof, sauberName, kontakt, adresse, zusammenfuehren } from '../scripts/quellen.mjs';
import { nurKonfidenzFehlt, websiteBestaetigt, quellenId } from '../scripts/quellen.mjs';

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
  assert.equal(sauberName('Bio-geflügelhof Rothäusle'), 'Bio-Geflügelhof Rothäusle');
  assert.equal(sauberName('Hofladen Lange | Eier und Kartoffeln'), 'Hofladen Lange');
  assert.ok(!istHofladen(o('Weidner-Wild | Online-Hofladen', 'farm', 0.9)));
  assert.ok(!istHofladen(o('Hofladen-Sauerland.de', 'farm', 0.9)));
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
  assert.equal(adresse({ strasse: '37 Straße der Freundschaft' }).strasse, 'Straße der Freundschaft 37');
  assert.equal(telefon('4928729243270'), '+49 28729243270');
  assert.equal(telefon('04952 52939092'), '+49 495252939092');
  assert.equal(telefon('+4935621234'), '+49 35621234');
  assert.equal(telefon('+49493866470266'), null);
  assert.equal(telefon('12345'), null);
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
    { osm: 'node/1', typ: 'hofladen', art: 'Hofladen', name: 'Hofladen Meyer', strasse: null, plz: null, ort: null, kreis: '12071', lat: 51.74, lon: 14.63, telefon: null, website: 'https://osm-meyer.de/' },
    { osm: 'node/2', typ: 'hofladen', art: 'Hofladen', name: 'Hofladen', lat: 51.80, lon: 14.70, telefon: null },
    // Adresse aus Overture nennt einen Ort aus einem anderen Kreis → keine Adress-Ergänzung
    { osm: 'node/3', typ: 'hofladen', art: 'Hofladen', name: 'Hofladen Krause', strasse: null, plz: null, ort: null, kreis: '12071', lat: 51.60, lon: 14.70, telefon: null },
  ];
  const roh = { release: '2026-10-21.0', orte: [
    // gleicher Hof wie node/1 → keine neue Seite, aber Telefon und Adresse ergänzen
    { id: 'aaa', name: 'Meyers Hofladen', kat: 'farm', konf: 0.9, lat: 51.741, lon: 14.631, websites: ['https://meyer.de'], phones: ['+4935621111'], strasse: 'Dorfstraße 1', plz: '03149', ort: 'Forst (Lausitz)', quelle: 'meta', lizenz: 'CDLA-Permissive-2.0' },
    // neuer Hof
    { id: 'bbb', name: 'Spargelhof Elsholz Hofladen', kat: 'farm', konf: 0.95, lat: 51.70, lon: 14.55, websites: ['http://www.spargelhof-elsholz.de'], phones: [], strasse: 'Feldweg 2', plz: '03149', ort: 'Forst (Lausitz)', quelle: 'BrightQuery', lizenz: 'CDLA-Permissive-2.0' },
    // Doppelung des neuen Hofs aus einer anderen Quelle
    { id: 'ccc', name: 'Hofladen Elsholz', kat: 'produce_store', konf: 0.8, lat: 51.7004, lon: 14.5502, phones: ['+4935622222'], quelle: 'meta', lizenz: 'CDLA-Permissive-2.0' },
    { id: 'eee', name: 'Krauses Hofladen', kat: 'farm', konf: 0.9, lat: 51.6001, lon: 14.7001, phones: ['035623333'], strasse: 'Ringstraße 3', plz: '03149', ort: 'Tettnang', quelle: 'meta', lizenz: 'CDLA-Permissive-2.0' },
    // neuer Hof, Postort passt nicht zur Lage → Adresse weglassen
    { id: 'fff', name: 'Hofladen Neumann', kat: 'farm', konf: 0.9, lat: 51.65, lon: 14.45, strasse: 'Weg 1', plz: '88069', ort: 'Tettnang', quelle: 'meta', lizenz: 'CDLA-Permissive-2.0' },
    // kein Hofladen
    { id: 'ddd', name: 'Gartenmöbel Hofverkauf', kat: 'furniture_store', konf: 1, lat: 51.72, lon: 14.6, quelle: 'BrightQuery', lizenz: 'CDLA-Permissive-2.0' },
  ] };
  writeFileSync(join(dir, 'roh.json'), JSON.stringify(roh));
  writeFileSync(join(dir, 'osm.json'), JSON.stringify(osm));
  execFileSync(process.execPath, ['scripts/import-quellen.mjs', join(dir, 'roh.json'), '--osm', join(dir, 'osm.json'), '--ziel', join(dir, 'ziel.json'), '--pruefung', join(dir, 'pruefung.json')]);
  const z = JSON.parse(readFileSync(join(dir, 'ziel.json'), 'utf8'));
  assert.equal(z.neu.length, 2);
  const n = z.neu.find((x) => x.qid === 'bbb');
  assert.equal(n.quelle, 'overture');
  assert.equal(n.name, 'Spargelhof Elsholz Hofladen');
  assert.equal(n.telefon, '+49 35622222'); // aus der Doppelung übernommen
  assert.equal(n.website, 'http://www.spargelhof-elsholz.de/');
  assert.equal(n.plz, '03149');
  assert.ok(n.kreis && n.ortNah);
  const e = z.ergaenzungen['node/1'];
  assert.equal(e.telefon, '+49 35621111');
  assert.equal(e.quellen.telefon, 'overture');
  assert.equal(e.strasse, 'Dorfstraße 1');
  assert.equal(e.website, undefined); // OSM hat schon eine Website
  assert.equal(z.ergaenzungen['node/2'], undefined); // generischer Name, nichts in 40 m
  assert.equal(z.ergaenzungen['node/3'].telefon, '+49 35623333');
  assert.equal(z.ergaenzungen['node/3'].strasse, undefined);
  const neumann = z.neu.find((x) => x.qid === 'fff');
  assert.deepEqual([neumann.strasse, neumann.plz, neumann.ort], [null, null, null]);
  assert.ok(neumann.ortNah);
});

test('Offene Quellen: Einordnung durch die Quelle, Prüfliste und Website-Bestätigung', () => {
  // Karte von morgen ordnet den Ort per Schlagwort als Hofladen ein, auch wenn der Name es nicht sagt
  assert.ok(istHofladen({ name: 'Gut Wiesengrund', kat: null, konf: 0.8, hofHinweis: true }));
  assert.ok(!istHofladen({ name: 'Gut Wiesengrund', kat: null, konf: 0.8 }));
  assert.ok(!istHofladen({ name: 'Gasthaus zur Post', kat: null, konf: 0.9, hofHinweis: true }));
  for (const n of ['Hofläden im Bergischen Land', 'Marktkauf Osnabrück', 'Fair, Regional, Biologisch, Nachhaltig', 'Hofläden und Direktvermarkter',
    'Einkaufserlebnise bei unseren Direktvermarktern', 'Die Erzeuger in der Ökomodellregion', 'Landkreis Marburg-Biedenkopf', 'Ökologischer Einkaufsführer Thüringen'])
    assert.ok(!istHofladen({ name: n, kat: null, konf: 0.8, hofHinweis: true }), n);
  assert.ok(istHofladen({ name: 'Ziegenhof Haider', kat: null, konf: 0.8, hofHinweis: true }));
  assert.equal(kontakt({ websites: ['https://www.muensterland.de/branchenbuch/hoflaeden/'] }).website, null);
  assert.equal(kontakt({ websites: ['https://example.org/broschuere.pdf'] }).website, null);
  // nur die Konfidenz fehlt → Kandidat für die Website-Prüfung
  assert.ok(nurKonfidenzFehlt({ name: 'Hofladen Konstanz', kat: 'farm', konf: 0.55 }));
  assert.ok(!nurKonfidenzFehlt({ name: 'Hofladen Konstanz', kat: 'farm', konf: 0.9 }));
  assert.ok(!nurKonfidenzFehlt({ name: 'Gartenmöbel Hofverkauf', kat: 'furniture_store', konf: 0.55 }));
  assert.ok(!nurKonfidenzFehlt({ name: 'Hofladen Konstanz', kat: 'farm', konf: 0.3 }));
  assert.ok(websiteBestaetigt('<h1>Willkommen</h1><p>Unser Hofladen hat freitags geöffnet.</p>'));
  assert.ok(websiteBestaetigt('<p>Verkauf ab Hof: Eier und Kartoffeln</p>'));
  assert.ok(!websiteBestaetigt('<p>Ferienwohnungen am See</p><script>var hofladen = 1;</script>'));
  assert.equal(quellenId('kvm', 'a6ecc183b3864315'), 'k-a6ecc183b3864315');
  assert.equal(quellenId('foursquare', '4b5A'), 'f-4b5a');
  assert.equal(quellenId('unbekannt', 'x'), null);
});

test('Offene Quellen: mehrere Quellen, stabile IDs, Website-Prüfung und fehlende Quelle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quellen-'));
  const osm = [{ osm: 'node/1', name: 'Hofladen Meyer', kreis: '12071', lat: 51.74, lon: 14.63 }];
  const ort = (id, name, lat, lon, extra = {}) => ({ id, name, kat: 'farm', konf: 0.9, lat, lon, strasse: null, plz: null, ort: null, ...extra });
  const overture = { quelle: 'overture', release: 'x', orte: [
    ort('ov1', 'Hofladen Schulze', 51.70, 14.55, { phones: ['035621'] }),
    ort('ov2', 'Hofladen Lehmann', 51.65, 14.45, { konf: 0.55, websites: ['https://lehmann-hof.de'] }), // unsicher, Website bestätigt
    ort('ov3', 'Hofladen Krüger', 51.62, 14.40, { konf: 0.55, websites: ['https://krueger-hof.de'] }), // unsicher, Website nicht bestätigt
    ort('ov4', 'Hofladen Pohl', 51.58, 14.35, { konf: 0.6 }), // schon veröffentlicht, Konfidenz gesunken → bleibt
  ] };
  const kvm = { quelle: 'kvm', orte: [
    ort('k1', 'Schulzes Hofladen', 51.7003, 14.5502, { kat: null, konf: 0.8, hofHinweis: true, oeffnungszeiten_text: 'Fr 14–18 Uhr', websites: ['https://schulze.de'] }),
    ort('k2', 'Gut Wiesengrund', 51.68, 14.50, { kat: null, konf: 0.8, hofHinweis: true }),
    ort('k3', 'Meyers Hof', 51.7403, 14.6302, { kat: null, konf: 0.8, hofHinweis: true, oeffnungszeiten_text: 'Sa 9–12 Uhr', phones: ['0356222'] }),
    ort('k4', 'Wagners Hofladen', 51.5601, 14.3001, { kat: null, konf: 0.8, hofHinweis: true }), // früher als Overture ov9 veröffentlicht
  ] };
  const fsq = { quelle: 'foursquare', orte: [ort('f1', 'Hofladen Bauer Zander', 51.66, 14.60, { konf: 0.75, plz: '03149', phones: ['0493562123456'] })] };
  for (const [n, d] of Object.entries({ overture, kvm, fsq })) writeFileSync(join(dir, `${n}.json`), JSON.stringify(d));
  writeFileSync(join(dir, 'osm.json'), JSON.stringify(osm));
  writeFileSync(join(dir, 'pruefung.json'), JSON.stringify({ 'https://lehmann-hof.de/': { ok: true, status: 200, stand: new Date().toISOString().slice(0, 10) },
    'https://krueger-hof.de/': { ok: false, status: 200, stand: new Date().toISOString().slice(0, 10) } }));
  // bisheriger Stand: Schulze war schon als Overture-Eintrag veröffentlicht → ID bleibt, obwohl KVM vorrangig wäre
  writeFileSync(join(dir, 'ziel.json'), JSON.stringify({ neu: [{ overture: 'ov1', name: 'Hofladen Schulze', lat: 51.70, lon: 14.55 },
    { overture: 'ov4', name: 'Hofladen Pohl', lat: 51.58, lon: 14.35 }, { overture: 'ov9', name: 'Hofladen Wagner', lat: 51.56, lon: 14.30 }], ergaenzungen: {} }));
  const lauf = (...dateien) => execFileSync(process.execPath, ['scripts/import-quellen.mjs', ...dateien.map((d) => join(dir, d)),
    '--osm', join(dir, 'osm.json'), '--ziel', join(dir, 'ziel.json'), '--pruefung', join(dir, 'pruefung.json')], { env: { ...process.env, ERLAUBE_SCHWUND: '' } });
  // Prüfliste enthält nur noch nicht geprüfte unsichere Kandidaten
  execFileSync(process.execPath, ['scripts/import-quellen.mjs', join(dir, 'overture.json'), '--osm', join(dir, 'osm.json'), '--ziel', join(dir, 'ziel.json'),
    '--pruefung', join(dir, 'pruefung.json'), '--pruefliste', join(dir, 'liste.json')]);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'liste.json'), 'utf8')), []);
  lauf('overture.json', 'kvm.json', 'fsq.json');
  let z = JSON.parse(readFileSync(join(dir, 'ziel.json'), 'utf8'));
  const ids = z.neu.map((e) => `${e.quelle}/${e.qid}`).sort();
  assert.deepEqual(ids, ['foursquare/f1', 'kvm/k2', 'kvm/k4', 'overture/ov1', 'overture/ov2', 'overture/ov4']);
  assert.deepEqual(z.neu.find((e) => e.qid === 'k4').alteIds, ['overture/ov9']);
  assert.equal(z.neu.find((e) => e.qid === 'f1').telefon, '+49 3562123456');
  const schulze = z.neu.find((e) => e.qid === 'ov1');
  assert.equal(schulze.oeffnungszeiten_text, 'Fr 14–18 Uhr'); // aus KVM zusammengeführt
  assert.deepEqual(schulze.weitereQuellen, ['kvm']);
  assert.ok(z.neu.find((e) => e.qid === 'ov2').webGeprueft);
  // OSM-Eintrag bekommt Öffnungszeiten und Telefon aus der Karte von morgen
  assert.equal(z.ergaenzungen['node/1'].oeffnungszeiten_text, 'Sa 9–12 Uhr');
  assert.equal(z.ergaenzungen['node/1'].quellen.telefon, 'kvm');
  // Foursquare-Abruf fehlgeschlagen → bisheriger Foursquare-Eintrag bleibt
  lauf('overture.json', 'kvm.json');
  z = JSON.parse(readFileSync(join(dir, 'ziel.json'), 'utf8'));
  assert.ok(z.neu.some((e) => e.quelle === 'foursquare' && e.qid === 'f1'));
  assert.equal(z.quellen.foursquare.uebernommen, true);
  // Overture führt Schulze nicht mehr: zweimal behalten, beim dritten Mal entfernen
  overture.orte = overture.orte.filter((o) => o.id !== 'ov1');
  kvm.orte = kvm.orte.filter((o) => o.id !== 'k1');
  writeFileSync(join(dir, 'overture.json'), JSON.stringify(overture)); writeFileSync(join(dir, 'kvm.json'), JSON.stringify(kvm));
  for (const erwartet of [1, 2, undefined]) {
    lauf('overture.json', 'kvm.json', 'fsq.json');
    z = JSON.parse(readFileSync(join(dir, 'ziel.json'), 'utf8'));
    assert.equal(z.neu.find((e) => e.qid === 'ov1')?.fehlt, erwartet);
  }
});
