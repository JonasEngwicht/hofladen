// Eigene Kartenkacheln: Kachel-IDs, Verzeichnisse und das Auslesen einer kleinen PMTiles-Datei aus einem R2-Ersatz
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { zxyZuId, verzeichnisLesen, suchen, kachelFinden, kopfLesen } from '../src/kacheln.js';

const varint = (n) => { const o = []; while (n >= 128) { o.push((n % 128) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
function verzeichnis(eintraege) {
  const b = [...varint(eintraege.length)];
  let vorher = 0;
  for (const e of eintraege) { b.push(...varint(e.id - vorher)); vorher = e.id; }
  for (const e of eintraege) b.push(...varint(e.lauf));
  for (const e of eintraege) b.push(...varint(e.laenge));
  eintraege.forEach((e, i) => b.push(...varint(i > 0 && e.offset === eintraege[i - 1].offset + eintraege[i - 1].laenge ? 0 : e.offset + 1)));
  return Uint8Array.from(b);
}
function pmtiles(kacheln, { mitBlatt = false } = {}) {
  // kacheln: [[z,x,y,inhalt]] → Datei mit gzip-Verzeichnissen und gzip-Kacheln
  const daten = [], eintraege = [];
  let off = 0;
  for (const [z, x, y, inhalt] of kacheln.map((k) => [...k]).sort((a, b) => zxyZuId(a[0], a[1], a[2]) - zxyZuId(b[0], b[1], b[2]))) {
    const g = gzipSync(Buffer.from(inhalt));
    eintraege.push({ id: zxyZuId(z, x, y), lauf: 1, laenge: g.length, offset: off });
    daten.push(g); off += g.length;
  }
  let wurzel, blatt = new Uint8Array(0);
  if (mitBlatt) {
    blatt = gzipSync(verzeichnis(eintraege));
    wurzel = gzipSync(verzeichnis([{ id: eintraege[0].id, lauf: 0, laenge: blatt.length, offset: 0 }]));
  } else wurzel = gzipSync(verzeichnis(eintraege));
  const kopf = Buffer.alloc(127);
  kopf.write('PMTiles', 0); kopf[7] = 3;
  const setze = (o, v) => kopf.writeBigUInt64LE(BigInt(v), o);
  setze(8, 127); setze(16, wurzel.length); setze(40, 127 + wurzel.length); setze(48, blatt.length);
  setze(56, 127 + wurzel.length + blatt.length); setze(64, off);
  kopf[97] = 2; kopf[98] = 2; kopf[99] = 1; kopf[100] = 0; kopf[101] = 14;
  return Buffer.concat([kopf, wurzel, blatt, ...daten]);
}
const r2 = (datei) => ({ KARTEN: { get: async (_k, { range }) => ({ etag: String(datei.length), arrayBuffer: async () => datei.buffer.slice(datei.byteOffset + range.offset, datei.byteOffset + range.offset + range.length) }) } });

test('Kachel-IDs folgen der Hilbert-Kurve aus der PMTiles-Spezifikation', () => {
  assert.deepEqual([[0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0], [2, 0, 0], [2, 3, 3]].map((a) => zxyZuId(...a)), [0, 1, 2, 3, 4, 5, 15]);
  assert.equal(zxyZuId(1, 2, 0), null);
  const ids = new Set();
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) ids.add(zxyZuId(4, x, y));
  assert.equal(ids.size, 256);
  assert.equal(Math.min(...ids), 85);
});

test('Verzeichnis: Differenzen, Folge-Offsets und Suche nach dem passenden Eintrag', () => {
  const v = verzeichnisLesen(verzeichnis([{ id: 5, lauf: 1, laenge: 10, offset: 0 }, { id: 7, lauf: 3, laenge: 4, offset: 10 }, { id: 300, lauf: 0, laenge: 99, offset: 5000 }]).buffer);
  assert.deepEqual(v.ids, [5, 7, 300]);
  assert.deepEqual(v.offset, [0, 10, 5000]);
  assert.equal(suchen(v, 4), -1);
  assert.equal(suchen(v, 9), 1);
  assert.equal(suchen(v, 1000), 2);
});

for (const mitBlatt of [false, true]) {
  test(`PMTiles lesen${mitBlatt ? ' mit Blattverzeichnis' : ''}: vorhandene Kachel, fehlende Kachel`, async () => {
    const datei = pmtiles([[10, 550, 335, 'leipzig'], [10, 551, 335, 'nebenan'], [6, 34, 21, 'sachsen']], { mitBlatt });
    assert.equal(kopfLesen(datei.buffer.slice(datei.byteOffset)).maxZoom, 14);
    const env = r2(datei);
    const name = `de-2026111${mitBlatt ? 9 : 8}.pmtiles`;
    const t = await kachelFinden(env, name, 10, 551, 335);
    assert.equal(t.kompression, 2);
    assert.equal(Buffer.from(await new Response(new Blob([t.buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()).toString(), 'nebenan');
    assert.equal(await kachelFinden(env, name, 10, 552, 335), null);
    assert.equal(await kachelFinden(env, name, 15, 0, 0), null);
    assert.equal(Buffer.from(await new Response(new Blob([(await kachelFinden(env, name, 6, 34, 21)).buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()).toString(), 'sachsen');
  });
}

test('QR-Code für Aushänge: Größe passt zur Länge, Suchmuster in drei Ecken', async () => {
  const { qrMatrix, qrSvg } = await import('../static/qr.js');
  assert.equal(qrMatrix('HELLO').length, 21);
  const m = qrMatrix('https://hofladenliste.de/hof/kittlers-hofladen-riesa/?utm_source=aushang');
  const n = m.length;
  assert.equal(n, 37);
  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    assert.ok(m[y][x] && m[y + 6][x + 6] && m[y + 3][x + 3], 'Suchmuster dunkel');
    assert.ok(!m[y + 1][x + 1], 'Ring hell');
  }
  assert.match(qrSvg('x'), /^<svg[^>]+viewBox="0 0 29 29"/);
  assert.throws(() => qrMatrix('x'.repeat(400)));
});
