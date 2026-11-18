#!/usr/bin/env node
// Übernimmt Funde aus einer Recherche-Datenbank (SQLite, Tabelle `anreicherung`) nach data/recherche.json.
// Im Build füllen sie nur leere Felder; OpenStreetMap und Angaben der Betriebe haben Vorrang.
//
// Regeln:
//  - nur Konfidenz „hoch“ und „mittel“ (niedrig = Name/Ort weicht ab → manuell prüfen)
//  - keine Branchenbücher und kommerziellen Verzeichnisse (Datenbankrecht), keine Wettbewerber
//  - Öffnungszeiten nur dann strukturiert, wenn sie eindeutig lesbar sind; sonst als Text
//
// Aufruf: node scripts/recherche-uebernehmen.mjs pfad/zur/hofladen.sqlite
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parse } from '../static/oh.js';

const DB = process.argv[2];
if (!DB) { console.error('Pfad zur SQLite-Datei fehlt'); process.exit(1); }
const ZIEL = new URL('../data/recherche.json', import.meta.url);
const GESPERRT = /(^|\.)(dasoertliche|gelbeseiten|11880|ortsdienst|oeffnungszeitenbuch|werkenntdenbesten|cylex|golocal|meinestadt|branchenbuch|yelp|tripadvisor|google|facebook|instagram|freeontour|bauernhofurlaub|rausgegangen|hofladenfinder|heimischehoflaeden|hofladen-bauernladen|creditreform|northdata)\./i;

// ---------- strenger Parser für kurze Zeitangaben wie „Mo–Fr 8–12 und 14–18, Sa 9–13“ ----------
const TAGE = { mo: 0, di: 1, mi: 2, do: 3, fr: 4, sa: 5, so: 6 };
const OSM = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const zeit = (t) => { const m = t.match(/^(\d{1,2})(?::(\d{2}))?$/); if (!m || +m[1] > 24 || +(m[2] || 0) > 59) return null; return `${m[1].padStart(2, '0')}:${m[2] || '00'}`; };
function tageAus(spec) {
  spec = spec.toLowerCase().replace(/\.|\s/g, '');
  if (/^(täglich|taeglich|mo-so|mo–so)$/.test(spec)) return [0, 1, 2, 3, 4, 5, 6];
  const tage = new Set();
  for (const teil of spec.split(/[/,]|und/)) {
    if (/^feiertage?$/.test(teil)) continue;
    const r = teil.match(/^([a-z]{2})[–-]([a-z]{2})$/);
    if (r) { const a = TAGE[r[1]], b = TAGE[r[2]]; if (a == null || b == null) return null; for (let i = a; ; i = (i + 1) % 7) { tage.add(i); if (i === b) break; } }
    else if (TAGE[teil] != null) tage.add(TAGE[teil]);
    else return null;
  }
  return [...tage];
}
export function zeitenZuOsm(text) {
  let t = text.trim();
  if (/^(selbstbedienung |hofshop |sb-laden )?(rund um die uhr|24 ?h|jederzeit)( \((selbstbedienung|automat)\))?$/i.test(t)
    || /^(jederzeit|rund um die uhr) \((selbstbedienung|automat)\)$/i.test(t)) return '24/7';
  if (/saison|vereinbarung|absprache|vorbestell|ferien|nicht angegeben|keine uhrzeit|okt|nov|dez|jan|feb|mär|apr|mai|jun|jul|aug|sep/i.test(t)) return null;
  t = t.replace(/\((selbstbedienung|hofladen ganzjährig)\)/gi, '').replace(/^(hofladen|selbstbedienung)\s+/i, '').trim();
  if (/[()]/.test(t)) return null;
  const woche = Array.from({ length: 7 }, () => null);
  for (const seg of t.split(/,\s*(?=[A-ZÄÖÜa-zäöü]{2})/)) {
    const m = seg.trim().match(/^((?:täglich|[A-Za-z]{2}\.?(?:\s*[–\-/]\s*[A-Za-z]{2}\.?)*(?:\s*\/\s*Feiertage?)?))\s+(.+)$/i);
    if (!m) return null;
    const tage = tageAus(m[1]);
    if (!tage?.length) return null;
    const rest = m[2].trim();
    let iv = [];
    if (/^geschlossen$/i.test(rest)) iv = [];
    else for (const z of rest.split(/\s*(?:und|,)\s*/)) {
      const r = z.replace(/\s*uhr$/i, '').match(/^(\d{1,2}(?::\d{2})?)\s*[–-]\s*(\d{1,2}(?::\d{2})?)$/);
      if (!r) return null;
      const [a, b] = [zeit(r[1]), zeit(r[2])];
      if (!a || !b || a >= b) return null;
      iv.push(`${a}-${b}`);
    }
    for (const d of tage) woche[d] = [...(woche[d] || []), ...iv];
  }
  // Gleiche Tage zu Bereichen zusammenfassen
  const teile = [];
  for (let i = 0; i < 7;) {
    const iv = woche[i];
    if (!iv?.length) { i++; continue; }
    const key = [...iv].sort().join(',');
    let j = i;
    while (j + 1 < 7 && woche[j + 1]?.length && [...woche[j + 1]].sort().join(',') === key) j++;
    teile.push(`${j > i ? `${OSM[i]}-${OSM[j]}` : OSM[i]} ${key}`);
    i = j + 1;
  }
  const oh = teile.join('; ');
  return oh && parse(oh) ? oh : null;
}

// ---------- Selbsttest ----------
if (process.argv[2] === '--test') {
  const faelle = [
    ['Mo–Sa 8–12, Mo–Fr 13–18', 'Mo-Fr 08:00-12:00,13:00-18:00; Sa 08:00-12:00'],
    ['Mo-Sa 09:00-18:30, So/Feiertage 09:00-14:00', 'Mo-Sa 09:00-18:30; Su 09:00-14:00'],
    ['Di 9–12 und 16–18:30, Fr 9–18:30, Sa 9–12', 'Tu 09:00-12:00,16:00-18:30; Fr 09:00-18:30; Sa 09:00-12:00'],
    ['täglich 7–20 (Selbstbedienung)', 'Mo-Su 07:00-20:00'],
    ['Hofladen Mo–Sa 8–19', 'Mo-Sa 08:00-19:00'],
    ['Mo–Sa 17:30–19, So geschlossen', 'Mo-Sa 17:30-19:00'],
    ['Selbstbedienung rund um die Uhr', '24/7'],
    ['Mo–Sa 7–18, So/Feiertage 7–14 (saisonal)', null],
    ['Mi–Sa (Uhrzeiten nicht angegeben)', null],
    ['nach Vereinbarung', null],
  ];
  let ok = 0;
  for (const [ein, soll] of faelle) { const ist = zeitenZuOsm(ein); if (ist === soll) ok++; else console.log('FEHLER', ein, '→', ist, 'erwartet', soll); }
  console.log(`${ok}/${faelle.length} OK`);
  process.exit(ok === faelle.length ? 0 : 1);
}

// ---------- Übernahme ----------
const db = new DatabaseSync(DB, { readOnly: true });
const funde = db.prepare(`SELECT a.id, a.feld, a.wert, a.quelle_url, a.quelle_typ, a.gefunden_am, a.konfidenz, e.name, e.ort
  FROM anreicherung a LEFT JOIN eintraege e ON e.id = a.id WHERE a.konfidenz IN ('hoch', 'mittel') ORDER BY a.id, a.feld`).all();
const osm = new Set(JSON.parse(readFileSync(new URL('../data/osm-eintraege.json', import.meta.url), 'utf8')).map((e) => e.osm));
const daten = existsSync(ZIEL) ? JSON.parse(readFileSync(ZIEL, 'utf8')) : {};
const stat = { uebernommen: 0, gesperrt: 0, unbekannt: 0, text: 0 };
for (const f of funde) {
  const host = (() => { try { return new URL(f.quelle_url).hostname; } catch { return ''; } })();
  if (!host || GESPERRT.test(host) || f.quelle_typ === 'branchenbuch') { stat.gesperrt++; continue; }
  const id = f.id.replace(/^(node|way|relation)_/, '$1/');
  if (!osm.has(id)) { stat.unbekannt++; continue; }
  let { feld, wert } = f;
  wert = String(wert).trim();
  if (feld === 'website' && !/^https?:\/\//.test(wert)) wert = `https://${wert}`;
  // mehrere Nummern: die erste nehmen; Trennzeichen in der Vorwahl („0251 / 324372“) zu Leerzeichen
  if (feld === 'telefon') wert = wert.split(/\s*;\s*|\s+oder\s+/)[0].replace(/\s*[/-]\s*/g, ' ').replace(/\s+/g, ' ');
  const eintrag = (daten[id] ??= { felder: {} });
  if (feld === 'oeffnungszeiten') {
    const oh = zeitenZuOsm(wert);
    if (oh) eintrag.felder.oeffnungszeiten = { wert: oh, text: wert, quelle: f.quelle_url, stand: f.gefunden_am };
    else { eintrag.felder.oeffnungszeiten_text = { wert, quelle: f.quelle_url, stand: f.gefunden_am }; stat.text++; }
  } else eintrag.felder[feld] = { wert, quelle: f.quelle_url, stand: f.gefunden_am };
  stat.uebernommen++;
}
writeFileSync(ZIEL, JSON.stringify(Object.fromEntries(Object.entries(daten).sort()), null, 1) + '\n');
console.log(`Funde: ${funde.length} (hoch/mittel) – übernommen ${stat.uebernommen} (davon ${stat.text} Öffnungszeiten als Text), aus gesperrten Quellen ${stat.gesperrt}, Eintrag unbekannt ${stat.unbekannt}. Einträge in data/recherche.json: ${Object.keys(daten).length}`);
