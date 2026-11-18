#!/usr/bin/env python3
"""Holt Hofladen-Kandidaten in Deutschland aus Overture Maps Places (offene Lizenzen: CDLA-Permissive-2.0,
Apache-2.0, CC0; keine OSM-Daten) und schreibt sie als JSON-Liste. Läuft in GitHub Actions.
Aufruf: python scripts/fetch-overture.py <ziel.json>
Die Auswahl (eindeutige Namen, Konfidenz, Doppelungen) macht scripts/import-overture.mjs."""
import json, subprocess, sys
import duckdb

ziel = sys.argv[1]
rel = sorted(l.split()[-1].strip('/') for l in subprocess.run(
    ['aws', 's3', 'ls', '--no-sign-request', 's3://overturemaps-us-west-2/release/'],
    capture_output=True, text=True, check=True).stdout.splitlines() if l.strip().startswith('PRE'))[-1]
print('Overture-Release:', rel, file=sys.stderr)

# Grob vorfiltern; die genaue Auswahl passiert in Node (testbar).
NAME = r'(?i)(hof|bauer|milch|eier|regiomat|regio-?box|automat|direktvermarkt|selbstbedienung|obst|spargel|erdbeer|gem(ü|ue)se|kartoffel|k(ä|ae)serei|gefl(ü|ue)gel|imkerei|landwirt|gut )'
KATS = ['farm', 'farmers_market', 'organic_grocery_store', 'dairy_farm', 'poultry_farm', 'orchard', 'agriculture',
        'agricultural_service', 'pick_your_own_farm', 'ranch', 'greengrocer', 'produce_store', 'dairy_store',
        'agritourism', 'livestock_breeder', 'cheese_shop', 'butcher_shop']
SRC = f"read_parquet('s3://overturemaps-us-west-2/release/{rel}/theme=places/type=place/*', hive_partitioning=1)"
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
schema = {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {SRC}").fetchall()}
KAT = 'taxonomy.primary' if 'taxonomy' in schema else 'categories.primary'
HIER = "array_to_string(taxonomy.hierarchy, '>')" if 'taxonomy' in schema else "''"
q = f"""
SELECT id, names.primary AS name, {KAT} AS kat, {HIER} AS hier, confidence AS konf, operating_status AS status,
  round((bbox.ymin + bbox.ymax) / 2, 6) AS lat, round((bbox.xmin + bbox.xmax) / 2, 6) AS lon,
  websites, phones, emails, socials,
  addresses[1].freeform AS strasse, addresses[1].postcode AS plz, addresses[1].locality AS ort,
  sources[1].dataset AS quelle, sources[1].license AS lizenz
FROM {SRC}
WHERE bbox.xmin BETWEEN 5.8 AND 15.1 AND bbox.ymin BETWEEN 47.2 AND 55.1
  AND coalesce(addresses[1].country, 'DE') = 'DE'
  AND coalesce(operating_status, 'open') = 'open'
  AND confidence >= 0.5
  AND (regexp_matches(names.primary, '{NAME}') OR {KAT} IN ({','.join(repr(k) for k in KATS)}))
"""
cur = con.execute(q)
cols = [d[0] for d in cur.description]
rows = [dict(zip(cols, r)) for r in cur.fetchall()]
print('Kandidaten:', len(rows), file=sys.stderr)
if len(rows) < 5000:
    sys.exit('Zu wenige Kandidaten – Abfrage oder Schema prüfen.')
with open(ziel, 'w', encoding='utf-8') as f:
    json.dump({'release': rel, 'orte': rows}, f, ensure_ascii=False)
