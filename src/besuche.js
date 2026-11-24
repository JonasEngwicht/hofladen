// Eigene Besucherstatistik ohne Cookies. Jede Seite meldet beim Anzeigen einmal Pfad und Herkunft (Referrer) per
// sendBeacon an /api/besuch (kleines Skript im Kopf, scripts/build/html.mjs). Warum im Browser und nicht beim Ausliefern:
// Google lädt Suchtreffer auf dem Handy oft vorab (prefetch/prerender) – der Klick erzeugt dann keine Anfrage mehr am Server.
// Das Skript zählt vorgerenderte Seiten erst, wenn sie wirklich angezeigt werden. Bots ohne JavaScript zählen nicht.
// Gespeichert werden nur Tageszähler (Seite, Herkunft, Gerät) und Minutenzähler – keine IP-Adresse, keine Kennung,
// nichts im Browser.
//
// Tabellen (D1 STATS):
//   besuche          Tag × Seite × Herkunft × Gerät → Aufrufe (Herkunft „intern“ = Klick innerhalb der Seite)
//   besuche_minute   Minute (Berlin) → Aufrufe, Einstiege (Aufrufe von außen = Besuche); 35 Tage, für Live-Ansicht und Stundenverlauf
//   besuche_verweise Tag × fremde Website → Einstiege (woher Besucher über Links kommen)

export const BESUCHE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS besuche (tag TEXT NOT NULL, pfad TEXT NOT NULL, quelle TEXT NOT NULL, geraet TEXT NOT NULL,
    anzahl INTEGER NOT NULL, PRIMARY KEY (tag, pfad, quelle, geraet))`,
  `CREATE TABLE IF NOT EXISTS besuche_minute (minute TEXT PRIMARY KEY, aufrufe INTEGER NOT NULL, einstiege INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS besuche_verweise (tag TEXT NOT NULL, host TEXT NOT NULL, anzahl INTEGER NOT NULL, PRIMARY KEY (tag, host))`,
  `CREATE TABLE IF NOT EXISTS besuche_kontrolle (tag TEXT NOT NULL, art TEXT NOT NULL, anzahl INTEGER NOT NULL, PRIMARY KEY (tag, art))`,
];

// Bots, Vorschau-Abrufe und Prüfwerkzeuge zählen nicht
const BOT = /bot|crawl|spider|slurp|preview|fetch|monitor|curl|wget|python|headless|lighthouse|pagespeed|inspect|scan|http-?client|java\/|go-http|node|axios|okhttp|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|validator/i;
const SUCHMASCHINEN = [['google', /(^|\.)google\.[a-z.]+$/], ['bing', /(^|\.)bing\.com$/], ['ecosia', /(^|\.)ecosia\.org$/],
  ['duckduckgo', /(^|\.)duckduckgo\.com$/], ['andere-suche', /(^|\.)(yahoo\.[a-z.]+|qwant\.com|startpage\.com|search\.brave\.com|yandex\.[a-z.]+|t-online\.de|web\.de|gmx\.(net|de)|baidu\.com)$/]];
const SOZIAL = /(^|\.)(facebook\.com|fb\.com|instagram\.com|t\.co|x\.com|twitter\.com|pinterest\.[a-z.]+|linkedin\.com|reddit\.com|youtube\.com|tiktok\.com|whatsapp\.com|threads\.net|mastodon\.[a-z.]+)$/;
export const QUELLEN = ['google', 'bing', 'ecosia', 'duckduckgo', 'andere-suche', 'sozial', 'verweis', 'direkt', 'intern'];

export function herkunft(referer, eigenerHost) {
  let host = '';
  try { host = new URL(referer).hostname.toLowerCase().replace(/^www\./, ''); } catch { return { quelle: 'direkt', host: '' }; }
  if (!host) return { quelle: 'direkt', host: '' };
  if (host === eigenerHost.replace(/^www\./, '')) return { quelle: 'intern', host: '' };
  for (const [name, re] of SUCHMASCHINEN) if (re.test(host)) return { quelle: name, host };
  if (/^android-app:\/\/com\.google/.test(referer)) return { quelle: 'google', host };
  return { quelle: SOZIAL.test(host) ? 'sozial' : 'verweis', host };
}

export function geraet(ua = '') {
  if (/iPad|Tablet|Kindle|Silk|PlayBook|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'handy';
  return 'rechner';
}

// Prüft eine Meldung von /api/besuch: nur von der eigenen Seite (sendBeacon schickt Sec-Fetch-Site: same-origin),
// kein Bot, gültiger Pfad; Verwaltung und Betreiber-Bereich zählen nicht. Liefert { pfad, referer, ua } oder null.
export function besuchPruefen(request, daten) {
  const h = request.headers, ua = h.get('user-agent') || '';
  if (request.method !== 'POST' || BOT.test(ua)) return null;
  const site = h.get('sec-fetch-site');
  if (site && site !== 'same-origin') return null;
  const pfad = typeof daten?.p === 'string' ? daten.p : '';
  if (!/^\/[a-z0-9äöüß\-/._%]*$/i.test(pfad) || pfad.length > 200 || /^\/(verwaltung|betrieb|api)\//.test(pfad)) return null;
  return { pfad, referer: typeof daten.r === 'string' ? daten.r.slice(0, 500) : '', ua };
}

const berlin = (d) => {
  const t = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((p) => [p.type, p.value]));
  return { tag: `${t.year}-${t.month}-${t.day}`, minute: `${t.year}-${t.month}-${t.day} ${t.hour}:${t.minute}` };
};
export { berlin as berlinZeit };

export async function besuchZaehlen(env, { pfad, referer, ua }, eigenerHost = 'hofladenliste.de', jetzt = new Date()) {
  const { tag, minute } = berlin(jetzt);
  const { quelle, host } = herkunft(referer || '', eigenerHost);
  const einstieg = quelle === 'intern' ? 0 : 1;
  const q = [
    env.STATS.prepare(`INSERT INTO besuche (tag, pfad, quelle, geraet, anzahl) VALUES (?1, ?2, ?3, ?4, 1)
      ON CONFLICT (tag, pfad, quelle, geraet) DO UPDATE SET anzahl = anzahl + 1`).bind(tag, pfad, quelle, geraet(ua || '')),
    env.STATS.prepare(`INSERT INTO besuche_minute (minute, aufrufe, einstiege) VALUES (?1, 1, ?2)
      ON CONFLICT (minute) DO UPDATE SET aufrufe = aufrufe + 1, einstiege = einstiege + ?2`).bind(minute, einstieg),
  ];
  if (host && (quelle === 'verweis' || quelle === 'sozial')) q.push(env.STATS.prepare(`INSERT INTO besuche_verweise (tag, host, anzahl) VALUES (?1, ?2, 1)
      ON CONFLICT (tag, host) DO UPDATE SET anzahl = anzahl + 1`).bind(tag, host.slice(0, 100)));
  await env.STATS.batch(q);
}

// Minutenzähler nach 35 Tagen löschen (täglicher Cron)
// Kontrolle: ausgelieferte HTML-Seiten an Browser (ohne Bots), getrennt nach normalem Aufruf und Vorab-Laden
// (Google lädt Suchtreffer per Prefetch/Prerender vorab). Zum Abgleich mit den gemeldeten Besuchen.
export function auslieferungArt(request, pfad) {
  const h = request.headers, ua = h.get('user-agent') || '';
  if (request.method !== 'GET' || /^\/(verwaltung|betrieb|api)\//.test(pfad)) return null;
  if (BOT.test(ua) || !ua.startsWith('Mozilla/')) return 'bot'; // Suchmaschinen, Vorschauen, Prüfskripte
  const dest = h.get('sec-fetch-dest');
  if (dest ? dest !== 'document' : !/text\/html/.test(h.get('accept') || '')) return null;
  return /prefetch|prerender/i.test(h.get('sec-purpose') || h.get('purpose') || '') ? 'vorab' : 'seite';
}
export async function auslieferungZaehlen(env, art, jetzt = new Date()) {
  await env.STATS.prepare(`INSERT INTO besuche_kontrolle (tag, art, anzahl) VALUES (?1, ?2, 1)
    ON CONFLICT (tag, art) DO UPDATE SET anzahl = anzahl + 1`).bind(berlin(jetzt).tag, art).run();
}

export async function besucheAufraeumen(env, jetzt = new Date()) {
  const grenze = berlin(new Date(jetzt.getTime() - 35 * 864e5)).minute;
  await env.STATS.prepare('DELETE FROM besuche_minute WHERE minute < ?1').bind(grenze).run();
}

// Seitentyp aus dem Pfad (für die Auswertung)
const LAENDER = new Set(['baden-wuerttemberg', 'bayern', 'berlin', 'brandenburg', 'bremen', 'hamburg', 'hessen', 'mecklenburg-vorpommern', 'niedersachsen',
  'nordrhein-westfalen', 'rheinland-pfalz', 'saarland', 'sachsen', 'sachsen-anhalt', 'schleswig-holstein', 'thueringen']);
export function seitenTyp(pfad) {
  if (pfad === '/') return 'Startseite';
  const t = pfad.split('/').filter(Boolean);
  if (t[0] === 'hof') return 'Hofseiten';
  if (t[0] === 'ratgeber') return 'Ratgeber';
  if (t[0] === 'saisonkalender') return 'Saisonkalender';
  if (LAENDER.has(t[0])) return t.length === 1 ? 'Bundesländer' : t.length === 2 ? 'Kreise' : 'Orte und Kategorien';
  return 'Themen und Sonstiges';
}

// Auswertung für die Verwaltung: Live (letzte 60 Minuten), heute/gestern je Stunde, Tage, Herkunft, Geräte, Seiten
export async function besucheAuswerten(env, tage = 30, jetzt = new Date()) {
  const heute = berlin(jetzt), gestern = berlin(new Date(jetzt.getTime() - 864e5));
  const ab = berlin(new Date(jetzt.getTime() - (tage - 1) * 864e5)).tag;
  const vor60 = berlin(new Date(jetzt.getTime() - 59 * 6e4)).minute;
  const vor5 = berlin(new Date(jetzt.getTime() - 4 * 6e4)).minute;
  const alle = (sql, ...p) => env.STATS.prepare(sql).bind(...p).all().then((r) => r.results);
  const [minuten, stunden, tageListe, quellen, geraete, seiten, einstiege, verweise, kontrolle] = await Promise.all([
    alle('SELECT minute, aufrufe, einstiege FROM besuche_minute WHERE minute >= ?1 ORDER BY minute', vor60),
    alle(`SELECT substr(minute, 1, 13) AS stunde, SUM(aufrufe) AS aufrufe, SUM(einstiege) AS einstiege FROM besuche_minute
      WHERE minute >= ?1 GROUP BY stunde ORDER BY stunde`, `${gestern.tag} 00:00`),
    alle(`SELECT tag, SUM(anzahl) AS aufrufe, SUM(CASE WHEN quelle != 'intern' THEN anzahl ELSE 0 END) AS besuche FROM besuche
      WHERE tag >= ?1 GROUP BY tag ORDER BY tag`, ab),
    alle(`SELECT quelle, SUM(anzahl) AS anzahl FROM besuche WHERE tag >= ?1 AND quelle != 'intern' GROUP BY quelle ORDER BY anzahl DESC`, ab),
    alle(`SELECT geraet, SUM(anzahl) AS anzahl FROM besuche WHERE tag >= ?1 AND quelle != 'intern' GROUP BY geraet ORDER BY anzahl DESC`, ab),
    alle('SELECT pfad, SUM(anzahl) AS anzahl FROM besuche WHERE tag >= ?1 GROUP BY pfad ORDER BY anzahl DESC LIMIT 400', ab),
    alle(`SELECT pfad, SUM(anzahl) AS anzahl FROM besuche WHERE tag >= ?1 AND quelle != 'intern' GROUP BY pfad ORDER BY anzahl DESC LIMIT 25`, ab),
    alle('SELECT host, SUM(anzahl) AS anzahl FROM besuche_verweise WHERE tag >= ?1 GROUP BY host ORDER BY anzahl DESC LIMIT 25', ab),
    alle('SELECT tag, art, anzahl FROM besuche_kontrolle WHERE tag >= ?1', gestern.tag),
  ]);
  const typen = {};
  for (const s of seiten) typen[seitenTyp(s.pfad)] = (typen[seitenTyp(s.pfad)] || 0) + s.anzahl;
  const summe = (liste, tag, feld) => liste.filter((x) => x.stunde.startsWith(tag)).reduce((s, x) => s + x[feld], 0);
  return {
    stand: heute.minute, ab, tage,
    live: { aufrufe5: minuten.filter((m) => m.minute >= vor5).reduce((s, m) => s + m.aufrufe, 0), minuten },
    heute: { tag: heute.tag, aufrufe: summe(stunden, heute.tag, 'aufrufe'), besuche: summe(stunden, heute.tag, 'einstiege') },
    gestern: { tag: gestern.tag, aufrufe: summe(stunden, gestern.tag, 'aufrufe'), besuche: summe(stunden, gestern.tag, 'einstiege') },
    stunden, tageListe, quellen, geraete,
    typen: Object.entries(typen).map(([typ, anzahl]) => ({ typ, anzahl })).sort((a, b) => b.anzahl - a.anzahl),
    seiten: seiten.slice(0, 25), einstiege, verweise,
    kontrolle: Object.fromEntries([heute.tag, gestern.tag].map((t) => [t === heute.tag ? 'heute' : 'gestern',
      Object.fromEntries(kontrolle.filter((k) => k.tag === t).map((k) => [k.art, k.anzahl]))])),
  };
}
