#!/usr/bin/env node
// Holt Hofläden, Direktvermarkter und Hofautomaten aus der Karte von morgen (OpenFairDB, Einträge unter CC0-1.0)
// und schreibt sie im gemeinsamen Kandidatenformat (siehe scripts/import-quellen.mjs).
// Aufruf: node scripts/fetch-kvm.mjs <ziel.json>
import { writeFileSync } from 'node:fs';

const ziel = process.argv[2];
const API = 'https://api.ofdb.io/v0';
const UA = { 'User-Agent': 'hofladenliste.de/1.0 (+https://hofladenliste.de/quellen/; hofladenliste@gmail.com)' };
const BBOX = '47.2,5.8,55.1,15.1';
const SUCHE = ['hofladen', '#hofladen', 'hofverkauf', '#hofverkauf', 'direktvermarktung', '#direktvermarktung', '#direktvermarkter',
  'milchtankstelle', '#milchtankstelle', 'regiomat', '#regiomat', 'bauernladen', '#abhof', 'ab hof', 'eierautomat', 'verkaufsautomat',
  'hofkäserei', 'selbstbedienung hof', 'solawi', '#solawi', 'solidarische landwirtschaft', '#solidarischelandwirtschaft'];
// Schlagwörter, mit denen die Karte von morgen einen Ort selbst als Direktverkauf einordnet
// („direktvermarktung“ allein reicht nicht: so sind auch Verbände, Broschüren und Märkte verschlagwortet)
const HOF_TAGS = new Set(['hofladen', 'hofverkauf', 'milchtankstelle', 'regiomat', 'bauernladen', 'abhof', 'ab-hof', 'eierautomat',
  'milchautomat', 'hofkäserei', 'hofkaeserei', 'hofmarkt', 'verkaufsautomat', 'hofcafé-und-hofladen']);

const json = async (url) => {
  for (let v = 0; v < 3; v++) {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) }).catch(() => null);
    if (r?.ok) return r.json();
    await new Promise((res) => setTimeout(res, 2000 * (v + 1)));
  }
  throw new Error(`Abruf fehlgeschlagen: ${url}`);
};

const ids = new Set();
for (const text of SUCHE) {
  const d = await json(`${API}/search?${new URLSearchParams({ bbox: BBOX, text, limit: 2000 })}`);
  for (const v of d.visible || []) ids.add(v.id);
  console.error(`Suche „${text}“: ${(d.visible || []).length}`);
}
const alle = [...ids], eintraege = [];
for (let i = 0; i < alle.length; i += 40) eintraege.push(...await json(`${API}/entries/${alle.slice(i, i + 40).join(',')}`));

const orte = [];
for (const e of eintraege) {
  if (e.license !== 'CC0-1.0') continue;
  const land = String(e.country || '').toLowerCase();
  if (land && !['deutschland', 'germany', 'de'].includes(land)) continue;
  if (e.zip && !/^\d{5}$/.test(String(e.zip).trim())) continue; // Österreich/Schweiz: vierstellige PLZ
  const tags = (e.tags || []).map((t) => String(t).toLowerCase());
  const beschreibung = String(e.description || '').replace(/\s+/g, ' ').trim();
  // Solawi: Schlagwort oder Name; Verband nur aus Schlagwörtern
  const solawi = tags.some((t) => /^(solawi|solidarische-?landwirtschaft|csa)$/.test(t)) || /solawi|solidarische landwirtschaft/i.test(e.title || '');
  const verband = ['bioland', 'demeter', 'naturland', 'biopark', 'gäa', 'biokreis', 'ecoland'].filter((v) => tags.includes(v)).map((v) => v === 'gäa' ? 'Gäa' : v[0].toUpperCase() + v.slice(1));
  orte.push({
    id: e.id, name: e.title, kat: null, hier: '', konf: 0.8,
    hofHinweis: tags.some((t) => HOF_TAGS.has(t)), solawi: solawi || undefined, verband: verband.length ? verband : undefined,
    lat: e.lat, lon: e.lng, websites: e.homepage ? [e.homepage] : [], phones: e.telephone ? [e.telephone] : [],
    emails: e.email ? [e.email] : [], socials: [], strasse: e.street || null, plz: e.zip || null, ort: e.city || null,
    oeffnungszeiten_text: e.opening_hours ? String(e.opening_hours).replace(/\s+/g, ' ').trim().slice(0, 200) : null,
    beschreibung: beschreibung && beschreibung.length <= 400 ? beschreibung : null,
    bio: tags.some((t) => /^(bio|biohof|bioland|demeter|naturland|ökologisch|oekologisch)$/.test(t)) || null,
    lizenz: 'CC0-1.0', quelleUrl: `https://kartevonmorgen.org/#/?entry=${e.id}`,
  });
}
if (orte.length < 100) { console.error(`Nur ${orte.length} Einträge – Abfrage prüfen.`); process.exit(1); }
writeFileSync(ziel, JSON.stringify({ quelle: 'kvm', release: new Date().toISOString().slice(0, 10), orte }));
console.error(`Karte von morgen: ${alle.length} Treffer, ${orte.length} in Deutschland unter CC0, davon ${orte.filter((o) => o.hofHinweis).length} mit Hof-Schlagwort.`);
