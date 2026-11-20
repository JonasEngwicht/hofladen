// Gemeinsame Logik für Worker und Skripte: Einträge nachschlagen (stabile ID, Slug, alte Slugs),
// öffentliche Daten für das Bearbeiten-Formular und der Outreach-Export als CSV.
// EINTRAEGE (src/generated/eintraege.json) ist eine Liste von Zeilen, erzeugt in scripts/build/abschluss.mjs:
//   0 lat, 1 lon, 2 slug, 3 titel, 4 art, 5 ortAnzeige, 6 oeffnungszeiten (OSM), 7 hofladen (1/0), 8 adresse,
//   9 telefon, 10 website, 11 kategorien (Buchstaben, Reihenfolge wie kategorien.json), 12 bio, 13 oeffnungszeiten_text,
//   14 sonntags offen, 15 stabile ID, 16 name, 17 strasse, 18 plz, 19 ort, 20 email, 21 zahlung, 22 beschreibung,
//   23 fotos (Anzahl), 24 vollständig %, 25 fehlende Felder (Buchstaben, Reihenfolge wie vollstaendigkeit.json),
//   26 Bundesland, 27 mit Kindern, 28 Verbände, 29 Haltestelle in der Nähe

export const KAT_BUCHSTABEN = 'abcdefghijklmnopqrstuvwxyz';
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

// Fehlende Felder als Schlüssel (z. B. ['telefon', 'zeiten'])
export const fehlendeFelder = (e, felderLabels) => [...(e[25] || '')].map((c) => felderLabels[KAT_BUCHSTABEN.indexOf(c)]?.[0]).filter(Boolean);

export function oeffentlich(e, kategorien, felderLabels) {
  const labels = new Map(felderLabels);
  const fehlt = fehlendeFelder(e, felderLabels);
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
      fehlendeFelder(e, felderLabels).map((k) => labels.get(k) || k).join(', ')]);
  }
  return '﻿' + zeilen.map((z) => z.map(csvFeld).join(';')).join('\r\n') + '\r\n';
}
