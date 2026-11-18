// Auswahl und Abgleich der Overture-Kandidaten (reine Funktionen, siehe tests/overture.test.mjs).
// Quelle: Overture Maps Foundation, Places-Theme (CDLA-Permissive-2.0, Apache-2.0, CC0; enthält keine OSM-Daten).
import { distanzKm } from './lib.mjs';

// Namen, die eindeutig auf Direktverkauf hinweisen
export const STARK = /hof-?laden|hoflädchen|hofladl|hofverkauf|bauern-?laden|hofmarkt|hof-?käserei|hof-?shop|hof-?box|milch-?tankstelle|milch-?automat|frischmilch|milch-?häus|eier-?automat|eier-?häus|regio-?mat|regio-?box|direktvermarktung|direktverkauf|selbstbedienungs-?(hütte|häus|laden|stand)|verkaufs-?(hütte|häus|automat)|verkaufsstand/i;
// Höfe, die oft direkt verkaufen – nur mit passender Kategorie und hoher Konfidenz
export const SCHWACH = /bio-?hof|obst-?hof|spargel-?hof|erdbeer-?hof|gemüse-?hof|geflügel-?hof|eier-?hof|kartoffel-?hof/i;
// Keine Höfe, auch wenn der Name passt
const KEIN_HOF = /verband|verein|e\.\s?v\.|genossenschaft|großhandel|grosshandel|vertrieb|agentur|automatenbau|automaten-?service|automatentechnik|marketing|beratung|software|möbel|moebel|ferienwohnung|ferienhaus|pension\b|hotel|gasthof|gasthaus|restaurant|landgasthof|reiterhof|reitstall|pferdehof|tierarzt|schule|kita|kindergarten/i;
const KAT_HOF = new Set(['farm', 'poultry_farm', 'dairy_farm', 'orchard', 'pick_your_own_farm', 'ranch', 'agriculture',
  'agricultural_service', 'livestock_breeder', 'farmers_market', 'greengrocer', 'produce_store', 'grocery_store',
  'organic_grocery_store', 'food_and_beverage_store', 'specialty_foods_store', 'dairy_store', 'cheese_shop', 'butcher_shop',
  'meat_shop', 'health_food_store', 'delicatessen', 'convenience_store', 'shopping', 'market', 'egg_supplier', 'honey_supplier']);
const KAT_NUR_STARK = new Set(['cafe', 'coffee_shop', 'bakery', 'vending_machine_supplier', 'food_beverage_distributor',
  'agritourism', 'winery', 'beverage_store', 'flowers_and_gifts_shop']);
const HIER_HOF = /food_and_beverage_store|agricultural_service>farm|>market>|farmers_market/;

export const MIN_KONF_STARK = 0.7;
export const MIN_KONF_SCHWACH = 0.8;

// Verzeichnisse, Branchenbücher und Plattformen sind keine Website des Hofs
const FREMD = /(^|\.)(dasoertliche|gelbeseiten|11880|ortsdienst|oeffnungszeitenbuch|werkenntdenbesten|cylex|golocal|meinestadt|branchenbuch|yelp|tripadvisor|google|goo|freeontour|bauernhofurlaub|rausgegangen|hofladenfinder|heimischehoflaeden|hofladen-bauernladen|creditreform|northdata|wlw|firmenwissen|unternehmensregister|linktr|ebay|kleinanzeigen)\./i;

export function hofTyp(name) {
  const n = name || '';
  if (/milch-?tankstelle|milch-?automat|frischmilch|milch-?häus/i.test(n)) return { typ: 'automat', art: 'Milchtankstelle' };
  if (/eier-?automat|eier-?häus/i.test(n)) return { typ: 'automat', art: 'Eierautomat' };
  if (/regio-?mat|regio-?box|verkaufs-?automat/i.test(n)) return { typ: 'automat', art: 'Regiomat' };
  return { typ: 'hofladen', art: 'Hofladen' };
}

// Auswahl für neue Einträge: eindeutiger Name, passende Kategorie, ausreichende Konfidenz
export function istHofladen(o) {
  const name = o.name || '';
  if (!name || KEIN_HOF.test(name)) return false;
  const kat = o.kat || null, hier = o.hier || '';
  const katHof = KAT_HOF.has(kat) || HIER_HOF.test(hier);
  if (STARK.test(name)) {
    if (o.konf < MIN_KONF_STARK) return false;
    if (kat === null) return o.konf >= MIN_KONF_SCHWACH;
    return katHof || KAT_NUR_STARK.has(kat);
  }
  if (SCHWACH.test(name)) return o.konf >= MIN_KONF_SCHWACH && katHof;
  return false;
}

// Namen vergleichbar machen: kennzeichnende Wörter ohne Gattungsbegriffe
const FUELL = new Set(['hofladen', 'hof', 'laden', 'hoflaedchen', 'bio', 'biohof', 'der', 'die', 'das', 'und', 'familie',
  'fam', 'gbr', 'gmbh', 'co', 'kg', 'ohg', 'landwirtschaft', 'landwirtschaftsbetrieb', 'betrieb', 'verkauf', 'hofverkauf',
  'direktvermarktung', 'direktverkauf', 'milchtankstelle', 'milchautomat', 'regiomat', 'automat', 'eierautomat', 'am', 'im',
  'an', 'auf', 'vom', 'von', 'zum', 'zur', 'in', 'bei', 'mit', 'shop', 'hofshop', 'bauernladen', 'bauernhof', 'markt',
  'hofmarkt', 'gut', 'frische', 'frisch', 'regional', 'regionale', 'produkte', 'selbstbedienung', 'obsthof', 'spargelhof',
  'erdbeerhof', 'gemuesehof', 'gefluegelhof', 'eierhof', 'kartoffelhof', 'obst', 'gemuese', 'eier', 'milch', 'fleisch',
  'kartoffeln', 'spargel', 'erdbeeren', 'mein', 'unser', 'ihr', 'st', 'sankt', 'neu', 'alt']);
export function namenWoerter(name) {
  return String(name || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)
    .map((w) => w.replace(/s$/, '')).filter((w) => w.length >= 3 && !FUELL.has(w) && !FUELL.has(`${w}s`) && !/^\d+$/.test(w));
}
export function namenAehnlich(a, b) {
  const wa = namenWoerter(a), wb = namenWoerter(b);
  return wa.some((x) => wb.some((y) => x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)))));
}

// Gleicher Ort? Sehr nah beieinander oder in der Nähe mit ähnlichem Namen
export function gleicherHof(a, b) {
  const d = distanzKm(a.lat, a.lon, b.lat, b.lon);
  if (d <= 0.15) return true;
  return d <= 2 && !!a.name && !!b.name && namenAehnlich(a.name, b.name);
}

// Räumlicher Index (0,02°-Raster ≈ 2 km)
export function rasterIndex(liste) {
  const r = new Map();
  for (const e of liste) {
    const k = `${Math.floor(e.lat * 50)}:${Math.floor(e.lon * 50)}`;
    if (!r.has(k)) r.set(k, []);
    r.get(k).push(e);
  }
  return {
    nahe(lat, lon) {
      const la = Math.floor(lat * 50), lo = Math.floor(lon * 50), out = [];
      for (let i = la - 1; i <= la + 1; i++) for (let j = lo - 2; j <= lo + 2; j++) out.push(...(r.get(`${i}:${j}`) || []));
      return out;
    },
    add(e) {
      const k = `${Math.floor(e.lat * 50)}:${Math.floor(e.lon * 50)}`;
      if (!r.has(k)) r.set(k, []);
      r.get(k).push(e);
    },
  };
}

// Namen aus Firmendaten aufräumen ("Eier Und Geflügelhof Fuhrmann Gbr" → "Eier und Geflügelhof Fuhrmann GbR")
export function sauberName(n) {
  let s = String(n || '').replace(/\s+/g, ' ').replace(/´|`/g, '’').trim();
  s = s.replace(/ (Und|Der|Die|Das|Am|Im|An|Auf|Vom|Von|Zum|Zur|In|Bei|Mit|Aus) /g, (m) => m.toLowerCase());
  s = s.replace(/\bGbr\b/g, 'GbR').replace(/\bGmbh\b/g, 'GmbH').replace(/\bKg\b/g, 'KG').replace(/\bOhg\b/g, 'OHG')
    .replace(/\bE\.\s?K\.?$/i, 'e. K.').replace(/\bU\.\s?Co\.?/i, 'u. Co.');
  return s;
}

function url(u) {
  if (!u) return null;
  u = String(u).trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
}
export function kontakt(o) {
  const webs = (o.websites || []).map(url).filter(Boolean);
  const socials = [...(o.socials || []), ...webs].map(url).filter(Boolean);
  const host = (u) => new URL(u).hostname.replace(/^www\./, '');
  const website = webs.find((u) => !FREMD.test(`.${host(u)}`) && !/(^|\.)(facebook|instagram|fb)\.com$/.test(host(u))) || null;
  const facebook = socials.find((u) => /(^|\.)(facebook|fb)\.com$/.test(host(u))) || null;
  const instagram = socials.find((u) => /(^|\.)instagram\.com$/.test(host(u))) || null;
  const tel = (o.phones || []).map((p) => String(p).trim()).find((p) => /^\+?[\d\s/()-]{6,}$/.test(p)) || null;
  const email = (o.emails || []).map((m) => String(m).trim().toLowerCase()).find((m) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(m)) || null;
  return { website, facebook, instagram, telefon: tel ? tel.replace(/^\+49(\d)/, '+49 $1') : null, email };
}
export function adresse(o) {
  const plz = /^\d{5}$/.test(String(o.plz || '').trim()) ? String(o.plz).trim() : null;
  const strasse = o.strasse && /\d/.test(o.strasse) && o.strasse.length <= 80 ? String(o.strasse).trim() : null;
  return { strasse, plz, ort: o.ort ? String(o.ort).trim() : null };
}

// Doppelte Overture-Datensätze (z. B. Meta und BrightQuery für denselben Hof) zusammenführen
export function zusammenfuehren(liste) {
  const sortiert = [...liste].sort((a, b) => b.konf - a.konf || String(a.id).localeCompare(String(b.id)));
  const idx = rasterIndex([]), behalten = [];
  for (const o of sortiert) {
    const gleich = idx.nahe(o.lat, o.lon).find((k) => gleicherHof(k, o));
    if (gleich) {
      gleich.weitere.push(o);
      for (const f of ['website', 'facebook', 'instagram', 'telefon', 'email']) if (!gleich.k[f] && o.k[f]) gleich.k[f] = o.k[f];
      if (!gleich.a.strasse && o.a.strasse) gleich.a = o.a;
      continue;
    }
    const neu = { ...o, weitere: [] };
    idx.add(neu); behalten.push(neu);
  }
  return behalten;
}
