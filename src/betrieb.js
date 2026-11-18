// Betreiber-Bereich: Anmeldung per Link (ohne Passwort), Sitzungen, eigene Höfe, Hof-News, Veranstaltungen,
// Statistik je Hof und E-Mails über Resend. Alle Tabellen liegen in D1 (Bindung STATS).
//
// Konten entstehen nur auf zwei Wegen:
//  1. Übernahme-Meldung, deren Kontakt-E-Mail zur Website des Hofs passt → Bestätigungslink an diese Adresse
//  2. Freigabe einer Übernahme in der Verwaltung (oder „Konto anlegen“ dort) → Anmeldelink an die Kontaktadresse
export const BETRIEB_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS konten (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, erstellt TEXT NOT NULL, zuletzt TEXT, erinnert TEXT)',
  'CREATE TABLE IF NOT EXISTS konto_hoefe (konto INTEGER NOT NULL, sid TEXT NOT NULL, seit TEXT NOT NULL, PRIMARY KEY (konto, sid))',
  'CREATE INDEX IF NOT EXISTS konto_hoefe_sid ON konto_hoefe (sid)',
  `CREATE TABLE IF NOT EXISTS anmeldungen (hash TEXT PRIMARY KEY, email TEXT NOT NULL, zweck TEXT NOT NULL, sid TEXT, meldung INTEGER,
    ablauf INTEGER NOT NULL, benutzt INTEGER)`,
  'CREATE TABLE IF NOT EXISTS sitzungen (hash TEXT PRIMARY KEY, konto INTEGER NOT NULL, ablauf INTEGER NOT NULL)',
  `CREATE TABLE IF NOT EXISTS neuigkeiten (id INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT NOT NULL, art TEXT NOT NULL, text TEXT NOT NULL,
    produkt TEXT, ab TEXT NOT NULL, bis TEXT NOT NULL, erstellt TEXT NOT NULL, konto INTEGER)`,
  'CREATE INDEX IF NOT EXISTS neuigkeiten_bis ON neuigkeiten (bis, sid)',
  `CREATE TABLE IF NOT EXISTS veranstaltungen (id INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT NOT NULL, titel TEXT NOT NULL, beginn TEXT NOT NULL,
    ende TEXT, beschreibung TEXT, erstellt TEXT NOT NULL, konto INTEGER, status TEXT NOT NULL DEFAULT 'aktiv')`,
  'CREATE TABLE IF NOT EXISTS hof_zahlen (tag TEXT NOT NULL, sid TEXT NOT NULL, ereignis TEXT NOT NULL, anzahl INTEGER NOT NULL, PRIMARY KEY (tag, sid, ereignis))',
];

const SITZUNG_TAGE = 30;
const COOKIE = 'hl_sitzung';
export const NEWS_ARTEN = { da: 'ist da', ab: 'ab heute', verfuegbar: 'verfügbar', ausverkauft: 'Heute ausverkauft', hinweis: 'Hinweis', geschlossen: 'Heute geschlossen' };
export const HOF_EREIGNISSE = ['aufruf', 'route', 'telefon', 'website', 'merken', 'teilen', 'nachricht'];

const zufall = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const antwortJson = (daten, status = 200, kopf = {}) => new Response(JSON.stringify(daten), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...kopf } });
const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const plusTage = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

// Host einer Website ohne www. – für den Abgleich mit der E-Mail-Domain
export function hostVon(url) {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
// Passt die E-Mail-Adresse zur Website des Hofs? (gleiche Domain oder Subdomain, keine Freemailer)
const FREEMAIL = /^(gmail|googlemail|gmx|web|t-online|yahoo|outlook|hotmail|icloud|freenet|aol|posteo|mail|arcor|online|live|me|protonmail|proton|email|kabelmail|vodafone|1und1|ionos)\.(com|de|net|org|at|ch|me|eu|io)$/;
export function emailPasstZuWebsite(email, website) {
  const dom = String(email || '').split('@')[1]?.toLowerCase() || '';
  const host = hostVon(website || '');
  if (!dom || !host || FREEMAIL.test(dom)) return false;
  return dom === host || host.endsWith(`.${dom}`) || dom.endsWith(`.${host}`);
}

// ---------- E-Mail (Resend) ----------
export async function mailSenden(env, { an, betreff, text, antwortAn = 'hofladenliste@gmail.com' }) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY fehlt');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_ABSENDER || 'Hofladenliste <post@hofladenliste.de>', to: [an], reply_to: antwortAn, subject: betreff, text }),
  });
  if (!r.ok) throw new Error(`Resend HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ---------- Turnstile ----------
export async function turnstilePruefen(env, token, ip) {
  const geheim = env.TURNSTILE_SECRET || env.TURNSTILE_SECRET_KEY;
  if (!geheim) return false;
  const f = new FormData();
  f.append('secret', geheim); f.append('response', String(token || '')); if (ip) f.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f });
  return !!(await r.json().catch(() => ({}))).success;
}

// ---------- Anmeldelinks und Sitzungen ----------
export async function linkErstellen(env, h, { email, zweck, sid = null, meldung = null, minuten = 30 }) {
  const token = zufall();
  await env.STATS.prepare('INSERT INTO anmeldungen (hash, email, zweck, sid, meldung, ablauf) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(await h.sha256(token), email.toLowerCase(), zweck, sid, meldung, Date.now() + minuten * 60_000).run();
  return `${h.DOMAIN}/betrieb/?anmelden=${encodeURIComponent(token)}`;
}
function cookieLesen(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{20,})`));
  return m ? m[1] : null;
}
export async function kontoAusSitzung(request, env, h) {
  const t = cookieLesen(request);
  if (!t || !env.STATS) return null;
  await h.schema(env);
  const s = await env.STATS.prepare('SELECT k.id, k.email FROM sitzungen s JOIN konten k ON k.id = s.konto WHERE s.hash = ?1 AND s.ablauf > ?2')
    .bind(await h.sha256(t), Date.now()).first();
  return s || null;
}
export async function kontoHatHof(env, konto, sid) {
  if (!konto || !sid) return false;
  return !!(await env.STATS.prepare('SELECT 1 FROM konto_hoefe WHERE konto = ?1 AND sid = ?2').bind(konto.id, sid).first());
}
export async function kontoAnlegen(env, email, sid) {
  const jetzt = new Date().toISOString();
  email = email.toLowerCase();
  await env.STATS.prepare('INSERT INTO konten (email, erstellt) VALUES (?1, ?2) ON CONFLICT (email) DO NOTHING').bind(email, jetzt).run();
  const k = await env.STATS.prepare('SELECT id, email FROM konten WHERE email = ?1').bind(email).first();
  if (sid) await env.STATS.prepare('INSERT INTO konto_hoefe (konto, sid, seit) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING').bind(k.id, sid, jetzt).run();
  return k;
}

const MAIL_LOGIN = (link) => `Hallo,

mit diesem Link meldest du dich bei Hofladenliste an (gültig für 30 Minuten):

${link}

Dort kannst du die Angaben zu deinem Hof pflegen, Neuigkeiten wie „Spargel ist da!“ veröffentlichen und Veranstaltungen eintragen.

Falls du diese E-Mail nicht angefordert hast, kannst du sie einfach ignorieren.

Viele Grüße
Hofladenliste – hofladenliste.de
Fragen? Antworte einfach auf diese E-Mail.`;
export const MAIL_BESTAETIGEN = (titel, link) => `Hallo,

du möchtest den Eintrag „${titel}“ auf Hofladenliste übernehmen. Weil deine E-Mail-Adresse zur Website des Hofs passt, reicht ein Klick zur Bestätigung (gültig für 3 Tage):

${link}

Danach kannst du Öffnungszeiten, Angebot und Fotos selbst pflegen und Neuigkeiten veröffentlichen.

Falls du das nicht warst, ignoriere diese E-Mail einfach – ohne Klick passiert nichts.

Viele Grüße
Hofladenliste – hofladenliste.de`;
export const MAIL_WILLKOMMEN = (titel, link) => `Hallo,

wir haben deine Übernahme von „${titel}“ geprüft und freigegeben. Ab jetzt kannst du den Eintrag selbst pflegen.

Mit diesem Link meldest du dich an (gültig für 7 Tage, danach bekommst du auf hofladenliste.de/betrieb/ jederzeit einen neuen):

${link}

Viele Grüße
Hofladenliste – hofladenliste.de`;

// Höchstens n Vorgänge pro Tag und Schlüssel (Tabelle meldung_limit aus dem Worker)
async function grenze(env, h, schluessel, n) {
  const tag = heute();
  const r = await env.STATS.prepare(`INSERT INTO meldung_limit (schluessel, tag, anzahl) VALUES (?1, ?2, 1)
    ON CONFLICT (schluessel) DO UPDATE SET anzahl = CASE WHEN tag = ?2 THEN anzahl + 1 ELSE 1 END, tag = ?2 RETURNING anzahl`).bind(await h.sha256(schluessel), tag).first();
  return (r?.anzahl || 0) <= n;
}

function hofKurz(e) {
  return { sid: e[15], slug: e[2], pfad: `/hof/${e[2]}/`, titel: e[3], art: e[4], ort: e[5], oeffnungszeiten: e[6] || '', vollstaendigkeit: e[24] };
}

// ---------- API /api/betrieb/… ----------
export async function betriebApi(request, env, url, ctx, h) {
  if (!env.STATS) return antwortJson({ fehler: 'Gerade nicht verfügbar.' }, 503);
  await h.schema(env);
  const teil = url.pathname.replace(/^\/api\/betrieb\//, '');
  const ip = request.headers.get('cf-connecting-ip') || '';
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  if (teil === 'anmelden' && request.method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase().slice(0, 190);
    if (!h.EMAIL_RE.test(email)) return antwortJson({ fehler: 'Bitte gib eine gültige E-Mail-Adresse ein.' }, 400);
    if (!await grenze(env, h, `anm|${ip}`, 20) || !await grenze(env, h, `anm|${email}`, 5)) return antwortJson({ fehler: 'Zu viele Versuche. Bitte versuch es später noch einmal.' }, 429);
    const k = await env.STATS.prepare('SELECT id FROM konten WHERE email = ?1').bind(email).first();
    if (k) {
      const link = await linkErstellen(env, h, { email, zweck: 'login' });
      ctx.waitUntil(mailSenden(env, { an: email, betreff: 'Dein Anmeldelink für Hofladenliste', text: MAIL_LOGIN(link) }).catch((e) => console.error('Mail', e.message)));
    }
    // Gleiche Antwort mit und ohne Konto: verrät nicht, welche Adressen registriert sind
    return antwortJson({ ok: true });
  }

  if (teil === 'einloesen' && request.method === 'POST') {
    const token = String(body.token || '');
    if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return antwortJson({ fehler: 'Der Link ist ungültig.' }, 400);
    const a = await env.STATS.prepare('SELECT * FROM anmeldungen WHERE hash = ?1').bind(await h.sha256(token)).first();
    if (!a || a.benutzt || a.ablauf < Date.now()) return antwortJson({ fehler: 'Der Link ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.' }, 400);
    await env.STATS.prepare('UPDATE anmeldungen SET benutzt = ?1 WHERE hash = ?2').bind(Date.now(), a.hash).run();
    const k = await kontoAnlegen(env, a.email, a.sid);
    let hinweis = null;
    if (a.zweck === 'bestaetigen' && a.meldung) {
      await env.STATS.prepare("UPDATE meldungen SET status = 'freigegeben', geaendert = ?1, notiz = 'per E-Mail-Link bestätigt (Domain passt)' WHERE id = ?2 AND status = 'neu'")
        .bind(new Date().toISOString(), a.meldung).run();
      hinweis = 'Übernahme bestätigt. Deine Angaben erscheinen in den nächsten Stunden auf der Seite.';
    }
    if (a.zweck === 'alles-stimmt' && a.sid) {
      await env.STATS.prepare("INSERT INTO meldungen (erstellt, art, hof, daten, kontakt_email, status, geaendert, notiz) VALUES (?1, 'uebernahme', ?2, ?3, ?4, 'freigegeben', ?1, 'Erinnerung: alles bestätigt')")
        .bind(new Date().toISOString(), a.sid, JSON.stringify({ eintrag: a.sid, bestaetigt: true }), k.email).run();
      hinweis = 'Danke! Wir haben vermerkt, dass alle Angaben noch stimmen.';
    }
    const sitzung = zufall();
    await env.STATS.prepare('INSERT INTO sitzungen (hash, konto, ablauf) VALUES (?1, ?2, ?3)').bind(await h.sha256(sitzung), k.id, Date.now() + SITZUNG_TAGE * 864e5).run();
    await env.STATS.prepare('UPDATE konten SET zuletzt = ?1 WHERE id = ?2').bind(new Date().toISOString(), k.id).run();
    await env.STATS.prepare('DELETE FROM sitzungen WHERE ablauf < ?1').bind(Date.now()).run();
    await env.STATS.prepare('DELETE FROM anmeldungen WHERE ablauf < ?1').bind(Date.now() - 864e5).run();
    return antwortJson({ ok: true, hinweis }, 200, { 'Set-Cookie': `${COOKIE}=${sitzung}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SITZUNG_TAGE * 86400}` });
  }

  const konto = await kontoAusSitzung(request, env, h);
  if (teil === 'abmelden' && request.method === 'POST') {
    const t = cookieLesen(request);
    if (t) await env.STATS.prepare('DELETE FROM sitzungen WHERE hash = ?1').bind(await h.sha256(t)).run();
    return antwortJson({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
  }
  if (!konto) return antwortJson({ fehler: 'Bitte melde dich an.', anmelden: true }, 401);
  const idx = h.eintragIndex();
  const eigene = async () => (await env.STATS.prepare('SELECT sid FROM konto_hoefe WHERE konto = ?1').bind(konto.id).all()).results.map((r) => r.sid);
  const pruefeHof = async (sid) => (await eigene()).includes(sid) ? h.aufloesen(sid, idx) : null;

  if (teil === 'ich') {
    const sids = await eigene();
    const hoefe = sids.map((s) => h.aufloesen(s, idx)).filter(Boolean).map(hofKurz);
    const news = sids.length ? (await env.STATS.prepare(`SELECT * FROM neuigkeiten WHERE konto = ?1 AND bis >= ?2 ORDER BY id DESC LIMIT 50`).bind(konto.id, heute()).all()).results : [];
    const termine = sids.length ? (await env.STATS.prepare(`SELECT * FROM veranstaltungen WHERE konto = ?1 AND status = 'aktiv' AND substr(coalesce(ende, beginn), 1, 10) >= ?2 ORDER BY beginn LIMIT 50`).bind(konto.id, heute()).all()).results : [];
    return antwortJson({ email: konto.email, hoefe, neuigkeiten: news, veranstaltungen: termine, newsArten: NEWS_ARTEN });
  }

  if (teil === 'neuigkeit' && request.method === 'POST') {
    const e = await pruefeHof(String(body.sid || ''));
    if (!e) return antwortJson({ fehler: 'Dieser Hof gehört nicht zu deinem Konto.' }, 403);
    const art = Object.hasOwn(NEWS_ARTEN, body.art) ? body.art : null;
    if (!art) return antwortJson({ fehler: 'Bitte wähle aus, was du melden möchtest.' }, 400);
    const produkt = String(body.produkt || '').trim().slice(0, 40);
    const text = String(body.text || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    if (['da', 'ab', 'verfuegbar'].includes(art) && !produkt) return antwortJson({ fehler: 'Bitte nenne das Produkt, z. B. Spargel.' }, 400);
    const tage = Math.min(60, Math.max(1, parseInt(body.tage, 10) || (art === 'ausverkauft' || art === 'geschlossen' ? 1 : 14)));
    const ab = heute(), bis = plusTage(ab, tage - 1);
    const anzeige = { da: `${produkt} ist da!`, ab: `${produkt} ab heute`, verfuegbar: `${produkt} verfügbar`, ausverkauft: 'Heute ausverkauft', geschlossen: 'Heute geschlossen', hinweis: text }[art] || text;
    if (!anzeige) return antwortJson({ fehler: 'Bitte schreib einen kurzen Text.' }, 400);
    const n = await env.STATS.prepare('SELECT count(*) AS n FROM neuigkeiten WHERE sid = ?1 AND erstellt >= ?2').bind(e[15], ab).first();
    if (n?.n >= 10) return antwortJson({ fehler: 'Heute sind schon zehn Meldungen für diesen Hof eingegangen.' }, 429);
    await env.STATS.prepare('INSERT INTO neuigkeiten (sid, art, text, produkt, ab, bis, erstellt, konto) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
      .bind(e[15], art, [anzeige, art === 'hinweis' ? '' : text].filter(Boolean).join(' – ').slice(0, 200), produkt || null, ab, bis, new Date().toISOString(), konto.id).run();
    return antwortJson({ ok: true, bis });
  }
  const loeschen = teil.match(/^(neuigkeit|veranstaltung)\/(\d+)\/loeschen$/);
  if (loeschen && request.method === 'POST') {
    if (loeschen[1] === 'neuigkeit') await env.STATS.prepare('DELETE FROM neuigkeiten WHERE id = ?1 AND konto = ?2').bind(+loeschen[2], konto.id).run();
    else await env.STATS.prepare("UPDATE veranstaltungen SET status = 'geloescht' WHERE id = ?1 AND konto = ?2").bind(+loeschen[2], konto.id).run();
    return antwortJson({ ok: true });
  }
  if (teil === 'veranstaltung' && request.method === 'POST') {
    const e = await pruefeHof(String(body.sid || ''));
    if (!e) return antwortJson({ fehler: 'Dieser Hof gehört nicht zu deinem Konto.' }, 403);
    const titel = String(body.titel || '').trim().slice(0, 100);
    const beginn = String(body.beginn || ''), ende = String(body.ende || '') || null;
    if (titel.length < 3) return antwortJson({ fehler: 'Bitte gib einen Titel an, z. B. „Hoffest“.' }, 400);
    if (!ZEIT_RE.test(beginn) && !DATUM_RE.test(beginn)) return antwortJson({ fehler: 'Bitte gib Datum und Uhrzeit des Beginns an.' }, 400);
    if (ende && !ZEIT_RE.test(ende) && !DATUM_RE.test(ende)) return antwortJson({ fehler: 'Das Ende ist kein gültiges Datum.' }, 400);
    if (beginn.slice(0, 10) < heute() || beginn.slice(0, 10) > plusTage(heute(), 400)) return antwortJson({ fehler: 'Der Termin muss in den nächsten 13 Monaten liegen.' }, 400);
    if (ende && ende < beginn) return antwortJson({ fehler: 'Das Ende liegt vor dem Beginn.' }, 400);
    await env.STATS.prepare('INSERT INTO veranstaltungen (sid, titel, beginn, ende, beschreibung, erstellt, konto) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(e[15], titel, beginn, ende, String(body.beschreibung || '').trim().slice(0, 600) || null, new Date().toISOString(), konto.id).run();
    return antwortJson({ ok: true, hinweis: 'Gespeichert. Der Termin erscheint in den nächsten Stunden unter /veranstaltungen/.' });
  }
  if (teil === 'statistik') {
    const e = await pruefeHof(url.searchParams.get('sid') || '');
    if (!e) return antwortJson({ fehler: 'Dieser Hof gehört nicht zu deinem Konto.' }, 403);
    const ab = plusTage(heute(), -89);
    const { results } = await env.STATS.prepare('SELECT ereignis, SUM(anzahl) AS anzahl, MIN(tag) AS seit FROM hof_zahlen WHERE sid = ?1 AND tag >= ?2 GROUP BY ereignis').bind(e[15], ab).all();
    const monat = (await env.STATS.prepare("SELECT substr(tag, 1, 7) AS monat, SUM(anzahl) AS anzahl FROM hof_zahlen WHERE sid = ?1 AND ereignis = 'aufruf' GROUP BY monat ORDER BY monat DESC LIMIT 12").bind(e[15]).all()).results;
    return antwortJson({ sid: e[15], zeitraum: { ab, bis: heute() }, summen: Object.fromEntries(results.map((r) => [r.ereignis, r.anzahl])), aufrufeProMonat: monat });
  }
  return antwortJson({ fehler: 'Unbekannt' }, 404);
}

// ---------- Öffentlich: aktuelle Hof-News ----------
// /api/neuigkeiten?sids=a,b,c  oder  ?alle=1 (für Startseite und Karte, die neuesten 300)
export async function neuigkeitenApi(url, env, h) {
  if (!env.STATS) return h.json({ neuigkeiten: [] });
  await h.schema(env);
  const t = heute();
  const idx = h.eintragIndex();
  // Stabile IDs oder Slugs (Listen kennen nur den Slug)
  const sids = [...new Set((url.searchParams.get('sids') || '').split(',').slice(0, 200).map((s) => h.aufloesen(s.trim(), idx)?.[15]).filter(Boolean))];
  const q = sids.length
    ? env.STATS.prepare(`SELECT id, sid, art, text, produkt, ab, bis FROM neuigkeiten WHERE ab <= ?1 AND bis >= ?1 AND sid IN (${sids.map((_, i) => `?${i + 2}`).join(',')}) ORDER BY id DESC`).bind(t, ...sids)
    : env.STATS.prepare('SELECT id, sid, art, text, produkt, ab, bis FROM neuigkeiten WHERE ab <= ?1 AND bis >= ?1 ORDER BY id DESC LIMIT 300').bind(t);
  const neuigkeiten = (await q.all()).results.map((n) => {
    const e = h.aufloesen(n.sid, idx);
    return e ? { ...n, titel: e[3], pfad: `/hof/${e[2]}/`, ort: e[5], lat: e[0], lon: e[1] } : null;
  }).filter(Boolean);
  const r = h.json({ neuigkeiten });
  r.headers.set('Cache-Control', 'public, max-age=120');
  return r;
}

// ---------- Zähler je Hof (ohne Cookies, nur Tagessummen) ----------
export async function hofZaehlen(env, h, sid, ereignis) {
  if (!HOF_EREIGNISSE.includes(ereignis) || !sid) return;
  await h.schema(env);
  await env.STATS.prepare(`INSERT INTO hof_zahlen (tag, sid, ereignis, anzahl) VALUES (?1, ?2, ?3, 1)
    ON CONFLICT (tag, sid, ereignis) DO UPDATE SET anzahl = anzahl + 1`).bind(heute(), sid, ereignis).run();
}

// ---------- „Nachricht an den Hof“ (nur für Höfe mit Konto, Spam-Schutz mit Turnstile) ----------
// Die Adresse des Hofs bleibt verborgen; die Antwort geht direkt an die Adresse des Absenders (Reply-To).
export async function nachrichtAnnehmen(request, env, ctx, h) {
  if (request.method !== 'POST') return antwortJson({ fehler: 'Nur POST' }, 405);
  if (!env.STATS || !env.RESEND_API_KEY) return antwortJson({ fehler: 'Nachrichten sind gerade nicht möglich.' }, 503);
  await h.schema(env);
  const b = await request.json().catch(() => ({}));
  const e = h.aufloesen(String(b.eintrag || ''), h.eintragIndex());
  if (!e) return antwortJson({ fehler: 'Eintrag nicht gefunden.' }, 404);
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!await turnstilePruefen(env, b.turnstile, ip)) return antwortJson({ fehler: 'Die Spam-Prüfung ist fehlgeschlagen. Bitte lade die Seite neu und versuch es noch einmal.' }, 400);
  const name = String(b.name || '').trim().slice(0, 80), email = String(b.email || '').trim().toLowerCase().slice(0, 190);
  const text = String(b.text || '').trim().slice(0, 3000);
  if (!h.EMAIL_RE.test(email)) return antwortJson({ fehler: 'Bitte gib deine E-Mail-Adresse an, damit der Hof antworten kann.' }, 400);
  if (text.length < 10) return antwortJson({ fehler: 'Die Nachricht ist zu kurz.' }, 400);
  if (/https?:\/\//i.test(text) && (text.match(/https?:\/\//gi) || []).length > 2) return antwortJson({ fehler: 'Bitte höchstens zwei Links in der Nachricht.' }, 400);
  if (!await grenze(env, h, `nachricht|${ip}`, 5)) return antwortJson({ fehler: 'Heute sind schon mehrere Nachrichten von dir eingegangen. Bitte versuch es morgen wieder.' }, 429);
  const empfaenger = (await env.STATS.prepare('SELECT k.email FROM konto_hoefe h JOIN konten k ON k.id = h.konto WHERE h.sid = ?1').bind(e[15]).all()).results.map((r) => r.email);
  if (!empfaenger.length) return antwortJson({ fehler: 'Dieser Hof nimmt keine Nachrichten über Hofladenliste an.' }, 400);
  for (const an of empfaenger.slice(0, 3)) {
    await mailSenden(env, { an, antwortAn: email, betreff: `Nachricht über Hofladenliste: ${e[3]}`,
      text: `Hallo,\n\n${name || 'Jemand'} (${email}) hat dir über deinen Eintrag „${e[3]}“ auf Hofladenliste geschrieben:\n\n${text}\n\n—\nAntworte einfach auf diese E-Mail, die Antwort geht direkt an ${email}.\nDeine E-Mail-Adresse haben wir nicht weitergegeben.\nHofladenliste – ${h.DOMAIN}/hof/${e[2]}/` });
  }
  ctx.waitUntil(hofZaehlen(env, h, e[15], 'nachricht').catch(() => {}));
  return antwortJson({ ok: true });
}

// ---------- Erinnerungen: „Stimmt noch alles?“ nach 6 Monaten ohne Bestätigung ----------
// Läuft täglich über den Cron-Trigger des Workers, aber nur wenn ERINNERUNGEN_AKTIV = "ja" gesetzt ist.
// Höchstens eine Erinnerung pro Konto alle 180 Tage, höchstens 50 Mails pro Lauf.
export async function erinnerungenSenden(env, h, { jetzt = new Date(), maxMails = 50 } = {}) {
  if (env.ERINNERUNGEN_AKTIV !== 'ja' || !env.STATS || !env.RESEND_API_KEY) return { gesendet: 0, aus: true };
  await h.schema(env);
  const grenzeIso = new Date(jetzt.getTime() - 180 * 864e5).toISOString();
  const { results } = await env.STATS.prepare(`SELECT k.id, k.email, h.sid, h.seit,
      (SELECT max(m.geaendert) FROM meldungen m WHERE m.art = 'uebernahme' AND m.status IN ('freigegeben', 'erledigt') AND json_extract(m.daten, '$.eintrag') = h.sid) AS bestaetigt
    FROM konten k JOIN konto_hoefe h ON h.konto = k.id WHERE k.erinnert IS NULL OR k.erinnert < ?1`).bind(grenzeIso).all();
  const idx = h.eintragIndex();
  let gesendet = 0;
  const erledigt = new Set();
  for (const r of results) {
    if (gesendet >= maxMails || erledigt.has(r.id)) continue;
    if ((r.bestaetigt || r.seit) > grenzeIso) continue;
    const e = h.aufloesen(r.sid, idx);
    if (!e) continue;
    const ja = await linkErstellen(env, h, { email: r.email, zweck: 'alles-stimmt', sid: r.sid, minuten: 14 * 24 * 60 });
    await mailSenden(env, { an: r.email, betreff: `Stimmt noch alles bei „${e[3]}“?`, text: `Hallo,

seit einem halben Jahr hast du die Angaben zu „${e[3]}“ auf Hofladenliste nicht mehr bestätigt.
Aktuell steht dort: ${e[6] ? `Öffnungszeiten ${e[6]}` : 'keine Öffnungszeiten'}${e[9] ? `, Telefon ${e[9]}` : ''}.

Alles noch richtig? Ein Klick genügt (gültig 14 Tage):
${ja}

Etwas hat sich geändert? Melde dich an und pass es an:
${h.DOMAIN}/betrieb/

Viele Grüße
Hofladenliste – ${h.DOMAIN}
Du bekommst diese Erinnerung höchstens zweimal im Jahr.` });
    await env.STATS.prepare('UPDATE konten SET erinnert = ?1 WHERE id = ?2').bind(jetzt.toISOString(), r.id).run();
    erledigt.add(r.id);
    gesendet++;
  }
  return { gesendet };
}
