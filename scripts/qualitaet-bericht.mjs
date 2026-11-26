#!/usr/bin/env node
// Kontrolllauf zur Datenqualität über alle Einträge, wie sie nach dem Build auf der Seite stehen.
// Sucht Dopplungen (Name, Website, Telefon, E-Mail, Koordinaten) sowie Fehler und Widersprüche in den Feldern.
// Sichere Dopplungen und eindeutige Feldfehler behebt bereits der Build (scripts/bereinigen.mjs); hier steht, was übrig bleibt.
// Ergebnis: docs/berichte/qualitaet.csv (eine Zeile je Fund) und eine Zusammenfassung auf der Konsole.
//
// Aufruf: LISTE_EXPORT=/tmp/liste.json node scripts/build.mjs && node scripts/qualitaet-bericht.mjs /tmp/liste.json [ziel.csv]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladePlz, distanzKm } from './lib.mjs';
import { strasseZerlegen } from './bereinigen.mjs';
import { namenAehnlich, namenWoerter, rasterIndex } from './quellen.mjs';
import { parse as ohParse, regeln as ohRegeln } from '../static/oh.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const liste = JSON.parse(readFileSync(process.argv[2] || '/tmp/liste.json', 'utf8'));
const ziel = process.argv[3] || join(ROOT, 'docs', 'berichte', 'qualitaet.csv');
const { plz } = ladePlz(join(ROOT, 'data', 'quellen', 'plz-de.csv'));
// PLZ, die der Build aus den Adressen ergänzt hat (neue Gemeinden), gelten als bekannt
const PLZ_ERGAENZT = new Set(Object.keys((() => { try { return JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'plz.json'), 'utf8')); } catch { return {}; } })()));

const funde = []; // [schwere, pruefung, eintrag, detail, eintrag2?]
const melde = (schwere, pruefung, e, detail, e2) => funde.push({ schwere, pruefung, e, detail, e2 });
const hostVon = (w) => { try { return new URL(/^https?:/i.test(w) ? w : `https://${w}`).host.replace(/^www\./, '').toLowerCase(); } catch { return null; } };
const basis = (h) => (h || '').split('.').slice(-2).join('.');
const ziffern = (t) => String(t || '').replace(/\D/g, '').replace(/^0049|^49/, '0');
const VERZEICHNIS = /(^|\.)(facebook|instagram|google|goo\.gl|wikipedia|youtube|linkedin|tiktok|ebay|kleinanzeigen|hofladen-bauernladen|mein-bauernhof|dasoertliche|gelbeseiten|11880|cylex|golocal|meinestadt|branchenbuch|yelp|tripadvisor|hofladenfinder|heimischehoflaeden|bauernhofurlaub|city-map|landservice|marktschwaermer|wochenmarkt24|regionalbewegung|regionales-bayern|wlw|kununu|booking|airbnb)\./i;
const WETTBEWERB = /hofladenfinder|heimischehoflaeden|hofladen-bauernladen/i;
const AUTOMAT_WORT = /milch-?tankstelle|milch-?automat|eier-?automat|regio-?mat|automat|milchhäusle|eierhäusle|verkaufsbox|kartoffel-?kiste/i;
const typAutomat = (e) => e.typ === 'automat';

// ---------- 1. Dopplungen ----------
const idx = rasterIndex(liste);
const gesehen = new Set();
const paar = (a, b) => { const k = [a.sid, b.sid].sort().join('|'); if (gesehen.has(k)) return false; gesehen.add(k); return true; };
for (const a of liste) {
  for (const b of idx.nahe(a.lat, a.lon)) {
    if (a.sid >= b.sid) continue;
    const d = distanzKm(a.lat, a.lon, b.lat, b.lon);
    const gleicheArt = a.art === b.art;
    const wa = a.website && hostVon(a.website), wb = b.website && hostVon(b.website);
    const ta = ziffern(a.telefon), tb = ziffern(b.telefon);
    const nameGleich = a.name.toLowerCase() === b.name.toLowerCase();
    if (d < 0.005 && gleicheArt && paar(a, b)) { melde('hoch', 'Dopplung: gleiche Koordinaten', a, `${Math.round(d * 1000)} m`, b); continue; }
    if (d <= 0.3 && gleicheArt && (nameGleich || namenAehnlich(a.name, b.name)) && paar(a, b)) { melde('mittel', 'Dopplung: ähnlicher Name, sehr nah', a, `${Math.round(d * 1000)} m`, b); continue; }
    if (d <= 3 && gleicheArt && wa && wa === wb && !VERZEICHNIS.test(wa) && paar(a, b)) { melde('mittel', 'Dopplung: gleiche Website in der Nähe', a, `${wa}, ${d.toFixed(1)} km`, b); continue; }
    if (d <= 3 && gleicheArt && ta.length >= 7 && ta === tb && paar(a, b)) { melde('mittel', 'Dopplung: gleiche Telefonnummer in der Nähe', a, `${a.telefon}, ${d.toFixed(1)} km`, b); continue; }
    if (d <= 2 && gleicheArt && nameGleich && paar(a, b)) melde('mittel', 'Dopplung: gleicher Name bis 2 km', a, `${d.toFixed(1)} km`, b);
  }
}
// Gleiche E-Mail bei weit entfernten Einträgen: falsche Zuordnung (oder Kette)
const proMail = new Map();
for (const e of liste) if (e.email) { const k = e.email.toLowerCase(); if (!proMail.has(k)) proMail.set(k, []); proMail.get(k).push(e); }
for (const [m, es] of proMail) {
  if (es.length < 2) continue;
  const weit = es.filter((x) => distanzKm(x.lat, x.lon, es[0].lat, es[0].lon) > 40);
  if (weit.length) melde('mittel', 'E-Mail bei weit entfernten Einträgen', es[0], `${m}: ${es.length} Einträge, bis ${Math.round(Math.max(...es.map((x) => distanzKm(x.lat, x.lon, es[0].lat, es[0].lon))))} km`, weit[0]);
}
const proTel = new Map();
for (const e of liste) { const t = ziffern(e.telefon); if (t.length >= 7) { if (!proTel.has(t)) proTel.set(t, []); proTel.get(t).push(e); } }
for (const [t, es] of proTel) {
  const weit = es.filter((x) => distanzKm(x.lat, x.lon, es[0].lat, es[0].lon) > 40);
  if (weit.length && !/^0(1[5-7]|800|180)/.test(t)) melde('mittel', 'Festnetznummer bei weit entfernten Einträgen', es[0], `${es[0].telefon}: ${es.length} Einträge`, weit[0]);
}

// ---------- 2. Feldfehler ----------
for (const e of liste) {
  const n = e.name || '';
  // Name
  if (/https?:|www\.|@|\d{4,}[\s/-]?\d{3,}/i.test(n)) melde('mittel', 'Name enthält URL, E-Mail oder Telefon', e, n);
  if (/&(amp|quot|#\d+);|<|>/.test(n)) melde('mittel', 'Name enthält HTML-Reste', e, n);
  if (/\b(geschlossen|aufgegeben|ehemalig|ehem\.|closed|permanently|insolvent|bis auf weiteres zu)\b/i.test(n)) melde('hoch', 'Name deutet auf Schließung', e, n);
  if (n.length > 90) melde('niedrig', 'Name sehr lang', e, `${n.length} Zeichen`);
  if (/\s{2,}|^[^\p{L}\p{N}'„"(]|[,;:\-]$/u.test(n)) melde('niedrig', 'Name mit Satzzeichen/Leerzeichen am Rand', e, n);
  // Typ/Art
  if (!typAutomat(e) && AUTOMAT_WORT.test(n) && !/hofladen|hofcafe|laden|markt|hof\b/i.test(n)) melde('mittel', 'Name klingt nach Automat, Typ Hofladen', e, `${n} (${e.art})`);
  if (typAutomat(e) && /^(hofladen|bauernladen|hofcafé|hofcafe)\b/i.test(n) && !AUTOMAT_WORT.test(n)) melde('mittel', 'Name klingt nach Hofladen, Typ Automat', e, `${n} (${e.art})`);
  // E-Mail
  if (e.email) {
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e.email)) melde('hoch', 'E-Mail ungültig', e, e.email);
    else {
      const md = e.email.split('@')[1].toLowerCase();
      if (WETTBEWERB.test(md) || VERZEICHNIS.test(md)) melde('hoch', 'E-Mail eines Verzeichnisses/Wettbewerbers', e, e.email);
      if (/[A-Z]/.test(e.email)) melde('niedrig', 'E-Mail mit Großbuchstaben', e, e.email);
      if (e.email !== e.email.normalize('NFKC') || /[^\x00-\x7F]/.test(e.email.split('@')[0])) melde('mittel', 'E-Mail mit Sonderzeichen', e, e.email);
      if (/^(noreply|no-reply|webmaster|postmaster|datenschutz|abuse)@/i.test(e.email)) melde('mittel', 'E-Mail ist keine Kontaktadresse', e, e.email);
    }
  }
  // Telefon
  if (e.telefon) {
    const z = ziffern(e.telefon);
    if (/[a-z]/i.test(e.telefon.replace(/^(tel|fon)\.?/i, ''))) melde('mittel', 'Telefon mit Buchstaben', e, e.telefon);
    else if (z.length < 6 || z.length > 14) melde('mittel', 'Telefon unplausible Länge', e, e.telefon);
    else if (!/^0/.test(z) && !/^\+/.test(e.telefon.trim())) melde('niedrig', 'Telefon ohne Vorwahl', e, e.telefon);
    else if (/^\+(?!49)/.test(e.telefon.replace(/\s/g, '')) || /^00(?!49)/.test(e.telefon.replace(/\s/g, ''))) melde('niedrig', 'Telefon mit ausländischer Vorwahl', e, e.telefon);
  }
  // Website und soziale Netzwerke
  if (e.website) {
    const h = hostVon(e.website);
    if (!h || !/\.[a-z]{2,}$/i.test(h)) melde('hoch', 'Website ungültig', e, e.website);
    else if (WETTBEWERB.test(h)) melde('hoch', 'Website ist ein Wettbewerber', e, e.website);
    else if (/(^|\.)(facebook|instagram)\./i.test(h)) melde('niedrig', 'Website ist Facebook/Instagram (gehört ins eigene Feld)', e, e.website);
    else if (VERZEICHNIS.test(h)) melde('mittel', 'Website ist ein Verzeichnis', e, e.website);
    if (e.email && h && !VERZEICHNIS.test(h)) {
      const md = e.email.split('@')[1]?.toLowerCase() || '';
      const kernW = basis(h).split('.')[0].replace(/[^a-z0-9]/g, ''), kernM = basis(md).split('.')[0].replace(/[^a-z0-9]/g, '');
      const frei = /^(gmail|googlemail|web|gmx|t-online|freenet|arcor|yahoo|outlook|hotmail|live|icloud|me|aol|mail|posteo|online|email|vodafone|ewe|htp-tel|1und1|kabelmail|mailbox)\./.test(md);
      if (!frei && basis(md) !== basis(h) && !kernW.includes(kernM) && !kernM.includes(kernW) && namenWoerter(kernM).length && !namenWoerter(n).some((w) => kernM.includes(w) && w.length >= 5)) melde('niedrig', 'E-Mail-Domain passt nicht zur Website', e, `${e.email} / ${h}`);
    }
  }
  if (e.facebook && !/facebook\.com|fb\.me|fb\.com/i.test(e.facebook)) melde('mittel', 'Facebook-Feld ohne Facebook-Link', e, e.facebook);
  if (e.instagram && !/instagram\.com|^@?[a-z0-9._]+$/i.test(e.instagram)) melde('mittel', 'Instagram-Feld ohne Instagram-Link', e, e.instagram);
  // Adresse
  if (e.plz && !/^\d{5}$/.test(e.plz)) melde('hoch', 'PLZ nicht fünfstellig', e, e.plz);
  else if (e.plz) {
    const rows = plz.get(e.plz);
    if (!rows) { if (!PLZ_ERGAENZT.has(e.plz)) melde('mittel', 'PLZ unbekannt', e, e.plz); }
    else {
      const dmin = Math.min(...rows.map((r) => distanzKm(r.lat, r.lon, e.lat, e.lon)));
      if (dmin > 30) melde(dmin > 80 ? 'hoch' : 'mittel', 'Koordinaten weit weg von der PLZ', e, `PLZ ${e.plz} ${e.ort}: ${Math.round(dmin)} km`);
      const orte = rows.map((r) => r.ort.toLowerCase());
      const o = (e.ort || '').toLowerCase();
      const ortPasst = !o || orte.some((x) => x === o || x.startsWith(o) || o.startsWith(x.split(/[\s,(]/)[0]) || x.includes(o));
      if (!ortPasst && dmin > 10) melde('niedrig', 'Ort passt nicht zur PLZ', e, `${e.plz} ${e.ort} (PLZ gehört zu ${[...new Set(rows.map((r) => r.ort))].slice(0, 3).join(', ')})`);
    }
  }
  if (e.strasse) {
    if (/\b\d{5}\b/.test(e.strasse)) melde('mittel', 'Straße enthält eine PLZ', e, e.strasse);
    if (e.strasse.toLowerCase() === n.toLowerCase()) melde('mittel', 'Straße gleich Name', e, e.strasse);
    if (/https?:|@/.test(e.strasse)) melde('hoch', 'Straße enthält URL/E-Mail', e, e.strasse);
    if (e.strasse.includes(',') && !strasseZerlegen(e.strasse).sicher) melde('mittel', 'Straße unklar (mehrere Teile)', e, e.strasse);
  }
  if (!(e.lat > 47.2 && e.lat < 55.1 && e.lon > 5.8 && e.lon < 15.1)) melde('hoch', 'Koordinaten außerhalb Deutschlands', e, `${e.lat}, ${e.lon}`);
  // Öffnungszeiten
  const oh = e.oeffnungszeitenOsm;
  if (oh) {
    // Lesbar heißt: die Seite kann einen Live-Status zeigen (Wochenplan oder Saison-/Datumsregeln wie in static/oh.js)
    const nurHinweis = /^\s*"[^"]*"\s*$/.test(oh) || /^\s*(nach|auf)\s+(telefonischer\s+)?(vereinbarung|absprache|anfrage|nachfrage)\s*$/i.test(oh);
    if (nurHinweis) melde('niedrig', 'Öffnungszeiten nur als Hinweis (kein Live-Status)', e, oh);
    else if (!ohParse(oh) && !ohRegeln(oh)) melde('mittel', 'Öffnungszeiten nicht lesbar', e, oh);
    for (const m of oh.matchAll(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/g)) {
      const von = +m[1] * 60 + +m[2], bis = +m[3] * 60 + +m[4];
      if (von === bis) { melde('mittel', 'Öffnungszeit mit gleicher Start- und Endzeit', e, oh); break; }
      if (bis < von && bis !== 0) { melde('niedrig', 'Öffnungszeit über Mitternacht', e, oh); break; }
    }
    if (!typAutomat(e) && /^24\/7$/.test(oh.trim()) && !/selbst|sb|box|automat|kiste|häus|hütte|stand/i.test(n)) melde('niedrig', 'Hofladen rund um die Uhr geöffnet', e, n);
    if (/\b(0[0-4]):\d{2}-/.test(oh) && !typAutomat(e) && oh.trim() !== '24/7') melde('niedrig', 'Hofladen öffnet vor 5 Uhr', e, oh);
  }
  if (!e.telefon && !e.email && !e.website && !e.facebook && !e.instagram && !e.strasse && !e.oeffnungszeiten) melde('niedrig', 'Keine Kontaktdaten, keine Adresse, keine Zeiten', e, '');
}

// ---------- Ausgabe ----------
const ORDNUNG = { hoch: 0, mittel: 1, niedrig: 2 };
funde.sort((a, b) => ORDNUNG[a.schwere] - ORDNUNG[b.schwere] || a.pruefung.localeCompare(b.pruefung) || a.e.sid.localeCompare(b.e.sid));
mkdirSync(dirname(ziel), { recursive: true });
const f = (v) => /[;"\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
writeFileSync(ziel, '﻿' + [['Schwere', 'Prüfung', 'ID', 'Name', 'Art', 'Ort', 'Detail', 'ID 2', 'Name 2', 'Seite', 'Seite 2', 'Quelle'],
  ...funde.map((x) => [x.schwere, x.pruefung, x.e.sid, x.e.name, x.e.art, x.e.ort, x.detail, x.e2?.sid, x.e2?.name, x.e.seite, x.e2?.seite, x.e.quelle])]
  .map((z) => z.map(f).join(';')).join('\r\n') + '\r\n');
const zaehl = new Map();
for (const x of funde) { const k = `${x.schwere}\t${x.pruefung}`; zaehl.set(k, (zaehl.get(k) || 0) + 1); }
console.log(`${liste.length} Einträge geprüft, ${funde.length} Funde → ${ziel}`);
for (const [k, n] of [...zaehl].sort((a, b) => ORDNUNG[a[0].split('\t')[0]] - ORDNUNG[b[0].split('\t')[0]] || b[1] - a[1])) console.log(String(n).padStart(6), k);
