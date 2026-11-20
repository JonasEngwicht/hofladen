// Pflegbare Texte für lokale Seiten: Einleitung, eigene Fragen, Saison-Hinweise und Quellen.
// Eine JSON-Datei je Seite in data/ortstexte/ (Format und Beispiel: data/ortstexte/README.md).
// Der Build zeigt die Texte auf der Seite mit dem passenden "pfad" an; Code muss dafür nicht geändert werden.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { esc } from '../static/helfer.js';

const FELDER = new Set(['pfad', 'einleitung', 'fragen', 'saison', 'quellen', 'stand']);
// Texte mit Platzhaltern sollen nie live gehen (sonst entstehen austauschbare Ortsseiten)
const PLATZHALTER = /\bTODO\b|\bTBD\b|lorem ipsum|\bxxx\b|\{\{?\s*\w+\s*\}?\}|\[ort\]|\[stadt\]|\[kreis\]|<ort>|<stadt>/i;

const text = (x) => typeof x === 'string' && x.trim().length > 0;

// Liefert Fehlermeldungen für einen Ortstext (leer = in Ordnung)
export function pruefeOrtstext(o) {
  const f = [];
  if (!o || typeof o !== 'object' || Array.isArray(o)) return ['kein JSON-Objekt'];
  for (const k of Object.keys(o)) if (!FELDER.has(k)) f.push(`unbekanntes Feld "${k}"`);
  if (!text(o.pfad) || !/^\/[a-z0-9-]+(\/[a-z0-9-]+)*\/$/.test(o.pfad)) f.push('pfad muss wie "/bayern/oberallgaeu/" aussehen (mit Schrägstrich am Ende)');
  if (o.einleitung == null && o.fragen == null && o.saison == null) f.push('mindestens einleitung, fragen oder saison angeben');
  if (o.einleitung != null) {
    if (!Array.isArray(o.einleitung) || !o.einleitung.length || o.einleitung.length > 4) f.push('einleitung: Liste mit 1 bis 4 Absätzen');
    else o.einleitung.forEach((a, i) => {
      if (!text(a)) f.push(`einleitung ${i + 1}: leer`);
      else if (a.length < 60 || a.length > 900) f.push(`einleitung ${i + 1}: 60 bis 900 Zeichen (jetzt ${a.length})`);
    });
  }
  if (o.fragen != null) {
    if (!Array.isArray(o.fragen) || !o.fragen.length) f.push('fragen: Liste mit mindestens einer Frage');
    else o.fragen.forEach((q, i) => {
      if (!q || !text(q.frage) || !text(q.antwort)) f.push(`frage ${i + 1}: "frage" und "antwort" angeben`);
      else if (!q.frage.trim().endsWith('?')) f.push(`frage ${i + 1}: soll mit "?" enden`);
      if (q && Object.keys(q).some((k) => k !== 'frage' && k !== 'antwort')) f.push(`frage ${i + 1}: nur "frage" und "antwort"`);
    });
  }
  if (o.saison != null) {
    if (!Array.isArray(o.saison) || !o.saison.length) f.push('saison: Liste mit mindestens einem Eintrag');
    else o.saison.forEach((s, i) => { if (!s || !text(s.titel) || !text(s.zeit)) f.push(`saison ${i + 1}: "titel" und "zeit" angeben`); });
  }
  if (o.quellen != null) {
    if (!Array.isArray(o.quellen)) f.push('quellen: Liste');
    else o.quellen.forEach((q, i) => { if (!q || !text(q.titel) || !/^https?:\/\/\S+$/.test(q.url || '')) f.push(`quelle ${i + 1}: "titel" und "url" (http…) angeben`); });
  }
  const alles = [...(o.einleitung || []), ...(o.fragen || []).flatMap((q) => [q?.frage, q?.antwort]), ...(o.saison || []).flatMap((s) => [s?.titel, s?.zeit])].filter(text);
  if (alles.some((x) => PLATZHALTER.test(x))) f.push('enthält einen Platzhalter (TODO, [ort], {{…}} …) – bitte echten Text schreiben');
  for (const x of alles) for (const [, ziel] of x.matchAll(/\[[^\]]+\]\(([^)]*)\)/g)) if (!/^\/[a-z0-9\-/#]*$/.test(ziel)) f.push(`Link "${ziel}": nur interne Links wie /bayern/ erlaubt`);
  return f;
}

// Lädt alle Ortstexte; Dateien mit "_" am Anfang (Vorlagen) werden übersprungen.
// Fehlerhafte Dateien landen in "fehler" und werden nicht angezeigt, damit der tägliche Build nicht stehen bleibt.
export function ladeOrtstexte(dir) {
  const texte = new Map(), fehler = [];
  if (!existsSync(dir)) return { texte, fehler };
  for (const datei of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort()) {
    let o;
    try { o = JSON.parse(readFileSync(join(dir, datei), 'utf8')); } catch (e) { fehler.push(`${datei}: kein gültiges JSON (${e.message})`); continue; }
    const f = pruefeOrtstext(o);
    if (!f.length && texte.has(o.pfad)) f.push(`pfad ${o.pfad} steht schon in ${texte.get(o.pfad).datei}`);
    if (f.length) { fehler.push(...f.map((x) => `${datei}: ${x}`)); continue; }
    texte.set(o.pfad, { ...o, datei });
  }
  return { texte, fehler };
}

// Text mit internen Links [Text](/pfad/) als HTML (alles andere wird maskiert)
export function textHtml(s) {
  let out = '', i = 0;
  for (const m of s.matchAll(/\[([^\]]+)\]\((\/[a-z0-9\-/#]*)\)/g)) {
    out += esc(s.slice(i, m.index)) + `<a href="${esc(m[2])}">${esc(m[1])}</a>`;
    i = m.index + m[0].length;
  }
  return out + esc(s.slice(i));
}

// Oben auf der Seite nur der erste Absatz, damit die Höfe (Adresse, Zeiten, Anrufen, Route) auf dem Handy früh sichtbar bleiben;
// weitere Absätze stehen im Überblick unter der Liste
export const einleitungHtml = (t) => t?.einleitung?.length ? `<div class="ortstext"><p>${textHtml(t.einleitung[0])}</p></div>` : '';
export const einleitungRestHtml = (t) => (t?.einleitung || []).slice(1).map((a) => `<p>${textHtml(a)}</p>`).join('');
// Eigene Fragen im Format von fragen() in build.mjs: [Frage (Klartext), Antwort (HTML)]
export const eigeneFragen = (t) => (t?.fragen || []).map((q) => [q.frage.trim(), textHtml(q.antwort.trim())]);
