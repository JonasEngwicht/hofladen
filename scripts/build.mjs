#!/usr/bin/env node
// Baut die statische Website nach public/ und die Daten für den Worker nach src/generated/.
// Läuft automatisch vor jedem "wrangler deploy" (siehe wrangler.jsonc → build.command).
import { mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, domainToUnicode } from 'node:url';
import { createHash } from 'node:crypto';
import { ladePlz, naechsterOrt, slugify, distanzKm, BUNDESLAENDER, istOrganisation } from './lib.mjs';
import { rasterIndex, gleicherHof, QUELLEN, quellenId, solawiOk } from './quellen.mjs';
import { RATGEBER } from './ratgeber.mjs';
import { titelBreite, titelMitMarke, kuerzeBeschreibung, TITEL_MAX } from './pixel.mjs';
import { stabileIdAus, felderAnwenden } from './pflege.mjs';
import { felderBereinigen, dublettenFinden, automatArtAusName } from './bereinigen.mjs';
import { TIPP_MERKMALE, SAISON_PRODUKTE } from '../src/betrieb.js';
import { zeilen, uebersetze, parse } from '../static/oh.js';
import { KATEGORIEN, ICON, typIcon, karteHtml, statusHtml, PRODUKT_SPRITE, produktIcon } from '../static/karte.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');
const GEN = join(ROOT, 'src', 'generated');
const cfg = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const BUILD_DATUM = process.env.BUILD_DATUM || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
// Version der CSS/JS-Dateien aus ihrem Inhalt: ändert sich nur, wenn sich die Dateien ändern
// Version von Logo, Favicons und Vorschaubild (ändert sich nur, wenn sich die Dateien ändern)
const ICON_VERSION = createHash('sha1').update(['favicon.svg', 'og-bild.png'].map((f) => readFileSync(join(ROOT, 'static', f))).join('')).digest('hex').slice(0, 8);
// Eigene Kartenkacheln (siehe .github/workflows/karten-erzeugen.yml): nur aktiv, wenn Kacheln und Bibliothek vorhanden sind
const KACHELN = (() => {
  try {
    const k = JSON.parse(readFileSync(join(ROOT, 'data', 'karten.json'), 'utf8'));
    return /^\d{8}$/.test(k.version) && existsSync(join(ROOT, 'static', 'vendor', 'protomaps-leaflet.js')) ? k : null;
  } catch { return null; }
})();
const VERSION = createHash('sha1').update(['style.css', 'app.js', 'karte.js', 'oh.js', 'vollkarte.js', 'betrieb.js', 'aushang.js', 'qr.js', 'route.js', 'statistik.js'].map((f) => readFileSync(join(ROOT, 'static', f))).join('')).digest('hex').slice(0, 8);

// Saisonkalender: [Sorte, Monate frisch, Monate aus dem Lager] – Richtwerte Freiland Deutschland
const SAISON = [
  ['Spargel', [4, 5, 6]], ['Rhabarber', [4, 5, 6]], ['Erdbeeren', [5, 6, 7, 8]], ['Kirschen', [6, 7, 8]],
  ['Himbeeren', [6, 7, 8, 9]], ['Heidelbeeren', [7, 8, 9]], ['Pflaumen und Zwetschgen', [7, 8, 9, 10]],
  ['Äpfel', [8, 9, 10, 11], [12, 1, 2, 3, 4, 5, 6, 7]], ['Birnen', [8, 9, 10], [11, 12, 1, 2]],
  ['Walnüsse', [9, 10, 11]], ['Kartoffeln', [6, 7, 8, 9, 10], [11, 12, 1, 2, 3, 4, 5]],
  ['Möhren', [6, 7, 8, 9, 10, 11], [12, 1, 2, 3, 4, 5]], ['Zwiebeln', [7, 8, 9, 10], [11, 12, 1, 2, 3, 4, 5, 6]],
  ['Kohlrabi', [5, 6, 7, 8, 9, 10]], ['Kopfsalat', [5, 6, 7, 8, 9, 10]], ['Erbsen', [6, 7, 8]],
  ['Gurken', [6, 7, 8, 9]], ['Zucchini', [6, 7, 8, 9, 10]], ['Tomaten', [7, 8, 9, 10]],
  ['Grüne Bohnen', [7, 8, 9, 10]], ['Zuckermais', [8, 9, 10]], ['Blumenkohl', [6, 7, 8, 9, 10, 11]],
  ['Brokkoli', [6, 7, 8, 9, 10]], ['Spinat', [4, 5, 6, 9, 10, 11]], ['Weißkohl', [6, 7, 8, 9, 10, 11], [12, 1, 2, 3, 4, 5]],
  ['Rote Bete', [7, 8, 9, 10, 11], [12, 1, 2, 3, 4]], ['Kürbis', [8, 9, 10, 11], [12, 1, 2]],
  ['Porree', [7, 8, 9, 10, 11, 12, 1, 2, 3]], ['Feldsalat', [10, 11, 12, 1, 2, 3]], ['Pastinaken', [10, 11, 12, 1, 2, 3]],
  ['Rosenkohl', [10, 11, 12, 1, 2]], ['Grünkohl', [11, 12, 1, 2]],
];

// ---------- Daten laden ----------
const { kreise, plz, raster } = ladePlz(join(ROOT, 'data', 'quellen', 'plz-de.csv'));
const osm = existsSync(join(ROOT, 'data', 'osm-eintraege.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data', 'osm-eintraege.json'), 'utf8')) : [];
const manuell = JSON.parse(readFileSync(join(ROOT, 'data', 'manuell.json'), 'utf8'));
// Eigene Pflege (data/pflege.json, siehe scripts/pflege.mjs): geprüfte Änderungen, neue Einträge, Schließungen
const pflege = existsSync(join(ROOT, 'data', 'pflege.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'pflege.json'), 'utf8')) : { aenderungen: {}, neu: {}, geschlossen: {} };
for (const [id, n] of Object.entries(pflege.neu || {})) {
  const { saison, bio, stand, notiz, quelle, ...rest } = n;
  manuell.push({ ...rest, id, ...(saison ? { saisonHinweis: saison } : {}), ...(bio ? { bio: true } : {}), quelle: quelle || null, gepflegt: { art: 'pflege', stand }, geprueft: stand });
}

// Ortsnamen, die sich als Firma/Behörde herausstellen (Filter in lib.mjs), durch den nächsten echten Ort ersetzen
for (const e of osm) {
  if (e.ort || !istOrganisation(e.ortNah)) continue;
  const t = naechsterOrt(raster, e.lat, e.lon);
  if (t) { e.ortNah = t.ort.ort; e.plzNah = t.ort.plz; }
}
const ersetzt = new Set(manuell.map((m) => m.ersetztOsm).filter(Boolean));
const eintraege = osm.filter((e) => !ersetzt.has(e.osm)).map((e) => ({ ...e, quelle: 'osm' }));
for (const m of manuell) {
  const e = { ...m, quelle: 'manuell', quelleUrl: m.quelle };
  if (e.lat == null) {
    const rows = (plz.get(e.plz) || []).filter((r) => !r.org);
    const row = rows.find((r) => r.ort === e.ort) || rows[0];
    if (!row) { console.warn(`Manueller Eintrag ${m.id}: PLZ ${m.plz} unbekannt, übersprungen`); continue; }
    e.lat = row.lat; e.lon = row.lon; e.lageUngefaehr = true;
    e.kreis = row.kreis; e.ortNah = row.ort; e.plzNah = row.plz;
  } else {
    const t = naechsterOrt(raster, e.lat, e.lon);
    e.kreis = t.ort.kreis; e.ortNah = t.ort.ort; e.plzNah = t.ort.plz;
  }
  eintraege.push(e);
}

const HEUTE = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
// Freigegebene Meldungen aus dem Formular (data/betreiber.json, siehe scripts/betreiber-uebernehmen.mjs)
const betreiber = existsSync(join(ROOT, 'data', 'betreiber.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'betreiber.json'), 'utf8')) : {};
const AUTOMAT_ARTEN = ['Milchtankstelle', 'Eierautomat', 'Regiomat', 'Fleischautomat', 'Kartoffelautomat'];
for (const [id, m] of Object.entries(betreiber)) {
  if (m.art !== 'neu') continue;
  const d = m.daten;
  const rows = (plz.get(d.plz) || []).filter((r) => !r.org);
  const row = rows.find((r) => r.ort === d.ort) || rows[0];
  if (!row) { console.warn(`Betreiber-Meldung ${id}: PLZ ${d.plz} unbekannt, übersprungen`); continue; }
  const automat = d.betriebsart && d.betriebsart !== 'Hofladen';
  eintraege.push({ id: `betreiber/${id}`, quelle: 'betreiber', typ: automat ? 'automat' : 'hofladen',
    art: automat ? (AUTOMAT_ARTEN.includes(d.betriebsart) ? d.betriebsart : 'Regiomat') : 'Hofladen',
    name: d.name, strasse: d.strasse || null, plz: d.plz, ort: d.ort || row.ort, ortNah: row.ort, plzNah: row.plz, kreis: row.kreis,
    lat: row.lat, lon: row.lon, lageUngefaehr: true, selbstbedienung: automat || null });
}

const OVERTURE_DATENSATZ = { meta: 'Daten von Meta', BrightQuery: 'Firmendaten von BrightQuery', Foursquare: 'Daten von Foursquare', Microsoft: 'Daten von Microsoft', AllThePlaces: 'AllThePlaces' };
// Quellenangabe auf der Hofseite für Einträge aus offenen Quellen (Lizenz und ggf. Urheber nennen)
function quellenHinweis(e) {
  const a = (url, text) => `<a href="${esc(url)}" rel="nofollow noopener" target="_blank">${esc(text)}</a>`;
  const web = e.webGeprueft ? ` Den Direktverkauf haben wir auf der Website des Hofs geprüft (Stand ${esc(datumDe(e.webGeprueft))}).` : '';
  if (e.quelle === 'overture') return `Quelle: offene Daten der ${a('https://overturemaps.org/', 'Overture Maps Foundation')} (${esc(OVERTURE_DATENSATZ[e.datensatz] || e.datensatz || 'Overture')}, ${esc(e.lizenz || 'CDLA-Permissive-2.0')}).${web}`;
  if (e.quelle === 'foursquare') return `Quelle: ${a('https://opensource.foursquare.com/os-places/', 'Foursquare Open Source Places')} (Apache-2.0).${web}`;
  if (e.quelle === 'kvm') return `Quelle: ${a(e.quelleUrl || 'https://kartevonmorgen.org/', 'Karte von morgen')} (CC0-1.0).${web}`;
  return `Quelle: offene Verwaltungsdaten, ${a(e.quelleUrl || 'https://www.govdata.de/', e.datensatz || 'GovData')}${e.urheber ? `, ${esc(e.urheber)}` : ''} (${esc(e.lizenz || 'CC0-1.0')}).${web}`;
}
// Offene Quellen (data/offene-quellen.json, siehe scripts/import-quellen.mjs): Overture Maps, Foursquare, Karte von morgen
// und offene Verwaltungsdaten. Neue Einträge für Höfe, die in OpenStreetMap fehlen; Doppelungen werden hier noch einmal
// gegen den aktuellen Stand geprüft, damit ein neu in OSM eingetragener Hof den Eintrag aus der offenen Quelle ersetzt.
const offen = existsSync(join(ROOT, 'data', 'offene-quellen.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data', 'offene-quellen.json'), 'utf8')) : { neu: [], ergaenzungen: {}, quellen: {} };
const offenNeu = {}, offenErgaenzt = {}, offenErsetzt = new Map();
{
  const idx = rasterIndex(eintraege);
  for (const o of offen.neu) {
    const quelle = o.quelle || 'overture', qid = o.qid || o.overture;
    if (o.art === 'Solawi' && !solawiOk(o.name)) continue; // auch für ältere Importe: keine Initiativen, Depots, Läden
    // Dieselbe Solawi mit mehreren Abholstellen: nur ein Eintrag (gleicher Name im Umkreis von 30 km)
    const nk = (x) => String(x || '').toLowerCase().replace(/[^a-zäöüß]/g, '');
    const gleicheSolawi = o.art === 'Solawi' && eintraege.find((x) => x.art === 'Solawi' && nk(x.name) === nk(o.name) && distanzKm(x.lat, x.lon, o.lat, o.lon) < 30);
    if (gleicheSolawi) { offenErsetzt.set(`${quelle}/${qid}`, gleicheSolawi.osm || gleicheSolawi.id); continue; }
    const doppelt = idx.nahe(o.lat, o.lon).find((e) => gleicherHof(e, o));
    // Hof ist inzwischen in OSM (oder einer vorrangigen Quelle): alte Seite leitet auf diesen Eintrag weiter
    if (doppelt) { offenErsetzt.set(`${quelle}/${qid}`, doppelt.osm || doppelt.id); for (const a of o.alteIds || []) offenErsetzt.set(a, doppelt.osm || doppelt.id); continue; }
    const e = { ...o, quelle, qid, id: `${quelle}/${qid}`, quelleUrl: o.quelleUrl || QUELLEN[quelle].url };
    eintraege.push(e); idx.add(e); offenNeu[quelle] = (offenNeu[quelle] || 0) + 1;
  }
}
const offenNeuSumme = Object.values(offenNeu).reduce((a, b) => a + b, 0);

// Ergänzungen aus den Websites der Höfe (data/ergaenzungen.json): füllen nur leere Felder,
// damit spätere Angaben in OpenStreetMap immer Vorrang haben.
const ergaenzungen = existsSync(join(ROOT, 'data', 'ergaenzungen.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data', 'ergaenzungen.json'), 'utf8')) : {};
let ergaenztAnzahl = 0;
for (const e of eintraege) {
  const z = ergaenzungen[e.osm || e.id];
  if (!z || !z.quelle) continue;
  const felder = [];
  for (const f of ['website', 'oeffnungszeiten', 'telefon', 'email', 'facebook', 'instagram']) {
    if (z[f] && !e[f]) { e[f] = z[f]; felder.push(f); }
  }
  if (felder.length) { e.ergaenzt = { felder, quellen: [{ felder, quelle: z.quelle, stand: z.stand }] }; ergaenztAnzahl++; }
}

// Recherche-Funde aus öffentlichen Quellen der Höfe, Gemeinden und Tourismusverbände (data/recherche.json,
// siehe scripts/recherche-uebernehmen.mjs): füllen ebenfalls nur leere Felder, je Feld mit eigener Quelle.
// Danach Funde aus dem Impressum der Hof-Websites (data/impressum.json, siehe scripts/impressum-kontakte.mjs), gleiches Format.
const recherche = existsSync(join(ROOT, 'data', 'recherche.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'recherche.json'), 'utf8')) : {};
const impressum = existsSync(join(ROOT, 'data', 'impressum.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'impressum.json'), 'utf8')) : {};
let rechercheAnzahl = 0, impressumAnzahl = 0;
for (const [datei, e] of [recherche, impressum].flatMap((d) => eintraege.map((e) => [d, e]))) {
  const r = datei[e.osm || e.id];
  if (!r?.felder) continue;
  const neu = new Map(); // Quelle → { felder, stand }
  for (const [f, v] of Object.entries(r.felder)) {
    if (f === 'oeffnungszeiten_text' ? (e.oeffnungszeiten || e.oeffnungszeiten_text) : e[f]) continue;
    e[f] = v.wert;
    const q = neu.get(v.quelle) || { felder: [], quelle: v.quelle, stand: v.stand };
    q.felder.push(f === 'oeffnungszeiten_text' ? 'oeffnungszeiten' : f);
    neu.set(v.quelle, q);
  }
  if (!neu.size) continue;
  e.ergaenzt ??= { felder: [], quellen: [] };
  for (const q of neu.values()) { e.ergaenzt.felder.push(...q.felder); e.ergaenzt.quellen.push(q); }
  if (datei === impressum) impressumAnzahl++; else rechercheAnzahl++;
}

// Kontaktdaten, Adressen und Öffnungszeiten (Text) aus offenen Quellen für OSM-Einträge: ebenfalls nur leere Felder
for (const e of eintraege) {
  const z = e.osm && offen.ergaenzungen[e.osm];
  if (!z) continue;
  const quellen = z.quellen || Object.fromEntries(['telefon', 'website', 'email', 'facebook', 'instagram', 'strasse'].filter((f) => z[f]).map((f) => [f, 'overture']));
  const proQuelle = new Map();
  for (const [f, q] of Object.entries(quellen)) {
    if (f === 'oeffnungszeiten_text' ? (e.oeffnungszeiten || e.oeffnungszeiten_text) : e[f]) continue;
    e[f] = z[f];
    if (f === 'strasse') { e.plz ||= z.plz; e.ort ||= z.ort; }
    if (!proQuelle.has(q)) proQuelle.set(q, []);
    proQuelle.get(q).push(f === 'oeffnungszeiten_text' ? 'oeffnungszeiten' : f);
  }
  if (!proQuelle.size) continue;
  e.ergaenzt ??= { felder: [], quellen: [] };
  for (const [q, felder] of proQuelle) {
    e.ergaenzt.felder.push(...felder);
    e.ergaenzt.quellen.push({ felder, quelle: QUELLEN[q].url, stand: offen.stand });
    offenErgaenzt[q] = (offenErgaenzt[q] || 0) + 1;
  }
}
const offenErgaenztSumme = Object.values(offenErgaenzt).reduce((a, b) => a + b, 0);

// Eigene Pflege: Änderungen je stabiler ID; Vorrang vor OSM und Ergänzungen, Angaben der Betriebe kommen danach
let pflegeAnzahl = 0;
{
  const archiv = existsSync(join(ROOT, 'data', 'seiten-stand.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'seiten-stand.json'), 'utf8')).ersetzt || {} : {};
  const weiter = new Map(Object.entries(archiv).map(([a, n]) => [stabileIdAus(a), stabileIdAus(n)]));
  const nachSid = new Map(eintraege.map((e) => [stabileIdAus(e.osm || e.id), e]));
  for (const [sid, a] of Object.entries(pflege.aenderungen || {})) {
    let ziel = sid;
    for (let n = 0; !nachSid.has(ziel) && weiter.has(ziel) && n < 5; n++) ziel = weiter.get(ziel);
    const e = nachSid.get(ziel);
    if (!e) { console.warn(`Pflege: Eintrag ${sid} nicht gefunden`); continue; }
    felderAnwenden(e, a.felder || {}, a.stand);
    if (a.felder?.lat != null) { const t = naechsterOrt(raster, e.lat, e.lon); if (t) { e.kreis = t.ort.kreis; e.ortNah = t.ort.ort; e.plzNah = t.ort.plz; } }
    pflegeAnzahl++;
  }
}

// Angaben von Betreibern und geprüften Korrekturen haben Vorrang vor OSM
{
  const hoefeIds = existsSync(join(ROOT, 'data', 'seiten-stand.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'seiten-stand.json'), 'utf8')).hoefe : {};
  const nachId = new Map(eintraege.map((e) => [e.osm || e.id, e]));
  for (const [id, m] of Object.entries(betreiber)) {
    const e = m.art === 'neu' ? nachId.get(`betreiber/${id}`)
      : (m.daten?.eintrag && [...nachId.values()].find((x) => stabileIdAus(x.osm || x.id) === m.daten.eintrag)) || nachId.get(hoefeIds[m.hof]);
    if (!e) { if (m.art !== 'neu') console.warn(`Betreiber-Meldung ${id}: Eintrag ${m.hof} nicht gefunden`); continue; }
    const d = m.daten;
    for (const f of ['name', 'strasse', 'plz', 'ort', 'telefon', 'email', 'website', 'oeffnungszeiten', 'beschreibung']) if (d[f]) e[f] = d[f];
    if (d.oeffnungszeiten) e.oeffnungszeiten_text = null;
    if (d.saison) e.saisonHinweis = d.saison;
    if (d.bio) e.bio = true;
    if (d.zahlung) e.zahlung = d.zahlung;
    if (d.angebot) e.betreiberAngebot = d.angebot;
    if (Array.isArray(d.urlaub)) e.urlaub = d.urlaub.filter((u) => u.bis >= HEUTE);
    // Feld für Feld: welche Angabe stammt vom Betrieb, Stand wann
    e.vomBetrieb ??= {};
    for (const f of ['name', 'strasse', 'telefon', 'email', 'website', 'oeffnungszeiten', 'beschreibung', 'angebot', 'zahlung', 'saison']) if (d[f]) e.vomBetrieb[f] = m.stand;
    if (m.fotos?.length) e.fotos = [...(e.fotos || []), ...m.fotos];
    e.gepflegt = { art: m.art, stand: m.stand };
    e.geprueft = m.stand > (e.geprueft || '') ? m.stand : e.geprueft;
    if (e.ergaenzt) {
      e.ergaenzt.felder = e.ergaenzt.felder.filter((f) => !d[f]);
      for (const q of e.ergaenzt.quellen) q.felder = q.felder.filter((f) => !d[f]);
      e.ergaenzt.quellen = e.ergaenzt.quellen.filter((q) => q.felder.length);
      if (!e.ergaenzt.felder.length) e.ergaenzt = null;
    }
  }
}

// Bereinigung (scripts/bereinigen.mjs): eindeutige Feldfehler, Typ aus eindeutigem Namen, Lage von Fremdquellen,
// sichere Dopplungen (Verlierer fällt weg, alte Adresse leitet per 301 auf den Gewinner weiter)
const bereinigt = { felder: 0, typ: 0, lage: 0, dubletten: 0 };
for (const e of eintraege) {
  if (felderBereinigen(e).length) bereinigt.felder++;
  const art = !e.vomBetrieb && automatArtAusName(e);
  if (art) { e.typ = 'automat'; e.art = art; e.selbstbedienung = true; bereinigt.typ++; }
  // Offene Quellen: Koordinaten mehr als 30 km von der eigenen PLZ entfernt → Ort der PLZ (ungefähre Lage)
  if (e.quelle !== 'osm' && !e.vomBetrieb && /^\d{5}$/.test(e.plz || '') && !e.lageUngefaehr) {
    const rows = (plz.get(e.plz) || []).filter((r) => !r.org);
    if (rows.length && Math.min(...rows.map((r) => distanzKm(r.lat, r.lon, e.lat, e.lon))) > 30) {
      const row = rows.find((r) => r.ort === e.ort) || rows[0];
      Object.assign(e, { lat: row.lat, lon: row.lon, lageUngefaehr: true, kreis: row.kreis, ortNah: row.ort, plzNah: row.plz });
      bereinigt.lage++;
    }
  }
}
const dubletten = dublettenFinden(eintraege);
if (process.env.DUBLETTEN_EXPORT) writeFileSync(process.env.DUBLETTEN_EXPORT, JSON.stringify(dubletten.map(([v, g]) => [v, g].map((e) => ({ id: e.osm || e.id, quelle: e.quelle, art: e.art, name: e.name, strasse: e.strasse, telefon: e.telefon, website: e.website, lat: e.lat, lon: e.lon, ort: e.ort || e.ortNah }))), null, 1));
for (const [ver, gew] of dubletten) {
  eintraege.splice(eintraege.indexOf(ver), 1);
  offenErsetzt.set(ver.osm || ver.id, gew.osm || gew.id);
  for (const a of ver.alteIds || []) offenErsetzt.set(a, gew.osm || gew.id);
  bereinigt.dubletten++;
}
console.log(`Bereinigung: ${JSON.stringify(bereinigt)}`);

// Namen aufräumen: Emojis raus, GROSSSCHRIFT in normale Schreibweise (Rechtsformen richtig geschrieben)
const RECHTSFORM = { GMBH: 'GmbH', GBR: 'GbR', KG: 'KG', OHG: 'OHG', EG: 'eG', 'E.V.': 'e.V.', AG: 'AG', UG: 'UG', 'CO.': 'Co.', 'MBH': 'mbH' };
function schoenerName(n) {
  if (!n) return n;
  let x = String(n).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
  x = x.replace(/[A-Za-zÄÖÜäöüß.]+/g, (w) => {
    if (RECHTSFORM[w.toUpperCase()]) return /^[A-ZÄÖÜ.]+$/.test(w) ? RECHTSFORM[w.toUpperCase()] : w;
    return w.length >= 4 && /^[A-ZÄÖÜß]+$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w;
  });
  return x || n;
}
// Telefon: Vorsätze wie „Tel.:“ entfernen, bei mehreren Nummern die erste, zu kurze verwerfen
function telefonSauber(t) {
  if (!t) return t;
  const x = String(t).replace(/^(tel(efon)?\.?|fon|phone|mobil)\s*(&\s*fax)?\s*:?\s*/i, '').split(/\s*[,;]\s*|\s+oder\s+/)[0].trim();
  return x.replace(/\D/g, '').length >= 6 ? x : null;
}
// Anzeige-Felder und eindeutige Slugs
for (const e of eintraege) {
  e.ortAnzeige = e.ort || e.ortNah;
  // Generische Namen ("Hofladen", "Regiomat", "Eier-Automat" …) bekommen den Ort dazu, damit Titel eindeutig und suchbar sind
  e.name = schoenerName(e.name);
  e.telefon = telefonSauber(e.telefon);
  const n = (e.name || '').trim();
  const generisch = /^(der |die |das )?(hof-?laden|hoflädchen|bauern-?laden|hofverkauf|regio-?mat|regio-?box|milch-?tankstelle|milch-?automat|frischmilch-?automat|milchhäusle|eier-?automat|eierhäusle|eier|kartoffeln|kartoffel-?kiste|lebensmittel-?automat|verkaufs-?automat|wurst-?automat|grillfleisch-?automat|honig-?automat|frische-?automat|schlemmerbox|direktvermarktung|selbstbedienung|bauernhof|mühlenladen)$/i.test(n);
  e.titel = !n ? `${e.art} in ${e.ortAnzeige}` : generisch ? `${n} in ${e.ortAnzeige}` : n;
  e.k = kreise.get(e.kreis);
}
const slugZaehler = new Map();
for (const e of eintraege.sort((a, b) => (a.osm || a.id).localeCompare(b.osm || b.id, 'en', { numeric: true }))) {
  let s = slugify(e.name ? `${e.name}-${e.ortAnzeige}` : `${e.art}-${e.ortAnzeige}`).slice(0, 80).replace(/-+$/, '');
  if (e.name && slugify(e.name).includes(slugify(e.ortAnzeige))) s = slugify(e.name).slice(0, 80);
  const n = (slugZaehler.get(s) || 0) + 1;
  slugZaehler.set(s, n);
  e.slug = n > 1 ? `${s}-${n}` : s;
  e.pfad = `/hof/${e.slug}/`;
}

// Stabile ID je Eintrag: ändert sich nie, auch wenn sich Name oder Slug ändern.
// OSM: n123/w123/r123, Betreiber-Einträge: b<Meldung>, offene Quellen: o-/f-/k-/g-<ID> (Overture, Foursquare,
// Karte von morgen, Verwaltungsdaten), manuelle Einträge: m-<id>
for (const e of eintraege) e.sid = stabileIdAus(e.osm || e.id);

// Ein-Klick-Rückmeldungen (data/rueckmeldungen.json, täglich aus der Verwaltung): bestätigte Schließungen entfernen
// (Seite liefert danach 410), Datum der letzten Prüfung je Eintrag aus OSM-Prüfdatum, Betreiber, Besuchern und Website-Prüfung
const rueck = existsSync(join(ROOT, 'data', 'rueckmeldungen.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data', 'rueckmeldungen.json'), 'utf8')) : { bestaetigt: {}, geschlossen: {}, gemeldet: {} };
let geschlossenAnzahl = 0;
for (let i = eintraege.length - 1; i >= 0; i--) if (rueck.geschlossen?.[eintraege[i].sid] || pflege.geschlossen?.[eintraege[i].sid]) { eintraege.splice(i, 1); geschlossenAnzahl++; }
for (const e of eintraege) {
  const kand = [];
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(e.geprueft || '') && !e.gepflegt) kand.push([e.geprueft.length === 7 ? `${e.geprueft}-01` : e.geprueft, 'vor Ort geprüft (laut OpenStreetMap)']);
  if (e.gepflegt?.stand) kand.push([e.gepflegt.stand, e.gepflegt.art === 'uebernahme' ? 'vom Betrieb bestätigt' : 'von uns geprüft und ergänzt']);
  const b = rueck.bestaetigt?.[e.sid];
  if (b) kand.push([b.tag, b.anzahl > 1 ? `bestätigt von ${b.anzahl} Besucherinnen und Besuchern` : 'bestätigt von einer Besucherin oder einem Besucher', 'besuch']);
  if (e.webGeprueft) kand.push([e.webGeprueft, 'auf der Website des Hofs geprüft']);
  kand.sort((x, y) => y[0].localeCompare(x[0]));
  e.letztePruefung = kand[0] ? { tag: kand[0][0], wie: kand[0][1], besuch: kand[0][2] === 'besuch' } : null;
  e.geschlossenGemeldet = rueck.gemeldet?.[e.sid]?.anzahl || 0;
}

// Gruppierung nach Kreis und Land
const proKreis = new Map();
for (const e of eintraege) {
  if (!proKreis.has(e.kreis)) proKreis.set(e.kreis, []);
  proKreis.get(e.kreis).push(e);
}
const laender = Object.entries(BUNDESLAENDER).map(([code, name]) => {
  const ks = [...kreise.values()].filter((k) => k.land === code)
    .sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  return { code, name, slug: slugify(name), kreise: ks,
    anzahl: ks.reduce((s, k) => s + (proKreis.get(k.code)?.length || 0), 0) };
});
// Kreis-Mittelpunkte (Mittel der PLZ-Orte) für Nachbarkreise
const kreisMitte = new Map();
for (const rows of plz.values()) for (const r of rows) {
  const m = kreisMitte.get(r.kreis) || { lat: 0, lon: 0, n: 0 };
  m.lat += r.lat; m.lon += r.lon; m.n++; kreisMitte.set(r.kreis, m);
}
for (const m of kreisMitte.values()) { m.lat /= m.n; m.lon /= m.n; }

// Räumliches Raster für "in der Nähe"
const raster2 = new Map();
for (const e of eintraege) {
  const key = Math.floor(e.lat * 5) + ':' + Math.floor(e.lon * 5);
  if (!raster2.has(key)) raster2.set(key, []);
  raster2.get(key).push(e);
}
// Öffnungszeiten in einer Zeile, z. B. für „Am selben Hof“
function zeitenKurz(x) {
  const w = wocheVon(x);
  if (w && istRund(w)) return 'rund um die Uhr';
  const z = x.oeffnungszeiten && zeilen(x.oeffnungszeiten);
  if (z) return z.map(([t, v]) => `${t} ${v}`).join(', ');
  return x.oeffnungszeiten_text || (x.oeffnungszeiten ? uebersetze(x.oeffnungszeiten) : 'Zeiten nicht hinterlegt');
}
function inDerNaehe(e, n = 6) {
  const la = Math.floor(e.lat * 5), lo = Math.floor(e.lon * 5), kand = [];
  for (let i = la - 1; i <= la + 1; i++) for (let j = lo - 1; j <= lo + 1; j++)
    for (const x of raster2.get(i + ':' + j) || []) if (x !== e) kand.push([distanzKm(e.lat, e.lon, x.lat, x.lon), x]);
  return kand.sort((a, b) => a[0] - b[0]).slice(0, n).filter(([d]) => d <= 30);
}

// ---------- Produkt-Kategorien (aus OSM-Angaben und Namen abgeleitet) ----------
const KAT_REGELN = [
  ['eier', /\beggs?\b|\beier|\bei\b|hühner|huehner|geflügel|gefluegel|legehenne/i],
  ['milch', /\bmilk\b|milch|molkerei|joghurt|\bdairy/i],
  ['kaese', /cheese|käse|kaese/i],
  ['fleisch', /\bmeat\b|sausage|fleisch|wurst|metzger|schlacht|\brind|weiderind|schwein|\blamm|\bwild\b|wildhandel|galloway|angus|geflügel|gefluegel|hähnchen|puten|\bgans\b|gänse/i],
  ['gemuese', /vegetable|gemüse|gemuese|spargel|asparagus|salat|gärtnerei|gaertnerei|tomate|kürbis|kuerbis|pumpkin/i],
  ['obst', /fruit|\bobst|apfel|äpfel|aepfel|apple|erdbeer|strawberr|kirsch|beere|berry|pflaume|zwetsch|birne/i],
  ['kartoffeln', /potato|kartoffel/i],
  ['honig', /honey|honig|imker/i],
  ['brot', /bread|\bbrot|bäcker|baecker|backwaren|bakery|backhaus/i],
  ['getraenke', /juice|saft|\bwein|weingut|winzer|\bmost\b|wine|cider/i],
  ['blumen', /flower|blumen|tulpen|sonnenblume/i],
  ['weihnachtsbaeume', /christmas.?trees?|weihnachtsb(a|ä)um|christb(a|ä)um|tannenb(a|ä)um|nordmanntanne|weihnachtstanne|christbaummarkt/i],
  ['gefluegel', /geflügel|gefluegel|poultry|chicken|hähnchen|haehnchen|hühnchen|puten|\bgans\b|gänse|gaense|\benten\b|wachtel/i],
  ['wild', /\bwild\b|wildfleisch|wildhandel|wildbret|venison|\bgame\b|hirsch|\breh\b|wildschwein/i],
  ['fisch', /\bfish\b|\bfisch\b|fischzucht|fischerei|fischhof|räucherfisch|raeucherfisch|forelle|karpfen|saibling|teichwirtschaft|aquakultur/i],
  ['nudeln', /nudel|noodle|\bpasta\b|teigwaren|spätzle|spaetzle/i],
  ['marmelade', /marmelade|konfitüre|konfituere|\bjam\b|fruchtaufstrich|\bgelee/i],
  ['tierfutter', /tierfutter|pferdefutter|futtermittel|hundefutter|animal.?feed|\bheu\b|\bhay\b|\bstroh\b/i],
];
// Ausflugs-Merkmale (aus OSM-Tags oder vom Betrieb) als kurze Texte
const AUSSTATTUNG = [
  ['rollstuhl', (v) => ({ yes: 'rollstuhlgerecht', limited: 'teilweise rollstuhlgerecht', no: 'nicht rollstuhlgerecht' }[v])],
  ['hofcafe', () => 'Hofcafé'], ['selbstpfluecken', () => 'Selbstpflücken'], ['spielplatz', () => 'Spielplatz'], ['tiere', () => 'Tiere zum Anschauen'],
  ['sitzen', () => 'Sitzplätze'], ['toilette', () => 'Toilette'], ['parkplatz', () => 'Parkplatz'],
  ['hunde', (v) => (v === 'no' ? 'keine Hunde' : 'Hunde erlaubt')], ['lieferung', () => 'Lieferung oder Online-Shop'],
];
const ausstattung = (e) => AUSSTATTUNG.map(([k, f]) => e.merkmale?.[k] != null && f(e.merkmale[k])).filter(Boolean);
const mitKindern = (e) => !!(e.merkmale?.spielplatz || e.merkmale?.tiere || e.merkmale?.hofcafe || e.merkmale?.selbstpfluecken);
const ART_KAT = { Milchtankstelle: ['milch'], Eierautomat: ['eier'], Fleischautomat: ['fleisch'], Kartoffelautomat: ['kartoffeln'], Honigautomat: ['honig'], Nudelautomat: ['nudeln'], Imkerei: ['honig'] };
for (const e of eintraege) {
  const text = [e.name, e.betreiber, e.beschreibung, ...(e.produkte || [])].filter(Boolean).join(' ');
  const kat = new Set(ART_KAT[e.art] || []);
  for (const [k, re] of KAT_REGELN) if (re.test(text)) kat.add(k);
  e.kat = Object.keys(KATEGORIEN).filter((k) => (e.betreiberAngebot ? e.betreiberAngebot.includes(k) : kat.has(k)));
  e.adresse = [e.strasse, [e.plz, e.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || `bei ${e.ortNah} (${e.plzNah})`;
  const w = e.oeffnungszeiten ? parse(e.oeffnungszeiten) : null;
  e.sonntag = !!(w && w[6].length);
  // Dünne Einträge (kein Name, keine Zeiten, kein Kontakt, kein Angebot): Seite bleibt erreichbar, aber noindex
  e.duenn = !e.name && !e.oeffnungszeiten && !e.oeffnungszeiten_text && !e.telefon && !e.website && !e.email && !e.kat.length;
}

// ---------- Vollständigkeit eines Eintrags (für Formular, Outreach und Betreiber) ----------
const VOLLSTAENDIGKEIT = [
  ['name', 'Name', (e) => !!e.name],
  ['adresse', 'Adresse', (e) => !!(e.strasse && e.plz)],
  ['telefon', 'Telefon', (e) => !!e.telefon],
  ['online', 'Website oder E-Mail', (e) => !!(e.website || e.email)],
  ['zeiten', 'Öffnungszeiten', (e) => !!(e.oeffnungszeiten || e.oeffnungszeiten_text)],
  ['angebot', 'Sortiment', (e) => !!e.kat.length],
  ['bezahlen', 'Bezahlen', (e) => !!e.zahlung?.length],
  ['beschreibung', 'Beschreibung', (e) => !!e.beschreibung],
  ['fotos', 'Fotos', (e) => !!e.fotos?.length],
];
for (const e of eintraege) {
  const fehlt = VOLLSTAENDIGKEIT.filter(([, , ok]) => !ok(e)).map(([k]) => k);
  e.vollst = { prozent: Math.round(100 * (VOLLSTAENDIGKEIT.length - fehlt.length) / VOLLSTAENDIGKEIT.length), fehlt };
}
// Nächste Haltestelle (OSM, data/haltestellen.json) im Umkreis von 1 km, Luftlinie
// data/haltestellen.json: { "lat,lon" (4 Nachkommastellen): [Name, Art, Meter] } aus scripts/fetch-haltestellen.mjs
const HALTE_ROH = existsSync(join(ROOT, 'data', 'haltestellen.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'haltestellen.json'), 'utf8')) : {};
const HALTESTELLEN = Array.isArray(HALTE_ROH) ? HALTE_ROH.map(([lat, lon, name, art]) => ({ lat, lon, name, art })) : [];
if (!Array.isArray(HALTE_ROH)) for (const e of eintraege) {
  const h = HALTE_ROH[`${(+e.lat).toFixed(4)},${(+e.lon).toFixed(4)}`];
  if (h) e.haltestelle = { name: h[0], art: h[1], m: h[2] };
}
{
  const idx = rasterIndex(HALTESTELLEN);
  for (const e of eintraege) {
    let best = null;
    for (const h of idx.nahe(e.lat, e.lon)) {
      const d = distanzKm(e.lat, e.lon, h.lat, h.lon);
      // Bahnhöfe zählen etwas mehr: bei ähnlicher Entfernung lieber Bahn als Bus
      const wert = d - (h.art === 'bahn' ? 0.15 : 0);
      if (d <= 1 && (!best || wert < best.wert)) best = { name: h.name, art: h.art, m: Math.round(d * 1000 / 10) * 10, wert };
    }
    if (best) { delete best.wert; e.haltestelle = best; }
  }
}
const HALTE_ART = { bus: 'Bus', tram: 'Straßenbahn', bahn: 'Bahn' };

// ---------- HTML-Helfer ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telHref = (t) => 'tel:' + t.replace(/[^\d+]/g, '').replace(/^00/, '+');
const kurz = (u) => { let t = u; try { const x = new URL(u); t = domainToUnicode(x.hostname) + x.pathname + x.search; } catch {} return t.replace(/^www\./, '').replace(/\/$/, ''); };
const zahl = (n) => n.toLocaleString('de-DE');
const plural = (n, s, p) => `${zahl(n)} ${n === 1 ? s : p}`;
const KARTENZAHLUNG = ['girocard', 'kreditkarte', 'kontaktlos'];
const KAT_CODES_KARTE = Object.keys(KATEGORIEN);
const kartenDaten = (e, km) => ({ pfad: e.pfad, slug: e.slug, titel: e.titel, art: e.art, typ: e.typ, adresse: e.adresse, land: e.k?.land,
  karte: !!e.zahlung?.some((z) => KARTENZAHLUNG.includes(z)),
  oh: e.oeffnungszeiten, ohText: e.oeffnungszeiten_text, telefon: e.telefon, website: e.website, kat: e.kat,
  urlaub: e.urlaub?.length ? e.urlaub.map((u) => `${u.von}/${u.bis}`).join(' ') : null,
  lat: e.lat, lon: e.lon, bio: e.bio, verband: e.verband?.[0] || null, kinder: mitKindern(e), oepnv: !!e.haltestelle, km });

const SUCHFELD = 'type="search" maxlength="60" autocomplete="off" list="orte-vorschlaege" enterkeyhint="search"';
const LOGO = `<svg class="logo-mark" viewBox="0 0 64 64" width="34" height="34" aria-hidden="true"><path d="M32 3C19 3 8.5 13.3 8.5 26.2 8.5 43.4 32 61 32 61s23.5-17.6 23.5-34.8C55.5 13.3 45 3 32 3z" fill="#F4C430"/><g fill="#173B2C"><rect x="30.4" y="21" width="3.2" height="27" rx="1.6"/><ellipse cx="32" cy="15.6" rx="3.5" ry="6"/><ellipse cx="25.9" cy="25.4" rx="3.2" ry="5.8" transform="rotate(-38 25.9 25.4)"/><ellipse cx="38.1" cy="25.4" rx="3.2" ry="5.8" transform="rotate(38 38.1 25.4)"/><ellipse cx="25.9" cy="35.4" rx="3.2" ry="5.8" transform="rotate(-38 25.9 35.4)"/><ellipse cx="38.1" cy="35.4" rx="3.2" ry="5.8" transform="rotate(38 38.1 35.4)"/></g></svg>`;

// Seitentyp für die Nutzungsstatistik
const NATIONALE_KATEGORIEN = new Set(['/milchtankstelle/', '/eierautomat/', '/regiomat/', '/hofladen-automaten/', '/bio-hofladen/', '/sonntags-geoeffnet/']);
function seitenTyp(p) {
  if (p === '/') return 'start';
  if (p.startsWith('/hof/')) return 'hof';
  if (p.startsWith('/saisonkalender/')) return 'saison';
  if (p.startsWith('/angebot/') || NATIONALE_KATEGORIEN.has(p) || (typeof KATEGORIE_PFADE !== 'undefined' && KATEGORIE_PFADE.has(p))) return 'kategorie';
  if (/^\/[^/]+\/[^/]+\/[^/]+\/$/.test(p)) return 'ort';
  if (/^\/[^/]+\/([^/]+\/)?$/.test(p) && laender.some((l) => p.startsWith(`/${l.slug}/`))) return 'kreis';
  return 'sonstige';
}
// Inhalts-Hash je Seite (ohne Kopf/Fuß/Build-Version) – daraus entsteht das echte lastmod der Sitemap
const SEITEN_HASH = new Map();
const hash = (x) => createHash('sha1').update(x).digest('base64url').slice(0, 10);
// Ratgeber-Artikel, die auf eine Seite verweisen, werden dort unten verlinkt
const RATGEBER_FUER = new Map();
for (const a of RATGEBER) for (const [p] of a.links) RATGEBER_FUER.set(p, [...(RATGEBER_FUER.get(p) || []), a]);
const ratgeberHinweis = (pfad) => {
  const as = RATGEBER_FUER.get(pfad);
  return as ? `<aside class="abschnitt ratgeber-hinweis" aria-label="Ratgeber"><h2>Aus dem Ratgeber</h2><ul>${as.map((a) => `<li><a href="/ratgeber/${a.slug}/">${esc(a.titel)}</a></li>`).join('')}</ul></aside>` : '';
};
// Interne Links mit Parametern (z. B. /fuer-hoefe/?eintrag=…) sind Funktionen, keine Seiten: nofollow.
// Ausnahme: Bearbeiten-Links /mitmachen/?… bleiben folgbar (Ziel ist noindex mit Canonical auf /mitmachen/).
const nofollowParameter = (html) => html.replace(/<a ([^>]*?)href="(\/[^"#]*\?[^"]*)"([^>]*)>/g, (m, vor, href, nach) => /\brel=/.test(vor + nach) || href.startsWith('/mitmachen/') ? m : `<a ${vor}href="${href}" rel="nofollow"${nach}>`);
function seite({ titel, beschreibung, pfad, inhalt, noindex = false, jsonld = [], krumen = [], klasse = '', kopfSuche = true }) {
  inhalt += ratgeberHinweis(pfad);
  SEITEN_HASH.set(pfad, hash([titel, beschreibung, noindex, JSON.stringify(jsonld), JSON.stringify(krumen), inhalt.replace(/\?v=[a-z0-9]+/g, '')].join('\u0000')));
  const url = cfg.domain + pfad;
  const bc = krumen.length ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [['Start', '/'], ...krumen].map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: cfg.domain + p })) }] : [];
  return nofollowParameter(`<!doctype html>
<html lang="de"${GA_ID ? ` data-ga="${GA_ID}"` : ''}${KACHELN ? ` data-kacheln="${KACHELN.version}" data-kacheln-z="${KACHELN.maxzoom || 14}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titelMitMarke(titel))}</title>
<meta name="description" content="${esc(kuerzeBeschreibung(beschreibung))}">
<link rel="canonical" href="${esc(url)}">
${noindex ? '<meta name="robots" content="noindex, follow">\n' : ''}<meta property="og:title" content="${esc(titel.replace(/\s*\|\s*Hofladenliste\s*$/, ''))}">
<meta property="og:description" content="${esc(kuerzeBeschreibung(beschreibung))}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta name="theme-color" content="#173B2C">
<link rel="icon" href="/favicon.ico?v=${ICON_VERSION}" sizes="48x48">
<link rel="icon" href="/favicon.svg?v=${ICON_VERSION}" type="image/svg+xml">
<link rel="icon" href="/favicon-96.png?v=${ICON_VERSION}" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${ICON_VERSION}">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:image" content="${cfg.domain}/og-bild.png?v=${ICON_VERSION}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="Hofladenliste">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="/fonts/zilla-slab-bold.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="/fonts/atkinson-next.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="/style.css?v=${VERSION}">
${[...bc, ...jsonld].map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body class="${klasse}" data-seite="${seitenTyp(pfad)}">
${PRODUKT_SPRITE}
<a class="sprung" href="#inhalt">Zum Inhalt</a>
<header class="kopf"><div class="kopf-innen">
  <a class="logo" href="/">${LOGO}<span>Hofladenliste</span></a>
  <nav class="kopf-nav" aria-label="Hauptnavigation">
    <a href="/karte/"${pfad === '/karte/' ? ' aria-current="page"' : ''}>Karte</a>
    <a href="/saisonkalender/"${pfad === '/saisonkalender/' ? ' aria-current="page"' : ''}>Saisonkalender</a>
    <a href="/merkliste/"${pfad === '/merkliste/' ? ' aria-current="page"' : ''}>${ICON.herz}Merkliste<span class="merk-zahl" hidden></span></a>
    <a class="nav-optional" href="/mitmachen/"${pfad === '/mitmachen/' ? ' aria-current="page"' : ''}>Hof eintragen</a>
  </nav>
  ${kopfSuche ? `<form class="kopf-suche" action="/suche" method="get" role="search">
    <label class="sr" for="kopf-plz">Postleitzahl, Ort oder Name des Hofs</label>
    <input id="kopf-plz" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required>
    <button type="submit">Suchen</button>
  </form>` : ''}
</div></header>
${krumen.length ? `<nav class="krumen" aria-label="Brotkrümel"><a href="/">Start</a>${krumen.map(([n, p], i) => i === krumen.length - 1 ? `<span aria-current="page">${esc(n)}</span>` : `<a href="${esc(p)}">${esc(n)}</a>`).join('')}</nav>` : ''}
<main id="inhalt">
${inhalt}
</main>
<footer class="fuss"><div class="fuss-innen">
  <div>
    <p class="fuss-logo">${LOGO}<span>Hofladenliste</span></p>
    <p>Hofläden, Milchtankstellen und Hofautomaten in ganz Deutschland. Alle Angaben ohne Gewähr – Öffnungszeiten ändern sich, besonders saisonal.</p>
  </div>
  <ul class="fuss-links">
    <li><a href="/karte/">Hofladen-Karte</a></li>
    <li><a href="/milchtankstelle/">Milchtankstelle in der Nähe</a></li>
    <li><a href="/eierautomat/">Eierautomat in der Nähe</a></li>
    <li><a href="/regiomat/">Regiomat in der Nähe</a></li>
    <li><a href="/hofladen-automaten/">Hofladen-Automaten</a></li>
    <li><a href="/angebot/">Angebot vom Hof</a></li>
    <li><a href="/sonntags-geoeffnet/">Sonntags geöffnete Höfe</a></li>
    <li><a href="/bio-hofladen/">Bio-Hofladen in der Nähe</a></li>
    <li><a href="/saisonkalender/">Saisonkalender Obst &amp; Gemüse</a></li>
    <li><a href="/saison-benachrichtigung/">Saison-Benachrichtigung</a></li>
    <li><a href="/ratgeber/">Ratgeber</a></li>
    <li><a href="/mitmachen/">Hofladen eintragen</a></li>
    <li><a href="/fuer-hoefe/">Für Höfe</a></li>
    <li><a href="/wochenmaerkte/">Wochen- &amp; Bauernmärkte</a></li>
    <li><a href="/veranstaltungen/">Hoffeste &amp; Termine</a></li>
    <li><a href="/route/">Höfe entlang der Route</a></li>
    <li><a href="/ueber-uns/">Über uns</a></li>
    <li><a href="/kontakt/">Kontakt</a></li>
    <li><a href="/presse/">Presse</a></li>
    <li><a href="/statistik/">Datenstand &amp; Statistik</a></li>
    <li><a href="/quellen/">Quellen</a></li>
    <li><a href="/impressum/">Impressum</a></li>
    <li><a href="/datenschutz/">Datenschutz</a></li>${GA_ID ? `
    <li><button type="button" class="link-knopf" data-cookie-einstellungen hidden>Cookie-Einstellungen</button></li>` : ''}
  </ul>
  <p class="fuss-quelle">Daten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a> (ODbL) und <a href="/quellen/">weitere offene Quellen</a>, PLZ-Daten <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0). Stand ${BUILD_DATUM.split('-').reverse().join('.')}.</p>
</div></footer>
<datalist id="orte-vorschlaege"></datalist>
<script type="module" src="/app.js?v=${VERSION}"></script>
</body>
</html>
`);
}

function kartenPanel({ titel = 'Karte', hinweis = KACHELN ? 'Die Karte kommt von unserem eigenen Server, ohne Anfragen an Dritte. Kartendaten © OpenStreetMap-Mitwirkende.' : 'Die Karte lädt Kartenbilder von OpenStreetMap. Dabei wird deine IP-Adresse an die OpenStreetMap Foundation übertragen.' } = {}) {
  return `<div class="kartenpanel" data-karte>
  <div class="karte-flaeche" role="region" aria-label="${esc(titel)}"></div>
  <div class="karte-zustimmung">
    <p><b>Karte anzeigen?</b> ${esc(hinweis)}</p>
    <button type="button" class="knopf" data-karte-laden>Karte laden</button>
    <label class="merken"><input type="checkbox" data-karte-merken checked> Für diese Website merken</label>
  </div>
</div>`;
}

function filterLeiste(liste, { umkreis = null } = {}) {
  const nRund = liste.filter((e) => istRund(wocheVon(e))).length;
  const nHof = liste.filter((e) => e.typ === 'hofladen').length;
  const nAut = liste.length - nHof;
  const nSo = liste.filter((e) => e.sonntag).length;
  const nBio = liste.filter((e) => e.bio).length;
  const nKarte = liste.filter((e) => e.zahlung?.some((z) => KARTENZAHLUNG.includes(z))).length;
  const nKinder = liste.filter(mitKindern).length;
  const nOepnv = liste.filter((e) => e.haltestelle).length;
  const katZahl = new Map();
  for (const e of liste) for (const k of e.kat) katZahl.set(k, (katZahl.get(k) || 0) + 1);
  const kats = Object.keys(KATEGORIEN).filter((k) => katZahl.get(k));
  return `<div class="werkzeug" role="group" aria-label="Filter">
  ${umkreis ? `<div class="segment umkreis" role="radiogroup" aria-label="Umkreis">${umkreis.map(([r, n], i) => `<button type="button" data-radius-filter="${r}" aria-pressed="${i === umkreis.length - 1}">${r} km <span>${n}</span></button>`).join('')}</div>` : ''}
  <div class="segment" role="radiogroup" aria-label="Art">
    <button type="button" data-typ-filter="alle" aria-pressed="true">Alle <span>${liste.length}</span></button>
    ${nHof ? `<button type="button" data-typ-filter="hofladen" aria-pressed="false">Hofläden <span>${nHof}</span></button>` : ''}
    ${nAut ? `<button type="button" data-typ-filter="automat" aria-pressed="false">Automaten <span>${nAut}</span></button>` : ''}
  </div>
  <button type="button" class="umschalter" data-offen-filter aria-pressed="false">Jetzt geöffnet</button>
  ${nSo ? `<button type="button" class="umschalter" data-sonntag-filter aria-pressed="false">Sonntags geöffnet <span>${nSo}</span></button>` : ''}
  ${nBio ? `<button type="button" class="umschalter" data-bio-filter aria-pressed="false">Bio <span>${nBio}</span></button>` : ''}
  ${nRund ? `<button type="button" class="umschalter" data-rund-filter aria-pressed="false">24/7 <span>${nRund}</span></button>` : ''}
  ${nKarte ? `<button type="button" class="umschalter" data-karte-filter aria-pressed="false">Kartenzahlung <span>${nKarte}</span></button>` : ''}
  ${nKinder ? `<button type="button" class="umschalter" data-kinder-filter aria-pressed="false">Ausflug mit Kindern <span>${nKinder}</span></button>` : ''}
  ${nOepnv ? `<button type="button" class="umschalter" data-oepnv-filter aria-pressed="false" title="Haltestelle höchstens 1 km entfernt">Mit Bus &amp; Bahn <span>${nOepnv}</span></button>` : ''}
  ${kats.length ? `<div class="kat-filter" aria-label="Angebot">${kats.map((k) => `<button type="button" data-kat-filter="${k}" aria-pressed="false">${produktIcon(k)}${esc(KATEGORIEN[k])}</button>`).join('')}</div>` : ''}
  <p class="treffer" aria-live="polite"><span data-trefferzahl>${liste.length}</span> ${liste.length === 1 ? 'Eintrag' : 'Einträge'}</p>
</div>`;
}

// ---------- Ausgabe vorbereiten ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(GEN, { recursive: true });
cpSync(join(ROOT, 'static'), OUT, { recursive: true });
if (existsSync(join(ROOT, 'data', 'fotos'))) cpSync(join(ROOT, 'data', 'fotos'), join(OUT, 'fotos'), { recursive: true, filter: (q) => !q.endsWith('.gitkeep') });
const sitemap = [];
const ALLE_SEITEN = new Set();
// Seitenarchiv (data/seiten-stand.json): Inhalts-Hash und Änderungsdatum je Seite, auch für Seiten,
// die es nicht mehr gibt. Daraus entstehen echtes lastmod, 301-Weiterleitungen und 410 für entfernte Höfe.
const STAND_DATEI = join(ROOT, 'data', 'seiten-stand.json');
const stand = existsSync(STAND_DATEI) ? JSON.parse(readFileSync(STAND_DATEI, 'utf8')) : { seiten: {}, hoefe: {} };
const ARCHIV_AUSNAHMEN = new Set(['/merkliste/', '/verwaltung/']);
// Google Analytics 4 (Mess-ID ist öffentlich). Leer = aus. Geladen wird nur nach Einwilligung (static/statistik.js).
const GA_ID = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'data', 'analytics.json'), 'utf8')).ga4 || ''; } catch { return ''; } })();
if (GA_ID && !/^G-[A-Z0-9]+$/.test(GA_ID)) throw new Error(`data/analytics.json: ungültige GA4-Mess-ID ${GA_ID}`);
const STAND_PLATZHALTER = '%%SEITENSTAND%%'; // wird nach dem Hashen durch das Änderungsdatum ersetzt
function schreibe(pfad, html, inSitemap = true) {
  const datei = join(OUT, pfad, pfad.endsWith('/') ? 'index.html' : '');
  mkdirSync(dirname(datei), { recursive: true });
  if (pfad.endsWith('/') && !ARCHIV_AUSNAHMEN.has(pfad)) {
    const h = SEITEN_HASH.get(pfad);
    const alt = stand.seiten[pfad];
    if (!alt) stand.seiten[pfad] = [h, BUILD_DATUM];
    else if (alt[0] !== h) stand.seiten[pfad] = [h, alt[0] == null ? alt[1] : BUILD_DATUM];
    html = html.replaceAll(STAND_PLATZHALTER, stand.seiten[pfad][1].split('-').reverse().join('.'));
  }
  writeFileSync(datei, html);
  if (pfad.endsWith('/')) ALLE_SEITEN.add(pfad);
  if (inSitemap) sitemap.push(pfad);
}

const anzHof = eintraege.filter((e) => e.typ === 'hofladen').length;
const anzArt = (a) => eintraege.filter((e) => e.art === a).length;

// ---------- Deutschlandkarte aus Punkten (Startseite) ----------
{
  const umriss = JSON.parse(readFileSync(join(ROOT, 'data', 'quellen', 'deutschland-umriss.geojson'), 'utf8'));
  const LON0 = 5.8, LAT1 = 55.1, K = 100, KX = Math.cos(51 * Math.PI / 180) * K;
  const px = (lon) => (lon - LON0) * KX, py = (lat) => (LAT1 - lat) * K;
  const W = Math.ceil(px(15.1) + 8), H = Math.ceil(py(47.2) + 8);
  const r1 = (v) => Math.round(v * 2) / 2;
  const pfadUmriss = umriss.geometry.coordinates.map((poly) => 'M' + poly[0].map(([x, y]) => `${r1(px(x) + 4)} ${r1(py(y) + 4)}`).join('L') + 'Z').join('');
  const r2 = (v) => Math.round(v / 2) * 2;
  const punkte = new Set(eintraege.map((e) => `${r2(px(e.lon) + 4)} ${r2(py(e.lat) + 4)}`));
  // relative Bewegungen zwischen sortierten Punkten: deutlich kürzerer Pfad
  const sortiertePunkte = [...punkte].map((p) => p.split(' ').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  let px0 = 0, py0 = 0;
  const pfadPunkte = sortiertePunkte.map(([x, y], i) => { const t = i ? `m${x - px0} ${y - py0}h0` : `M${x} ${y}h0`; px0 = x; py0 = y; return t; }).join('').replace(/ -/g, '-');
  mkdirSync(join(OUT, 'img'), { recursive: true });
  writeFileSync(join(OUT, 'img', 'deutschland.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${pfadUmriss}" fill="#1E4A37" stroke="#2F6249" stroke-width="1.2"/><path d="${pfadPunkte}" stroke="#F4C430" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`);
  globalThis.KARTE_GROESSE = [W, H];
  globalThis.KARTE_VERSION = createHash('sha1').update(readFileSync(join(OUT, 'img', 'deutschland.svg'))).digest('hex').slice(0, 8);
}

// ---------- SEO-Hilfen: Texte aus den Daten ----------
const PLURAL_ART = { Hofladen: 'Hofläden', Milchtankstelle: 'Milchtankstellen', Eierautomat: 'Eierautomaten', Regiomat: 'Regiomaten', Fleischautomat: 'Fleischautomaten', Kartoffelautomat: 'Kartoffelautomaten',
  Honigautomat: 'Honigautomaten', Nudelautomat: 'Nudelautomaten', Imkerei: 'Imkereien', Solawi: 'Solawis', 'Selbstpflücken': 'Selbstpflückfelder', 'Hofcafé': 'Hofcafés' };
const nennung = (arr) => arr.length <= 1 ? (arr[0] || '') : `${arr.slice(0, -1).join(', ')} und ${arr[arr.length - 1]}`;
const gross = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const link = (e) => `<a href="${e.pfad}">${esc(e.titel)}</a>`;
const wocheVon = (e) => (e.oeffnungszeiten ? parse(e.oeffnungszeiten) : null);
const istRund = (w) => w && w.every((iv) => iv.some(([a, b]) => a === 0 && b >= 1440));

function zaehlung(liste) {
  const nHof = liste.filter((e) => e.typ === 'hofladen').length;
  const arten = new Map();
  for (const e of liste) if (e.typ !== 'hofladen') arten.set(e.art, (arten.get(e.art) || 0) + 1);
  const teile = [];
  if (nHof) teile.push(plural(nHof, 'Hofladen', 'Hofläden'));
  for (const [a, n] of [...arten].sort((x, y) => y[1] - x[1])) teile.push(`${zahl(n)} ${n === 1 ? a : PLURAL_ART[a] || a}`);
  return nennung(teile);
}

// Automatenart → Themenseite
const ART_TYP = { Milchtankstelle: 'milchtankstelle', Eierautomat: 'eierautomat', Regiomat: 'regiomat', Fleischautomat: 'regiomat', Kartoffelautomat: 'regiomat', Honigautomat: 'regiomat', Nudelautomat: 'regiomat',
  Imkerei: 'imker', Solawi: 'solawi', 'Selbstpflücken': 'selbstpfluecken', 'Hofcafé': 'hofcafe' };
function zaehlungLinks(liste, anker = '') {
  const nHof = liste.filter((e) => e.typ === 'hofladen').length;
  const arten = new Map();
  for (const e of liste) if (e.typ !== 'hofladen') arten.set(e.art, (arten.get(e.art) || 0) + 1);
  const teile = [];
  if (nHof) teile.push(plural(nHof, 'Hofladen', 'Hofläden'));
  for (const [a, n] of [...arten].sort((x, y) => y[1] - x[1])) {
    const wort = n === 1 ? a : PLURAL_ART[a] || a;
    teile.push(`${zahl(n)} ${ART_TYP[a] ? `<a href="/${ART_TYP[a]}/${anker ? '#' + anker : ''}">${wort}</a>` : wort}`);
  }
  return nennung(teile);
}

function zaehlungKurz(liste) {
  const nHof = liste.filter((e) => e.typ === 'hofladen').length, nAut = liste.length - nHof;
  const arten = [...new Set(liste.filter((e) => e.typ !== 'hofladen').map((e) => e.art))];
  const aut = nAut ? (arten.length === 1 ? `${zahl(nAut)} ${nAut === 1 ? arten[0] : PLURAL_ART[arten[0]] || arten[0]}` : `${zahl(nAut)} Hofautomaten`) : '';
  return [nHof && plural(nHof, 'Hofladen', 'Hofläden'), aut].filter(Boolean).join(' & ');
}

function analyse(liste) {
  const mitZeiten = liste.filter(wocheVon);
  const sa = liste.filter((e) => wocheVon(e)?.[5].length);
  const so = liste.filter((e) => wocheVon(e)?.[6].length);
  const rund = liste.filter((e) => istRund(wocheVon(e)));
  const kat = new Map();
  for (const e of liste) for (const k of e.kat) kat.set(k, (kat.get(k) || 0) + 1);
  const orte = new Map();
  for (const e of liste) orte.set(e.ortAnzeige, (orte.get(e.ortAnzeige) || 0) + 1);
  return {
    mitZeiten, sa, so, rund, bio: liste.filter((e) => e.bio),
    kat: [...kat].sort((a, b) => b[1] - a[1]),
    orte: [...orte].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).map(([o]) => o),
    milch: liste.filter((e) => e.art === 'Milchtankstelle'),
    eier: liste.filter((e) => e.kat.includes('eier')),
  };
}

// Nächster Eintrag (außerhalb von "ausser"), der eine Bedingung erfüllt – Suche im 0,2°-Raster
function naechster(lat, lon, bedingung, ausser = new Set()) {
  const la = Math.floor(lat * 5), lo = Math.floor(lon * 5);
  let best = null;
  for (let r = 0; r <= 6; r++) {
    for (let i = la - r; i <= la + r; i++) for (let j = lo - r; j <= lo + r; j++) {
      if (Math.max(Math.abs(i - la), Math.abs(j - lo)) !== r) continue;
      for (const x of raster2.get(i + ':' + j) || []) {
        if (ausser.has(x) || !bedingung(x)) continue;
        const d = distanzKm(lat, lon, x.lat, x.lon);
        if (!best || d < best[0]) best = [d, x];
      }
    }
    if (best && best[0] < r * 15) break;
  }
  return best;
}
// Entfernung: unter 1 km in Metern, unter 50 m „am selben Ort“
const km = (d) => d < 0.05 ? 'am selben Ort' : d < 1 ? `${Math.max(50, Math.round(d * 20) * 50)} m` : `${d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} km`;

function gebietsText(liste, wo, { orteNennen = true, anker = '' } = {}) {
  const a = analyse(liste);
  const p = [];
  const hof = liste.filter((e) => e.typ === 'hofladen').length;
  p.push(`${gross(wo)} findest du ${zaehlungLinks(liste, anker)}${orteNennen && a.orte.length > 1 ? ` – unter anderem in ${nennung(a.orte.slice(0, 4))}` : ''}. ${hof ? 'Im Hofladen kaufst du direkt beim Erzeuger: frisch, regional und ohne Umweg über den Supermarkt.' : 'Die Automaten sind meist rund um die Uhr zugänglich – praktisch, wenn der Hofladen schon geschlossen hat.'}`);
  const saisonal = a.kat.some(([k]) => ['obst', 'gemuese', 'kartoffeln'].includes(k));
  if (a.kat.length) p.push(`Am häufigsten im Angebot sind ${nennung(a.kat.slice(0, 4).map(([k]) => KATEGORIEN[k]))}.${a.bio.length ? ` ${a.bio.length === 1 ? 'Ein Hof verkauft' : `${zahl(a.bio.length)} Höfe verkaufen`} Bio-Produkte.` : ''}${saisonal ? ' Welches Obst und Gemüse gerade Saison hat, zeigt unser <a href="/saisonkalender/">Saisonkalender</a>.' : ''}`);
  const z = [];
  if (a.mitZeiten.length) z.push(`Für ${plural(a.mitZeiten.length, 'Eintrag', 'Einträge')} sind Öffnungszeiten hinterlegt`);
  if (a.sa.length) z.push(`${zahl(a.sa.length)} ${a.sa.length === 1 ? 'hat' : 'haben'} samstags geöffnet`);
  if (a.so.length) z.push(`${zahl(a.so.length)} sogar sonntags`);
  if (z.length) p.push(`${z.join(', ')}.${a.rund.length ? ` ${a.rund.length === 1 ? 'Ein Angebot ist' : `${zahl(a.rund.length)} Angebote sind`} rund um die Uhr erreichbar.` : ''} Mit dem Filter „Jetzt geöffnet“ siehst du sofort, wo du gerade einkaufen kannst.`);
  p.push(`Alle Höfe in Deutschland auf einen Blick zeigt die <a href="/karte/">Hofladen-Karte</a>. Dein Hof fehlt? <a href="/mitmachen/">Hofladen kostenlos eintragen</a>.`);
  return p.map((x) => `<p>${x}</p>`).join('\n');
}

function fragen(liste, wo, mitte, { orteLinks = [] } = {}) {
  const a = analyse(liste);
  const im = new Set(liste);
  const f = [];
  const hoefe = liste.filter((e) => e.typ === 'hofladen');
  if (hoefe.length) f.push([`Wo finde ich einen Hofladen ${wo}?`,
    `${gross(wo)} gibt es ${plural(hoefe.length, 'Hofladen', 'Hofläden')}${a.orte.length > 1 ? `, zum Beispiel in ${nennung(a.orte.slice(0, 3))}` : ''}: ${nennung(hoefe.slice(0, 3).map(link))}${hoefe.length > 3 ? ' und weitere' : ''}. Mit deiner Postleitzahl sortieren wir alle Einträge nach Entfernung.`]);
  if (a.sa.length) f.push([`Welche Hofläden haben ${wo} am Samstag geöffnet?`,
    `Laut den hinterlegten Öffnungszeiten haben samstags geöffnet: ${nennung(a.sa.slice(0, 5).map(link))}${a.sa.length > 5 ? ` und ${zahl(a.sa.length - 5)} weitere` : ''}.`]);
  f.push([`Hat ein Hofladen ${wo} sonntags geöffnet?`, a.so.length
    ? `Ja: ${nennung(a.so.slice(0, 5).map(link))}${a.so.length > 5 ? ` und ${zahl(a.so.length - 5)} weitere` : ''}. Rund um die Saison ändern sich die Zeiten oft – kurz anrufen lohnt sich.`
    : `Für keinen Eintrag ${wo} sind Sonntagszeiten hinterlegt.${a.rund.length ? ` Rund um die Uhr erreichbar sind aber ${nennung(a.rund.slice(0, 3).map(link))}.` : ' Viele <a href="/regiomat/">Regiomaten</a> und <a href="/eierautomat/">Eierautomaten</a> sind trotzdem auch sonntags zugänglich.'}`]);
  if (a.milch.length) f.push([`Gibt es eine Milchtankstelle ${wo}?`, `Ja, ${a.milch.length === 1 ? 'eine' : zahl(a.milch.length)}: ${nennung(a.milch.slice(0, 5).map((e) => `${link(e)} (${esc(e.ortAnzeige)})`))}. Dort zapfst du frische Rohmilch selbst – vor dem Trinken bitte abkochen. Alle Standorte findest du unter <a href="/milchtankstelle/">Milchtankstellen in Deutschland</a>.`]);
  else { const n = naechster(mitte.lat, mitte.lon, (x) => x.art === 'Milchtankstelle', im);
    if (n) f.push([`Gibt es eine Milchtankstelle ${wo}?`, `${gross(wo)} ist bisher keine Milchtankstelle eingetragen. Die nächste ist ${link(n[1])} in ${esc(n[1].ortAnzeige)}, etwa ${km(n[0])} entfernt. Weitere findest du unter <a href="/milchtankstelle/">Milchtankstellen in Deutschland</a>.`]); }
  if (a.eier.length) f.push([`Wo bekomme ich Eier vom Hof ${wo}?`, `Eier gibt es zum Beispiel bei ${nennung(a.eier.slice(0, 4).map(link))}${a.eier.length > 4 ? ` und ${zahl(a.eier.length - 4)} weiteren` : ''}. Auch abends und am Wochenende gibt es Eier oft am <a href="/eierautomat/">Eierautomaten</a>.`]);
  else { const n = naechster(mitte.lat, mitte.lon, (x) => x.kat.includes('eier'), im);
    if (n) f.push([`Wo bekomme ich Eier vom Hof ${wo}?`, `Der nächste Hof mit Eiern ist ${link(n[1])} in ${esc(n[1].ortAnzeige)}, etwa ${km(n[0])} entfernt. Eine Übersicht bietet die Seite <a href="/eierautomat/">Eierautomaten in Deutschland</a>.`]); }
  if (orteLinks.length > 1) f.push([`In welchen Orten ${wo} gibt es Hofläden?`, `${nennung(orteLinks.slice(0, 12))}${orteLinks.length > 12 ? ` und ${zahl(orteLinks.length - 12)} weiteren Orten` : ''}.`]);
  return f;
}
function fragenHtml(f, titel) {
  if (!f.length) return { html: '', ld: [] };
  const html = `<section class="abschnitt faq"><h2>${esc(titel)}</h2>${f.map(([q, a]) => `<h3>${esc(q)}</h3><p>${a}</p>`).join('\n')}</section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: f.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) }];
  return { html, ld };
}

// ---------- Regionsprofile (recherchiert, mit Quellen) ----------
const REGIONEN = new Map();
const regionDir = join(ROOT, 'data', 'regionen');
if (existsSync(regionDir)) for (const f of readdirSync(regionDir).filter((x) => x.endsWith('.json'))) {
  const r = JSON.parse(readFileSync(join(regionDir, f), 'utf8'));
  REGIONEN.set(r.kreis, r);
}
function regionHtml(r) {
  return `<section class="region" id="region"><div class="region-innen">
  <h2>${esc(r.ueberschrift)}</h2>${r.absaetze.map((a) => `<p>${esc(a)}</p>`).join('')}
  <ul class="region-highlights">${r.highlights.map((h) => `<li><b>${esc(h.titel)}</b><span>${esc(h.zeit)}</span></li>`).join('')}</ul>
  <p class="region-hinweis"><a href="/saisonkalender/">Was gerade Saison hat</a> · <a href="#quellen">Quellen</a></p>
</div></section>`;
}
const quellenHtml = (r) => `<section class="abschnitt quellen" id="quellen"><h2>Quellen</h2><ol>${r.quellen.map((q) => `<li><a href="${esc(q.url)}" rel="nofollow noopener" target="_blank">${esc(q.titel)}</a></li>`).join('')}</ol></section>`;
const regionTeaser = (k) => { const r = REGIONEN.get(k.code); return r ? `<p class="region-teaser">${esc(r.teaser)} <a href="${k.pfad}#region">Mehr über die Region</a></p>` : ''; };

// ---------- Orte ----------
const MIN_SEITE = 3; // Listenseiten mit weniger Einträgen gelten als dünn
const ORTE = new Map(); // kreis-Code → Map(ort → { ort, pfad, liste })
for (const [code, liste] of proKreis) {
  const k = kreise.get(code);
  const m = new Map();
  for (const e of liste) {
    if (!m.has(e.ortAnzeige)) m.set(e.ortAnzeige, { ort: e.ortAnzeige, liste: [], k });
    m.get(e.ortAnzeige).liste.push(e);
  }
  const slugs = new Set();
  for (const o of m.values()) {
    let s = slugify(o.ort) || 'ort';
    while (slugs.has(s)) s += '-2';
    slugs.add(s);
    // Eigene Ortsseite erst ab MIN_SEITE Einträgen und nur, wenn sie sich von der Kreisseite unterscheidet
    // (die gleichnamige kreisfreie Stadt ist die Kreisseite selbst). Bei einem Eintrag ist die Hofseite
    // die Seite für "Hofladen in <Ort>", bei zwei die Kreisseite.
    const istKreisStadt = k.art === 'Stadt' && (o.ort === k.name || o.ort === k.titel);
    o.pfad = o.liste.length === liste.length || istKreisStadt ? k.pfad : o.liste.length === 1 ? null : o.liste.length < MIN_SEITE ? k.pfad : `${k.pfad}${s}/`;
    o.eigen = !!o.pfad && o.pfad !== k.pfad;
    o.lat = o.liste.reduce((x, e) => x + e.lat, 0) / o.liste.length;
    o.lon = o.liste.reduce((x, e) => x + e.lon, 0) / o.liste.length;
    for (const e of o.liste) e.ortSeite = o;
  }
  ORTE.set(code, m);
}
const ortSeiten = [...ORTE.values()].flatMap((m) => [...m.values()]).filter((o) => o.eigen);
// Bei einem Eintrag verlinkt der Ort direkt auf die Hofseite (Pfad steht erst nach der Slug-Vergabe fest)
for (const m of ORTE.values()) for (const o of m.values()) if (!o.pfad) o.pfad = o.liste[0].pfad;

// ---------- Orte mit Umgebung: "Hofläden in <Ort> und Umgebung" ----------
// Mittelpunkt eines Orts aus den PLZ-Daten (name|kreis) – das "Ortszentrum" für die Entfernungen
const ORTSMITTE = new Map();
for (const rows of plz.values()) for (const r of rows) {
  if (r.org) continue;
  const key = r.ort + '|' + r.kreis;
  const m = ORTSMITTE.get(key) || { lat: 0, lon: 0, n: 0, plz: new Set() };
  m.lat += r.lat; m.lon += r.lon; m.n++; m.plz.add(r.plz);
  ORTSMITTE.set(key, m);
}
for (const m of ORTSMITTE.values()) { m.lat /= m.n; m.lon /= m.n; }
const UMKREIS_MAX = 50;
const UMKREISE = [10, 25, 50];
function umkreis(lat, lon, maxKm = UMKREIS_MAX) {
  const dLat = maxKm / 111, dLon = maxKm / (111 * Math.cos(lat * Math.PI / 180));
  return eintraege.filter((e) => Math.abs(e.lat - lat) <= dLat && Math.abs(e.lon - lon) <= dLon)
    .map((e) => [distanzKm(lat, lon, e.lat, e.lon), e]).filter(([d]) => d <= maxKm).sort((a, b) => a[0] - b[0]);
}
// Zusätzliche Zielorte ohne eigene Ortsseite: größere Städte (ab 3 Postleitzahlen) und die Städte rund um Forst (Lausitz)
const LAUSITZ = ['Forst (Lausitz)', 'Guben', 'Spremberg', 'Peitz', 'Döbern', 'Drebkau', 'Welzow', 'Burg (Spreewald)', 'Kolkwitz',
  'Senftenberg', 'Calau', 'Vetschau', 'Lübbenau/Spreewald', 'Lübben (Spreewald)', 'Finsterwalde', 'Lauchhammer', 'Großräschen',
  'Eisenhüttenstadt', 'Weißwasser', 'Weißwasser/Oberlausitz', 'Bad Muskau', 'Niesky', 'Hoyerswerda', 'Bautzen', 'Görlitz'];
const UMGEBUNG = []; // { name, k, pfad, lat, lon, eigene, umkreis, kreisSeite }
{
  const typKreisSlugs = new Set(['milchtankstellen', 'eierautomaten', 'regiomaten']);
  const gesehen = new Set();
  const ziel = (name, k, pfad, mitte, eigene, kreisSeite) => {
    if (gesehen.has(pfad)) return null;
    const um = umkreis(mitte.lat, mitte.lon);
    if (um.length < MIN_SEITE) return null;
    gesehen.add(pfad);
    const z = { name, k, pfad, lat: mitte.lat, lon: mitte.lon, eigene, umkreis: um, kreisSeite };
    UMGEBUNG.push(z);
    return z;
  };
  // 1. Kreisfreie Städte: die Kreisseite wird zur Stadtseite mit Umgebung
  for (const k of kreise.values()) if (k.art === 'Stadt') {
    const m = ORTSMITTE.get(k.name + '|' + k.code) || kreisMitte.get(k.code);
    if (m) ziel(k.name, k, k.pfad, m, proKreis.get(k.code) || [], true);
  }
  // 2. Bestehende Ortsseiten
  for (const o of ortSeiten) {
    const m = ORTSMITTE.get(o.ort + '|' + o.k.code) || o;
    const z = ziel(o.ort, o.k, o.pfad, m, o.liste, false);
    if (z) { o.umgebung = z; o.lat = m.lat; o.lon = m.lon; }
  }
  // 3. Größere Städte und Lausitz ohne eigene Seite
  for (const [key, m] of ORTSMITTE) {
    const [name, code] = key.split('|');
    if (m.plz.size < 3 && !LAUSITZ.includes(name)) continue;
    const k = kreise.get(code);
    if (!k || (k.art === 'Stadt' && (k.name === name || k.titel === name))) continue;
    const slug = slugify(name);
    if (!slug || typKreisSlugs.has(slug)) continue;
    let o = ORTE.get(code)?.get(name);
    if (o?.eigen) continue;
    const pfad = `${k.pfad}${slug}/`;
    const z = ziel(name, k, pfad, m, o ? o.liste : [], false);
    if (!z) continue;
    if (!o) { o = { ort: name, liste: [], k }; if (!ORTE.has(code)) ORTE.set(code, new Map()); ORTE.get(code).set(name, o); }
    Object.assign(o, { pfad, eigen: true, lat: m.lat, lon: m.lon, umgebung: z });
    for (const e of o.liste) e.ortSeite = o;
    ortSeiten.push(o);
  }
}
const UMGEBUNG_PFAD = new Map(UMGEBUNG.map((z) => [z.pfad, z]));
function naechsteUmgebungsSeite(e) {
  let best = null, bd = 25;
  for (const z of UMGEBUNG) {
    if (Math.abs(z.lat - e.lat) > 0.3 || Math.abs(z.lon - e.lon) > 0.5) continue;
    const d = distanzKm(e.lat, e.lon, z.lat, z.lon);
    if (d < bd) { bd = d; best = z; }
  }
  return best;
}
// Nächstgelegene Ortsseiten (für die Verlinkung zwischen Orten, auch über Kreisgrenzen)
function naheOrte(lat, lon, n, ausser = new Set()) {
  return ortSeiten.filter((o) => !ausser.has(o) && Math.abs(o.lat - lat) < 0.5 && Math.abs(o.lon - lon) < 0.8)
    .map((o) => [distanzKm(lat, lon, o.lat, o.lon), o]).filter(([d]) => d <= 40).sort((a, b) => a[0] - b[0]).slice(0, n);
}
const ortListe = (paare, titel) => paare.length ? `<section class="abschnitt"><h2>${esc(titel)}</h2><ul class="kreis-liste">${paare.map(([d, o]) => `<li><a href="${o.pfad}"><span>${esc(ortUeberschrift(o).replace(/ in .*/, ''))} in ${esc(o.ortTitel || o.ort)}</span><span class="zahl">${km(d)}</span></a></li>`).join('')}</ul></section>` : '';
const typLinks = (liste, anker, kreis = null) => { const t = TYPEN.map((x) => [x, liste.filter((e) => x.arten.includes(e.art)).length]).filter(([, n]) => n);
  return t.length ? `<p>Hofautomaten hier: ${t.map(([x, n]) => { const tk = kreis && typKreis(x, kreis);
    return `<a href="${tk ? tk.pfad : `/${x.slug}/${anker ? '#' + anker : ''}`}">${zahl(n)} ${n === 1 ? x.name : x.plural}</a>`; }).join(', ')}.</p>` : ''; };

// Gleichnamige Orte in verschiedenen Kreisen im Titel unterscheiden
const ortNamenZahl = new Map();
for (const o of ortSeiten) ortNamenZahl.set(o.ort, (ortNamenZahl.get(o.ort) || 0) + 1);
for (const o of ortSeiten) o.ortTitel = ortNamenZahl.get(o.ort) > 1 ? `${o.ort} (${o.k.titel})` : o.ort;
for (const o of ortSeiten) if (o.umgebung) o.umgebung.titelName = o.ortTitel;
function ortUeberschrift(o) {
  if (o.umgebung) return `Hofläden in ${o.ort} und Umgebung`;
  const nHof = o.liste.filter((e) => e.typ === 'hofladen').length;
  if (nHof) return nHof === 1 ? `Hofladen in ${o.ort}` : `Hofläden in ${o.ort}`;
  const arten = [...new Set(o.liste.map((e) => e.art))];
  if (arten.length === 1) return `${o.liste.length === 1 ? arten[0] : PLURAL_ART[arten[0]] || arten[0]} in ${o.ort}`;
  return `Hofautomaten in ${o.ort}`;
}

// Titel eindeutig machen, wenn derselbe Name im selben Ort mehrfach vorkommt
const titelZahl = new Map();
for (const e of eintraege) { const key = e.titel + '|' + e.ortAnzeige; titelZahl.set(key, (titelZahl.get(key) || 0) + 1); }
for (const e of eintraege) e.titelSeite = titelZahl.get(e.titel + '|' + e.ortAnzeige) > 1 ? (e.strasse ? `${e.titel}, ${e.strasse}` : `${e.titel} (${e.plz || e.plzNah})`) : e.titel;
{ const n = new Map();
  for (const e of eintraege.slice().sort((a, b) => (a.osm || a.id).localeCompare(b.osm || b.id, 'en', { numeric: true }))) {
    const z = (n.get(e.titelSeite) || 0) + 1; n.set(e.titelSeite, z);
    if (z > 1) e.titelSeite = `${e.titelSeite} – Nr. ${z}`;
  } }
// ---------- Strukturierte Daten ----------
const SCHEMA_TAGE = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function oeffnungsSpezifikation(woche) {
  const gruppen = new Map();
  woche.forEach((iv, tag) => {
    for (const [a, b] of iv) {
      const key = `${a}-${b}`;
      if (!gruppen.has(key)) gruppen.set(key, { a, b, tage: [] });
      gruppen.get(key).tage.push(tag);
    }
  });
  return [...gruppen.values()].map(({ a, b, tage }) => ({ '@type': 'OpeningHoursSpecification',
    dayOfWeek: tage.map((t) => `https://schema.org/${SCHEMA_TAGE[t]}`),
    opens: hhmm(a), closes: b === 1440 ? '23:59' : hhmm(b) }));
}
// ItemList für Listenseiten: Einträge [titel, pfad] in der angezeigten Reihenfolge
const itemList = (name, eintraegeListe) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name,
  numberOfItems: eintraegeListe.length,
  itemListElement: eintraegeListe.map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, url: cfg.domain + p })) });
const hofItems = (liste) => liste.map((e) => [e.titelSeite, e.pfad]);

// Längste Titelvariante, die (mit Marke) in ~65 Zeichen passt
// Erste Variante, die mit „| Hofladenliste“ in 580 px passt – sonst die erste, die ohne Marke passt
const passend = (...varianten) => varianten.find((v) => titelBreite(`${v} | Hofladenliste`) <= TITEL_MAX) || varianten.find((v) => titelBreite(v) <= TITEL_MAX) || varianten[varianten.length - 1];

// Große Städte (gemessen an der Zahl ihrer Postleitzahlen) mit ihrer Seite – für die Startseite
const GROSSSTAEDTE = (() => {
  const plzJeOrt = new Map();
  for (const rows of plz.values()) for (const r of rows) if (!r.org) {
    const key = r.ort + '|' + r.kreis;
    if (!plzJeOrt.has(key)) plzJeOrt.set(key, new Set());
    plzJeOrt.get(key).add(r.plz);
  }
  return [...plzJeOrt].sort((a, b) => b[1].size - a[1].size).map(([key]) => {
    const [name, code] = key.split('|');
    const k = kreise.get(code);
    const stadtKreis = k.art === 'Stadt' && (k.name === name || k.titel === name);
    const o = ORTE.get(code)?.get(name);
    const ziel = stadtKreis ? { pfad: k.pfad, n: proKreis.get(code)?.length || 0 } : o?.eigen ? { pfad: o.pfad, n: o.liste.length } : null;
    return ziel && ziel.n >= MIN_SEITE ? { name, ...ziel } : null;
  }).filter(Boolean).filter((x, i, a) => a.findIndex((y) => y.pfad === x.pfad) === i).slice(0, 20);
})();

// ---------- Startseite ----------
// Sorten des Monats als Chips mit Link zur Sortenseite (frisch und aus dem Lager)
function saisonMonatHtml(monat) {
  const chip = ([n]) => `<li><a href="${SAISON_NACH_NAME.get(n)?.pfad || '/saisonkalender/'}">${esc(n)}</a></li>`;
  const frisch = SAISON.filter(([, f]) => f.includes(monat)), lager = SAISON.filter(([, , l = []]) => l.includes(monat));
  return `<p class="saison-monat">Im ${MONATSNAMEN[monat - 1]} frisch vom Feld${frisch.length ? ':' : ' kommt vor allem Lagerware.'}</p>
  ${frisch.length ? `<ul class="saison-chips">${frisch.map(chip).join('')}</ul>` : ''}
  ${lager.length ? `<p class="saison-monat lager-titel">Aus dem Lager:</p><ul class="saison-chips lager">${lager.map(chip).join('')}</ul>` : ''}`;
}
const TYPEN = [
  { slug: 'milchtankstelle', arten: ['Milchtankstelle'], name: 'Milchtankstelle', plural: 'Milchtankstellen', icon: ICON.milch,
    kurz: 'Frische Rohmilch zum Selbstzapfen, meist rund um die Uhr. Flasche mitbringen oder vor Ort kaufen.',
    text: ['An einer Milchtankstelle – auch Milchautomat genannt – zapfst du frische Milch direkt vom Hof. Die Milch kommt meist noch am selben Tag aus dem Stall, ist gekühlt und wird nicht erhitzt oder homogenisiert.',
      'Weil es sich um Rohmilch handelt, gilt: vor dem Verzehr abkochen. Die meisten Milchtankstellen verkaufen auch Glasflaschen; Mehrwegflaschen kannst du beim nächsten Mal wieder mitbringen. Bezahlt wird mit Münzen, oft auch mit Karte.'] },
  { slug: 'eierautomat', arten: ['Eierautomat'], name: 'Eierautomat', plural: 'Eierautomaten', icon: ICON.eier,
    kurz: 'Eier vom Hof, oft aus Freilandhaltung, auch abends und am Wochenende.',
    text: ['Am Eierautomaten bekommst du frische Eier direkt vom Hof – häufig aus Freiland- oder Bodenhaltung, manchmal auch Bio-Eier. Viele Automaten sind rund um die Uhr zugänglich.',
      'Oft gibt es nebenbei Nudeln, Eierlikör oder Kartoffeln. Eier aus dem Automaten müssen genauso gekennzeichnet sein wie im Laden; den Erzeugercode findest du auf jedem Ei.'] },
  { slug: 'regiomat', arten: ['Regiomat', 'Fleischautomat', 'Kartoffelautomat', 'Honigautomat', 'Nudelautomat'], name: 'Regiomat', plural: 'Regiomaten', icon: ICON.automat,
    kurz: 'Verkaufsautomaten mit Wurst, Kartoffeln, Nudeln, Honig und mehr aus der Region.',
    text: ['Regiomaten sind Verkaufsautomaten mit Fächern für regionale Lebensmittel: Wurst und Fleisch, Käse, Kartoffeln, Nudeln, Honig, Marmelade oder Getränke. Sie stehen meist direkt am Hof oder an gut erreichbaren Stellen im Ort.',
      'Die Fächer werden regelmäßig vom Betrieb aufgefüllt, Kühlware ist gekühlt. Damit kannst du regional einkaufen, auch wenn der Hofladen geschlossen ist – abends, sonntags und an Feiertagen.'] },
];
// Weitere Einstiegstypen (Phase 3): eigene Seiten nur, wenn es genug Einträge gibt (siehe MIN_SEITE in den Land- und Kreisseiten)
const WEITERE_TYPEN = [
  { slug: 'imker', name: 'Imkerei', plural: 'Imkereien', h1: 'Imker und Honig ab Hof', icon: ICON.hofladen,
    naechste: 'die nächste Imkerei', passt: (e) => e.art === 'Imkerei' || e.art === 'Honigautomat',
    kurz: 'Imkereien mit Honigverkauf ab Hof und Honigautomaten.',
    text: ['Bei der Imkerei um die Ecke bekommst du Honig aus deiner Gegend – oft mit Sorten, die es im Supermarkt nicht gibt, etwa Raps-, Linden- oder Waldhonig. Manche Imker verkaufen auch Wachskerzen, Propolis oder Met.',
      'Viele Imkereien verkaufen nebenbei aus dem Haus oder über einen kleinen Automaten. Ruf vorher an, wenn keine Öffnungszeiten angegeben sind.'] },
  { slug: 'selbstpfluecken', name: 'Feld zum Selbstpflücken', plural: 'Felder zum Selbstpflücken', h1: 'Selbstpflücken und Selbsternte', icon: ICON.blatt,
    naechste: 'das nächste Feld zum Selbstpflücken', passt: (e) => e.art === 'Selbstpflücken' || !!e.merkmale?.selbstpfluecken,
    kurz: 'Erdbeeren, Äpfel, Blumen und Kürbisse selbst pflücken – saisonal direkt am Feld.',
    text: ['Beim Selbstpflücken erntest du Erdbeeren, Himbeeren, Äpfel, Blumen oder Kürbisse selbst und zahlst nach Gewicht oder Stück. Die Saison beginnt meist im Juni mit Erdbeeren und endet im Oktober mit Kürbissen.',
      'Ob das Feld gerade geöffnet ist, hängt vom Wetter und der Ernte ab. Schau vorher in die Öffnungszeiten oder ruf kurz an.'] },
  { slug: 'hofcafe', name: 'Hofcafé', plural: 'Hofcafés', h1: 'Hofcafés', icon: ICON.hofladen,
    naechste: 'das nächste Hofcafé', passt: (e) => e.art === 'Hofcafé' || !!e.merkmale?.hofcafe,
    kurz: 'Kuchen, Kaffee und regionale Küche direkt auf dem Hof.',
    text: ['Ein Hofcafé ist ein Café auf einem Bauernhof: Kuchen aus eigenen Eiern und Milch, oft mit Blick auf Felder und Tiere. Viele haben nur am Wochenende oder in der Saison geöffnet.',
      'Häufig gehört ein Hofladen dazu, in dem du nach dem Kaffee noch einkaufen kannst.'] },
  { slug: 'solawi', name: 'Solawi', plural: 'Solawis', h1: 'Solidarische Landwirtschaft (Solawi)', icon: ICON.blatt,
    naechste: 'die nächste Solawi', passt: (e) => e.art === 'Solawi',
    kurz: 'Höfe, bei denen du mit einem Monatsbeitrag Ernteanteile bekommst.',
    text: ['Bei einer Solidarischen Landwirtschaft (Solawi) teilen sich Mitglieder die Kosten eines Hofs und bekommen dafür regelmäßig einen Anteil der Ernte – meist Gemüse, manchmal auch Brot, Eier oder Milch.',
      'Abgeholt wird an festen Tagen am Hof oder an Verteilstellen. Einen Laden mit Öffnungszeiten gibt es meist nicht; frag beim Hof nach freien Anteilen.'] },
];
for (const t of WEITERE_TYPEN) t.arten = [];
for (const t of TYPEN) { t.liste = eintraege.filter((e) => t.arten.includes(e.art)); t.pfadSlug = slugify(t.plural); }
for (const t of WEITERE_TYPEN) { t.liste = eintraege.filter(t.passt); t.pfadSlug = t.slug; }
// Weitere Kategorien mit Seiten auf Bundesland- und Kreisebene
const AUTOMATEN = { slug: 'hofladen-automaten', pfadSlug: 'hofladen-automaten', name: 'Hofladen-Automat', plural: 'Hofladen-Automaten', icon: ICON.automat,
  liste: eintraege.filter((e) => e.typ === 'automat'),
  kurz: 'Alle Hofautomaten: Milchtankstellen, Eierautomaten, Regiomaten, Fleisch- und Kartoffelautomaten.',
  text: ['Hofladen-Automaten verkaufen Lebensmittel direkt vom Hof – auch dann, wenn der Hofladen geschlossen hat. Dazu gehören Milchtankstellen, Eierautomaten, Regiomaten mit gemischtem Sortiment sowie Fleisch-, Wurst- und Kartoffelautomaten.',
    'Viele Automaten sind rund um die Uhr zugänglich. Bezahlt wird meist mit Münzen oder Scheinen, immer öfter auch mit Karte. Mit dem Filter „Jetzt geöffnet“ siehst du, welche Automaten gerade erreichbar sind.'] };
const BIO = { slug: 'bio-hofladen', pfadSlug: 'bio-hofladen', name: 'Bio-Hofladen', plural: 'Bio-Hofläden', icon: ICON.blatt,
  liste: eintraege.filter((e) => e.bio),
  kurz: 'Hofläden und Automaten mit Bio-Angebot.',
  text: ['Als Bio gekennzeichnet sind Höfe, die laut OpenStreetMap ausschließlich oder teilweise Bio-Produkte verkaufen.',
    'Ob ein Betrieb zertifiziert ist, erkennst du am EU-Bio-Logo und an der Öko-Kontrollstellennummer (z. B. DE-ÖKO-006) auf der Ware oder am Hof.'] };
const WEITERE_AKTIV = WEITERE_TYPEN.filter((t) => t.liste.length >= MIN_SEITE);
const KAT_TYPEN = [...TYPEN, AUTOMATEN, BIO, ...WEITERE_AKTIV];
// Typseite zur Art eines Eintrags (nur, wenn es die Seite gibt)
const artTyp = (e) => [...TYPEN, ...WEITERE_AKTIV].find((t) => t.slug === ART_TYP[e.art]) || null;
// Saisonprodukte mit eigener Seite: Höfe, die das Produkt im Namen, in der Beschreibung oder im Angebot (OSM) nennen
const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
// Eine Seite je Sorte aus dem Saisonkalender. Höfe gehören dazu, wenn Name, Beschreibung oder OSM-Produkte die Sorte nennen.
// Unter drei passenden Höfen bleibt die Seite noindex und zeigt die Umkreissuche nach der Produktgruppe.
const SORTEN = {
  Spargel: ['spargel', /spargel/i, 'Spargelhöfe', 'gemuese'], Rhabarber: ['rhabarber', /rhabarber/i, 'Höfe mit Rhabarber', 'gemuese'],
  Erdbeeren: ['erdbeeren', /erdbeer/i, 'Erdbeerhöfe', 'obst'], Kirschen: ['kirschen', /kirsch/i, 'Höfe mit Kirschen', 'obst'],
  Himbeeren: ['himbeeren', /himbeer/i, 'Höfe mit Himbeeren', 'obst'], Heidelbeeren: ['heidelbeeren', /heidelbeer|blaubeer/i, 'Höfe mit Heidelbeeren', 'obst'],
  'Pflaumen und Zwetschgen': ['pflaumen-zwetschgen', /pflaume|zwetsch|zwetschg/i, 'Höfe mit Pflaumen und Zwetschgen', 'obst'],
  Äpfel: ['aepfel', /apfel|äpfel|obsthof/i, 'Obsthöfe mit Äpfeln', 'obst'], Birnen: ['birnen', /birne/i, 'Höfe mit Birnen', 'obst'],
  Walnüsse: ['walnuesse', /walnuss|walnüss/i, 'Höfe mit Walnüssen', 'obst'], Kartoffeln: ['kartoffeln', /kartoffel/i, 'Höfe mit Kartoffeln', 'kartoffeln'],
  Möhren: ['moehren', /möhre|moehre|karotte|mohrrübe/i, 'Höfe mit Möhren', 'gemuese'], Zwiebeln: ['zwiebeln', /zwiebel/i, 'Höfe mit Zwiebeln', 'gemuese'],
  Kohlrabi: ['kohlrabi', /kohlrabi/i, 'Höfe mit Kohlrabi', 'gemuese'], Kopfsalat: ['kopfsalat', /kopfsalat|\bsalat/i, 'Höfe mit Salat', 'gemuese'],
  Erbsen: ['erbsen', /erbse/i, 'Höfe mit Erbsen', 'gemuese'], Gurken: ['gurken', /gurke/i, 'Höfe mit Gurken', 'gemuese'],
  Zucchini: ['zucchini', /zucchini/i, 'Höfe mit Zucchini', 'gemuese'], Tomaten: ['tomaten', /tomate/i, 'Höfe mit Tomaten', 'gemuese'],
  'Grüne Bohnen': ['bohnen', /bohne/i, 'Höfe mit Bohnen', 'gemuese'], Zuckermais: ['zuckermais', /zuckermais|maiskolben|\bsweet ?corn/i, 'Höfe mit Zuckermais', 'gemuese'],
  Blumenkohl: ['blumenkohl', /blumenkohl/i, 'Höfe mit Blumenkohl', 'gemuese'], Brokkoli: ['brokkoli', /brokkoli|broccoli/i, 'Höfe mit Brokkoli', 'gemuese'],
  Spinat: ['spinat', /spinat/i, 'Höfe mit Spinat', 'gemuese'], Weißkohl: ['weisskohl', /weißkohl|weisskohl|sauerkraut/i, 'Höfe mit Weißkohl', 'gemuese'],
  'Rote Bete': ['rote-bete', /rote be(e)?te/i, 'Höfe mit Roter Bete', 'gemuese'], Kürbis: ['kuerbis', /kürbis|kuerbis/i, 'Kürbishöfe', 'gemuese'],
  Porree: ['porree', /porree|\blauch/i, 'Höfe mit Porree', 'gemuese'], Feldsalat: ['feldsalat', /feldsalat/i, 'Höfe mit Feldsalat', 'gemuese'],
  Pastinaken: ['pastinaken', /pastinak/i, 'Höfe mit Pastinaken', 'gemuese'], Rosenkohl: ['rosenkohl', /rosenkohl/i, 'Höfe mit Rosenkohl', 'gemuese'],
  Grünkohl: ['gruenkohl', /grünkohl|gruenkohl/i, 'Höfe mit Grünkohl', 'gemuese'],
};
const SAISON_SEITEN = SAISON.filter(([n]) => SORTEN[n]).map(([name, frisch, lager = []]) => {
  const [slug, re, plural, gruppe] = SORTEN[name];
  const liste = eintraege.filter((e) => re.test([e.name, e.beschreibung, ...(e.produkte || [])].filter(Boolean).join(' ')));
  return { name, slug, re, plural, gruppe, frisch, lager, liste, pfad: `/saisonkalender/${slug}/`, indexiert: liste.length >= MIN_SEITE };
});
const SAISON_NACH_NAME = new Map(SAISON_SEITEN.map((x) => [x.name, x]));
// Saisonale Startseite: Akzentfarbe und Motive wechseln jeden Monat (aus dem Saisonkalender)
const MONATS_FARBE = [null, '#CDE3F0', '#E8D9B5', '#C9E4A6', '#EDE3C0', '#EDE3C0', '#F5A3A8', '#F4A6B5', '#C3B1EC', '#F6C46A', '#F59E4C', '#D7B98E', '#9FD3B4'];
const MONATS_NAME = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function saisonBand() {
  const m = MONAT_JETZT;
  const frisch = SAISON.filter(([, f]) => f.includes(m)).map(([n]) => n);
  const namen = (frisch.length ? frisch : SAISON.filter(([, , l]) => (l || []).includes(m)).map(([n]) => n)).slice(0, 4);
  const motive = m === 12 ? ['weihnachtsbaeume'] : [];
  for (const n of namen) { const g = SORTEN[n]?.[3]; if (g && !motive.includes(g)) motive.push(g); }
  if (!motive.length) motive.push('eier', 'milch');
  const links = namen.map((n) => esc(n));
  return `<p class="saison-band" style="--saison:${MONATS_FARBE[m]}"><span class="saison-motive" aria-hidden="true">${motive.slice(0, 3).map((k) => `<span>${produktIcon(k)}</span>`).join('')}</span><span>Jetzt im ${MONATS_NAME[m]}: ${m === 12 ? 'Weihnachtsbäume vom Hof, ' : ''}${nennung(links)} · <a href="#saison-jetzt">Was gerade wächst</a></span></p>`;
}
const saisonJetzt = JSON.stringify(SAISON.map(([n, frisch, lager]) => [n, frisch, lager || [], SAISON_NACH_NAME.get(n)?.pfad || '/saisonkalender/']));
// Monat beim Bauen; im Browser wird bei einem anderen Monat neu gerechnet (data-saison-stand)
const MONAT_JETZT = +new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(5, 7);
const monatsSpanne = (ms) => { if (!ms.length) return ''; const s = [...ms]; // zusammenhängend, auch über den Jahreswechsel
  let start = s.findIndex((m, i) => !s.includes(((m + 10) % 12) + 1)); if (start < 0) start = 0;
  return `${MONATSNAMEN[s[start] - 1]} bis ${MONATSNAMEN[s[(start + s.length - 1) % s.length] - 1]}`; };
const ANGEBOT = { eier: ['Eier vom Hof', 'Eiern'], milch: ['Milch vom Hof', 'Milch'], kaese: ['Käse vom Hof', 'Käse'], fleisch: ['Fleisch & Wurst vom Hof', 'Fleisch und Wurst'],
  gemuese: ['Gemüse vom Hof', 'Gemüse'], obst: ['Obst vom Hof', 'Obst'], kartoffeln: ['Kartoffeln vom Hof', 'Kartoffeln'], honig: ['Honig vom Hof', 'Honig'],
  brot: ['Brot vom Hof', 'Brot'], getraenke: ['Saft & Wein vom Hof', 'Saft und Wein'], blumen: ['Blumen vom Feld', 'Blumen'],
  weihnachtsbaeume: ['Weihnachtsbäume vom Hof', 'Weihnachtsbäumen'], gefluegel: ['Geflügel vom Hof', 'Geflügel'], wild: ['Wild vom Hof', 'Wild'],
  fisch: ['Fisch vom Hof', 'Fisch'], nudeln: ['Nudeln vom Hof', 'Nudeln'], marmelade: ['Marmelade vom Hof', 'Marmelade'], tierfutter: ['Tierfutter vom Hof', 'Tierfutter'] };
const ANGEBOT_SEITEN = Object.keys(ANGEBOT).filter((kat) => eintraege.filter((e) => e.kat.includes(kat)).length >= 30);
// Weihnachtsbäume vom Hof (Saisonseite, Einträge über Name/Beschreibung oder Angebot des Betriebs)
const WEIHNACHT = eintraege.filter((e) => e.kat.includes('weihnachtsbaeume'));

// ---------- Wochenmärkte (OSM amenity=marketplace, data/osm-maerkte.json) ----------
const MAERKTE = (existsSync(join(ROOT, 'data', 'osm-maerkte.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'osm-maerkte.json'), 'utf8')) : [])
  .filter((m) => kreise.has(m.kreis));
const maerkteProKreis = new Map();
for (const m of MAERKTE) {
  m.ortAnzeige = m.ort || m.ortNah;
  // Namen wie „Wochenmarkt“ allein bekommen den Ort dazu, damit Karte und Listen unterscheidbar bleiben
  m.titel = !m.name ? `Wochenmarkt in ${m.ortAnzeige}` : /^(wochen|bauern|frische|grün|gruen)?markt(platz)?$/i.test(m.name.trim()) ? `${m.name.trim()} ${m.ortAnzeige}` : m.name;
  m.adresse = [m.strasse, [m.plz, m.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || `${m.ortNah} (${m.plzNah})`;
  m.anker = `markt-${m.osm.replace('/', '-')}`;
  if (!maerkteProKreis.has(m.kreis)) maerkteProKreis.set(m.kreis, []);
  maerkteProKreis.get(m.kreis).push(m);
}
for (const l of maerkteProKreis.values()) l.sort((a, b) => (b.oeffnungszeiten ? 1 : 0) - (a.oeffnungszeiten ? 1 : 0) || a.ortAnzeige.localeCompare(b.ortAnzeige, 'de') || a.titel.localeCompare(b.titel, 'de'));
const MARKT_SEITE_AB = MIN_SEITE; // eigene Kreisseite für Märkte ab 3 Märkten
const marktPfad = (k) => `/wochenmaerkte/${k.landSlug}/${k.pfad.split('/')[2]}/`;
const marktKarte = (m, H = 'h3') => `<article class="laden laden-markt" id="${m.anker}" data-typ="markt" data-land="${kreise.get(m.kreis)?.land || ''}" data-lat="${m.lat}" data-lon="${m.lon}"${m.oeffnungszeiten ? ` data-oh="${esc(m.oeffnungszeiten)}"` : ''}>
  <div class="laden-symbol" title="Wochenmarkt">${ICON.markt}</div>
  <div class="laden-text">
    <p class="laden-art">${m.ueberdacht ? 'Markthalle' : 'Wochenmarkt'}${m.bio ? ' <span class="bio">Bio</span>' : ''}</p>
    <${H} class="laden-name">${esc(m.titel)}</${H}>
    <p class="laden-adr">${esc(m.adresse)}</p>
    ${m.oeffnungszeiten ? statusHtml(m.oeffnungszeiten, null) : '<p class="st st-leer">Marktzeiten nicht hinterlegt</p>'}
    <p class="aktionen">
      <a class="akt" href="https://www.google.com/maps/dir/?api=1&amp;destination=${m.lat},${m.lon}" rel="nofollow noopener" target="_blank">${ICON.route}Route</a>${m.website ? `<a class="akt" href="${esc(m.website)}" rel="nofollow noopener" target="_blank">${ICON.web}Website</a>` : ''}<a class="akt" href="https://www.openstreetmap.org/${m.osm}" rel="nofollow noopener" target="_blank">${ICON.stift}In OSM bearbeiten</a>
    </p>
  </div>
</article>`;
// Abschnitt auf der Hofladen-Kreisseite: Märkte im Kreis (höchstens sechs) mit Link zur Marktseite
function marktAbschnitt(k) {
  const ms = maerkteProKreis.get(k.code) || [];
  if (!ms.length) return '';
  const ziel = ms.length >= MARKT_SEITE_AB ? marktPfad(k) : null;
  return `<section class="abschnitt maerkte-kurz"><h2>Wochenmärkte ${esc(k.im)}</h2>
  <p>Frisches vom Erzeuger gibt es auch auf ${ms.length === 1 ? 'dem Wochenmarkt' : `${zahl(ms.length)} Wochenmärkten`} ${esc(k.im)}${ziel ? ` – <a href="${ziel}">alle Wochenmärkte ${esc(k.im)}</a>` : ''}.</p>
  <div class="karten-reihe">${ms.slice(0, 6).map((m) => marktKarte(m)).join('')}</div>
</section>`;
}

const akkusativ = (t) => t.name === 'Milchtankstelle' ? 'eine Milchtankstelle' : `einen ${t.name}${/mat$/.test(t.name) ? 'en' : ''}`;
// Seiten je Automatentyp und Kreis (ab zwei Einträgen), z. B. /bayern/landkreis-x/milchtankstellen/
const TYP_KREIS = new Map(); // `${t.slug}|${kreis-Code}` → { t, k, liste, pfad }
{
  const belegt = new Set([...ORTE.values()].flatMap((m) => [...m.values()].map((o) => o.pfad)));
  for (const t of KAT_TYPEN) {
    const proK = new Map();
    for (const e of t.liste) { if (!proK.has(e.kreis)) proK.set(e.kreis, []); proK.get(e.kreis).push(e); }
    for (const [code, liste] of proK) {
      if (liste.length < MIN_SEITE) continue;
      const k = kreise.get(code);
      // keine Doppelungen: Automaten-Seite nur, wenn sie mehr zeigt als eine Typ-Seite; Bio nur, wenn nicht alle Bio sind
      if (t === AUTOMATEN && TYPEN.some((x) => TYP_KREIS.get(`${x.slug}|${code}`)?.liste.length === liste.length)) continue;
      if (t === BIO && liste.length === (proKreis.get(code) || []).length) continue;
      const pfad = `${k.pfad}${t.pfadSlug}/`;
      if (belegt.has(pfad)) continue;
      TYP_KREIS.set(`${t.slug}|${code}`, { t, k, liste, pfad });
    }
  }
}
const typKreis = (t, k) => TYP_KREIS.get(`${t.slug}|${k.code}`);
const typKreisLinks = (k, ausser) => KAT_TYPEN.map((t) => typKreis(t, k)).filter((x) => x && x.t !== ausser);
// Kategorieseiten je Bundesland, z. B. /bayern/milchtankstellen/
const LAND_KAT = new Map(); // `${t.slug}|${land-Code}` → { t, l, liste, pfad }
for (const t of KAT_TYPEN) for (const l of laender) {
  const liste = t.liste.filter((e) => e.k.land === l.code);
  // Liegen alle Einträge in einem Kreis (z. B. Stadtstaaten), genügt die Kreisseite
  if (new Set(liste.map((e) => e.kreis)).size === 1 && typKreis(t, liste[0].k)) continue;
  if (liste.length >= MIN_SEITE) LAND_KAT.set(`${t.slug}|${l.code}`, { t, l, liste, pfad: `/${l.slug}/${t.pfadSlug}/` });
}
const landKat = (t, l) => LAND_KAT.get(`${t.slug}|${l.code}`);
const KATEGORIE_PFADE = new Set([...TYP_KREIS.values(), ...LAND_KAT.values()].map((x) => x.pfad));

schreibe('/', seite({
  titel: passend(`Hofladen in der Nähe finden – ${zahl(eintraege.length)} Höfe & Automaten`, `Hofladen in der Nähe finden – ${zahl(eintraege.length)} Höfe`),
  beschreibung: `Hofladen in der Nähe finden: ${zahl(eintraege.length)} Hofläden, Milchtankstellen und Eierautomaten in ganz Deutschland – mit Öffnungszeiten, Angebot und Route.`,
  pfad: '/',
  klasse: 'start',
  kopfSuche: false,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'Organization', name: cfg.name, url: cfg.domain + '/', logo: cfg.domain + '/icon-512.png' },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.name, url: cfg.domain + '/', inLanguage: 'de-DE' }],
  inhalt: `
<section class="held">
  <div class="held-text">
    <h1>Hofläden in deiner Nähe</h1>
    <p class="held-lead">${zahl(eintraege.length)} Hofläden und Hofautomaten in ganz Deutschland – mit Öffnungszeiten, Angebot und Weg dorthin.</p>
    ${saisonBand()}
    <form class="plz-gross" action="/suche" method="get">
      <label for="plz">Postleitzahl, Ort, Name des Hofs – gern mit Produkt</label>
      <div class="plz-zeile">
        <input id="plz" name="q" ${SUCHFELD} placeholder="z. B. Spargel Cottbus" required>
        <button type="submit" aria-label="Hofläden finden"><span class="knopf-lang">Hofläden finden</span><span class="knopf-kurz">Suchen</span></button>
      </div>
      <p class="fehler" id="plz-fehler" hidden>Diese Postleitzahl kennen wir nicht. Bitte prüfe die fünf Ziffern.</p>
      <div class="ort-auswahl" id="ort-auswahl" hidden></div>
      <fieldset class="wunsch">
        <legend>Was suchst du? (optional – wir zeigen dann nur passende Höfe)</legend>
        ${['eier', 'milch', 'fleisch', 'gemuese', 'obst', 'kartoffeln', 'honig', 'kaese'].map((k) => `<label><input type="checkbox" name="produkt" value="${k}"><span>${esc(KATEGORIEN[k])}</span></label>`).join('\n        ')}
      </fieldset>
    </form>
    <button type="button" class="standort" id="standort">${ICON.route}Meinen Standort verwenden</button>
    <p class="zuletzt" id="zuletzt" hidden></p>
  </div>
  <figure class="held-karte">
    <img src="/img/deutschland.svg?v=${KARTE_VERSION}" decoding="async" width="${KARTE_GROESSE[0]}" height="${KARTE_GROESSE[1]}" alt="Deutschlandkarte aus ${zahl(eintraege.length)} gelben Punkten – jeder Punkt ist ein Hofladen oder Hofautomat.">
    <figcaption>Jeder Punkt ein Hof. <a href="/karte/">Zur Karte</a></figcaption>
  </figure>
</section>
<section id="naehe" class="abschnitt naehe" hidden></section>
<section class="abschnitt arten">
  <h2>Was du hier findest</h2>
  <ul class="arten-liste">
    <li>${ICON.hofladen}<div><h3>Hofläden</h3><p>Verkauf direkt auf dem Hof: Gemüse, Obst, Eier, Fleisch, Käse und was die Saison hergibt.</p><p class="anzahl">${zahl(anzHof)} Einträge</p></div></li>
    ${TYPEN.map((t) => `<li>${t.icon}<div><h3><a href="/${t.slug}/">${t.plural}</a></h3><p>${t.kurz}</p><p class="anzahl">${zahl(t.liste.length)} Einträge</p></div></li>`).join('\n    ')}
  </ul>
  <p class="typ-chips start-kategorien">${MAERKTE.length ? `<a href="/wochenmaerkte/">${ICON.markt}Wochenmärkte <span>${zahl(MAERKTE.length)}</span></a>` : ''}${WEIHNACHT.length && [10, 11, 12].includes(new Date().getMonth() + 1) ? `<a href="/weihnachtsbaum-vom-hof/">${ICON.tanne}Weihnachtsbaum vom Hof <span>${zahl(WEIHNACHT.length)}</span></a>` : ''}<a href="/hofladen-automaten/">${ICON.automat}Alle Hofladen-Automaten <span>${zahl(AUTOMATEN.liste.length)}</span></a><a href="/bio-hofladen/">${ICON.blatt}Bio-Hofläden <span>${zahl(BIO.liste.length)}</span></a><a href="/sonntags-geoeffnet/">Sonntags geöffnet</a>${ANGEBOT_SEITEN.slice(0, 6).map((k) => `<a href="/angebot/${k}/">${esc(KATEGORIEN[k])}</a>`).join('')}</p>
</section>
<section class="abschnitt news-start" data-news-start hidden><h2>Neu und frisch auf den Höfen</h2><ul class="news-liste" data-news-start-liste></ul><p class="leise">Meldungen der Betriebe. Du hast einen Hof? <a href="/betrieb/">Neuigkeiten selbst veröffentlichen</a>.</p></section>
<section class="abschnitt saison-jetzt" id="saison-jetzt" data-saison='${esc(saisonJetzt)}' data-saison-stand="${MONAT_JETZT}">
  <h2>Gerade frisch vom Feld</h2>
  <div data-saison-inhalt>${saisonMonatHtml(MONAT_JETZT)}</div>
  <p class="saison-suche-links">Höfe in deiner Nähe finden: <a href="#plz" data-wunsch="gemuese">mit Gemüse</a> · <a href="#plz" data-wunsch="obst">mit Obst</a> · <a href="#plz" data-wunsch="kartoffeln">mit Kartoffeln</a></p>
  <p><a href="/saisonkalender/">Ganzen Saisonkalender ansehen</a></p>
</section>
<section class="abschnitt laender">
  <h2>Hofläden nach Bundesland</h2>
  <ul class="laender-liste">
    ${laender.map((l) => `<li><a href="/${l.slug}/"><span>${esc(l.name)}</span><span class="zahl">${zahl(l.anzahl)}</span></a></li>`).join('\n    ')}
  </ul>
</section>
<section class="abschnitt">
  <h2>Hofläden in großen Städten</h2>
  <ul class="kreis-liste">${GROSSSTAEDTE.map((x) => `<li><a href="${x.pfad}"><span>Hofläden in ${esc(x.name)}</span><span class="zahl">${zahl(x.n)}</span></a></li>`).join('')}</ul>
</section>
<section class="abschnitt">
  <h2>Beliebte Orte für Hofläden</h2>
  <ul class="kreis-liste">${ortSeiten.slice().sort((a, b) => b.liste.length - a.liste.length).slice(0, 30).map((o) => `<li><a href="${o.pfad}"><span>Hofläden in ${esc(o.ortTitel)}</span><span class="zahl">${zahl(o.liste.length)}</span></a></li>`).join('')}</ul>
</section>
<section class="abschnitt seo-text">
  <h2>Hofladen in der Nähe finden</h2>
  <p>Ein Hofladen – auch Bauernladen oder Hofverkauf genannt – ist der direkteste Weg zu regionalen Lebensmitteln: Landwirtinnen und Landwirte verkaufen dort, was auf dem eigenen Hof wächst und entsteht. Gib deine Postleitzahl ein, und du siehst alle Hofläden und Direktvermarkter in deiner Umgebung, sortiert nach Entfernung, mit Öffnungszeiten und Route.</p>
  <h3>Mehr als Kartoffeln und Eier</h3>
  <p>Im Hofladen gibt es je nach Betrieb Obst und Gemüse der Saison, Kartoffeln, Eier, Milch und Käse, Fleisch und Wurst aus eigener Schlachtung, Honig, Brot, Säfte und Wein. Viele Höfe verkaufen auch Bio-Produkte. Was gerade geerntet wird, zeigt dir unser <a href="/saisonkalender/">Kalender für Obst und Gemüse</a>; alle Standorte auf einen Blick findest du auf der <a href="/karte/">Karte aller Hofläden</a>.</p>
  <h3>Sonntags einkaufen, Bio vom Hof</h3>
  <p>Am Wochenende unterwegs? Diese <a href="/sonntags-geoeffnet/">Hofläden haben sonntags geöffnet</a>. Wer Wert auf ökologischen Anbau legt, findet hier alle <a href="/bio-hofladen/">Bio-Hofläden nach Region</a>.</p>
  <h3>Dein Hof fehlt?</h3>
  <p>Der Eintrag ist kostenlos: <a href="/mitmachen/">Hof kostenlos eintragen</a> – für Hofläden, Milchtankstellen, Eierautomaten und Regiomaten.</p>
  <h3>Einkaufen rund um die Uhr: Milchtankstelle, Eierautomat, Regiomat</h3>
  <p>Wenn der Hofladen geschlossen hat, helfen Hofautomaten weiter: An der <a href="/milchtankstelle/">Milchtankstelle</a> zapfst du frische Milch, ein <a href="/eierautomat/">Eierautomat</a> hat Eier vom Hof, und im <a href="/regiomat/">Regiomat</a> findest du Wurst, Kartoffeln, Nudeln und mehr aus der Region – oft auch nachts und am Wochenende.</p>
</section>`,
}));

// ---------- Typseiten (Milchtankstelle, Eierautomat, Regiomat; Imker, Selbstpflücken, Hofcafés, Solawi) ----------
for (const t of [...TYPEN, ...WEITERE_AKTIV]) {
  const proLand = laender.map((l) => ({ l, liste: t.liste.filter((e) => e.k.land === l.code) })).filter((x) => x.liste.length);
  const vollListe = t.liste.length <= 800;
  schreibe(`/${t.slug}/`, seite({
    titel: passend(`${t.name} in der Nähe – alle ${zahl(t.liste.length)} ${t.plural} in Deutschland`, `${t.name} in der Nähe – ${zahl(t.liste.length)} ${t.plural}`, `${t.h1 || t.name} in der Nähe – ${zahl(t.liste.length)} in Deutschland`, `${t.name} in der Nähe – ${zahl(t.liste.length)} Standorte`, `${t.h1 || t.plural} in Deutschland`),
    beschreibung: `${t.name} in der Nähe finden: ${zahl(t.liste.length)} ${t.plural} in ganz Deutschland mit Adresse, Öffnungszeiten und Route – nach Bundesland und Landkreis sortiert.`,
    pfad: `/${t.slug}/`,
    jsonld: [itemList(`${t.plural} in Deutschland`, vollListe ? proLand.flatMap(({ liste }) => {
      const proK = new Map(); for (const e of liste) { if (!proK.has(e.k)) proK.set(e.k, []); proK.get(e.k).push(e); }
      return [...proK].sort((a, b) => a[0].titel.localeCompare(b[0].titel, 'de')).flatMap(([, es]) => hofItems(es)); })
      : [...TYP_KREIS.values()].filter((x) => x.t === t).map((x) => [`${t.plural} ${x.k.im}`, x.pfad]))],
    krumen: [[t.plural, `/${t.slug}/`]],
    inhalt: `
<section class="seitenkopf">
  <p class="hof-art typ-icon">${t.icon}</p>
  <h1>${t.h1 || t.plural} in Deutschland</h1>
  <p>${zahl(t.liste.length)} ${t.plural} in ${plural(proLand.length, 'Bundesland', 'Bundesländern')}. Gib deine Postleitzahl ein, um ${t.naechste || (t.name === 'Milchtankstelle' ? 'die nächste Milchtankstelle' : `den nächsten ${t.name}`)} in deiner Nähe zu finden.</p>
  <form class="kopf-suche gross-suche" action="/suche" method="get"><label class="sr" for="typ-plz">Postleitzahl, Ort oder Name des Hofs</label><input id="typ-plz" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required><button type="submit">Suchen</button></form>
</section>
<section class="abschnitt seo-text">${t.text.map((x) => `<p>${x}</p>`).join('')}
  <p>Auch interessant: ${[...TYPEN, ...WEITERE_AKTIV].filter((x) => x !== t).map((x) => `<a href="/${x.slug}/">${x.plural}</a>`).join(', ')}, die <a href="/karte/">Hofladen-Karte</a> mit allen Standorten und der <a href="/saisonkalender/">Saisonkalender</a> für Obst und Gemüse.</p></section>
<nav class="abschnitt sprung-liste" aria-label="Bundesländer"><h2>${t.plural} nach Bundesland</h2><ul class="kreis-liste">${proLand.map(({ l, liste }) => `<li><a href="#${l.slug}"><span>${esc(l.name)}</span><span class="zahl">${zahl(liste.length)}</span></a></li>`).join('')}</ul></nav>
${proLand.map(({ l, liste }) => {
  const proK = new Map();
  for (const e of liste) { if (!proK.has(e.k)) proK.set(e.k, []); proK.get(e.k).push(e); }
  return `<section class="abschnitt typ-land" id="${l.slug}"><h2>${t.plural} in ${esc(l.name)}</h2><p><a href="/${l.slug}/">Alle Hofläden in ${esc(l.name)}</a></p>${vollListe
    ? [...proK].sort((a, b) => a[0].titel.localeCompare(b[0].titel, 'de')).map(([k, es]) => `<h3><a href="${typKreis(t, k)?.pfad || k.pfad}">${esc(k.titel)}</a></h3><ul class="eintrag-liste">${es.map((e) => `<li><a href="${e.pfad}">${esc(e.titelSeite)}</a> <span class="zahl">${esc(e.ortAnzeige)}</span></li>`).join('')}</ul>`).join('')
    : `<ul class="kreis-liste">${[...proK].sort((a, b) => b[1].length - a[1].length).map(([k, es]) => `<li><a href="${typKreis(t, k)?.pfad || k.pfad}"><span>${esc(k.titel)}</span><span class="zahl">${zahl(es.length)}</span></a></li>`).join('')}</ul>`}</section>`;
}).join('\n')}`,
  }));
}

// ---------- Bundesland- und Kreisseiten ----------
for (const l of laender) {
  const mitDaten = l.kreise.filter((k) => proKreis.get(k.code)?.length);
  const alle = mitDaten.flatMap((k) => proKreis.get(k.code));
  const topOrte = l.kreise.flatMap((k) => [...(ORTE.get(k.code)?.values() || [])]).filter((o) => o.eigen).sort((a, b) => b.liste.length - a.liste.length).slice(0, 24);
  schreibe(`/${l.slug}/`, seite({
    titel: passend(`Hofladen in ${l.name} – ${zahl(l.anzahl)} Hofläden & Hofautomaten nach Kreis`, `Hofladen in ${l.name} – ${zahl(l.anzahl)} Hofläden & Automaten`, `Hofläden in ${l.name} nach Kreis`),
    beschreibung: `Hofladen in ${l.name} finden: ${zaehlung(alle)} – nach Landkreis, Stadt und Ort sortiert, mit Öffnungszeiten, Angebot und Karte.`,
    pfad: `/${l.slug}/`,
    jsonld: [itemList(`Landkreise und Städte in ${l.name}`, l.kreise.filter((k) => (proKreis.get(k.code)?.length || 0) >= MIN_SEITE).map((k) => [k.titel, k.pfad]))],
    krumen: [[l.name, `/${l.slug}/`]],
    inhalt: `
<section class="seitenkopf">
  <h1>Hofläden in ${esc(l.name)}</h1>
  <p>${plural(l.anzahl, 'Eintrag', 'Einträge')} in ${plural(mitDaten.length, 'Kreis', 'Kreisen')}. Wähle deinen Landkreis oder deine Stadt – oder gib oben deine Postleitzahl ein.</p>
</section>
<section class="abschnitt">
  <h2>Hofläden nach Landkreis und Stadt</h2>
  <ul class="kreis-liste">
    ${l.kreise.map((k) => { const n = proKreis.get(k.code)?.length || 0;
      return `<li><a href="${k.pfad}"${n ? '' : ' class="leer"'}><span>${esc(k.titel)}</span><span class="zahl">${n ? zahl(n) : '–'}</span></a></li>`; }).join('\n    ')}
  </ul>
</section>
${topOrte.length ? `<section class="abschnitt">
  <h2>Orte mit den meisten Hofläden in ${esc(l.name)}</h2>
  <ul class="kreis-liste">${topOrte.map((o) => `<li><a href="${o.pfad}"><span>${esc(ortUeberschrift(o).replace(/ in .*/, ''))} in ${esc(o.ort)}</span><span class="zahl">${zahl(o.liste.length)}</span></a></li>`).join('')}</ul>
</section>` : ''}
${KAT_TYPEN.some((t) => landKat(t, l)) ? `<section class="abschnitt"><h2>Nach Kategorie in ${esc(l.name)}</h2><p class="typ-chips">${KAT_TYPEN.map((t) => landKat(t, l)).filter(Boolean).map((x) => `<a href="${x.pfad}">${x.t.icon}${x.t.plural} <span>${zahl(x.liste.length)}</span></a>`).join('')}</p></section>` : ''}
<section class="abschnitt seo-text">
  <h2>Hofladen in ${esc(l.name)}: Überblick</h2>
  ${gebietsText(alle, `in ${l.name}`, { orteNennen: false })}
  ${typLinks(alle, l.slug)}
</section>
<section class="abschnitt">
  <h2>Hofläden in anderen Bundesländern</h2>
  <ul class="kreis-liste">${laender.filter((x) => x !== l).map((x) => `<li><a href="/${x.slug}/"><span>${esc(x.name)}</span><span class="zahl">${zahl(x.anzahl)}</span></a></li>`).join('')}</ul>
</section>`,
  }));

  for (const k of l.kreise) {
    const liste = (proKreis.get(k.code) || []).slice().sort((a, b) =>
      a.ortAnzeige.localeCompare(b.ortAnzeige, 'de') || a.titel.localeCompare(b.titel, 'de'));
    const mitte = kreisMitte.get(k.code);
    const nachbarn = [...kreise.values()].filter((x) => x !== k && kreisMitte.get(x.code))
      .map((x) => [distanzKm(mitte.lat, mitte.lon, kreisMitte.get(x.code).lat, kreisMitte.get(x.code).lon), x])
      .sort((a, b) => a[0] - b[0]).slice(0, 8).map(([, x]) => x);
    const im = k.im;
    const orte = [...(ORTE.get(k.code)?.values() || [])].sort((a, b) => b.liste.length - a.liste.length || a.ort.localeCompare(b.ort, 'de'));
    const ortLinks = orte.filter((o) => o.pfad !== k.pfad).map((o) => `<a href="${o.pfad}">${esc(o.ort)}</a>`);
    const z = UMGEBUNG_PFAD.get(k.pfad);
    if (z?.kreisSeite) {
      // Kreisfreie Stadt: Stadtseite mit Umgebung
      const ortListeHtml = ortLinks.length ? `<section class="abschnitt"><h2>Hofläden in Stadtteilen von ${esc(k.name)}</h2><ul class="kreis-liste">${orte.filter((o) => o.pfad !== k.pfad && o.eigen).map((o) => `<li><a href="${o.pfad}"><span>${esc(o.ort)}</span><span class="zahl">${o.liste.length ? zahl(o.liste.length) : ''}</span></a></li>`).join('')}</ul></section>` : '';
      schreibe(k.pfad, umgebungsSeite(z, {
        krumen: [[l.name, `/${l.slug}/`], [k.titel, k.pfad]],
        regionProfil: REGIONEN.get(k.code) || null,
        extraUnten: `${ortListeHtml}${marktAbschnitt(k)}<section class="abschnitt nachbarn"><h2>Hofläden in benachbarten Kreisen</h2><ul class="kreis-liste">${nachbarn.map((x) => `<li><a href="${x.pfad}"><span>${esc(x.titel)}</span><span class="zahl">${zahl(proKreis.get(x.code)?.length || 0)}</span></a></li>`).join('')}</ul></section>`,
      }));
      continue;
    }
    const f = liste.length ? fragenHtml(fragen(liste, im, mitte, { orteLinks: ortLinks }), `Häufige Fragen zu Hofläden ${im}`) : { html: '', ld: [] };
    schreibe(k.pfad, seite({
      titel: liste.length > 1 ? passend(`Hofladen ${im} – ${zaehlungKurz(liste)} mit Öffnungszeiten`, `Hofladen ${im} – ${zaehlungKurz(liste)}`, `Hofladen ${im} – ${plural(liste.length, 'Eintrag', 'Einträge')}`, `Hofladen ${im}`)
        : liste.length ? passend(`Hofladen ${im} – Öffnungszeiten, Adresse & Route`, `Hofladen ${im} – Öffnungszeiten`, `Hofladen ${im}`) : `Hofladen ${im} – Hofläden in der Umgebung`,
      beschreibung: liste.length
        ? `Hofladen ${im} finden: ${zaehlung(liste)}${orte.length > 1 ? `, u. a. in ${orte.slice(0, 3).map((o) => o.ort).join(', ')}` : ''}. Öffnungszeiten, Angebot, Karte und Route.`
        : `Hofläden ${im}: noch keine Einträge – hier findest du Hofläden in der Umgebung.`,
      pfad: k.pfad,
      noindex: liste.length < MIN_SEITE,
      klasse: 'kreis',
      jsonld: [...(liste.length ? [itemList(`Hofläden ${im}`, hofItems(liste))] : []), ...f.ld],
      krumen: [[l.name, `/${l.slug}/`], [k.titel, k.pfad]],
      inhalt: `
<section class="seitenkopf">
  <h1>Hofläden ${esc(im)}</h1>
  <p>${liste.length ? `${zaehlung(liste)} – mit Öffnungszeiten, Angebot und Route.` : `Für ${esc(k.titel)} haben wir noch keine Einträge. In den Nachbarkreisen gibt es welche – oder du <a href="/mitmachen/">trägst einen Hof ein</a>.`}</p>
  ${typKreisLinks(k).length ? `<p class="typ-chips">${typKreisLinks(k).map((x) => `<a href="${x.pfad}">${x.t.icon}${x.t.plural} <span>${zahl(x.liste.length)}</span></a>`).join('')}</p>` : ''}
  <p class="plz-hinweis" data-plz-hinweis hidden></p>
</section>
${liste.length ? filterLeiste(liste) : ''}
<div class="geteilt">
  <div class="liste" data-liste>
    <h2 class="sr">Einträge</h2>
    ${liste.map((e) => karteHtml(kartenDaten(e))).join('\n    ')}
    <p class="leer-filter" data-leer-filter hidden>Keine Einträge passen zu deinem Filter. <button type="button" class="link" data-filter-zuruecksetzen>Filter zurücksetzen</button></p>
    <section class="umgebung" data-umgebung hidden><h2>Ganz in der Nähe, aber in anderen Kreisen</h2><div data-umgebung-liste></div></section>
  </div>
  <aside class="karten-spalte">${kartenPanel({ titel: `Karte: Hofläden ${im}` })}</aside>
</div>
${REGIONEN.has(k.code) ? regionHtml(REGIONEN.get(k.code)) : ''}
${ortLinks.length > 1 ? `<section class="abschnitt">
  <h2>Hofläden nach Ort ${esc(im)}</h2>
  <ul class="kreis-liste">${orte.filter((o) => o.pfad !== k.pfad).map((o) => `<li><a href="${o.pfad}"><span>${esc(o.eigen ? ortUeberschrift(o).replace(/^Hofläden in /, '') : o.ort)}</span><span class="zahl">${o.liste.length ? zahl(o.liste.length) : ''}</span></a></li>`).join('')}</ul>
</section>` : ''}
${marktAbschnitt(k)}
${liste.length ? `<section class="abschnitt seo-text"><h2>Hofladen ${esc(im)}: Überblick</h2>${gebietsText(liste, im, { anker: l.slug })}${typLinks(liste, l.slug, k)}<p>Mehr aus der Region: <a href="/${l.slug}/">alle Hofläden in ${esc(l.name)}</a>.</p></section>` : ''}
${f.html}
<section class="abschnitt nachbarn">
  <h2>Hofläden in der Umgebung</h2>
  <ul class="kreis-liste">${nachbarn.map((x) => `<li><a href="${x.pfad}"><span>${esc(x.titel)}</span><span class="zahl">${zahl(proKreis.get(x.code)?.length || 0)}</span></a></li>`).join('')}</ul>
</section>
${REGIONEN.has(k.code) ? quellenHtml(REGIONEN.get(k.code)) : ''}`,
    }), liste.length >= MIN_SEITE);
  }
}

// ---------- Kategorie je Kreis (Automatentypen, alle Automaten, Bio) ----------
for (const { t, k, liste: roh, pfad } of TYP_KREIS.values()) {
  const liste = roh.slice().sort((a, b) => a.ortAnzeige.localeCompare(b.ortAnzeige, 'de') || a.titel.localeCompare(b.titel, 'de'));
  const n = liste.length;
  const orte = new Map();
  for (const e of liste) orte.set(e.ortAnzeige, (orte.get(e.ortAnzeige) || 0) + 1);
  const ortNamen = [...orte].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).map(([o]) => o);
  const rund = liste.filter((e) => istRund(wocheVon(e))).length;
  const sonntag = liste.filter((e) => e.sonntag).length;
  const mitte = kreisMitte.get(k.code);
  const nachbarn = [...TYP_KREIS.values()].filter((x) => x.t === t && x.k !== k)
    .map((x) => [distanzKm(mitte.lat, mitte.lon, kreisMitte.get(x.k.code).lat, kreisMitte.get(x.k.code).lon), x])
    .sort((a, b) => a[0] - b[0]).slice(0, 8);
  const andere = typKreisLinks(k, t);
  const einzahl = akkusativ(t);
  schreibe(pfad, seite({
    titel: passend(`${t.plural} ${k.im} – ${zahl(n)} Standorte mit Öffnungszeiten`, `${t.plural} ${k.im} – ${zahl(n)} Standorte`, `${t.plural} ${k.im}`, `${t.plural} ${k.titel.replace(/^(Landkreis|Kreis|Region|Regionalverband|Stadtkreis|Städteregion|Kreisfreie Stadt) /, '')}`),
    beschreibung: `${t.plural} ${k.im}: ${zahl(n)} Standorte${ortNamen.length > 1 ? `, u. a. in ${ortNamen.slice(0, 3).join(', ')}` : ` in ${ortNamen[0]}`}. Adresse, Öffnungszeiten, Angebot und Route – plus ${t.plural} in den Nachbarkreisen.`,
    pfad,
    klasse: 'kreis',
    jsonld: [itemList(`${t.plural} ${k.im}`, hofItems(liste))],
    krumen: [[k.landName, `/${k.landSlug}/`], [k.titel, k.pfad], [t.plural, pfad]],
    inhalt: `
<section class="seitenkopf">
  <p class="hof-art typ-icon">${t.icon}</p>
  <h1>${t.plural} ${esc(k.im)}</h1>
  <p>${zahl(n)} ${t.plural} in ${plural(ortNamen.length, 'Ort', 'Orten')}${rund ? `, davon ${zahl(rund)} rund um die Uhr zugänglich` : ''} – mit Adresse, Öffnungszeiten und Route.</p>
  ${andere.length ? `<p class="typ-chips">${andere.map((x) => `<a href="${x.pfad}">${x.t.icon}${x.t.plural} <span>${zahl(x.liste.length)}</span></a>`).join('')}<a href="${k.pfad}">Alle Hofläden <span>${zahl(proKreis.get(k.code).length)}</span></a></p>` : ''}
  <p class="plz-hinweis" data-plz-hinweis hidden></p>
</section>
<div class="geteilt">
  <div class="liste" data-liste>
    <h2 class="sr">Einträge</h2>
    ${liste.map((e) => karteHtml(kartenDaten(e))).join('\n    ')}
    <p class="leer-filter" data-leer-filter hidden></p>
    <section class="umgebung" data-umgebung hidden><h2>Ganz in der Nähe, aber in anderen Kreisen</h2><div data-umgebung-liste></div></section>
  </div>
  <aside class="karten-spalte">${kartenPanel({ titel: `Karte: ${t.plural} ${k.im}` })}</aside>
</div>
<section class="abschnitt seo-text">
  <h2>${t.name} ${esc(k.im)} finden</h2>
  <p>${esc(gross(k.im))} gibt es ${zahl(n)} ${t.plural}: ${nennung(ortNamen.slice(0, 8).map((o) => orte.get(o) > 1 ? `${zahl(orte.get(o))} in ${esc(o)}` : esc(o)))}${ortNamen.length > 8 ? ' und weitere Orte' : ''}.${rund ? ` ${rund === n ? 'Alle sind' : `${zahl(rund)} davon sind`} laut Angabe rund um die Uhr zugänglich.` : ''}${sonntag && sonntag !== rund ? ` Sonntags geöffnet: ${zahl(sonntag)}.` : ''} Gib oben deine Postleitzahl ein, um ${einzahl} in deiner Nähe nach Entfernung sortiert zu sehen.</p>
  ${t.text.map((x) => `<p>${x}</p>`).join('')}
  <p>Mehr aus der Region: <a href="${k.pfad}">alle Hofläden ${esc(k.im)}</a>, <a href="${landKat(t, laender.find((l) => l.code === k.land))?.pfad || `/${t.slug}/#${k.landSlug}`}">${t.plural} in ${esc(k.landName)}</a> und alle <a href="/${t.slug}/">${t.plural} in Deutschland</a>.</p>
</section>
${nachbarn.length ? `<section class="abschnitt nachbarn"><h2>${t.plural} in der Umgebung</h2><ul class="kreis-liste">${nachbarn.map(([, x]) => `<li><a href="${x.pfad}"><span>${esc(x.k.titel)}</span><span class="zahl">${zahl(x.liste.length)}</span></a></li>`).join('')}</ul></section>` : ''}`,
  }));
}

// ---------- „In meiner Nähe“: Standortsuche mit optionalem Filter (Ergebnis per API, Seite bleibt ohne JS vollständig) ----------
const naeheSuche = (filter = {}, text = 'In meiner Nähe suchen') => `<div class="naehe-suche" data-naehe='${esc(JSON.stringify(filter))}'>
  <button type="button" class="knopf knopf-dunkel" data-naehe-start>${ICON.standort}${esc(text)}</button>
  <label class="naehe-offen"><input type="checkbox" data-naehe-offen> nur jetzt geöffnet</label>
  <p class="leise" data-naehe-status hidden></p>
  <div class="karten-reihe" data-naehe-liste></div>
</div>`;
const NAEHE_FILTER = (t) => t === BIO ? { bio: 1 } : t === AUTOMATEN ? { typ: 'automat' } : { art: t.arten.join(',') };

// ---------- Kategorie je Bundesland (kompakte Liste nach Kreis) ----------
for (const { t, l, liste, pfad } of LAND_KAT.values()) {
  const proK = new Map();
  for (const e of liste) { if (!proK.has(e.k)) proK.set(e.k, []); proK.get(e.k).push(e); }
  const kreisListe = [...proK].sort((a, b) => a[0].titel.localeCompare(b[0].titel, 'de'));
  for (const [, es] of kreisListe) es.sort((a, b) => a.ortAnzeige.localeCompare(b.ortAnzeige, 'de') || a.titel.localeCompare(b.titel, 'de'));
  const geordnet = kreisListe.flatMap(([, es]) => es);
  const rund = liste.filter((e) => istRund(wocheVon(e))).length;
  const andere = KAT_TYPEN.filter((x) => x !== t).map((x) => landKat(x, l)).filter(Boolean);
  const top = [...proK].sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([k]) => k.titel);
  schreibe(pfad, seite({
    titel: passend(`${t.plural} in ${l.name} – ${zahl(liste.length)} Standorte nach Kreis`, `${t.plural} in ${l.name} – ${zahl(liste.length)} Standorte`, `${t.plural} in ${l.name}`),
    beschreibung: `${t.plural} in ${l.name}: ${zahl(liste.length)} Standorte in ${plural(proK.size, 'Kreis', 'Kreisen')}, die meisten ${nennung(top.map((x) => x.replace(/^Landkreis /, 'im Landkreis ')))}. Mit Adresse, Öffnungszeiten und Route.`.slice(0, 300),
    pfad,
    klasse: 'kompakt',
    jsonld: [itemList(`${t.plural} in ${l.name}`, hofItems(geordnet))],
    krumen: [[l.name, `/${l.slug}/`], [t.plural, pfad]],
    inhalt: `
<section class="seitenkopf">
  <p class="hof-art typ-icon">${t.icon}</p>
  <h1>${esc(t.plural)} in ${esc(l.name)}</h1>
  <p>${zahl(liste.length)} ${esc(t.plural)} in ${plural(proK.size, 'Kreis', 'Kreisen')}${rund ? `, davon ${zahl(rund)} rund um die Uhr zugänglich` : ''}. Wähle deinen Kreis oder suche ${esc(akkusativ(t))} in deiner Nähe.</p>
  ${naeheSuche(NAEHE_FILTER(t), `${t.plural} in meiner Nähe`)}
  ${andere.length ? `<p class="typ-chips">${andere.map((x) => `<a href="${x.pfad}">${x.t.icon}${x.t.plural} <span>${zahl(x.liste.length)}</span></a>`).join('')}<a href="/${l.slug}/">Alle Hofläden <span>${zahl(l.anzahl)}</span></a></p>` : ''}
</section>
<nav class="abschnitt sprung-liste" aria-label="Kreise"><h2>${esc(t.plural)} nach Kreis</h2><ul class="kreis-liste">${kreisListe.map(([k, es]) => `<li><a href="#k-${k.slug}"><span>${esc(k.titel)}</span><span class="zahl">${zahl(es.length)}</span></a></li>`).join('')}</ul></nav>
${kreisListe.map(([k, es]) => { const tk = typKreis(t, k); return `<section class="abschnitt typ-land" id="k-${k.slug}"><h2>${tk ? `<a href="${tk.pfad}">${esc(t.plural)} ${esc(k.im)}</a>` : `${esc(t.plural)} ${esc(k.im)}`}</h2><ul class="eintrag-liste">${es.map((e) => `<li><a href="${e.pfad}">${esc(e.titelSeite)}</a> <span class="zahl">${esc(e.ortAnzeige)}</span></li>`).join('')}</ul></section>`; }).join('\n')}
<section class="abschnitt seo-text"><h2>${esc(t.name)} in ${esc(l.name)} finden</h2>${t.text.map((x) => `<p>${x}</p>`).join('')}
<p>Alle ${esc(t.plural)} in Deutschland findest du unter <a href="/${t.slug}/">${esc(t.plural)}</a>; alle Höfe in ${esc(l.name)} unter <a href="/${l.slug}/">Hofläden in ${esc(l.name)}</a>.</p></section>`,
  }));
}

// ---------- Alle Hofladen-Automaten (bundesweit) ----------
{
  const t = AUTOMATEN;
  const proLand = laender.map((l) => ({ l, liste: t.liste.filter((e) => e.k.land === l.code) })).filter((x) => x.liste.length);
  const rund = t.liste.filter((e) => istRund(wocheVon(e))).length;
  schreibe('/hofladen-automaten/', seite({
    titel: passend(`Hofladen-Automaten in der Nähe – ${zahl(t.liste.length)} Automaten in Deutschland`, `Hofladen-Automaten in der Nähe – ${zahl(t.liste.length)} Standorte`, `Hofladen-Automat in der Nähe – ${zahl(t.liste.length)} Automaten`),
    beschreibung: `Hofladen-Automat in der Nähe finden: ${zahl(t.liste.length)} Milchtankstellen, Eierautomaten und Regiomaten, ${zahl(rund)} davon rund um die Uhr – mit Öffnungszeiten, Route und „jetzt geöffnet“.`,
    pfad: '/hofladen-automaten/',
    krumen: [['Hofladen-Automaten', '/hofladen-automaten/']],
    jsonld: [itemList('Hofladen-Automaten nach Bundesland', proLand.map(({ l }) => [`Hofladen-Automaten in ${l.name}`, landKat(t, l)?.pfad || `/${l.slug}/`]))],
    inhalt: `
<section class="seitenkopf">
  <p class="hof-art typ-icon">${t.icon}</p>
  <h1>Hofladen-Automaten in Deutschland</h1>
  <p>${zahl(t.liste.length)} Automaten mit Lebensmitteln vom Hof, ${zahl(rund)} davon rund um die Uhr zugänglich. Finde den nächsten – auch nur die, die gerade geöffnet sind.</p>
  ${naeheSuche({ typ: 'automat' }, 'Automaten in meiner Nähe')}
  <p class="typ-chips">${TYPEN.map((x) => `<a href="/${x.slug}/">${x.icon}${x.plural} <span>${zahl(x.liste.length)}</span></a>`).join('')}</p>
</section>
<section class="abschnitt seo-text">${t.text.map((x) => `<p>${x}</p>`).join('')}</section>
<section class="abschnitt"><h2>Hofladen-Automaten nach Bundesland</h2><ul class="kreis-liste">${proLand.map(({ l, liste }) => `<li><a href="${landKat(t, l)?.pfad || `/${l.slug}/`}"><span>${esc(l.name)}</span><span class="zahl">${zahl(liste.length)}</span></a></li>`).join('')}</ul></section>`,
  }));
}

// ---------- Angebot: Produkte vom Hof (bundesweit nach Bundesland und Kreis) ----------
// Produkt-Land-Seiten (/angebot/eier/brandenburg/): nur mit mindestens MIN_SEITE Einträgen
const ANGEBOT_LAND = new Map();
for (const kat of ANGEBOT_SEITEN) for (const l of laender) {
  const liste = l.kreise.flatMap((k) => (proKreis.get(k.code) || []).filter((e) => e.kat.includes(kat)));
  if (liste.length >= MIN_SEITE) ANGEBOT_LAND.set(`${kat}|${l.code}`, { kat, l, liste });
}
for (const { kat, l, liste } of ANGEBOT_LAND.values()) {
  const [titelKurz, mit] = ANGEBOT[kat];
  const pfad = `/angebot/${kat}/${l.slug}/`;
  const proK = new Map();
  for (const e of liste) { if (!proK.has(e.k)) proK.set(e.k, []); proK.get(e.k).push(e); }
  const kreisListe = [...proK].sort((a, b) => b[1].length - a[1].length || a[0].titel.localeCompare(b[0].titel, 'de'));
  const nHof = liste.filter((e) => e.typ === 'hofladen').length;
  const andere = ANGEBOT_SEITEN.filter((x) => x !== kat && ANGEBOT_LAND.has(`${x}|${l.code}`));
  schreibe(pfad, seite({
    titel: passend(`${titelKurz} in ${l.name} – ${zahl(liste.length)} Hofläden & Automaten mit ${mit}`, `${titelKurz} in ${l.name} – ${zahl(liste.length)} Höfe`, `${titelKurz} in ${l.name}`),
    beschreibung: `${titelKurz} in ${l.name}: ${zahl(nHof)} ${nHof === 1 ? 'Hofladen' : 'Hofläden'}${liste.length - nHof ? ` und ${zahl(liste.length - nHof)} Hofautomaten` : ''} mit ${mit} in ${plural(kreisListe.length, 'Kreis', 'Kreisen')} – mit Öffnungszeiten, Adresse und Route.`,
    pfad,
    krumen: [['Angebot', '/angebot/'], [titelKurz, `/angebot/${kat}/`], [l.name, pfad]],
    jsonld: [itemList(`${titelKurz} in ${l.name}`, liste.length <= 200 ? hofItems(liste) : kreisListe.map(([k]) => [k.titel, k.pfad]))],
    inhalt: `
<section class="seitenkopf">
  <h1>${esc(titelKurz)} in ${esc(l.name)}</h1>
  <p>${zahl(liste.length)} Hofläden und Hofautomaten mit ${esc(mit)} in ${plural(kreisListe.length, 'Kreis', 'Kreisen')}. Ein Klick auf den Kreis zeigt die Liste schon auf ${esc(KATEGORIEN[kat])} gefiltert.</p>
  ${naeheSuche({ produkt: kat }, `${KATEGORIEN[kat]} in meiner Nähe`)}
  ${andere.length ? `<p class="typ-chips">${andere.map((x) => `<a href="/angebot/${x}/${l.slug}/">${esc(KATEGORIEN[x])}</a>`).join('')}</p>` : ''}
</section>
${kreisListe.map(([k, es]) => `<section class="abschnitt typ-land" id="k-${k.slug}"><h2><a href="${k.pfad}#produkt=${kat}">${esc(titelKurz)} ${esc(k.im)}</a></h2><ul class="eintrag-liste">${es.map((e) => `<li><a href="${e.pfad}">${esc(e.titelSeite)}</a> <span class="zahl">${esc(e.ortAnzeige)}</span></li>`).join('')}</ul></section>`).join('\n')}
<section class="abschnitt seo-text"><p>Welche Höfe ${esc(mit)} anbieten, leiten wir aus den Angaben in OpenStreetMap, aus offenen Quellen und aus dem Namen des Hofs ab – das Sortiment kann je nach Saison abweichen. Alle Höfe in ${esc(l.name)} findest du auf der <a href="/${l.slug}/">Seite für ${esc(l.name)}</a>.</p></section>`,
  }));
}
for (const kat of ANGEBOT_SEITEN) {
  const [titelKurz, mit] = ANGEBOT[kat];
  const alle = eintraege.filter((e) => e.kat.includes(kat));
  const nHof = alle.filter((e) => e.typ === 'hofladen').length;
  const proLand = laender.map((l) => ({ l, ks: l.kreise.map((k) => [k, (proKreis.get(k.code) || []).filter((e) => e.kat.includes(kat)).length]).filter(([, n]) => n) })).filter((x) => x.ks.length);
  const pfad = `/angebot/${kat}/`;
  schreibe(pfad, seite({
    titel: passend(`${titelKurz} – ${zahl(alle.length)} Hofläden & Automaten mit ${mit}`, `${titelKurz} – ${zahl(alle.length)} Höfe in Deutschland`, titelKurz),
    beschreibung: `${titelKurz} in deiner Nähe: ${zahl(nHof)} Hofläden und ${zahl(alle.length - nHof)} Hofautomaten mit ${mit} – nach Bundesland und Landkreis, mit Öffnungszeiten und Route.`,
    pfad,
    krumen: [['Angebot', '/angebot/'], [titelKurz, pfad]],
    jsonld: [itemList(`${titelKurz} nach Kreis`, proLand.flatMap(({ ks }) => ks.map(([k]) => [k.titel, k.pfad])))],
    inhalt: `
<section class="seitenkopf">
  <h1>${esc(titelKurz)}</h1>
  <p>${zahl(alle.length)} Hofläden und Hofautomaten mit ${esc(mit)}${alle.length - nHof ? `, davon ${zahl(alle.length - nHof)} Automaten` : ''}. Wähle deinen Kreis – die Liste ist dann schon auf ${esc(KATEGORIEN[kat])} gefiltert.</p>
  ${naeheSuche({ produkt: kat }, `${KATEGORIEN[kat]} in meiner Nähe`)}
  <p class="typ-chips">${ANGEBOT_SEITEN.filter((x) => x !== kat).map((x) => `<a href="/angebot/${x}/">${esc(KATEGORIEN[x])}</a>`).join('')}</p>
</section>
<section class="abschnitt seo-text"><p>Welche Höfe ${esc(mit)} anbieten, leiten wir aus den Angaben in OpenStreetMap und aus dem Namen des Hofs ab – das Sortiment kann je nach Saison abweichen.${['obst', 'gemuese', 'kartoffeln'].includes(kat) ? ' Was gerade Saison hat, zeigt der <a href="/saisonkalender/">Saisonkalender</a>.' : ''}</p></section>
<nav class="abschnitt sprung-liste" aria-label="Bundesländer"><h2>Nach Bundesland</h2><ul class="kreis-liste">${proLand.map(({ l, ks }) => `<li><a href="#${l.slug}"><span>${esc(l.name)}</span><span class="zahl">${zahl(ks.reduce((x, [, n]) => x + n, 0))}</span></a></li>`).join('')}</ul></nav>
${proLand.map(({ l, ks }) => `<section class="abschnitt" id="${l.slug}"><h2>${ANGEBOT_LAND.has(`${kat}|${l.code}`) ? `<a href="/angebot/${kat}/${l.slug}/">${esc(titelKurz)} in ${esc(l.name)}</a>` : `${esc(titelKurz)} in ${esc(l.name)}`}</h2><ul class="kreis-liste">${ks.sort((a, b) => b[1] - a[1] || a[0].titel.localeCompare(b[0].titel, 'de')).map(([k, n]) => `<li><a href="${k.pfad}#produkt=${kat}"><span>${esc(k.titel)}</span><span class="zahl">${zahl(n)}</span></a></li>`).join('')}</ul></section>`).join('\n')}`,
  }));
}
schreibe('/angebot/', seite({
  titel: 'Angebot im Hofladen – Eier, Milch, Fleisch, Obst & Gemüse',
  beschreibung: 'Was gibt es im Hofladen? Höfe mit Eiern, Milch, Käse, Fleisch und Wurst, Obst, Gemüse, Kartoffeln, Honig und mehr – nach Angebot sortiert, bundesweit.',
  pfad: '/angebot/',
  krumen: [['Angebot', '/angebot/']],
  jsonld: [itemList('Angebot vom Hof', ANGEBOT_SEITEN.map((k) => [ANGEBOT[k][0], `/angebot/${k}/`]))],
  inhalt: `
<section class="seitenkopf">
  <h1>Angebot vom Hof</h1>
  <p>Finde Hofläden und Automaten nach dem, was du suchst.</p>
</section>
<section class="abschnitt"><ul class="kreis-liste">${ANGEBOT_SEITEN.map((k) => `<li><a href="/angebot/${k}/"><span>${esc(ANGEBOT[k][0])}</span><span class="zahl">${zahl(eintraege.filter((e) => e.kat.includes(k)).length)}</span></a></li>`).join('')}</ul></section>`,
}));
for (const k of ANGEBOT_SEITEN) KATEGORIE_PFADE.add(`/angebot/${k}/`);

// ---------- Übersichten: sonntags geöffnet, Bio ----------
for (const u of [
  { pfad: '/sonntags-geoeffnet/', filter: 'sonntag', test: (e) => e.sonntag,
    titel: (n) => `Hofladen sonntags geöffnet – ${zahl(n)} Hofläden & Automaten`,
    h1: 'Hofläden, die sonntags geöffnet haben',
    beschreibung: (n, h) => `Hofladen sonntags geöffnet: ${zahl(h)} Hofläden und ${zahl(n - h)} Hofautomaten mit Öffnungszeiten am Sonntag – nach Bundesland und Landkreis. Mit Adresse und Route.`,
    text: (n, h) => [`Die meisten Hofläden haben sonntags geschlossen. ${zahl(h)} Hofläden in unserem Verzeichnis haben laut Öffnungszeiten auch am Sonntag geöffnet – oft nur vormittags oder in der Saison, etwa zur Spargel- oder Erdbeerzeit. Dazu kommen ${zahl(n - h)} Milchtankstellen, Eierautomaten und Regiomaten, die sonntags zugänglich sind, viele davon rund um die Uhr.`,
      'Wähle unten deinen Landkreis: Die Liste ist dann schon auf „Sonntags geöffnet“ gefiltert. Öffnungszeiten können sich ändern, besonders an Feiertagen und außerhalb der Saison – im Zweifel vorher anrufen.'] },
  { pfad: '/bio-hofladen/', filter: 'bio', test: (e) => e.bio,
    titel: (n) => `Bio-Hofladen in der Nähe – ${zahl(n)} Bio-Höfe in Deutschland`,
    h1: 'Bio-Hofläden in Deutschland',
    beschreibung: (n, h) => `Bio-Hofladen in der Nähe finden: ${zahl(n)} Hofläden und Hofautomaten mit Bio-Angebot – nach Bundesland und Landkreis, mit Öffnungszeiten und Route.`,
    text: (n, h) => [`${zahl(n)} Einträge sind als Bio gekennzeichnet, darunter ${zahl(h)} Hofläden. Die Angabe stammt aus OpenStreetMap: Dort können Höfe vermerken, dass sie ausschließlich oder teilweise Bio-Produkte verkaufen.`,
      'Ob ein Betrieb zertifiziert ist, erkennst du am EU-Bio-Logo und an der Öko-Kontrollstellennummer (z. B. DE-ÖKO-006) auf der Ware oder am Hof. Wähle unten deinen Landkreis – die Liste ist dann schon auf Bio gefiltert.'] },
]) {
  const alle = eintraege.filter(u.test);
  const nHof = alle.filter((e) => e.typ === 'hofladen').length;
  const proLand = laender.map((l) => ({ l, ks: l.kreise.map((k) => [k, (proKreis.get(k.code) || []).filter(u.test).length]).filter(([, n]) => n) }))
    .filter((x) => x.ks.length);
  const andere = u.filter === 'bio' ? '<a href="/sonntags-geoeffnet/">Hofläden, die sonntags geöffnet haben</a>' : '<a href="/bio-hofladen/">Bio-Hofläden</a>';
  schreibe(u.pfad, seite({
    titel: u.titel(alle.length),
    beschreibung: u.beschreibung(alle.length, nHof),
    pfad: u.pfad,
    jsonld: [itemList(u.h1, proLand.flatMap(({ ks }) => ks.map(([k]) => [k.titel, k.pfad])))],
    krumen: [[u.h1, u.pfad]],
    inhalt: `
<section class="seitenkopf">
  <h1>${esc(u.h1)}</h1>
  <p>${plural(alle.length, 'Eintrag', 'Einträge')} in ${plural(proLand.length, 'Bundesland', 'Bundesländern')}, davon ${plural(nHof, 'Hofladen', 'Hofläden')}.</p>
  <form class="kopf-suche gross-suche" action="/suche" method="get"><label class="sr" for="ueb-q">Postleitzahl, Ort oder Name des Hofs</label><input id="ueb-q" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required><button type="submit">Suchen</button></form>
  ${naeheSuche(u.filter === 'bio' ? { bio: 1 } : { sonntag: 1 }, u.filter === 'bio' ? 'Bio-Höfe in meiner Nähe' : 'Sonntags offene in meiner Nähe')}
</section>
<section class="abschnitt seo-text">${u.text(alle.length, nHof).map((x) => `<p>${x}</p>`).join('')}<p>Auch interessant: ${andere}, die <a href="/karte/">Hofladen-Karte</a> und der <a href="/saisonkalender/">Saisonkalender</a>.</p></section>
<nav class="abschnitt sprung-liste" aria-label="Bundesländer"><h2>Nach Bundesland</h2><ul class="kreis-liste">${proLand.map(({ l, ks }) => `<li><a href="#${l.slug}"><span>${esc(l.name)}</span><span class="zahl">${zahl(ks.reduce((x, [, n]) => x + n, 0))}</span></a></li>`).join('')}</ul></nav>
${proLand.map(({ l, ks }) => { const lk = u.filter === 'bio' && landKat(BIO, l);
  return `<section class="abschnitt" id="${l.slug}"><h2>${lk ? `<a href="${lk.pfad}">${esc(u.h1.replace(' in Deutschland', ''))} in ${esc(l.name)}</a>` : `${esc(u.h1.replace(' in Deutschland', ''))} in ${esc(l.name)}`}</h2><ul class="kreis-liste">${ks.sort((a, b) => b[1] - a[1] || a[0].titel.localeCompare(b[0].titel, 'de')).map(([k, n]) => { const tk = u.filter === 'bio' && typKreis(BIO, k);
    return `<li><a href="${tk ? tk.pfad : `${k.pfad}#filter=${u.filter}`}"><span>${esc(k.titel)}</span><span class="zahl">${zahl(n)}</span></a></li>`; }).join('')}</ul></section>`; }).join('\n')}`,
  }));
}

// ---------- Seiten "Hofläden in <Ort> und Umgebung" (Ortsseiten und kreisfreie Städte) ----------
// Eine Zählung für alle Angaben auf Orts- und Umgebungsseiten: Liste = alle Einträge im Umkreis R (25 km, bei
// wenigen Treffern 50 km), höchstens 150, eigene Einträge des Orts immer dabei. Titel, Intro, Filter und Überblick nutzen sie.
// höchstens 150 Einträge in der Liste
function umkreisZahlen(z) {
  const n = (r) => z.umkreis.filter(([d]) => d <= r).length;
  const [n10, n25, n50] = UMKREISE.map(n);
  const R = n25 >= 10 ? 25 : 50;
  const eigen = new Set(z.eigene);
  const imR = z.umkreis.filter(([d, e]) => d <= R || eigen.has(e));
  const auswahl = imR.filter(([, e]) => eigen.has(e)).concat(imR.filter(([, e]) => !eigen.has(e)).slice(0, Math.max(0, 150 - z.eigene.length)))
    .sort((a, b) => a[0] - b[0]);
  const liste = auswahl.map(([, e]) => e);
  const hof = liste.filter((e) => e.typ === 'hofladen').length, aut = liste.length - hof;
  const gekappt = auswahl.length < imR.length;
  const satz = `${gekappt ? `Die ${zahl(liste.length)} nächsten von ${zahl(imR.length)} Einträgen` : `${zahl(liste.length)} ${liste.length === 1 ? 'Eintrag' : 'Einträge'}`} im Umkreis von ${R} km${hof && aut ? `, davon ${plural(hof, 'Hofladen', 'Hofläden')} und ${zahl(aut)} ${aut === 1 ? 'Automat' : 'Automaten'}` : ''}.`;
  return { auswahl, liste, R, n10, n25, n50, hof, aut, satz, gekappt, gesamt: imR.length };
}

function umgebungsSeite(z, { extraOben = '', extraUnten = '', krumen, regionProfil = null }) {
  const { name, k } = z;
  const zl = umkreisZahlen(z);
  const { auswahl, liste, R, n10, n50 } = zl;
  const wo = `in ${name} und Umgebung`;
  const h1 = `Hofläden in ${name} und Umgebung`;
  const nEigen = z.eigene.length;
  const tn = z.titelName || name, nT = zahl(zl.gesamt);
  const titel = passend(`Hofladen ${tn} und Umgebung – ${nT} Höfe mit Öffnungszeiten`, `Hofladen ${tn} und Umgebung – ${nT} Höfe`, `Hofladen ${tn} und Umgebung`, `Hofladen ${tn}`);
  const beschreibung = `Hofläden in ${name} und Umgebung: ${zl.satz}${nEigen ? ` Direkt in ${name}: ${zaehlung(z.eigene)}.` : ''} Mit Entfernung, Öffnungszeiten und Route.`.slice(0, 300);
  // FAQ aus echten Zahlen
  const automatNah = z.umkreis.find(([, e]) => e.typ === 'automat');
  const f = [
    [`Wie viele Hofläden gibt es in ${name}?`, `${nEigen ? `Direkt in ${esc(name)} sind ${zaehlung(z.eigene)} eingetragen.` : `Direkt in ${esc(name)} ist bisher kein Hofladen eingetragen.`} ${esc(zl.satz)} Bis 10 km sind es ${zahl(n10)}, bis 50 km ${zahl(n50)} Hofläden und Hofautomaten.`],
    [`Welcher Hofladen liegt am nächsten an ${name}?`, `${link(z.umkreis[0][1])} in ${esc(z.umkreis[0][1].ortAnzeige)}, etwa ${km(z.umkreis[0][0])} vom Ortszentrum entfernt.${z.umkreis[1] ? ` Danach folgen ${nennung(z.umkreis.slice(1, 3).map(([d, e]) => `${link(e)} (${km(d)})`))}.` : ''}`],
    ...(automatNah ? [[`Gibt es einen Hofautomaten in der Nähe von ${name}?`, `Ja. Der nächste ist ${link(automatNah[1])} (${esc(automatNah[1].art)}) in ${esc(automatNah[1].ortAnzeige)}, etwa ${km(automatNah[0])} entfernt.`]] : []),
    ...fragen(liste, wo, z).filter(([q]) => !q.startsWith('Wo finde ich')),
  ];
  const faq = fragenHtml(f, `Häufige Fragen: Hofläden in ${name}`);
  const inhalt = `
<section class="seitenkopf">
  <h1>${esc(h1)}</h1>
  <p>${esc(zl.satz)} ${nEigen ? `Direkt in ${esc(name)}: ${zaehlung(z.eigene)}.` : `Direkt in ${esc(name)} ist noch kein Hof eingetragen${auswahl[0] ? ` – der nächste ist ${km(auswahl[0][0])} entfernt: <a href="${auswahl[0][1].pfad}">${esc(auswahl[0][1].titelSeite)}</a> in ${esc(auswahl[0][1].ortAnzeige)}` : ''}. Kennst du einen Hof in ${esc(name)}? <a href="/mitmachen/">Jetzt eintragen</a>.`} Sortiert nach Entfernung vom Ortszentrum, mit Öffnungszeiten und Route.</p>
  ${typKreisLinks(k).length ? `<p class="typ-chips">${typKreisLinks(k).map((x) => `<a href="${x.pfad}">${x.t.icon}${x.t.plural} ${esc(k.im)} <span>${zahl(x.liste.length)}</span></a>`).join('')}</p>` : ''}
  <p class="plz-hinweis" data-plz-hinweis hidden></p>
</section>
${extraOben}
${filterLeiste(liste, { umkreis: UMKREISE.filter((r) => r <= R).map((r) => [r, auswahl.filter(([d]) => d <= r).length]) })}
<div class="geteilt">
  <div class="liste" data-liste>
    <h2 class="sr">Einträge</h2>
    ${auswahl.map(([d, e]) => karteHtml(kartenDaten(e, Math.round(d * 10) / 10))).join('\n    ')}
    <p class="leer-filter" data-leer-filter hidden>Keine Einträge passen zu deinem Filter. <button type="button" class="link" data-filter-zuruecksetzen>Filter zurücksetzen</button></p>
    <section class="umgebung" data-umgebung hidden><h2>Ganz in der Nähe</h2><div data-umgebung-liste></div></section>
  </div>
  <aside class="karten-spalte">${kartenPanel({ titel: `Karte: ${h1}` })}</aside>
</div>
${regionProfil ? regionHtml(regionProfil) : ''}
<section class="abschnitt seo-text"><h2>Hofladen ${esc(name)}: Überblick</h2>${gebietsText(liste, `im Umkreis von ${R} km um ${name}`, { anker: k.landSlug })}${typLinks(z.eigene, k.landSlug, k)}
<p>${z.kreisSeite ? '' : `Alle Einträge im Kreis findest du unter <a href="${k.pfad}">Hofläden ${esc(k.im)}</a>. `}Mehr aus der Region: <a href="/${k.landSlug}/">Hofläden in ${esc(k.landName)}</a>.</p>${z.kreisSeite ? '' : regionTeaser(k)}</section>
${faq.html}
${ortListe(naheOrte(z.lat, z.lon, 9, new Set(ortSeiten.filter((o) => o.pfad === z.pfad))), `Hofläden in Orten in der Nähe von ${name}`)}
${extraUnten}
${regionProfil ? quellenHtml(regionProfil) : ''}`;
  return seite({ titel, beschreibung, pfad: z.pfad, klasse: 'kreis', krumen,
    jsonld: [itemList(h1, hofItems(liste)), ...faq.ld], inhalt });
}

for (const o of ortSeiten) {
  const k = o.k;
  const andereOrte = [...ORTE.get(k.code).values()].filter((x) => x !== o && x.eigen).sort((a, b) => b.liste.length - a.liste.length || a.ort.localeCompare(b.ort, 'de')).slice(0, 12);
  schreibe(o.pfad, umgebungsSeite(o.umgebung, {
    krumen: [[k.landName, `/${k.landSlug}/`], [k.titel, k.pfad], [o.ort, o.pfad]],
    extraUnten: andereOrte.length ? `<section class="abschnitt"><h2>Hofläden in anderen Orten ${esc(k.im)}</h2><ul class="kreis-liste">${andereOrte.map((x) => `<li><a href="${x.pfad}"><span>${esc(x.ort)}</span><span class="zahl">${x.liste.length ? zahl(x.liste.length) : ''}</span></a></li>`).join('')}</ul></section>` : '',
  }));
}

// ---------- Detailseiten ----------
// Bearbeiten-Link mit stabiler ID (bleibt gültig, auch wenn sich der Slug ändert)
// ---------- Veranstaltungen der Betriebe (data/betrieb-export.json aus dem Betreiber-Bereich) ----------
const BETRIEB_EXPORT = existsSync(join(ROOT, 'data', 'betrieb-export.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'betrieb-export.json'), 'utf8')) : { hoefeMitKonto: [], veranstaltungen: [] };
const nachSid = new Map(eintraege.map((e) => [e.sid, e]));
const MIT_KONTO = new Set(BETRIEB_EXPORT.hoefeMitKonto || []);
// Freigegebene Tipps von Besuchern je Hof
for (const t of BETRIEB_EXPORT.tipps || []) { const e = nachSid.get(t.sid); if (e) (e.tipps ??= []).push(t); }
const tippsHtml = (e) => {
  const ts = e.tipps || [];
  const zahl_ = {};
  for (const t of ts) for (const m of String(t.merkmale || '').split(',').filter((x) => TIPP_MERKMALE[x])) zahl_[m] = (zahl_[m] || 0) + 1;
  const texte = ts.filter((t) => t.text).slice(-5).reverse();
  return `<section class="block tipps" data-tipps="${esc(e.sid)}"><h2>Was Besucher sagen</h2>
    ${Object.keys(zahl_).length ? `<p class="tipp-chips">${Object.entries(zahl_).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<span>👍 ${esc(TIPP_MERKMALE[m])}${n > 1 ? ` <b>${n}</b>` : ''}</span>`).join('')}</p>` : ''}
    ${texte.length ? `<ul class="tipp-texte">${texte.map((t) => `<li><p>${esc(t.text)}</p><p class="leise">${t.name ? `${esc(t.name)}, ` : ''}${esc(datumDe((t.geaendert || '').slice(0, 10)))}</p></li>`).join('')}</ul>` : ''}
    ${ts.length ? '' : '<p class="leise">Noch keine Tipps. Warst du schon dort?</p>'}
    <p><button type="button" class="knopf knopf-hell" data-tipp-oeffnen>Tipp geben</button></p>
    <form class="betrieb-form" data-tipp-form hidden>
      <fieldset class="breit"><legend>Was war gut? (bis zu 3)</legend><p class="tipp-auswahl">${Object.entries(TIPP_MERKMALE).map(([k, t]) => `<label><input type="checkbox" name="merkmale" value="${k}"> ${esc(t)}</label>`).join('')}</p></fieldset>
      <label class="breit">Kurzer Tipp (optional) <textarea name="text" maxlength="280" rows="2" placeholder="z. B. Samstags gibt es frisches Brot vom Nachbarhof."></textarea></label>
      <label>Vorname (optional) <input name="name" maxlength="40" autocomplete="given-name"></label>
      <label>E-Mail für den Bestätigungslink <input name="email" type="email" required autocomplete="email"></label>
      <div class="breit" data-turnstile></div>
      <button type="submit" class="knopf">Tipp abschicken</button>
      <p class="leise" data-status aria-live="polite">Wir prüfen jeden Tipp, bevor er erscheint. Die E-Mail-Adresse wird nicht veröffentlicht. Beim Öffnen lädt Cloudflare Turnstile (Spam-Schutz).</p>
    </form></section>`;
};
const TERMINE = BETRIEB_EXPORT.veranstaltungen.map((v) => ({ ...v, e: nachSid.get(v.sid) }))
  .filter((v) => v.e && (v.ende || v.beginn).slice(0, 10) >= HEUTE).sort((a, b) => a.beginn.localeCompare(b.beginn));
const terminZeit = (v) => {
  const d = (x) => new Date(`${x.length === 10 ? `${x}T12:00` : x}:00`.slice(0, 19)).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const u = (x) => (x.length > 10 ? `, ${x.slice(11, 16)} Uhr` : '');
  return v.ende && v.ende.slice(0, 10) !== v.beginn.slice(0, 10) ? `${d(v.beginn)}${u(v.beginn)} bis ${d(v.ende)}${u(v.ende)}` : `${d(v.beginn)}${u(v.beginn)}${v.ende && v.ende.length > 10 ? ` bis ${v.ende.slice(11, 16)} Uhr` : ''}`;
};
const terminLd = (v) => ({ '@context': 'https://schema.org', '@type': 'Event', name: v.titel, startDate: v.beginn, ...(v.ende ? { endDate: v.ende } : {}),
  eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  ...(v.beschreibung ? { description: v.beschreibung } : {}), url: `${cfg.domain}/veranstaltungen/#termin-${v.id}`,
  location: { '@type': 'Place', name: v.e.titelSeite, address: { '@type': 'PostalAddress', streetAddress: v.e.strasse || undefined, postalCode: v.e.plz || undefined, addressLocality: v.e.ortAnzeige, addressCountry: 'DE' } },
  organizer: { '@type': 'Organization', name: v.e.titelSeite, url: cfg.domain + v.e.pfad } });
const terminHtml = (v, mitHof = true) => `<li class="termin" id="termin-${v.id}"><p class="termin-zeit">${esc(terminZeit(v))}</p><h3>${esc(v.titel)}</h3>${mitHof ? `<p><a href="${v.e.pfad}">${esc(v.e.titelSeite)}</a> · ${esc(v.e.ortAnzeige)}, ${esc(v.e.k.landName)}</p>` : ''}${v.beschreibung ? `<p>${esc(v.beschreibung)}</p>` : ''}</li>`;
for (const v of TERMINE) (v.e.termine ??= []).push(v);
const bearbeiten = (e, aktion) => `/mitmachen/?eintrag=${encodeURIComponent(e.sid)}&amp;aktion=${aktion}`;
const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const ZAHLUNG_TEXT = { bar: 'Bargeld', girocard: 'Girocard (EC-Karte)', kreditkarte: 'Kreditkarte', kontaktlos: 'kontaktlos (Karte/Handy)', paypal: 'PayPal', ueberweisung: 'Überweisung' };
const datumDe = (d) => d.split('-').reverse().join('.');
for (const e of eintraege) {
  const k = e.k;
  const o = e.ortSeite;
  // Einträge am selben Hof (unter 50 m, z. B. Hofladen und Milchautomat) getrennt zeigen, nicht als „0 km“
  const amSelbenHof = inDerNaehe(e, 10).filter(([d]) => d <= 0.05);
  const naehe = inDerNaehe(e, 4 + amSelbenHof.length).filter(([d]) => d > 0.05).slice(0, 4);
  const ld = { '@context': 'https://schema.org', '@type': e.typ === 'hofladen' ? 'Store' : 'LocalBusiness', name: e.titelSeite,
    geo: { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lon }, url: cfg.domain + e.pfad };
  ld.address = { '@type': 'PostalAddress', streetAddress: e.strasse || undefined, postalCode: e.plz || undefined,
    addressLocality: e.ortAnzeige, addressRegion: k.landName, addressCountry: 'DE' };
  if (e.telefon) ld.telephone = e.telefon;
  if (e.website) ld.sameAs = [e.website];
  const woche = e.oeffnungszeiten ? parse(e.oeffnungszeiten) : null;
  if (woche && woche.some((iv) => iv.length)) ld.openingHoursSpecification = oeffnungsSpezifikation(woche);
  ld['@id'] = cfg.domain + e.pfad + '#hof';
  if (e.fotos?.length) ld.image = e.fotos.map((f) => cfg.domain + f);
  if (e.email) ld.email = e.email;
  const ohKurz = e.oeffnungszeiten ? (zeilen(e.oeffnungszeiten) || []).map(([t, v]) => `${t} ${v}`).join(', ') : '';
  const uhr = (m) => `${String(Math.floor(m / 60) % 24 || (m >= 1440 ? 24 : 0)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const ohTabelle = woche
    ? `<table class="woche"><tbody>${woche.map((iv, i) => `<tr data-tag="${i}"><th>${TAGE[i]}</th><td>${iv.length ? iv.map(([a, b]) => `${uhr(a)}–${uhr(b)}`).join(', ') : '<span class="zu">geschlossen</span>'}</td></tr>`).join('')}</tbody></table>`
    : e.oeffnungszeiten_text ? `<p>${esc(e.oeffnungszeiten_text)}</p>`
    : e.oeffnungszeiten ? `<p>${esc(uebersetze(e.oeffnungszeiten))}</p>`
    : `<p class="leise">Keine Öffnungszeiten hinterlegt. ${e.typ === 'automat' ? 'Automaten sind meist rund um die Uhr zugänglich.' : 'Am besten vorher anrufen.'}</p>
      <p class="zeiten-cta">Kennst du die Öffnungszeiten? <a href="${bearbeiten(e, 'ergaenzen')}&amp;fokus=zeiten">Sag uns Bescheid</a></p>`;
  const kontakt = [
    e.telefon && `<li>${ICON.telefon}<a href="${telHref(e.telefon)}">${esc(e.telefon)}</a></li>`,
    e.email && `<li>${ICON.mail}<a href="mailto:${esc(e.email)}">${esc(e.email)}</a></li>`,
    e.website && `<li>${ICON.web}<a href="${esc(e.website)}" rel="nofollow noopener" target="_blank">${esc(kurz(e.website))}</a></li>`,
    e.facebook && `<li>${ICON.web}<a href="${esc(e.facebook)}" rel="nofollow noopener" target="_blank">Facebook</a></li>`,
    e.instagram && `<li>${ICON.web}<a href="${esc(e.instagram)}" rel="nofollow noopener" target="_blank">Instagram</a></li>`,
  ].filter(Boolean);
  const imKreis = k.im;
  const artSatz = e.typ === 'hofladen' ? 'ein Hofladen' : e.art === 'Eierautomat' ? 'ein Eierautomat' : e.art === 'Milchtankstelle' ? 'eine Milchtankstelle' : `ein ${e.art}`;
  const naechsterHof = naehe.find(([, x]) => x.typ === 'hofladen');
  const ueber = [
    `${esc(e.titel)} ist ${artSatz} in ${esc(e.ortAnzeige)}${imKreis.endsWith(e.ortAnzeige) ? '' : ` ${esc(imKreis)}`}.`,
    e.kat.length ? `Im Angebot: ${esc(nennung(e.kat.map((x) => KATEGORIEN[x])))}.` : '',
    ohKurz ? `Geöffnet: ${esc(ohKurz)}.` : '',
    naechsterHof ? `Der nächste weitere Hofladen ist <a href="${naechsterHof[1].pfad}">${esc(naechsterHof[1].titelSeite)}</a> in ${esc(naechsterHof[1].ortAnzeige)}, etwa ${km(naechsterHof[0])} entfernt.` : '',
  ].filter(Boolean).join(' ');
  const titelEnthaeltOrt = e.titel.includes(e.ortAnzeige);
  const rund = istRund(woche);
  const merkmale = [
    e.gepflegt?.art === 'uebernahme' && ['Vom Betrieb gepflegt', `Angaben vom Betrieb selbst, Stand ${datumDe(e.gepflegt.stand)}.`],
    e.bio && ['Bio', 'Laut Eintrag verkauft der Hof Bio-Produkte.'],
    e.verband?.length && [e.verband.length > 1 ? 'Bio-Verbände' : 'Bio-Verband', `${esc(nennung(e.verband))} – so steht es im Eintrag. Das Siegel auf der Ware ist maßgeblich.`],
    rund && ['Rund um die Uhr', e.typ === 'automat' ? 'Der Automat ist jederzeit zugänglich.' : 'Laut Öffnungszeiten jederzeit geöffnet.'],
    !rund && e.sonntag && ['Sonntags geöffnet', `Sonntag: ${(woche[6] || []).map(([a, b]) => `${uhr(a)}–${uhr(b)}`).join(', ')}`],
    e.typ === 'automat' ? ['Automat', `${e.art} mit Selbstbedienung.`] : e.selbstbedienung && ['Selbstbedienung', 'Einkauf in Selbstbedienung, meist mit Kasse des Vertrauens.'],
    e.zahlung && ['Bezahlen', e.zahlung.map((z) => ZAHLUNG_TEXT[z]).join(', ')],
    ausstattung(e).length && ['Vor Ort', ausstattung(e).join(', ')],
    e.haltestelle && ['Bus & Bahn', `${HALTE_ART[e.haltestelle.art]}: Haltestelle „${esc(e.haltestelle.name)}“, etwa ${e.haltestelle.m < 100 ? 'unter 100' : e.haltestelle.m} m Luftlinie. Fahrplan und Fußweg bitte vorher prüfen.`],
  ].filter(Boolean);
  const saisonProdukte = SAISON_SEITEN.filter((sp) => sp.liste.includes(e));
  // FAQ nur aus Angaben, die auf der Seite stehen
  const naechsteDrei = naehe.slice(0, 3);
  const hofFragen = [
    woche && ohKurz && [`Wann hat ${e.titel} geöffnet?`, `Laut den hinterlegten Öffnungszeiten: ${esc(ohKurz)}. Gerade in der Saison können sich die Zeiten ändern – im Zweifel vorher anrufen.`],
    woche && !rund && [`Hat ${e.titel} sonntags geöffnet?`, e.sonntag ? `Ja, sonntags ${(woche[6] || []).map(([a, b]) => `${uhr(a)}–${uhr(b)}`).join(' und ')} Uhr.` : 'Nein, laut den hinterlegten Öffnungszeiten ist sonntags geschlossen.'],
    [`Wo befindet sich ${e.titel}?`, `${e.strasse ? `Die Adresse ist ${esc(e.adresse)}` : `${esc(e.titel)} liegt ${esc(e.adresse)}`} (${esc(k.titel)}). Über „Route planen“ startest du die Navigation.`],
    e.kat.length && [`Was gibt es bei ${e.titel}?`, `Im Angebot: ${esc(nennung(e.kat.map((x) => KATEGORIEN[x])))}. Das Sortiment kann je nach Saison abweichen.`],
    e.zahlung && [`Wie kann man bei ${e.titel} bezahlen?`, `Laut Eintrag: ${esc(nennung(e.zahlung.map((z) => ZAHLUNG_TEXT[z])))}.`],
    naechsteDrei.length && [`Welche Hofläden gibt es in der Nähe von ${e.titel}?`, `${nennung(naechsteDrei.map(([d, x]) => `${link(x)}${x.titel.includes(x.ortAnzeige) ? '' : ` in ${esc(x.ortAnzeige)}`} (${km(d)})`))}.`],
  ].filter(Boolean);
  const hofFaq = hofFragen.length >= 3 ? fragenHtml(hofFragen, `Häufige Fragen zu ${e.titel}`) : { html: '', ld: [] };
  const umgebungsSeite = naechsteUmgebungsSeite(e);
  // Sehr lange Namen (OSM-Freitext) im Title kürzen, die H1 bleibt vollständig
  const tn = (() => { if (e.titelSeite.length <= 60 && titelBreite(e.titelSeite) <= TITEL_MAX - 10) return e.titelSeite;
    const w = e.titelSeite.split(' '); while (w.length > 1 && (w.join(' ').length > 58 || titelBreite(`${w.join(' ')} …`) > TITEL_MAX - 10)) w.pop();
    return `${w.join(' ').replace(/[\s,;:(–-]+$/, '')} …`; })();
  schreibe(e.pfad, seite({
    titel: titelEnthaeltOrt
      ? passend(`${tn} – Öffnungszeiten, Angebot & Route`, `${tn} – Öffnungszeiten & Route`, `${tn} – Öffnungszeiten`, tn)
      : passend(`${tn} – ${e.art} in ${e.ortAnzeige}, Öffnungszeiten`, `${tn} – ${e.art} in ${e.ortAnzeige}`, `${tn} in ${e.ortAnzeige}`, tn),
    beschreibung: (() => { const b = `${e.titelSeite}: ${e.art} in ${e.ortAnzeige}${e.ortAnzeige.includes(k.titel) || k.titel.includes(e.ortAnzeige) ? '' : ` (${k.titel})`}.${e.kat.length ? ` Angebot: ${e.kat.map((x) => KATEGORIEN[x]).join(', ')}.` : ''}${ohKurz ? ` Öffnungszeiten: ${ohKurz}.` : ''}${e.telefon ? ` Telefon: ${e.telefon}.` : ''}`;
      return (b.length < 110 ? `${b} Adresse, ${ohKurz ? '' : 'Kontakt, '}Karte und Route${naechsterHof ? ` – plus Hofläden in der Nähe von ${e.ortAnzeige}` : ''}.` : b); })(),
    pfad: e.pfad,
    noindex: e.duenn,
    klasse: 'hof',
    jsonld: [ld, ...hofFaq.ld, ...(e.termine || []).map(terminLd)],
    krumen: [[k.landName, `/${k.landSlug}/`], [k.titel, k.pfad], ...(o?.eigen ? [[o.ort, o.pfad]] : []), [e.titel, e.pfad]],
    inhalt: `
<section class="hof-kopf laden-${e.typ}" data-land="${k.land}"${e.urlaub?.length ? ` data-urlaub="${esc(e.urlaub.map((u) => `${u.von}/${u.bis}`).join(' '))}"` : ''} data-lat="${e.lat}" data-lon="${e.lon}" data-titel="${esc(e.titel)}" data-typ="${e.typ}">
  <p class="hof-art">${typIcon(e.art)}<span>${artTyp(e) ? `<a href="/${artTyp(e).slug}/">${esc(e.art)}</a>` : esc(e.art)} in ${o?.eigen ? `<a href="${o.pfad}">${esc(e.ortAnzeige)}</a>` : esc(e.ortAnzeige)}${e.bio ? ' · Bio' : ''}</span></p>
  <h1>${esc(e.titelSeite)}</h1>
  <p class="hof-adr">${ICON.route}${esc(e.adresse)}</p>
  ${statusHtml(e.oeffnungszeiten, e.oeffnungszeiten_text)}
  <p class="hof-entfernung"><span data-entfernung hidden></span><button type="button" class="link" data-entfernung-start hidden>Wie weit ist das von mir?</button></p>
</section>
<div class="hof-inhalt">
  <aside class="hof-seite">
    <section class="kontaktkarte" aria-labelledby="kk-titel">
      <h2 id="kk-titel">Kontakt &amp; Zeiten</h2>
      <h3 class="kk-unter">Öffnungszeiten${amSelbenHof.length ? ` ${e.typ === 'hofladen' ? 'Hofladen' : esc(e.art)}` : ''}</h3>
      ${ohTabelle}
      ${e.typ === 'hofladen' && istRund(woche) && amSelbenHof.some(([, x]) => x.typ === 'automat') ? `<p class="leise zeiten-hinweis">Laut OpenStreetMap ist der Hofladen rund um die Uhr geöffnet. Am selben Hof steht ein Automat – vermutlich gelten diese Zeiten für den Automaten. Kennst du die Ladenzeiten? <a href="${bearbeiten(e, 'ergaenzen')}&amp;fokus=zeiten">Bitte ergänzen</a>.</p>` : ''}
      ${amSelbenHof.length ? `<h3 class="kk-unter">Am selben Hof</h3><ul class="am-selben-hof">${amSelbenHof.map(([, x]) => `<li><a href="${x.pfad}">${typIcon(x.art)}<span>${esc(x.titel)}</span></a><span class="leise">${esc(x.typ === 'hofladen' ? 'Hofladen' : x.art)}: ${esc(zeitenKurz(x))}</span></li>`).join('')}</ul>` : ''}
      <p class="kk-knoepfe">
        ${e.telefon ? `<a class="knopf knopf-gruen" href="${telHref(e.telefon)}">${ICON.telefon}Anrufen</a>` : ''}
        <a class="knopf knopf-dunkel" href="https://www.google.com/maps/dir/?api=1&amp;destination=${e.lat},${e.lon}" rel="nofollow noopener" target="_blank">${ICON.route}Route planen</a>
        ${e.website ? `<a class="knopf knopf-hell" href="${esc(e.website)}" rel="nofollow noopener" target="_blank">${ICON.web}Website</a>` : ''}
      </p>
      <p class="leise navi-wechsel"><a href="#" data-navi-wechseln>Andere Navi-App wählen</a></p>
      ${kontakt.length ? `<ul class="kontakt">${kontakt.join('')}</ul>` : ''}
      ${e.betreiber && e.betreiber !== e.name ? `<p class="leise">Betreiber: ${esc(e.betreiber)}</p>` : ''}
    </section>
    <nav class="sticky-aktionen" aria-label="Schnellaktionen">
      <a href="https://www.google.com/maps/dir/?api=1&amp;destination=${e.lat},${e.lon}" rel="nofollow noopener" target="_blank">${ICON.route}<span>Route</span></a>
      ${e.telefon ? `<a href="${telHref(e.telefon)}">${ICON.telefon}<span>Anrufen</span></a>` : ''}
      ${e.website ? `<a href="${esc(e.website)}" rel="nofollow noopener" target="_blank">${ICON.web}<span>Website</span></a>` : ''}
      <button type="button" data-merken="${esc(e.slug)}" aria-pressed="false">${ICON.herz}<span>Merken</span></button>
    </nav>
    <nav class="hof-werkzeuge" aria-label="Aktionen">
      <button type="button" data-merken="${esc(e.slug)}" aria-pressed="false">${ICON.herz}<span class="merken-text">Merken</span></button>
      <button type="button" data-teilen data-titel="${esc(e.titelSeite)}">${ICON.teilen}<span>Teilen</span></button>
      <a href="${bearbeiten(e, 'ergaenzen')}">${ICON.stift}<span>Ergänzen</span></a>
    </nav>
    <div class="hof-karte">
      ${e.lageUngefaehr ? '<p class="leise">Die genaue Lage ist noch nicht erfasst.</p>' : kartenPanel({ titel: `Karte: ${e.titel}` })}
      <p class="leise"><a href="https://www.openstreetmap.org/?mlat=${e.lat}&amp;mlon=${e.lon}#map=16/${e.lat}/${e.lon}" rel="nofollow noopener" target="_blank">Auf OpenStreetMap öffnen</a></p>
    </div>
  </aside>
  <div class="hof-info">
    ${e.kat.length ? `<section class="block"><h2>Angebot</h2><ul class="chips gross">${e.kat.map((x) => `<li>${produktIcon(x)}${esc(KATEGORIEN[x])}</li>`).join('')}</ul>${(e.quelle === 'osm' || QUELLEN[e.quelle]) ? '<p class="leise">Abgeleitet aus dem Eintrag und dem Namen des Hofs – das Sortiment kann je nach Saison abweichen.</p>' : ''}${e.kat.some((x) => ['obst', 'gemuese', 'kartoffeln'].includes(x)) ? '<p class="leise">Was gerade geerntet wird, steht im <a href="/saisonkalender/">Saisonkalender</a>.</p>' : ''}</section>` : ''}
    ${e.fotos?.length ? `<section class="block hof-fotos"><h2>Fotos</h2><div class="foto-reihe">${e.fotos.map((f, i) => `<img src="${esc(f)}" width="1200" height="900" alt="${esc(e.titel)} – Foto ${i + 1}" loading="lazy" decoding="async">`).join('')}</div><p class="leise">Fotos: ${esc(e.titel)}</p></section>` : ''}
    ${e.termine?.length ? `<section class="block termine"><h2>Veranstaltungen</h2><ul class="termin-liste">${e.termine.map((v) => terminHtml(v, false)).join('')}</ul><p class="leise">Angabe des Betriebs · <a href="/veranstaltungen/">Alle Veranstaltungen</a></p></section>` : ''}
    ${e.urlaub?.length ? `<section class="block saison-hinweis urlaub"><h2>Betriebsferien</h2>${e.urlaub.map((u) => `<p><b>${esc(datumDe(u.von))} bis ${esc(datumDe(u.bis))}</b>${u.text ? ` – ${esc(u.text)}` : ''}</p>`).join('')}<p class="leise">Angabe des Betriebs</p></section>` : ''}
    ${e.saisonHinweis ? `<section class="block saison-hinweis"><h2>Aktuell und saisonal</h2><p>${esc(e.saisonHinweis)}</p><p class="leise">${e.vomBetrieb?.saison ? 'Angabe des Betriebs, ' : ''}Stand ${esc(datumDe(e.gepflegt?.stand || HEUTE))}</p></section>` : ''}
    ${merkmale.length || saisonProdukte.length ? `<section class="block"><h2>Auf einen Blick</h2><dl class="merkmale">${merkmale.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('')}${saisonProdukte.map((sp) => `<div><dt><a href="${sp.pfad}">${esc(sp.name)}</a></dt><dd>${sp.frisch.length ? `Saison meist ${esc(monatsSpanne(sp.frisch))}` : 'im Angebot'}</dd></div>`).join('')}</dl></section>` : ''}
    <section class="block"><h2>Über ${esc(e.titel)}</h2>${e.beschreibung ? `<p>${esc(e.beschreibung)}</p>` : ''}<p>${ueber}</p>${regionTeaser(k)}</section>
    ${e.ergaenzt ? `<p class="hinweis">${e.ergaenzt.quellen.map((q) => `${q.felder.map((f) => ({ website: 'Website', oeffnungszeiten: 'Öffnungszeiten', telefon: 'Telefon', email: 'E-Mail', facebook: 'Facebook', instagram: 'Instagram', strasse: 'Adresse' })[f]).join(', ')} ergänzt aus <a href="${esc(q.quelle)}" rel="nofollow noopener" target="_blank">${esc(kurz(q.quelle).split('/')[0])}</a>${q.stand ? ` (Stand ${esc(datumDe(q.stand))})` : ''}`).join('; ')}. Zeiten können sich saisonal ändern – im Zweifel vorher anrufen.</p>` : ''}
    ${tippsHtml(e)}
    ${MIT_KONTO.has(e.sid) ? `<section class="block nachricht" data-nachricht="${esc(e.sid)}"><h2>Nachricht an den Hof</h2>
      <p>Frag nach Angebot, Vorbestellung oder Öffnungszeiten. Die Nachricht geht direkt an den Betrieb, seine E-Mail-Adresse bleibt verborgen. Die Antwort kommt an deine Adresse.</p>
      <p><button type="button" class="knopf" data-nachricht-oeffnen>Nachricht schreiben</button></p>
      <form class="betrieb-form" data-nachricht-form hidden>
        <label>Dein Name <input name="name" maxlength="80" autocomplete="name"></label>
        <label>Deine E-Mail-Adresse <input name="email" type="email" required autocomplete="email"></label>
        <label class="breit">Nachricht <textarea name="text" rows="5" maxlength="3000" required minlength="10"></textarea></label>
        <div class="breit" data-turnstile></div>
        <button type="submit" class="knopf">Nachricht senden</button>
        <p class="leise" data-status aria-live="polite">Beim Öffnen des Formulars lädt Cloudflare Turnstile (Spam-Schutz), siehe <a href="/datenschutz/">Datenschutz</a>.</p>
      </form></section>` : ''}
    <section class="pruefung" data-rueckmeldung="${esc(e.sid)}" aria-labelledby="pr-titel">
      <h2 id="pr-titel">Stimmt das noch?</h2>
      ${e.geschlossenGemeldet >= 2 ? '<p class="pruef-warnung">Mehrere Besucher haben gemeldet, dass dieser Hof geschlossen sein könnte. Wir prüfen das gerade.</p>' : ''}
      <p class="pruef-stand">${e.letztePruefung ? (e.letztePruefung.besuch ? `${esc(e.letztePruefung.wie[0].toUpperCase() + e.letztePruefung.wie.slice(1))}, zuletzt am <time datetime="${e.letztePruefung.tag}">${esc(datumDe(e.letztePruefung.tag))}</time>.` : `Zuletzt geprüft: <time datetime="${e.letztePruefung.tag}">${esc(datumDe(e.letztePruefung.tag))}</time>, ${esc(e.letztePruefung.wie)}.`) : 'Diese Angaben hat noch niemand geprüft. Warst du in letzter Zeit dort?'}</p>
      <div class="pruef-knoepfe"><button type="button" class="knopf knopf-dunkel" data-rm="stimmt">Ja, stimmt noch</button><button type="button" class="knopf knopf-hell" data-rm="geschlossen">Geschlossen melden</button></div>
      <p class="pruef-frage" data-rm-frage hidden>Ist der ${e.typ === 'automat' ? 'Automat' : 'Hof oder Laden'} dauerhaft geschlossen? <button type="button" class="link" data-rm-ja>Ja, dauerhaft geschlossen</button> · <button type="button" class="link" data-rm-nein>Nein, abbrechen</button></p>
      <p class="pruef-danke" data-rm-danke role="status" hidden></p>
      <p class="leise">Öffnungszeiten oder Angebot haben sich geändert? <a href="${bearbeiten(e, 'ergaenzen')}">Eintrag ergänzen</a>.</p>
    </section>
    <p class="hinweis">Angaben ohne Gewähr. ${e.gepflegt ? `${e.gepflegt.art === 'uebernahme' ? 'Der Betrieb pflegt diesen Eintrag selbst' : 'Angaben geprüft und ergänzt'} (Stand ${esc(datumDe(e.gepflegt.stand))}). ` : ''}${e.quelle === 'betreiber' ? `Eingetragen vom Betrieb. Etwas stimmt nicht? <a href="${bearbeiten(e, 'ergaenzen')}">Eintrag ergänzen</a>.` : QUELLEN[e.quelle] && !e.gepflegt
      ? `${quellenHinweis(e)} Die Angaben sind noch nicht vom Betrieb bestätigt. Etwas stimmt nicht oder ist der Hof geschlossen? <a href="${bearbeiten(e, 'ergaenzen')}">Bitte melden</a>.`
      : e.quelle === 'osm'
      ? `Quelle: <a href="https://www.openstreetmap.org/${e.osm}" rel="nofollow noopener" target="_blank">OpenStreetMap</a>. Etwas stimmt nicht? <a href="https://www.openstreetmap.org/edit?${e.osm.replace('/', '=')}" rel="nofollow noopener" target="_blank">In OpenStreetMap korrigieren</a> oder <a href="${bearbeiten(e, 'ergaenzen')}">Eintrag ergänzen</a>.`
      : `${e.quelleUrl ? `Quelle: <a href="${esc(e.quelleUrl)}" rel="nofollow noopener" target="_blank">${esc(kurz(e.quelleUrl).split('/')[0])}</a>. ` : ''}Etwas stimmt nicht? <a href="${bearbeiten(e, 'ergaenzen')}">Eintrag ergänzen</a>.`}</p>
    <p class="aktualitaet">${e.geprueft ? `Zuletzt vor Ort geprüft: ${esc(datumDe(e.geprueft))} (laut OpenStreetMap) · ` : ''}Seite aktualisiert: ${STAND_PLATZHALTER}</p>
    <section class="block betreiber-box">
      <h2>Ist das dein Hof?</h2>
      <p>Übernimm den Eintrag kostenlos und halte Öffnungszeiten, Angebot und saisonale Hinweise selbst aktuell.</p>
      <p class="kk-knoepfe"><a class="knopf knopf-dunkel" href="${bearbeiten(e, 'uebernehmen')}">Betreiber? Eintrag kostenlos übernehmen</a><a class="knopf knopf-hell" href="${bearbeiten(e, 'ergaenzen')}">Eintrag ergänzen</a></p>
      <p class="leise"><a href="/fuer-hoefe/?eintrag=${esc(e.sid)}">Badge „Wir sind auf hofladenliste.de“ für deine Website</a></p>
    </section>
  </div>
</div>
${naehe.length ? `<section class="abschnitt"><h2>Weitere Hofläden in der Nähe</h2><div class="karten-reihe">${naehe.map(([d, x]) => karteHtml(kartenDaten(x, Math.round(d * 10) / 10))).join('')}</div></section>` : ''}
${hofFaq.html}
${ortListe(naheOrte(e.lat, e.lon, 6, new Set(o?.eigen ? [o] : [])), `Hofläden in Orten in der Nähe`)}
<p class="abschnitt mehr-links">${umgebungsSeite && umgebungsSeite.pfad !== o?.pfad ? `<a class="mehr" href="${umgebungsSeite.pfad}">Hofläden in ${esc(umgebungsSeite.name)} und Umgebung${ICON.pfeil}</a>` : ''}${artTyp(e) ? (() => { const tk = typKreis(artTyp(e), k); return tk ? `<a class="mehr" href="${tk.pfad}">${tk.t.plural} ${esc(imKreis)}${ICON.pfeil}</a>` : `<a class="mehr" href="/${artTyp(e).slug}/#${k.landSlug}">${esc(PLURAL_ART[e.art] || e.art)} in ${esc(k.landName)}${ICON.pfeil}</a>`; })() : ''}${o?.eigen ? `<a class="mehr" href="${o.pfad}">${esc(ortUeberschrift(o))}${ICON.pfeil}</a>` : ''}<a class="mehr" href="${k.pfad}">Alle Hofläden ${esc(imKreis)}${ICON.pfeil}</a></p>`,
  }), !e.duenn);
}

// ---------- Deutschlandkarte ----------
// Punkte für die Vollkarte: Höfe [lat, lon, Typ, Slug, Titel, Art, Öffnungszeiten, Angebots-Buchstaben, Bio, Kartenzahlung, Land]
// und Wochenmärkte [lat, lon, Titel, Marktzeiten, Link, Land]. Typ: h Hofladen, m Milchtankstelle, e Eierautomat, r Regiomat u. a.
const KARTE_TYP = (e) => (e.typ === 'hofladen' ? 'h' : e.art === 'Milchtankstelle' ? 'm' : e.art === 'Eierautomat' ? 'e' : 'r');
writeFileSync(join(OUT, 'punkte.json'), JSON.stringify({
  h: eintraege.map((e) => [+e.lat.toFixed(5), +e.lon.toFixed(5), KARTE_TYP(e), e.slug, e.titel, e.art, e.oeffnungszeiten || '',
    e.kat.map((x) => 'abcdefghijklmnopqrstuvwxyz'[KAT_CODES_KARTE.indexOf(x)]).join(''), e.bio ? 1 : 0, e.zahlung?.some((z) => KARTENZAHLUNG.includes(z)) ? 1 : 0, e.k?.land || '']),
  m: MAERKTE.map((m) => { const k = kreise.get(m.kreis); const viele = (maerkteProKreis.get(m.kreis) || []).length >= MARKT_SEITE_AB;
    return [+m.lat.toFixed(5), +m.lon.toFixed(5), m.titel, m.oeffnungszeiten || '', `${viele ? marktPfad(k) : `/wochenmaerkte/${k.landSlug}/`}#${m.anker}`, k.land]; }),
  k: KAT_CODES_KARTE,
}));
schreibe('/karte/', seite({
  titel: 'Hofladen-Karte: alle Hofläden in Deutschland auf einer Karte',
  beschreibung: `Hofladen-Karte: alle ${zahl(eintraege.length)} Hofläden, Milchtankstellen, Eierautomaten und Regiomaten in Deutschland auf einer Karte – hineinzoomen, Hof antippen, Route planen.`,
  pfad: '/karte/',
  krumen: [['Karte', '/karte/']],
  klasse: 'vollkarte',
  inhalt: `
<section class="seitenkopf kompakt">
  <h1>Alle Hofläden auf der Karte</h1>
  <p>${zahl(anzHof)} Hofläden, ${zahl(eintraege.length - anzHof)} Hofautomaten${MAERKTE.length ? ` und ${zahl(MAERKTE.length)} Wochenmärkte` : ''}. Filter wählen, hineinzoomen, Punkt antippen – die Liste zeigt, was im Kartenausschnitt liegt.</p>
</section>
<div class="kartenseite" data-vollkarte>
  <div class="kartenseite-werkzeug" data-kf role="group" aria-label="Filter für die Karte">
    <div class="segment kf-typ" role="radiogroup" aria-label="Art">
      ${[['alle', 'Alle'], ['h', 'Hofläden'], ['m', 'Milchtankstellen'], ['e', 'Eierautomaten'], ['r', 'Regiomaten'], ...(MAERKTE.length ? [['markt', 'Wochenmärkte']] : [])].map(([k, t], i) => `<button type="button" data-kf-typ="${k}" aria-pressed="${i === 0}">${t}</button>`).join('')}
    </div>
    <button type="button" class="umschalter" data-kf-schalter="offen" aria-pressed="false">Jetzt geöffnet</button>
    <button type="button" class="umschalter" data-kf-schalter="bio" aria-pressed="false">Bio</button>
    <button type="button" class="umschalter" data-kf-schalter="rund" aria-pressed="false">24/7</button>
    <button type="button" class="umschalter" data-kf-schalter="karte" aria-pressed="false">Kartenzahlung</button>
    <div class="kat-filter" aria-label="Angebot">${Object.entries(KATEGORIEN).map(([k, n]) => `<button type="button" data-kf-kat="${k}" aria-pressed="false">${produktIcon(k)}${esc(n)}</button>`).join('')}</div>
  </div>
  <div class="kartenseite-haupt">
    <div class="kartenseite-karte">${kartenPanel({ titel: 'Karte aller Hofläden in Deutschland' })}
      <button type="button" class="knopf knopf-dunkel kf-standort" data-mein-standort hidden>${ICON.standort}Mein Standort</button>
      <div class="legende"><span class="punkt hofladen"></span>Hofladen <span class="punkt milch"></span>Milchtankstelle <span class="punkt eier"></span>Eierautomat <span class="punkt automat"></span>Regiomat${MAERKTE.length ? ' <span class="punkt markt"></span>Wochenmarkt' : ''}</div>
    </div>
    <aside class="kartenseite-liste" data-kl aria-label="Einträge im Kartenausschnitt">
      <button type="button" class="kl-griff" data-kl-griff aria-expanded="false"><span class="sr">Liste ein- oder ausklappen</span></button>
      <p class="kl-status" data-kl-status aria-live="polite">Lade die Karte, um die Einträge im Ausschnitt zu sehen. Ohne Karte findest du alle Höfe über die Bundesländer unten.</p>
      <ol class="kl-liste" data-kl-liste></ol>
    </aside>
  </div>
</div>
<section class="abschnitt">
  <h2>Hofläden nach Bundesland</h2>
  <ul class="kreis-liste">${laender.map((l) => `<li><a href="/${l.slug}/"><span>${esc(l.name)}</span><span class="zahl">${zahl(l.anzahl)}</span></a></li>`).join('')}</ul>
</section>
<section class="abschnitt seo-text">
  <h2>Hofautomaten in Deutschland</h2>
  <p>${TYPEN.map((t) => `<a href="/${t.slug}/">${zahl(t.liste.length)} ${t.plural}</a>`).join(', ')} – nach Bundesland und Landkreis sortiert. Was gerade Saison hat, zeigt der <a href="/saisonkalender/">Saisonkalender</a>.</p>
</section>`,
}));

// ---------- Saisonkalender ----------
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
schreibe('/saisonkalender/', seite({
  titel: 'Saisonkalender Obst & Gemüse: Was gibt es wann vom Hof?',
  beschreibung: 'Wann gibt es Spargel, Erdbeeren, Kürbis und Grünkohl aus der Region? Der Saisonkalender für Obst und Gemüse aus deutschem Anbau – Monat für Monat.',
  pfad: '/saisonkalender/',
  krumen: [['Saisonkalender', '/saisonkalender/']],
  klasse: 'saison',
  inhalt: `
<section class="seitenkopf">
  <h1>Saisonkalender für Obst und Gemüse</h1>
  <p>Was bei uns gerade wächst und was aus dem Lager kommt. Im Hofladen findest du vor allem, was Saison hat – frischer und oft günstiger.</p>
  <p class="legende-saison"><span class="frisch"></span>frisch vom Feld <span class="lager"></span>aus dem Lager</p>
</section>
<div class="abschnitt saison-werkzeug" data-saison-werkzeug>
  <div class="segment" role="group" aria-label="Sorten filtern"><button type="button" data-saison-gruppe="alle" aria-pressed="true">Alle</button><button type="button" data-saison-gruppe="obst" aria-pressed="false">Obst</button><button type="button" data-saison-gruppe="gemuese" aria-pressed="false">Gemüse</button></div>
  <label class="saison-suchfeld"><span class="sr">Sorte suchen</span><input type="search" data-saison-suche placeholder="Sorte suchen, z. B. Kürbis" autocomplete="off"></label>
  <label class="saison-monatswahl"><span>Monat</span><select data-saison-monat-wahl>${MONATSNAMEN.map((m, i) => `<option value="${i + 1}"${i + 1 === MONAT_JETZT ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
</div>
<section class="abschnitt saison-monatsansicht" data-saison-monatsansicht aria-live="polite">${saisonMonatHtml(MONAT_JETZT)}</section>
<div class="abschnitt saison-tabelle-rahmen">
  <table class="saison-tabelle">
    <thead><tr><th scope="col">Sorte</th>${MONATE.map((m, i) => `<th scope="col" data-monat="${i + 1}"${i + 1 === MONAT_JETZT ? ' class="aktuell" aria-current="date"' : ''}>${m}</th>`).join('')}</tr></thead>
    <tbody>
      ${SAISON.map(([n, frisch, lager = []]) => `<tr data-gruppe="${SAISON_NACH_NAME.get(n)?.gruppe === 'obst' ? 'obst' : 'gemuese'}" data-name="${esc(n.toLowerCase())}"><th scope="row">${SAISON_NACH_NAME.has(n) ? `<a href="${SAISON_NACH_NAME.get(n).pfad}">${esc(n)}</a>` : esc(n)}</th>${MONATE.map((m, i) => { const mo = i + 1; const c = frisch.includes(mo) ? 'frisch' : lager.includes(mo) ? 'lager' : ''; return `<td data-monat="${mo}"${c ? ` class="${c}"` : ''}><span class="sr">${c === 'frisch' ? 'frisch' : c === 'lager' ? 'Lager' : '–'}</span></td>`; }).join('')}</tr>`).join('\n      ')}
    </tbody>
  </table>
</div>
<p class="abschnitt leise">Richtwerte für den Freilandanbau in Deutschland; je nach Region und Wetter verschiebt sich die Saison um einige Wochen.</p>
<section class="abschnitt seo-text">
  <h2>Saisonales Obst und Gemüse im Hofladen kaufen</h2>
  <p>Am frischesten bekommst du die Ernte direkt vom Erzeuger. Gib deine Postleitzahl ein und wähle, was du suchst – wir zeigen dir Hofläden in deiner Nähe, sortiert nach Entfernung.</p>
  <form class="saison-suche" action="/suche" method="get">
    <label class="sr" for="saison-plz">Postleitzahl oder Ort</label>
    <input id="saison-plz" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required>
    ${['obst', 'gemuese', 'kartoffeln', 'eier', 'honig'].map((k) => `<label class="haken"><input type="checkbox" name="produkt" value="${k}"> ${esc(KATEGORIEN[k])}</label>`).join('')}
    <button type="submit" class="knopf">Hofläden finden</button>
  </form>
  <p>Kein Hofladen offen? An <a href="/regiomat/">Regiomaten</a> gibt es Kartoffeln, Obst und mehr auch abends und am Wochenende, frische Eier am <a href="/eierautomat/">Eierautomaten</a> und Milch an der <a href="/milchtankstelle/">Milchtankstelle</a>.</p>
</section>
<section class="abschnitt">
  <h2>Hofläden in deinem Bundesland</h2>
  <ul class="kreis-liste">${laender.map((l) => `<li><a href="/${l.slug}/"><span>${esc(l.name)}</span><span class="zahl">${zahl(l.anzahl)}</span></a></li>`).join('')}</ul>
</section>`,
}));

// ---------- Saisonprodukte: Höfe mit Spargel, Erdbeeren, Äpfeln … ----------
for (const sp of SAISON_SEITEN) {
  const proLand = laender.map((l) => ({ l, liste: sp.liste.filter((e) => e.k.land === l.code).sort((a, b) => a.k.titel.localeCompare(b.k.titel, 'de') || a.ortAnzeige.localeCompare(b.ortAnzeige, 'de')) })).filter((x) => x.liste.length);
  const geordnet = proLand.flatMap(({ liste }) => liste);
  const nHof = sp.liste.filter((e) => e.typ === 'hofladen').length;
  const saison = monatsSpanne(sp.frisch), lager = monatsSpanne(sp.lager);
  const andere = SAISON_SEITEN.filter((x) => x !== sp);
  schreibe(sp.pfad, seite({
    titel: passend(`${sp.name} vom Hof – ${zahl(sp.liste.length)} ${sp.plural} in Deutschland`, `${sp.name} vom Hof – ${zahl(sp.liste.length)} Höfe`, `${sp.name} vom Hof`),
    beschreibung: `${sp.name} direkt vom Erzeuger: ${zahl(sp.liste.length)} ${sp.plural} und Hofläden${saison ? `. Saison: ${saison}` : ''}${lager ? `, aus dem Lager ${lager}` : ''}. Mit Öffnungszeiten, Adresse und Route.`,
    pfad: sp.pfad,
    klasse: 'kompakt',
    noindex: !sp.indexiert,
    krumen: [['Saisonkalender', '/saisonkalender/'], [sp.name, sp.pfad]],
    jsonld: geordnet.length ? [itemList(`${sp.plural} in Deutschland`, hofItems(geordnet))] : [],
    inhalt: `
<section class="seitenkopf">
  <h1>${esc(sp.name)} vom Hof</h1>
  <p>${sp.liste.length ? `${zahl(sp.liste.length)} ${esc(sp.plural)}${nHof !== sp.liste.length ? ` (davon ${zahl(nHof)} Hofläden)` : ''} in ${plural(proLand.length, 'Bundesland', 'Bundesländern')} nennen ${esc(sp.name)} ausdrücklich.` : `Noch hat kein Hof ${esc(sp.name)} ausdrücklich im Eintrag – viele Höfe mit ${esc(KATEGORIEN[sp.gruppe])} verkaufen sie trotzdem in der Saison.`}${saison ? ` Frisch vom Feld gibt es ${esc(sp.name)} von ${esc(saison)}${lager ? `, aus dem Lager ${esc(lager)}` : ''}.` : ''}</p>
  <h2 class="naehe-titel">Hier gibt’s ${esc(sp.name)} in deiner Nähe</h2>
  ${naeheSuche({ produkt: sp.gruppe }, `Höfe mit ${KATEGORIEN[sp.gruppe]} in meiner Nähe`)}
  ${(() => { const p = SAISON_PRODUKTE.find((x) => x.replace(/^Neue /, '').toLowerCase().startsWith(sp.name.toLowerCase().slice(0, 5))); return p ? `<p class="saison-abo-link"><a href="/saison-benachrichtigung/#produkt=${encodeURIComponent(p)}">🔔 Sag mir Bescheid, wenn es ${esc(sp.name)} in meiner Nähe gibt</a></p>` : ''; })()}
  <form class="kopf-suche gross-suche" action="/suche" method="get"><label class="sr" for="sp-q">Postleitzahl, Ort oder Name des Hofs</label><input id="sp-q" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required><button type="submit">Suchen</button></form>
</section>
<section class="abschnitt seo-text"><p>Welche Höfe ${esc(sp.name)} anbieten, erkennen wir am Namen des Hofs, an der Beschreibung und an den Angaben in OpenStreetMap. Gerade bei saisonaler Ware lohnt sich vor dem Besuch ein Anruf – Erntebeginn und Verkaufszeiten hängen vom Wetter ab. Wann welches Obst und Gemüse Saison hat, zeigt der <a href="/saisonkalender/">Saisonkalender</a>.</p></section>
<nav class="abschnitt sprung-liste" aria-label="Bundesländer"><h2>${esc(sp.plural)} nach Bundesland</h2><ul class="kreis-liste">${proLand.map(({ l, liste }) => `<li><a href="#${l.slug}"><span>${esc(l.name)}</span><span class="zahl">${zahl(liste.length)}</span></a></li>`).join('')}</ul></nav>
${proLand.map(({ l, liste }) => `<section class="abschnitt typ-land" id="${l.slug}"><h2>${esc(sp.plural)} in ${esc(l.name)}</h2><ul class="eintrag-liste">${liste.map((e) => `<li><a href="${e.pfad}">${esc(e.titelSeite)}</a> <span class="zahl">${esc(e.ortAnzeige)} · ${esc(e.k.titel)}</span></li>`).join('')}</ul></section>`).join('\n')}
<section class="abschnitt"><h2>Weitere Saisonprodukte</h2><p class="typ-chips">${andere.map((x) => `<a href="${x.pfad}">${esc(x.name)} <span>${zahl(x.liste.length)}</span></a>`).join('')}</p></section>`,
  }), sp.indexiert);
  if (sp.indexiert) KATEGORIE_PFADE.add(sp.pfad);
}

// ---------- Infoseiten ----------
const imp = cfg.impressum;
const impFehlt = !imp.name || !imp.strasse || !imp.plzOrt || !imp.email;
const kontaktMail = cfg.kontaktEmail || imp.email;
// ---------- Seite /veranstaltungen/ (Daten siehe oben bei den Hofseiten) ----------
{
  const proLand = laender.map((l) => ({ l, liste: TERMINE.filter((v) => v.e.k.land === l.code) })).filter((x) => x.liste.length);
  schreibe('/veranstaltungen/', seite({
    titel: TERMINE.length ? `Hoffeste und Veranstaltungen auf Höfen – ${zahl(TERMINE.length)} Termine` : 'Hoffeste und Veranstaltungen auf Höfen',
    beschreibung: 'Hoffeste, Tag des offenen Hofes, Schlachtfeste und Weihnachtsmärkte am Hof – Termine, die die Betriebe selbst eintragen, nach Bundesland sortiert.',
    pfad: '/veranstaltungen/', noindex: TERMINE.length < MIN_SEITE, krumen: [['Veranstaltungen', '/veranstaltungen/']],
    jsonld: TERMINE.slice(0, 100).map(terminLd),
    inhalt: `
<section class="seitenkopf">
  <h1>Hoffeste und Veranstaltungen</h1>
  <p>${TERMINE.length ? `${plural(TERMINE.length, 'Termin', 'Termine')} von Höfen in ${plural(proLand.length, 'Bundesland', 'Bundesländern')}.` : 'Gerade sind keine Termine eingetragen.'} Die Termine tragen die Betriebe selbst ein – Hoffeste, Tag des offenen Hofes, Schlachtfeste oder Weihnachtsmärkte am Hof.</p>
  ${proLand.length > 1 ? `<p class="typ-chips">${proLand.map(({ l, liste }) => `<a href="#${l.slug}">${esc(l.name)} <span>${liste.length}</span></a>`).join('')}</p>` : ''}
</section>
${proLand.map(({ l, liste }) => `<section class="abschnitt" id="${l.slug}"><h2>${esc(l.name)}</h2><ul class="termin-liste">${liste.map((v) => terminHtml(v)).join('')}</ul></section>`).join('\n')}
<section class="abschnitt seo-text"><p>Du betreibst einen Hof und planst ein Fest? Im <a href="/betrieb/">Betreiber-Bereich</a> trägst du Termine selbst ein. Sie erscheinen hier und auf der Seite deines Hofs.</p></section>`,
  }), TERMINE.length >= MIN_SEITE);
}

schreibe('/merkliste/', seite({
  titel: 'Deine Merkliste | Hofladenliste',
  beschreibung: 'Deine gemerkten Hofläden und Hofautomaten – gespeichert nur in deinem Browser.',
  pfad: '/merkliste/',
  krumen: [['Merkliste', '/merkliste/']],
  noindex: true,
  inhalt: `
<section class="seitenkopf kompakt">
  <h1>Deine Merkliste</h1>
  <p>Höfe, die du mit ${ICON.herz} merkst, landen hier. Gespeichert wird nur in deinem Browser.</p>
</section>
<section class="abschnitt" data-merkliste>
  <p class="leise" data-merkliste-status>Merkliste wird geladen …</p>
  <div class="karten-reihe" data-merkliste-liste></div>
  <p data-merkliste-leeren hidden><button type="button" class="knopf knopf-hell">Merkliste leeren</button></p>
</section>`,
}), false);

// Betreiber-Bereich: Anmeldung per Link, danach Höfe, Neuigkeiten, Termine und Statistik (Inhalt per JavaScript)
schreibe('/betrieb/', seite({
  titel: 'Für Betriebe: Eintrag selbst pflegen | Hofladenliste',
  beschreibung: 'Betreiber-Bereich von Hofladenliste: Öffnungszeiten, Angebot und Fotos selbst pflegen, Neuigkeiten wie „Spargel ist da!“ und Hoffeste veröffentlichen.',
  pfad: '/betrieb/', noindex: true, klasse: 'textseite', krumen: [['Für Betriebe', '/betrieb/']],
  inhalt: `
<section class="seitenkopf kompakt">
  <h1>Dein Hof auf Hofladenliste</h1>
  <p>Öffnungszeiten, Angebot und Fotos selbst pflegen, Neuigkeiten und Termine veröffentlichen – ohne Passwort, mit einem Link per E-Mail.</p>
</section>
<section class="abschnitt betrieb" data-betrieb>
  <div class="betrieb-anmelden" data-betrieb-anmelden>
    <h2>Anmelden</h2>
    <form data-anmelden-form>
      <label for="betrieb-email">E-Mail-Adresse deines Betriebs</label>
      <div class="plz-zeile"><input id="betrieb-email" name="email" type="email" autocomplete="email" required placeholder="info@dein-hof.de"><button type="submit" class="knopf">Anmeldelink schicken</button></div>
      <p class="leise" data-anmelden-status aria-live="polite"></p>
    </form>
    <p>Noch kein Zugang? Such deinen Hof und wähle auf seiner Seite „Eintrag übernehmen“. Passt deine E-Mail-Adresse zur Website des Hofs, bekommst du sofort einen Bestätigungslink, sonst prüfen wir die Übernahme von Hand. Fragen: <a href="mailto:hofladenliste@gmail.com">hofladenliste@gmail.com</a></p>
    <p>Du kaufst gern bei einem Hof ein, der hier noch fehlt? <a href="/aushang/empfehlen/">Flyer „Empfiehl deinen Lieblingshof“ ausdrucken</a>.</p>
  </div>
  <div data-betrieb-inhalt hidden></div>
  <noscript><p>Der Betreiber-Bereich braucht JavaScript.</p></noscript>
</section>`,
}), false);

// Aushang zum Ausdrucken (A4/A5) mit QR-Code, und Flyer „Empfiehl deinen Lieblingshof“ (Inhalt per JavaScript, QR aus static/qr.js)
const AUSHANG_LEISTE = `<div class="aushang-leiste"><div class="segment" role="radiogroup" aria-label="Papierformat"><button type="button" data-papier-wahl="A4" aria-pressed="true">A4</button><button type="button" data-papier-wahl="A5" aria-pressed="false">A5</button></div><button type="button" class="knopf" data-drucken>Drucken oder als PDF speichern</button></div>`;
schreibe('/betrieb/aushang/', seite({
  titel: 'Aushang mit QR-Code drucken | Hofladenliste', pfad: '/betrieb/aushang/', noindex: true, klasse: 'aushang-seite', kopfSuche: false, krumen: [['Für Betriebe', '/betrieb/'], ['Aushang', '/betrieb/aushang/']],
  beschreibung: 'Aushang für deinen Hofladen zum Ausdrucken: Öffnungszeiten, Angebot und QR-Code zum Eintrag auf Hofladenliste, als A4 oder A5.',
  inhalt: `<section class="abschnitt kein-druck"><h1>Aushang für deinen Hof</h1><p>Häng ihn an die Tür oder neben die Kasse. Der QR-Code führt zu deinem Eintrag – dort stehen Öffnungszeiten und Angebot immer aktuell.</p>${AUSHANG_LEISTE}<p class="leise" data-aushang-status>Wird geladen …</p></section>
<article class="aushang" data-aushang="hof" hidden>
  <p class="aushang-marke">${LOGO}<span>Hofladenliste</span></p>
  <h2 class="aushang-name" data-hof-name></h2><p class="aushang-art" data-hof-art></p>
  <div class="aushang-spalten"><div><div data-hof-zeiten></div><div data-hof-angebot></div><p data-hof-telefon></p></div>
    <figure class="aushang-qr"><div data-qr></div><figcaption><b>Öffnungszeiten &amp; Angebot immer aktuell</b><span data-qr-url></span></figcaption></figure></div>
  <p class="aushang-fuss">Hofläden, Milchtankstellen und Hofautomaten in ganz Deutschland: hofladenliste.de</p>
</article>`,
}), false);
schreibe('/aushang/empfehlen/', seite({
  titel: 'Flyer: Empfiehl deinen Lieblingshof | Hofladenliste', pfad: '/aushang/empfehlen/', noindex: true, klasse: 'aushang-seite', kopfSuche: false, krumen: [['Flyer: Hof empfehlen', '/aushang/empfehlen/']],
  beschreibung: 'Flyer zum Ausdrucken: Gib ihn deinem Lieblingshof, damit er sich kostenlos auf Hofladenliste einträgt.',
  inhalt: `<section class="abschnitt kein-druck"><h1>Empfiehl deinen Lieblingshof</h1><p>Druck den Flyer aus und gib ihn dem Hof, bei dem du gern einkaufst. Der Eintrag ist kostenlos.</p>${AUSHANG_LEISTE}</section>
<article class="aushang" data-aushang="empfehlung">
  <p class="aushang-marke">${LOGO}<span>Hofladenliste</span></p>
  <h2 class="aushang-name">Wir kaufen gern bei Ihnen ein!</h2>
  <p class="aushang-art">Damit noch mehr Menschen Ihren Hof finden: Tragen Sie ihn kostenlos auf hofladenliste.de ein.</p>
  <div class="aushang-spalten"><div><h2>So geht’s</h2><ol><li>QR-Code scannen oder hofladenliste.de/mitmachen/ öffnen</li><li>Name, Adresse und Öffnungszeiten eintragen</li><li>Fertig – Neuigkeiten wie „Spargel ist da!“ können Sie danach selbst veröffentlichen</li></ol>
    <p>Kostenlos, ohne Werbung im Eintrag. Fragen: hofladenliste@gmail.com</p></div>
    <figure class="aushang-qr"><div data-qr></div><figcaption><b>Jetzt eintragen</b><span>hofladenliste.de/mitmachen/</span></figcaption></figure></div>
  <p class="aushang-fuss">Empfohlen von einer Kundin oder einem Kunden.</p>
</article>`,
}), false);

const textSeite = (pfad, titel, beschreibung, html, noindex = true) => schreibe(pfad, seite({ titel: `${titel} | Hofladenliste`, beschreibung, pfad, noindex, klasse: 'textseite', krumen: [[titel.replace(/ – .*/, ''), pfad]], inhalt: `<article class="text">${html}</article>` }), !noindex);
// Hofläden entlang der Route (Start/Ziel als Luftlinie oder eigene GPX-Datei, Korridor 2–5 km; Berechnung im Browser)
schreibe('/route/', seite({
  titel: 'Hofläden entlang der Route – für Radtour und Ausflug',
  beschreibung: 'Hofläden, Milchtankstellen, Hofautomaten und Wochenmärkte entlang deiner Strecke finden: Start und Ziel eingeben oder GPX-Datei hochladen, Korridor von 2 bis 5 km.',
  pfad: '/route/', krumen: [['Hofläden entlang der Route', '/route/']],
  inhalt: `
<section class="seitenkopf">
  <h1>Hofläden entlang der Route</h1>
  <p>Für Radtour, Wanderung oder Wochenendausflug: Gib Start und Ziel ein oder lade die GPX-Datei deiner Tour hoch. Wir zeigen alle Hofläden, Automaten und Wochenmärkte, die höchstens ein paar Kilometer neben der Strecke liegen – in der Reihenfolge, in der du an ihnen vorbeikommst.</p>
</section>
<section class="abschnitt route" data-route>
  <form class="betrieb-form route-form" data-route-form>
    <label>Start <input name="start" ${SUCHFELD} placeholder="Ort oder PLZ, z. B. Cottbus"></label>
    <label>Ziel <input name="ziel" ${SUCHFELD} placeholder="z. B. Forst (Lausitz)"></label>
    <label>Korridor <select name="breite"><option value="2">2 km neben der Strecke</option><option value="3" selected>3 km</option><option value="5">5 km</option></select></label>
    <label>Oder GPX-Datei <input name="gpx" type="file" accept=".gpx,application/gpx+xml"></label>
    <button type="submit" class="knopf">Höfe entlang der Strecke zeigen</button>
    <p class="leise breit">Ohne GPX-Datei rechnen wir mit der Luftlinie zwischen Start und Ziel. Die GPX-Datei bleibt in deinem Browser und wird nicht hochgeladen.</p>
  </form>
  <p data-route-status aria-live="polite"></p>
  <div class="route-haupt">${kartenPanel({ titel: 'Karte der Strecke' })}<ol class="kl-liste route-liste" data-route-liste></ol></div>
</section>`,
}));

// ---------- Ratgeber (eigene Artikel, scripts/ratgeber.mjs) ----------
{
  const ldArtikel = (a) => ({ '@context': 'https://schema.org', '@type': 'Article', headline: a.titel, description: a.beschreibung, inLanguage: 'de',
    datePublished: a.datum, dateModified: a.geaendert || a.datum, mainEntityOfPage: `${cfg.domain}/ratgeber/${a.slug}/`,
    author: { '@type': 'Organization', name: 'Hofladenliste', url: cfg.domain }, publisher: { '@type': 'Organization', name: 'Hofladenliste', url: cfg.domain, logo: { '@type': 'ImageObject', url: `${cfg.domain}/icon-512.png` } } });
  for (const a of RATGEBER) {
    const pfad = `/ratgeber/${a.slug}/`;
    const andere = RATGEBER.filter((x) => x !== a).slice(0, 4);
    schreibe(pfad, seite({
      titel: a.seitentitel || a.titel, beschreibung: a.beschreibung, pfad, klasse: 'textseite', jsonld: [ldArtikel(a)],
      krumen: [['Ratgeber', '/ratgeber/'], [a.kurz, pfad]],
      inhalt: `<article class="text ratgeber">
<h1>${esc(a.titel)}</h1>
<p class="leise">Ratgeber · Stand <time datetime="${a.geaendert || a.datum}">${esc(datumDe(a.geaendert || a.datum))}</time></p>
${a.html}
<section class="passend"><h2>Passend dazu</h2><ul>${a.links.map(([p, t]) => `<li><a href="${p}">${esc(t)}</a></li>`).join('')}</ul></section>
<section class="passend"><h2>Mehr aus dem Ratgeber</h2><ul>${andere.map((x) => `<li><a href="/ratgeber/${x.slug}/">${esc(x.titel)}</a></li>`).join('')}</ul></section>
</article>`,
    }));
  }
  schreibe('/ratgeber/', seite({
    titel: 'Ratgeber: Einkaufen direkt vom Hof | Hofladenliste',
    beschreibung: 'Ratgeber rund um Hofladen, Milchtankstelle und Eierautomat: Rohmilch abkochen, Eier-Kennzeichnung, Bio-Siegel, Solawi, Spargelzeit und mehr.',
    pfad: '/ratgeber/', klasse: 'textseite', krumen: [['Ratgeber', '/ratgeber/']],
    jsonld: [itemList('Ratgeber', RATGEBER.map((a) => [a.titel, `/ratgeber/${a.slug}/`]))],
    inhalt: `<section class="seitenkopf"><h1>Ratgeber: Einkaufen direkt vom Hof</h1><p>Praktisches Wissen für den Einkauf im Hofladen, an der Milchtankstelle und am Eierautomaten – von uns geschrieben, ohne Werbung.</p></section>
<section class="abschnitt"><ul class="ratgeber-liste">${RATGEBER.map((a) => `<li><a href="/ratgeber/${a.slug}/"><b>${esc(a.titel)}</b><span>${esc(a.beschreibung)}</span></a></li>`).join('')}</ul></section>`,
  }));
}

// Saison-Benachrichtigung per E-Mail (Double-Opt-in), ausgelöst von Neuigkeiten der Betriebe
schreibe('/saison-benachrichtigung/', seite({
  titel: 'Saison-Benachrichtigung: Spargel, Erdbeeren & Co. | Hofladenliste',
  beschreibung: 'Lass dich per E-Mail benachrichtigen, wenn Höfe in deiner Nähe melden, dass es Spargel, Erdbeeren, Kürbisse oder Weihnachtsbäume gibt. Kostenlos, jederzeit abbestellbar.',
  pfad: '/saison-benachrichtigung/', krumen: [['Saison-Benachrichtigung', '/saison-benachrichtigung/']], klasse: 'textseite',
  inhalt: `<section class="seitenkopf"><h1>Sag mir Bescheid, wenn’s losgeht</h1>
  <p>Wenn ein Hof in deiner Nähe meldet „Spargel ist da!“ oder „Erdbeeren ab heute“, bekommst du eine kurze E-Mail – höchstens alle drei Tage, gebündelt. Die Meldungen kommen direkt von den Betrieben.</p></section>
<section class="abschnitt saison-abo" data-saison-abo>
  <form class="betrieb-form" data-abo-form>
    <fieldset class="breit"><legend>Was interessiert dich?</legend><p class="tipp-auswahl">${SAISON_PRODUKTE.map((p) => `<label><input type="checkbox" name="produkte" value="${esc(p)}"> ${esc(p)}</label>`).join('')}</p></fieldset>
    <label>Postleitzahl <input name="plz" inputmode="numeric" pattern="\\d{5}" maxlength="5" required autocomplete="postal-code"></label>
    <label>Umkreis <select name="radius"><option value="10">10 km</option><option value="25" selected>25 km</option><option value="50">50 km</option></select></label>
    <label class="breit">E-Mail-Adresse <input name="email" type="email" required autocomplete="email"></label>
    <div class="breit" data-turnstile></div>
    <button type="submit" class="knopf">Benachrichtigung bestellen</button>
    <p class="leise breit" data-status aria-live="polite">Du bekommst zuerst eine E-Mail mit Bestätigungslink. Abmelden geht mit einem Klick in jeder Nachricht. Zum Schutz vor Spam lädt beim Absenden Cloudflare Turnstile.</p>
  </form>
</section>`,
}));

// Ersatzseite ohne Netz (Service Worker)
schreibe('/offline/', seite({ titel: 'Gerade offline | Hofladenliste', beschreibung: 'Keine Verbindung: Deine Merkliste und zuletzt besuchte Höfe sind trotzdem verfügbar.', pfad: '/offline/', noindex: true, klasse: 'textseite', krumen: [['Offline', '/offline/']],
  inhalt: '<article class="text"><h1>Gerade keine Verbindung</h1><p>Diese Seite ist noch nicht auf deinem Gerät gespeichert. Deine <a href="/merkliste/">Merkliste</a> und Höfe, die du schon einmal geöffnet hast, funktionieren auch ohne Netz.</p><p>Sobald du wieder online bist, lädt die Seite normal.</p></article>' }), false);
// Ergebnisseite der Hofsuche (/suche leitet bei mehreren Treffern hierher); Inhalt kommt per JavaScript aus /api/hoefe
schreibe('/hofsuche/', seite({ titel: 'Hof suchen | Hofladenliste', beschreibung: 'Hofläden, Hofautomaten und Milchtankstellen nach Namen suchen: Ergebnisse mit Ort, Öffnungszeiten und Entfernung.', pfad: '/hofsuche/', noindex: true, klasse: 'textseite', krumen: [['Hof suchen', '/hofsuche/']],
  inhalt: `<section class="seitenkopf"><h1>Hof suchen</h1>
  <form class="kopf-suche gross-suche" action="/suche" method="get"><label class="sr" for="hs-q">Postleitzahl, Ort oder Name des Hofs</label><input id="hs-q" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required><button type="submit">Suchen</button></form>
  <p class="plz-hinweis" data-hofsuche-status>Suche läuft …</p></section>
<div class="liste" data-hofsuche><noscript><p>Die Ergebnisliste braucht JavaScript. Gib alternativ eine Postleitzahl ein.</p></noscript></div>` }), false);
textSeite('/impressum/', 'Impressum', 'Impressum von hofladenliste.de: Anbieter, Kontakt und Verantwortlicher für das Verzeichnis der Hofläden und Hofautomaten.', `<h1>Impressum</h1>
${impFehlt ? '<p class="fehler">Das Impressum wird gerade vervollständigt.</p>' : ''}
<p>Angaben gemäß § 5 DDG</p>
<p>${esc(imp.name)}<br>${esc(imp.strasse)}<br>${esc(imp.plzOrt)}</p>
<p>E-Mail: ${imp.email ? `<a href="mailto:${esc(imp.email)}">${esc(imp.email)}</a>` : ''}${imp.telefon ? `<br>Telefon: ${esc(imp.telefon)}` : ''}</p>
<p>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: ${esc(imp.name)}, Anschrift wie oben.</p>
<h2>Datenquellen und Lizenzen</h2>
<p>Einträge: © OpenStreetMap-Mitwirkende, Open Database License (ODbL), <a href="https://www.openstreetmap.org/copyright">openstreetmap.org/copyright</a>. Ergänzende Einträge und Kontaktdaten: Overture Maps Foundation, <a href="https://overturemaps.org/">overturemaps.org</a> (CDLA-Permissive-2.0; Datensätze von Foursquare unter Apache-2.0); Foursquare Open Source Places (Apache-2.0); Karte von morgen (CC0-1.0); offene Verwaltungsdaten der Stadt Rothenburg ob der Tauber (CC0) und der BayernCloud Tourismus (CC0 bzw. CC BY 4.0, Urheber auf der jeweiligen Hofseite). Postleitzahlen: GeoNames, CC BY 4.0. Umriss Deutschlands: Natural Earth (gemeinfrei). Karte: Leaflet (BSD-2-Clause). Schriften: Zilla Slab und Atkinson Hyperlegible Next (SIL Open Font License).</p>`);
textSeite('/datenschutz/', 'Datenschutzerklärung', GA_ID ? 'Datenschutzerklärung von hofladenliste.de: welche Daten beim Besuch, bei Karte und Suche anfallen, und Google Analytics nur mit Einwilligung.' : 'Datenschutzerklärung von hofladenliste.de: keine Cookies, kein Tracking – welche Daten beim Besuch, bei Karte und Suche anfallen.', `<h1>Datenschutzerklärung</h1>
<h2>Verantwortlicher</h2>
<p>${esc(imp.name) || '[Name]'}, ${esc(imp.strasse) || '[Straße]'}, ${esc(imp.plzOrt) || '[PLZ Ort]'}, ${esc(imp.email) || '[E-Mail]'}</p>
<h2>Rückmeldung „Stimmt das noch?“</h2>
<p>Klickst du auf einer Hofseite auf „Ja, stimmt noch“ oder „Geschlossen melden“, speichern wir nur den Eintrag, die Art der Rückmeldung und das Datum. Damit dieselbe Rückmeldung nicht mehrfach zählt, bilden wir aus deiner IP-Adresse, dem Tag und dem Eintrag einen nicht umkehrbaren Prüfwert, der nach einem Tag gelöscht wird. Die IP-Adresse selbst speichern wir nicht.</p>
<h2>Hosting</h2>
<p>Diese Website wird über Cloudflare (Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA) ausgeliefert. Beim Aufruf verarbeitet Cloudflare technisch notwendige Verbindungsdaten (z. B. IP-Adresse, Zeitpunkt, angeforderte Seite), um die Website auszuliefern und vor Angriffen zu schützen (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare ist unter dem EU-US Data Privacy Framework zertifiziert.</p>
<h2>Schriften und Skripte</h2>
<p>Schriften und Programmbibliotheken liegen auf unserem eigenen Server. Es werden keine Inhalte von Google Fonts oder anderen Schriftanbietern geladen.</p>
<h2>Karten</h2>
${KACHELN ? '<p>Die Karten liefern wir von unserem eigenen Server aus (Kartendaten © OpenStreetMap-Mitwirkende, aufbereitet mit Protomaps). Dabei werden keine Daten an Dritte übertragen; es gelten die Angaben zu Cloudflare oben.</p>' : `<p>Karten werden erst geladen, wenn du auf „Karte laden“ klickst. Dann ruft dein Browser Kartenbilder von den Servern der OpenStreetMap Foundation (St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS, Großbritannien) ab; dabei wird deine IP-Adresse übertragen (Art. 6 Abs. 1 lit. a DSGVO). Wenn du „Für diese Website merken“ auswählst, speichert dein Browser diese Entscheidung lokal (localStorage). Du kannst sie jederzeit über die Browsereinstellungen löschen. Datenschutzhinweise der OpenStreetMap Foundation: <a href="https://osmfoundation.org/wiki/Privacy_Policy">osmfoundation.org/wiki/Privacy_Policy</a>.</p>`}
<h2>Postleitzahl- und Standortsuche</h2>
<p>Wenn du eine Postleitzahl eingibst, wird sie an unseren Server übermittelt, um passende Hofläden anzuzeigen. Wenn du „Meinen Standort verwenden“ wählst, fragt dein Browser zuerst um Erlaubnis; die Koordinaten werden nur für diese Suche übertragen und nicht gespeichert. Die zuletzt gesuchte Postleitzahl speichert dein Browser lokal (localStorage).</p>
<h2>Betreiber-Bereich</h2>
<p>Betriebe melden sich unter /betrieb/ mit einem Link per E-Mail an, ein Passwort gibt es nicht. Wir speichern dafür die E-Mail-Adresse, die zugeordneten Höfe und den Zeitpunkt der letzten Anmeldung. Nach der Anmeldung setzt dein Browser ein technisch notwendiges Sitzungs-Cookie („hl_sitzung“, 30 Tage), das nur der Anmeldung dient (§ 25 Abs. 2 TTDSG). E-Mails (Anmeldelinks, Bestätigungen) versenden wir über Resend (Resend, Inc., USA, EU-US Data Privacy Framework); übermittelt werden Empfängeradresse und Inhalt der Nachricht (Art. 6 Abs. 1 lit. b DSGVO).</p>
<h2>Saison-Benachrichtigung</h2>
<p>Für die Saison-Benachrichtigung speichern wir deine E-Mail-Adresse, Postleitzahl, Umkreis und die gewählten Produkte, bis du dich abmeldest (Art. 6 Abs. 1 lit. a DSGVO, Einwilligung per Bestätigungslink). Beim Abmelden löschen wir die E-Mail-Adresse. Versand über Resend.</p>
<h2>Tipps von Besuchern</h2>
<p>Tipps und „Daumen hoch“ zu einem Hof bestätigst du über einen Link per E-Mail (Versand über Resend). Wir speichern Merkmale, Text, den optionalen Vornamen und eine Prüfsumme der E-Mail-Adresse gegen Mehrfachabgaben, nicht die Adresse selbst. Veröffentlicht werden Merkmale, Text, Vorname und Datum, erst nach unserer Prüfung. Auch hier lädt Cloudflare Turnstile erst, wenn du „Tipp geben“ wählst.</p>
<h2>Nachricht an den Hof (Cloudflare Turnstile)</h2>
<p>Bei Höfen, die ihren Eintrag selbst pflegen, kannst du über ein Formular eine Nachricht schicken. Erst wenn du „Nachricht schreiben“ wählst, lädt dein Browser Cloudflare Turnstile (Cloudflare, Inc.) zum Schutz vor Spam; dabei werden technische Daten wie IP-Adresse und Browsermerkmale an Cloudflare übertragen (Art. 6 Abs. 1 lit. f DSGVO). Name, E-Mail-Adresse und Text leiten wir per E-Mail (Resend) an den Betrieb weiter und speichern sie nicht.</p>
<h2>Merkliste</h2>
<p>Höfe, die du mit „Merken“ markierst, speichert nur dein Browser (localStorage) – wir haben darauf keinen Zugriff. Wenn du die Merkliste öffnest, lädt dein Browser die aktuellen Angaben zu diesen Höfen von unserem Server; dabei wird nichts gespeichert. Du kannst die Merkliste jederzeit dort leeren oder über die Browsereinstellungen löschen.</p>
<h2>Suchstatistik</h2>
<p>Damit wir sehen, in welchen Regionen Hofläden gesucht werden, zählen wir auf unserem Server, wie oft am Tag nach einer Postleitzahl gesucht wurde – zusammen mit dem zugehörigen Landkreis, dem gewählten Angebotsfilter und der Art der Suche (Postleitzahl, Ortsname oder Standort). Bei der Suche nach einem Ortsnamen zählen wir die Postleitzahl des gefundenen Orts; den eingegebenen Text speichern wir nicht. Bei der Standortsuche wird nur die nächstgelegene Postleitzahl gezählt, nicht die Koordinaten. IP-Adressen, Uhrzeiten, Geräte- oder Browserdaten speichern wir dabei nicht, und auf deinem Gerät wird nichts gespeichert oder ausgelesen. Ein Rückschluss auf einzelne Personen ist nicht möglich. Die Zähler liegen in einer Datenbank von Cloudflare (Cloudflare, Inc., Region Westeuropa); Rechtsgrundlage ist unser berechtigtes Interesse an der Verbesserung des Angebots (Art. 6 Abs. 1 lit. f DSGVO).</p>
<h2>Nutzungsstatistik</h2>
<p>Um zu sehen, welche Funktionen genutzt werden, zählen wir auf unserem Server Klicks auf „Route“, „Anrufen“, „Website“, auf Filter und auf „In meiner Nähe“ – als reine Tageszähler je Seitentyp (z. B. „heute 12-mal Route auf Hofseiten“). Auf Hofseiten zählen wir zusätzlich Aufrufe und diese Klicks je Hof als Tagessumme, damit der Betrieb sieht, wie oft sein Eintrag genutzt wird. Dabei speichern wir weder IP-Adressen noch Uhrzeiten, Geräte- oder Browserdaten; auf deinem Gerät wird nichts gespeichert oder ausgelesen. Ein Rückschluss auf einzelne Personen ist nicht möglich. Rechtsgrundlage ist unser berechtigtes Interesse an der Verbesserung des Angebots (Art. 6 Abs. 1 lit. f DSGVO).</p>
<h2 id="formular">Formular „Mitmachen“</h2>
<p>Wenn du über das Formular einen Hof einträgst, Angaben korrigierst oder einen Eintrag übernimmst, speichern wir deine Angaben in einer Datenbank von Cloudflare (Cloudflare, Inc., Region Westeuropa): die Angaben zum Betrieb, gegebenenfalls Fotos sowie – freiwillig, bei der Übernahme eines Eintrags erforderlich – deinen Namen und deine E-Mail-Adresse. Die Angaben zum Betrieb und freigegebene Fotos veröffentlichen wir nach Prüfung. Name und E-Mail-Adresse verwenden wir nur für Rückfragen und zur Bestätigung von Betreibern; sie werden nicht veröffentlicht und spätestens sechs Monate nach Bearbeitung gelöscht. Abgelehnte Fotos löschen wir sofort. Gegen Missbrauch zählen wir Meldungen je Absender und Tag über einen anonymisierten Tages-Hash der IP-Adresse; die IP-Adresse selbst speichern wir nicht. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) bzw. bei Betreibern die Durchführung der Eintragung (Art. 6 Abs. 1 lit. b DSGVO). Du kannst deine Angaben jederzeit über die Kontaktadresse löschen lassen.</p>
${GA_ID ? `<h2 id="google-analytics">Google Analytics (nur mit deiner Einwilligung)</h2>
<p>Wenn du im Hinweis „Darf Google Analytics mitzählen?“ auf „Erlauben“ klickst, nutzen wir Google Analytics 4, einen Webanalysedienst der Google Ireland Limited (Gordon House, Barrow Street, Dublin 4, Irland). Vorher wird nichts von Google geladen und kein Cookie gesetzt. Nach deiner Einwilligung lädt dein Browser ein Skript von googletagmanager.com und setzt die Cookies „_ga“ und „_ga_*“ (Speicherdauer bis zu zwei Jahre), mit denen wiederkehrende Besuche erkannt werden. Erfasst werden aufgerufene Seiten, Klicks auf Funktionen wie „Route“ oder „Anrufen“ und auf Links zu anderen Websites, Scrolltiefe, Suchbegriffe der Suche auf dieser Website, Herkunftsseite, ungefährer Ort (aus der gekürzten IP-Adresse), Geräte- und Browsertyp sowie Zeitpunkt. Google Analytics 4 speichert keine vollständigen IP-Adressen. Google-Signale und Werbefunktionen sind ausgeschaltet. Die Daten können an Google LLC in den USA übermittelt werden; Google ist unter dem EU-US Data Privacy Framework zertifiziert. Wir nutzen die Auswertung nur, um zu sehen, welche Seiten und Funktionen gebraucht werden; die Daten werden nach 14 Monaten gelöscht.</p>
<p>Rechtsgrundlage ist deine Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO). Du kannst sie jederzeit über „Cookie-Einstellungen“ unten auf jeder Seite widerrufen; dann löschen wir die Analytics-Cookies in deinem Browser und laden das Skript nicht mehr. Deine Wahl speichert dein Browser lokal (localStorage, Eintrag „statistik“). Mehr in der <a href="https://policies.google.com/privacy?hl=de" rel="nofollow noopener" target="_blank">Datenschutzerklärung von Google</a>.</p>
<h2>Sonstige Cookies</h2>
<p>Außer den Analytics-Cookies nach Einwilligung und dem Anmelde-Cookie im Betreiber-Bereich setzt diese Website keine Cookies. Links zu Routenplanern und zu Websites der Höfe öffnen externe Seiten; dort gelten deren Datenschutzbestimmungen.</p>` : `<h2>Cookies und Tracking</h2>
<p>Für Besucher setzt diese Website keine Cookies und nutzt kein Tracking über Websites hinweg (zum Anmelde-Cookie im Betreiber-Bereich siehe oben). Links zu Routenplanern und zu Websites der Höfe öffnen externe Seiten; dort gelten deren Datenschutzbestimmungen.</p>`}
<h2>Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde.</p>`);
// ---------- Badge für Höfe (Backlink) ----------
{
  const innen = LOGO.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const badge = (hell) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="56" viewBox="0 0 200 56" role="img" aria-label="Wir sind auf hofladenliste.de"><rect width="200" height="56" rx="10" fill="${hell ? '#FFFFFF' : '#173B2C'}" stroke="${hell ? '#D9E0DA' : '#173B2C'}"/><g transform="translate(10 10) scale(.5625)">${innen}</g><text x="56" y="24" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="${hell ? '#56635B' : '#CFE0D5'}">Wir sind auf</text><text x="56" y="41" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="${hell ? '#173B2C' : '#F4C430'}">hofladenliste.de</text></svg>`;
  writeFileSync(join(OUT, 'badge.svg'), badge(true));
  writeFileSync(join(OUT, 'badge-dunkel.svg'), badge(false));
  const code = (bild) => esc(`<a href="${cfg.domain}/" title="Hofladen auf hofladenliste.de"><img src="${cfg.domain}/${bild}" width="200" height="56" alt="Wir sind auf hofladenliste.de"></a>`);
  schreibe('/fuer-hoefe/', seite({
    titel: 'Für Höfe: Eintrag übernehmen und Badge für die Website',
    beschreibung: 'Für Hofläden und Automaten-Betreiber: Eintrag auf hofladenliste.de kostenlos übernehmen, Öffnungszeiten und Angebot selbst pflegen und das Badge „Wir sind auf hofladenliste.de“ einbinden.',
    pfad: '/fuer-hoefe/',
    klasse: 'textseite',
    krumen: [['Für Höfe', '/fuer-hoefe/']],
    inhalt: `<article class="text" data-badge-seite>
<h1>Für Höfe und Direktvermarkter</h1>
<p>hofladenliste.de ist kostenlos – für Besucher und für Betriebe. Wenn dein Hof schon eingetragen ist, kannst du den Eintrag übernehmen und selbst aktuell halten: Öffnungszeiten, Angebot, Zahlungsarten, Fotos und saisonale Hinweise wie „Spargel ab Mitte April“.</p>
<p><a class="knopf knopf-dunkel" href="/mitmachen/" data-badge-uebernehmen>Eintrag übernehmen oder neu eintragen</a></p>
<h2>Badge für deine Website</h2>
<p>Zeig deinen Kundinnen und Kunden, dass sie dich auf hofladenliste.de mit Öffnungszeiten und Route finden. Kopiere einfach den Code in deine Website.</p>
<p class="badge-vorschau"><img src="/badge.svg" width="200" height="56" alt="Wir sind auf hofladenliste.de"> <img src="/badge-dunkel.svg" width="200" height="56" alt="Wir sind auf hofladenliste.de (dunkel)"></p>
<label for="badge-code-hell">Code (hell)</label>
<textarea id="badge-code-hell" rows="3" readonly data-badge-code="badge.svg">${code('badge.svg')}</textarea>
<label for="badge-code-dunkel">Code (dunkel)</label>
<textarea id="badge-code-dunkel" rows="3" readonly data-badge-code="badge-dunkel.svg">${code('badge-dunkel.svg')}</textarea>
<p class="leise">Öffnest du diese Seite über „Badge für deine Website“ auf der Seite deines Hofs, verlinkt der Code direkt auf deinen Eintrag.</p>
<h2>Woher kommen die Daten?</h2>
<p>Die meisten Einträge stammen aus <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, ergänzt um Angaben von den Websites der Höfe und von Betrieben selbst. Angaben von Betrieben haben bei uns Vorrang. Mehr dazu unter <a href="/quellen/">Quellen</a>.</p>
</article>`,
  }));
}

// ---------- Verwaltung der Meldungen (nicht öffentlich verlinkt, noindex) ----------
schreibe('/verwaltung/', seite({
  titel: 'Verwaltung | Hofladenliste', beschreibung: 'Verwaltung der Meldungen zu Hofläden – nur für die Redaktion von hofladenliste.de.',
  pfad: '/verwaltung/', noindex: true, klasse: 'textseite', krumen: [['Verwaltung', '/verwaltung/']],
  inhalt: '<section class="abschnitt"><h1>Meldungen</h1><div id="verwaltung"></div></section><script type="module" src="/verwaltung.js"></script>',
}), false);

// ---------- Vertrauen: Über uns, Kontakt, Presse, Datenstand & Statistik ----------
{
  const nHof = eintraege.filter((e) => e.typ === 'hofladen').length, nAut = eintraege.length - nHof;
  const proz = (f) => Math.round(100 * eintraege.filter(f).length / eintraege.length);
  const verlauf = existsSync(join(ROOT, 'data', 'verlauf.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'verlauf.json'), 'utf8')) : [];
  const nachArt = Object.entries(eintraege.reduce((a, e) => ((a[e.art] = (a[e.art] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  const quellenZahl = { osm: 0, overture: 0, foursquare: 0, kvm: 0, kommunal: 0, betreiber: 0, manuell: 0 };
  for (const e of eintraege) quellenZahl[e.quelle] = (quellenZahl[e.quelle] || 0) + 1;
  const QUELL_NAME = { osm: 'OpenStreetMap', overture: 'Overture Maps', foursquare: 'Foursquare Open Source Places', kvm: 'Karte von morgen', kommunal: 'Offene Verwaltungsdaten', betreiber: 'Angaben von Betrieben', manuell: 'Eigene Recherche' };
  const proLandStat = laender.map((l) => {
    const es = l.kreise.flatMap((k) => proKreis.get(k.code) || []);
    return { l, hof: es.filter((e) => e.typ === 'hofladen').length, aut: es.filter((e) => e.typ === 'automat').length, maerkte: l.kreise.reduce((s, k) => s + (maerkteProKreis.get(k.code)?.length || 0), 0), zeiten: es.filter((e) => e.oeffnungszeiten).length, n: es.length };
  }).sort((a, b) => b.n - a.n);
  const datumLang = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const zahlenSatz = `${zahl(nHof)} Hofläden und Direktvermarkter, ${zahl(nAut)} Hofautomaten und ${zahl(MAERKTE.length)} Wochenmärkte in allen 16 Bundesländern`;

  textSeite('/ueber-uns/', 'Über uns', 'Wer hinter Hofladenliste steht und warum: ein unabhängiges, kostenloses Verzeichnis für Hofläden, Milchtankstellen und Hofautomaten auf Basis offener Daten.', `<h1>Über Hofladenliste</h1>
<p>Hofladenliste ist ein unabhängiges Verzeichnis für Lebensmittel direkt vom Hof: ${zahlenSatz}. Die Idee ist einfach: Wer frische Eier, Milch, Kartoffeln oder Honig aus der Nähe kaufen möchte, soll schnell sehen, wo es das gibt, wann geöffnet ist und wie man hinkommt.</p>
<h2>Wer dahinter steht</h2>
<p>Hofladenliste wird von ${esc(imp.name)} aus ${esc(imp.plzOrt.replace(/^\d{5}\s*/, ''))} betrieben. Die Seite ist kein Angebot eines Verbands, einer Handelskette oder eines Hofs, und sie verkauft nichts.</p>
<h2>Was uns wichtig ist</h2>
<ul>
<li><b>Offene Daten:</b> Die meisten Einträge stammen aus OpenStreetMap und weiteren offenen Quellen mit freier Lizenz. Woher eine Angabe kommt, steht auf jeder Hofseite und unter <a href="/quellen/">Quellen</a>. Inhalte anderer Verzeichnisse übernehmen wir nicht.</li>
<li><b>Kostenlos für Höfe:</b> Jeder Betrieb kann sich <a href="/mitmachen/">eintragen</a> und seinen Eintrag im <a href="/betrieb/">Betreiber-Bereich</a> selbst pflegen – mit Öffnungszeiten, Neuigkeiten und Terminen.</li>
${GA_ID ? '<li><b>Datensparsam:</b> keine Werbung, Google Analytics nur, wenn du es erlaubst. Die Karte kommt von unserem eigenen Server. Details in der <a href="/datenschutz/">Datenschutzerklärung</a>.</li>' : '<li><b>Ohne Tracking:</b> keine Cookies für Besucher, keine Werbung, keine Analysedienste von Dritten. Die Karte kommt von unserem eigenen Server. Details in der <a href="/datenschutz/">Datenschutzerklärung</a>.</li>'}
<li><b>Gemeinsam besser:</b> Öffnungszeiten ändern sich. Mit „Stimmt das noch?“ auf jeder Hofseite hilfst du, die Angaben aktuell zu halten.</li>
</ul>
<p>Fragen, Hinweise oder Kritik: <a href="/kontakt/">Kontakt</a>.</p>`, false);

  textSeite('/kontakt/', 'Kontakt', 'Kontakt zu Hofladenliste: E-Mail hofladenliste@gmail.com – für Korrekturen, Einträge, Betriebe und Presseanfragen.', `<h1>Kontakt</h1>
<p>Am schnellsten erreichst du uns per E-Mail: <a href="mailto:hofladenliste@gmail.com">hofladenliste@gmail.com</a>.</p>
<h2>Worum geht es?</h2>
<ul>
<li><b>Eine Angabe stimmt nicht</b> (Öffnungszeiten, Adresse, Hof geschlossen): Nutze auf der Seite des Hofs „Stimmt das noch?“ oder „Fehler melden“ – dann landet die Meldung direkt beim richtigen Eintrag.</li>
<li><b>Ein Hof fehlt:</b> <a href="/mitmachen/">Hofladen eintragen</a>, kostenlos.</li>
<li><b>Du betreibst einen Hof:</b> Im <a href="/betrieb/">Betreiber-Bereich</a> pflegst du deinen Eintrag selbst. Ein Aushang mit QR-Code für deinen Laden ist dort auch zu finden.</li>
<li><b>Presse:</b> Zahlen, Logo und Ansprechpartner auf der <a href="/presse/">Presseseite</a>.</li>
</ul>
<p>Anbieter dieser Website: siehe <a href="/impressum/">Impressum</a>.</p>`, false);

  textSeite('/presse/', 'Presse', `Presseinformationen zu Hofladenliste: ${zahlenSatz}. Zahlen, Logo und Ansprechpartner.`, `<h1>Presse</h1>
<p>Hofladenliste ist ein kostenloses, unabhängiges Verzeichnis für Lebensmittel direkt vom Hof. Stand ${esc(datumLang(HEUTE))}: ${zahlenSatz}.</p>
<h2>Zahlen</h2>
<ul class="presse-zahlen">
<li><b>${zahl(nHof)}</b> Hofläden und Direktvermarkter, davon ${zahl(eintraege.filter((e) => e.art === 'Imkerei').length)} Imkereien und ${zahl(eintraege.filter((e) => e.art === 'Hofcafé').length)} Hofcafés</li>
<li><b>${zahl(nAut)}</b> Hofautomaten, darunter ${zahl(eintraege.filter((e) => e.art === 'Milchtankstelle').length)} Milchtankstellen und ${zahl(eintraege.filter((e) => e.art === 'Eierautomat').length)} Eierautomaten</li>
<li><b>${zahl(MAERKTE.length)}</b> Wochenmärkte</li>
<li>Meiste Einträge: ${proLandStat.slice(0, 3).map((x) => `${esc(x.l.name)} (${zahl(x.n)})`).join(', ')}</li>
</ul>
<p>Alle Zahlen nach Bundesland und ihre Entwicklung stehen unter <a href="/statistik/">Datenstand &amp; Statistik</a>. Gern dürfen Sie sie mit Quellenangabe „hofladenliste.de“ verwenden.</p>
<h2>Logo</h2>
<p><img src="/favicon.svg" alt="Logo von Hofladenliste: gelbe Kartennadel mit grüner Ähre" width="96" height="96"></p>
<p><a href="/favicon.svg" download>Logo als SVG</a> · <a href="/icon-512.png" download>Logo als PNG (512 × 512)</a> · <a href="/og-bild.png" download>Vorschaubild (1200 × 630)</a></p>
<h2>Ansprechpartner</h2>
<p>${esc(imp.name)}, ${esc(imp.plzOrt)}<br>E-Mail: <a href="mailto:hofladenliste@gmail.com">hofladenliste@gmail.com</a></p>
<h2>Kurzbeschreibung zum Übernehmen</h2>
<blockquote><p>Hofladenliste.de zeigt Hofläden, Milchtankstellen, Eier- und Regiomaten, Imkereien und Wochenmärkte in ganz Deutschland – mit Öffnungszeiten, Angebot, Karte und der Anzeige „jetzt geöffnet“. Die Daten stammen überwiegend aus OpenStreetMap und weiteren offenen Quellen; Betriebe können ihren Eintrag kostenlos selbst pflegen.</p></blockquote>`, false);

  textSeite('/statistik/', 'Datenstand & Statistik', `Datenstand von Hofladenliste: ${zahlenSatz} – nach Bundesland, Art und Quelle, mit Vollständigkeit der Angaben und Verlauf.`, `<h1>Datenstand &amp; Statistik</h1>
<p>Stand ${esc(datumLang(HEUTE))}: ${zahlenSatz}. Die Zahlen werden bei jeder Aktualisierung neu berechnet.</p>
<h2>Nach Bundesland</h2>
<div class="tabelle-scroll"><table class="stat-tabelle"><thead><tr><th scope="col">Bundesland</th><th scope="col">Hofläden</th><th scope="col">Automaten</th><th scope="col">Wochenmärkte</th><th scope="col">mit Öffnungszeiten</th></tr></thead><tbody>
${proLandStat.map((x) => `<tr><th scope="row"><a href="/${x.l.slug}/">${esc(x.l.name)}</a></th><td>${zahl(x.hof)}</td><td>${zahl(x.aut)}</td><td>${zahl(x.maerkte)}</td><td>${x.n ? Math.round(100 * x.zeiten / x.n) : 0} %</td></tr>`).join('')}
</tbody></table></div>
<h2>Nach Art</h2>
<div class="tabelle-scroll"><table class="stat-tabelle"><tbody>${nachArt.map(([a, n]) => `<tr><th scope="row">${esc(PLURAL_ART[a] || a)}</th><td>${zahl(n)}</td></tr>`).join('')}</tbody></table></div>
<h2>Woher die Einträge kommen</h2>
<div class="tabelle-scroll"><table class="stat-tabelle"><tbody>${Object.entries(quellenZahl).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([q, n]) => `<tr><th scope="row">${esc(QUELL_NAME[q] || q)}</th><td>${zahl(n)}</td></tr>`).join('')}</tbody></table></div>
<p>Lizenzen und Details: <a href="/quellen/">Quellen</a>.</p>
<h2>Wie vollständig die Angaben sind</h2>
<ul><li>Öffnungszeiten: ${proz((e) => e.oeffnungszeiten)} %</li><li>Telefon: ${proz((e) => e.telefon)} %</li><li>Website: ${proz((e) => e.website)} %</li><li>Angebot (was es gibt): ${proz((e) => e.kat?.length)} %</li><li>Adresse mit Straße: ${proz((e) => e.strasse)} %</li><li>Haltestelle im Umkreis von 1 km: ${proz((e) => e.haltestelle)} %</li></ul>
<p>Fehlt etwas bei einem Hof in deiner Nähe? Auf jeder Hofseite kannst du Angaben ergänzen.</p>
${verlauf.length > 1 ? `<h2>Verlauf</h2><div class="tabelle-scroll"><table class="stat-tabelle"><thead><tr><th scope="col">Datum</th><th scope="col">Einträge</th><th scope="col">Hofläden</th><th scope="col">Automaten</th><th scope="col">Wochenmärkte</th></tr></thead><tbody>${[...verlauf].reverse().slice(0, 60).map((v) => `<tr><th scope="row">${esc(datumLang(v.datum))}</th><td>${zahl(v.eintraege)}</td><td>${zahl(v.hoefe)}</td><td>${zahl(v.automaten)}</td><td>${zahl(v.maerkte)}</td></tr>`).join('')}</tbody></table></div>` : ''}`, false);
}

textSeite('/quellen/', 'Quellen und Datenstand', 'Woher die Daten auf hofladenliste.de stammen: OpenStreetMap (ODbL), weitere offene Quellen wie Overture Maps, Foursquare und Karte von morgen, Websites der Höfe, Angaben von Betrieben und PLZ-Daten von GeoNames.', `<h1>Quellen und Datenstand</h1>
<h2>OpenStreetMap</h2>
<p>Die meisten Einträge stammen aus <a href="https://www.openstreetmap.org/">OpenStreetMap</a>: Hofläden (<code>shop=farm</code>) und Hofautomaten (<code>amenity=vending_machine</code> mit Milch, Eiern, Fleisch, Kartoffeln usw.). Wir gleichen die Daten jeden Montag und Donnerstag ab. Daten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>, verfügbar unter der <a href="https://opendatacommons.org/licenses/odbl/">Open Database License (ODbL)</a>.</p>
<h2>Weitere offene Quellen</h2>
<p>Hofläden und Automaten, die in OpenStreetMap noch fehlen, ergänzen wir aus weiteren offenen Datenquellen (aktuell ${offenNeuSumme.toLocaleString('de-DE')} Einträge). Daraus füllen wir außerdem fehlende Telefonnummern, Websites, Adressen und Öffnungszeiten bestehender Einträge auf. Wir übernehmen nur Orte mit eindeutigem Namen (zum Beispiel Hofladen, Hofverkauf oder Milchtankstelle) oder solche, die die Quelle selbst als Hofladen oder Direktvermarkter einordnet, und gleichen alles mit OpenStreetMap und untereinander ab, damit kein Hof doppelt erscheint. Ist eine Quelle unsicher, prüfen wir den Direktverkauf auf der eigenen Website des Hofs. Diese Einträge sind auf ihrer Seite als „noch nicht vom Betrieb bestätigt“ gekennzeichnet und nennen ihre Quelle. Wir gleichen die Daten einmal im Monat ab.</p>
<ul>
<li><a href="https://overturemaps.org/">Overture Maps Foundation</a>, Places (${(offenNeu.overture || 0).toLocaleString('de-DE')} Einträge): <a href="https://cdla.dev/permissive-2-0/">CDLA-Permissive-2.0</a>, Datensätze von Foursquare unter Apache-2.0. Das Overture-Places-Thema enthält keine OpenStreetMap-Daten.</li>
<li><a href="https://opensource.foursquare.com/os-places/">Foursquare Open Source Places</a> (${(offenNeu.foursquare || 0).toLocaleString('de-DE')} Einträge): <a href="https://www.apache.org/licenses/LICENSE-2.0">Apache-2.0</a>.</li>
<li><a href="https://kartevonmorgen.org/">Karte von morgen</a> (${(offenNeu.kvm || 0).toLocaleString('de-DE')} Einträge): gemeinfrei (CC0-1.0).</li>
<li>Offene Verwaltungsdaten über <a href="https://www.govdata.de/">GovData</a> und Open Data Bayern (${(offenNeu.kommunal || 0).toLocaleString('de-DE')} Einträge): Direktvermarkter der Stadt Rothenburg ob der Tauber (CC0) und Einkaufsangebote der BayernCloud Tourismus, nur Einträge unter CC0 oder CC BY 4.0. Urheber nennen wir auf der jeweiligen Hofseite.</li>
</ul>
<h2>Websites der Höfe</h2>
<p>Fehlen in OpenStreetMap Öffnungszeiten oder Kontaktdaten, ergänzen wir sie aus der eigenen Website des Hofs. Auf der Seite des Eintrags steht dann, welche Angaben woher stammen und mit welchem Stand.</p>
<h2>Angaben von Betrieben</h2>
<p>Betriebe können ihren Eintrag über <a href="/mitmachen/">Mitmachen</a> übernehmen und pflegen. Diese Angaben prüfen wir und zeigen sie mit Stand an; sie haben Vorrang vor anderen Quellen.</p>
<h2>Postleitzahlen und Orte</h2>
<p>Postleitzahlen, Orte und Kreise: <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0). ${KACHELN ? `Kartenkacheln: © OpenStreetMap-Mitwirkende (ODbL), erzeugt mit <a href="https://protomaps.com/">Protomaps</a> (Stand ${KACHELN.version.slice(6)}.${KACHELN.version.slice(4, 6)}.${KACHELN.version.slice(0, 4)}), auf unserem eigenen Server.` : 'Kartenbilder: OpenStreetMap, erst nach deiner Zustimmung geladen.'}</p>
<h2>Keine Daten anderer Verzeichnisse</h2>
<p>Wir übernehmen keine Daten, Texte oder Bilder aus anderen Hofladen-Verzeichnissen.</p>
`, false);

// ---------- Mitmachen: Formular für neue Einträge, Korrekturen und Übernahmen ----------
{
  const TAGE_FORM = [['mo', 'Montag'], ['di', 'Dienstag'], ['mi', 'Mittwoch'], ['do', 'Donnerstag'], ['fr', 'Freitag'], ['sa', 'Samstag'], ['so', 'Sonntag']];
  const zeitZeile = ([k, n]) => `<tr><th scope="row">${n}</th><td><input type="time" name="${k}_von1" aria-label="${n} von"> – <input type="time" name="${k}_bis1" aria-label="${n} bis"></td><td><input type="time" name="${k}_von2" aria-label="${n} zweites Zeitfenster von"> – <input type="time" name="${k}_bis2" aria-label="${n} zweites Zeitfenster bis"></td></tr>`;
  const formular = `
<form class="melde-form" action="/api/meldung" method="post" enctype="multipart/form-data" data-meldeform>
  <fieldset class="melde-art">
    <legend>Was möchtest du tun?</legend>
    <label><input type="radio" name="art" value="neu" checked><span>Neuen Hof oder Automaten eintragen</span></label>
    <label><input type="radio" name="art" value="korrektur"><span>Bestehenden Eintrag ergänzen oder korrigieren</span></label>
    <label><input type="radio" name="art" value="uebernahme"><span>Ich betreibe den Hof und möchte den Eintrag übernehmen</span></label>
  </fieldset>
  <input type="hidden" name="hof" value=""><input type="hidden" name="eintrag" value="">
  ${["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].map((k) => `<input type="hidden" name="${k}" value="">`).join("")}

  <div class="feldgruppe">
    <h2>Betrieb</h2>
    <label data-feld="name">Name<input name="name" maxlength="120" autocomplete="organization"></label>
    <label>Art<select name="betriebsart"><option value="">bitte wählen</option><option>Hofladen</option><option>Milchtankstelle</option><option>Eierautomat</option><option>Regiomat</option><option>Fleischautomat</option><option>Kartoffelautomat</option><option>sonstiger Automat</option></select></label>
    <label data-feld="adresse">Straße und Hausnummer<input name="strasse" maxlength="120" autocomplete="street-address"></label>
    <div class="zeile"><label data-feld="adresse">PLZ<input name="plz" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="postal-code"></label><label>Ort<input name="ort" maxlength="80" autocomplete="address-level2"></label></div>
    <div class="zeile"><label data-feld="telefon">Telefon<input name="telefon" type="tel" maxlength="40"></label><label data-feld="online">E-Mail des Betriebs<input name="email" type="email" maxlength="120"></label></div>
    <label data-feld="online">Website<input name="website" type="url" maxlength="200" placeholder="https://"></label>
  </div>
  <div class="feldgruppe" data-feld="zeiten" id="zeiten">
    <h2>Öffnungszeiten</h2>
    <p class="leise" data-bisher-zeiten hidden></p>
    <label class="haken"><input type="checkbox" name="rund" value="ja"><span>Rund um die Uhr geöffnet (z. B. Automat)</span></label>
    <table class="zeiten-form"><thead><tr><th></th><th>Zeitfenster</th><th>Zweites Zeitfenster (optional)</th></tr></thead><tbody>${TAGE_FORM.map(zeitZeile).join('')}</tbody></table>
    <p class="leise">Leere Tage gelten als geschlossen.</p>
    <label>Saisonale Hinweise<textarea name="saison" maxlength="300" rows="2" placeholder="z. B. Spargel ab Mitte April, im Januar Betriebsferien"></textarea></label>
  </div>
  <div class="feldgruppe">
    <h2>Angebot</h2>
    <div class="haken-liste" data-feld="angebot">${Object.entries(KATEGORIEN).map(([k, n]) => `<label class="haken"><input type="checkbox" name="angebot" value="${k}"><span>${esc(n)}</span></label>`).join('')}</div>
    <label class="haken"><input type="checkbox" name="bio" value="ja"><span>Bio (zertifiziert)</span></label>
    <h3>Bezahlen</h3>
    <div class="haken-liste" data-feld="bezahlen">${Object.entries(ZAHLUNG_TEXT).map(([k, n]) => `<label class="haken"><input type="checkbox" name="zahlung" value="${k}"><span>${esc(n)}</span></label>`).join('')}</div>
    <label data-feld="beschreibung">Kurze Beschreibung<textarea name="beschreibung" maxlength="600" rows="3"></textarea></label>
  </div>
  <div class="feldgruppe">
    <h2>Fotos (optional)</h2>
    <label data-feld="fotos">Bis zu 3 Fotos vom Hof oder Laden<input type="file" name="fotos" accept="image/jpeg,image/png,image/webp" multiple></label>
    <label class="haken"><input type="checkbox" name="fotorechte" value="ja"><span>Ich habe die Rechte an den Fotos und erlaube die Veröffentlichung auf hofladenliste.de. Auf den Fotos sind keine erkennbaren Personen ohne deren Einverständnis.</span></label>
  </div>
  <div class="feldgruppe">
    <h2>Kontakt</h2>
    <div class="zeile"><label>Dein Name<input name="kontakt_name" maxlength="120" autocomplete="name"></label><label>Deine E-Mail<input name="kontakt_email" type="email" maxlength="120" autocomplete="email"></label></div>
    <p class="leise">Für Rückfragen; bei der Übernahme eines Eintrags Pflicht. Wird nicht veröffentlicht. Mit E-Mail-Adresse sagen wir dir Bescheid, sobald deine Meldung online ist.</p>
    <label class="haken" data-nur-uebernahme hidden><input type="checkbox" name="badge" value="ja"><span>Schickt mir bitte das Badge „Wir sind auf hofladenliste.de“ für unsere Website.</span></label>
    <label>Anmerkungen<textarea name="hinweis" maxlength="2000" rows="3"></textarea></label>
    <label class="falle" aria-hidden="true">Firma<input name="firma" tabindex="-1" autocomplete="off"></label>
    <input type="hidden" name="t" value="">
    <label class="haken"><input type="checkbox" name="einwilligung" value="ja" required><span>Ich habe den <a href="/datenschutz/#formular">Datenschutzhinweis</a> gelesen. Die Angaben zum Betrieb werden nach Prüfung veröffentlicht.</span></label>
  </div>
  <p><button type="submit" class="knopf knopf-dunkel">Absenden</button></p>
  <p class="fehler" data-melde-fehler hidden></p>
</form>`;
  textSeite('/mitmachen/', 'Hofladen eintragen – kostenlos', 'Hofladen eintragen: Trage deinen Hofladen, deine Milchtankstelle, deinen Eierautomaten oder Regiomaten kostenlos ein, korrigiere Angaben oder übernimm deinen Eintrag.', `<h1 data-melde-titel>Hofladen kostenlos eintragen</h1>
<div class="melde-hof" data-melde-hof hidden></div>
<p data-intro>Der Eintrag ist kostenlos. Wir prüfen jede Meldung und veröffentlichen sie in der Regel innerhalb weniger Tage. Willkommen sind alle, die direkt verkaufen: Hofläden und Bauernläden, <a href="/milchtankstelle/">Milchtankstellen</a>, <a href="/eierautomat/">Eierautomaten</a> und <a href="/regiomat/">Regiomaten</a>.</p>
<p data-intro>Betreibst du einen Hof, der schon eingetragen ist? Dann übernimm den Eintrag – du kannst Öffnungszeiten, Angebot, Fotos und saisonale Hinweise selbst aktuell halten. Danach gibt es auf Wunsch ein <a href="/fuer-hoefe/">Badge für deine Website</a>.</p>
${formular}
${kontaktMail ? `<p>Lieber per E-Mail? <a id="mail-link" href="mailto:${esc(kontaktMail)}?subject=${encodeURIComponent('Eintrag Hofladenliste')}">E-Mail schreiben</a></p>` : ''}
<h2>Direkt in OpenStreetMap eintragen</h2>
<p>Die meisten Einträge stammen aus <a href="https://www.openstreetmap.org/">OpenStreetMap</a>. Wenn du deinen Hof dort einträgst (Kategorie „Hofladen“, Merkmal <code>shop=farm</code>; für Automaten <code>amenity=vending_machine</code> mit <code>vending=milk</code>, <code>eggs</code> usw.), erscheint er nach der nächsten Aktualisierung (montags und donnerstags) auch hier.</p>`, false);
  textSeite('/mitmachen/danke/', 'Danke für deine Meldung', 'Deine Meldung ist bei uns angekommen. Wir prüfen sie und veröffentlichen die Angaben in der Regel innerhalb weniger Tage.', `<h1>Danke – deine Meldung ist angekommen</h1>
<p>Wir prüfen die Angaben und veröffentlichen sie in der Regel innerhalb weniger Tage. Bei Rückfragen melden wir uns, falls du eine E-Mail-Adresse angegeben hast.</p>
<p><a href="/">Zur Startseite</a> · <a href="/fuer-hoefe/">Badge für deine Website</a></p>`);
}
schreibe('/404.html', seite({
  titel: 'Seite nicht gefunden | Hofladenliste', beschreibung: 'Diese Seite gibt es nicht.', pfad: '/404.html', noindex: true, klasse: 'textseite',
  inhalt: '<article class="text"><h1>Diese Seite gibt es nicht</h1><p>Vielleicht wurde der Eintrag verschoben. Gib oben deine Postleitzahl ein oder starte auf der <a href="/">Startseite</a>.</p></article>',
}), false);

// ---------- Wochenmärkte: Übersicht, Bundesländer, Kreise (ab 3 Märkten) ----------
if (MAERKTE.length) {
  const mitZeiten = MAERKTE.filter((m) => m.oeffnungszeiten).length;
  const landInfo = laender.map((l) => {
    const ks = l.kreise.map((k) => ({ k, ms: maerkteProKreis.get(k.code) || [] })).filter((x) => x.ms.length);
    return { l, ks, n: ks.reduce((a, x) => a + x.ms.length, 0), pfad: `/wochenmaerkte/${l.slug}/` };
  }).filter((x) => x.n);
  const osmHinweis = '<p class="leise">Die Märkte stammen aus <a href="https://www.openstreetmap.org/">OpenStreetMap</a> (© OpenStreetMap-Mitwirkende, ODbL). Fehlt ein Markt oder stimmen die Zeiten nicht? Über „In OSM bearbeiten“ kannst du ihn direkt in OpenStreetMap ergänzen; wir übernehmen Änderungen zweimal pro Woche.</p>';
  schreibe('/wochenmaerkte/', seite({
    titel: `Wochenmärkte in Deutschland – ${zahl(MAERKTE.length)} Märkte mit Marktzeiten`,
    beschreibung: `${zahl(MAERKTE.length)} Wochenmärkte, Bauernmärkte und Markthallen in Deutschland, ${zahl(mitZeiten)} davon mit Marktzeiten – nach Bundesland und Kreis, mit Route und Hofläden in der Nähe.`,
    pfad: '/wochenmaerkte/', krumen: [['Wochenmärkte', '/wochenmaerkte/']],
    inhalt: `<section class="seitenkopf"><h1>Wochenmärkte in Deutschland</h1>
  <p>${zahl(MAERKTE.length)} Wochenmärkte, Bauernmärkte und Markthallen, ${zahl(mitZeiten)} davon mit Marktzeiten. Auf dem Markt verkaufen viele Höfe aus der Region – die Hofläden findest du auf den Seiten der Kreise.</p></section>
<section class="abschnitt"><h2>Wochenmärkte nach Bundesland</h2>
  <ul class="laender-liste">${landInfo.map((x) => `<li><a href="${x.pfad}"><span>${esc(x.l.name)}</span><span class="zahl">${zahl(x.n)}</span></a></li>`).join('')}</ul></section>
<section class="abschnitt">${osmHinweis}</section>`,
  }));
  for (const x of landInfo) {
    const gross = x.ks.filter((y) => y.ms.length >= MARKT_SEITE_AB), klein = x.ks.filter((y) => y.ms.length < MARKT_SEITE_AB);
    schreibe(x.pfad, seite({
      titel: passend(`Wochenmärkte in ${x.l.name} – ${zahl(x.n)} Märkte nach Kreis`, `Wochenmärkte in ${x.l.name}`),
      beschreibung: `${zahl(x.n)} Wochenmärkte und Bauernmärkte in ${x.l.name}: nach Kreis sortiert, mit Marktzeiten, Adresse und Route.`,
      pfad: x.pfad, noindex: x.n < MIN_SEITE, krumen: [['Wochenmärkte', '/wochenmaerkte/'], [x.l.name, x.pfad]],
      inhalt: `<section class="seitenkopf"><h1>Wochenmärkte in ${esc(x.l.name)}</h1><p>${zahl(x.n)} Märkte in ${zahl(x.ks.length)} Kreisen. <a href="/${x.l.slug}/">Hofläden in ${esc(x.l.name)}</a></p></section>
${gross.length ? `<section class="abschnitt"><h2>Kreise mit mehreren Wochenmärkten</h2><ul class="kreis-liste">${gross.map((y) => `<li><a href="${marktPfad(y.k)}"><span>${esc(y.k.titel)}</span><span class="zahl">${zahl(y.ms.length)}</span></a></li>`).join('')}</ul></section>` : ''}
${klein.map((y) => `<section class="abschnitt"><h2>Wochenmärkte ${esc(y.k.im)}</h2><div class="karten-reihe">${y.ms.map((m) => marktKarte(m)).join('')}</div><p><a href="${y.k.pfad}">Hofläden ${esc(y.k.im)}</a></p></section>`).join('\n')}
<section class="abschnitt">${osmHinweis}</section>`,
    }), x.n >= MIN_SEITE);
    for (const { k, ms } of gross) {
      const hoefe = (proKreis.get(k.code) || []).slice(0, 6);
      const n = ms.length, z = ms.filter((m) => m.oeffnungszeiten).length;
      const orte = [...new Set(ms.map((m) => m.ortAnzeige))];
      schreibe(marktPfad(k), seite({
        titel: passend(`Wochenmärkte ${k.im} – ${zahl(n)} Märkte mit Marktzeiten`, `Wochenmärkte ${k.im} – ${zahl(n)} Märkte`, `Wochenmärkte ${k.im}`),
        beschreibung: `${zahl(n)} Wochenmärkte ${k.im}${orte.length > 1 ? `, u. a. in ${orte.slice(0, 3).join(', ')}` : ` in ${orte[0]}`}${z ? `, ${zahl(z)} davon mit Marktzeiten` : ''}. Mit Adresse, Route und Hofläden in der Nähe.`,
        pfad: marktPfad(k), krumen: [['Wochenmärkte', '/wochenmaerkte/'], [x.l.name, x.pfad], [k.titel, marktPfad(k)]],
        inhalt: `<section class="seitenkopf"><h1>Wochenmärkte ${esc(k.im)}</h1><p>${zahl(n)} Märkte${z ? `, ${zahl(z)} davon mit Marktzeiten` : ''}. Der Status „Jetzt geöffnet“ richtet sich nach den hinterlegten Marktzeiten.</p></section>
<div class="liste">${ms.map((m) => marktKarte(m, 'h2')).join('\n')}</div>
${hoefe.length ? `<section class="abschnitt"><h2>Hofläden ${esc(k.im)}</h2><div class="karten-reihe">${hoefe.map((e) => karteHtml(kartenDaten(e))).join('')}</div><p><a href="${k.pfad}">Alle Hofläden ${esc(k.im)}</a></p></section>` : ''}
<section class="abschnitt">${osmHinweis}</section>`,
      }));
    }
  }
}

// ---------- Saisonseite: Weihnachtsbaum vom Hof ----------
{
  const proLand = laender.map((l) => ({ l, liste: WEIHNACHT.filter((e) => e.k?.land === l.code).sort((a, b) => a.ortAnzeige.localeCompare(b.ortAnzeige, 'de')) })).filter((x) => x.liste.length);
  schreibe('/weihnachtsbaum-vom-hof/', seite({
    titel: WEIHNACHT.length ? passend(`Weihnachtsbaum vom Hof – ${zahl(WEIHNACHT.length)} Höfe mit Weihnachtsbäumen`, `Weihnachtsbaum vom Hof kaufen – ${zahl(WEIHNACHT.length)} Höfe`) : 'Weihnachtsbaum vom Hof kaufen',
    beschreibung: `Weihnachtsbaum direkt vom Hof kaufen: ${WEIHNACHT.length ? `${zahl(WEIHNACHT.length)} Höfe und Hofläden mit Weihnachtsbäumen,` : 'Höfe und Hofläden mit Weihnachtsbäumen,'} nach Bundesland, mit Öffnungszeiten und Route. Verkauft ihr Bäume? Kostenlos eintragen.`,
    pfad: '/weihnachtsbaum-vom-hof/', noindex: WEIHNACHT.length < MIN_SEITE, krumen: [['Weihnachtsbaum vom Hof', '/weihnachtsbaum-vom-hof/']],
    inhalt: `<section class="seitenkopf"><h1>Weihnachtsbaum vom Hof</h1>
  <p>${WEIHNACHT.length ? `${zahl(WEIHNACHT.length)} ${WEIHNACHT.length === 1 ? 'Hof verkauft' : 'Höfe verkaufen'} laut Eintrag Weihnachtsbäume – oft frisch geschlagen und aus der Region.` : 'Hier sammeln wir Höfe, die Weihnachtsbäume verkaufen.'} Viele Höfe verkaufen nur in der Adventszeit; frag im Zweifel vorher nach.</p>
  ${naeheSuche({ produkt: 'weihnachtsbaeume' }, 'Weihnachtsbäume in meiner Nähe')}
</section>
<section class="abschnitt hinweis-box"><h2>Ihr verkauft Weihnachtsbäume?</h2><p>Tragt euren Hof kostenlos ein oder ergänzt euren bestehenden Eintrag um „Weihnachtsbäume“ – dann erscheint ihr hier und bei der Suche nach dem Angebot.</p><p><a class="knopf knopf-dunkel" href="/mitmachen/?angebot=weihnachtsbaeume">Hof mit Weihnachtsbäumen eintragen</a></p></section>
${proLand.map((x) => `<section class="abschnitt"><h2>Weihnachtsbäume vom Hof in ${esc(x.l.name)}</h2><div class="karten-reihe">${x.liste.map((e) => karteHtml(kartenDaten(e))).join('')}</div></section>`).join('\n')}`,
  }), WEIHNACHT.length >= MIN_SEITE);
}

// ---------- Robots, Sitemap ----------
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /suche\nDisallow: /api/\nDisallow: /merkliste/\nDisallow: /verwaltung/\n\nSitemap: ${cfg.domain}/sitemap.xml\n`);

// Seitenarchiv (data/seiten-stand.json): Inhalts-Hash und Änderungsdatum je Seite, auch für Seiten,
// die es nicht mehr gibt. Daraus entstehen echtes lastmod, 301-Weiterleitungen und 410 für entfernte Höfe.
for (const e of eintraege) stand.hoefe[e.slug] = e.osm || e.id;
const sortiert = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// Weiterleitungen für Seiten aus dem Archiv, die es nicht mehr gibt
const slugNachId = new Map(eintraege.map((e) => [e.osm || e.id, e.slug]));
// Einträge aus offenen Quellen, deren Hof früher unter einer anderen ID (anderer Quelle) veröffentlicht war
const ersetztDurch = new Map();
for (const e of eintraege) for (const alt of e.alteIds || []) if (!slugNachId.has(alt)) { slugNachId.set(alt, e.slug); ersetztDurch.set(alt, e.id); }
for (const [alt, neu] of offenErsetzt) if (!slugNachId.has(alt) && slugNachId.has(neu)) { slugNachId.set(alt, slugNachId.get(neu)); ersetztDurch.set(alt, neu); }
// Einmal festgestellte Ersetzungen bleiben im Archiv (sonst würde eine 301 zur 410, sobald die Quelle das Duplikat nicht mehr führt)
stand.ersetzt ??= {};
for (const [alt, neu] of Object.entries(stand.ersetzt)) {
  let ziel = neu, n = 0;
  while (stand.ersetzt[ziel] && !slugNachId.has(ziel) && n++ < 5) ziel = stand.ersetzt[ziel];
  if (!slugNachId.has(alt) && slugNachId.has(ziel)) { slugNachId.set(alt, slugNachId.get(ziel)); ersetztDurch.set(alt, ziel); }
}
for (const [alt, neu] of ersetztDurch) stand.ersetzt[alt] = neu;
writeFileSync(STAND_DATEI, JSON.stringify({ seiten: sortiert(stand.seiten), hoefe: sortiert(stand.hoefe), ersetzt: sortiert(stand.ersetzt) }));
const umleitungen = {}, entfernt = [];
for (const pfad of Object.keys(stand.seiten)) {
  if (ALLE_SEITEN.has(pfad)) continue;
  const hof = pfad.match(/^\/hof\/([^/]+)\/$/);
  if (hof) {
    const neu = slugNachId.get(stand.hoefe[hof[1]]);
    if (neu && neu !== hof[1]) umleitungen[pfad] = `/hof/${neu}/`; else entfernt.push(pfad);
    continue;
  }
  // nächste übergeordnete Seite, z. B. aufgelöste Ortsseite → Kreisseite
  let ziel = pfad;
  do ziel = ziel.replace(/[^/]+\/$/, ''); while (ziel !== '/' && !ALLE_SEITEN.has(ziel));
  umleitungen[pfad] = ziel;
}
const alteSlugs = {};
for (const [slug, roh] of Object.entries(stand.hoefe)) if (!ALLE_SEITEN.has(`/hof/${slug}/`)) alteSlugs[slug] = stabileIdAus(ersetztDurch.get(roh) || roh);
for (const [alt, neuId] of ersetztDurch) alteSlugs[stabileIdAus(alt)] = stabileIdAus(neuId); // alte stabile ID → neue
writeFileSync(join(GEN, 'routen.json'), JSON.stringify({ umleitungen, entfernt, alteSlugs }));
console.log(`Seitenarchiv: ${Object.keys(stand.seiten).length} Seiten, ${Object.keys(umleitungen).length} Weiterleitungen, ${entfernt.length} entfernte Höfe (410)`);

// Sitemaps nach Seitentyp mit Sitemap-Index
const sitemapTyp = (p) => p.startsWith('/hof/') ? 'hoefe'
  : KATEGORIE_PFADE.has(p) || p.startsWith('/angebot/') || p.startsWith('/wochenmaerkte/') ? 'kategorien'
  : /^\/[^/]+\/[^/]+\/[^/]+\/$/.test(p) ? 'orte'
  : /^\/[^/]+\/[^/]+\/$/.test(p) && laender.some((l) => p.startsWith(`/${l.slug}/`)) ? 'kreise'
  : 'seiten';
const gruppen = new Map();
for (const p of sitemap.filter((x) => x.endsWith('/'))) {
  const t = sitemapTyp(p);
  if (!gruppen.has(t)) gruppen.set(t, []);
  gruppen.get(t).push(p);
}
mkdirSync(join(OUT, 'sitemaps'), { recursive: true });
const indexEintraege = [];
for (const t of ['seiten', 'kategorien', 'kreise', 'orte', 'hoefe']) {
  const liste = (gruppen.get(t) || []).sort();
  for (let i = 0; i < liste.length; i += 40000) {
    const teil = liste.slice(i, i + 40000);
    const name = `${t}${liste.length > 40000 ? `-${i / 40000 + 1}` : ''}.xml`;
    const lastmod = teil.reduce((m, p) => (stand.seiten[p][1] > m ? stand.seiten[p][1] : m), '');
    writeFileSync(join(OUT, 'sitemaps', name), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${teil.map((p) => `<url><loc>${cfg.domain}${p}</loc><lastmod>${stand.seiten[p][1]}</lastmod></url>`).join('\n')}\n</urlset>\n`);
    indexEintraege.push([name, lastmod]);
  }
}
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexEintraege.map(([n, l]) => `<sitemap><loc>${cfg.domain}/sitemaps/${n}</loc><lastmod>${l}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`);

// ---------- Optional: Gesamtliste als JSON (LISTE_EXPORT=pfad node scripts/build.mjs) ----------
if (process.env.LISTE_EXPORT) {
  writeFileSync(process.env.LISTE_EXPORT, JSON.stringify(eintraege.map((e) => ({
    schluessel: e.osm || e.id, sid: e.sid, typ: e.typ, name: e.titelSeite, art: e.art, strasse: e.strasse || '', plz: e.plz || '', ort: e.ortAnzeige, adresse: e.adresse,
    kreis: e.k.titel, bundesland: e.k.landName, telefon: e.telefon || '', email: e.email || '', website: e.website || '',
    facebook: e.facebook || '', instagram: e.instagram || '', oeffnungszeiten: e.oeffnungszeiten ? ((zeilen(e.oeffnungszeiten) || []).map(([t, v]) => `${t} ${v}`).join(', ') || e.oeffnungszeiten) : (e.oeffnungszeiten_text || ''),
    oeffnungszeitenOsm: e.oeffnungszeiten || '', bio: e.bio ? 'ja' : '', angebot: e.kat.map((x) => KATEGORIEN[x]).join(', '),
    betreiber: e.betreiber || '', ergaenzt: e.ergaenzt ? e.ergaenzt.felder.join(', ') : '',
    quelle: e.osm ? `https://www.openstreetmap.org/${e.osm}` : (e.quelleUrl || 'manuell'), seite: cfg.domain + e.pfad,
    indexiert: e.duenn ? 'nein' : 'ja', lat: e.lat, lon: e.lon,
  }))));
  console.log(`Liste exportiert: ${process.env.LISTE_EXPORT}`);
}

// ---------- Daten für den Worker ----------
const plzIndex = {};
for (const [p, rows] of plz) {
  const zaehl = new Map();
  for (const r of rows) zaehl.set(r.kreis, (zaehl.get(r.kreis) || 0) + 1);
  const kreis = [...zaehl].sort((a, b) => b[1] - a[1])[0][0];
  const lat = rows.reduce((s, r) => s + r.lat, 0) / rows.length;
  const lon = rows.reduce((s, r) => s + r.lon, 0) / rows.length;
  const orte = [...new Set(rows.filter((r) => !r.org).map((r) => r.ort))];
  const name = orte.length === 1 ? orte[0] : kreise.get(kreis).titel;
  plzIndex[p] = [+lat.toFixed(4), +lon.toFixed(4), kreise.get(kreis).pfad, name];
}
writeFileSync(join(GEN, 'plz.json'), JSON.stringify(plzIndex));

// Ortsnamen für die Suche: Name → zentrale PLZ, Kreis und (falls vorhanden) eigene Ortsseite
{
  const kListe = [...kreise.values()];
  const kIdx = new Map(kListe.map((k, i) => [k.code, i]));
  const gruppen = new Map();
  for (const rows of plz.values()) for (const r of rows) {
    if (r.org) continue;
    const key = r.ort + '|' + r.kreis;
    if (!gruppen.has(key)) gruppen.set(key, { ort: r.ort, kreis: r.kreis, rows: [] });
    gruppen.get(key).rows.push(r);
  }
  // Orte, die nur in den Einträgen vorkommen (Ortsteile aus OSM-Adressen)
  for (const m of ORTE.values()) for (const o of m.values()) {
    const key = o.ort + '|' + o.k.code;
    if (gruppen.has(key)) continue;
    const e = o.liste[0];
    const p = e.plz && plz.has(e.plz) ? e.plz : e.plzNah;
    if (p && plz.has(p)) gruppen.set(key, { ort: o.ort, kreis: o.k.code, rows: [{ plz: p, lat: o.lat, lon: o.lon }] });
  }
  const orteIndex = [];
  for (const g of gruppen.values()) {
    if (!kIdx.has(g.kreis)) continue;
    const lat = g.rows.reduce((x, r) => x + r.lat, 0) / g.rows.length;
    const lon = g.rows.reduce((x, r) => x + r.lon, 0) / g.rows.length;
    const mitte = g.rows.slice().sort((a, b) => distanzKm(lat, lon, a.lat, a.lon) - distanzKm(lat, lon, b.lat, b.lon))[0];
    const seiteOrt = ORTE.get(g.kreis)?.get(g.ort);
    orteIndex.push([g.ort, mitte.plz, kIdx.get(g.kreis), seiteOrt?.eigen ? seiteOrt.pfad : '', new Set(g.rows.map((r) => r.plz)).size]);
  }
  orteIndex.sort((a, b) => a[0].localeCompare(b[0], 'de'));
  writeFileSync(join(GEN, 'orte.json'), JSON.stringify({ k: kListe.map((k) => [k.pfad, k.titel]), o: orteIndex }));
  console.log(`Ortsnamen für die Suche: ${orteIndex.length}`);
}
const KAT_CODES = Object.keys(KATEGORIEN);
writeFileSync(join(GEN, 'eintraege.json'), JSON.stringify(eintraege.map((e) => [
  +e.lat.toFixed(5), +e.lon.toFixed(5), e.slug, e.titel, e.art, e.ortAnzeige, e.oeffnungszeiten || '', e.typ === 'hofladen' ? 1 : 0,
  e.adresse, e.telefon || '', e.website || '', e.kat.map((x) => 'abcdefghijklmnopqrstuvwxyz'[KAT_CODES.indexOf(x)]).join(''), e.bio ? 1 : 0,
  e.oeffnungszeiten_text || '', e.sonntag ? 1 : 0,
  // ab hier: Daten für das Bearbeiten-Formular und den Outreach-Export
  e.sid, e.name || '', e.strasse || '', e.plz || '', e.ort || e.ortAnzeige || '', e.email || '', (e.zahlung || []).join(','),
  (e.beschreibung || '').slice(0, 600), e.fotos?.length || 0, e.vollst.prozent, e.vollst.fehlt.join(','), e.k?.land || '', mitKindern(e) ? 1 : 0, (e.verband || []).join(','), e.haltestelle ? 1 : 0])));
writeFileSync(join(GEN, 'vollstaendigkeit.json'), JSON.stringify(VOLLSTAENDIGKEIT.map(([k, label]) => [k, label])));
writeFileSync(join(GEN, 'kategorien.json'), JSON.stringify(KAT_CODES));
// „Was + Wo“-Suche: Produktwörter → Kategorie, dazu die Zielseite, wenn nur das Produkt gesucht wird
const KAT_WOERTER = { eier: 'eier?|eierautomat', milch: 'milch|rohmilch|frischmilch|milchtankstelle', kaese: 'k(ä|ae)se', fleisch: 'fleisch|wurst|rindfleisch|schweinefleisch|lammfleisch|lamm|rind',
  gefluegel: 'gefl(ü|ue)gel|h(ä|ae)hnchen|gans|g(ä|ae)nse|enten?|puten?', wild: 'wild|wildfleisch|reh|hirsch|wildschwein', fisch: 'fisch|forellen?|karpfen',
  gemuese: 'gem(ü|ue)se', obst: 'obst', kartoffeln: 'kartoffeln?', honig: 'honig|imker(ei)?', brot: 'brot|br(ö|oe)tchen|backwaren', nudeln: 'nudeln|pasta',
  marmelade: 'marmelade|konfit(ü|ue)re', getraenke: 's(ä|ae)fte?|apfelsaft|most|wein', blumen: 'blumen|tulpen|sonnenblumen|blumenfeld',
  weihnachtsbaeume: 'weihnachtsb(ä|ae|a)ume?|tannenb(ä|ae|a)ume?|christb(ä|ae|a)ume?|tannen?', tierfutter: 'tierfutter|heu|stroh' };
writeFileSync(join(GEN, 'suchwoerter.json'), JSON.stringify([
  ...SAISON_SEITEN.map((sp) => [sp.re.source, SORTEN[sp.name][3], sp.indexiert ? sp.pfad : null]),
  ...Object.entries(KAT_WOERTER).map(([k, w]) => [w, k, ANGEBOT_SEITEN.includes(k) ? `/angebot/${k}/` : null]),
]));

const leereKreise = [...kreise.values()].filter((k) => !proKreis.get(k.code)).length;
const mitKat = eintraege.filter((e) => e.kat.length).length;
console.log(`Build fertig: ${eintraege.length} Einträge (${ergaenztAnzahl} mit Website-Ergänzungen, ${rechercheAnzahl} mit Recherche-Funden, ${impressumAnzahl} mit Kontakt aus dem Impressum, ${pflegeAnzahl} gepflegt, ${offenNeuSumme} neu aus offenen Quellen ${JSON.stringify(offenNeu)}, ${offenErgaenztSumme} Ergänzungen ${JSON.stringify(offenErgaenzt)}, ${geschlossenAnzahl} als geschlossen entfernt, ${anzHof} Hofläden, ${eintraege.length - anzHof} Automaten, ${mitKat} mit Angebot), ${kreise.size} Kreise (${leereKreise} ohne Einträge), ${sitemap.length} Seiten in der Sitemap.`);
if (impFehlt) console.warn('WARNUNG: Impressum in site.config.json ist unvollständig.');
