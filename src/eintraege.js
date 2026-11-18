// Gemeinsame Logik für Worker und Skripte: Einträge nachschlagen (stabile ID, Slug, alte Slugs),
// öffentliche Daten für das Bearbeiten-Formular und der Outreach-Export als CSV.
// EINTRAEGE-Zeilen: siehe scripts/build.mjs („Daten für den Worker“).

export const KAT_BUCHSTABEN = 'abcdefghijklmnop';
export const UTM_OUTREACH = 'utm_source=outreach&utm_medium=email';

export function index(eintraege, alteSlugs = {}) {
  const nachSid = new Map(), nachSlug = new Map();
  for (const e of eintraege) { nachSid.set(e[15], e); nachSlug.set(e[2], e); }
  return { nachSid, nachSlug, alteSlugs };
}

// Eingabe: stabile ID, Slug, alter Slug oder eine URL wie https://hofladenliste.de/hof/<slug>/
export function aufloesen(eingabe, { nachSid, nachSlug, alteSlugs }) {
  let x = String(eingabe || '').trim();
  const m = x.match(/\/hof\/([^/?#]+)/);
  if (m) x = m[1];
  x = x.replace(/[/?#].*$/, '').toLowerCase();
  if (!/^[a-z0-9-]{1,120}$/.test(x)) return null;
  return nachSid.get(x) || nachSlug.get(x) || nachSid.get(alteSlugs[x]) || null;
}

export function oeffentlich(e, kategorien, felderLabels) {
  const labels = new Map(felderLabels);
  const fehlt = (e[25] || '').split(',').filter(Boolean);
  return {
    id: e[15], slug: e[2], pfad: `/hof/${e[2]}/`, titel: e[3], name: e[16], art: e[4], typ: e[7] ? 'hofladen' : 'automat',
    strasse: e[17], plz: e[18], ort: e[19], ortAnzeige: e[5], adresse: e[8],
    telefon: e[9], email: e[20], website: e[10], oeffnungszeiten: e[6], oeffnungszeitenText: e[13],
    angebot: [...e[11]].map((b) => kategorien[KAT_BUCHSTABEN.indexOf(b)]), bio: !!e[12],
    zahlung: (e[21] || '').split(',').filter(Boolean), beschreibung: e[22], fotos: e[23],
    vollstaendigkeit: { prozent: e[24], fehlt: fehlt.map((k) => ({ feld: k, label: labels.get(k) || k })) },
  };
}

// Bearbeiten-Links (Kurzlink und Formular-Link) für einen Eintrag
export const links = (domain, e, utm = '') => ({
  detail: `${domain}/hof/${e[2]}/`,
  kurz: `${domain}/hof/${e[15]}/bearbeiten/${utm ? `?${utm}` : ''}`,
  ergaenzen: `${domain}/mitmachen/?eintrag=${e[15]}&aktion=ergaenzen${utm ? `&${utm}` : ''}`,
  uebernehmen: `${domain}/mitmachen/?eintrag=${e[15]}&aktion=uebernehmen${utm ? `&${utm}` : ''}`,
});

const csvFeld = (v) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function outreachCsv(eingaben, idx, domain, felderLabels) {
  const labels = new Map(felderLabels);
  const zeilen = [['Eingabe', 'Slug', 'Stabile ID', 'Name', 'Detail-URL', 'Bearbeiten-Kurzlink', 'Übernehmen-Link', 'Vollständigkeit %', 'Fehlende Felder']];
  for (const eingabe of eingaben.map((x) => x.trim()).filter(Boolean)) {
    const e = aufloesen(eingabe, idx);
    if (!e) { zeilen.push([eingabe, '', '', 'nicht gefunden', '', '', '', '', '']); continue; }
    const l = links(domain, e, UTM_OUTREACH);
    zeilen.push([eingabe, e[2], e[15], e[3], l.detail, l.kurz, l.uebernehmen, e[24],
      (e[25] || '').split(',').filter(Boolean).map((k) => labels.get(k) || k).join(', ')]);
  }
  return '﻿' + zeilen.map((z) => z.map(csvFeld).join(';')).join('\r\n') + '\r\n';
}
