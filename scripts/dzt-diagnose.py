"""Diagnose DZT Knowledge Graph: Struktur der Detailantwort eines Hofs (Schlüssel des Hauptknotens, Lizenzfelder).
Aufruf (nur in der Action, braucht DZT_API_KEY): python scripts/dzt-diagnose.py"""
import json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dzt_kg as d

post = d.poster(os.environ['DZT_API_KEY'])
kurz = lambda v, n=220: json.dumps(v, ensure_ascii=False)[:n]
for name in ('Hofladen Alztaler Hofmolkerei', 'Hofladen'):
    print(f'=== Suche {name} ===')
    erg = post('get_pois_by_criteria', {'name': name} if ' ' in name else {'keywords_all': [name]})
    obj = d.objekte(erg)
    poi = [o for o in obj if 'PointOfInterest' in json.dumps(o.get('@type', ''))]
    print('Knoten:', len(obj), 'POIs:', len(poi), 'Seitenfelder:', {k: v for k, v in erg.items() if k != 'jsonld'})
    for o in poi[:3]:
        print('POI-Schlüssel:', [k.rsplit('/', 1)[-1] for k in o])
    lic = [(o['@id'][-12:], kurz(o.get('https://schema.org/license')), kurz(o.get('https://schema.org/copyrightNotice'))) for o in obj if 'https://schema.org/license' in o]
    print('Knoten mit license:', len(lic), lic[:6])
    if name != 'Hofladen':
        uri = poi[0]['@id']
        det = d.objekte(d.antwort_lesen(json.dumps({'jsonrpc': '2.0', 'id': 1, 'result': {'structuredContent': {'jsonld': json.loads(json.dumps({'@graph': []}))}}})))
        r = post('get_entity_details', {'uri': uri})
        g = d.objekte(r)
        print('Detail-Knoten:', len(g))
        hauptk = next(o for o in g if o['@id'] == uri)
        for k, v in hauptk.items():
            print('  ', k.replace('https://', ''), '=', kurz(v, 160))
        for o in g:
            for k, v in o.items():
                if 'icen' in k or 'opyright' in k:
                    print('LIZENZ', o['@id'][-12:], k.replace('https://', ''), kurz(v, 200))
