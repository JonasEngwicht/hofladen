"""Tests für scripts/dzt_kg.py (Lizenzfilter, Feldzuordnung, Antwortformate, Abruf mit Testdaten).
Aufruf: python3 tests/dzt_test.py"""
import json, os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))
import dzt_kg as d

HOF = {'@id': 'https://onlim.com/entity/abc', '@type': ['schema:LocalBusiness'], 'name': 'Hofladen Müller',
       'sdLicense': 'https://creativecommons.org/licenses/by/4.0/', 'geo': {'latitude': '51.7', 'longitude': '14.6'},
       'address': {'streetAddress': 'Dorfstr. 1', 'postalCode': '03149', 'addressLocality': 'Forst', 'telephone': '0356 1'}}


class Lizenz(unittest.TestCase):
    def test_offen(self):
        self.assertEqual(d.lizenz_von(HOF)[0], 'CC-BY-4.0')
        self.assertEqual(d.lizenz_von({'license': {'@id': 'https://creativecommons.org/publicdomain/zero/1.0/'}})[0], 'CC0-1.0')

    def test_nicht_offen(self):
        for l in ['https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0', '', 'https://creativecommons.org/licenses/by-nc/4.0/']:
            self.assertIsNone(d.lizenz_von({'sdLicense': l})[0], l)


class Ort(unittest.TestCase):
    def test_felder(self):
        o = d.ort_aus(HOF)
        self.assertEqual((o['name'], o['plz'], o['ort'], o['strasse'], o['phones']), ('Hofladen Müller', '03149', 'Forst', 'Dorfstr. 1', ['0356 1']))
        self.assertEqual((o['lat'], o['lon'], o['lizenz'], o['datensatz']), (51.7, 14.6, 'CC-BY-4.0', 'DZT Knowledge Graph'))

    def test_ohne_hofbezug_oder_lizenz(self):
        self.assertIsNone(d.ort_aus({**HOF, 'name': 'Stadtmuseum'}))
        self.assertIsNone(d.ort_aus({**HOF, 'sdLicense': 'https://creativecommons.org/licenses/by-sa/4.0/'}))
        self.assertIsNone(d.ort_aus({**HOF, 'geo': {}}))


class Antwort(unittest.TestCase):
    def test_json_und_sse(self):
        inhalt = {'jsonld': [HOF], 'hasMore': False}
        rpc = {'jsonrpc': '2.0', 'id': 1, 'result': {'content': [{'type': 'text', 'text': json.dumps(inhalt)}]}}
        self.assertEqual(d.objekte(d.antwort_lesen(json.dumps(rpc).encode()))[0]['name'], 'Hofladen Müller')
        sse = 'event: message\ndata: ' + json.dumps(rpc) + '\n\n'
        self.assertFalse(d.antwort_lesen(sse)['hasMore'])

    def test_fehler(self):
        with self.assertRaises(RuntimeError):
            d.antwort_lesen(json.dumps({'jsonrpc': '2.0', 'id': 1, 'error': {'code': -1, 'message': 'x'}}))

    def test_graph(self):
        self.assertEqual(len(d.objekte({'jsonld': {'@graph': [HOF, HOF]}})), 2)


class Abruf(unittest.TestCase):
    def test_paging_und_dubletten(self):
        aufrufe = []
        def post(name, arg):
            aufrufe.append(arg)
            if arg['page'] == 1: return {'jsonld': [HOF], 'hasMore': True}
            return {'jsonld': [HOF, {**HOF, '@id': 'x2', 'name': 'Museum', 'sdLicense': 'CC BY-SA'}], 'hasMore': False}
        orte, b = d.abruf(post, log=lambda m: None)
        self.assertEqual(len(orte), 1)          # gleiche @id nur einmal, Museum ohne Hofbezug/Lizenz fällt weg
        self.assertEqual(b['roh']['treffer'], 2)
        self.assertEqual(len(aufrufe), 2 * len(d.BEGRIFFE))


if __name__ == '__main__':
    unittest.main()
