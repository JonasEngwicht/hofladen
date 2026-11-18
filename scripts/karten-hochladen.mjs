#!/usr/bin/env node
// Lädt eine PMTiles-Datei in Teilen über die Verwaltung des Workers in den R2-Bucket (siehe src/kacheln.js).
// Aufruf: ADMIN_TOKEN=… node scripts/karten-hochladen.mjs <datei.pmtiles> <zielname, z. B. de-20261118.pmtiles>
// Weitere Aufrufe: … --liste | … --loeschen <zielname>
import { openSync, readSync, fstatSync, closeSync } from 'node:fs';

const BASIS = process.env.SEITE || 'https://hofladenliste.de';
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error('ADMIN_TOKEN fehlt'); process.exit(1); }
const TEIL = 64 * 1024 * 1024;

async function api(aktion, params = {}, init = {}) {
  const u = new URL('/api/verwaltung/karten', BASIS);
  u.search = new URLSearchParams({ aktion, ...params });
  for (let versuch = 1; ; versuch++) {
    try {
      const r = await fetch(u, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...init.headers }, signal: AbortSignal.timeout(600_000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j)}`);
      return j;
    } catch (e) {
      if (versuch >= 4) throw e;
      console.error(`${aktion}: Versuch ${versuch} fehlgeschlagen (${e.message}), neuer Versuch …`);
      await new Promise((ok) => setTimeout(ok, 10_000 * versuch));
    }
  }
}

const [a, b] = process.argv.slice(2);
if (a === '--liste') { console.log(JSON.stringify(await api('liste'), null, 2)); process.exit(0); }
if (a === '--loeschen') { console.log(await api('loeschen', { datei: b }, { method: 'POST' })); process.exit(0); }
if (!a || !b) { console.error('Aufruf: node scripts/karten-hochladen.mjs <datei> <zielname>'); process.exit(1); }

const fd = openSync(a, 'r');
const groesse = fstatSync(fd).size;
const n = Math.ceil(groesse / TEIL);
const { uploadId } = await api('start', { datei: b }, { method: 'POST' });
console.error(`${a}: ${(groesse / 1e6).toFixed(0)} MB in ${n} Teilen nach ${b}`);
const teile = [];
try {
  for (let i = 0; i < n; i++) {
    const len = Math.min(TEIL, groesse - i * TEIL);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, i * TEIL);
    const t = await api('teil', { datei: b, uploadId, nr: String(i + 1) }, { method: 'PUT', body: buf, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(len) } });
    teile.push({ partNumber: t.partNumber, etag: t.etag });
    console.error(`Teil ${i + 1}/${n} hochgeladen`);
  }
  console.log(JSON.stringify(await api('fertig', { datei: b, uploadId }, { method: 'POST', body: JSON.stringify(teile), headers: { 'Content-Type': 'application/json' } })));
} catch (e) {
  await api('abbrechen', { datei: b, uploadId }, { method: 'POST' }).catch(() => {});
  throw e;
} finally { closeSync(fd); }
