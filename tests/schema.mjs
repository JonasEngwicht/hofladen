// Prüfung strukturierter Daten: Pflichtangaben je Typ und – wenn das Schema.org-Vokabular vorliegt
// (Umgebungsvariable SCHEMAORG_JSONLD, in CI heruntergeladen) – ob jede Eigenschaft zum Typ passt.
import { readFileSync, existsSync } from 'node:fs';

let vokabular = null;
export function ladeVokabular() {
  const datei = process.env.SCHEMAORG_JSONLD;
  if (vokabular || !datei || !existsSync(datei)) return vokabular;
  const graph = JSON.parse(readFileSync(datei, 'utf8'))['@graph'];
  const id = (x) => String(x['@id'] || x).replace(/^schema:/, '');
  const liste = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const oberklassen = new Map(), domaenen = new Map(), werte = new Set();
  for (const n of graph) {
    const typen = liste(n['@type']);
    if (typen.includes('rdfs:Class')) oberklassen.set(id(n), liste(n['rdfs:subClassOf']).map(id));
    if (typen.includes('rdf:Property')) domaenen.set(id(n), liste(n['schema:domainIncludes']).map(id));
    if (!typen.includes('rdfs:Class') && !typen.includes('rdf:Property')) werte.add(id(n));
  }
  vokabular = { oberklassen, domaenen, werte };
  return vokabular;
}
function alleOberklassen(v, typ, out = new Set()) {
  if (out.has(typ)) return out;
  out.add(typ);
  for (const o of v.oberklassen.get(typ) || []) alleOberklassen(v, o, out);
  return out;
}

const absolut = (u) => typeof u === 'string' && /^https:\/\/hofladenliste\.de\//.test(u);
const uhrzeit = /^([01]\d|2[0-3]):[0-5]\d$/;

// Liefert eine Liste von Fehlermeldungen (leer = gültig)
export function pruefe(obj, pfad = '') {
  const f = [];
  const v = ladeVokabular();
  const lauf = (o, wo, wurzel) => {
    if (Array.isArray(o)) return o.forEach((x, i) => lauf(x, `${wo}[${i}]`, false));
    if (!o || typeof o !== 'object') return;
    if (wurzel && o['@context'] !== 'https://schema.org') f.push(`${wo}: @context fehlt`);
    const typ = o['@type'];
    if (typ && v) {
      if (!v.oberklassen.has(typ)) f.push(`${wo}: unbekannter Typ ${typ}`);
      else {
        const ok = alleOberklassen(v, typ);
        for (const k of Object.keys(o)) {
          if (k.startsWith('@')) continue;
          const d = v.domaenen.get(k);
          if (!d) f.push(`${wo}: unbekannte Eigenschaft ${k}`);
          else if (!d.some((x) => ok.has(x))) f.push(`${wo}: ${k} passt nicht zu ${typ}`);
        }
      }
    }
    for (const [k, x] of Object.entries(o)) if (!k.startsWith('@')) lauf(x, `${wo}.${k}`, false);
  };
  lauf(obj, pfad || obj['@type'], true);

  const t = obj['@type'];
  if (t === 'BreadcrumbList') {
    obj.itemListElement.forEach((x, i) => {
      if (x['@type'] !== 'ListItem' || x.position !== i + 1 || !x.name || !absolut(x.item)) f.push(`Breadcrumb ${i + 1} ungültig`);
    });
  } else if (t === 'ItemList') {
    if (obj.numberOfItems !== obj.itemListElement.length) f.push('ItemList: numberOfItems stimmt nicht');
    obj.itemListElement.forEach((x, i) => {
      if (x['@type'] !== 'ListItem' || x.position !== i + 1 || !x.name || !absolut(x.url)) f.push(`ItemList ${i + 1} ungültig`);
    });
  } else if (t === 'Store' || t === 'LocalBusiness') {
    if (!obj.name) f.push('name fehlt');
    if (!absolut(obj.url)) f.push('url fehlt');
    if (obj.address?.['@type'] !== 'PostalAddress' || !obj.address.addressLocality || obj.address.addressCountry !== 'DE') f.push('address unvollständig');
    const g = obj.geo;
    if (g?.['@type'] !== 'GeoCoordinates' || !(g.latitude > 47 && g.latitude < 56 && g.longitude > 5 && g.longitude < 16)) f.push('geo ungültig');
    for (const s of obj.openingHoursSpecification || []) {
      if (s['@type'] !== 'OpeningHoursSpecification' || !uhrzeit.test(s.opens) || !(uhrzeit.test(s.closes) || s.closes === '23:59')) f.push('Öffnungszeit ungültig');
      if (!s.dayOfWeek?.length || !s.dayOfWeek.every((d) => /^https:\/\/schema\.org\/(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$/.test(d))) f.push('dayOfWeek ungültig');
    }
  } else if (t === 'FAQPage') {
    if (!obj.mainEntity?.length) f.push('FAQ ohne Fragen');
    for (const q of obj.mainEntity || []) if (q['@type'] !== 'Question' || !q.name || q.acceptedAnswer?.['@type'] !== 'Answer' || !q.acceptedAnswer.text) f.push('FAQ-Frage ungültig');
  }
  return f;
}
