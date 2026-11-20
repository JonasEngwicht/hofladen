#!/usr/bin/env node
// Probelauf für offene Verwaltungsdaten: vergleicht den bisherigen Stand (data/offene-quellen.json) mit einem Testlauf
// von scripts/import-quellen.mjs und schreibt einen Bericht (Markdown) – ohne Daten zu ändern.
//  a) Ergänzungen: leere Felder bei OSM-Einträgen und bei vorhandenen Einträgen aus offenen Quellen
//  b) neue Einträge: Höfe, die bisher weder in OSM noch in einer offenen Quelle stehen
// Aufruf: node scripts/quellen-probe.mjs <vorher.json> <nachher.json> [<bericht-datensaetze.json>]
import { readFileSync, existsSync } from 'node:fs';
import { rasterIndex, gleicherHof } from './quellen.mjs';

export const FELDER = ['telefon', 'website', 'email', 'facebook', 'instagram', 'strasse', 'oeffnungszeiten_text'];
const NAME = { telefon: 'Telefon', website: 'Website', email: 'E-Mail', facebook: 'Facebook', instagram: 'Instagram', strasse: 'Adresse', oeffnungszeiten_text: 'Öffnungszeiten' };

export function vergleiche(vorher, nachher) {
  const key = (e) => `${e.quelle}/${e.qid}`;
  const vorherIds = new Set(vorher.neu.map(key));
  const vorherIdx = rasterIndex(vorher.neu);
  const erg = { osmNeu: {}, osmErsetzt: {}, osmEintraege: 0, offenEintraege: 0, offenFelder: {}, neu: [], offenTreffer: [], entfernt: [], proDatensatz: {} };
  const zaehle = (o, f) => { o[f] = (o[f] || 0) + 1; };
  const ds = (name) => (erg.proDatensatz[name || 'unbekannt'] ||= { neu: 0, ergaenzt: 0 });

  // a) OSM-Einträge, die jetzt Felder aus Verwaltungsdaten bekommen
  for (const [id, z] of Object.entries(nachher.ergaenzungen || {})) {
    const alt = (vorher.ergaenzungen || {})[id] || {};
    let neuHier = false;
    for (const [f, q] of Object.entries(z.quellen || {})) {
      if (q !== 'kommunal' || (alt.quellen || {})[f] === 'kommunal') continue;
      if (alt[f]) zaehle(erg.osmErsetzt, f); else { zaehle(erg.osmNeu, f); neuHier = true; }
      if (!alt[f]) ds(z.herkunft?.[f]?.datensatz).ergaenzt++;
    }
    if (neuHier) erg.osmEintraege++;
  }
  // Neue Einträge aus Verwaltungsdaten: gleicher Hof schon als offener Eintrag da (→ a) oder wirklich neu (→ b)
  for (const e of nachher.neu) {
    if (e.quelle !== 'kommunal' || vorherIds.has(key(e))) continue;
    const treffer = vorherIdx.nahe(e.lat, e.lon).find((x) => x.quelle !== 'kommunal' && gleicherHof(x, e));
    if (treffer) {
      const felder = FELDER.filter((f) => e[f] && !treffer[f]);
      if (felder.length) {
        erg.offenEintraege++;
        for (const f of felder) zaehle(erg.offenFelder, f);
        erg.offenTreffer.push({ e, treffer, felder });
        ds(e.datensatz).ergaenzt++;
      }
      continue;
    }
    erg.neu.push(e);
    ds(e.datensatz).neu++;
  }
  const nachherIds = new Set(nachher.neu.map(key));
  erg.entfernt = vorher.neu.filter((e) => e.quelle === 'kommunal' && !nachherIds.has(key(e)));
  return erg;
}

function markdown(erg, datensaetze) {
  const summe = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const felder = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${NAME[f] || f} ${n}`).join(', ') || '–';
  const zeile = (e) => `| ${e.name} | ${[e.strasse, e.plz, e.ort || e.ortNah].filter(Boolean).join(', ')} | ${e.datensatz || ''} | ${e.lizenz || ''} |`;
  const out = ['# Probelauf offene Verwaltungsdaten', '',
    `**a) Ergänzungen zu bestehenden Einträgen:** ${erg.osmEintraege + erg.offenEintraege} Einträge`,
    `- OSM-Einträge: ${erg.osmEintraege} (neu gefüllte Felder: ${felder(erg.osmNeu)})`,
    `- Einträge aus anderen offenen Quellen: ${erg.offenEintraege} (Felder: ${felder(erg.offenFelder)})`,
    `- Felder, die bisher aus einer anderen offenen Quelle kamen und künftig aus Verwaltungsdaten: ${summe(erg.osmErsetzt)} (${felder(erg.osmErsetzt)})`,
    '', `**b) Neue Einträge:** ${erg.neu.length}`, '',
    `Bisherige Einträge aus Verwaltungsdaten, die im Testlauf fehlen: ${erg.entfernt.length}`, '',
    '## Je Datensatz', '', '| Datensatz | neu | ergänzt |', '|---|---|---|',
    ...Object.entries(erg.proDatensatz).sort((a, b) => b[1].neu + b[1].ergaenzt - a[1].neu - a[1].ergaenzt).map(([d, n]) => `| ${d} | ${n.neu} | ${n.ergaenzt} |`),
    '', '## Neue Einträge (bis 40)', '', '| Name | Adresse | Datensatz | Lizenz |', '|---|---|---|---|', ...erg.neu.slice(0, 40).map(zeile),
    '', '## Ergänzungen bestehender offener Einträge (bis 20)', '', '| Bestehend | Quelle | ergänzt um |', '|---|---|---|',
    ...erg.offenTreffer.slice(0, 20).map(({ treffer, felder: f }) => `| ${treffer.name} (${treffer.ortNah}) | ${treffer.quelle} | ${f.map((x) => NAME[x]).join(', ')} |`)];
  if (datensaetze) {
    out.push('', '## Gefundene Datensätze', '', '| Datensatz | Herausgeber | Lizenz | Ergebnis | Orte |', '|---|---|---|---|---|');
    for (const b of datensaetze.filter((x) => x.titel)) out.push(`| [${b.titel}](${b.url}) | ${b.herausgeber} | ${b.lizenz || 'nicht offen'} | ${b.ergebnis}${b.ressourcen?.length ? ` (${b.ressourcen.join('; ')})` : ''} | ${b.orte ?? ''} |`);
    const fehler = datensaetze.filter((x) => x.fehler);
    if (fehler.length) out.push('', `Nicht erreichbar: ${fehler.map((f) => `${f.portal} („${f.begriff}“): ${f.fehler}`).join('; ')}`);
  }
  return out.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [v, n, b] = process.argv.slice(2);
  const lies = (p) => JSON.parse(readFileSync(p, 'utf8'));
  process.stdout.write(markdown(vergleiche(lies(v), lies(n)), b && existsSync(b) ? lies(b) : null));
}
