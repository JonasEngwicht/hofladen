// Gemeinsame Hilfsfunktionen für Import und Build (nur Node-Bordmittel).
import { readFileSync } from 'node:fs';

export const BUNDESLAENDER = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg',
  HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz',
  SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// GeoNames enthält auch Großkunden-Postleitzahlen von Firmen und Behörden ("Finanzamt", "AOK", "… GmbH").
// Solche Einträge sind keine Orte und werden für Ortsnamen und die Kreiszuordnung ignoriert.
const ORG = new RegExp([
  'GmbH', '\\bAG\\b', '\\bKG\\b', '\\bSE\\b', 'a\\.G\\.', 'mbH', '\\bOHG\\b', '\\beG\\b', '\\bPLC\\b', 'e\\.\\s?V\\.',
  '\\bAmt\\b', 'amt\\b', '[Kk]asse\\b', 'Bank\\b', '[Vv]ersicherung', '[Vv]erwaltung', 'Universit', 'Hochschule',
  'Bibliothek', '[Gg]ericht\\b', 'Ministerium', 'Staatsminist', 'Behörde', 'Agentur', '\\bBundes[a-zäöü]', '\\bLandes[a-zäöü]',
  'Statistisch', 'Deutsche[rsn]? ', 'Post\\b', 'Postbank', 'Telekom', 'Rundfunk', 'Radio', 'Generali', 'Allianz', '\\bWerke\\b',
  'Rathaus', 'Polizei', 'Bundeswehr', 'Army', 'Kaserne', 'Rechtsanw', 'Studio', 'Redaktion', 'Centrum', 'Institut', 'Lotterie',
  '[Vv]erband', '[Gg]enossenschaft', 'Gesellschaft', 'Aktiengesellschaft', 'Anstalt', 'Informationssystem', 'Niederlassung',
  'Filiale', 'Logistik', 'Marketing', 'Service', 'Versand', 'Zustell', 'Schadenausgleich', 'Gesundheit', 'Flughafen', 'Konzern',
  'Holding', 'Zentrale', '[Dd]irektion', 'Kaufhof', 'Karstadt', 'Siemens', 'Daimler', 'Bosch', 'Amazon', 'Philatelie', 'Abt\\.',
  'Hauptverwaltung', 'Geschäftsstelle', '[Kk]ammer', 'Krankenhaus', 'Klinik', 'Verlag', 'Druckerei', 'Archiv', 'Landtag',
  'Regierung', 'Senat', 'Finanz', 'Steuer', 'Medien', 'Bahn\\b', 'Commerz', 'Handel\\b', 'Vertrieb', 'Stiftung', 'Vertretung',
  'Bevollmächtigt', 'Museum', 'Präsidium', 'Sekretariat', 'Büro', 'Arbeitskreis', 'Arbeitsring', 'Rat für', 'Staatsanwalt',
  'Oberbürgermeister', 'Laboratorium', 'Facharzt', 'Beratungsstelle', 'Team\\b', 'Konzerthaus', 'Oper\\b', 'Bereich',
  'Deutschland\\b', '[Kk]assen\\b', 'Sparkasse', '[Bb]üro', 'Zentrum', 'Jobcenter', 'Apotheke', 'Leasing', 'Finance',
  'Distribution', 'Akademie', 'Großannahme', 'Aktion ', 'Teleshopping', '[Vv]ersorgung', 'Versicherer', 'Express', 'Brauerei',
  '&', ' u\\. ', 'Dr\\.', 'Fachbereich', 'Fachklinik', 'klinik', 'Ordinariat', 'Diözese', 'GbR', 'oHG', 'Pharma', 'Group',
  'Partner', 'Labor', '[Bb]etrieb\\b', 'management', 'wirtschaft', 'Bezirksstelle', 'Förderkreis', 'Center', 'Infrastruktur',
  'Rechnungswesen', 'Koordination', 'Kreditanstalt', 'Überwachung', 'Kunden', 'Solar', '[Ss]taatsanwalt',
  '[Gg]erichtshof', 'Mineralöl', 'Rehabilitation', 'Fachinformation', 'Motor', 'Taxis', 'Staatsbibliothek',
  'Kreisausschu', 'Landrat', '[Mm]inister', 'Staatskanzlei', 'Justizvollzug', 'Senate', 'Verrechnung', 'Buchhandlung', 'Dipl\\.',
  'Ltd\\.', 'Senioren', 'Dienst\\b', '^Haus ', '^Gemeinde ', 'Club\\b', 'Vorstand', 'Fachhochschule', 'Bauaktien', 'Volksbank',
  '[Zz]eitung', 'SpreeBo', 'Diven', '\\b(BKK|IKK|AOK|BARMER|DAK|HUK|BVG|GEMA|SWR|ZDF|ARD|RBB|DRK|VIT|AVM|AVG|OVAG|KSA|MDC|IMS|HDE|EDW|AKAD|LLP|ABB|EMBL)\\b',
  '\\b[A-ZÄÖÜ]{3,}\\b', '^"', '\\.[A-Za-z]', '\\d',
].join('|'));
const KEINE_ORG = /^(Freiamt|Hohenkammer|Kammerstein|Kammerforst|Maikammer|Freigericht|Linsengericht|Landesbergen)$/;
export const istOrganisation = (name) => ORG.test(name) && !KEINE_ORG.test(name);

// Minimaler CSV-Parser (Felder ohne Zeilenumbrüche, mit Anführungszeichen).
function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Kanonischen Kreisnamen aus den GeoNames-Varianten bilden.
function kreisName(variants) {
  const best = [...variants.keys()].sort((a, b) => score(b) - score(a))[0];
  let m;
  if ((m = best.match(/^(.*), kreisfreie Stadt$/))) return { name: m[1], art: 'Stadt' };
  if ((m = best.match(/^(.*), (Freie und Hansestadt|Stadt|Hansestadt)$/))) return { name: m[1], art: 'Stadt' };
  if ((m = best.match(/^(Kreisfreie Stadt|Stadtkreis) (.*)$/))) return { name: m[2], art: 'Stadt' };
  if ((m = best.match(/^(Landkreis|Kreis) (.*)$/))) return { name: m[2], art: 'Landkreis' };
  return { name: best, art: 'Landkreis' };
  function score(v) {
    return (/^(Landkreis|Kreisfreie Stadt|Stadtkreis|Kreis) /.test(v) ? 10 : 0) + variants.get(v) / 1000;
  }
}

// Lädt PLZ-Tabelle und Kreisverzeichnis aus der GeoNames-CSV.
export function ladePlz(pfad) {
  const lines = readFileSync(pfad, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = parseCsvLine(lines.shift());
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  const orte = [];
  const kreisVarianten = new Map();
  for (const line of lines) {
    const f = parseCsvLine(line);
    const code = f[idx.community_code];
    const land = f[idx.state_code];
    if (!code || !BUNDESLAENDER[land]) continue;
    const o = {
      plz: f[idx.zipcode], ort: f[idx.place], land, kreis: code,
      lat: +f[idx.latitude], lon: +f[idx.longitude],
    };
    o.org = istOrganisation(o.ort);
    orte.push(o);
    if (!kreisVarianten.has(code)) kreisVarianten.set(code, { land, v: new Map() });
    const kv = kreisVarianten.get(code).v;
    kv.set(f[idx.community], (kv.get(f[idx.community]) || 0) + 1);
  }

  // Kreise mit Slugs; Stadt und gleichnamiger Landkreis im selben Land bekommen eindeutige Slugs.
  const kreise = new Map();
  for (const [code, { land, v }] of kreisVarianten) {
    const { name, art } = kreisName(v);
    kreise.set(code, { code, land, name, art, slug: slugify(name) });
  }
  const seen = new Map();
  for (const k of kreise.values()) {
    const key = k.land + '/' + k.slug;
    seen.set(key, (seen.get(key) || []).concat(k));
  }
  for (const list of seen.values()) {
    if (list.length < 2) continue;
    for (const k of list) if (k.art === 'Stadt') k.slug += '-stadt';
    else k.slug = 'landkreis-' + k.slug;
  }
  for (const k of kreise.values()) {
    k.landName = BUNDESLAENDER[k.land];
    k.landSlug = slugify(k.landName);
    k.pfad = `/${k.landSlug}/${k.slug}/`;
    k.titel = k.art === 'Stadt' ? k.name : `Landkreis ${k.name}`;
    if (k.land === 'BE' || k.land === 'HH') k.titel = k.name;
  }

  const plz = new Map();
  for (const o of orte) {
    if (!plz.has(o.plz)) plz.set(o.plz, []);
    plz.get(o.plz).push(o);
  }
  return { orte, kreise, plz, raster: baueRaster(orte.filter((o) => !o.org)) };
}

function baueRaster(orte) {
  const r = new Map();
  for (const o of orte) {
    const k = Math.floor(o.lat * 10) + ':' + Math.floor(o.lon * 10);
    if (!r.has(k)) r.set(k, []);
    r.get(k).push(o);
  }
  return r;
}

export function distanzKm(aLat, aLon, bLat, bLon) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Nächster PLZ-Ort zu einer Koordinate (Suche im 0,1°-Raster, bis ca. 30 km).
export function naechsterOrt(raster, lat, lon, kandidaten) {
  let best = null, bestD = Infinity;
  const pruefe = (o) => {
    const d = distanzKm(lat, lon, o.lat, o.lon);
    if (d < bestD) { bestD = d; best = o; }
  };
  if (kandidaten) kandidaten.forEach(pruefe);
  else {
    const la = Math.floor(lat * 10), lo = Math.floor(lon * 10);
    for (let r = 0; r <= 3 && !best; r++) {
      for (let i = la - r; i <= la + r; i++)
        for (let j = lo - r; j <= lo + r; j++)
          (raster.get(i + ':' + j) || []).forEach(pruefe);
    }
  }
  return best ? { ort: best, km: bestD } : null;
}
