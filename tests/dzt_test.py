"""Tests für scripts/dzt_kg.py (Struktur des expandierten JSON-LD, Lizenzen, Bestandsabgleich, Abruf mit Testdaten).
Aufruf: python3 tests/dzt_test.py"""
import json, os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))
import dzt_kg as d

S = 'https://schema.org/'
B = 'https://data.bayerncloud.digital/api/v4/universal/'
def t(x, sprache='de'): return [{'@language': sprache, '@value': x}]
def v(x): return [{'@value': x}]

def poi(i='a1', name='Hofladen Alztaler Hofmolkerei', beschreibung='Der kleine Hofladen bietet Milchprodukte.', lat='48.13389', lon='12.58064'):
    return [
        {'@id': B + i, '@type': ['https://schema.org/Place', 'https://odta.io/voc/PointOfInterest'], S + 'name': t(name),
         S + 'description': t(beschreibung), S + 'url': [{'@value': 'https://www.alztaler-hofmolkerei.de'}],
         S + 'address': [{'@id': B + i + '-adr'}], S + 'geo': [{'@id': B + i + '-geo'}]},
        {'@id': B + i + '-adr', S + 'streetAddress': v('Hutlehen 44'), S + 'postalCode': v('84518'), S + 'addressLocality': v('Garching')},
        {'@id': B + i + '-geo', S + 'latitude': v(lat), S + 'longitude': v(lon)},
        {'@id': B + i + '-bild', S + 'license': v('https://creativecommons.org/licenses/by-sa/4.0/')},  # Bildlizenz zählt nicht
    ]

def details(lizenz_url, hinweis, i='a1'):
    return {'@id': B + i, S + 'telephone': '+49 86346272188',
            S + 'sdLicense': {'@id': 'http://onlim.com/entity/x', S + 'license': [{'@value': lizenz_url}],
                              S + 'copyrightNotice': [{'@value': hinweis}]}}


class Lizenz(unittest.TestCase):
    def test_klassen(self):
        self.assertEqual(d.lizenz_klasse('https://creativecommons.org/licenses/by/4.0/')[0], 'CC-BY-4.0')
        self.assertEqual(d.lizenz_klasse('CC BY 4.0 Tourismus Bayern')[0], 'CC-BY-4.0')
        self.assertEqual(d.lizenz_klasse('https://creativecommons.org/publicdomain/zero/1.0/')[0], 'CC0-1.0')
        for x in ['https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0 X', 'CC BY-NC 4.0', '', None, 'alle Rechte vorbehalten']:
            self.assertIsNone(d.lizenz_klasse(x)[0], x)

    def test_aus_details(self):
        off, label, urheber = d.lizenz_aus_details(details('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0 Inn-Salzach Tourismus'))
        self.assertEqual((off, label, urheber), ('CC-BY-4.0', 'CC-BY-4.0', 'Inn-Salzach Tourismus'))
        self.assertIsNone(d.lizenz_aus_details(details('https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0 X'))[0])
        self.assertEqual(d.lizenz_aus_details({})[1], '(keine)')


class Suche(unittest.TestCase):
    def test_kurzsatz_loest_knoten_auf_und_ignoriert_bildlizenz(self):
        k = d.kurzsatz_aus_suche(poi())
        self.assertEqual(len(k), 1)
        self.assertEqual((k[0]['name'], k[0]['plz'], k[0]['ort'], k[0]['strasse'], k[0]['lat'], k[0]['lon']),
                         ('Hofladen Alztaler Hofmolkerei', '84518', 'Garching', 'Hutlehen 44', 48.13389, 12.58064))

    def test_ohne_geo_kein_treffer(self):
        g = poi(); g[2] = {'@id': B + 'a1-geo'}
        self.assertEqual(d.kurzsatz_aus_suche(g), [])

    def test_hofbezug(self):
        self.assertTrue(d.hofbezug('Hofladen Müller', ''))
        self.assertTrue(d.hofbezug('Gasthof Adler', 'Im Hofladen gibt es Wurst'))
        self.assertTrue(d.hofbezug('Imkerei Honig', ''))
        self.assertFalse(d.hofbezug('Gasthof Adler', 'Restaurant mit Bauernhof-Ambiente'))
        self.assertFalse(d.hofbezug('Stadtmuseum', 'Ausstellung über Imkerei'))  # schwacher Bezug zählt nur im Namen


class Kandidat(unittest.TestCase):
    def test_felder(self):
        k = d.kurzsatz_aus_suche(poi())[0]
        o = d.kandidat(k, details('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0 Inn-Salzach Tourismus'))
        self.assertEqual((o['id'], o['name'], o['plz'], o['phones'], o['lizenz'], o['datensatz']),
                         ('dzt-a1', 'Hofladen Alztaler Hofmolkerei', '84518', ['+49 86346272188'], 'CC-BY-4.0', 'DZT Knowledge Graph'))
        self.assertEqual(o['urheber'], 'Inn-Salzach Tourismus')

    def test_sa_wird_verworfen(self):
        k = d.kurzsatz_aus_suche(poi())[0]
        self.assertIsNone(d.kandidat(k, details('https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0 X')))


class Bestand(unittest.TestCase):
    def test_schon_da(self):
        r = d.bestand_aufbauen([(48.13389, 12.58064)])
        self.assertTrue(d.schon_da(r, 48.1343, 12.5806))   # ca. 45 m
        self.assertFalse(d.schon_da(r, 48.1360, 12.5806))  # ca. 235 m
        self.assertFalse(d.schon_da(d.bestand_aufbauen([]), 48.1, 12.5))


class Antwort(unittest.TestCase):
    def test_json_und_sse(self):
        inhalt = {'jsonld': {'@graph': poi()}, 'hasMore': False}
        rpc = {'jsonrpc': '2.0', 'id': 1, 'result': {'structuredContent': inhalt}}
        self.assertEqual(len(d.objekte(d.antwort_lesen(json.dumps(rpc).encode()))), 4)
        self.assertFalse(d.antwort_lesen('event: message\ndata: ' + json.dumps(rpc) + '\n\n')['hasMore'])

    def test_fehler(self):
        with self.assertRaises(RuntimeError):
            d.antwort_lesen(json.dumps({'jsonrpc': '2.0', 'id': 1, 'error': {'code': -1, 'message': 'x'}}))


class Abruf(unittest.TestCase):
    def test_ablauf(self):
        gesucht, geholt = [], []
        def post(name, arg):
            if name == 'get_pois_by_criteria':
                gesucht.append(arg)
                if arg['page'] == 1:
                    return {'jsonld': {'@graph': poi('a1') + poi('b2', lat='50.0', lon='10.0') + poi('c3', name='Stadtmuseum', beschreibung='', lat='51', lon='11')}, 'hasMore': True}
                return {'jsonld': {'@graph': poi('a1')}, 'hasMore': False}   # a1 doppelt: nur einmal zählen
            geholt.append(arg['uri'])
            return {'jsonld': {'@graph': [details('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0 Test', i=arg['uri'].rsplit('/', 1)[-1])]}}
        bestand = d.bestand_aufbauen([(48.13389, 12.58064)])  # a1 ist schon im Bestand
        orte, b = d.abruf(post, bestand, log=lambda m: None, begriffe=['Hofladen'])
        self.assertEqual([o['id'] for o in orte], ['dzt-b2'])
        self.assertEqual(geholt, [B + 'b2'])                  # nur der neue Kandidat bekommt einen Detailaufruf
        self.assertEqual((b['roh']['mit_hofbezug'], b['roh']['schon_vorhanden'], b['roh']['neue_kandidaten']), (2, 1, 1))
        self.assertEqual(b['roh']['lizenzen'], {'CC-BY-4.0': 1})
        self.assertEqual(len(gesucht), 2)


if __name__ == '__main__':
    unittest.main()
