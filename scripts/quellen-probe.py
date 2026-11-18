#!/usr/bin/env python3
"""Probe 2: GovData-Datensätze im Detail (nur Auswertung)."""
import json, urllib.request, urllib.parse, io, csv
def get(url, timeout=90):
    req = urllib.request.Request(url, headers={'User-Agent': 'hofladenliste.de-probe/1.0 (hofladenliste@gmail.com)'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()
for name in ['hofladen', 'wochenmarkte-und-hofladen-in-der-stadt-hamm01c7f', 'direktvermarkter-got-rothenburg',
             'direktvermarkter-pop-up-rothenburg', 'einkaufsangebote-und-dienstleistungen-in-bayern0c57a', 'regionale-bio-produkte-in-der-ausser-haus-verpflegung-kreis-wesel88a2f']:
    print('\n=====', name)
    try:
        p = json.loads(get('https://www.govdata.de/ckan/api/3/action/package_show?id=' + urllib.parse.quote(name)))['result']
    except Exception as e:
        print('Fehler', e); continue
    print('Titel:', p.get('title'), '| Org:', (p.get('organization') or {}).get('title'))
    print('Lizenz-Felder:', p.get('license_id'), p.get('license_title'), [x for x in p.get('extras', []) if 'licen' in x.get('key', '') or 'access' in x.get('key', '') or 'contributor' in x.get('key', '')][:5])
    print('Beschreibung:', (p.get('notes') or '')[:300].replace('\n', ' '))
    for r in p.get('resources', []):
        fmt = (r.get('format') or '').split('/')[-1]
        print('  Ressource:', fmt, r.get('url'), '| Lizenz:', r.get('license'), r.get('rights'))
        if fmt in ('CSV', 'GEOJSON', 'JSON', 'JSON_LD') or (r.get('url') or '').lower().endswith(('.csv', '.geojson', '.json')):
            try:
                b = get(r['url'])
                print('    Bytes:', len(b))
                t = b[:1500].decode('utf-8', 'replace')
                print('    Anfang:', t.replace('\n', ' ⏎ ')[:1500])
                if fmt == 'GEOJSON' or r['url'].lower().endswith('geojson'):
                    j = json.loads(b); print('    Features:', len(j.get('features', [])))
            except Exception as e:
                print('    Fehler Download', repr(e)[:200])
