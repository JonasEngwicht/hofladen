#!/usr/bin/env node
// Liest Öffnungszeiten (und fehlende Telefon/E-Mail) von den eigenen Websites der Höfe.
// Nur Einträge mit Website, aber ohne Öffnungszeiten. Ergebnisse landen in data/ergaenzungen.json
// (füllen im Build nur leere Felder). Respektiert robots.txt, wenige parallele Abrufe, kurze Timeouts.
//
// Aufruf: node scripts/oeffnungszeiten-websites.mjs [maxAnzahl]
// Test des Parsers ohne Netz: node scripts/oeffnungszeiten-websites.mjs --test
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse as ohParse } from '../static/oh.js';

const UA = 'HofladenlisteBot/1.0 (+https://hofladenliste.de/mitmachen/; Öffnungszeiten für das Hofladen-Verzeichnis)';
const ERG = 'data/ergaenzungen.json';
const NEU_PRUEFEN_TAGE = 90;
// Verzeichnisse und soziale Netzwerke: dort stehen keine Betreiberangaben bzw. Abruf nicht erlaubt
const FREMD = /(^|\.)(facebook|instagram|google|goo\.gl|hofladen-bauernladen|regiomat|milchtankstellen|mein-bauernhof|wikipedia|youtube|linkedin|tiktok|ebay|kleinanzeigen)\./i;

// ---------- Text-Parser für deutsche Öffnungszeiten ----------
const TAG = {
  montag: 0, mo: 0, dienstag: 1, di: 1, mittwoch: 2, mi: 2, donnerstag: 3, do: 3,
  freitag: 4, fr: 4, samstag: 5, sa: 5, sonnabend: 5, sonntag: 6, so: 6,
};
const OSM_TAG = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const TAG_RE = '(?:montags?|dienstags?|mittwochs?|donnerstags?|freitags?|samstags?|sonnabends?|sonntags?|mo|di|mi|do|fr|sa|so)\\.?';
const ZEIT_RE = '(?:2[0-4]|[01]?\\d)(?:[:.][0-5]\\d)?(?!\\d)';
const SPANNE_RE = `${ZEIT_RE}\\s*(?:-|bis)\\s*${ZEIT_RE}`;
const TAGSPEC_RE = `(?:täglich|${TAG_RE}(?:\\s*(?:-|bis)\\s*${TAG_RE})?(?:\\s*(?:,|und|&|\\+)\\s*${TAG_RE}(?:\\s*(?:-|bis)\\s*${TAG_RE})?)*)`;
const REGEL = new RegExp(`(${TAGSPEC_RE})\\s*[:.]?\\s*((?:${SPANNE_RE}(?:\\s*uhr)?(?:\\s*(?:,|und|&|/|;)?\\s*(?=${ZEIT_RE}\\s*(?:-|bis))\\s*)?)+|geschlossen|ruhetag|zu)`, 'gi');
const MONATE = /\b(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|saison|sommer|winter|ferien|erntezeit|spargelzeit)\b/i;

function tagIndex(w) { return TAG[w.toLowerCase().replace(/\.$/, '').replace(/s$/, '')] ?? TAG[w.toLowerCase().replace(/\.$/, '')]; }
function zeit(z) {
  const m = z.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (!m) return null;
  const h = +m[1], min = +(m[2] || 0);
  if (h > 24 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
function tageAus(spec) {
  const s = spec.toLowerCase();
  if (s.startsWith('täglich')) return [0, 1, 2, 3, 4, 5, 6];
  const tage = new Set();
  for (const teil of s.split(/\s*(?:,|und|&|\+)\s*/)) {
    const [a, b] = teil.split(/\s*(?:-|bis)\s*/);
    const ia = tagIndex(a), ib = b ? tagIndex(b) : ia;
    if (ia == null || ib == null) return null;
    for (let i = ia; ; i = (i + 1) % 7) { tage.add(i); if (i === ib) break; }
  }
  return [...tage];
}

export function textZuOsm(text) {
  const t = text.replace(/[–—‒−]/g, '-').replace(/\s+/g, ' ');
  const woche = Array.from({ length: 7 }, () => null);
  let treffer = 0;
  for (const m of t.matchAll(REGEL)) {
    const tage = tageAus(m[1]);
    if (!tage) continue;
    let intervalle;
    if (/^(geschlossen|ruhetag|zu)$/i.test(m[2].trim())) intervalle = [];
    else {
      intervalle = [];
      for (const sp of m[2].matchAll(new RegExp(`(${ZEIT_RE})\\s*(?:-|bis)\\s*(${ZEIT_RE})`, 'g'))) {
        const von = zeit(sp[1]), bis = zeit(sp[2]);
        if (!von || !bis || bis <= von) return null; // unplausibel → lieber nichts
        intervalle.push(`${von}-${bis}`);
      }
      if (!intervalle.length) continue;
    }
    for (const d of tage) woche[d] = intervalle;
    treffer++;
  }
  if (!treffer || woche.every((w) => !w || !w.length)) return null;
  // Gleiche aufeinanderfolgende Tage zusammenfassen
  const regeln = [];
  for (let i = 0; i < 7;) {
    const w = woche[i];
    if (!w || !w.length) { i++; continue; }
    let j = i;
    while (j + 1 < 7 && woche[j + 1] && woche[j + 1].join() === w.join()) j++;
    regeln.push(`${OSM_TAG[i]}${j > i ? `-${OSM_TAG[j]}` : ''} ${w.join(',')}`);
    i = j + 1;
  }
  const oh = regeln.join('; ');
  return plausibel(oh) ? oh : null;
}

// Leere oder unsinnige Spannen (z. B. 00:00-00:00 aus Website-Baukästen) verwerfen
export function plausibel(oh) {
  if (!oh || !ohParse(oh)) return false;
  for (const m of oh.matchAll(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/g)) {
    const von = +m[1] * 60 + +m[2], bis = +m[3] * 60 + +m[4];
    if (bis <= von && !(bis === 0 && von > 0)) return false;
  }
  return true;
}

// ---------- HTML-Auswertung ----------
function htmlZuText(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|section|article|dt|dd)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&ndash;|&mdash;/g, '-').replace(/&amp;/g, '&').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü').replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n');
}

const SCHEMA_TAG = { monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th', friday: 'Fr', saturday: 'Sa', sunday: 'Su' };
function ausJsonLd(html) {
  const ergebnis = {};
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let d; try { d = JSON.parse(m[1].trim()); } catch { continue; }
    const stapel = [d];
    while (stapel.length) {
      const o = stapel.pop();
      if (!o || typeof o !== 'object') continue;
      if (Array.isArray(o)) { stapel.push(...o); continue; }
      if (o.openingHours && !ergebnis.oeffnungszeiten) {
        const oh = (Array.isArray(o.openingHours) ? o.openingHours : [o.openingHours]).join('; ');
        if (plausibel(oh)) ergebnis.oeffnungszeiten = oh;
      }
      if (o.openingHoursSpecification && !ergebnis.oeffnungszeiten) {
        const woche = Array.from({ length: 7 }, () => []);
        for (const s of [].concat(o.openingHoursSpecification)) {
          if (!s || s.validFrom || s.validThrough) continue;
          const von = zeit(String(s.opens || '').slice(0, 5)), bis = zeit(String(s.closes || '').slice(0, 5));
          if (!von || !bis || bis <= von) continue;
          for (const t of [].concat(s.dayOfWeek || [])) {
            const k = String(t).split('/').pop().toLowerCase();
            const i = OSM_TAG.indexOf(SCHEMA_TAG[k]);
            if (i >= 0) woche[i].push(`${von}-${bis}`);
          }
        }
        const text = woche.map((w, i) => (w.length ? `${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i]} ${w.join(', ')}` : '')).filter(Boolean).join('; ');
        const oh = text && textZuOsm(text);
        if (oh) ergebnis.oeffnungszeiten = oh;
      }
      if (o.telephone && !ergebnis.telefon) ergebnis.telefon = String(o.telephone).trim();
      if (o.email && !ergebnis.email) ergebnis.email = String(o.email).replace(/^mailto:/, '').trim();
      for (const v of Object.values(o)) if (v && typeof v === 'object') stapel.push(v);
    }
  }
  return ergebnis;
}

function ausText(html) {
  const text = htmlZuText(html);
  // Seiten mit mehreren Adressen (Marktstände, Filialen): Zeiten gehören evtl. zu einem anderen Standort
  const plzSet = new Set([...text.matchAll(/\b(\d{5})\s+[A-ZÄÖÜ][a-zäöüß]/g)].map((m) => m[1]));
  if (plzSet.size > 1) return { mehrereStandorte: true };
  const i = text.search(/öffnungszeit|oeffnungszeit|geöffnet|verkaufszeit|ladenöffnung/i);
  if (i < 0) return {};
  const fenster = text.slice(i, i + 700);
  if (MONATE.test(fenster)) return { saisonal: true }; // saisonale Zeiten nicht raten
  const oh = textZuOsm(fenster);
  return oh ? { oeffnungszeiten: oh } : {};
}

function kontakteAusHtml(html) {
  const r = {};
  const tel = html.match(/href=["']tel:([+\d][\d\s/()-]{5,})["']/i);
  if (tel) r.telefon = tel[1].replace(/\s+/g, ' ').trim();
  const mail = html.match(/href=["']mailto:([^"'?]+@[^"'?]+)["'?]/i);
  if (mail) r.email = decodeURIComponent(mail[1]).trim();
  return r;
}

// ---------- Netz ----------
async function hole(url, ms = 15000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const typ = r.headers.get('content-type') || '';
  if (!/html/i.test(typ)) throw new Error(`kein HTML (${typ})`);
  const text = await r.text();
  return { url: r.url, html: text.slice(0, 1_500_000) };
}
const robotsCache = new Map();
async function erlaubt(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let regeln = [];
    try {
      const r = await fetch(`${u.origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        let aktiv = false;
        for (const zeile of (await r.text()).split('\n')) {
          const [k, ...v] = zeile.split(':'); const wert = v.join(':').trim(); const key = k.trim().toLowerCase();
          if (key === 'user-agent') aktiv = wert === '*' || /hofladenliste/i.test(wert);
          else if (aktiv && key === 'disallow' && wert) regeln.push(wert);
        }
      }
    } catch { /* keine robots.txt → erlaubt */ }
    robotsCache.set(u.origin, regeln);
  }
  return !robotsCache.get(u.origin).some((d) => u.pathname.startsWith(d));
}

async function pruefeWebsite(website) {
  let start = website.trim();
  if (!/^https?:\/\//i.test(start)) start = `https://${start}`;
  if (!(await erlaubt(start))) return { fehler: 'robots.txt' };
  const seiten = [];
  const erste = await hole(start);
  seiten.push(erste);
  // Unterseiten mit passenden Namen (max. 3, gleiche Domain)
  const basis = new URL(erste.url);
  const links = [...erste.html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .filter(([, href, txt]) => /öffnungszeit|oeffnungszeit|kontakt|hofladen|anfahrt|laden|verkauf|impressum/i.test(href + ' ' + txt.replace(/<[^>]+>/g, '')))
    .map(([, href]) => { try { return new URL(href, basis).toString(); } catch { return null; } })
    .filter((x) => x && new URL(x).host === basis.host && !/\.(pdf|jpe?g|png|zip)$/i.test(x));
  for (const link of [...new Set(links)].slice(0, 3)) {
    try { if (await erlaubt(link)) seiten.push(await hole(link)); } catch { /* egal */ }
  }
  const ergebnis = {};
  let saisonal = false;
  for (const s of seiten) {
    const ld = ausJsonLd(s.html);
    if (ld.oeffnungszeiten && !ergebnis.oeffnungszeiten) Object.assign(ergebnis, { oeffnungszeiten: ld.oeffnungszeiten, quelle: s.url, methode: 'schema.org' });
    const tx = ausText(s.html);
    if (tx.saisonal) saisonal = true;
    if (tx.oeffnungszeiten && !ergebnis.oeffnungszeiten) Object.assign(ergebnis, { oeffnungszeiten: tx.oeffnungszeiten, quelle: s.url, methode: 'text' });
    const k = { ...kontakteAusHtml(s.html), ...Object.fromEntries(Object.entries(ld).filter(([f]) => f !== 'oeffnungszeiten')) };
    for (const f of ['telefon', 'email']) if (k[f] && !ergebnis[f]) { ergebnis[f] = k[f]; ergebnis.quelle ??= s.url; }
  }
  if (saisonal && !ergebnis.oeffnungszeiten) ergebnis.hinweis = 'saisonal';
  return ergebnis;
}

// ---------- Selbsttest ----------
if (process.argv[2] === '--test') {
  const faelle = [
    ['Öffnungszeiten: Mo - Fr 9 - 18 Uhr, Sa 8 - 13 Uhr', 'Mo-Fr 09:00-18:00; Sa 08:00-13:00'],
    ['Öffnungszeiten\nMontag bis Freitag: 09:00 – 12:30 und 14:30 – 18:00 Uhr\nSamstag: 08:00 – 12:00 Uhr\nSonntag geschlossen', 'Mo-Fr 09:00-12:30,14:30-18:00; Sa 08:00-12:00'],
    ['Hofladen geöffnet: Di, Do und Fr 14.00 - 18.00 Uhr; Sa 9.00 - 12.00 Uhr', 'Tu 14:00-18:00; Th-Fr 14:00-18:00; Sa 09:00-12:00'],
    ['Öffnungszeiten: täglich 7 - 21 Uhr', 'Mo-Su 07:00-21:00'],
    ['Öffnungszeiten: Mittwoch 15-18, Samstag 9-12', 'We 15:00-18:00; Sa 09:00-12:00'],
    ['Öffnungszeiten: nach Vereinbarung', null],
  ];
  let ok = 0;
  for (const [ein, soll] of faelle) {
    const ist = textZuOsm(ein);
    const pass = ist === soll;
    if (pass) ok++;
    console.log(pass ? 'OK ' : 'FEHLER', JSON.stringify(ein.slice(0, 50)), '→', ist, pass ? '' : `(erwartet ${soll})`);
  }
  console.log('Saison erkannt:', ausText('<h2>Öffnungszeiten</h2><p>April bis Juni: Mo-Sa 9-18 Uhr</p>'));
  console.log('JSON-LD:', ausJsonLd('<script type="application/ld+json">{"@type":"Store","openingHoursSpecification":[{"dayOfWeek":["https://schema.org/Monday","Tuesday"],"opens":"09:00","closes":"18:00"},{"dayOfWeek":"Saturday","opens":"08:00:00","closes":"12:00:00"}],"telephone":"+49 123"}</script>'));
  process.exit(ok === faelle.length ? 0 : 1);
}

// ---------- Hauptlauf ----------
const max = parseInt(process.argv[2] || '5000', 10);
const osm = JSON.parse(readFileSync('data/osm-eintraege.json', 'utf8'));
const erg = existsSync(ERG) ? JSON.parse(readFileSync(ERG, 'utf8')) : {};
const heute = new Date().toISOString().slice(0, 10);
const alt = (d) => !d || (Date.now() - Date.parse(d)) / 864e5 > NEU_PRUEFEN_TAGE;

// Websites, die mehrere Einträge teilen (Ketten, mehrere Verkaufsstände): Text-Zeiten nicht übertragen
const proSeite = new Map();
for (const e of osm) if (e.website) { const k = e.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').toLowerCase(); proSeite.set(k, (proSeite.get(k) || 0) + 1); }

const kandidaten = osm.filter((e) => e.website && !e.oeffnungszeiten && alt(erg[e.osm]?.stand || erg[e.osm]?.geprueft)
  && !FREMD.test(e.website.replace(/^https?:\/\//, ''))).slice(0, max);
console.log(`${kandidaten.length} Websites werden geprüft.`);

const stat = { zeiten: 0, schema: 0, text: 0, saisonal: 0, kontakt: 0, fehler: 0, leer: 0 };
let index = 0;
async function arbeiter() {
  while (index < kandidaten.length) {
    const e = kandidaten[index++];
    try {
      const r = await pruefeWebsite(e.website);
      const domain = e.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').toLowerCase();
      if (r.oeffnungszeiten && r.methode === 'text' && proSeite.get(domain) > 1) { delete r.oeffnungszeiten; stat.geteilt = (stat.geteilt || 0) + 1; }
      const eintrag = {};
      if (r.oeffnungszeiten) { eintrag.oeffnungszeiten = r.oeffnungszeiten; eintrag.methode = r.methode; stat.zeiten++; stat[r.methode === 'schema.org' ? 'schema' : 'text']++; }
      if (r.telefon && !e.telefon) eintrag.telefon = r.telefon;
      if (r.email && !e.email) eintrag.email = r.email;
      if (r.hinweis === 'saisonal') stat.saisonal++;
      if (Object.keys(eintrag).length) {
        if (!eintrag.oeffnungszeiten) stat.kontakt++;
        erg[e.osm] = { ...eintrag, quelle: r.quelle || e.website, stand: heute };
      } else {
        erg[e.osm] = { geprueft: heute, ...(r.hinweis ? { hinweis: r.hinweis } : {}), ...(r.fehler ? { fehler: r.fehler } : {}) };
        stat.leer++;
      }
    } catch (err) {
      erg[e.osm] = { geprueft: heute, fehler: String(err.message || err).slice(0, 60) };
      stat.fehler++;
    }
    if (index % 50 === 0) console.log(`${index}/${kandidaten.length}`, JSON.stringify(stat));
  }
}
await Promise.all(Array.from({ length: 8 }, arbeiter));
writeFileSync(ERG, JSON.stringify(Object.fromEntries(Object.entries(erg).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n');
console.log('Fertig:', JSON.stringify(stat));
