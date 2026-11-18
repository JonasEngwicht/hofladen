import json, os, time, urllib.request, duckdb, collections
tok = os.environ['HF_TOKEN']
req = urllib.request.Request('https://huggingface.co/api/datasets/foursquare/fsq-os-places/tree/main/release', headers={'Authorization': f'Bearer {tok}'})
last = sorted(t['path'] for t in json.loads(urllib.request.urlopen(req).read()) if t['type'] == 'directory')[-1]
print('Release', last)
con = duckdb.connect()
con.execute(f"CREATE SECRET hf (TYPE HUGGINGFACE, TOKEN '{tok}')")
con.execute("SET threads=16")
src = f"read_parquet('hf://datasets/foursquare/fsq-os-places/{last}/places/parquet/*.parquet')"
print(con.execute(f"DESCRIBE SELECT * FROM {src}").fetchall())
t = time.time()
rows = con.execute(f"""SELECT name, fsq_category_labels, locality, postcode, address, website, tel, email, date_refreshed, date_closed, unresolved_flags
  FROM {src} WHERE country = 'DE' AND (regexp_matches(name, '(?i)hof|bauer|milch|eier|regiomat|automat|direktvermarkt|obst|spargel|kartoffel')
   OR array_to_string(fsq_category_labels, '|') ILIKE '%farm%')""").fetchall()
print('Kandidaten DE:', len(rows), round(time.time() - t), 's')
st = [r for r in rows if __import__('re').search('(?i)hofladen|hofverkauf|milchtankstelle|regiomat|bauernladen', r[0] or '')]
print('davon eindeutige Namen:', len(st))
for r in st[:12]: print(r)
print(collections.Counter(str(r[1])[:90] for r in st).most_common(12))
print(collections.Counter(str(r[8])[:4] for r in st).most_common(10))
print(collections.Counter(str(r[10])[:60] for r in st).most_common(6))
