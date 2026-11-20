// Bereinigung im Build (nach allen Quellen, Pflege und Betriebsangaben, vor Slugs und Titeln):
//  1. felderBereinigen(e): eindeutige Feldfehler korrigieren oder leeren (kaputte URLs, Social-Handles ohne Domain,
//     Links und Adressen von Wettbewerbern/Verzeichnissen, verschleierte E-Mails, Telefon-Präfixe, 00:00-00:00).
//  2. dublettenFinden(liste): sichere Dopplungen (gleiche Art, sehr nah bzw. gleiche Website/Telefon, keine
//     abweichende Straße). Rückgabe [verlierer, gewinner]; der Build entfernt den Verlierer und leitet per 301 weiter.
// Unklare Fälle bleiben stehen und erscheinen nur im Bericht (scripts/qualitaet-bericht.mjs).
import { distanzKm } from './lib.mjs';
import { namenWoerter, rasterIndex } from './quellen.mjs';

// Wettbewerber und Verzeichnisse: als Website/E-Mail eines Hofs nicht verlinken (keine Daten von Wettbewerbern)
export const WETTBEWERB = /(^|\.)(hofladenfinder|heimischehoflaeden|hofladen-bauernladen)\./i;
export const VERZEICHNIS = /(^|\.)(mein-bauernhof|landservice|regionales-bayern|marktschwaermer|city-map|dasoertliche|gelbeseiten|11880|cylex|golocal|meinestadt|branchenbuch|yelp|tripadvisor|booking|camping\.care|youtube|wikipedia|maps\.google|goo\.gl)(\.|$)/i;
const FREMDE_MAIL = /@(.*\.)?(hofladenfinder|heimischehoflaeden|hofladen-bauernladen|google|elitedomains|sedo|parkingcrew|bodis|dan|schwarzwald-tourismus)\.[a-z]+$/i;

const hostVon = (u) => { try { return new URL(u).host.toLowerCase(); } catch { return null; } };

export function websiteSauber(w) {
  if (!w) return w;
  let u = String(w).trim()
    .replace(/^https?:\/\/(?:www\.)?xn--[a-z0-9-]*https?-[a-z0-9]+\/\/+/i, 'https://') // „www.kräuterhttps//www.…“
    .replace(/^(https?:\/\/)+(h?t+p+s?:?\/\/+)/i, 'https://') // https://https//…, https://htpps//…
    .replace(/^h?t+p+s?:?\/\/+/i, (m) => (/s/i.test(m) ? 'https://' : 'http://'));
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  let url; try { url = new URL(u); } catch { return null; }
  // landservice.de/rd?…&curl=<echte Website>
  const ziel = url.searchParams.get('curl');
  if (ziel && /^https?:\/\//i.test(ziel)) return websiteSauber(ziel);
  if (!/^[^.]+(\.[^.]+)*\.[a-z]{2,}$/i.test(url.hostname.replace(/^www\./i, '').replace(/\.$/, '')) || !url.hostname.replace(/^www\./i, '').includes('.')) return null; // „https://www.schmauder/“
  if (WETTBEWERB.test(url.hostname) || VERZEICHNIS.test(url.hostname)) return null;
  return url.href;
}

// Instagram/Facebook: nur Name eingetragen → aus „hof_kirchhoff“ wurde „https://hof_kirchhoff/“
export function socialSauber(wert, netz) {
  if (!wert) return wert;
  let s = String(wert).trim();
  const h = hostVon(/^https?:/i.test(s) ? s : `https://${s}`);
  const domain = netz === 'instagram' ? 'instagram.com' : 'facebook.com';
  if (h && /(^|\.)(instagram\.com|instagr\.am|facebook\.com|fb\.com|fb\.me|m\.facebook\.com)$/.test(h)) return /^https?:/i.test(s) ? s : `https://${s}`;
  // Handle ohne Domain (auch als „https://handle/“ gespeichert)
  const handle = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/^@/, '').replace(/\/+$/, '');
  if (/^[A-Za-z0-9._-]{2,80}$/.test(handle) && !/\.(de|com|net|org|eu|info|shop|online|bio|farm)$/i.test(handle)) return `https://www.${domain}/${handle}/`;
  return null; // irgendeine andere Website ist kein Social-Link
}

export function emailSauber(m) {
  if (!m) return m;
  let s = String(m).normalize('NFKC').replace(/[­​-‍⁠﻿]/g, '').replace(/^mailto:/i, '').trim();
  // Rückwärts geschrieben (CSS-Verschleierung), z. B. „ed.teneerf@hcsibi-fohtsbo“
  if (!/\.[a-z]{2,}$/i.test(s) && /^[a-z]{2,6}\.[^@]+@[^@]+$/i.test(s)) {
    const r = [...s].reverse().join('');
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(r)) s = r;
  }
  s = s.toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9äöü.-]+\.[a-z]{2,}$/i.test(s)) return null;
  if (FREMDE_MAIL.test(s)) return null;
  return s;
}

export function telefonPraefix(t) {
  if (!t) return t;
  return String(t).trim()
    .replace(/^\+\s*00\s*49\s*\(?0?\)?\s*/, '+49 ') // +0049 05943 → +49 5943
    .replace(/^\+\s*49\s*\(?0\)?\s*(?=[1-9])/, '+49 ') // +49 (0) 35 → +49 35, +49 0351 → +49 351
    .replace(/^\+\s*0(?=[1-9])/, '0'); // +0371 → 0371
}

export function zeitenSauber(oh) {
  if (!oh) return oh;
  // 00:00-00:00 meint in OSM fast immer „rund um die Uhr“
  return String(oh).replace(/\b00:00-00:00\b/g, '00:00-24:00').replace(/^\s*Mo-Su(,PH)?\s+00:00-24:00\s*$/, '24/7');
}

// Straße mit angehängter PLZ und Ort („Deutwanger Str. 30 78355 Hohenfels“, „Mayerhof, 76661 Philippsburg, Deutschland“):
// Straße kürzen, PLZ übernehmen, wenn sie fehlt; eine nachgestellte Hausnummer („…, 49811 Lingen (Ems) 21“) wandert zur Straße
export function adresseTrennen(e) {
  const m = String(e.strasse || '').match(/^(.*?[^\s,])[\s,]+(\d{5})\s+([^,\d][^,]*?)(?:\s+(\d+\s?[a-z]?))?(?:,\s*(?:Deutschland|Germany))?$/i);
  if (!m || (m[4] && /\d/.test(m[1]))) return false; // zwei Hausnummern: lieber nichts ändern
  e.strasse = m[4] ? `${m[1].replace(/[.,]?$/, (x) => (x === '.' ? '.' : ''))} ${m[4].replace(/\s/g, '')}` : m[1].replace(/,$/, '');
  if (!e.plz) e.plz = m[2];
  return true;
}

// Name sagt, dass der Betrieb dauerhaft geschlossen ist („… geschlossen“, „ehemaliger Hofladen“, „(closed)“)
export const nameGeschlossen = (n) => /\b(dauerhaft\s+)?geschlossen\b|\behemalige[rs]?\b|\bpermanently closed\b|\(closed\)|\baufgegeben\b/i.test(String(n || ''))
  && !/vorübergehend|winterpause|saison|urlaub|bis\s+\d|ab\s+\d|heute|montags|sonntags|feiertags/i.test(String(n || ''));

// Gibt die Liste der geänderten Felder zurück (für Statistik und Tests)
export function felderBereinigen(e) {
  const vorher = { website: e.website, facebook: e.facebook, instagram: e.instagram, email: e.email, telefon: e.telefon, oeffnungszeiten: e.oeffnungszeiten, strasse: e.strasse, plz: e.plz };
  if (e.strasse) adresseTrennen(e);
  if (e.website) {
    const h = hostVon(/^https?:/i.test(e.website) ? e.website : `https://${e.website}`) || '';
    if (/(^|\.)(facebook\.com|fb\.com)$/.test(h)) { e.facebook ||= e.website; e.website = null; }
    else if (/(^|\.)instagram\.com$/.test(h)) { e.instagram ||= e.website; e.website = null; }
    else e.website = websiteSauber(e.website);
  }
  if (e.facebook && /instagram\.com/i.test(e.facebook)) { e.instagram ||= e.facebook; e.facebook = null; }
  if (e.facebook) e.facebook = socialSauber(e.facebook, 'facebook');
  if (e.instagram) e.instagram = socialSauber(e.instagram, 'instagram');
  if (e.email) e.email = emailSauber(e.email);
  if (e.telefon) e.telefon = telefonPraefix(e.telefon);
  if (e.oeffnungszeiten) e.oeffnungszeiten = zeitenSauber(e.oeffnungszeiten);
  return Object.keys(vorher).filter((k) => (vorher[k] || null) !== (e[k] || null));
}

// ---------- Dopplungen ----------
const GENERISCH = /^(der |die |das )?(hof-?laden|hoflädchen|hoflädele|bauern-?laden|hofverkauf|regio-?mat|milch-?tankstelle|milch-?automat|milchhäusle|eier-?automat|eierhäusle|kartoffel-?automat|honig-?automat|fleisch-?automat|verkaufs-?automat|selbstbedienung|imkerei|hofcaf[eé]|solawi|erdbeerfeld|direktvermarktung)?$/i;
const generisch = (n) => !n || GENERISCH.test(String(n).trim());
// Straße vergleichbar machen; nur Hausnummer („52“) zählt als unbekannt
const strasseKern = (s) => { const k = String(s || '').toLowerCase().replace(/str\.|strasse/g, 'straße').replace(/[^a-zäöüß0-9]/g, ''); return /[a-zäöüß]/.test(k) ? k : ''; };
// Gleiche Straße, auch wenn bei einer Angabe die Hausnummer fehlt („Johannishof“ / „Johannishof 1“)
const strasseGleich = (a, b) => a === b || (a.replace(/\d+[a-z]?$/, '') === b.replace(/\d+[a-z]?$/, '') && (!/\d/.test(a) || !/\d/.test(b)));
// Einträge, die kein Hofverkauf sind, aber am selben Punkt eingetragen wurden (Paketshop im Hofladen)
const KEIN_HOF = /^(dhl|hermes|dpd|gls|ups)\b.*(paket|shop|station)|^(post|postfiliale|paketshop|packstation)$/i;
const ziffern = (t) => String(t || '').replace(/\D/g, '').replace(/^0049|^49/, '0');
const webKern = (w) => { const h = hostVon(w || ''); return h ? `${h.replace(/^www\./, '')}${new URL(w).pathname.replace(/\/+$/, '').toLowerCase()}` : null; };
// Gleiche Website: gleicher Host und ein Pfad ist Anfang des anderen (Startseite / Unterseite)
const webGleich = (a, b) => !!a && !!b && (a === b || (a.split('/')[0] === b.split('/')[0] && (a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || !a.includes('/') || !b.includes('/'))));

// Rang: wer bleibt? Betriebsangaben/Pflege > manuell > OSM > Karte von morgen/Verwaltung > Overture > Foursquare; dann mehr Angaben
const QUELL_RANG = { betreiber: 6, manuell: 5, osm: 4, kvm: 3, kommunal: 3, overture: 2, foursquare: 1 };
const FELDER = ['strasse', 'telefon', 'email', 'website', 'oeffnungszeiten', 'oeffnungszeiten_text', 'beschreibung', 'facebook', 'instagram'];
function rang(e) {
  return [KEIN_HOF.test(e.name || '') ? 0 : 1, (e.gepflegt || e.vomBetrieb) ? 1 : 0, QUELL_RANG[e.quelle] || 0, FELDER.filter((f) => e[f]).length, e.name && !generisch(e.name) ? 1 : 0];
}
const besser = (a, b) => { const ra = rang(a), rb = rang(b); for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i]; return String(a.osm || a.id) < String(b.osm || b.id); };

// Ähnlichkeit zweier Namen nach Levenshtein (0–1), für Tippfehler wie „Köcherhof“/„Köckerhof“
function aehnlichkeit(a, b) {
  const x = String(a || '').toLowerCase().replace(/[^a-zäöüß0-9]/g, ''), y = String(b || '').toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
  if (!x || !y) return 0;
  const d = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= y.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1)); prev = t; }
  }
  return 1 - d[y.length] / Math.max(x.length, y.length);
}

// Branchenwörter zählen nicht als gemeinsamer Namensteil („Gärtnerei Seifried“ ≠ „Gärtnerei Salzmann“)
const BRANCHE = /^(gaertnerei|imkerei|obstbau|obsthof|spargel|spargelhof|erdbeer|erdbeere|erdbeeren|erdbeerfeld|beeren|gemuese|gemuesebau|bauernhof|landwirtschaft|milch|milchhof|eier|kartoffel|kartoffeln|hofcafe|bioladen|biokiste|selbstbedienung|verkauf|verkaufsstand|stand|feld|regiomat|automat|milchtankstelle|bauernladen|direktvermarktung|honig|imker|weingut|metzgerei|kaeserei|hofkaeserei|gefluegel|gefluegelhof|selbstpfluecken|selberpfluecken|obst|bioland|demeter|naturland)$/;
function namenAehnlich(a, b) {
  const wa = namenWoerter(a).filter((w) => !BRANCHE.test(w)), wb = namenWoerter(b).filter((w) => !BRANCHE.test(w));
  return wa.some((x) => wb.some((y) => x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)))));
}

export function istDublette(a, b) {
  if (a.art !== b.art || a.typ !== b.typ) return false;
  if ((a.gepflegt || a.vomBetrieb) && (b.gepflegt || b.vomBetrieb)) return false;
  const sa = strasseKern(a.strasse), sb = strasseKern(b.strasse);
  if (sa && sb && !strasseGleich(sa, sb)) return false; // zwei Adressen = zwei Standorte
  const d = distanzKm(a.lat, a.lon, b.lat, b.lon);
  const nameGleich = !!a.name && !!b.name && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
  const nameAehnlich = nameGleich || (!!a.name && !!b.name && (namenAehnlich(a.name, b.name) || aehnlichkeit(a.name, b.name) >= 0.8));
  const nameNah = nameAehnlich || generisch(a.name) || generisch(b.name) || KEIN_HOF.test(a.name || '') || KEIN_HOF.test(b.name || '');
  // 1. Praktisch derselbe Punkt, gleiche Art, Name gleich/ähnlich oder einer ohne eigenen Namen
  if (d <= 0.05 && nameNah) return true;
  const wa = webKern(a.website), wb = webKern(b.website);
  const ta = ziffern(a.telefon), tb = ziffern(b.telefon);
  if (!(webGleich(wa, wb) || (ta.length >= 7 && ta === tb))) return false;
  // 2. Gleiche Website/Telefonnummer und ähnlicher Name: in OSM bis 500 m (weiter weg oft eigene Verkaufsstände),
  //    zwischen verschiedenen Quellen bis 3 km (Firmendaten liegen oft am Ortsmittelpunkt)
  const quellenGleich = a.quelle === b.quelle;
  if (sa && sb && strasseGleich(sa, sb) && d <= 5) return true; // gleiche Adresse und gleiche Kontaktdaten
  return nameNah && d <= (quellenGleich ? 0.5 : 3);
}

export function dublettenFinden(liste) {
  const idx = rasterIndex(liste);
  const raus = new Map(); // verlierer → gewinner
  const sortiert = [...liste].sort((a, b) => (besser(a, b) ? -1 : 1));
  for (const a of sortiert) {
    if (raus.has(a)) continue;
    for (const b of idx.nahe(a.lat, a.lon)) {
      if (b === a || raus.has(b)) continue;
      if (!istDublette(a, b)) continue;
      const [gew, ver] = besser(a, b) ? [a, b] : [b, a];
      if (raus.has(gew)) continue;
      raus.set(ver, gew);
    }
  }
  return [...raus];
}

// Hofladen-Typ, obwohl der Name eindeutig einen Automaten beschreibt („Reinerts Milchtankstelle“, „Eierhäusle Furtwangen“)
const KEIN_AUTOMAT = /hof-?laden|laden|lädchen|lädele|hofcaf|café|cafe|markt|scheune|hofverkauf|metzgerei|gärtnerei|bäckerei|imkerei|hofstelle|hof\s*\w+\s*(gbr|kg)/i;
export function automatArtAusName(e) {
  if (e.typ !== 'hofladen' || e.art !== 'Hofladen' || !e.name || KEIN_AUTOMAT.test(e.name)) return null;
  const n = e.name.toLowerCase();
  if (/milch-?(tankstelle|automat|häus(le|chen)|hütte)|milchautomat/.test(n)) return 'Milchtankstelle';
  if (/eier-?(automat|häus(le|chen)|box|hütte)|ei-o-mat/.test(n)) return 'Eierautomat';
  if (/kartoffel-?(automat|häus|box)/.test(n)) return 'Kartoffelautomat';
  if (/honig-?(automat|box)/.test(n)) return 'Honigautomat';
  if (/(fleisch|wurst|grill)-?(automat|box)/.test(n)) return 'Fleischautomat';
  if (/regio-?mat|(verkaufs|lebensmittel|hütten|obst|hof|waren)-?automat(en)?\b|\bautomat(en)?\b/.test(n)) return 'Regiomat';
  return null;
}
