// Fügt ein Paket mit Ortstexten in data/seitentexte.json ein und prüft Länge und Format.
// Aufruf: node scripts/ortstexte-einfuegen.mjs /tmp/paket-3.json  (Format: { "/pfad/": { titel, oben, einleitung, … } }, einleitung auch als Liste von Absätzen)
import { readFileSync, writeFileSync } from 'node:fs';
import { pruefeSeitentexte } from './seitentexte.mjs';
const ziel = new URL('../data/seitentexte.json', import.meta.url);
const alle = JSON.parse(readFileSync(ziel, 'utf8'));
const neu = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const stand = new Date().toISOString().slice(0, 10);
for (const [pfad, e] of Object.entries(neu)) {
  if (e.einleitung && Array.isArray(e.einleitung)) e.einleitung = e.einleitung.join('\n\n');
  alle[pfad] = { ...e, stand };
  console.log(pfad.padEnd(48), 'oben', String(e.oben || '').length);
}
const f = pruefeSeitentexte(alle);
if (f.length) { console.error(f.join('\n')); process.exit(1); }
writeFileSync(ziel, JSON.stringify(alle, null, 2) + '\n');
console.log(`${Object.keys(neu).length} Texte übernommen, gesamt ${Object.keys(alle).length}`);
