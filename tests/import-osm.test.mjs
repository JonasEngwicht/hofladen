// Prüft, dass import-osm die erweiterten OSM-Filter richtig einordnet:
// Honigläden, Rohmilch-Automaten ohne vending-Tag, Automaten nur mit Name/Betreiber, vending=groceries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const wurzel = new URL('..', import.meta.url).pathname;

function importiere(elements) {
  const dir = mkdtempSync(join(tmpdir(), 'import-osm-'));
  try {
    cpSync(join(wurzel, 'scripts'), join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'data/quellen'), { recursive: true });
    cpSync(join(wurzel, 'data/quellen/plz-de.csv'), join(dir, 'data/quellen/plz-de.csv'));
    writeFileSync(join(dir, 'roh.json'), JSON.stringify({ elements }));
    execFileSync('node', [join(dir, 'scripts/import-osm.mjs'), join(dir, 'roh.json')], { stdio: 'pipe' });
    return new Map(JSON.parse(readFileSync(join(dir, 'data/osm-eintraege.json'), 'utf8')).map((e) => [e.osm, e]));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Forst (Lausitz) und Umgebung
const bei = (id, tags, d = 0) => ({ type: 'node', id, lat: 51.735 + d, lon: 14.64 + d, tags });

test('erweiterte OSM-Filter werden übernommen und richtig eingeordnet', () => {
  const e = importiere([
    bei(1, { shop: 'honey', name: 'Honigladen Probe' }),
    bei(2, { amenity: 'vending_machine', 'drink:raw_milk': 'yes', name: 'Hof Probe' }, 0.01),
    bei(3, { amenity: 'vending_machine', name: 'Eierautomat Probe' }, 0.02),
    bei(4, { amenity: 'vending_machine', operator: 'Regiomat Probe' }, 0.03),
    bei(5, { amenity: 'vending_machine', vending: 'groceries', name: 'Hofautomat Probe' }, 0.04),
    // groceries ohne jeden Hofbezug bleibt draußen (z. B. Supermarkt-Automat)
    bei(6, { amenity: 'vending_machine', vending: 'groceries', operator: 'Shell' }, 0.05),
  ]);
  assert.equal(e.get('node/1')?.art, 'Imkerei');
  assert.equal(e.get('node/1')?.typ, 'hofladen');
  assert.equal(e.get('node/2')?.art, 'Milchtankstelle');
  assert.equal(e.get('node/3')?.art, 'Eierautomat');
  assert.equal(e.get('node/4')?.typ, 'automat');
  assert.equal(e.get('node/5')?.typ, 'automat');
  assert.ok(!e.has('node/6'), 'Automat ohne Hofbezug muss verworfen werden');
});
