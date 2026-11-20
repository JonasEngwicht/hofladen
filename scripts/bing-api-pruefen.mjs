#!/usr/bin/env node
// Prüft (nur lesend), welcher hinterlegte Schlüssel ein gültiger Bing-Webmaster-API-Schlüssel ist.
// Kandidaten kommen aus den Umgebungsvariablen KANDIDAT_<NAME> (vom Workflow aus den Secrets gesetzt).
// Je Kandidat: GetUserSites (bestätigte Websites) und GetUrlSubmissionQuota für hofladenliste.de.
// Probelauf ohne Netz: BING_TROCKEN=1 (jeder nicht leere Schlüssel gilt dann als gültig).
const SITE = 'https://hofladenliste.de/';
const API = 'https://ssl.bing.com/webmaster/api.svc/json';
const trocken = !!process.env.BING_TROCKEN;
const sauber = (v) => (v || '').trim().replace(/^["']+|["']+$/g, '').trim();

async function abfrage(methode, key, extra = '') {
  if (trocken) return { ok: true, d: methode === 'GetUserSites' ? [{ Url: SITE, IsVerified: true }] : { DailyQuota: 100, MonthlyQuota: 2800 } };
  const r = await fetch(`${API}/${methode}?apikey=${encodeURIComponent(key)}${extra}`);
  const text = await r.text();
  try { const j = JSON.parse(text); return r.ok ? { ok: true, d: j.d } : { ok: false, fehler: `HTTP ${r.status} ${j.Message || text.slice(0, 200)}` }; }
  catch { return { ok: false, fehler: `HTTP ${r.status} ${text.slice(0, 200)}` }; }
}

const kandidaten = Object.entries(process.env).filter(([n, v]) => n.startsWith('KANDIDAT_') && sauber(v)).map(([n, v]) => [n.slice(9), sauber(v)]);
if (!kandidaten.length) { console.log('Keines der geprüften Secrets ist gesetzt.'); process.exit(1); }
let gefunden = false;
for (const [name, key] of kandidaten) {
  const seiten = await abfrage('GetUserSites', key);
  if (!seiten.ok) { console.log(`${name} (${key.length} Zeichen): kein gültiger Webmaster-API-Schlüssel – ${seiten.fehler}`); continue; }
  const liste = seiten.d || [];
  const eigene = liste.find((s) => /^https?:\/\/(www\.)?hofladenliste\.de\/?$/i.test(s.Url));
  console.log(`${name} (${key.length} Zeichen): gültig, ${liste.length} Website(s) im Konto: ${liste.map((s) => `${s.Url}${s.IsVerified ? ' (bestätigt)' : ' (nicht bestätigt)'}`).join(', ')}`);
  if (!eigene) { console.log(`  hofladenliste.de ist in diesem Konto nicht eingetragen.`); continue; }
  const q = await abfrage('GetUrlSubmissionQuota', key, `&siteUrl=${encodeURIComponent(eigene.Url)}`);
  console.log(q.ok ? `  Kontingent heute: ${q.d?.DailyQuota} URLs, Monat: ${q.d?.MonthlyQuota}` : `  Kontingent nicht abrufbar – ${q.fehler}`);
  if (q.ok) gefunden = true;
}
if (!gefunden) process.exitCode = 1;
