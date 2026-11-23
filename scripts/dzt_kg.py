"""DZT Knowledge Graph (open-data-germany.org): sucht Hofläden und Direktvermarkter über den MCP-Server V2 der
Deutschen Zentrale für Tourismus und liefert sie im Kandidatenformat von scripts/fetch-kommunal.py.
Nur Einträge mit CC0 oder CC BY 4.0 (wie bei der BayernCloud); CC BY-SA und andere Lizenzen werden nur gezählt.
Schlüssel: Umgebungsvariable DZT_API_KEY (Header x-api-key). Doku: https://changelog-dzt-kg.readme.io/docs/v2"""
import json, re, urllib.request

MCP = 'https://proxy.opendatagermany.io/api/its/mcp'
BEGRIFFE = ['Hofladen', 'Hofläden', 'Hofverkauf', 'Direktvermarkter', 'Direktvermarktung', 'Direktverkauf', 'Bauernladen',
            'Hofmarkt', 'Milchtankstelle', 'Regiomat', 'Hofautomat', 'Hofcafé', 'Hofkäserei', 'Imkerei', 'Selbsternte',
            'Selbstpflück', 'Erdbeerhof', 'Spargelhof', 'Obsthof', 'Bauernhof', 'Ab Hof']
HOF = re.compile(r'(?i)hof-?laden|hofl(ä|ae)dchen|hofverkauf|direktvermarkt|direktverkauf|milch-?tankstelle|regio-?mat|'
                 r'bauern-?laden|hofmarkt|ab hof|hofk(ä|ae)serei|hofautomat|hofcaf|imkerei|selbst-?(ernte|pflück)|'
                 r'erdbeerhof|spargelhof|obsthof|bauernhof')
OFFEN = {'publicdomain/zero/1.0': 'CC0-1.0', 'licenses/by/4.0': 'CC-BY-4.0'}
MAX_SEITEN = 60  # 10 Treffer je Seite


def lizenz_von(x):
    """Gibt (offene Lizenz oder None, Rohwert) zurück."""
    roh = x.get('sdLicense') or x.get('license') or x.get('cc:license') or x.get('schema:license') or ''
    if isinstance(roh, list): roh = roh[0] if roh else ''
    if isinstance(roh, dict): roh = roh.get('@id') or roh.get('url') or roh.get('name') or ''
    roh = str(roh)
    if '/by-sa/' in roh or '-sa' in roh.lower():
        return None, roh
    for teil, name in OFFEN.items():
        if teil in roh:
            return name, roh
    return None, roh


def _erstes(v):
    return (v[0] if v else None) if isinstance(v, list) else v


def _text(v):
    v = _erstes(v)
    if isinstance(v, dict): v = v.get('@value') or v.get('name')
    return re.sub(r'<[^>]+>', ' ', str(v or '')).strip()


def ort_aus(x):
    """Wandelt ein JSON-LD-Objekt in einen Kandidaten oder None (ohne Koordinaten, ohne Hofbezug, ohne offene Lizenz)."""
    lizenz, _ = lizenz_von(x)
    name = _text(x.get('name'))
    if not lizenz or not name:
        return None
    if not (HOF.search(name) or HOF.search(_text(x.get('description'))) or HOF.search(json.dumps(x.get('@type', '')))):
        return None
    geo = _erstes(x.get('geo')) or {}
    try:
        lat, lon = float(_erstes(geo.get('latitude'))), float(_erstes(geo.get('longitude')))
    except (TypeError, ValueError):
        return None
    adr = _erstes(x.get('address')) or {}
    wert = lambda k: _text(adr.get(k)) or _text(x.get(k)) or None
    urh = _text(x.get('copyrightNotice')) or _text(x.get('author')) or _text(x.get('publisher'))
    return {'id': f"dzt-{x.get('@id')}", 'name': name, 'kat': None, 'hier': '', 'konf': 0.85, 'hofHinweis': True,
            'lat': lat, 'lon': lon, 'websites': [wert('url')] if wert('url') else [],
            'phones': [wert('telephone')] if wert('telephone') else [], 'emails': [wert('email')] if wert('email') else [],
            'socials': [], 'strasse': wert('streetAddress'), 'plz': wert('postalCode'), 'ort': wert('addressLocality'),
            'oeffnungszeiten_text': None, 'beschreibung': None, 'lizenz': lizenz,
            'datensatz': 'DZT Knowledge Graph', 'urheber': urh[:120] or None,
            'quelleUrl': 'https://open-data-germany.org/knowledge-graphen/'}


def antwort_lesen(roh):
    """MCP-Antwort (JSON oder Server-Sent Events) → Ergebnisobjekt mit jsonld/hasMore/total."""
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
            try:
                return json.loads(c['text'])
            except ValueError:
                return {'markdown': c['text']}
    return res


def objekte(ergebnis):
    """Alle JSON-LD-Objekte aus einem Ergebnis (Liste, @graph oder einzelnes Objekt)."""
    j = ergebnis.get('jsonld', ergebnis.get('results', ergebnis.get('items')))
    if isinstance(j, str):
        try: j = json.loads(j)
        except ValueError: j = []
    if isinstance(j, dict): j = j.get('@graph') or [j]
    return [o for o in (j or []) if isinstance(o, dict)]


def poster(schluessel, timeout=120):
    def post(name, argumente):
        body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
                           'params': {'name': name, 'arguments': argumente}}).encode()
        req = urllib.request.Request(MCP, data=body, method='POST', headers={
            'x-api-key': schluessel, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream',
            'x-output-format': 'jsonld', 'User-Agent': 'hofladenliste.de/1.0 (+https://hofladenliste.de/quellen/)'})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return antwort_lesen(r.read())
    return post


def abruf(post, log=print):
    """Durchsucht den Knowledge Graph mit allen Begriffen. Gibt (orte, bericht) zurück."""
    gesehen, orte = {}, []
    stat = {'treffer': 0, 'mit_hofbezug': 0, 'lizenzen': {}, 'fehler': [], 'je_begriff': {}, 'beispiele': []}
    for begriff in BEGRIFFE:
        n = 0
        for seite in range(1, MAX_SEITEN + 1):
            try:
                erg = post('get_pois_by_criteria', {'keywords_all': [begriff], 'page': seite})
            except Exception as e:
                stat['fehler'].append(f'{begriff} S.{seite}: {e!r}'[:200]); break
            obj = objekte(erg)
            if seite == 1 and len(stat['beispiele']) < 2 and obj:
                stat['beispiele'].append({k: obj[0].get(k) for k in list(obj[0])[:25]})
            for x in obj:
                i = x.get('@id')
                if not i or i in gesehen: continue
                gesehen[i] = 1; n += 1
                _, roh = lizenz_von(x)
                stat['lizenzen'][roh or '(keine)'] = stat['lizenzen'].get(roh or '(keine)', 0) + 1
                if HOF.search(_text(x.get('name'))): stat['mit_hofbezug'] += 1
                o = ort_aus(x)
                if o: orte.append(o)
            if not erg.get('hasMore') or not obj: break
        stat['je_begriff'][begriff] = n
        log(f'DZT {begriff}: {n} neue Treffer')
    stat['treffer'] = len(gesehen)
    bericht = {'titel': 'DZT Knowledge Graph (Tourismusdaten aller Länder)', 'url': 'https://open-data-germany.org/knowledge-graphen/',
               'herausgeber': 'Deutsche Zentrale für Tourismus', 'lizenz': 'je Eintrag (nur CC0 / CC BY 4.0 übernommen)',
               'ergebnis': f"{stat['treffer']} Treffer, {len(orte)} mit offener Lizenz und Koordinaten", 'orte': len(orte), 'roh': stat}
    return orte, bericht
