// Vorbelegung des Formulars „Mitmachen“ aus den öffentlichen Daten eines Eintrags (/api/eintrag).
// Reine Funktion ohne DOM – im Browser und in den Tests verwendet.
import { parse } from './oh.js';

const TAGE = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
const uhr = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function felderAusEintrag(e) {
  const werte = {};
  for (const k of ['name', 'strasse', 'plz', 'ort', 'telefon', 'email', 'website', 'beschreibung']) if (e[k]) werte[k] = e[k];
  if (e.art) werte.betriebsart = e.art;
  const haken = { angebot: e.angebot || [], zahlung: e.zahlung || [], bio: e.bio ? ['ja'] : [] };
  // Öffnungszeiten: in die Zeitfelder, wenn sie in zwei Zeitfenster je Tag passen; sonst als Hinweis „bisher“
  let zeiten = null, bisher = '';
  const w = e.oeffnungszeiten ? parse(e.oeffnungszeiten) : null;
  if (w && w.every((iv) => iv.length === 1 && iv[0][0] === 0 && iv[0][1] >= 1440)) zeiten = { rund: true, felder: {} };
  else if (w && w.every((iv) => iv.length <= 2 && iv.every(([a, b]) => b <= 1440))) {
    const felder = {};
    w.forEach((iv, i) => iv.forEach(([a, b], n) => { felder[`${TAGE[i]}_von${n + 1}`] = uhr(a); felder[`${TAGE[i]}_bis${n + 1}`] = b === 1440 ? '23:59' : uhr(b); }));
    zeiten = { rund: false, felder };
  } else bisher = e.oeffnungszeitenText || e.oeffnungszeiten || '';
  if (!zeiten && e.oeffnungszeitenText) bisher = e.oeffnungszeitenText;
  return { werte, haken, zeiten, bisher, fehlt: (e.vollstaendigkeit?.fehlt || []).map((x) => x.feld) };
}
