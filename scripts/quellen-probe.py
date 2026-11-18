#!/usr/bin/env python3
"""Probe 3: BayernCloud-Einkauf (Lizenz je Eintrag), Hamm, Foursquare-Zugang."""
import json, os, re, urllib.request, collections
def get(url, headers=None, timeout=180):
    req = urllib.request.Request(url, headers={'User-Agent': 'hofladenliste.de-probe/1.0 (hofladenliste@gmail.com)', **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get('content-type')
b, _ = get('https://data.bayerncloud.digital/dcat/9d164080-9226-4f32-9d07-c5a83e970a58.jsonld')
j = json.loads(b)
g = j['@graph']
print('BayernCloud Einträge:', len(g))
def txt(x):
    return json.dumps(x, ensure_ascii=False)
hof = [x for x in g if re.search(r'(?i)hofladen|hofverkauf|direktvermarkt|milchtankstelle|regiomat|bauernladen|hofmarkt|ab hof', (x.get('name') or '') + ' ' + txt(x.get('dc:classification', ''))[:0] + ' ' + str(x.get('description', ''))[:400])]
print('mit Hof-Bezug (Name/Beschreibung):', len(hof))
print('Schlüssel eines Eintrags:', sorted(g[0].keys()))
lic = collections.Counter()
for x in hof:
    l = x.get('cc:license') or x.get('license') or x.get('dct:license') or x.get('schema:license')
    lic[txt(l)[:120]] += 1
print('Lizenzen (Hof):', lic.most_common(10))
lic2 = collections.Counter(txt(x.get('cc:license') or x.get('license'))[:120] for x in g)
print('Lizenzen (alle):', lic2.most_common(10))
for x in hof[:5]:
    print(txt({k: x.get(k) for k in ['name', '@type', 'address', 'geo', 'telephone', 'url', 'email', 'cc:license', 'license', 'copyrightHolder', 'author', 'dct:modified']})[:900])

print('\n=== Hamm ===')
try:
    b, ct = get('http://www.hamm.de/masterportal/hamm_open_data/wochenmarkt')
    print(ct, len(b), b[:600].decode('utf-8', 'replace').replace('\n', ' '))
except Exception as e:
    print('Fehler', repr(e)[:300])

print('\n=== Foursquare ===')
tok = os.environ.get('HF_TOKEN', '')
try:
    import duckdb
    tree = json.loads(get('https://huggingface.co/api/datasets/foursquare/fsq-os-places/tree/main/release', {'Authorization': f'Bearer {tok}'})[0])
    last = sorted(t['path'] for t in tree if t['type'] == 'directory')[-1]
    con = duckdb.connect()
    con.execute(f"CREATE SECRET hf (TYPE HUGGINGFACE, TOKEN '{tok}')")
    p = f"hf://datasets/foursquare/fsq-os-places/{last}/places/parquet/places_000000.parquet"
    print(con.execute(f"DESCRIBE SELECT * FROM read_parquet('{p}')").fetchall())
except Exception as e:
    print('Fehler Foursquare:', repr(e)[:400])
