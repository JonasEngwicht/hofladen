#!/usr/bin/env python3
"""Holt Hofläden und Direktvermarkter aus offenen Verwaltungsdaten (GovData / Open Data Bayern) und schreibt sie im
gemeinsamen Kandidatenformat (siehe scripts/import-quellen.mjs). Nur Datensätze bzw. Einträge mit CC0 oder CC BY 4.0;
Share-Alike-Lizenzen (CC BY-SA) passen nicht zu unserer ODbL-Datenbank und werden ausgelassen.
Mit KOMMUNAL_SUCHE=1 werden zusätzlich GovData und Open.NRW nach weiteren Datensätzen durchsucht (scripts/kommunal_suche.py,
dort auch Datenlizenz Deutschland Zero/Namensnennung 2.0); ein Bericht je Datensatz landet in <ziel>.bericht.json.
Aufruf: python scripts/fetch-kommunal.py <ziel.json>"""
import json, os, re, sys, urllib.request, datetime

ziel = sys.argv[1]
UA = {'User-Agent': 'hofladenliste.de/1.0 (+https://hofladenliste.de/quellen/; hofladenliste@gmail.com)'}
HOF = re.compile(r'(?i)hof-?laden|hofl(ä|ae)dchen|hofverkauf|direktvermarkt|direktverkauf|milch-?tankstelle|regio-?mat|bauern-?laden|hofmarkt|ab hof|hofk(ä|ae)serei')
def get(url, timeout=180):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()

orte = []
fehler = []

# 1) Direktvermarkter „Genießen ob der Tauber“, Stadt Rothenburg ob der Tauber (CC0 1.0)
try:
    for f in json.loads(get('https://opendata.rothenburg-tourismus.de/direktvermarkter-got-rothenburg.geojson'))['features']:
        p = f['properties']; lon, lat = f['geometry']['coordinates'][:2]
        if 'CC0' not in (p.get('license') or ''):
            continue
        tel = (p.get('contact_phone') or '').strip()
        orte.append({'id': f"rothenburg-{p['id']}", 'name': p['name'], 'kat': None, 'hier': '', 'konf': 0.9, 'hofHinweis': True,
                     'lat': lat, 'lon': lon, 'websites': [p['url']] if p.get('url') else [],
                     'phones': [('0' + tel) if tel and not tel.startswith(('0', '+')) else tel] if tel else [],
                     'emails': [p['contact_email']] if p.get('contact_email') else [], 'socials': [],
                     'strasse': p.get('street') or None, 'plz': p.get('postal_code') or None, 'ort': p.get('city') or None,
                     'oeffnungszeiten_text': p.get('opening_hours') or None, 'beschreibung': None,
                     'lizenz': 'CC0-1.0', 'datensatz': 'Stadt Rothenburg ob der Tauber',
                     'quelleUrl': 'https://www.govdata.de/suche/daten/direktvermarkter-got-rothenburg'})
except Exception as e:
    fehler.append(f'Rothenburg: {e!r}')

# 2) BayernCloud Tourismus „Einkauf & Dienstleistungen“ (Open Data Bayern): nur Orte mit eigener CC0- oder CC-BY-Lizenz
LIZENZ = {'https://creativecommons.org/publicdomain/zero/1.0/': 'CC0-1.0', 'https://creativecommons.org/licenses/by/4.0/': 'CC-BY-4.0'}
try:
    g = json.loads(get('https://data.bayerncloud.digital/dcat/9d164080-9226-4f32-9d07-c5a83e970a58.jsonld', 300))['@graph']
    for x in g:
        typen = x.get('@type') or []
        if isinstance(typen, str): typen = [typen]
        if any('Event' in t for t in typen):
            continue
        lic = x.get('sdLicense') or x.get('license') or x.get('cc:license')
        if isinstance(lic, dict): lic = lic.get('@id') or lic.get('url')
        if isinstance(lic, list): lic = lic[0] if lic else None
        lizenz = LIZENZ.get(lic)
        if not lizenz:
            continue
        name = x.get('name') or ''
        beschr = re.sub(r'<[^>]+>', ' ', str(x.get('description') or ''))
        if not (HOF.search(name) or HOF.search(beschr)):
            continue
        geo = x.get('geo') or {}
        if isinstance(geo, list): geo = geo[0] if geo else {}
        adr = x.get('address') or {}
        if isinstance(adr, list): adr = adr[0] if adr else {}
        if not geo.get('latitude'):
            continue
        urh = x.get('copyrightNotice') or ''
        if isinstance(urh, dict): urh = urh.get('@value') or ''
        orte.append({'id': f"bayerncloud-{x['@id']}", 'name': name, 'kat': None, 'hier': '', 'konf': 0.85, 'hofHinweis': True,
                     'lat': float(geo['latitude']), 'lon': float(geo['longitude']),
                     'websites': [adr.get('url') or x.get('url')] if (adr.get('url') or x.get('url')) else [],
                     'phones': [adr.get('telephone') or x.get('telephone')] if (adr.get('telephone') or x.get('telephone')) else [],
                     'emails': [adr.get('email') or x.get('email')] if (adr.get('email') or x.get('email')) else [], 'socials': [],
                     'strasse': adr.get('streetAddress'), 'plz': adr.get('postalCode'), 'ort': adr.get('addressLocality'),
                     'oeffnungszeiten_text': None, 'beschreibung': None, 'lizenz': lizenz,
                     'datensatz': 'BayernCloud Tourismus', 'urheber': str(urh)[:120] or None,
                     'quelleUrl': 'https://www.govdata.de/suche/daten/einkaufsangebote-und-dienstleistungen-in-bayern0c57a'})
except Exception as e:
    fehler.append(f'BayernCloud: {e!r}')

# 3) Weitere Datensätze aus GovData / Open.NRW (nur mit KOMMUNAL_SUCHE=1, zunächst für den Probelauf)
if os.environ.get('KOMMUNAL_SUCHE') == '1':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from kommunal_suche import suche
    try:
        weitere, bericht = suche(lambda u: get(u, 120), log=lambda m: print(m, file=sys.stderr))
        orte += weitere
        with open(ziel + '.bericht.json', 'w', encoding='utf-8') as f:
            json.dump(bericht, f, ensure_ascii=False, indent=1)
        print(f'Suche: {len(weitere)} Orte aus {sum(1 for b in bericht if b.get("orte"))} Datensätzen', file=sys.stderr)
    except Exception as e:
        fehler.append(f'Suche: {e!r}')

# 4) DZT Knowledge Graph (Tourismusdaten aller Länder, nur mit Secret DZT_API_KEY; scripts/dzt_kg.py)
if os.environ.get('DZT_API_KEY'):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import dzt_kg
    try:
        weitere, b = dzt_kg.abruf(dzt_kg.poster(os.environ['DZT_API_KEY']), log=lambda m: print(m, file=sys.stderr))
        orte += weitere
        pfad = ziel + '.bericht.json'
        alt = json.load(open(pfad, encoding='utf-8')) if os.path.exists(pfad) else []
        with open(pfad, 'w', encoding='utf-8') as f:
            json.dump(alt + [b], f, ensure_ascii=False, indent=1)
        print(f"DZT: {b['ergebnis']}", file=sys.stderr)
    except Exception as e:
        fehler.append(f'DZT: {e!r}')

print(f'Offene Verwaltungsdaten: {len(orte)} Orte', file=sys.stderr)
for f in fehler: print('Fehler', f[:300], file=sys.stderr)
if not orte:
    sys.exit('Keine Orte – nichts geschrieben.')
with open(ziel, 'w', encoding='utf-8') as f:
    json.dump({'quelle': 'kommunal', 'release': datetime.date.today().isoformat(), 'orte': orte}, f, ensure_ascii=False)
