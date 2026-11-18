#!/usr/bin/env node
// Holt den Stand der Ein-Klick-Rückmeldungen („Stimmt noch“ / „Geschlossen“) aus der Verwaltung und schreibt
// data/rueckmeldungen.json für den Build: Datum der letzten Bestätigung, bestätigte Schließungen, offene Meldungen.
// Aufruf: ADMIN_TOKEN=… node scripts/rueckmeldungen-uebernehmen.mjs [https://hofladenliste.de]
import { writeFileSync } from 'node:fs';

const BASIS = process.argv[2] || 'https://hofladenliste.de';
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.log('ADMIN_TOKEN fehlt – nichts zu tun.'); process.exit(0); }
const r = await fetch(`${BASIS}/api/verwaltung/rueckmeldungen/stand`, { headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'hofladenliste-rueckmeldungen' } });
if (!r.ok) { console.error(`Rückmeldungen nicht abrufbar: HTTP ${r.status} ${await r.text()}`); process.exit(1); }
const d = await r.json();
const sortiert = (o) => Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(new URL('../data/rueckmeldungen.json', import.meta.url),
  `${JSON.stringify({ bestaetigt: sortiert(d.bestaetigt), geschlossen: sortiert(d.geschlossen), gemeldet: sortiert(d.gemeldet) }, null, 1)}\n`);
console.log(`Rückmeldungen: ${Object.keys(d.bestaetigt || {}).length} bestätigte Einträge, ${Object.keys(d.geschlossen || {}).length} geschlossen, ${Object.keys(d.gemeldet || {}).length} mit offener Schließungsmeldung.`);
