"""DZT Knowledge Graph (open-data-germany.org): sucht Hofläden und Direktvermarkter über den MCP-Server V2 der
Deutschen Zentrale für Tourismus und liefert sie im Kandidatenformat von scripts/fetch-kommunal.py.

Aufbau der Antworten (expandiertes JSON-LD, Schlüssel sind volle schema.org-IRIs):
- Suche (get_pois_by_criteria) liefert nur Kurzdatensätze: Name, Beschreibung, URL; Adresse und Geo sind eigene Knoten im
  selben @graph, eine Lizenz des Hofs steht dort NICHT (nur an den Bildern).
- Die Lizenz des Hofs steht in get_entity_details unter schema:sdLicense (Lizenz-URL und copyrightNotice).
Deshalb: erst Suche mit Hofbezug-Filter, Orte die wir schon haben (100 m) überspringen, dann je neuem Kandidaten ein
Detailaufruf. Übernommen werden nur CC0 und CC BY 4.0 (Nutzungsbedingungen §3: Lizenz je Eintrag, gilt auch für Adressen
und Geodaten); CC BY-SA passt nicht zu unserer ODbL-Datenbank und wird nur gezählt.
Schlüssel: Umgebungsvariable DZT_API_KEY (Header x-api-key). Doku: https://changelog-dzt-kg.readme.io/docs/v2"""
import json, math, os, re, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

MCP = 'https://proxy.opendatagermany.io/api/its/mcp'
S = 'https://schema.org/'
BEGRIFFE = ['Hofladen', 'Hofläden', 'Hofverkauf', 'Direktvermarkter', 'Direktvermarktung', 'Direktverkauf', 'Bauernladen',
            'Hofmarkt', 'Milchtankstelle', 'Regiomat', 'Hofautomat', 'Hofcafé', 'Hofkäserei', 'Imkerei', 'Selbsternte',
            'Selbstpflück', 'Erdbeerhof', 'Spargelhof', 'Obsthof']
# starker Hofbezug: Name oder Beschreibung; schwacher Hofbezug: nur im Namen (sonst viele Ferienhöfe und Restaurants)
STARK = re.compile(r'(?i)hof-?l(ä|ae)den|hof-?laden|hofl(ä|ae)dchen|hofverkauf|direktvermarkt|direktverkauf|bauern-?laden|hofmarkt|'
                   r'milch-?tankstelle|milch-?automat|regio-?mat|hofautomat|hofk(ä|ae)serei|selbst-?(ernte|pfl(ü|ue)ck)')
SCHWACH = re.compile(r'(?i)hofcaf|imkerei|erdbeerhof|spargelhof|obsthof|beerenhof')
MAX_SEITEN = 320          # 10 Treffer je Seite
MAX_DETAILS = 2500
LAUFZEIT_SEKUNDEN = 27 * 60


# ---------- JSON-LD-Helfer ----------
def _liste(v):
    return v if isinstance(v, list) else ([] if v is None else [v])


def wert(node, name, sprache='de'):
    """Textwert einer schema.org-Eigenschaft (bevorzugt Sprache de) oder None."""
    eintraege = _liste(node.get(S + name))
    for e in eintraege:
        if isinstance(e, dict) and e.get('@language') == sprache and e.get('@value'):
            return str(e['@value']).strip()
    for e in eintraege:
        if isinstance(e, dict) and e.get('@value') not in (None, ''):
            return str(e['@value']).strip()
        if isinstance(e, str) and e.strip():
            return e.strip()
    return None


def verweis(node, name, index):
    """Aufgelöster Knoten einer Eigenschaft: eingebettetes Objekt oder @id-Verweis in den Index."""
    for e in _liste(node.get(S + name)):
        if isinstance(e, dict):
            if len(e) > 1 or '@id' not in e:
                return e
            if e['@id'] in index:
                return index[e['@id']]
    return {}


def objekte(ergebnis):
    """Alle JSON-LD-Knoten eines Ergebnisses (@graph oder einzelnes Objekt)."""
    j = ergebnis.get('jsonld', ergebnis.get('results', ergebnis.get('items')))
    if isinstance(j, str):
        try: j = json.loads(j)
        except ValueError: j = []
    if isinstance(j, dict): j = j.get('@graph') or [j]
    return [o for o in (j or []) if isinstance(o, dict)]


def ist_poi(node):
    """Hauptknoten eines Orts: hat Koordinaten-Verweis (geo). Nicht nur odta:PointOfInterest, Hofläden sind oft nur
    Store/GroceryStore; Hilfsknoten (Adresse, Geo, Bilder, Urheber) haben kein geo."""
    return S + 'geo' in node or 'PointOfInterest' in json.dumps(node.get('@type', ''))


# ---------- Lizenz ----------
def lizenz_klasse(text):
    """(offene Lizenz oder None, Bezeichnung) aus Lizenz-URL oder copyrightNotice."""
    t = (text or '').lower()
    if not t: return None, '(keine)'
    if 'by-sa' in t or 'by sa' in t: return None, 'CC-BY-SA'
    if 'by-nd' in t or 'by-nc' in t or ' nc' in t or ' nd' in t: return None, 'CC-NC/ND'
    if 'publicdomain/zero' in t or 'cc0' in t or 'cc 0' in t: return 'CC0-1.0', 'CC0-1.0'
    if 'licenses/by/4.0' in t or re.search(r'cc[ -]by[ -]4', t): return 'CC-BY-4.0', 'CC-BY-4.0'
    return None, 'andere: ' + t[:60]


def _strings(v):
    if isinstance(v, str): yield v
    elif isinstance(v, dict):
        for x in v.values(): yield from _strings(x)
    elif isinstance(v, list):
        for x in v: yield from _strings(x)


def lizenz_aus_details(node):
    """Liest schema:sdLicense eines Detail-Knotens. Rückgabe: (offene Lizenz, Bezeichnung, Urheber-Text)."""
    sd = _liste(node.get(S + 'sdLicense'))
    texte = [s for x in sd for s in _strings(x)]
    url = next((s for s in texte if 'creativecommons.org' in s), None)
    hinweis = next((s for s in texte if re.search(r'(?i)\bcc[ -]?(by|0)', s)), None)
    off, label = lizenz_klasse(url or hinweis)
    urheber = re.sub(r'(?i)^\s*cc[ -]?(by(-sa)?)?[ -]?[\d.]*\s*', '', hinweis or '').strip() or None
    return off, label, urheber


# ---------- Kandidaten ----------
def hofbezug(name, beschreibung):
    return bool(STARK.search(name or '') or STARK.search(beschreibung or '') or SCHWACH.search(name or ''))


def kurzsatz_aus_suche(graph):
    """Kurzdatensätze aus einem Suchergebnis: Liste von Dicts mit Name, Adresse, Geo (Hilfsknoten aufgelöst)."""
    index = {o.get('@id'): o for o in graph if o.get('@id')}
    aus = []
    for p in graph:
        if not ist_poi(p): continue
        adr, geo = verweis(p, 'address', index), verweis(p, 'geo', index)
        try:
            lat, lon = float(wert(geo, 'latitude')), float(wert(geo, 'longitude'))
        except (TypeError, ValueError):
            continue
        aus.append({'uri': p['@id'], 'name': wert(p, 'name') or '', 'beschreibung': re.sub(r'\s+', ' ', wert(p, 'description') or ''),
                    'url': wert(p, 'url'), 'strasse': wert(adr, 'streetAddress'), 'plz': wert(adr, 'postalCode'),
                    'ort': wert(adr, 'addressLocality'), 'lat': lat, 'lon': lon})
    return aus


def kandidat(k, details):
    """Vollständiger Kandidat im Format von fetch-kommunal.py oder None (nur offene Lizenz)."""
    off, _, urheber = lizenz_aus_details(details)
    if not off: return None
    adr = verweis(details, 'address', {})
    tel, mail = wert(details, 'telephone') or wert(adr, 'telephone'), wert(details, 'email') or wert(adr, 'email')
    return {'id': 'dzt-' + k['uri'].rstrip('/').rsplit('/', 1)[-1], 'name': k['name'], 'kat': None, 'hier': '', 'konf': 0.85,
            'hofHinweis': True, 'lat': k['lat'], 'lon': k['lon'], 'websites': [k['url']] if k.get('url') else [],
            'phones': [tel] if tel else [], 'emails': [mail] if mail else [], 'socials': [],
            'strasse': k.get('strasse') or wert(adr, 'streetAddress'), 'plz': k.get('plz') or wert(adr, 'postalCode'),
            'ort': k.get('ort') or wert(adr, 'addressLocality'), 'oeffnungszeiten_text': None, 'beschreibung': None,
            'lizenz': off, 'datensatz': 'DZT Knowledge Graph', 'urheber': (urheber or '')[:120] or None,
            'quelleUrl': 'https://open-data-germany.org/knowledge-graphen/'}


# ---------- Abgleich mit dem Bestand ----------
def _zelle(lat, lon):
    return (round(lat / 0.002), round(lon / 0.002))


def meter(a, b):
    dlat, dlon = (a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * math.cos(math.radians(a[0]))
    return math.hypot(dlat, dlon)


def bestand_aufbauen(punkte):
    raster = {}
    for lat, lon in punkte:
        raster.setdefault(_zelle(lat, lon), []).append((lat, lon))
    return raster


def bestand_laden(wurzel):
    """Koordinaten aller Einträge aus OSM und offenen Quellen (data/osm-eintraege.json, data/offene-quellen.json)."""
    pts = []
    try:
        pts += [(e['lat'], e['lon']) for e in json.load(open(os.path.join(wurzel, 'data/osm-eintraege.json'), encoding='utf-8')) if e.get('lat')]
        pts += [(e['lat'], e['lon']) for e in json.load(open(os.path.join(wurzel, 'data/offene-quellen.json'), encoding='utf-8'))['neu'] if e.get('lat')]
    except (OSError, ValueError, KeyError):
        pass
    return bestand_aufbauen(pts)


def schon_da(raster, lat, lon, radius=100):
    z = _zelle(lat, lon)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            for p in raster.get((z[0] + dy, z[1] + dx), ()):
                if meter((lat, lon), p) <= radius: return True
    return False


# ---------- Abruf ----------
def antwort_lesen(roh):
    """MCP-Antwort (JSON oder Server-Sent Events) → Ergebnisobjekt (structuredContent) mit jsonld/hasMore/total."""
    text = roh.decode('utf-8') if isinstance(roh, bytes) else roh
    if text.lstrip().startswith(('event:', 'data:')):
        text = [z[5:].strip() for z in text.splitlines() if z.startswith('data:')][-1]
    rpc = json.loads(text)
    if rpc.get('error'):
        raise RuntimeError(json.dumps(rpc['error'])[:300])
    res = rpc.get('result') or {}
    if res.get('isError'):
        raise RuntimeError(json.dumps(res)[:300])
    if res.get('structuredContent'):
        return res['structuredContent']
    for c in res.get('content') or []:
        if c.get('type') == 'text':
            try: return json.loads(c['text'])
            except ValueError: return {'markdown': c['text']}
    return res


def poster(schluessel, timeout=120):
    def post(name, argumente):
        body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
                           'params': {'name': name, 'arguments': argumente}}).encode()
        req = urllib.request.Request(MCP, data=body, method='POST', headers={
            'x-api-key': schluessel, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream',
            'x-output-format': 'jsonld', 'User-Agent': 'hofladenliste.de/1.0 (+https://hofladenliste.de/quellen/)'})
        for versuch in range(3):
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    return antwort_lesen(r.read())
            except Exception:
                if versuch == 2: raise
                time.sleep(3 * (versuch + 1))
    return post


def suche_begriff(post, begriff, ende):
    """Alle Seiten eines Suchbegriffs → (Kurzdatensätze mit Hofbezug, Anzahl Treffer, Fehler)."""
    treffer, n, fehler = [], 0, None
    for seite in range(1, MAX_SEITEN + 1):
        if time.time() > ende: fehler = 'Zeitlimit'; break
        try:
            erg = post('get_pois_by_criteria', {'keywords_all': [begriff], 'page': seite})
        except Exception as e:
            fehler = f'S.{seite}: {e!r}'[:200]; break
        kurz = kurzsatz_aus_suche(objekte(erg))
        n += len(kurz)
        treffer += [k for k in kurz if hofbezug(k['name'], k['beschreibung'])]
        if not erg.get('hasMore'): break
    return treffer, n, fehler


def abruf(post, bestand, log=print, begriffe=BEGRIFFE, max_details=MAX_DETAILS, laufzeit=LAUFZEIT_SEKUNDEN):
    """Durchsucht den Knowledge Graph. Gibt (orte, bericht) zurück."""
    start = time.time(); ende = start + laufzeit
    stat = {'treffer_gesamt': 0, 'mit_hofbezug': 0, 'schon_vorhanden': 0, 'neue_kandidaten': 0, 'details_geholt': 0,
            'lizenzen': {}, 'je_begriff': {}, 'fehler': [], 'beispiele_sd_license': []}
    kandidaten = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        for begriff, (treffer, n, fehler) in zip(begriffe, ex.map(lambda b: suche_begriff(post, b, ende), begriffe)):
            stat['je_begriff'][begriff] = {'pois': n, 'hofbezug': len(treffer)}
            if fehler: stat['fehler'].append(f'{begriff}: {fehler}')
            stat['treffer_gesamt'] += n
            for k in treffer: kandidaten.setdefault(k['uri'], k)
            log(f'DZT {begriff}: {n} POIs, {len(treffer)} mit Hofbezug ({int(time.time() - start)} s)')
    stat['mit_hofbezug'] = len(kandidaten)
    neu = []
    for k in kandidaten.values():
        if schon_da(bestand, k['lat'], k['lon']): stat['schon_vorhanden'] += 1
        else: neu.append(k)
    stat['neue_kandidaten'] = len(neu)
    log(f"DZT: {len(kandidaten)} Kandidaten mit Hofbezug, {stat['schon_vorhanden']} schon vorhanden, {len(neu)} neu → Details holen")

    orte = []
    def detail(k):
        if time.time() > ende: return k, None, 'Zeitlimit'
        try:
            g = objekte(post('get_entity_details', {'uri': k['uri']}))
            return k, next((o for o in g if o.get('@id') == k['uri']), g[0] if g else {}), None
        except Exception as e:
            return k, None, repr(e)[:150]
    with ThreadPoolExecutor(max_workers=3) as ex:
        for k, det, fehler in ex.map(detail, neu[:max_details]):
            if det is None:
                stat['fehler'].append(f"Detail {k['name']}: {fehler}")
                continue
            stat['details_geholt'] += 1
            off, label, _ = lizenz_aus_details(det)
            stat['lizenzen'][label] = stat['lizenzen'].get(label, 0) + 1
            if len(stat['beispiele_sd_license']) < 3 and S + 'sdLicense' in det:
                stat['beispiele_sd_license'].append(json.dumps(det[S + 'sdLicense'], ensure_ascii=False)[:700])
            o = kandidat(k, det)
            if o: orte.append(o)
    stat['fehler'] = stat['fehler'][:10]
    log(f"DZT: Lizenzen {stat['lizenzen']}, übernommen {len(orte)} ({int(time.time() - start)} s)")
    bericht = {'titel': 'DZT Knowledge Graph (Tourismusdaten aller Länder)', 'url': 'https://open-data-germany.org/knowledge-graphen/',
               'herausgeber': 'Deutsche Zentrale für Tourismus', 'lizenz': 'je Eintrag (nur CC0 / CC BY 4.0 übernommen)',
               'ergebnis': f"{stat['mit_hofbezug']} Hof-Kandidaten, {stat['schon_vorhanden']} schon im Bestand, "
                           f"{len(orte)} neu mit offener Lizenz", 'orte': len(orte), 'roh': stat}
    return orte, bericht
