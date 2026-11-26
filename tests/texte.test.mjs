// Sprachliche Qualität der erzeugten Seiten: Einzahl/Mehrzahl und Entfernungsangaben aus den Vorlagen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seiten } from './hilfen.mjs';

// Muster, die nur durch falsche Einzahl/Mehrzahl oder 0-km-Entfernungen entstehen
const FEHLER = [' sind 1 ', ' 1 Höfe', ' 1 Einträge', ' 1 Kreisen', ' 1 Bundesländern', 'am selben Ort vom', 'etwa am selben Ort entfernt', 'davon 1 Automaten', ' 1 Hofläden'];

test('keine Zahlwort- und Entfernungsfehler in den Seiten', () => {
  const treffer = new Map(FEHLER.map((m) => [m, []]));
  for (const [pfad, html] of seiten()) {
    for (const m of FEHLER) if (html.includes(m)) treffer.get(m).push(pfad);
  }
  const rest = [...treffer].filter(([, p]) => p.length).map(([m, p]) => `„${m.trim()}“ auf ${p.length} Seiten, z. B. ${p.slice(0, 3).join(', ')}`);
  assert.deepEqual(rest, []);
});
