#!/usr/bin/env python3
"""Probe für weitere offene Quellen (nur Auswertung)."""
import json, os, sys, time, urllib.request, urllib.parse
def get(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': 'hofladenliste.de-probe/1.0 (hofladenliste@gmail.com)', **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

print('=== Foursquare (Hugging Face) ===')
tok = os.environ.get('HF_TOKEN', '')
print('Token gesetzt:', bool(tok))
H = {'Authorization': f'Bearer {tok}'}
try:
    tree = json.loads(get('https://huggingface.co/api/datasets/foursquare/fsq-os-places/tree/main/release', H))
    rel = sorted(t['path'] for t in tree if t['type'] == 'directory')
    print('Releases:', rel[-3:])
    last = rel[-1]
    files = json.loads(get(f'https://huggingface.co/api/datasets/foursquare/fsq-os-places/tree/main/{last}/places/parquet', H))
    print('Dateien:', len(files), 'Größe gesamt GB:', round(sum(f.get('size', 0) for f in files) / 1e9, 2))
    import duckdb
    con = duckdb.connect()
    con.execute(f"CREATE SECRET hf (TYPE HUGGINGFACE, TOKEN '{tok}')")
    p = f"hf://datasets/foursquare/fsq-os-places/{last}/places/parquet/{files[0]['path'].split('/')[-1]}"
    print(con.execute(f"DESCRIBE SELECT * FROM read_parquet('{p}')").fetchall())
    t = time.time()
    n = con.execute(f"SELECT count(*) FROM read_parquet('{p}') WHERE country = 'DE'").fetchone()
    print('DE in Datei 1:', n, 'Sekunden:', round(time.time() - t, 1))
    print(con.execute(f"SELECT name, fsq_category_labels, locality, website, tel, date_refreshed, date_closed FROM read_parquet('{p}') WHERE country = 'DE' AND regexp_matches(name, '(?i)hofladen|hofverkauf|milchtankstelle') LIMIT 10").fetchall())
except Exception as e:
    print('Fehler Foursquare:', repr(e)[:500])

print('\n=== Karte von morgen ===')
for q in ['hofladen', '#hofladen', 'hofverkauf', 'direktvermarktung', '#direktvermarktung', 'milchtankstelle', 'regiomat', '#regional']:
    try:
        u = 'https://api.ofdb.io/v0/search?' + urllib.parse.urlencode({'bbox': '47.2,5.8,55.1,15.1', 'text': q, 'limit': 2000})
        d = json.loads(get(u))
        vis = d.get('visible', [])
        print(q, '→', len(vis), 'sichtbar,', len(d.get('invisible', [])), 'unsichtbar', [v.get('title') for v in vis[:4]])
    except Exception as e:
        print(q, 'Fehler', repr(e)[:300])
try:
    d = json.loads(get('https://api.ofdb.io/v0/search?' + urllib.parse.urlencode({'bbox': '47.2,5.8,55.1,15.1', 'text': 'hofladen', 'limit': 3})))
    ids = ','.join(v['id'] for v in d['visible'][:3])
    print(json.dumps(json.loads(get(f'https://api.ofdb.io/v0/entries/{ids}')), ensure_ascii=False)[:2500])
except Exception as e:
    print('Fehler Details', repr(e)[:300])
try:
    raw = get('https://kartevonmorgen.org/api/v0/export/entries.csv?' + urllib.parse.urlencode({'bbox': '47.2,5.8,55.1,15.1', 'text': 'hofladen'}))
    print('CSV-Export Bytes:', len(raw), raw[:600].decode('utf-8', 'replace'))
except Exception as e:
    print('CSV-Export Fehler', repr(e)[:300])

print('\n=== GovData ===')
seen = {}
for q in ['hofladen', 'hofläden', 'direktvermarkter', 'direktvermarktung', 'bauernladen', 'milchtankstelle', 'hofverkauf', 'regionale produkte einkaufen']:
    try:
        d = json.loads(get('https://www.govdata.de/ckan/api/3/action/package_search?' + urllib.parse.urlencode({'q': q, 'rows': 50})))
        for p in d['result']['results']:
            if p['id'] in seen: continue
            seen[p['id']] = p
            fm = sorted({(r.get('format') or '').upper() for r in p.get('resources', [])})
            print(f"- {p['title'][:90]} | Lizenz {p.get('license_id')} | {fm} | {p.get('organization', {}).get('title', '')[:40] if p.get('organization') else ''} | {p.get('name')}")
    except Exception as e:
        print(q, 'Fehler', repr(e)[:300])
print('GovData-Datensätze gesamt:', len(seen))
