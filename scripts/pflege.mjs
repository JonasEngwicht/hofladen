// Eigene Pflege: von Jonas geprüfte Änderungen, die Agenten im Claude-Projekt „Hofladen“ unter pflege/ ablegen.
// Ein täglicher Lauf liest diese Dokumente, übernimmt sie mit scripts/pflege-uebernehmen.mjs nach data/pflege.json,
// und der Build wendet sie an. Keine Quellenpflicht (die Daten sind vorab geprüft), aber Format- und Plausibilitätsprüfung.
//
// Vorrang: OpenStreetMap und offene Quellen < Website-/Recherche-Ergänzungen < eigene Pflege < Angaben der Betriebe.
import { slugify } from './lib.mjs';
import { quellenId } from './quellen.mjs';
import { parse } from '../static/oh.js';

export const PFLEGE_FELDER = ['name', 'strasse', 'plz', 'ort', 'telefon', 'email', 'website', 'oeffnungszeiten', 'oeffnungszeiten_text',
  'beschreibung', 'saison', 'bio', 'lat', 'lon', 'facebook', 'instagram'];
export const TYPEN = { hofladen: 'Hofladen', automat: 'Regiomat' };
export const AUTOMAT_ARTEN = ['Milchtankstelle', 'Eierautomat', 'Regiomat', 'Fleischautomat', 'Kartoffelautomat', 'Honigautomat', 'Nudelautomat'];
// Schutz gegen Versehen: mehr Schließungen auf einmal nur mit --schliessungen-erlauben
export const MAX_SCHLIESSUNGEN = 25;
const MAX_LAENGE = { name: 120, beschreibung: 1000, oeffnungszeiten_text: 300, saison: 300 };

// Stabile ID je Eintrag (siehe Build): OSM n/w/r + Zahl, Betreiber b<Zahl>, offene Quellen o-/f-/k-/g-, manuell m-
export function stabileIdAus(roh) {
  const osm = String(roh).match(/^(node|way|relation)\/(\d+)$/);
  if (osm) return osm[1][0] + osm[2];
  const b = String(roh).match(/^betreiber\/(\d+)$/);
  if (b) return `b${b[1]}`;
  const o = String(roh).match(/^(overture|foursquare|kvm|kommunal)\/(.+)$/);
  if (o) return quellenId(o[1], o[2]);
  return `m-${slugify(String(roh))}`;
}

// Index aus dem Seitenarchiv (data/seiten-stand.json): Slug → stabile ID, bekannte IDs, Ersetzungen
export function pflegeIndex(stand) {
  const slugs = new Map(), ids = new Set(), ersetzt = new Map();
  for (const [slug, roh] of Object.entries(stand.hoefe || {})) { const sid = stabileIdAus(roh); slugs.set(slug, sid); ids.add(sid); }
  for (const [alt, neu] of Object.entries(stand.ersetzt || {})) ersetzt.set(stabileIdAus(alt), stabileIdAus(neu));
  return { slugs, ids, ersetzt };
}

// Hof-Angabe (stabile ID, Slug, Detail-URL, Bearbeiten-Link oder OSM-Kennung) → stabile ID
export function hofAufloesen(angabe, index) {
  let a = String(angabe || '').trim();
  if (!a) return null;
  const eintrag = a.match(/[?&]eintrag=([^&#\s]+)/);
  const osmUrl = a.match(/^(?:https?:\/\/(?:www\.)?openstreetmap\.org\/)?(node|way|relation)\/(\d+)\/?$/);
  if (osmUrl) a = `${osmUrl[1]}/${osmUrl[2]}`;
  else if (eintrag) a = decodeURIComponent(eintrag[1]);
  else a = a.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/hof\//, '').replace(/\/(bearbeiten|uebernehmen)\/?$/, '').replace(/[/?#].*$/, '');
  const osm = a.match(/^(node|way|relation)\/(\d+)$/);
  let sid = osm ? stabileIdAus(`${osm[1]}/${osm[2]}`) : index.ids.has(a) || index.ersetzt.has(a) ? a : index.slugs.get(a);
  for (let n = 0; sid && !index.ids.has(sid) && index.ersetzt.has(sid) && n < 5; n++) sid = index.ersetzt.get(sid);
  return sid && index.ids.has(sid) ? sid : null;
}

// Ein Feld prüfen und vereinheitlichen. Ergebnis: { wert } oder { fehler }; null leert ein Feld.
export function feldPruefen(f, v) {
  if (!PFLEGE_FELDER.includes(f)) return { fehler: `unbekanntes Feld „${f}“` };
  if (v === null || v === '') return { wert: null };
  if (f === 'bio') return typeof v === 'boolean' ? { wert: v } : { fehler: 'bio muss true oder false sein' };
  if (f === 'lat' || f === 'lon') {
    const n = Number(String(v).replace(',', '.'));
    const ok = f === 'lat' ? n >= 47 && n <= 55.2 : n >= 5.8 && n <= 15.1;
    return ok ? { wert: Math.round(n * 1e6) / 1e6 } : { fehler: `${f} liegt nicht in Deutschland` };
  }
  if (typeof v !== 'string' && typeof v !== 'number') return { fehler: `${f} muss Text sein` };
  let s = String(v).replace(/\s+/g, ' ').trim();
  if (s.length > (MAX_LAENGE[f] || 200)) return { fehler: `${f} ist zu lang` };
  if (f === 'plz' && !/^\d{5}$/.test(s)) return { fehler: 'PLZ muss fünfstellig sein' };
  if (f === 'email' && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)) return { fehler: 'E-Mail-Adresse ungültig' };
  if (['website', 'facebook', 'instagram'].includes(f)) {
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    try { new URL(s); } catch { return { fehler: `${f} ist keine gültige Adresse` }; }
  }
  if (f === 'telefon' && s.replace(/\D/g, '').length < 6) return { fehler: 'Telefonnummer zu kurz' };
  if (f === 'oeffnungszeiten' && !parse(s)) return { wert: s, alsText: true };
  return { wert: s };
}

function felderPruefen(felder, hinweise) {
  const gut = {}, fehler = [];
  if (!felder || typeof felder !== 'object' || Array.isArray(felder)) return { gut, fehler: ['„felder“ fehlt oder ist kein Objekt'] };
  for (const [f, v] of Object.entries(felder)) {
    const r = feldPruefen(f, v);
    if (r.fehler) { fehler.push(r.fehler); continue; }
    if (r.alsText) { gut.oeffnungszeiten_text = r.wert; gut.oeffnungszeiten = null; hinweise.push('Öffnungszeiten nicht im OSM-Format, als Text übernommen'); }
    else gut[f] = r.wert;
  }
  if (('lat' in gut) !== ('lon' in gut)) fehler.push('lat und lon nur zusammen');
  return { gut, fehler };
}

// JSON-Blöcke aus einem Projekt-Dokument lesen (```json … ``` oder das ganze Dokument als JSON)
export function bloeckeLesen(text) {
  const bloecke = [...String(text).matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (!bloecke.length) bloecke.push(text);
  const ops = [], fehler = [];
  for (const b of bloecke) {
    try { const j = JSON.parse(b); ops.push(...(Array.isArray(j) ? j : [j])); } catch (e) { fehler.push(`JSON nicht lesbar: ${e.message}`); }
  }
  return { ops, fehler };
}

export function leerePflege() { return { aenderungen: {}, neu: {}, geschlossen: {} }; }

// Dokumente übernehmen. dateien: [{ name, text }]. Gibt die neue Pflege-Datei und einen Bericht zurück.
export function pflegeEinlesen(dateien, bestand, index, { heute, schliessungenErlauben = false } = {}) {
  const pflege = structuredClone(bestand || leerePflege());
  for (const k of ['aenderungen', 'neu', 'geschlossen']) pflege[k] ??= {};
  const bericht = { angenommen: [], abgelehnt: [], zurueckgehalten: [], hinweise: [] };
  const schliessungen = [];
  for (const { name, text } of dateien) {
    const { ops, fehler } = bloeckeLesen(text);
    for (const f of fehler) bericht.abgelehnt.push({ datei: name, grund: f });
    ops.forEach((op, i) => {
      const wo = { datei: name, nr: i + 1, hof: op?.hof ?? op?.neu?.name ?? null };
      const ablehnen = (grund) => bericht.abgelehnt.push({ ...wo, grund });
      if (!op || typeof op !== 'object') return ablehnen('Eintrag ist kein Objekt');
      const extra = { ...(op.notiz ? { notiz: String(op.notiz).slice(0, 300) } : {}), ...(op.quelle ? { quelle: String(op.quelle).slice(0, 300) } : {}) };
      const hinweise = [];
      if (op.neu) {
        const n = op.neu;
        const { gut, fehler: ff } = felderPruefen(Object.fromEntries(Object.entries(n).filter(([k]) => !['typ', 'art'].includes(k))), hinweise);
        if (!gut.name || !gut.plz || !gut.ort) ff.push('neuer Eintrag braucht name, plz und ort');
        const typ = n.typ || (n.art && n.art !== 'Hofladen' ? 'automat' : 'hofladen');
        if (!TYPEN[typ]) ff.push('typ muss „hofladen“ oder „automat“ sein');
        const art = n.art || TYPEN[typ];
        if (typ === 'automat' && !AUTOMAT_ARTEN.includes(art)) ff.push(`art für Automaten: ${AUTOMAT_ARTEN.join(', ')}`);
        if (ff.length) return ablehnen(ff.join('; '));
        const id = `pflege-${slugify(`${gut.name}-${gut.ort}`)}`.slice(0, 90);
        const vorhanden = index.slugs.get(slugify(`${gut.name}-${gut.ort}`).slice(0, 80));
        if (vorhanden && !pflege.neu[id]) return ablehnen(`gibt es schon (${vorhanden}); bitte als Änderung mit „hof“ angeben`);
        pflege.neu[id] = { ...(pflege.neu[id] || {}), ...gut, typ, art, stand: heute, ...extra };
        bericht.angenommen.push({ ...wo, was: 'neu', id: stabileIdAus(id) });
      } else {
        const sid = hofAufloesen(op.hof, index);
        if (!sid) return ablehnen(`Hof „${op.hof ?? ''}“ nicht gefunden`);
        wo.id = sid;
        if (op.geschlossen === true) { schliessungen.push({ wo, sid, grund: op.grund ? String(op.grund).slice(0, 200) : null, extra }); return; }
        if (op.wieder_offen === true) {
          if (!pflege.geschlossen[sid]) return ablehnen('ist nicht als geschlossen markiert');
          delete pflege.geschlossen[sid];
          bericht.angenommen.push({ ...wo, was: 'wieder offen' });
          return;
        }
        const { gut, fehler: ff } = felderPruefen(op.felder, hinweise);
        if (ff.length && !Object.keys(gut).length) return ablehnen(ff.join('; '));
        if (ff.length) bericht.hinweise.push({ ...wo, hinweis: `teilweise übernommen, abgelehnt: ${ff.join('; ')}` });
        const alt = pflege.aenderungen[sid] || { felder: {} };
        pflege.aenderungen[sid] = { ...alt, ...extra, felder: { ...alt.felder, ...gut }, stand: heute };
        bericht.angenommen.push({ ...wo, was: 'geändert', felder: Object.keys(gut) });
      }
      for (const h of hinweise) bericht.hinweise.push({ ...wo, hinweis: h });
    });
  }
  if (schliessungen.length > MAX_SCHLIESSUNGEN && !schliessungenErlauben) {
    for (const s of schliessungen) bericht.zurueckgehalten.push({ ...s.wo, grund: `${schliessungen.length} Schließungen auf einmal (mehr als ${MAX_SCHLIESSUNGEN}); bitte bestätigen` });
  } else {
    for (const s of schliessungen) {
      pflege.geschlossen[s.sid] = { stand: heute, ...(s.grund ? { grund: s.grund } : {}), ...s.extra };
      bericht.angenommen.push({ ...s.wo, was: 'geschlossen' });
    }
  }
  return { pflege, bericht };
}

// Felder auf einen Eintrag anwenden (Build). Gibt die geänderten Felder zurück.
export function felderAnwenden(e, felder, stand) {
  const geaendert = [];
  for (const [f, v] of Object.entries(felder)) {
    if (f === 'saison') e.saisonHinweis = v;
    else if (f === 'bio') e.bio = v || null;
    else e[f] = v;
    geaendert.push(f === 'oeffnungszeiten_text' ? 'oeffnungszeiten' : f);
  }
  if (felder.oeffnungszeiten) e.oeffnungszeiten_text = null;
  if (felder.oeffnungszeiten_text && !('oeffnungszeiten' in felder)) e.oeffnungszeiten = null;
  if (felder.lat != null) e.lageUngefaehr = false;
  if (e.ergaenzt) {
    e.ergaenzt.felder = e.ergaenzt.felder.filter((f) => !geaendert.includes(f));
    for (const q of e.ergaenzt.quellen) q.felder = q.felder.filter((f) => !geaendert.includes(f));
    e.ergaenzt.quellen = e.ergaenzt.quellen.filter((q) => q.felder.length);
    if (!e.ergaenzt.felder.length) e.ergaenzt = null;
  }
  // Nur eine ergänzte Postleitzahl ist keine Prüfung des Eintrags: dann kein „geprüft“-Vermerk
  if (geaendert.some((f) => f !== 'plz')) {
    e.gepflegt = { art: 'pflege', stand };
    if (stand > (e.geprueft || '')) e.geprueft = stand;
  }
  return geaendert;
}

// Bericht als kurzes Markdown für die Rückmeldung an Jonas
export function berichtMarkdown(b) {
  const z = [];
  z.push(`Übernommen: ${b.angenommen.length}, abgelehnt: ${b.abgelehnt.length}, zurückgehalten: ${b.zurueckgehalten.length}.`);
  const zeile = (x, text) => `- ${x.datei}${x.nr ? ` #${x.nr}` : ''}${x.hof ? ` (${x.hof})` : ''}: ${text}`;
  if (b.abgelehnt.length) z.push('', 'Abgelehnt:', ...b.abgelehnt.map((x) => zeile(x, x.grund)));
  if (b.zurueckgehalten.length) z.push('', 'Zurückgehalten:', ...b.zurueckgehalten.map((x) => zeile(x, x.grund)));
  if (b.hinweise.length) z.push('', 'Hinweise:', ...b.hinweise.map((x) => zeile(x, x.hinweis)));
  return z.join('\n');
}
