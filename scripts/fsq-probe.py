import json, os, time, urllib.request, duckdb
tok = os.environ['HF_TOKEN']
req = urllib.request.Request('https://huggingface.co/api/datasets/foursquare/fsq-os-places/tree/main/release', headers={'Authorization': f'Bearer {tok}'})
last = sorted(t['path'] for t in json.loads(urllib.request.urlopen(req).read()) if t['type'] == 'directory')[-1]
print('Release', last)
con = duckdb.connect()
con.execute(f"CREATE SECRET hf (TYPE HUGGINGFACE, TOKEN '{tok}')")
src = f"read_parquet('hf://datasets/foursquare/fsq-os-places/{last}/places/parquet/*.parquet')"
print(con.execute(f"DESCRIBE SELECT * FROM {src}").fetchall())
t = time.time()
print(con.execute(f"SELECT count(*) FROM {src} WHERE country = 'DE'").fetchall(), round(time.time() - t), 's')
t = time.time()
rows = con.execute(f"""SELECT name, fsq_category_labels, locality, postcode, address, website, tel, email, date_refreshed, date_closed, unresolved_flags
  FROM {src} WHERE country = 'DE' AND regexp_matches(name, '(?i)hofladen|hofverkauf|milchtankstelle|regiomat|bauernladen')""").fetchall()
print('Namenstreffer DE:', len(rows), round(time.time() - t), 's')
for r in rows[:15]: print(r)
import collections
print(collections.Counter(str(r[1])[:80] for r in rows).most_common(15))
print(collections.Counter(str(r[8])[:4] for r in rows).most_common(10))
