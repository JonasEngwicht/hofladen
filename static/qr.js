// Kleiner QR-Code-Erzeuger (Byte-Modus, Fehlerkorrektur M, Version 1–10) für Aushänge.
// Nach dem Verfahren der ISO/IEC 18004; Aufbau angelehnt an Project Nayuki (MIT).
const ECC_PRO_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOECKE = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

const rohModule = (v) => {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
};
const datenWoerter = (v) => Math.floor(rohModule(v) / 8) - ECC_PRO_BLOCK[v] * BLOECKE[v];
const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; };
function teiler(grad) {
  const r = new Array(grad).fill(0); r[grad - 1] = 1;
  let wurzel = 1;
  for (let i = 0; i < grad; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], wurzel); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    wurzel = mul(wurzel, 0x02);
  }
  return r;
}
function rest(daten, t) {
  const r = new Array(t.length).fill(0);
  for (const b of daten) { const f = b ^ r.shift(); r.push(0); t.forEach((c, i) => { r[i] ^= mul(c, f); }); }
  return r;
}
const ausrichtung = (v) => {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, schritt = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let p = v * 4 + 10; r.length < n; p -= schritt) r.splice(1, 0, p);
  return r;
};

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let v = 1;
  for (; v <= 10; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= datenWoerter(v) * 8) break;
  if (v > 10) throw new Error('Text zu lang für den QR-Code');
  // Bits: Modus Byte, Länge, Daten, Abschluss, Füllbytes
  const bits = [];
  const add = (wert, n) => { for (let i = n - 1; i >= 0; i--) bits.push((wert >>> i) & 1); };
  add(4, 4); add(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) add(b, 8);
  const kap = datenWoerter(v) * 8;
  add(0, Math.min(4, kap - bits.length));
  add(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < kap; p ^= 0xec ^ 0x11) add(p, 8);
  const daten = [];
  for (let i = 0; i < bits.length; i += 8) daten.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  // Fehlerkorrektur je Block, dann verschränken
  const nb = BLOECKE[v], ecc = ECC_PRO_BLOCK[v], roh = Math.floor(rohModule(v) / 8);
  const kurz = nb - (roh % nb), kurzLen = Math.floor(roh / nb), t = teiler(ecc);
  const bl = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const d = daten.slice(k, k + kurzLen - ecc + (i < kurz ? 0 : 1)); k += d.length;
    const e = rest(d, t);
    if (i < kurz) d.push(0);
    bl.push(d.concat(e));
  }
  const worte = [];
  for (let i = 0; i < bl[0].length; i++) for (let j = 0; j < bl.length; j++) if (i !== kurzLen - ecc || j >= kurz) worte.push(bl[j][i]);

  const n = v * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fest = Array.from({ length: n }, () => new Array(n).fill(false));
  const setze = (x, y, dunkel) => { m[y][x] = dunkel; fest[y][x] = true; };
  for (let i = 0; i < n; i++) { setze(6, i, i % 2 === 0); setze(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
    if (x >= 0 && x < n && y >= 0 && y < n) setze(x, y, d !== 2 && d !== 4);
  }
  const ap = ausrichtung(v);
  ap.forEach((a, i) => ap.forEach((b, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setze(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const format = (maske) => {
    const d = (0 << 3) | maske; // Fehlerkorrektur M = 0b00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) setze(8, i, bit(i));
    setze(8, 7, bit(6)); setze(8, 8, bit(7)); setze(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setze(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setze(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setze(8, n - 15 + i, bit(i));
    setze(8, n - 8, true);
  };
  format(0);
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) === 1, a = n - 11 + (i % 3), c = Math.floor(i / 3); setze(a, c, bit); setze(c, a, bit); }
  }
  // Datenmodule im Zickzack
  let i = 0;
  for (let rechts = n - 1; rechts >= 1; rechts -= 2) {
    if (rechts === 6) rechts = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = rechts - j, hoch = ((rechts + 1) & 2) === 0, y = hoch ? n - 1 - vert : vert;
      if (!fest[y][x] && i < worte.length * 8) { m[y][x] = ((worte[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  const MASKEN = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const maskiere = (k) => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fest[y][x] && MASKEN[k](x, y)) m[y][x] = !m[y][x]; };
  // Strafpunkte (vereinfacht: lange Reihen, 2×2-Blöcke, Hell/Dunkel-Verhältnis)
  const strafe = () => {
    let p = 0, dunkel = 0;
    for (let a = 0; a < n; a++) for (const zeile of [true, false]) {
      let lauf = 1;
      for (let b = 1; b < n; b++) {
        const c = zeile ? m[a][b] : m[b][a], c0 = zeile ? m[a][b - 1] : m[b - 1][a];
        if (c === c0) { lauf++; if (lauf === 5) p += 3; else if (lauf > 5) p++; } else lauf = 1;
      }
    }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
    for (const z of m) for (const c of z) if (c) dunkel++;
    return p + Math.floor(Math.abs(dunkel * 20 - n * n * 10) / (n * n)) * 10;
  };
  let beste = 0, besteStrafe = Infinity;
  for (let k = 0; k < 8; k++) { maskiere(k); format(k); const s = strafe(); if (s < besteStrafe) { besteStrafe = s; beste = k; } maskiere(k); }
  maskiere(beste); format(beste);
  return m;
}

// SVG mit Ruhezone von 4 Modulen
export function qrSvg(text, { farbe = '#173B2C' } = {}) {
  const m = qrMatrix(text), n = m.length, g = n + 8;
  let pfad = '';
  m.forEach((z, y) => z.forEach((c, x) => { if (c) pfad += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g} ${g}" shape-rendering="crispEdges" role="img" aria-label="QR-Code: ${text.replace(/[<&"]/g, '')}"><rect width="${g}" height="${g}" fill="#fff"/><path d="${pfad}" fill="${farbe}"/></svg>`;
}
