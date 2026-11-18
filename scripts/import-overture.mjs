#!/usr/bin/env node
// Wandelt die Overture-Kandidaten (scripts/fetch-overture.py) in data/overture.json um:
//  - neu: Hofläden und Automaten, die in OpenStreetMap fehlen (eindeutiger Name, Konfidenz, keine Doppelungen)
//  - ergaenzungen: Telefon, Website, E-Mail, Social Media und Adresse für bestehende OSM-Einträge (nur leere Felder)
// Aufruf: node scripts/import-overture.mjs <roh.json> [--osm data/osm-eintraege.json] [--ziel data/overture.json]
// Daten: Overture Maps Foundation (CDLA-Permissive-2.0 / Apache-2.0 / CC0), keine OSM-Daten.
import { readFileSync, writeFileSync } from 'node:fs';
import { ladePlz, naechsterOrt, istOrganisation, distanzKm } from './lib.mjs';
import { istHofladen, hofTyp, sauberName, kontakt, adresse, zusammenfuehren, rasterIndex, gleicherHof, namenAehnlich, namenWoerter, STARK } from './overture.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const rohPfad = args[0];
if (!rohPfad || rohPfad.startsWith('--')) { console.error('Aufruf: node scripts/import-overture.mjs <roh.json>'); process.exit(1); }
const roh = JSON.parse(readFileSync(rohPfad, 'utf8'));
const osm = JSON.parse(readFileSync(opt('--osm', new URL('../data/osm-eintraege.json', import.meta.url)), 'utf8'));
const zielPfad = opt('--ziel', new URL('../data/overture.json', import.meta.url));
const { kreise, plz, raster } = ladePlz(new URL('../data/quellen/plz-de.csv', import.meta.url));
const stand = new Date().toISOString().slice(0, 10);
// Ortsname aus der Adresse nur übernehmen, wenn es ihn in diesem Kreis gibt (Firmendaten nennen oft den Postort)
const ortImKreis = new Set();
for (const rows of plz.values()) for (const r of rows) if (!r.org) ortImKreis.add(`${r.ort}|${r.kreis}`);

const orte = roh.orte.filter((o) => o.lat && o.lon && o.name).map((o) => ({ ...o, name: sauberName(o.name), k: kontakt(o), a: adresse(o) }));
const osmIdx = rasterIndex(osm);

// 1) Ergänzungen für OSM-Einträge: bester Overture-Treffer mit ähnlichem Namen in der Nähe
const ergaenzungen = {};
const ortIdx = rasterIndex(orte);
for (const e of osm) {
  if (!e.name) continue;
  const generisch = !namenWoerter(e.name).length;
  const kand = ortIdx.nahe(e.lat, e.lon).filter((o) => o.konf >= 0.6).map((o) => ({ o, d: distanzKm(e.lat, e.lon, o.lat, o.lon) }))
    .filter(({ o, d }) => generisch ? d <= 0.04 && STARK.test(o.name) : d <= 0.5 && namenAehnlich(e.name, o.name))
    .sort((a, b) => b.o.konf - a.o.konf || a.d - b.d);
  if (!kand.length) continue;
  const z = {};
  for (const { o } of kand) {
    for (const f of ['telefon', 'website', 'email', 'facebook', 'instagram']) if (!e[f] && !z[f] && o.k[f]) z[f] = o.k[f];
    if (!e.strasse && !z.strasse && o.a.strasse && o.a.plz && (e.ort || ortImKreis.has(`${o.a.ort}|${e.kreis}`)))
      Object.assign(z, { strasse: o.a.strasse, plz: e.plz || o.a.plz, ort: e.ort || o.a.ort });
  }
  if (Object.keys(z).length) ergaenzungen[e.osm] = { ...z, overture: kand[0].o.id, datensatz: kand[0].o.quelle, lizenz: kand[0].o.lizenz };
}

// 2) Neue Einträge
const auswahl = zusammenfuehren(orte.filter(istHofladen));
const neu = [];
const stat = { kandidaten: orte.length, auswahl: auswahl.length, inOsm: 0, ohneOrt: 0 };
for (const o of auswahl) {
  if (osmIdx.nahe(o.lat, o.lon).some((e) => gleicherHof(e, o))) { stat.inOsm++; continue; }
  const kand = o.a.plz ? (plz.get(o.a.plz) || []).filter((r) => !r.org) : null;
  let t = (kand && kand.length ? naechsterOrt(raster, o.lat, o.lon, kand) : null);
  if (t && t.km > 15) t = null; // PLZ passt nicht zur Lage
  t ||= naechsterOrt(raster, o.lat, o.lon);
  if (!t) { stat.ohneOrt++; continue; }
  if (istOrganisation(t.ort.ort)) { const t2 = naechsterOrt(raster, o.lat, o.lon); if (t2) t = t2; }
  const { typ, art } = hofTyp(o.name);
  let { strasse, plz: pc, ort } = o.a;
  if (ort && !ortImKreis.has(`${ort}|${t.ort.kreis}`)) {
    if (pc && pc === t.ort.plz) ort = t.ort.ort;
    else { strasse = null; pc = null; ort = null; } // Adresse passt nicht zur Lage: lieber „bei <Ort>“ anzeigen
  }
  neu.push({
    overture: o.id, datensatz: o.quelle, lizenz: o.lizenz, konfidenz: Math.round(o.konf * 100) / 100,
    typ, art, name: o.name, strasse, plz: pc, ort,
    ortNah: t.ort.ort, plzNah: t.ort.plz, kreis: kreise.get(t.ort.kreis).code,
    lat: +(+o.lat).toFixed(6), lon: +(+o.lon).toFixed(6), oeffnungszeiten: null,
    telefon: o.k.telefon, email: o.k.email, website: o.k.website, facebook: o.k.facebook, instagram: o.k.instagram,
    betreiber: null, beschreibung: null, bio: /\bbio|öko|demeter|bioland|naturland/i.test(o.name) ? true : null,
    produkte: null, selbstbedienung: typ === 'automat' || /selbstbedienung/i.test(o.name) ? true : null, zahlung: null, geprueft: null,
  });
}
neu.sort((a, b) => a.overture.localeCompare(b.overture));

// Schutz vor kaputten Läufen: nicht überschreiben, wenn auf einmal viel weniger Einträge kommen
try {
  const bisher = JSON.parse(readFileSync(zielPfad, 'utf8'));
  if (neu.length < bisher.neu.length * 0.7 && process.env.ERLAUBE_SCHWUND !== '1') {
    console.error(`Nur ${neu.length} statt bisher ${bisher.neu.length} neue Einträge – Daten werden nicht überschrieben.`);
    process.exit(1);
  }
} catch (err) { if (err.code !== 'ENOENT') throw err; }

writeFileSync(zielPfad, JSON.stringify({ release: roh.release, stand, neu, ergaenzungen }, null, 0).replace(/\},\{/g, '},\n{') + '\n');
const felder = {};
for (const z of Object.values(ergaenzungen)) for (const f of Object.keys(z)) if (!['overture', 'datensatz', 'lizenz', 'plz', 'ort'].includes(f)) felder[f] = (felder[f] || 0) + 1;
console.log(`Overture ${roh.release}: ${stat.kandidaten} Kandidaten, ${stat.auswahl} eindeutige Hofläden/Automaten, davon ${stat.inOsm} schon in OSM, ${stat.ohneOrt} ohne Ort → ${neu.length} neue Einträge.`);
console.log(`Ergänzungen für ${Object.keys(ergaenzungen).length} OSM-Einträge: ${JSON.stringify(felder)}`);
