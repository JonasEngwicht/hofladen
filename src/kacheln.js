// Eigene Kartenkacheln: liest eine PMTiles-Datei (v3) aus R2 und liefert einzelne Vektorkacheln
// unter /kacheln/<version>/<z>/<x>/<y>.mvt aus. Keine Anfragen an Dritte, Antworten im Cloudflare-Cache.
// Jede Version ist eine eigene Datei (de-<JJJJMMTT>.pmtiles); eine neue Version bekommt neue Adressen,
// so kann nie eine alte zwischengespeicherte Kachel zur neuen Datei passen.
// Format: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
export const kachelDatei = (version) => `de-${version}.pmtiles`;

// Kachel-ID: Anzahl aller Kacheln der kleineren Zoomstufen plus Position auf der Hilbert-Kurve
export function zxyZuId(z, x, y) {
  if (z > 26 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return null;
  let acc = 0;
  for (let i = 0; i < z; i++) acc += 4 ** i;
  const n = 2 ** z;
  let d = 0, tx = x, ty = y;
  for (let s = 2 ** (z - 1); s >= 1; s /= 2) {
    const rx = (tx & s) > 0 ? 1 : 0, ry = (ty & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) { tx = n - 1 - tx; ty = n - 1 - ty; }
      [tx, ty] = [ty, tx];
    }
  }
  return acc + d;
}

const u64 = (dv, o) => dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 2 ** 32;
export function kopfLesen(buf) {
  const dv = new DataView(buf);
  const magie = new TextDecoder().decode(new Uint8Array(buf, 0, 7));
  if (magie !== 'PMTiles' || dv.getUint8(7) !== 3) throw new Error('Keine PMTiles-v3-Datei');
  return {
    rootOffset: u64(dv, 8), rootLength: u64(dv, 16), leafOffset: u64(dv, 40), tileOffset: u64(dv, 56),
    internalCompression: dv.getUint8(97), tileCompression: dv.getUint8(98), tileType: dv.getUint8(99),
    minZoom: dv.getUint8(100), maxZoom: dv.getUint8(101),
  };
}

async function entpacken(buf, art) {
  if (art === 1 || art === 0) return buf; // 0 unbekannt, 1 keine
  if (art !== 2) throw new Error(`Kompression ${art} wird nicht unterstützt`);
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

// Verzeichnis: Anzahl, dann Spalten tileId-Differenzen, runLength, length, offset (0 = direkt nach dem vorigen)
export function verzeichnisLesen(buf) {
  const b = new Uint8Array(buf);
  let p = 0;
  const varint = () => {
    let wert = 0, faktor = 1, byte;
    do { byte = b[p++]; wert += (byte & 0x7f) * faktor; faktor *= 128; } while (byte & 0x80);
    return wert;
  };
  const n = varint();
  const ids = new Array(n), lauf = new Array(n), laenge = new Array(n), offset = new Array(n);
  let id = 0;
  for (let i = 0; i < n; i++) { id += varint(); ids[i] = id; }
  for (let i = 0; i < n; i++) lauf[i] = varint();
  for (let i = 0; i < n; i++) laenge[i] = varint();
  for (let i = 0; i < n; i++) {
    const v = varint();
    offset[i] = v === 0 && i > 0 ? offset[i - 1] + laenge[i - 1] : v - 1;
  }
  return { ids, lauf, laenge, offset };
}

// Größter Eintrag mit tileId <= id
export function suchen(v, id) {
  let lo = 0, hi = v.ids.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (v.ids[m] < id) lo = m + 1; else if (v.ids[m] > id) hi = m - 1; else return m;
  }
  return hi >= 0 ? hi : -1;
}

// Speicher im Isolate: Kopf und Verzeichnisse je Datei (Dateien werden nie überschrieben)
const staende = new Map();
const blaetter = new Map();
async function lesen(env, datei, offset, length) {
  const o = await env.KARTEN.get(datei, { range: { offset, length } });
  if (!o) throw new Error('Kartendatei fehlt');
  return { buf: await o.arrayBuffer(), etag: o.etag };
}
async function kopf(env, datei) {
  if (staende.has(datei)) return staende.get(datei);
  const { buf } = await lesen(env, datei, 0, 16384);
  const k = kopfLesen(buf);
  const wurzel = verzeichnisLesen(await entpacken(buf.slice(k.rootOffset, k.rootOffset + k.rootLength), k.internalCompression));
  const s = { datei, k, wurzel };
  if (staende.size > 3) staende.delete(staende.keys().next().value);
  staende.set(datei, s);
  return s;
}
async function blatt(env, s, offset, length) {
  const key = `${s.datei}:${offset}`;
  if (blaetter.has(key)) return blaetter.get(key);
  const { buf } = await lesen(env, s.datei, s.k.leafOffset + offset, length);
  const v = verzeichnisLesen(await entpacken(buf, s.k.internalCompression));
  if (blaetter.size > 200) blaetter.delete(blaetter.keys().next().value);
  blaetter.set(key, v);
  return v;
}

export async function kachelFinden(env, datei, z, x, y) {
  const s = await kopf(env, datei);
  if (z < s.k.minZoom || z > s.k.maxZoom) return null;
  const id = zxyZuId(z, x, y);
  if (id == null) return null;
  let v = s.wurzel;
  for (let tiefe = 0; tiefe < 4; tiefe++) {
    const i = suchen(v, id);
    if (i < 0) return null;
    if (v.lauf[i] === 0) { v = await blatt(env, s, v.offset[i], v.laenge[i]); continue; }
    if (id >= v.ids[i] + v.lauf[i]) return null;
    const { buf } = await lesen(env, s.datei, s.k.tileOffset + v.offset[i], v.laenge[i]);
    return { buf, kompression: s.k.tileCompression };
  }
  return null;
}

export async function kachelAntwort(request, env, ctx, url) {
  if (!env.KARTEN) return new Response('Karten nicht eingerichtet', { status: 503 });
  const m = url.pathname.match(/^\/kacheln\/(\d{8})\/(\d{1,2})\/(\d+)\/(\d+)\.mvt$/);
  if (!m) return new Response('Nicht gefunden', { status: 404 });
  const cache = caches.default;
  const schluessel = new Request(url.origin + url.pathname);
  const treffer = await cache.match(schluessel);
  if (treffer) return treffer;
  let t;
  try { t = await kachelFinden(env, kachelDatei(m[1]), +m[2], +m[3], +m[4]); } catch (e) { return new Response(String(e.message), { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  const kopfzeilen = { 'Content-Type': 'application/vnd.mapbox-vector-tile', 'Cache-Control': 'public, max-age=2592000, immutable', 'Access-Control-Allow-Origin': url.origin };
  // Leere Kacheln (Meer, außerhalb Deutschlands) als 204, ebenfalls zwischengespeichert
  const antwort = !t ? new Response(null, { status: 204, headers: kopfzeilen })
    : t.kompression === 2 ? new Response(t.buf, { headers: { ...kopfzeilen, 'Content-Encoding': 'gzip' }, encodeBody: 'manual' })
      : new Response(t.buf, { headers: kopfzeilen });
  ctx.waitUntil(cache.put(schluessel, antwort.clone()));
  return antwort;
}

// Hochladen in Teilen (R2 Multipart) über die Verwaltung: start → teil (je ≤ 90 MB) → fertig.
// Außerdem: liste (alle Dateien), info, loeschen (für alte Versionen).
export async function kartenHochladen(request, env, url) {
  if (!env.KARTEN) return Response.json({ fehler: 'R2-Bindung KARTEN fehlt' }, { status: 503 });
  const aktion = url.searchParams.get('aktion');
  if (aktion === 'liste') {
    const l = await env.KARTEN.list({ limit: 1000 });
    return Response.json({ dateien: l.objects.map((o) => ({ datei: o.key, groesse: o.size, hochgeladen: o.uploaded })) });
  }
  const datei = url.searchParams.get('datei') || '';
  if (!/^[a-z0-9-]+\.(pmtiles|json)$/.test(datei)) return Response.json({ fehler: 'Dateiname' }, { status: 400 });
  if (aktion === 'info') {
    const o = await env.KARTEN.head(datei);
    return Response.json(o ? { datei, groesse: o.size, hochgeladen: o.uploaded } : { datei, fehlt: true });
  }
  if (aktion === 'loeschen' && request.method === 'POST') { await env.KARTEN.delete(datei); staende.delete(datei); return Response.json({ ok: true }); }
  if (aktion === 'start' && request.method === 'POST') {
    const u = await env.KARTEN.createMultipartUpload(datei, { httpMetadata: { contentType: 'application/octet-stream' } });
    return Response.json({ uploadId: u.uploadId });
  }
  const id = url.searchParams.get('uploadId');
  if (!id) return Response.json({ fehler: 'uploadId fehlt' }, { status: 400 });
  const u = env.KARTEN.resumeMultipartUpload(datei, id);
  if (aktion === 'teil' && request.method === 'PUT') {
    const nr = +url.searchParams.get('nr');
    if (!(nr >= 1 && nr <= 10000)) return Response.json({ fehler: 'nr' }, { status: 400 });
    return Response.json(await u.uploadPart(nr, request.body));
  }
  if (aktion === 'fertig' && request.method === 'POST') {
    const o = await u.complete(await request.json());
    return Response.json({ datei, groesse: o.size });
  }
  if (aktion === 'abbrechen' && request.method === 'POST') { await u.abort(); return Response.json({ ok: true }); }
  return Response.json({ fehler: 'Aktion unbekannt' }, { status: 400 });
}
