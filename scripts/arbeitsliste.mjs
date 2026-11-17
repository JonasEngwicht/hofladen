// Arbeitsliste für die Recherche fehlender Öffnungszeiten/Websites.
// Aufruf: node scripts/arbeitsliste.mjs [anzahl] [kreis]
// Listet Einträge ohne Öffnungszeiten UND ohne Website/Facebook/Instagram,
// die noch nicht geprüft wurden (siehe data/ergaenzungen.json).
import { readFileSync, existsSync } from 'node:fs';
const osm = JSON.parse(readFileSync('data/osm-eintraege.json', 'utf8'));
const erg = existsSync('data/ergaenzungen.json') ? JSON.parse(readFileSync('data/ergaenzungen.json', 'utf8')) : {};
const [anzahl = '40', kreisFilter] = process.argv.slice(2);
const proKreis = {};
for (const e of osm) proKreis[e.kreis] = (proKreis[e.kreis] || 0) + 1;
const offen = osm.filter((e) => !e.oeffnungszeiten && !e.website && !e.facebook && !e.instagram && !erg[e.osm]
  && (!kreisFilter || e.kreis === kreisFilter)
  && (e.name || e.strasse || e.betreiber || e.telefon));
const rang = (e) => [e.kreis === '12071' ? 0 : 1, e.name ? 0 : 1, e.typ === 'hofladen' ? 0 : 1, -proKreis[e.kreis]];
offen.sort((a, b) => { const x = rang(a), y = rang(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return a.osm.localeCompare(b.osm); });
console.log(`# offen: ${offen.length}`);
for (const e of offen.slice(0, +anzahl)) {
  console.log([e.osm, e.name || `(${e.art})`, [e.strasse, e.plz || e.plzNah, e.ort || e.ortNah].filter(Boolean).join(' '), e.telefon, e.betreiber].filter(Boolean).join(' | '));
}
