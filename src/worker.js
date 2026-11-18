// Cloudflare Worker für hofladenliste.de
//  /suche?plz=12345  → 302 auf die Seite des passenden Landkreises
//  /plz/12345        → wie oben (kurze, teilbare URL)
//  /api/umkreis?plz=12345 oder ?lat=..&lon=..  → nächste Einträge als JSON
// Alles andere liefert die statischen Seiten aus public/ (über env.ASSETS).
import PLZ from './generated/plz.json';
import EINTRAEGE from './generated/eintraege.json';
import KATEGORIEN from './generated/kategorien.json';

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
  const produkte = (url.searchParams.get('produkt') || '').split(',').map((x) => KAT_BUCHSTABEN[KATEGORIEN.indexOf(x)]).filter(Boolean);
  const treffer = [];
  for (const e of EINTRAEGE) {
    if (typ === 'hofladen' && !e[7]) continue;
    if (typ === 'automat' && e[7]) continue;
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return weiter(url.toString(), 301);
    }
    if (url.pathname === '/suche') return sucheWeiterleitung(url.searchParams.get('plz'), url.searchParams.getAll('produkt').flatMap((x) => x.split(',')), env, ctx, request);
    const m = url.pathname.match(/^\/plz\/(\d{5})\/?$/);
    if (m) return sucheWeiterleitung(m[1], [], env, ctx, request);
    if (url.pathname === '/api/umkreis') return umkreis(url, env, ctx, request);
    if (url.pathname === '/api/eintraege') return eintraegeNachSlug(url);
    return env.ASSETS.fetch(request);
  },
};
