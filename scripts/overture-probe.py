#!/usr/bin/env python3
"""Probe: Wie viele Hofläden/Automaten aus Overture Places (offene Lizenzen) fehlen bei uns?
Nur Auswertung, schreibt nichts in data/. Läuft in GitHub Actions (braucht Internet)."""
import csv, json, math, re, subprocess, sys, collections
import duckdb

rel = sorted(l.split()[-1].strip('/') for l in subprocess.run(
    ['aws', 's3', 'ls', '--no-sign-request', 's3://overturemaps-us-west-2/release/'],
    capture_output=True, text=True, check=True).stdout.splitlines() if l.strip().startswith('PRE'))[-1]
print('Overture-Release:', rel)

NAME = r'(?i)(hofladen|hof-laden|hofverkauf|bauernladen|hofmarkt|hofk(ä|ae)serei|milchtankstelle|milchautomat|milch-automat|eierautomat|regiomat|direktvermarkt|hofshop|hof-shop|selbstbedienungs?h(ü|ue)tte|verkaufsautomat|biohof|bio-hof|obsthof|spargelhof|erdbeerhof|gem(ü|ue)sehof|gefl(ü|ue)gelhof|eierhof|kartoffelhof)'
KATS = ['farm', 'farmers_market', 'organic_grocery_store', 'dairy_farm', 'poultry_farm', 'orchard',
        'agricultural_service', 'fruits_and_vegetables', 'farm_equipment_and_supply', 'pick_your_own_farm', 'ranch']
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
SRC = f"read_parquet('s3://overturemaps-us-west-2/release/{rel}/theme=places/type=place/*', hive_partitioning=1)"
schema = {r[0]: r[1] for r in con.execute(f"DESCRIBE SELECT * FROM {SRC}").fetchall()}
print('Spalten:', {k: v[:120] for k, v in schema.items()})
if 'categories' in schema:
    KAT, ALT = 'categories.primary', "array_to_string(categories.alternate, ',')"
elif 'taxonomy' in schema:
    KAT, ALT = 'taxonomy.primary', "array_to_string(taxonomy.hierarchy, '>')"
else:
    KAT, ALT = 'basic_category', "''"
if 'basic_category' in schema:
    ALT = f"coalesce(basic_category, '') || ' | ' || {ALT}"
q = f"""
SELECT id, names.primary AS name, {KAT} AS kat, {ALT} AS alt,
  confidence, operating_status AS status, bbox.xmin AS lon, bbox.ymin AS lat,
  array_to_string(websites, ' ') AS website, array_to_string(phones, ' ') AS telefon,
  addresses[1].freeform AS strasse, addresses[1].postcode AS plz, addresses[1].locality AS ort,
  sources[1].dataset AS quelle, sources[1].license AS lizenz
FROM {SRC}
WHERE bbox.xmin BETWEEN 5.8 AND 15.1 AND bbox.ymin BETWEEN 47.2 AND 55.1
  AND (addresses[1].country = 'DE' OR addresses[1].country IS NULL)
  AND (regexp_matches(names.primary, '{NAME}') OR {KAT} IN ({','.join(repr(k) for k in KATS)}))
"""
rows = con.execute(q).fetchall()
cols = [d[0] for d in con.description]
rows = [dict(zip(cols, r)) for r in rows]
print('Kandidaten gesamt:', len(rows))

osm = json.load(open('data/osm-eintraege.json'))
grid = collections.defaultdict(list)
for e in osm:
    grid[(round(e['lat'], 2), round(e['lon'], 2))].append(e)
def naechster(lat, lon):
    best = 1e9
    for dy in (-0.01, 0, 0.01):
        for dx in (-0.01, 0, 0.01):
            for e in grid.get((round(lat + dy, 2), round(lon + dx, 2)), []):
                d = math.hypot((e['lat'] - lat) * 111320, (e['lon'] - lon) * 111320 * math.cos(math.radians(lat)))
                best = min(best, d)
    return best
for r in rows:
    r['abstand_osm_m'] = round(naechster(r['lat'], r['lon']))
    r['name_treffer'] = bool(re.search(NAME.replace('(?i)', ''), r['name'] or '', re.I))
neu = [r for r in rows if r['abstand_osm_m'] > 150 and r['status'] in (None, 'open')]

def zaehl(title, xs, key, n=25):
    print(f'\n## {title}')
    for k, v in collections.Counter(key(x) for x in xs).most_common(n):
        print(f'{v:6d}  {k}')
zaehl('Kategorien der Namenstreffer (alle)', [r for r in rows if r['name_treffer']], lambda r: r['kat'])
zaehl('Kategorien (alle Kandidaten)', rows, lambda r: r['kat'])
zaehl('Hierarchie der Namenstreffer', [r for r in rows if r['name_treffer']], lambda r: r['alt'], 15)
print('\nNicht in unserer Liste (>150 m vom nächsten OSM-Eintrag, nicht geschlossen):', len(neu))
streng = [r for r in neu if r['name_treffer']]
print('  davon mit eindeutigem Namen (Hofladen, Milchtankstelle, …):', len(streng))
print('  davon mit Konfidenz >= 0.7:', sum(1 for r in streng if (r['confidence'] or 0) >= 0.7))
print('  davon mit Website oder Telefon:', sum(1 for r in streng if r['website'] or r['telefon']))
zaehl('Quellen (eindeutige Namen, neu)', streng, lambda r: f"{r['quelle']} / {r['lizenz']}")
zaehl('Konfidenz (eindeutige Namen, neu)', streng, lambda r: f"{math.floor((r['confidence'] or 0) * 10) / 10:.1f}")
zaehl('Kategorien ohne Namenstreffer (neu)', [r for r in neu if not r['name_treffer']], lambda r: r['kat'])
print('\n## Stichprobe (eindeutige Namen, neu)')
for r in sorted(streng, key=lambda r: -(r['confidence'] or 0))[:40]:
    print(f"{(r['confidence'] or 0):.2f} | {r['name']} | {r['kat']} | {r['plz'] or ''} {r['ort'] or ''} | {r['website'] or ''} | {r['quelle']}")
print('\n## Stichprobe (niedrige Konfidenz < 0.5)')
for r in [r for r in streng if (r['confidence'] or 0) < 0.5][:15]:
    print(f"{(r['confidence'] or 0):.2f} | {r['name']} | {r['kat']} | {r['plz'] or ''} {r['ort'] or ''} | {r['abstand_osm_m']} m")

with open('overture-kandidaten.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else cols)
    w.writeheader(); w.writerows(neu)
