#!/usr/bin/env node
// Führt die Kandidaten aus offenen Quellen zusammen und schreibt data/offene-quellen.json:
//  - neu: Hofläden und Automaten, die in OpenStreetMap fehlen (eindeutiger Name oder Einordnung durch die Quelle,
//    Konfidenz, keine Doppelungen – weder mit OSM noch zwischen den Quellen)
//  - ergaenzungen: Telefon, Website, E-Mail, Social Media, Adresse und Öffnungszeiten (Text) für OSM-Einträge,
//    nur für leere Felder, je Feld mit Quelle
// Eingabe: Rohdateien der Abrufskripte ({quelle, release?, orte:[…]}), siehe scripts/fetch-*.{py,mjs}.
// Kandidaten mit zu niedriger Konfidenz, aber eindeutigem Namen und Website kommen auf eine Prüfliste
// (scripts/websites-pruefen.mjs); bestätigt die Website des Hofs den Direktverkauf, werden sie aufgenommen.
//
// Aufruf: node scripts/import-quellen.mjs <roh.json> [<roh2.json> …] [--osm data/osm-eintraege.json]
//         [--ziel data/offene-quellen.json] [--pruefung data/website-pruefung.json] [--pruefliste <datei>]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ladePlz, naechsterOrt, istOrganisation, distanzKm } from './lib.mjs';
import { QUELLEN, istHofladen, nurKonfidenzFehlt, hofTyp, sauberName, kontakt, adresse, zusammenfuehren, rasterIndex,
  gleicherHof, namenAehnlich, namenWoerter, STARK, MIN_KONF_SCHWACH } from './quellen.mjs';

const args = process.argv.slice(2);
const OPTIONEN = ['--osm', '--ziel', '--pruefung', '--pruefliste'];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const rohPfade = args.filter((a, i) => !a.startsWith('--') && !OPTIONEN.includes(args[i - 1]));
if (!rohPfade.length) { console.error('Aufruf: node scripts/import-quellen.mjs <roh.json> [...]'); process.exit(1); }
const osm = JSON.parse(readFileSync(opt('--osm', new URL('../data/osm-eintraege.json', import.meta.url)), 'utf8'));
const zielPfad = opt('--ziel', new URL('../data/offene-quellen.json', import.meta.url));
const pruefPfad = opt('--pruefung', new URL('../data/website-pruefung.json', import.meta.url));
const pruefliste = opt('--pruefliste', null);
const { kreise, plz, raster } = ladePlz(new URL('../data/quellen/plz-de.csv', import.meta.url));
const stand = new Date().toISOString().slice(0, 10);
const PRUEFUNG_TAGE = 180;

// Bisheriger Stand: stabile IDs behalten, fehlende Quellen (Abruf fehlgeschlagen) übernehmen
const bisher = existsSync(zielPfad) ? JSON.parse(readFileSync(zielPfad, 'utf8')) : { neu: [], ergaenzungen: {} };
for (const e of bisher.neu) if (!e.quelle && e.overture) { e.quelle = 'overture'; e.qid = e.overture; } // altes Format
const bisherIds = new Set(bisher.neu.map((e) => `${e.quelle}/${e.qid}`));
const bisherNach = new Map(bisher.neu.map((e) => [`${e.quelle}/${e.qid}`, e]));
const pruefung = existsSync(pruefPfad) ? JSON.parse(readFileSync(pruefPfad, 'utf8')) : {};
const frisch = (p) => p && (Date.now() - Date.parse(p.stand)) / 864e5 <= PRUEFUNG_TAGE;

// Ortsname aus der Adresse nur übernehmen, wenn es ihn in diesem Kreis gibt (Firmendaten nennen oft den Postort)
const ortImKreis = new Set();
for (const rows of plz.values()) for (const r of rows) if (!r.org) ortImKreis.add(`${r.ort}|${r.kreis}`);

const quellenInfo = {}, orte = [];
for (const p of rohPfade) {
  const roh = JSON.parse(readFileSync(p, 'utf8'));
  const q = roh.quelle || 'overture';
  if (!QUELLEN[q]) { console.error(`Unbekannte Quelle ${q} in ${p}`); process.exit(1); }
  quellenInfo[q] = { release: roh.release || null, stand, kandidaten: roh.orte.length };
  for (const o of roh.orte) {
    if (!o.lat || !o.lon || !o.name) continue;
    const x = { ...o, quelle: q, qid: String(o.id), id: `${q}/${o.id}`, name: sauberName(o.name), k: kontakt(o), a: adresse(o),
      datensatz: o.datensatz ?? o.quelle_datensatz ?? null };
    if (q === 'overture') x.datensatz = o.quelle; // Overture: Teildatensatz (meta, BrightQuery …)
    if (q === 'foursquare') x.k.telefon = kontakt({ phones: (o.phones || []).map((t) => fsqTelefon(t, o.plz)) }).telefon;
    // Über die Website des Hofs bestätigt?
    const w = x.k.website && pruefung[x.k.website];
    if (nurKonfidenzFehlt(x) && w?.ok && frisch(w)) { x.konf = Math.max(x.konf, MIN_KONF_SCHWACH); x.webGeprueft = w.stand; }
    orte.push(x);
  }
}
// Foursquare speichert manche Nummern als „049…“ (Landesvorwahl mit führender 0). Echte Vorwahlen 049xx gibt es
// nur in Ostfriesland (PLZ 26…); dort nur bei überlanger Nummer umdeuten.
function fsqTelefon(t, pc) {
  const z = String(t || '').replace(/\D/g, '');
  if (!/^049\d{7,}$/.test(z) || String(t).trim().startsWith('+')) return t;
  return !String(pc || '').startsWith('26') || z.length >= 13 ? `+49${z.slice(3)}` : t;
}
const fehlend = Object.keys(QUELLEN).filter((q) => !quellenInfo[q] && bisher.neu.some((e) => e.quelle === q));

// Prüfliste für die Website-Prüfung
if (pruefliste) {
  const liste = [...new Set(orte.filter((o) => nurKonfidenzFehlt(o) && o.k.website && !frisch(pruefung[o.k.website])).map((o) => o.k.website))];
  writeFileSync(pruefliste, JSON.stringify(liste));
  console.log(`Prüfliste: ${liste.length} Websites (Kandidaten mit eindeutigem Namen, aber zu niedriger Konfidenz).`);
  process.exit(0);
}

const osmIdx = rasterIndex(osm);
const rang = (o) => (bisherIds.has(o.id) ? -10 : 0) + QUELLEN[o.quelle].rang;

// 1) Ergänzungen für OSM-Einträge: Treffer mit ähnlichem Namen in der Nähe, je Feld die beste Quelle
const ergaenzungen = {};
const ortIdx = rasterIndex(orte);
const FELDER = ['telefon', 'website', 'email', 'facebook', 'instagram'];
for (const e of osm) {
  if (!e.name) continue;
  const generisch = !namenWoerter(e.name).length;
  const kand = ortIdx.nahe(e.lat, e.lon).filter((o) => o.konf >= 0.6).map((o) => ({ o, d: distanzKm(e.lat, e.lon, o.lat, o.lon) }))
    .filter(({ o, d }) => generisch ? d <= 0.04 && STARK.test(o.name) : d <= 0.5 && namenAehnlich(e.name, o.name))
    .sort((a, b) => QUELLEN[a.o.quelle].rang - QUELLEN[b.o.quelle].rang || b.o.konf - a.o.konf || a.d - b.d);
  if (!kand.length) continue;
  const z = {}, quellen = {}, herkunft = {};
  // Verwaltungsdaten: Datensatz, Lizenz und Link je Feld merken (Namensnennung bei CC BY und Datenlizenz Deutschland)
  const merke = (f, o) => { quellen[f] = o.quelle; if (o.quelle === 'kommunal') herkunft[f] = { datensatz: o.datensatz || null, lizenz: o.lizenz || null, quelleUrl: o.quelleUrl || null }; };
  for (const { o } of kand) {
    for (const f of FELDER) if (!e[f] && !z[f] && o.k[f]) { z[f] = o.k[f]; merke(f, o); }
    if (!e.strasse && !z.strasse && o.a.strasse && o.a.plz && (e.ort || ortImKreis.has(`${o.a.ort}|${e.kreis}`))) {
      Object.assign(z, { strasse: o.a.strasse, plz: e.plz || o.a.plz, ort: e.ort || o.a.ort }); merke('strasse', o);
    }
    if (!e.oeffnungszeiten && !z.oeffnungszeiten_text && o.oeffnungszeiten_text) { z.oeffnungszeiten_text = o.oeffnungszeiten_text; merke('oeffnungszeiten_text', o); }
  }
  if (Object.keys(quellen).length) ergaenzungen[e.osm] = { ...z, quellen, ...(Object.keys(herkunft).length ? { herkunft } : {}) };
}
// Ergänzungen aus Quellen, deren Abruf diesmal fehlgeschlagen ist, behalten
for (const [id, alt] of Object.entries(bisher.ergaenzungen || {})) {
  const altQ = alt.quellen || (alt.datensatz ? Object.fromEntries(Object.keys(alt).filter((f) => !['overture', 'datensatz', 'lizenz', 'plz', 'ort'].includes(f)).map((f) => [f, 'overture'])) : {});
  for (const [f, q] of Object.entries(altQ)) {
    if (!fehlend.includes(q)) continue;
    const z = (ergaenzungen[id] ||= { quellen: {} });
    if (z[f]) continue;
    z[f] = alt[f]; z.quellen[f] = q;
    if (alt.herkunft?.[f]) (z.herkunft ||= {})[f] = alt.herkunft[f];
    if (f === 'strasse') { z.plz = alt.plz; z.ort = alt.ort; }
  }
}

// 2) Neue Einträge
// Bestandsschutz: bereits veröffentlichte Einträge bleiben, solange die Quelle sie noch führt (Konfidenz ≥ 0,5)
const bleibt = (o) => istHofladen(o) || (bisherIds.has(o.id) && o.konf >= 0.5 && istHofladen({ ...o, konf: 1 }));
const auswahl = zusammenfuehren(orte.filter(bleibt), rang);
const neu = [];
const stat = { kandidaten: orte.length, auswahl: auswahl.length, inOsm: 0, ohneOrt: 0, webGeprueft: 0 };
for (const o of auswahl) {
  if (osmIdx.nahe(o.lat, o.lon).some((e) => gleicherHof(e, o))) { stat.inOsm++; continue; }
  const kand = o.a.plz ? (plz.get(o.a.plz) || []).filter((r) => !r.org) : null;
  let t = (kand && kand.length ? naechsterOrt(raster, o.lat, o.lon, kand) : null);
  if (t && t.km > 15) t = null; // PLZ passt nicht zur Lage
  t ||= naechsterOrt(raster, o.lat, o.lon);
  if (!t) { stat.ohneOrt++; continue; }
  if (istOrganisation(t.ort.ort)) { const t2 = naechsterOrt(raster, o.lat, o.lon); if (t2) t = t2; }
  const { typ, art } = o.solawi ? { typ: 'hofladen', art: 'Solawi' } : hofTyp(o.name);
  let { strasse, plz: pc, ort } = o.a;
  if (ort && !ortImKreis.has(`${ort}|${t.ort.kreis}`)) {
    if (pc && pc === t.ort.plz) ort = t.ort.ort;
    else { strasse = null; pc = null; ort = null; } // Adresse passt nicht zur Lage: lieber „bei <Ort>“ anzeigen
  }
  if (o.webGeprueft) stat.webGeprueft++;
  const quellenFelder = o.kq ? Object.fromEntries(Object.entries(o.kq).filter(([, q]) => q !== o.quelle)) : {};
  neu.push({
    quelle: o.quelle, qid: o.qid, datensatz: o.datensatz || null, lizenz: o.lizenz || QUELLEN[o.quelle].lizenz || null,
    quelleUrl: o.quelleUrl || null, urheber: o.urheber || null, konfidenz: Math.round(o.konf * 100) / 100,
    webGeprueft: o.webGeprueft || null, weitereQuellen: [...new Set(o.weitere.map((w) => w.quelle).filter((q) => q !== o.quelle))],
    feldQuellen: Object.keys(quellenFelder).length ? quellenFelder : undefined,
    typ, art, name: o.name, strasse, plz: pc, ort,
    ortNah: t.ort.ort, plzNah: t.ort.plz, kreis: kreise.get(t.ort.kreis).code,
    lat: +(+o.lat).toFixed(6), lon: +(+o.lon).toFixed(6), oeffnungszeiten: null, oeffnungszeiten_text: o.oeffnungszeiten_text || null,
    telefon: o.k.telefon, email: o.k.email, website: o.k.website, facebook: o.k.facebook, instagram: o.k.instagram,
    betreiber: null, beschreibung: o.beschreibung || null,
    bio: o.bio || /\bbio|öko|demeter|bioland|naturland/i.test(o.name) ? true : null,
    verband: o.verband || null,
    produkte: null, selbstbedienung: typ === 'automat' || /selbstbedienung/i.test(o.name) ? true : null, zahlung: null, geprueft: null,
  });
}
const behalten = [];
// Bisher veröffentlichte Einträge, die die Quelle nicht mehr führt, aber derselbe Hof aus einer anderen Quelle
// (oder mit neuer ID aus derselben Quelle) ist da: ID übernehmen bzw. alte ID vermerken (Weiterleitung im Build)
{
  const jetztIds = new Set(neu.map((e) => `${e.quelle}/${e.qid}`));
  const frei = neu.filter((e) => !bisherIds.has(`${e.quelle}/${e.qid}`));
  const freiIdx = rasterIndex(frei);
  for (const d of bisher.neu) {
    const did = `${d.quelle}/${d.qid}`;
    if (jetztIds.has(did) || fehlend.includes(d.quelle)) continue;
    const n = freiIdx.nahe(d.lat, d.lon).find((x) => !x.geerbt && gleicherHof(x, d));
    if (!n) {
      // Quelle führt den Hof diesmal nicht: bis zu zweimal behalten (Schwankungen zwischen Releases), dann entfernen
      if ((d.fehlt || 0) < 2 && !osmIdx.nahe(d.lat, d.lon).some((x) => gleicherHof(x, d))) { behalten.push({ ...d, fehlt: (d.fehlt || 0) + 1 }); stat.behalten = (stat.behalten || 0) + 1; }
      continue;
    }
    n.geerbt = true;
    if (n.quelle === d.quelle) n.qid = d.qid;
    else n.alteIds = [...new Set([...(n.alteIds || []), did, ...(d.alteIds || [])])];
    stat.geerbt = (stat.geerbt || 0) + 1;
  }
  for (const n of neu) {
    delete n.fehlt;
    const alt = bisherNach.get(`${n.quelle}/${n.qid}`);
    if (alt?.alteIds) n.alteIds = [...new Set([...(n.alteIds || []), ...alt.alteIds])];
    delete n.geerbt;
  }
}
// Neue Einträge aus Quellen, deren Abruf fehlgeschlagen ist, behalten (sofern weiter nicht in OSM und nicht doppelt)
const neuIdx = rasterIndex(neu);
for (const e of behalten) if (!neuIdx.nahe(e.lat, e.lon).some((x) => gleicherHof(x, e))) { neu.push(e); neuIdx.add(e); }
for (const e of bisher.neu.filter((x) => fehlend.includes(x.quelle))) {
  if (osmIdx.nahe(e.lat, e.lon).some((x) => gleicherHof(x, e)) || neuIdx.nahe(e.lat, e.lon).some((x) => gleicherHof(x, e))) continue;
  neu.push(e); neuIdx.add(e);
}
neu.sort((a, b) => a.quelle.localeCompare(b.quelle) || a.qid.localeCompare(b.qid));

// Schutz vor kaputten Läufen: nicht überschreiben, wenn eine Quelle auf einmal viel weniger Einträge liefert
const zaehl = (l) => l.reduce((m, e) => (m[e.quelle] = (m[e.quelle] || 0) + 1, m), {});
const vorher = zaehl(bisher.neu), jetzt = zaehl(neu);
for (const [q, n] of Object.entries(vorher)) {
  if (n >= 50 && (jetzt[q] || 0) < n * 0.7 && process.env.ERLAUBE_SCHWUND !== '1') {
    console.error(`${q}: nur ${jetzt[q] || 0} statt bisher ${n} neue Einträge – Daten werden nicht überschrieben.`);
    process.exit(1);
  }
}
for (const q of fehlend) quellenInfo[q] = { ...(bisher.quellen?.[q] || {}), uebernommen: true };

writeFileSync(zielPfad, JSON.stringify({ stand, quellen: quellenInfo, neu, ergaenzungen }, null, 0).replace(/\},\{/g, '},\n{') + '\n');
const felder = {};
for (const z of Object.values(ergaenzungen)) for (const [f, q] of Object.entries(z.quellen)) felder[`${f}/${q}`] = (felder[`${f}/${q}`] || 0) + 1;
console.log(`${stat.kandidaten} Kandidaten, ${stat.auswahl} eindeutige Hofläden/Automaten, davon ${stat.inOsm} schon in OSM, ${stat.ohneOrt} ohne Ort → ${neu.length} neue Einträge (${JSON.stringify(jetzt)}; ${stat.webGeprueft} über die Website bestätigt, ${stat.geerbt || 0} mit übernommener ID, ${stat.behalten || 0} vorerst behalten, obwohl die Quelle sie nicht mehr führt).`);
if (fehlend.length) console.log(`Abruf fehlgeschlagen, bisherige Daten übernommen: ${fehlend.join(', ')}`);
console.log(`Ergänzungen für ${Object.keys(ergaenzungen).length} OSM-Einträge: ${JSON.stringify(felder)}`);
