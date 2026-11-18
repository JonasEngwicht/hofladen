// Auswahl und Abgleich von Kandidaten aus offenen Quellen (reine Funktionen, siehe tests/quellen.test.mjs).
// Quellen: Overture Maps, Karte von morgen, Foursquare Open Source Places, offene Verwaltungsdaten.
import { distanzKm, slugify } from './lib.mjs';

// Rang: kleiner = bevorzugt, wenn mehrere Quellen denselben Hof kennen (Verwaltung und Community-Karte vor Firmendaten)
export const QUELLEN = {
  kommunal: { praefix: 'g', name: 'offene Verwaltungsdaten', url: 'https://www.govdata.de/', rang: 0 },
  kvm: { praefix: 'k', name: 'Karte von morgen', url: 'https://kartevonmorgen.org/', lizenz: 'CC0-1.0', rang: 1 },
  overture: { praefix: 'o', name: 'Overture Maps Foundation', url: 'https://overturemaps.org/', rang: 2 },
  foursquare: { praefix: 'f', name: 'Foursquare Open Source Places', url: 'https://opensource.foursquare.com/os-places/', lizenz: 'Apache-2.0', rang: 3 },
};
// Stabile ID für Einträge aus offenen Quellen, z. B. overture/<GERS-ID> → o-<GERS-ID>
export function quellenId(quelle, id) {
  const q = QUELLEN[quelle];
  return q ? `${q.praefix}-${slugify(id)}` : null;
}

// Namen, die eindeutig auf Direktverkauf hinweisen
export const STARK = /hof-?laden|hoflädchen|hofladl|hofverkauf|bauern-?laden|hofmarkt|hof-?käserei|hof-?shop|hof-?box|milch-?tankstelle|milch-?automat|frischmilch|milch-?häus|eier-?automat|eier-?häus|regio-?mat|regio-?box|direktvermarktung|direktverkauf|selbstbedienungs-?(hütte|häus|laden|stand)|verkaufs-?(hütte|häus|automat)|verkaufsstand/i;
// Höfe, die oft direkt verkaufen – nur mit passender Kategorie und hoher Konfidenz
export const SCHWACH = /bio-?hof|obst-?hof|spargel-?hof|erdbeer-?hof|gemüse-?hof|geflügel-?hof|eier-?hof|kartoffel-?hof/i;
// Keine Höfe, auch wenn der Name passt
const KEIN_HOF = /verband|verein|e\.\s?v\.|genossenschaft|großhandel|grosshandel|vertrieb|agentur|automatenbau|automaten-?service|automatentechnik|marketing|beratung|software|möbel|moebel|ferienwohnung|ferienhaus|pension\b|hotel|gasthof|gasthaus|restaurant|landgasthof|reiterhof|reitstall|pferdehof|tierarzt|schule|kita|kindergarten|online|versandhandel|transporte?\b|\.(de|com|net|eu|info)\b|^landkreis|^kreis |^stadt |^gemeinde |einkaufsf(ü|ue)hrer|regionale lebensmittel in|wochenmarkt|bauernmarkt|bio-?markt|markthalle|marktschw(ä|ae)rmer|food-?coop|initiative|netzwerk|verbund|arbeitsgemeinschaft|ernährungsrat|ernaehrungsrat/i;
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
  // Quelle ordnet den Ort selbst als Hofladen/Direktvermarkter ein (Schlagwort, Datensatz über Direktvermarkter)
  if (o.hofHinweis) return o.konf >= MIN_KONF_STARK && (kat === null || katHof || KAT_NUR_STARK.has(kat));
  if (STARK.test(name)) {
    if (o.konf < MIN_KONF_STARK) return false;
    if (kat === null) return o.konf >= MIN_KONF_SCHWACH;
    return katHof || KAT_NUR_STARK.has(kat);
  }
  if (SCHWACH.test(name)) return o.konf >= MIN_KONF_SCHWACH && katHof;
  return false;
}

// Würde mit höherer Konfidenz aufgenommen: Kandidat für die Prüfung über die eigene Website des Hofs
export const MIN_KONF_PRUEFUNG = 0.5;
export function nurKonfidenzFehlt(o) {
  return o.konf >= MIN_KONF_PRUEFUNG && !istHofladen(o) && istHofladen({ ...o, konf: 1 });
}
// Hinweise auf Direktverkauf auf der Startseite eines Hofs
export const WEBSITE_HINWEIS = /hof-?laden|hofverkauf|ab[- ]hof|direktvermarktung|direktverkauf|verkaufsautomat|milch-?tankstelle|regio-?mat|selbstbedienung|bauern-?laden|hofl(ä|ae)dchen/i;
export function websiteBestaetigt(html) {
  return WEBSITE_HINWEIS.test(String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' '));
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
  s = s.split(' | ')[0].trim();
  s = s.replace(/ (Und|Der|Die|Das|Am|Im|An|Auf|Vom|Von|Zum|Zur|In|Bei|Mit|Aus) /g, (m) => m.toLowerCase());
  s = s.replace(/(\p{L})-(\p{Ll})(\p{Ll}{3,})/gu, (m, a, b, c) => `${a}-${b.toUpperCase()}${c}`);
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
  const webs = (o.websites || []).map(url).filter((u) => u && !/\.(pdf|docx?|xlsx?)(\?|#|$)/i.test(u));
  const socials = [...(o.socials || []), ...webs].map(url).filter(Boolean);
  const host = (u) => new URL(u).hostname.replace(/^www\./, '');
  const website = webs.find((u) => !FREMD.test(`.${host(u)}`) && !/(^|\.)(facebook|instagram|fb)\.com$/.test(host(u))) || null;
  const facebook = socials.find((u) => /(^|\.)(facebook|fb)\.com$/.test(host(u))) || null;
  const instagram = socials.find((u) => /(^|\.)instagram\.com$/.test(host(u))) || null;
  const tel = (o.phones || []).map(telefon).find(Boolean) || null;
  const email = (o.emails || []).map((m) => String(m).trim().toLowerCase()).find((m) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(m)) || null;
  return { website, facebook, instagram, telefon: tel, email };
}
// Telefonnummern einheitlich: +49 und Rufnummer ohne führende 0; offensichtlich kaputte Nummern verwerfen
export function telefon(p) {
  const roh = String(p || '').trim();
  if (!/^\+?[\d\s/()-]{6,}$/.test(roh)) return null;
  const z = roh.replace(/\D/g, '');
  let national, international = true;
  if (roh.startsWith('+')) { if (!z.startsWith('49')) return roh; national = z.slice(2); }
  else if (z.startsWith('0049')) national = z.slice(4);
  else if (z.startsWith('0')) { national = z.slice(1); international = false; }
  else if (z.startsWith('49') && z.length >= 10) national = z.slice(2);
  else return null;
  national = national.replace(/^0/, '');
  // doppelte Landesvorwahl (+49 49…) ist ein Datenfehler
  if (national.length < 6 || national.length > 13 || (international && national.startsWith('49'))) return null;
  return `+49 ${national}`;
}
export function adresse(o) {
  const plz = /^\d{5}$/.test(String(o.plz || '').trim()) ? String(o.plz).trim() : null;
  let strasse = o.strasse && /\d/.test(o.strasse) && o.strasse.length <= 80 ? String(o.strasse).trim() : null;
  const vorn = strasse && strasse.match(/^(\d+\s?[a-zA-Z]?)\s+(\D.*)$/); // "37 Straße der Freundschaft"
  if (vorn) strasse = `${vorn[2]} ${vorn[1].replace(/\s/g, '')}`;
  return { strasse, plz, ort: o.ort ? String(o.ort).trim() : null };
}

// Doppelte Datensätze (z. B. Meta und BrightQuery oder Overture und Karte von morgen für denselben Hof) zusammenführen.
// vorrang(o): kleinere Zahl gewinnt (z. B. bereits veröffentlichte IDs, damit stabile IDs stabil bleiben).
export function zusammenfuehren(liste, vorrang = () => 0) {
  const sortiert = [...liste].sort((a, b) => vorrang(a) - vorrang(b) || b.konf - a.konf || String(a.id).localeCompare(String(b.id)));
  const idx = rasterIndex([]), behalten = [];
  for (const o of sortiert) {
    const gleich = idx.nahe(o.lat, o.lon).find((k) => gleicherHof(k, o));
    if (gleich) {
      gleich.weitere.push(o);
      for (const f of ['website', 'facebook', 'instagram', 'telefon', 'email']) if (!gleich.k[f] && o.k[f]) { gleich.k[f] = o.k[f]; (gleich.kq ||= {})[f] = o.quelle; }
      if (!gleich.a.strasse && o.a.strasse) gleich.a = o.a;
      for (const f of ['oeffnungszeiten_text', 'beschreibung']) if (!gleich[f] && o[f]) gleich[f] = o[f];
      if (o.bio) gleich.bio = true;
      continue;
    }
    const neu = { ...o, weitere: [] };
    idx.add(neu); behalten.push(neu);
  }
  return behalten;
}
