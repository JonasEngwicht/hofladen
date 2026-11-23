"""Diagnose DZT Knowledge Graph: gibt je Format die Rohantwort für einen einzelnen Hof aus (Lizenzfeld, verknüpfte Knoten).
Aufruf (nur in der Action, braucht DZT_API_KEY): python scripts/dzt-diagnose.py"""
import json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dzt_kg as d

def roh(argumente, name='get_pois_by_criteria', fmt='jsonld'):
    body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': name, 'arguments': argumente}}).encode()
    req = urllib.request.Request(d.MCP, data=body, method='POST', headers={
        'x-api-key': os.environ['DZT_API_KEY'], 'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream', 'x-output-format': fmt, 'User-Agent': 'hofladenliste.de/1.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode('utf-8')

print('=== tools/list ===')
body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list'}).encode()
req = urllib.request.Request(d.MCP, data=body, method='POST', headers={'x-api-key': os.environ['DZT_API_KEY'], 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'})
print(urllib.request.urlopen(req, timeout=60).read().decode()[:6000])
for fmt in ('jsonld', 'both'):
    print(f'=== get_pois_by_criteria name=Hofladen Alztaler, Format {fmt} ===')
    t = roh({'name': 'Hofladen Alztaler Hofmolkerei'}, fmt=fmt)
    print(len(t), 'Zeichen'); print(t[:9000])
print('=== get_entity_details ===')
erg = d.antwort_lesen(roh({'name': 'Hofladen Alztaler Hofmolkerei'}))
uri = next((o['@id'] for o in d.objekte(erg) if 'PointOfInterest' in json.dumps(o.get('@type'))), None)
print('uri', uri)
if uri:
    t = roh({'uri': uri}, name='get_entity_details'); print(len(t), 'Zeichen'); print(t[:9000])
