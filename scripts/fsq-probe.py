import json, os, time, urllib.request, urllib.error
tok = os.environ['HF_TOKEN']
def get(url):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {tok}', 'Range': 'bytes=0-100'})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read()[:300]
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:600]
s, b = get('https://huggingface.co/api/whoami-v2')
w = json.loads(b) if s == 200 else {}
print('whoami', s, w.get('name'), json.dumps(w.get('auth', {}))[:600])
print('dataset', get('https://huggingface.co/api/datasets/foursquare/fsq-os-places')[1][:300])
print('datei', get('https://huggingface.co/datasets/foursquare/fsq-os-places/resolve/main/release/dt=2026-11-17/places/parquet/places_000000.parquet'))
