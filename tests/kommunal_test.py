"""Tests für scripts/kommunal_suche.py (Lizenzfilter, Koordinaten, Feldzuordnung, Suche mit Testdaten).
Aufruf: python3 tests/kommunal_test.py"""
import json, os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))
import kommunal_suche as k


class Lizenz(unittest.TestCase):
    def test_offen(self):
        self.assertEqual(k.lizenz('http://dcat-ap.de/def/licenses/cc-zero'), 'CC0-1.0')
        self.assertEqual(k.lizenz('http://dcat-ap.de/def/licenses/cc-by/4.0'), 'CC-BY-4.0')
        self.assertEqual(k.lizenz('https://creativecommons.org/licenses/by/4.0/'), 'CC-BY-4.0')
        self.assertEqual(k.lizenz('http://dcat-ap.de/def/licenses/dl-zero-de/2.0'), 'DL-DE-ZERO-2.0')
        self.assertEqual(k.lizenz('dl-by-de/2.0 Datenlizenz Deutschland Namensnennung 2.0'), 'DL-DE-BY-2.0')
        self.assertEqual(k.lizenz('Datenlizenz Deutschland – Namensnennung – Version 2.0'), 'DL-DE-BY-2.0')

    def test_nicht_offen(self):
        for t in ['http://dcat-ap.de/def/licenses/cc-by-sa/4.0', 'CC BY-SA 4.0', 'odbl', 'cc-by-nc/4.0',
                  'dl-by-nc-de/1.0', 'http://dcat-ap.de/def/licenses/other-closed', '', None, 'Nutzungsbedingungen der Stadt']:
            self.assertIsNone(k.lizenz(t), t)

    def test_ressource_vor_datensatz(self):
        pkg = {'license_id': 'cc-zero'}
        self.assertEqual(k.datensatz_lizenz(pkg, {'url': 'x'}), 'CC0-1.0')
        self.assertIsNone(k.datensatz_lizenz(pkg, {'license': 'cc-by-sa/4.0'}))


class Koordinaten(unittest.TestCase):
    def test_wgs84(self):
        self.assertEqual(k.nach_wgs84(7.82, 51.68), (51.68, 7.82))
        self.assertEqual(k.nach_wgs84(51.68, 7.82), (51.68, 7.82))  # vertauscht
        self.assertIsNone(k.nach_wgs84(2.35, 48.85))  # Paris, außerhalb Deutschlands

    def test_utm32(self):
        lat, lon = k.nach_wgs84(418000, 5727000, 'EPSG:25832')  # bei Hamm
        self.assertAlmostEqual(lat, 51.68, delta=0.02)
        self.assertAlmostEqual(lon, 7.83, delta=0.02)

    def test_utm33(self):
        lat, lon = k.nach_wgs84(454000, 5735000, 'urn:ogc:def:crs:EPSG::25833')  # Forst (Lausitz)
        self.assertAlmostEqual(lat, 51.75, delta=0.03)
        self.assertAlmostEqual(lon, 14.34, delta=0.03)


class Felder(unittest.TestCase):
    def test_feature(self):
        p = {'Bezeichnung': 'Hofladen Schulze', 'Strasse': 'Dorfweg', 'Hausnummer': '3', 'PLZ': '59069', 'Ort': 'Hamm',
             'Telefon': '02385 1234', 'Internet': 'www.hof-schulze.de', 'Oeffnungszeiten': 'Fr 9-18', 'OBJECTID': 17}
        o = k.ort_aus_feature(p, 51.6, 7.9, 'Stadt Hamm', 'DL-DE-BY-2.0', 'https://x', 'hamm-maerkte')
        self.assertEqual(o['id'], 'hamm-maerkte-17')
        self.assertEqual(o['name'], 'Hofladen Schulze')
        self.assertEqual(o['strasse'], 'Dorfweg 3')
        self.assertEqual(o['websites'], ['https://www.hof-schulze.de'])
        self.assertEqual(o['phones'], ['02385 1234'])
        self.assertEqual(o['oeffnungszeiten_text'], 'Fr 9-18')
        self.assertTrue(o['hofHinweis'])

    def test_ohne_name(self):
        self.assertIsNone(k.ort_aus_feature({'Strasse': 'X 1'}, 51, 8, 'a', 'CC0-1.0', 'u', 'd'))

    def test_stabile_id_ohne_objektnummer(self):
        a = k.ort_aus_feature({'name': 'Hof A'}, 51.12345, 8.1, 'a', 'CC0-1.0', 'u', 'd')
        b = k.ort_aus_feature({'name': 'Hof A'}, 51.12346, 8.1, 'a', 'CC0-1.0', 'u', 'd')
        self.assertEqual(a['id'], b['id'])

    def test_csv(self):
        text = 'Name;Lat;Lon;Telefon\nHofladen Meyer;52,1;9,5;0511 1\nOhne Lage;;;\n'
        z = list(k.features_aus_csv(text))
        self.assertEqual(len(z), 1)
        self.assertEqual(z[0][1:], (52.1, 9.5))

    def test_geojson_utm(self):
        d = {'crs': {'properties': {'name': 'EPSG:25832'}},
             'features': [{'geometry': {'type': 'Point', 'coordinates': [418000, 5727000]}, 'properties': {'name': 'Hof'}}]}
        z = list(k.features_aus_geojson(d))
        self.assertEqual(len(z), 1)
        self.assertAlmostEqual(z[0][1], 51.68, delta=0.02)

    def test_wfs(self):
        cap = ('<wfs:FeatureType><wfs:Name>app:wochenmarkt</wfs:Name><wfs:Title>Märkte</wfs:Title></wfs:FeatureType>'
               '<wfs:FeatureType><wfs:Name>app:hoflaeden</wfs:Name><wfs:Title>Hofläden</wfs:Title></wfs:FeatureType>')
        u = k.wfs_getfeature_urls('https://geo.example/wfs?SERVICE=WFS', cap)
        self.assertIn('TYPENAMES=app%3Ahoflaeden', u[0])
        self.assertIn('SRSNAME=EPSG%3A4326', u[0])


class Suche(unittest.TestCase):
    def test_auswahl(self):
        pakete = [
            {'name': 'hoflaeden-stadt-a', 'title': 'Hofläden in Stadt A', 'license_id': 'dl-by-de/2.0',
             'organization': {'title': 'Stadt A'},
             'resources': [{'format': 'GeoJSON', 'url': 'https://a/hof.geojson'}]},
            {'name': 'osm-hoflaeden', 'title': 'OSM-Daten Hofläden NRW', 'license_id': 'odbl',
             'resources': [{'format': 'GeoJSON', 'url': 'https://b/osm.geojson'}]},
            {'name': 'hofladen-sa', 'title': 'Hofläden Kreis B', 'license_id': 'cc-by-sa/4.0',
             'resources': [{'format': 'GeoJSON', 'url': 'https://c/x.geojson'}]},
            {'name': 'parkplaetze', 'title': 'Parkplätze', 'license_id': 'cc-zero', 'resources': []},
        ]
        geo = {'type': 'FeatureCollection', 'features': [
            {'geometry': {'type': 'Point', 'coordinates': [7.8, 51.7]}, 'properties': {'name': 'Hofladen Eins', 'id': 1}}]}

        def get(url):
            if 'package_search' in url:
                return json.dumps({'result': {'results': pakete}}).encode()
            if url == 'https://a/hof.geojson':
                return json.dumps(geo).encode()
            raise AssertionError(f'unerwarteter Abruf {url}')
        orte, bericht = k.suche(get, log=lambda m: None)
        self.assertEqual([o['id'] for o in orte], ['hoflaeden-stadt-a-1'])
        self.assertEqual(orte[0]['lizenz'], 'DL-DE-BY-2.0')
        self.assertEqual(orte[0]['datensatz'], 'Stadt A')
        ergebnis = {b['titel']: b['ergebnis'] for b in bericht if 'titel' in b}
        self.assertEqual(ergebnis['OSM-Daten Hofläden NRW'], 'Auszug aus OpenStreetMap')
        self.assertEqual(ergebnis['Hofläden Kreis B'], 'keine lesbaren Orte')
        self.assertEqual(ergebnis['Parkplätze'], 'kein Hofladen-Thema')


if __name__ == '__main__':
    unittest.main()
