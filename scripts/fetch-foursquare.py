#!/usr/bin/env python3
"""Holt Hofladen-Kandidaten in Deutschland aus Foursquare Open Source Places (Apache-2.0, über Hugging Face,
Zugang mit Token in HF_TOKEN) und schreibt sie im gemeinsamen Kandidatenformat (siehe scripts/import-quellen.mjs).
Die Dateien werden einzeln geladen, lokal gefiltert und wieder gelöscht (gesamt ca. 12 GB).
Aufruf: HF_TOKEN=… python scripts/fetch-foursquare.py <ziel.json>"""
import datetime, json, os, shutil, sys, tempfile, time, urllib.request
import duckdb

ziel = sys.argv[1]
tok = os.environ.get('HF_TOKEN') or sys.exit('HF_TOKEN fehlt.')
H = {'Authorization': f'Bearer {tok}', 'User-Agent': 'hofladenliste.de/1.0 (hofladenliste@gmail.com)'}
BASIS = 'https://huggingface.co'
def api(pfad):
    with urllib.request.urlopen(urllib.request.Request(f'{BASIS}/api/datasets/foursquare/fsq-os-places/tree/main/{pfad}', headers=H), timeout=60) as r:
        return json.loads(r.read())
rel = sorted(t['path'] for t in api('release') if t['type'] == 'directory')[-1]
dateien = sorted(f['path'] for f in api(f'{rel}/places/parquet') if f['path'].endswith('.parquet'))
print('Foursquare', rel, len(dateien), 'Dateien', file=sys.stderr)

NAME = r'(?i)(hof|bauer|milch|eier|regiomat|regio-?box|automat|direktvermarkt|selbstbedienung|obst|spargel|erdbeer|gem(ü|ue)se|kartoffel|k(ä|ae)serei|gefl(ü|ue)gel|imkerei|landwirt)'
KAT = r'(?i)farm|farmers market|organic grocery|fruit and vegetable|butcher|dairy|cheese|agricultur'
tmp = tempfile.mkdtemp()
con = duckdb.connect()
rows, spalten = [], None
heute = datetime.date.today()
t0 = time.time()
for i, pfad in enumerate(dateien):
    lokal = os.path.join(tmp, 'teil.parquet')
    for versuch in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(f'{BASIS}/datasets/foursquare/fsq-os-places/resolve/main/{pfad}', headers=H), timeout=300) as r, open(lokal, 'wb') as f:
                shutil.copyfileobj(r, f, 1 << 22)
            break
        except Exception as e:
            if versuch == 2: raise
            time.sleep(5 * (versuch + 1))
    src = f"read_parquet('{lokal}')"
    if spalten is None:
        spalten = {r[0] for r in con.execute(f'DESCRIBE SELECT * FROM {src}').fetchall()}
        print('Spalten:', sorted(spalten), file=sys.stderr)
    sp = lambda n, alt='NULL': n if n in spalten else alt
    labels = f"array_to_string({sp('fsq_category_labels', '[]')}, '|')"
    q = f"""SELECT fsq_place_id AS id, name, {labels} AS labels, latitude AS lat, longitude AS lon,
        {sp('address')} AS strasse, {sp('postcode')} AS plz, {sp('locality')} AS ort, {sp('tel')} AS tel, {sp('website')} AS website,
        {sp('email')} AS email, {sp('facebook_id')} AS facebook_id, {sp('instagram')} AS instagram,
        CAST({sp('date_refreshed')} AS VARCHAR) AS refreshed, CAST({sp('date_closed')} AS VARCHAR) AS closed,
        {"array_to_string(unresolved_flags, ',')" if 'unresolved_flags' in spalten else "''"} AS flags,
        {sp('placemaker_url')} AS url
      FROM {src}
      WHERE country = 'DE' AND {sp('date_closed')} IS NULL
        AND (regexp_matches(name, '{NAME}') OR regexp_matches({labels}, '{KAT}'))"""
    cur = con.execute(q)
    cols = [d[0] for d in cur.description]
    rows += [dict(zip(cols, r)) for r in cur.fetchall()]
    os.remove(lokal)
    if i % 10 == 0: print(f'  {i + 1}/{len(dateien)} Dateien, {len(rows)} Kandidaten, {round(time.time() - t0)} s', file=sys.stderr)

def kat(labels):
    l = (labels or '').lower()
    for muster, k in [('farmers market', 'farmers_market'), ('organic grocery', 'organic_grocery_store'), ('fruit and vegetable', 'produce_store'),
                      ('butcher', 'butcher_shop'), ('cheese', 'cheese_shop'), ('dairy', 'dairy_store'), ('farm', 'farm'),
                      ('grocery', 'grocery_store'), ('restaurant', 'restaurant'), ('café', 'cafe'), ('cafe', 'cafe'), ('hotel', 'hotel'),
                      ('bed and breakfast', 'holiday_rental_home'), ('vacation rental', 'holiday_rental_home'), ('bakery', 'bakery')]:
        if muster in l: return k
    return 'food_and_beverage_store' if 'food and beverage retail' in l else None

orte = []
for r in rows:
    try: alt = (heute - datetime.date.fromisoformat((r['refreshed'] or '1900-01-01')[:10])).days
    except ValueError: alt = 99999
    konf = 0.75 if alt <= 730 and not r['flags'] else 0.55
    orte.append({'id': r['id'], 'name': r['name'], 'kat': kat(r['labels']), 'hier': r['labels'] or '', 'konf': konf,
                 'lat': r['lat'], 'lon': r['lon'], 'websites': [r['website']] if r['website'] else [], 'phones': [r['tel']] if r['tel'] else [],
                 'emails': [r['email']] if r['email'] else [],
                 'socials': ([f"https://www.facebook.com/{r['facebook_id']}"] if r['facebook_id'] else []) + ([f"https://www.instagram.com/{r['instagram']}"] if r['instagram'] else []),
                 'strasse': r['strasse'], 'plz': r['plz'], 'ort': r['ort'], 'lizenz': 'Apache-2.0', 'datensatz': 'Foursquare',
                 'quelleUrl': None})
print(f'Foursquare: {len(orte)} Kandidaten in Deutschland, {round(time.time() - t0)} s', file=sys.stderr)
if len(orte) < 1000:
    sys.exit('Zu wenige Kandidaten – Abfrage prüfen.')
with open(ziel, 'w', encoding='utf-8') as f:
    json.dump({'quelle': 'foursquare', 'release': rel.split('=')[-1], 'orte': orte}, f, ensure_ascii=False, default=str)
