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
import VOLLSTAENDIGKEIT from './generated/vollstaendigkeit.json';
import { index, aufloesen, oeffentlich, links, outreachCsv } from './eintraege.js';

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
  const antwort = { treffer: treffer.slice(0, alle ? 40 : 8).map(ortAusgabe) };
  // Vorschläge fürs Suchfeld: auch passende Höfe (Titel ist eindeutig genug, um direkt zur Hofseite zu führen)
  if (url.searchParams.get('hoefe') === '1') antwort.hoefe = hofSuche(q, 5).treffer.map((e) => ({ wert: e[3], ort: e[5], art: e[4] }));
  return json(antwort);
}

// ---------- Suche nach Hofnamen ----------
// Jedes Suchwort muss ein Wortanfang im Titel oder Ort des Eintrags sein: „kittlers“, „gut claren“, „hofladen forst“.
let HOF_INDEX = null;
const hofIndex = () => (HOF_INDEX ??= EINTRAEGE.map((e) => {
  const titel = norm(e[3]), name = norm(e[16] || ''), ort = norm(e[5]);
  return { e, titel, name, woerter: [...new Set(`${titel} ${name} ${ort}`.split(' ').filter(Boolean))], titelWoerter: new Set(`${titel} ${name}`.split(' ')) };
}));
export function hofSuche(q, limit = 30) {
  const n = norm(q);
  const ws = n.split(' ').filter(Boolean);
  if (n.length < 3 || !ws.length) return { treffer: [], gesamt: 0 };
  const passend = [];
  for (const h of hofIndex()) {
    if (!ws.every((w) => h.woerter.some((x) => x.startsWith(w)))) continue;
    const imTitel = ws.filter((w) => [...h.titelWoerter].some((x) => x.startsWith(w))).length;
    const punkte = (h.titel === n || h.name === n ? 100 : 0) + (h.titel.startsWith(n) || h.name.startsWith(n) ? 40 : 0) + imTitel * 10 - h.titel.length / 100;
    passend.push([punkte, h.e]);
  }
  passend.sort((a, b) => b[0] - a[0] || a[1][3].localeCompare(b[1][3], 'de'));
  return { treffer: passend.slice(0, limit).map(([, e]) => e), gesamt: passend.length, exakt: passend.filter(([p]) => p >= 100).length };
}
function hoefeApi(url) {
  const q = (url.searchParams.get('q') || '').slice(0, 60);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));
  const { treffer, gesamt } = hofSuche(q, limit);
  const r = json({ treffer: treffer.map((e) => aufbereiten(e)), gesamt });
  r.headers.set('Cache-Control', 'public, max-age=300');
  return r;
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
  // Kein Ort dieses Namens: Hofnamen suchen (ein klarer Treffer → Hofseite, mehrere → Ergebnisliste)
  if (!treffer.length) {
    const h = hofSuche(q, 2);
    if (h.gesamt === 1 || h.exakt === 1) {
      zaehle(env, ctx, request, { plz: '', art: 'hof' });
      return weiter(`/hof/${h.treffer[0][2]}/`);
    }
    if (h.gesamt > 1) {
      zaehle(env, ctx, request, { plz: '', art: 'hof-liste' });
      return weiter(`/hofsuche/?q=${encodeURIComponent(q)}`);
    }
    zaehle(env, ctx, request, { plz: '', art: 'ort-unbekannt' });
  }
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
    km, pfad: `/hof/${e[2]}/`, slug: e[2], id: e[15], titel: e[3], art: e[4], ort: e[5],
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

// ---------- Meldungen: Eintragen, Korrigieren, Übernehmen (Formular auf /mitmachen/) ----------
// Gespeichert in D1 (Binding STATS), Fotos als BLOB (max. 1,5 MB, im Browser verkleinert).
// Moderation über /verwaltung/ mit dem Worker-Secret ADMIN_TOKEN.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meldungen (id INTEGER PRIMARY KEY AUTOINCREMENT, erstellt TEXT NOT NULL, art TEXT NOT NULL, hof TEXT,
    daten TEXT NOT NULL, kontakt_email TEXT, status TEXT NOT NULL DEFAULT 'neu', notiz TEXT, geaendert TEXT)`,
  'CREATE TABLE IF NOT EXISTS meldung_fotos (id INTEGER PRIMARY KEY AUTOINCREMENT, meldung INTEGER NOT NULL, typ TEXT NOT NULL, daten BLOB NOT NULL)',
  'CREATE TABLE IF NOT EXISTS meldung_limit (schluessel TEXT PRIMARY KEY, tag TEXT NOT NULL, anzahl INTEGER NOT NULL)',
  `CREATE TABLE IF NOT EXISTS ereignisse (tag TEXT NOT NULL, ereignis TEXT NOT NULL, seite TEXT NOT NULL, detail TEXT NOT NULL,
    anzahl INTEGER NOT NULL, PRIMARY KEY (tag, ereignis, seite, detail))`,
];
let schemaOk = false;
async function schema(env) {
  if (schemaOk) return;
  await env.STATS.batch(SCHEMA.map((q) => env.STATS.prepare(q)));
  schemaOk = true;
}
const MELDUNG_ARTEN = ['neu', 'korrektur', 'uebernahme'];
const TAGE_KURZ = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
const OSM_TAGE = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const TEXTFELDER = { name: 120, betriebsart: 40, strasse: 120, plz: 5, ort: 80, telefon: 40, email: 120, website: 200,
  beschreibung: 600, saison: 300, hinweis: 2000, kontakt_name: 120 };
const ZAHLUNGEN = ['bar', 'girocard', 'kreditkarte', 'kontaktlos', 'paypal', 'ueberweisung'];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const ZEIT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const tagHeute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
async function sha256(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// Öffnungszeiten aus den Zeitfeldern (mo_von1, mo_bis1, mo_von2, mo_bis2 …) im OSM-Format
function oeffnungszeitenAusFormular(f) {
  if (f.get('rund') === 'ja') return '24/7';
  const teile = [];
  TAGE_KURZ.forEach((t, i) => {
    const iv = [1, 2].map((n) => [f.get(`${t}_von${n}`), f.get(`${t}_bis${n}`)]).filter(([a, b]) => ZEIT_RE.test(a || '') && ZEIT_RE.test(b || ''));
    if (iv.length) teile.push(`${OSM_TAGE[i]} ${iv.map(([a, b]) => `${a}-${b}`).join(',')}`);
  });
  return teile.join('; ');
}
function antwort(request, status, daten) {
  if ((request.headers.get('accept') || '').includes('application/json')) return json(daten, status);
  if (status === 200) return weiter('/mitmachen/danke/', 303);
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Fehler</title><p style="font:16px sans-serif;margin:2rem">${String(daten.fehler).replace(/</g, '&lt;')}</p><p style="font:16px sans-serif;margin:2rem"><a href="javascript:history.back()">Zurück zum Formular</a></p>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
async function meldungAnnehmen(request, env) {
  if (request.method !== 'POST') return json({ fehler: 'Nur POST' }, 405);
  if (!env.STATS) return antwort(request, 503, { fehler: 'Das Formular ist gerade nicht verfügbar. Bitte schreib uns eine E-Mail.' });
  let f;
  try { f = await request.formData(); } catch { return antwort(request, 400, { fehler: 'Das Formular konnte nicht gelesen werden.' }); }
  // Spam-Schutz: verstecktes Feld muss leer sein, Formular nicht schneller als 3 Sekunden ausgefüllt
  const t = +f.get('t');
  if (f.get('firma') || (t && Date.now() - t < 3000)) return antwort(request, 200, { ok: true });
  const art = f.get('art');
  if (!MELDUNG_ARTEN.includes(art)) return antwort(request, 400, { fehler: 'Bitte wähle aus, was du tun möchtest.' });
  if (f.get('einwilligung') !== 'ja') return antwort(request, 400, { fehler: 'Bitte bestätige den Hinweis zum Datenschutz.' });
  const bestehend = art === 'neu' ? null : aufloesen(f.get('eintrag') || f.get('hof'), eintragIndex());
  if (art !== 'neu' && !bestehend) return antwort(request, 400, { fehler: 'Der Eintrag wurde nicht gefunden. Öffne das Formular bitte über die Seite des Hofs.' });
  const hof = bestehend ? bestehend[2] : '';
  const daten = {};
  for (const [k, max] of Object.entries(TEXTFELDER)) { const v = String(f.get(k) || '').trim().slice(0, max); if (v) daten[k] = v; }
  if (daten.plz && !/^\d{5}$/.test(daten.plz)) return antwort(request, 400, { fehler: 'Die Postleitzahl muss fünf Ziffern haben.' });
  if (daten.email && !EMAIL_RE.test(daten.email)) return antwort(request, 400, { fehler: 'Die E-Mail-Adresse des Betriebs sieht nicht richtig aus.' });
  if (daten.website && !/^https?:\/\//.test(daten.website)) daten.website = 'https://' + daten.website;
  const oh = oeffnungszeitenAusFormular(f);
  if (oh) daten.oeffnungszeiten = oh;
  const angebot = f.getAll('angebot').filter((x) => KATEGORIEN.includes(x));
  if (angebot.length) daten.angebot = angebot;
  const zahlung = f.getAll('zahlung').filter((x) => ZAHLUNGEN.includes(x));
  if (zahlung.length) daten.zahlung = zahlung;
  if (f.get('bio') === 'ja') daten.bio = true;
  if (art === 'neu' && (!daten.name || !daten.plz)) return antwort(request, 400, { fehler: 'Für einen neuen Eintrag brauchen wir mindestens Name und Postleitzahl.' });
  const kontakt = String(f.get('kontakt_email') || '').trim().slice(0, 120);
  if (kontakt && !EMAIL_RE.test(kontakt)) return antwort(request, 400, { fehler: 'Deine E-Mail-Adresse sieht nicht richtig aus.' });
  if (art === 'uebernahme' && !kontakt) return antwort(request, 400, { fehler: 'Für die Übernahme brauchen wir deine E-Mail-Adresse, damit wir dich als Betreiber bestätigen können.' });
  const fotos = f.getAll('fotos').filter((x) => x && typeof x === 'object' && x.size > 0).slice(0, 3);
  for (const x of fotos) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(x.type)) return antwort(request, 400, { fehler: 'Fotos bitte als JPG, PNG oder WebP.' });
    if (x.size > 1_500_000) return antwort(request, 400, { fehler: 'Ein Foto ist zu groß (höchstens 1,5 MB).' });
  }
  if (fotos.length && f.get('fotorechte') !== 'ja') return antwort(request, 400, { fehler: 'Bitte bestätige, dass du die Rechte an den Fotos hast.' });
  if (!Object.keys(daten).length && !fotos.length) return antwort(request, 400, { fehler: 'Das Formular ist leer.' });
  if (f.get('badge') === 'ja') daten.badge = true;
  // Herkunft (z. B. Outreach-Mail) mitspeichern
  const utm = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) { const v = String(f.get(k) || '').trim().slice(0, 80); if (v) utm[k] = v; }
  if (Object.keys(utm).length) daten.utm = utm;
  // Bestehender Eintrag: stabile ID und Änderungen „alt → neu“ für die Moderation
  if (bestehend) {
    const alt = oeffentlich(bestehend, KATEGORIEN, VOLLSTAENDIGKEIT);
    daten.eintrag = alt.id;
    const vergleich = { name: alt.name, betriebsart: alt.art, strasse: alt.strasse, plz: alt.plz, ort: alt.ort, telefon: alt.telefon, email: alt.email,
      website: alt.website, oeffnungszeiten: alt.oeffnungszeiten, angebot: alt.angebot, zahlung: alt.zahlung, bio: alt.bio, beschreibung: alt.beschreibung };
    const norm = (v) => (Array.isArray(v) ? [...v].sort().join(', ') : v === true ? 'ja' : v === false ? '' : String(v ?? '').trim());
    const diff = {};
    for (const [k, a] of Object.entries(vergleich)) if (daten[k] !== undefined && norm(daten[k]) !== norm(a)) diff[k] = [norm(a), norm(daten[k])];
    if (fotos.length) diff.fotos = [String(alt.fotos || 0), `+${fotos.length}`];
    daten.diff = diff;
  }

  await schema(env);
  // höchstens 10 Meldungen pro Tag und Absender (IP nur als Tages-Hash, nicht gespeichert)
  const tag = tagHeute();
  const schluessel = await sha256(`${request.headers.get('cf-connecting-ip') || ''}|${tag}`);
  const lim = await env.STATS.prepare(`INSERT INTO meldung_limit (schluessel, tag, anzahl) VALUES (?1, ?2, 1)
    ON CONFLICT (schluessel) DO UPDATE SET anzahl = anzahl + 1 RETURNING anzahl`).bind(schluessel, tag).first();
  if (lim?.anzahl > 10) return antwort(request, 429, { fehler: 'Heute sind schon viele Meldungen von dir eingegangen. Bitte versuch es morgen wieder.' });
  const jetzt = new Date().toISOString();
  const r = await env.STATS.prepare('INSERT INTO meldungen (erstellt, art, hof, daten, kontakt_email) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id')
    .bind(jetzt, art, art === 'neu' ? null : hof, JSON.stringify(daten), kontakt || null).first();
  for (const x of fotos) {
    await env.STATS.prepare('INSERT INTO meldung_fotos (meldung, typ, daten) VALUES (?1, ?2, ?3)').bind(r.id, x.type, new Uint8Array(await x.arrayBuffer())).run();
  }
  // alte Zählerzeilen aufräumen
  await env.STATS.prepare('DELETE FROM meldung_limit WHERE tag < ?1').bind(tag).run();
  return antwort(request, 200, { ok: true, id: r.id });
}

// ---------- Nutzungsstatistik: Tageszähler für Klicks (Route, Telefon, Website, Filter, Nähe) ----------
// Keine IP, kein Gerät, keine Uhrzeit – nur „heute X-mal Route auf Hofseiten“.
const EREIGNISSE = ['route', 'telefon', 'website', 'filter', 'naehe', 'merken', 'teilen', 'suche'];
const SEITEN = ['start', 'hof', 'kreis', 'ort', 'kategorie', 'saison', 'sonstige'];
async function ereignisZaehlen(request, env, ctx) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!env.STATS || BOT.test(request.headers.get('user-agent') || '')) return new Response(null, { status: 204 });
  let b;
  try { b = JSON.parse(await request.text()); } catch { return new Response(null, { status: 400 }); }
  const e = EREIGNISSE.includes(b.e) ? b.e : null;
  if (!e) return new Response(null, { status: 400 });
  const seite = SEITEN.includes(b.s) ? b.s : 'sonstige';
  const detail = String(b.d || '').toLowerCase().replace(/[^a-z0-9äöüß_-]/g, '').slice(0, 30);
  ctx.waitUntil((async () => {
    await schema(env);
    await env.STATS.prepare(`INSERT INTO ereignisse (tag, ereignis, seite, detail, anzahl) VALUES (?1, ?2, ?3, ?4, 1)
      ON CONFLICT (tag, ereignis, seite, detail) DO UPDATE SET anzahl = anzahl + 1`).bind(tagHeute(), e, seite, detail).run();
  })().catch(() => {}));
  return new Response(null, { status: 204 });
}

// Verwaltung (nur mit ADMIN_TOKEN)
function berechtigt(request, env) {
  const soll = env.ADMIN_TOKEN;
  const ist = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!soll || soll.length < 20 || ist.length !== soll.length) return false;
  let d = 0;
  for (let i = 0; i < soll.length; i++) d |= soll.charCodeAt(i) ^ ist.charCodeAt(i);
  return d === 0;
}
async function verwaltung(request, env, url) {
  if (!env.ADMIN_TOKEN) return json({ fehler: 'Verwaltung ist noch nicht eingerichtet (Secret ADMIN_TOKEN fehlt).' }, 503);
  if (!berechtigt(request, env)) return json({ fehler: 'Nicht berechtigt' }, 401);
  await schema(env);
  const keinCache = (r) => { r.headers.set('Cache-Control', 'no-store'); return r; };
  const teil = url.pathname.replace('/api/verwaltung/', '');
  if (teil === 'meldungen') {
    const status = url.searchParams.get('status') || 'neu';
    const { results } = await env.STATS.prepare(`SELECT m.*, (SELECT group_concat(id) FROM meldung_fotos WHERE meldung = m.id) AS fotos
      FROM meldungen m WHERE status = ?1 ORDER BY id DESC LIMIT 200`).bind(status).all();
    return keinCache(json({ meldungen: results.map((m) => ({ ...m, daten: JSON.parse(m.daten), fotos: m.fotos ? String(m.fotos).split(',').map(Number) : [] })) }));
  }
  if (teil === 'freigaben') {
    const { results } = await env.STATS.prepare(`SELECT m.id, m.art, m.hof, m.daten, m.geaendert, (SELECT group_concat(id) FROM meldung_fotos WHERE meldung = m.id) AS fotos
      FROM meldungen m WHERE status = 'freigegeben' ORDER BY id`).all();
    return keinCache(json({ freigaben: results.map((m) => ({ ...m, daten: JSON.parse(m.daten), fotos: m.fotos ? String(m.fotos).split(',').map(Number) : [] })) }));
  }
  if (teil === 'statistik') {
    const tage = Math.min(365, Math.max(1, +url.searchParams.get('tage') || 30));
    const ab = new Date(Date.now() - tage * 864e5).toISOString().slice(0, 10);
    const q = async (sql) => (await env.STATS.prepare(sql).bind(ab).all()).results;
    return keinCache(json({
      ab,
      suchen: await q(`SELECT art, SUM(anzahl) AS anzahl FROM suchen WHERE tag >= ?1 GROUP BY art ORDER BY anzahl DESC`).catch(() => []),
      plz: await q(`SELECT plz, kreis, SUM(anzahl) AS anzahl FROM suchen WHERE tag >= ?1 AND plz != '' GROUP BY plz ORDER BY anzahl DESC LIMIT 50`).catch(() => []),
      kreise: await q(`SELECT kreis, SUM(anzahl) AS anzahl FROM suchen WHERE tag >= ?1 AND kreis != '' GROUP BY kreis ORDER BY anzahl DESC LIMIT 50`).catch(() => []),
      produkte: await q(`SELECT produkt, SUM(anzahl) AS anzahl FROM suchen WHERE tag >= ?1 AND produkt != '' GROUP BY produkt ORDER BY anzahl DESC LIMIT 20`).catch(() => []),
      ereignisse: await q(`SELECT ereignis, seite, detail, SUM(anzahl) AS anzahl FROM ereignisse WHERE tag >= ?1 GROUP BY ereignis, seite, detail ORDER BY anzahl DESC LIMIT 100`),
      tage: await q(`SELECT tag, SUM(anzahl) AS anzahl FROM ereignisse WHERE tag >= ?1 GROUP BY tag ORDER BY tag`),
    }));
  }
  if (teil === 'export') {
    const liste = request.method === 'POST' ? await request.text() : (url.searchParams.get('liste') || '');
    return new Response(outreachCsv(liste.split(/[\n,;\s]+/), eintragIndex(), DOMAIN, VOLLSTAENDIGKEIT), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="outreach.csv"', 'Cache-Control': 'no-store' } });
  }
  const foto = teil.match(/^foto\/(\d+)$/);
  if (foto) {
    const r = await env.STATS.prepare('SELECT typ, daten FROM meldung_fotos WHERE id = ?1').bind(+foto[1]).first();
    if (!r) return json({ fehler: 'Foto nicht gefunden' }, 404);
    return new Response(new Uint8Array(r.daten), { headers: { 'Content-Type': r.typ, 'Cache-Control': 'no-store' } });
  }
  const m = teil.match(/^meldung\/(\d+)$/);
  if (m && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    if (!['neu', 'freigegeben', 'abgelehnt', 'erledigt'].includes(b.status)) return json({ fehler: 'Status ungültig' }, 400);
    const sets = ['status = ?1', 'geaendert = ?2', 'notiz = ?3'];
    const werte = [b.status, new Date().toISOString(), String(b.notiz || '').slice(0, 1000)];
    if (b.daten && typeof b.daten === 'object') { sets.push('daten = ?4'); werte.push(JSON.stringify(b.daten).slice(0, 20000)); }
    await env.STATS.prepare(`UPDATE meldungen SET ${sets.join(', ')} WHERE id = ?${werte.length + 1}`).bind(...werte, +m[1]).run();
    if (b.status === 'abgelehnt') await env.STATS.prepare('DELETE FROM meldung_fotos WHERE meldung = ?1').bind(+m[1]).run();
    return json({ ok: true });
  }
  return json({ fehler: 'Unbekannt' }, 404);
}

// ---------- Bearbeiten-Links mit stabiler ID ----------
let IDX = null;
const eintragIndex = () => (IDX ??= index(EINTRAEGE, ROUTEN.alteSlugs || {}));
const DOMAIN = 'https://hofladenliste.de';
function eintragApi(url) {
  const e = aufloesen(url.searchParams.get('id') || url.searchParams.get('eintrag') || url.searchParams.get('hof'), eintragIndex());
  if (!e) return json({ fehler: 'Eintrag nicht gefunden' }, 404);
  const r = json({ eintrag: oeffentlich(e, KATEGORIEN, VOLLSTAENDIGKEIT), links: links(DOMAIN, e) });
  r.headers.set('Cache-Control', 'public, max-age=300');
  return r;
}
// /hof/<stabile-id oder slug>/bearbeiten/ bzw. /uebernehmen/ → Formular (302, auch nach Slug-Änderung)
export function bearbeitenZiel(teil, aktion, suche, idx) {
  const e = aufloesen(teil, idx);
  const p = new URLSearchParams(suche);
  p.delete('eintrag'); p.delete('aktion');
  const rest = p.toString();
  return `/mitmachen/?eintrag=${encodeURIComponent(e ? e[15] : teil)}&aktion=${aktion === 'uebernehmen' ? 'uebernehmen' : 'ergaenzen'}${rest ? `&${rest}` : ''}`;
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
  const bearb = pfad.match(/^\/hof\/([^/]+)\/(bearbeiten|uebernehmen)\/?$/i);
  if (bearb) return new Response(null, { status: 302, headers: { Location: bearbeitenZiel(bearb[1], bearb[2].toLowerCase(), url.search, eintragIndex()), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  const n = normalisiere(pfad);
  // Exakt passende Seite in kanonischer Schreibweise
  if (n === pfad && pfad.endsWith('/') && !ROUTEN.umleitungen[pfad]) {
    const r = await seiteLaden(env, url, pfad, request);
    // Formular mit Parametern (Bearbeiten-Links): nicht indexieren, Canonical zeigt auf /mitmachen/
    if (r && pfad.startsWith('/mitmachen/') && url.search) { const k = new Response(r.body, r); k.headers.set('X-Robots-Tag', 'noindex'); return k; }
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
    if (url.pathname === '/api/meldung') return meldungAnnehmen(request, env);
    if (url.pathname === '/api/eintrag') return eintragApi(url);
    if (url.pathname === '/api/hoefe') return hoefeApi(url);
    if (url.pathname === '/api/ereignis') return ereignisZaehlen(request, env, ctx);
    if (url.pathname.startsWith('/api/verwaltung/')) return verwaltung(request, env, url);
    return seiteAusliefern(request, env, url);
  },
};
