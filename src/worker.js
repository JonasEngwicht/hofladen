// Cloudflare Worker für hofladenliste.de
//  /suche?plz=12345  → 302 auf die Seite des passenden Landkreises
//  /suche?q=Tettnang → 302 auf die Ortsseite (oder Kreisseite), bei mehreren gleichnamigen Orten zur Auswahl
//  /plz/12345        → wie oben (kurze, teilbare URL)
//  /api/orte?q=Tet   → Vorschläge für Ortsnamen
//  /api/umkreis?plz=12345 oder ?lat=..&lon=..  → nächste Einträge als JSON
// Seiten: Dateien wie /style.css liefert Cloudflare direkt aus. HTML-Seiten (/pfad/ → /pfad/index.html)
// laufen über seiteAusliefern(): dort entstehen 301 (Schrägstrich, Umlaute, verschobene Seiten),
// 410 (entfernte Höfe) und 404.
import PLZ from './generated/plz.json';
import EINTRAEGE from './generated/eintraege.json';
import KATEGORIEN from './generated/kategorien.json';
import ORTE from './generated/orte.json';
import ROUTEN from './generated/routen.json';

const KAT_BUCHSTABEN = 'abcdefghijklmnop';

function distanzKm(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function weiter(url, status = 302) {
  return new Response(null, { status, headers: { Location: url, 'Cache-Control': 'no-store' } });
}

function json(daten, status = 200) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

// Suchstatistik: nur Tageszähler je PLZ/Kreis/Produkt in D1 – keine IP, kein Gerät, keine Uhrzeit.
const BOT = /bot|crawl|spider|slurp|preview|fetch|monitor|curl|wget|python|headless/i;
function zaehle(env, ctx, request, { plz, kreis = '', art, produkt = '' }) {
  if (!env.STATS || !ctx || BOT.test(request.headers.get('user-agent') || '')) return;
  const tag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  ctx.waitUntil(env.STATS.prepare(
    `INSERT INTO suchen (tag, plz, kreis, art, produkt, anzahl) VALUES (?1, ?2, ?3, ?4, ?5, 1)
     ON CONFLICT (tag, plz, art, produkt) DO UPDATE SET anzahl = anzahl + 1`,
  ).bind(tag, String(plz).slice(0, 5), kreis, art, produkt).run().catch(() => {}));
}

function sucheWeiterleitung(plz, produkte = [], env, ctx, request) {
  const p = (plz || '').replace(/\D/g, '');
  const eintrag = /^\d{5}$/.test(p) ? PLZ[p] : null;
  const prod = produkte.filter((x) => KATEGORIEN.includes(x));
  if (/^\d{5}$/.test(p)) zaehle(env, ctx, request, { plz: p, kreis: eintrag ? eintrag[2] : '', art: eintrag ? 'plz' : 'unbekannt', produkt: prod.sort().join(',') });
  if (!eintrag) return weiter(`/?fehler=plz&plz=${encodeURIComponent(p)}`);
  return weiter(`${eintrag[2]}?plz=${p}${prod.length ? `&produkt=${prod.join(',')}` : ''}`);
}

// ---------- Ortsnamen ----------
const norm = (s) => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/\bst\.\s*/g, 'sankt ').replace(/[^a-z0-9]+/g, ' ').trim();
let ORT_INDEX = null;
function ortIndex() {
  if (ORT_INDEX) return ORT_INDEX;
  const zahl = new Map();
  for (const o of ORTE.o) zahl.set(o[0], (zahl.get(o[0]) || 0) + 1);
  ORT_INDEX = ORTE.o.map(([name, plz, ki, pfad, groesse]) => {
    const [kreisPfad, kreis] = ORTE.k[ki];
    return { name, plz, kreis, kreisPfad, pfad, groesse, n: norm(name), kern: norm(name.replace(/\s*\(.*\)\s*$/, '')), kn: norm(kreis), doppelt: zahl.get(name) > 1 };
  });
  return ORT_INDEX;
}
const ortZiel = (o) => `${o.pfad || o.kreisPfad}?plz=${o.plz}`;
const ortAusgabe = (o) => ({ name: o.name, kreis: o.kreis, plz: o.plz, wert: o.doppelt ? `${o.name}, ${o.kreis}` : o.name });

// Liefert alle passenden Orte; eindeutig = alle Treffer liegen im selben Kreis
function ortSuche(q) {
  // "Name, Kreis" (aus den Vorschlägen) eindeutig auflösen
  const idx = ortIndex();
  let name = q, kreis = '';
  const komma = q.lastIndexOf(',');
  if (komma > 0) {
    const k = norm(q.slice(komma + 1));
    // Nur abtrennen, wenn der Teil nach dem Komma ein Kreis ist (Ortsnamen enthalten selbst Kommas)
    if (k && idx.some((o) => o.kn === k)) { name = q.slice(0, komma); kreis = k; }
  }
  const n = norm(name);
  if (n.length < 2) return { treffer: [], eindeutig: false };
  // Ganze Wörter: "Forst" findet Forst, Forst (Lausitz), Forst an der Weinstraße
  let treffer = idx.filter((o) => o.n === n || o.kern === n || o.n.startsWith(n + ' '));
  let wort = treffer.length > 0;
  if (!wort) treffer = idx.filter((o) => o.n.startsWith(n));
  if (kreis) { const k = treffer.filter((o) => o.kn === kreis); if (k.length) treffer = k; }
  const voll = treffer.filter((o) => o.n === n);
  if (kreis && voll.length) treffer = voll;
  treffer.sort((a, b) => (b.n === n) - (a.n === n) || b.groesse - a.groesse || (b.pfad ? 1 : 0) - (a.pfad ? 1 : 0) || a.name.length - b.name.length || a.name.localeCompare(b.name, 'de') || a.kreis.localeCompare(b.kreis, 'de'));
  let eindeutig = treffer.length > 0 && new Set(treffer.map((o) => o.kreisPfad)).size === 1;
  // Eine Großstadt schlägt kleine Namensvettern: "Hamburg" → Hamburg, "Frankfurt" → Frankfurt am Main
  if (!eindeutig && treffer.length > 1) {
    const top = treffer.reduce((a, b) => (b.groesse > a.groesse ? b : a));
    const zweit = Math.max(0, ...treffer.filter((o) => o.kreisPfad !== top.kreisPfad).map((o) => o.groesse));
    if (top.groesse >= 10 && top.groesse >= 5 * zweit) { treffer = treffer.filter((o) => o.kreisPfad === top.kreisPfad); eindeutig = true; }
  }
  // Gleicher Name mehrfach im selben Kreis (Ortsteile): der Eintrag mit eigener Ortsseite gewinnt
  if (eindeutig) treffer.sort((a, b) => (b.n === n) - (a.n === n) || (b.pfad ? 1 : 0) - (a.pfad ? 1 : 0) || b.groesse - a.groesse);
  return { treffer, eindeutig };
}

function orteVorschlaege(url) {
  const q = (url.searchParams.get('q') || '').slice(0, 60);
  const { treffer } = ortSuche(q);
  const alle = url.searchParams.get('alle') === '1';
  return json({ treffer: treffer.slice(0, alle ? 40 : 8).map(ortAusgabe) });
}

function suche(url, env, ctx, request) {
  const q = (url.searchParams.get('q') ?? url.searchParams.get('plz') ?? '').trim().slice(0, 60);
  const produkte = url.searchParams.getAll('produkt').flatMap((x) => x.split(','));
  const ziffern = q.match(/\b\d{5}\b/);
  if (ziffern || /^[\d\s]+$/.test(q)) return sucheWeiterleitung(ziffern ? ziffern[0] : q, produkte, env, ctx, request);
  const { treffer, eindeutig } = ortSuche(q);
  if (eindeutig) {
    const o = treffer[0];
    const prod = produkte.filter((x) => KATEGORIEN.includes(x));
    zaehle(env, ctx, request, { plz: o.plz, kreis: o.kreisPfad, art: 'ort', produkt: prod.sort().join(',') });
    return weiter(`${ortZiel(o)}${prod.length ? `&produkt=${prod.join(',')}` : ''}`);
  }
  if (!treffer.length) zaehle(env, ctx, request, { plz: '', art: 'ort-unbekannt' });
  return weiter(`/?fehler=${treffer.length ? 'ort' : 'ort-unbekannt'}&q=${encodeURIComponent(q)}`);
}

function umkreis(url, env, ctx, request) {
  const plz = (url.searchParams.get('plz') || '').replace(/\D/g, '');
  let lat = parseFloat(url.searchParams.get('lat'));
  let lon = parseFloat(url.searchParams.get('lon'));
  let ort = null;
  if (plz) {
    const e = PLZ[plz];
    if (!e) return json({ fehler: 'PLZ unbekannt' }, 404);
    [lat, lon] = e; ort = { plz, name: e[3], kreisPfad: e[2], lat, lon };
  } else if (!(lat >= 47 && lat <= 56 && lon >= 5 && lon <= 16)) {
    return json({ fehler: 'plz oder lat/lon angeben' }, 400);
  } else {
    // Nächsten PLZ-Ort für die Anzeige bestimmen
    let best = Infinity;
    for (const [p, e] of Object.entries(PLZ)) {
      const d = distanzKm(lat, lon, e[0], e[1]);
      if (d < best) { best = d; ort = { plz: p, name: e[3], kreisPfad: e[2], lat, lon }; }
    }
    const prodStat = (url.searchParams.get('produkt') || '').split(',').filter((x) => KATEGORIEN.includes(x)).sort().join(',');
    zaehle(env, ctx, request, { plz: ort.plz, kreis: ort.kreisPfad, art: 'standort', produkt: prodStat });
  }
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '12', 10)));
  const radius = Math.min(100, Math.max(1, parseFloat(url.searchParams.get('radius') || '40')));
  const typ = url.searchParams.get('typ');
  const bio = url.searchParams.get('bio') === '1';
  const sonntag = url.searchParams.get('sonntag') === '1';
  const arten = (url.searchParams.get('art') || '').split(',').filter(Boolean);
  const produkte = (url.searchParams.get('produkt') || '').split(',').map((x) => KAT_BUCHSTABEN[KATEGORIEN.indexOf(x)]).filter(Boolean);
  const treffer = [];
  for (const e of EINTRAEGE) {
    if (typ === 'hofladen' && !e[7]) continue;
    if (typ === 'automat' && e[7]) continue;
    if (bio && !e[12]) continue;
    if (arten.length && !arten.includes(e[4])) continue;
    if (sonntag && !e[14]) continue;
    if (produkte.length && !produkte.every((b) => e[11].includes(b))) continue;
    if (Math.abs(e[0] - lat) > radius / 100 || Math.abs(e[1] - lon) > radius / 60) continue;
    const km = distanzKm(lat, lon, e[0], e[1]);
    if (km <= radius) treffer.push([km, e]);
  }
  treffer.sort((a, b) => a[0] - b[0]);
  return json({
    ort,
    anzahl: treffer.length,
    ergebnisse: treffer.slice(0, limit).map(([km, e]) => aufbereiten(e, Math.round(km * 10) / 10)),
  });
}

function aufbereiten(e, km = null) {
  return {
    km, pfad: `/hof/${e[2]}/`, slug: e[2], titel: e[3], art: e[4], ort: e[5],
    oh: e[6] || null, typ: e[7] ? 'hofladen' : 'automat', adresse: e[8], telefon: e[9] || null, website: e[10] || null,
    kat: [...e[11]].map((b) => KATEGORIEN[KAT_BUCHSTABEN.indexOf(b)]), bio: !!e[12], ohText: e[13] || null, lat: e[0], lon: e[1],
  };
}

// Merkliste: Einträge zu gemerkten Slugs (max. 100), Reihenfolge wie angefragt
let SLUG_INDEX = null;
function eintraegeNachSlug(url) {
  SLUG_INDEX ??= new Map(EINTRAEGE.map((e) => [e[2], e]));
  const slugs = (url.searchParams.get('slugs') || '').split(',').map((x) => x.trim()).filter((x) => /^[a-z0-9-]{1,120}$/.test(x)).slice(0, 100);
  const gefunden = slugs.map((x) => SLUG_INDEX.get(x)).filter(Boolean).map((e) => aufbereiten(e));
  const vorhanden = new Set(gefunden.map((e) => e.slug));
  return json({ ergebnisse: gefunden, unbekannt: slugs.filter((x) => !vorhanden.has(x)) });
}

// ---------- HTML-Seiten, Weiterleitungen, 410/404 ----------
const ENTFERNT = new Set(ROUTEN.entfernt);
function normalisiere(pfad) {
  let p = pfad;
  try { p = decodeURIComponent(p); } catch {}
  p = p.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[\s_+]+/g, '-').replace(/\/{2,}/g, '/').replace(/\/index\.html?$/, '/');
  if (!p.endsWith('/') && !/\.[a-z0-9]{2,5}$/.test(p)) p += '/';
  return p;
}
async function seiteLaden(env, url, pfad, request) {
  const r = await env.ASSETS.fetch(new Request(new URL(pfad === '/' ? '/index.html' : `${pfad}index.html`, url), { method: request.method, headers: request.headers }));
  return r.status === 200 || r.status === 304 ? r : null;
}
async function fehlerSeite(env, url, status) {
  const r = await env.ASSETS.fetch(new URL('/404.html', url));
  return new Response(r.body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
const dauerhaft = (url, pfad) => new Response(null, { status: 301, headers: { Location: pfad + url.search, 'Cache-Control': 'public, max-age=86400' } });

async function seiteAusliefern(request, env, url) {
  const pfad = url.pathname;
  const n = normalisiere(pfad);
  // Exakt passende Seite in kanonischer Schreibweise
  if (n === pfad && pfad.endsWith('/') && !ROUTEN.umleitungen[pfad]) {
    const r = await seiteLaden(env, url, pfad, request);
    if (r) return r;
  }
  // Abweichende Schreibweise (ohne Schrägstrich, index.html, Großbuchstaben, Umlaute …)
  if (ROUTEN.umleitungen[n]) return dauerhaft(url, ROUTEN.umleitungen[n]);
  if (ENTFERNT.has(n)) return fehlerSeite(env, url, 410);
  if (n !== pfad && n.endsWith('/') && await seiteLaden(env, url, n, new Request(url, { method: 'HEAD' }))) return dauerhaft(url, n);
  if (/\.[a-z0-9]{2,5}$/i.test(pfad)) return env.ASSETS.fetch(request);
  return fehlerSeite(env, url, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return weiter(url.toString(), 301);
    }
    if (url.pathname === '/suche') return suche(url, env, ctx, request);
    const m = url.pathname.match(/^\/plz\/(\d{5})\/?$/);
    if (m) return sucheWeiterleitung(m[1], [], env, ctx, request);
    if (url.pathname === '/api/umkreis') return umkreis(url, env, ctx, request);
    if (url.pathname === '/api/eintraege') return eintraegeNachSlug(url);
    if (url.pathname === '/api/orte') return orteVorschlaege(url);
    return seiteAusliefern(request, env, url);
  },
};
