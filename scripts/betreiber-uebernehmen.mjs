#!/usr/bin/env node
// Übernimmt freigegebene Meldungen (Formular /mitmachen/) in data/betreiber.json und lädt die Fotos
// nach data/fotos/<id>.jpg (verkleinert auf 1200×900 mit ImageMagick, falls vorhanden).
// Danach werden die Meldungen in der Verwaltung als „erledigt“ markiert.
// Aufruf: ADMIN_TOKEN=… node scripts/betreiber-uebernehmen.mjs [https://hofladenliste.de]
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASIS = process.argv[2] || 'https://hofladenliste.de';
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.log('ADMIN_TOKEN fehlt – nichts zu tun.'); process.exit(0); }
const ZIEL = new URL('../data/betreiber.json', import.meta.url);
const FOTOS = new URL('../data/fotos/', import.meta.url);
const kopf = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'hofladenliste-betreiber-import' };

const r = await fetch(`${BASIS}/api/verwaltung/freigaben`, { headers: kopf });
if (!r.ok) { console.error(`Freigaben nicht abrufbar: HTTP ${r.status} ${await r.text()}`); process.exit(1); }
const { freigaben } = await r.json();
const daten = existsSync(ZIEL) ? JSON.parse(readFileSync(ZIEL, 'utf8')) : {};
mkdirSync(FOTOS, { recursive: true });

const magick = (() => { for (const b of ['magick', 'convert']) { try { execFileSync(b, ['-version'], { stdio: 'ignore' }); return b; } catch {} } return null; })();
for (const m of freigaben) {
  const fotos = [];
  for (const id of m.fotos) {
    const ziel = new URL(`${id}.jpg`, FOTOS).pathname;
    if (!existsSync(ziel)) {
      const f = await fetch(`${BASIS}/api/verwaltung/foto/${id}`, { headers: kopf });
      if (!f.ok) { console.error(`Foto ${id} fehlt (${f.status})`); continue; }
      const roh = `${ziel}.roh`;
      writeFileSync(roh, Buffer.from(await f.arrayBuffer()));
      if (magick) execFileSync(magick, [roh, '-auto-orient', '-strip', '-resize', '1200x900^', '-gravity', 'center', '-extent', '1200x900', '-quality', '80', ziel]);
      else writeFileSync(ziel, readFileSync(roh));
      unlinkSync(roh);
    }
    fotos.push(`/fotos/${id}.jpg`);
  }
  daten[m.id] = { art: m.art, hof: m.hof, daten: m.daten, stand: (m.geaendert || new Date().toISOString()).slice(0, 10), fotos };
  console.log(`Meldung ${m.id} (${m.art}${m.hof ? ` ${m.hof}` : ''}) übernommen`);
}
writeFileSync(ZIEL, JSON.stringify(Object.fromEntries(Object.entries(daten).sort((a, b) => a[0] - b[0])), null, 1) + '\n');
// Erst nach dem Speichern als erledigt markieren
for (const m of freigaben) {
  await fetch(`${BASIS}/api/verwaltung/meldung/${m.id}`, { method: 'POST', headers: { ...kopf, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'erledigt', notiz: 'übernommen', daten: m.daten }) });
}
console.log(`${freigaben.length} Freigabe(n) verarbeitet, ${Object.keys(daten).length} insgesamt in data/betreiber.json.`);
