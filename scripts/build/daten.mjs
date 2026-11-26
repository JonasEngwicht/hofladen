// Build, Teil „daten“: Daten laden, zusammenführen, bereinigen und ableiten (Einträge, Kreise, Orte, Kategorien).
// Wird von scripts/build.mjs in fester Reihenfolge geladen; nutzt die Ergebnisse der vorherigen Teile.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ladePlz, naechsterOrt, slugify, distanzKm, BUNDESLAENDER, istOrganisation, GATTUNG_ALS_ORT, ortKorrigiert } from '../lib.mjs';
import { rasterIndex, gleicherHof, QUELLEN, solawiOk } from '../quellen.mjs';
import { esc } from '../../static/helfer.js';
import { stabileIdAus, felderAnwenden } from '../pflege.mjs';
import { felderBereinigen, dublettenFinden, automatArtAusName, nameGeschlossen } from '../bereinigen.mjs';
import { zeilen, uebersetze, parse } from '../../static/oh.js';
import { KATEGORIEN } from '../../static/karte.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
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
// Eigene Einträge entstehen nur noch über data/pflege.json („neu“); Feld ersetztOsm: "node/123" ersetzt einen OSM-Eintrag
const manuell = [];
// Eigene Pflege (data/pflege.json, siehe scripts/pflege.mjs): geprüfte Änderungen, neue Einträge, Schließungen
const pflege = existsSync(join(ROOT, 'data', 'pflege.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'pflege.json'), 'utf8')) : { aenderungen: {}, neu: {}, geschlossen: {} };
for (const [id, n] of Object.entries(pflege.neu || {})) {
  const { saison, bio, stand, notiz, quelle, ...rest } = n;
  manuell.push({ ...rest, id, ...(saison ? { saisonHinweis: saison } : {}), ...(bio ? { bio: true } : {}), quelle: quelle || null, ...(stand ? { gepflegt: { art: 'pflege', stand }, geprueft: stand } : {}) });
}

// Ortsnamen, die sich als Firma/Behörde herausstellen (Filter in lib.mjs), durch den nächsten echten Ort ersetzen
for (const e of osm) {
  if (!e.ort && e.ortNah) e.ortNah = ortKorrigiert(e.plzNah, e.ortNah);
  if (e.ort || !(istOrganisation(e.ortNah) || GATTUNG_ALS_ORT.test(e.ortNah))) continue;
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
  return `Quelle: offene Verwaltungsdaten, ${a(e.quelleUrl || 'https://www.govdata.de/', e.datensatz || 'GovData')}${e.urheber ? `, ${esc(e.urheber)}` : ''} (${lizenzLink(e.lizenz || 'CC0-1.0')}).${web}`;
}
// Lizenzname mit Link zum Lizenztext (Pflicht bei Datenlizenz Deutschland – Namensnennung)
function lizenzLink(l) {
  const t = LIZENZ_TEXT[l] || l;
  return LIZENZ_URL[l] ? `<a href="${LIZENZ_URL[l]}" rel="nofollow noopener" target="_blank">${esc(t)}</a>` : esc(t);
}
// Liste der eingebundenen Verwaltungsdatensätze für /quellen/ und Impressum
function verwaltungsDatensaetze() {
  const liste = [...offenDatensaetze].map((x) => x.split('|')).sort((a, b) => a[0].localeCompare(b[0], 'de'));
  const proName = new Map();
  for (const [n, l] of liste) { if (!proName.has(n)) proName.set(n, new Set()); if (l) proName.get(n).add(l); }
  return [...proName].map(([n, ls]) => `${esc(n)}${ls.size ? ` (${[...ls].map(lizenzLink).join(' bzw. ')})` : ''}`).join(', ');
}
// Offene Quellen (data/offene-quellen.json, siehe scripts/import-quellen.mjs): Overture Maps, Foursquare, Karte von morgen
// und offene Verwaltungsdaten. Neue Einträge für Höfe, die in OpenStreetMap fehlen; Doppelungen werden hier noch einmal
// gegen den aktuellen Stand geprüft, damit ein neu in OSM eingetragener Hof den Eintrag aus der offenen Quelle ersetzt.
const offen = existsSync(join(ROOT, 'data', 'offene-quellen.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data', 'offene-quellen.json'), 'utf8')) : { neu: [], ergaenzungen: {}, quellen: {} };
const offenNeu = {}, offenErgaenzt = {}, offenErsetzt = new Map();
// Datensätze offener Verwaltungsdaten, die auf der Seite vorkommen („Herausgeber|Lizenz“), für /quellen/ und Impressum
const offenDatensaetze = new Set();
const LIZENZ_TEXT = { 'CC0-1.0': 'CC0 1.0', 'CC-BY-4.0': 'CC BY 4.0', 'DL-DE-BY-2.0': 'Datenlizenz Deutschland – Namensnennung – Version 2.0', 'DL-DE-ZERO-2.0': 'Datenlizenz Deutschland – Zero – Version 2.0' };
const LIZENZ_URL = { 'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/', 'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/', 'DL-DE-BY-2.0': 'https://www.govdata.de/dl-de/by-2-0', 'DL-DE-ZERO-2.0': 'https://www.govdata.de/dl-de/zero-2-0' };
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
    if (quelle === 'kommunal') offenDatensaetze.add(`${o.datensatz || 'GovData'}|${o.lizenz || ''}`);
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
    // Verwaltungsdaten: je Datensatz mit Herausgeber, Link und Lizenz (Namensnennung nach CC BY / Datenlizenz Deutschland)
    const h = q === 'kommunal' ? z.herkunft?.[f] : null;
    const schluessel = h ? `${q}|${h.datensatz}|${h.lizenz}` : q;
    if (!proQuelle.has(schluessel)) proQuelle.set(schluessel, { q, h, felder: [] });
    proQuelle.get(schluessel).felder.push(f === 'oeffnungszeiten_text' ? 'oeffnungszeiten' : f);
  }
  if (!proQuelle.size) continue;
  e.ergaenzt ??= { felder: [], quellen: [] };
  const gezaehlt = new Set();
  for (const { q, h, felder } of proQuelle.values()) {
    e.ergaenzt.felder.push(...felder);
    e.ergaenzt.quellen.push({ felder, quelle: h?.quelleUrl || QUELLEN[q].url, name: h?.datensatz || null, lizenz: h?.lizenz || null, stand: offen.stand });
    if (h?.datensatz) offenDatensaetze.add(`${h.datensatz}|${h.lizenz || ''}`);
    // ältere Ergänzungen ohne Herkunft stammen aus Rothenburg oder der BayernCloud
    else if (q === 'kommunal') for (const x of ['Stadt Rothenburg ob der Tauber|CC0-1.0', 'BayernCloud Tourismus|CC0-1.0', 'BayernCloud Tourismus|CC-BY-4.0']) offenDatensaetze.add(x);
    if (!gezaehlt.has(q)) { offenErgaenzt[q] = (offenErgaenzt[q] || 0) + 1; gezaehlt.add(q); }
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
const bereinigt = { felder: 0, typ: 0, lage: 0, dubletten: 0, geschlossen: 0, plz: 0 };
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
// Name sagt „geschlossen“/„ehemalig“ (nicht vom Betrieb, nicht aus eigener Pflege): Eintrag fällt weg, Adresse liefert 410
for (let i = eintraege.length - 1; i >= 0; i--) {
  const e = eintraege[i];
  if (!e.vomBetrieb && !e.gepflegt && nameGeschlossen(e.name)) { eintraege.splice(i, 1); bereinigt.geschlossen++; }
}
// PLZ, die die GeoNames-Tabelle noch nicht kennt (neue Gemeinden, z. B. 64760 Oberzent), aus den Adressen der Einträge
// ergänzen – nur wenn die nächste bekannte PLZ dieselben zwei Anfangsziffern hat und höchstens 15 km entfernt ist
{
  const neu = new Map();
  for (const e of eintraege) {
    if (!/^\d{5}$/.test(e.plz || '') || plz.has(e.plz) || !e.kreis) continue;
    const t = naechsterOrt(raster, e.lat, e.lon);
    if (!t || t.ort.plz.slice(0, 2) !== e.plz.slice(0, 2) || distanzKm(e.lat, e.lon, t.ort.lat, t.ort.lon) > 15) continue;
    if (!neu.has(e.plz)) neu.set(e.plz, []);
    neu.get(e.plz).push(e);
  }
  for (const [p, liste] of [...neu].sort()) {
    const e = liste[0];
    plz.set(p, [{ plz: p, ort: e.ort || e.ortNah, land: kreise.get(e.kreis)?.land, kreis: e.kreis, lat: +(liste.reduce((s, x) => s + x.lat, 0) / liste.length).toFixed(4),
      lon: +(liste.reduce((s, x) => s + x.lon, 0) / liste.length).toFixed(4), org: false, ausEintraegen: true }]);
    bereinigt.plz++;
  }
}
console.log(`Bereinigung: ${JSON.stringify(bereinigt)}`);

// Namen aufräumen: Emojis raus, GROSSSCHRIFT in normale Schreibweise (Rechtsformen richtig geschrieben)
const RECHTSFORM = { GMBH: 'GmbH', GBR: 'GbR', KG: 'KG', OHG: 'OHG', EG: 'eG', 'E.V.': 'e.V.', AG: 'AG', UG: 'UG', 'CO.': 'Co.', 'MBH': 'mbH' };
function schoenerName(n) {
  if (!n) return n;
  let x = String(n).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s*[—–=-]+>\s*/g, ' – ').replace(/(^|\s)\.{2,}(?=\S)/g, '$1') // Pfeile und Auslassungspunkte: „Kartoffeln ——> ...direkt vom Bauern“
    .replace(/\s+/g, ' ').trim();
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
const wocheVon = (e) => (e.oeffnungszeiten ? parse(e.oeffnungszeiten) : null);
const istRund = (w) => w && w.every((iv) => iv.some(([a, b]) => a === 0 && b >= 1440));
const datumDe = (d) => d.split('-').reverse().join('.');
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
  // Dünne Einträge: Seite bleibt erreichbar (Hof steht weiter in Listen und auf der Karte), aber noindex und nicht in der Sitemap.
  // Dünn ist ein Hofladen (kein Automat) ohne Name, Zeiten, Kontakt und Angebot – oder ohne Kontakt (Telefon, Website, E-Mail), Straße und Zeiten.
  // Sobald eine dieser Angaben ergänzt ist (z. B. über pflege/), wird die Seite wieder indexiert. Liste: docs/duenne-hofseiten.csv
  // Automaten haben meist keine Kontaktdaten, Straße oder Zeiten (oft rund um die Uhr): sie zählen nie als dünn
  // und stehen nicht in der Liste (e.kontaktlos).
  e.kontaktlos = e.typ === 'automat';
  const ohneKontakt = !e.telefon && !e.website && !e.email;
  const ohneZeiten = !e.oeffnungszeiten && !e.oeffnungszeiten_text;
  e.duenn = !e.kontaktlos && ((!e.name && ohneZeiten && ohneKontakt && !e.kat.length) || (ohneKontakt && !e.strasse && ohneZeiten));
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

export { ART_KAT, AUSSTATTUNG, AUTOMAT_ARTEN, BUILD_DATUM, GEN, HALTESTELLEN, HALTE_ART, HALTE_ROH, HEUTE, ICON_VERSION, KACHELN, KAT_REGELN, LIZENZ_TEXT, LIZENZ_URL, OUT, OVERTURE_DATENSATZ, RECHTSFORM, ROOT, SAISON, VERSION, VOLLSTAENDIGKEIT, ausstattung, bereinigt, betreiber, cfg, datumDe, dubletten, eintraege, ergaenztAnzahl, ergaenzungen, ersetzt, geschlossenAnzahl, impressum, impressumAnzahl, inDerNaehe, istRund, kreisMitte, kreise, laender, lizenzLink, manuell, mitKindern, offen, offenDatensaetze, offenErgaenzt, offenErgaenztSumme, offenErsetzt, offenNeu, offenNeuSumme, osm, pflege, pflegeAnzahl, plz, proKreis, quellenHinweis, raster, raster2, recherche, rechercheAnzahl, rueck, schoenerName, slugZaehler, telefonSauber, verwaltungsDatensaetze, wocheVon, zeitenKurz };
