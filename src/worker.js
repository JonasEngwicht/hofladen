// Cloudflare Worker für hofladenliste.de
//  /suche?plz=12345  → 302 auf die Seite des passenden Landkreises
//  /plz/12345        → wie oben (kurze, teilbare URL)
//  /api/umkreis?plz=12345 oder ?lat=..&lon=..  → nächste Einträge als JSON
// Alles andere liefert die statischen Seiten aus public/ (über env.ASSETS).
import PLZ from './generated/plz.json';
import EINTRAEGE from './generated/eintraege.json';

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

function sucheWeiterleitung(plz) {
  const p = (plz || '').replace(/\D/g, '');
  const eintrag = /^\d{5}$/.test(p) ? PLZ[p] : null;
  if (!eintrag) return weiter(`/?fehler=plz&plz=${encodeURIComponent(p)}`);
  return weiter(`${eintrag[2]}?plz=${p}#naehe`);
}

function umkreis(url) {
  const plz = (url.searchParams.get('plz') || '').replace(/\D/g, '');
  let lat = parseFloat(url.searchParams.get('lat'));
  let lon = parseFloat(url.searchParams.get('lon'));
  let ort = null;
  if (plz) {
    const e = PLZ[plz];
    if (!e) return json({ fehler: 'PLZ unbekannt' }, 404);
    [lat, lon] = e; ort = { plz, name: e[3], kreisPfad: e[2] };
  } else if (!(lat >= 47 && lat <= 56 && lon >= 5 && lon <= 16)) {
    return json({ fehler: 'plz oder lat/lon angeben' }, 400);
  } else {
    // Nächsten PLZ-Ort für die Anzeige bestimmen
    let best = Infinity;
    for (const [p, e] of Object.entries(PLZ)) {
      const d = distanzKm(lat, lon, e[0], e[1]);
      if (d < best) { best = d; ort = { plz: p, name: e[3], kreisPfad: e[2] }; }
    }
  }
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '12', 10)));
  const radius = Math.min(100, Math.max(1, parseFloat(url.searchParams.get('radius') || '40')));
  const typ = url.searchParams.get('typ');
  const treffer = [];
  for (const e of EINTRAEGE) {
    if (typ === 'hofladen' && !e[7]) continue;
    if (typ === 'automat' && e[7]) continue;
    if (Math.abs(e[0] - lat) > radius / 100 || Math.abs(e[1] - lon) > radius / 60) continue;
    const km = distanzKm(lat, lon, e[0], e[1]);
    if (km <= radius) treffer.push([km, e]);
  }
  treffer.sort((a, b) => a[0] - b[0]);
  return json({
    ort,
    anzahl: treffer.length,
    ergebnisse: treffer.slice(0, limit).map(([km, e]) => ({
      km: Math.round(km * 10) / 10, pfad: `/hof/${e[2]}/`, titel: e[3], art: e[4], ort: e[5], oeffnungszeiten: e[6] || null,
    })),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return weiter(url.toString(), 301);
    }
    if (url.pathname === '/suche') return sucheWeiterleitung(url.searchParams.get('plz'));
    const m = url.pathname.match(/^\/plz\/(\d{5})\/?$/);
    if (m) return sucheWeiterleitung(m[1]);
    if (url.pathname === '/api/umkreis') return umkreis(url);
    return env.ASSETS.fetch(request);
  },
};
