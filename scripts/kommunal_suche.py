"""Suche nach weiteren offenen Verwaltungsdaten zu Hofläden und Direktvermarktern (GovData / Open.NRW, CKAN-API).

Nur Datensätze mit CC0, CC BY 4.0, Datenlizenz Deutschland Zero 2.0 oder Namensnennung 2.0. Ausgelassen werden
Share-Alike-Lizenzen (CC BY-SA), nicht offene Lizenzen und Auszüge aus OpenStreetMap (ODbL, die haben wir schon direkt).
Gelesen werden GeoJSON, JSON mit Features, CSV mit Koordinaten und WFS (GeoJSON-Ausgabe). Die Auswahl, ob ein Ort ein
Hofladen ist, trifft danach scripts/import-quellen.mjs (Name muss nach Hof oder Erzeuger klingen, keine Märkte).
Benutzt von scripts/fetch-kommunal.py, wenn KOMMUNAL_SUCHE=1 gesetzt ist. Reine Hilfsfunktionen: tests/kommunal_test.py."""
import csv, hashlib, io, json, math, re, urllib.parse

BEGRIFFE = ['Hofladen', 'Hofläden', 'Direktvermarkter', 'Direktvermarktung', 'Hofverkauf', 'Milchtankstelle',
            'Regionale Produkte Erzeuger', 'Einkaufen auf dem Bauernhof', 'regionale Lebensmittel Erzeuger']
# CKAN-Schnittstellen; GovData sammelt die meisten Portale ein, Open.NRW als Ergänzung
PORTALE = [
    ('GovData', 'https://www.govdata.de/ckan/api/3/action/package_search', 'https://www.govdata.de/suche/daten/{name}'),
    ('Open.NRW', 'https://ckan.open.nrw.de/api/3/action/package_search', 'https://open.nrw/dataset/{name}'),
]
THEMA = re.compile(r'(?i)hof-?l(a|ä|ae)den|hofl(ä|ae)dchen|hofverkauf|direktvermarkt|direktverkauf|milch-?tankstelle|'
                   r'milch-?automat|regio-?mat|bauern-?l(a|ä|ae)den|ab hof|erzeuger|einkaufen auf dem bauernhof|'
                   r'regionale (produkte|lebensmittel)')
OSM_KOPIE = re.compile(r'(?i)openstreetmap|\bosm\b|geofabrik|overpass')
# Datensätze, die fetch-kommunal.py schon eigens abruft
SCHON_DA = re.compile(r'(?i)rothenburg|bayerncloud|einkaufsangebote-und-dienstleistungen-in-bayern')


def lizenz(text):
    """Lizenzkennung aus CKAN-Angaben (license_id, license_url, license_title) → unser Kürzel oder None."""
    t = str(text or '').lower()
    if not t:
        return None
    if re.search(r'by[-_ ]?sa|share[- ]?alike|weitergabe unter gleichen|by[-_ ]?nc|by[-_ ]?nd|non-?commercial|nicht-?kommerziell|'
                 r'odbl|odc-?by|dl-?by-?nc|dl-de/by-nc|nonopen|non-open|other-closed|keine bearbeitung', t):
        return None
    if re.search(r'cc-?zero|cc0|publicdomain/zero|zero-?1\.0', t):
        return 'CC0-1.0'
    if re.search(r'dl-?zero-?de|dl-de/zero|dl-de-zero|datenlizenz deutschland.{0,5}zero', t):
        return 'DL-DE-ZERO-2.0'
    if re.search(r'dl-?by-?de|dl-de/by|dl-de-by|datenlizenz deutschland.{0,5}namensnennung', t):
        return 'DL-DE-BY-2.0'
    if re.search(r'cc-?by(/|-|_)?4\.0|licenses/by/4\.0|cc by 4\.0|namensnennung 4\.0', t):
        return 'CC-BY-4.0'
    return None


def datensatz_lizenz(pkg, res=None):
    """Lizenz der Ressource, sonst des Datensatzes. Ressource mit eigener, nicht offener Lizenz → None."""
    if res is not None:
        rl = ' '.join(str(res.get(k) or '') for k in ('license', 'license_id', 'license_url', 'rights'))
        if rl.strip():
            return lizenz(rl)
    return lizenz(' '.join(str(pkg.get(k) or '') for k in ('license_id', 'license_url', 'license_title')))


def ist_osm_kopie(pkg):
    text = ' '.join(str(pkg.get(k) or '') for k in ('title', 'notes', 'license_id', 'license_title'))
    return bool(OSM_KOPIE.search(text)) or 'odbl' in text.lower()


def passt_thema(pkg):
    text = ' '.join([str(pkg.get('title') or ''), str(pkg.get('notes') or '')] +
                    [str(t.get('name') or t) if isinstance(t, dict) else str(t) for t in (pkg.get('tags') or [])])
    return bool(THEMA.search(text))


def ressource_art(res):
    """'geojson', 'json', 'csv', 'wfs' oder None."""
    f = str(res.get('format') or '').lower()
    u = str(res.get('url') or '').lower()
    if 'wfs' in f or 'service=wfs' in u:
        return 'wfs'
    if 'geojson' in f or u.endswith('.geojson') or 'outputformat=geojson' in u or 'application/geo+json' in f:
        return 'geojson'
    if f in ('csv', 'text/csv') or u.endswith('.csv'):
        return 'csv'
    if f in ('json', 'application/json') or u.endswith('.json'):
        return 'json'
    return None


# UTM (ETRS89, Zonen 32/33) → WGS84, ohne pyproj. Genauigkeit im Zentimeterbereich, reicht für Hofstandorte.
def utm_nach_wgs84(x, y, zone):
    a, f = 6378137.0, 1 / 298.257222101
    e2 = f * (2 - f)
    k0, e1 = 0.9996, (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    x -= 500000.0
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    p = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
         + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    ep2 = e2 / (1 - e2)
    c1, t1 = ep2 * math.cos(p) ** 2, math.tan(p) ** 2
    n1 = a / math.sqrt(1 - e2 * math.sin(p) ** 2)
    r1 = a * (1 - e2) / (1 - e2 * math.sin(p) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = p - (n1 * math.tan(p) / r1) * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
                                         + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720)
    lon = (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / math.cos(p)
    return math.degrees(lat), (zone - 1) * 6 - 180 + 3 + math.degrees(lon)


def nach_wgs84(x, y, crs=None):
    """Koordinatenpaar → (lat, lon) oder None. Erkennt WGS84 (auch vertauscht) und UTM 32/33 (EPSG 25832/25833)."""
    try:
        x, y = float(str(x).replace(',', '.')), float(str(y).replace(',', '.'))
    except (TypeError, ValueError):
        return None
    c = str(crs or '')
    if '25833' in c or (not c and 32000000 < x < 34000000):
        if x > 1e7: x -= 33000000
        lat, lon = utm_nach_wgs84(x, y, 33)
    elif '25832' in c or (abs(x) > 180 and 200000 < x < 900000 and 5200000 < y < 6200000):
        if x > 1e7: x -= 32000000
        lat, lon = utm_nach_wgs84(x, y, 32)
    elif abs(x) <= 180 and abs(y) <= 90:
        lon, lat = x, y  # GeoJSON: lon, lat
        if 47 <= lon <= 55.5 and 5 <= lat <= 15.5:
            lat, lon = lon, lat
    else:
        return None
    if not (47.2 <= lat <= 55.1 and 5.8 <= lon <= 15.1):
        return None
    return round(lat, 6), round(lon, 6)


def _feld(p, *muster):
    """Ersten nicht leeren Wert eines Feldes, dessen Name zu einem der Muster passt."""
    for m in muster:
        r = re.compile(m, re.I)
        for k, v in p.items():
            if r.search(str(k)) and v not in (None, '') and not isinstance(v, (dict, list)):
                return str(v).strip()
    return None


def ort_aus_feature(p, lat, lon, datensatz, lic, quelle_url, ds_id):
    """Eigenschaften eines Features → Kandidat im gemeinsamen Format (siehe scripts/import-quellen.mjs)."""
    name = _feld(p, r'^(name|bezeichnung|titel|title|betrieb|anbieter|firma|name_?1)$', r'name|bezeichnung|betrieb|anbieter')
    if not name:
        return None
    strasse = _feld(p, r'^(stra(ss|ß)e|street|adresse|anschrift|address)$', r'stra(ss|ß)e|street|adresse|anschrift')
    hnr = _feld(p, r'^(hnr|hausnummer|hausnr|housenumber)$')
    if strasse and hnr and hnr not in strasse:
        strasse = f'{strasse} {hnr}'
    plz = _feld(p, r'^(plz|postleitzahl|postal_?code|zip)$', r'plz|postleitzahl')
    ort = _feld(p, r'^(ort|stadt|gemeinde|city|locality|ortsteil)$', r'^ort')
    tel = _feld(p, r'^(tel|telefon|phone|telephone|fon)$', r'telefon|phone')
    web = _feld(p, r'^(url|website|homepage|internet|www|webseite|link)$', r'website|homepage|internet|url')
    mail = _feld(p, r'^(e-?mail|mail)$', r'mail')
    zeiten = _feld(p, r'(ö|oe)ffnungszeit|opening|zeiten')
    beschr = ' '.join(x for x in [_feld(p, r'^(art|kategorie|typ|category|angebot|sortiment|beschreibung|produkte)$',
                                         r'kategorie|angebot|sortiment|produkt')] if x)
    fid = _feld(p, r'^(id|fid|objectid|gml_id|ogc_fid|nr|lfd_?nr)$')
    if not fid:
        fid = hashlib.sha1(f'{name.lower()}|{round(lat, 3)}|{round(lon, 3)}'.encode()).hexdigest()[:10]
    if web and not re.match(r'(?i)https?://', web):
        web = 'https://' + web if '.' in web and ' ' not in web else None
    return {'id': f'{ds_id}-{fid}', 'name': name, 'kat': None, 'hier': '', 'konf': 0.85, 'hofHinweis': True,
            'lat': lat, 'lon': lon, 'websites': [web] if web else [], 'phones': [tel] if tel else [],
            'emails': [mail] if mail else [], 'socials': [], 'strasse': strasse, 'plz': plz, 'ort': ort,
            'oeffnungszeiten_text': zeiten, 'beschreibung': None, 'thema': beschr or None,
            'lizenz': lic, 'datensatz': datensatz, 'quelleUrl': quelle_url}


def features_aus_geojson(daten):
    """(Eigenschaften, lat, lon) je Punkt-Feature; Polygone über den Mittelwert der äußeren Punkte."""
    crs = ((daten.get('crs') or {}).get('properties') or {}).get('name') if isinstance(daten, dict) else None
    feats = daten.get('features') if isinstance(daten, dict) else None
    if feats is None and isinstance(daten, list):
        feats = daten
    for f in feats or []:
        if not isinstance(f, dict):
            continue
        g = f.get('geometry') or {}
        p = f.get('properties') if 'properties' in f else f
        koord = None
        if g.get('type') == 'Point':
            koord = g.get('coordinates')
        elif g.get('type') in ('MultiPoint', 'LineString'):
            koord = (g.get('coordinates') or [None])[0]
        elif g.get('type') == 'Polygon':
            ring = (g.get('coordinates') or [[]])[0]
            if ring:
                koord = [sum(c[0] for c in ring) / len(ring), sum(c[1] for c in ring) / len(ring)]
        elif not g and isinstance(p, dict):
            la, lo = _feld(p, r'^(lat|latitude|breite|y)$'), _feld(p, r'^(lon|lng|long|longitude|laenge|länge|x)$')
            koord = [lo, la] if la and lo else None
        if not koord or len(koord) < 2:
            continue
        ll = nach_wgs84(koord[0], koord[1], crs)
        if ll and isinstance(p, dict):
            yield p, ll[0], ll[1]


def features_aus_csv(text):
    probe = text[:4000]
    trenner = ';' if probe.count(';') > probe.count(',') else ','
    for z in csv.DictReader(io.StringIO(text), delimiter=trenner):
        z = {str(k or '').strip(): v for k, v in z.items()}
        la = _feld(z, r'^(lat|latitude|breite|breitengrad|y|geo_?lat)$', r'lat')
        lo = _feld(z, r'^(lon|lng|long|longitude|laenge|länge|längengrad|x|geo_?lon)$', r'lon|lng')
        if not (la and lo):
            continue
        ll = nach_wgs84(lo, la)
        if ll:
            yield z, ll[0], ll[1]


def wfs_typen(capabilities_xml):
    """(Name, Titel) der Featuretypen aus WFS-Capabilities."""
    out = []
    for block in re.findall(r'<(?:\w+:)?FeatureType\b.*?</(?:\w+:)?FeatureType>', capabilities_xml, re.S):
        n = re.search(r'<(?:\w+:)?Name>([^<]+)</', block)
        t = re.search(r'<(?:\w+:)?Title>([^<]*)</', block)
        if n:
            out.append((n.group(1).strip(), (t.group(1).strip() if t else '')))
    return out


def wfs_getfeature_urls(url, capabilities_xml, max_typen=3):
    """Je Featuretyp (Themen-Treffer zuerst) eine Liste von GetFeature-Varianten (GeoJSON, WGS84)."""
    typen = wfs_typen(capabilities_xml)
    typen.sort(key=lambda t: 0 if THEMA.search(f'{t[0]} {t[1]}') else 1)
    basis = url.split('?')[0]
    out = []
    for name, _ in typen[:max_typen]:
        varianten = []
        for version, tn, fmt in [('2.0.0', 'TYPENAMES', 'application/json'), ('1.1.0', 'TYPENAME', 'application/json'),
                                 ('1.1.0', 'TYPENAME', 'geojson'), ('2.0.0', 'TYPENAMES', 'json')]:
            q = {'SERVICE': 'WFS', 'VERSION': version, 'REQUEST': 'GetFeature', tn: name, 'OUTPUTFORMAT': fmt, 'SRSNAME': 'EPSG:4326'}
            q['COUNT' if version.startswith('2') else 'MAXFEATURES'] = 5000
            varianten.append(f'{basis}?{urllib.parse.urlencode(q)}')
        out.append(varianten)
    return out


def ds_kurz(pkg):
    """Kurze, stabile Kennung des Datensatzes für die ID, z. B. „hamm-wochenmarkte-und-hofladen“."""
    s = re.sub(r'[^a-z0-9]+', '-', str(pkg.get('name') or pkg.get('id') or '').lower()).strip('-')
    return s[:40].rstrip('-') or hashlib.sha1(str(pkg.get('id')).encode()).hexdigest()[:8]


def herausgeber(pkg):
    org = pkg.get('organization') or {}
    for k in ('publisher_name', 'maintainer', 'author'):
        for x in pkg.get('extras') or []:
            if x.get('key') == k and x.get('value'):
                return str(x['value'])[:80]
    return str(org.get('title') or pkg.get('maintainer') or pkg.get('author') or 'offene Verwaltungsdaten')[:80]


def suche(get, log=print):
    """Durchsucht die Portale und liefert (orte, bericht). get(url) → bytes."""
    gesehen, pakete, bericht, orte = set(), [], [], []
    for portal, api, seite in PORTALE:
        for b in BEGRIFFE:
            try:
                r = json.loads(get(f'{api}?{urllib.parse.urlencode({"q": b, "rows": 200})}'))
                treffer = (r.get('result') or {}).get('results') or []
            except Exception as e:  # Portal nicht erreichbar: weiter mit dem nächsten
                bericht.append({'portal': portal, 'begriff': b, 'fehler': repr(e)[:200]})
                continue
            for pkg in treffer:
                schluessel = re.sub(r'\W+', '', str(pkg.get('title') or '').lower()) + '|' + herausgeber(pkg).lower()
                if schluessel in gesehen:
                    continue
                gesehen.add(schluessel)
                pakete.append((portal, seite, pkg))
    log(f'Suche: {len(pakete)} Datensätze gefunden')
    for portal, seite, pkg in pakete:
        info = {'portal': portal, 'titel': pkg.get('title'), 'herausgeber': herausgeber(pkg),
                'lizenz': datensatz_lizenz(pkg), 'url': seite.format(name=pkg.get('name') or pkg.get('id'))}
        if not passt_thema(pkg):
            info['ergebnis'] = 'kein Hofladen-Thema'; bericht.append(info); continue
        if SCHON_DA.search(f"{pkg.get('title')} {pkg.get('name')} {herausgeber(pkg)}"):
            info['ergebnis'] = 'schon eingebunden'; bericht.append(info); continue
        if ist_osm_kopie(pkg):
            info['ergebnis'] = 'Auszug aus OpenStreetMap'; bericht.append(info); continue
        info['roh'] = {'lizenz': {k: pkg.get(k) for k in ('license_id', 'license_url', 'license_title') if pkg.get(k)},
                       'ressourcen': [{k: str(r.get(k))[:200] for k in ('format', 'url', 'license', 'mimetype') if r.get(k)}
                                      for r in (pkg.get('resources') or [])[:8]]}
        n_vorher, gelesen = len(orte), []
        for res in pkg.get('resources') or []:
            art, lic = ressource_art(res), datensatz_lizenz(pkg, res)
            if not art:
                continue
            if not lic:
                gelesen.append(f'{art}: Lizenz nicht offen'); continue
            url = str(res.get('url') or '')
            try:
                feats = []
                if art == 'wfs':
                    cap = get(url.split('?')[0] + '?SERVICE=WFS&REQUEST=GetCapabilities').decode('utf-8', 'replace')
                    info.setdefault('wfs_typen', wfs_typen(cap)[:30])
                    for varianten in wfs_getfeature_urls(url, cap):
                        letzter = None
                        for u in varianten:  # Server verstehen unterschiedliche Versionen und Ausgabeformate
                            try:
                                feats += list(features_aus_geojson(json.loads(get(u))))
                                letzter = None
                                break
                            except Exception as e:
                                letzter = e
                        if letzter is not None:
                            gelesen.append(f'wfs-typ: {repr(letzter)[:80]}')
                elif art == 'csv':
                    roh = get(url)
                    try:
                        text = roh.decode('utf-8-sig')
                    except UnicodeDecodeError:
                        text = roh.decode('latin-1')
                    feats = list(features_aus_csv(text))
                else:
                    feats = list(features_aus_geojson(json.loads(get(url))))
            except Exception as e:
                gelesen.append(f'{art}: {repr(e)[:120]}'); continue
            for p, lat, lon in feats:
                o = ort_aus_feature(p, lat, lon, info['herausgeber'], lic, info['url'], ds_kurz(pkg))
                if o:
                    orte.append(o)
            gelesen.append(f'{art}: {len(feats)} Orte')
            if len(orte) > n_vorher:
                break  # eine lesbare Ressource je Datensatz reicht
        info['ressourcen'] = gelesen
        info['orte'] = len(orte) - n_vorher
        info['ergebnis'] = 'gelesen' if info['orte'] else 'keine lesbaren Orte'
        bericht.append(info)
    # gleiche ID doppelt (Datensatz über zwei Portale) → einmal
    eindeutig = {}
    for o in orte:
        eindeutig.setdefault(o['id'], o)
    return list(eindeutig.values()), bericht
