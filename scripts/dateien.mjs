// Zählt die statischen Dateien des Builds. Cloudflare Workers erlaubt je Version 20.000 statische Dateien (Free),
// 100.000 mit Workers Paid. Der Build meldet die Zahl, ein Test schlägt vor dem Limit an (DATEI_WARNUNG).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const DATEI_LIMIT = 20000;
export const DATEI_WARNUNG = 19500;

// { gesamt, proTyp: [[typ, anzahl], …] } – Typ = erster Pfadteil (hof, bayern, angebot …), Dateien direkt in public/ als „/“
export function dateienZaehlen(ordner) {
  const pro = new Map();
  let gesamt = 0;
  const lauf = (d, typ) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) lauf(join(d, f.name), typ ?? f.name);
      else if (f.name !== '.assetsignore') { gesamt++; pro.set(typ ?? '/', (pro.get(typ ?? '/') || 0) + 1); }
    }
  };
  lauf(ordner, null);
  return { gesamt, proTyp: [...pro].sort((a, b) => b[1] - a[1]) };
}
