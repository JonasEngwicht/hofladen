# hofladenliste.de

Verzeichnis für Hofläden und Hofautomaten (Milchtankstellen, Eierautomaten, Regiomaten) in Deutschland.
Statische Seiten plus ein kleiner Cloudflare Worker für PLZ-Suche und Umkreissuche.

## So funktioniert die Seite

- **Startseite** `/`: PLZ-Eingabe (oder „Standort verwenden“), Übersicht nach Bundesland.
- **PLZ-Suche** `/suche?plz=03149` bzw. `/plz/03149`: Der Worker leitet per 302 auf die Seite des passenden Landkreises weiter, z. B. `/brandenburg/spree-neisse/?plz=03149`. Dort erscheinen oben die nächstgelegenen Einträge (auch aus Nachbarkreisen), darunter alle Einträge des Kreises nach Ort.
- **Bundesland** `/brandenburg/`, **Kreis** `/brandenburg/spree-neisse/`, **Detailseite** `/hof/<name-ort>/` mit Adresse, Öffnungszeiten, Kontakt, Route und Hinweisen in der Nähe.
- **API** `/api/umkreis?plz=03149` oder `?lat=..&lon=..` (Parameter `limit`, `radius`, `typ=hofladen|automat`).
- „Jetzt geöffnet“ wird im Browser aus den OSM-Öffnungszeiten berechnet (deutsche Ortszeit).

## Aufbau

| Pfad | Inhalt |
|---|---|
| `data/osm-eintraege.json` | Aufbereitete Einträge aus OpenStreetMap (wird automatisch aktualisiert) |
| `data/manuell.json` | Eigene Einträge und Korrekturen (Feld `ersetztOsm: "node/123"` ersetzt einen OSM-Eintrag) |
| `data/quellen/plz-de.csv` | PLZ → Ort, Kreis, Koordinaten (GeoNames, CC BY 4.0) |
| `scripts/fetch-osm.mjs` | Holt Hofläden/Automaten aus OSM über QLever (Uni Freiburg) |
| `scripts/import-osm.mjs` | Filtert, ordnet Kreise zu, schreibt `data/osm-eintraege.json` |
| `scripts/build.mjs` | Erzeugt `public/` (HTML, Sitemap) und `src/generated/` (Daten für den Worker) |
| `static/` | CSS, Browser-JavaScript, Öffnungszeiten-Parser, Favicon |
| `src/worker.js` | Worker: Weiterleitung, Umkreis-API, sonst statische Dateien |
| `site.config.json` | Domain, Impressum, Kontaktadresse |

Nur Node-Bordmittel, keine Abhängigkeiten.

## Deploy

Cloudflare Workers Builds (Worker `hofladen`, Production-Branch `main`) führt `npx wrangler deploy` aus; davor läuft automatisch `node scripts/build.mjs` (siehe `wrangler.jsonc`). Die Custom Domains `hofladenliste.de` und `www.hofladenliste.de` stehen in `wrangler.jsonc`.

Ausgelöst wird der Build über den Deploy Hook „datenaktualisierung“ (Cloudflare → Worker → Settings → Builds → Deploy Hooks). Die GitHub Action ruft ihn nach jedem Datenupdate auf, wenn das Repository-Secret `CF_DEPLOY_HOOK` gesetzt ist. Manuell: *Actions → Daten aktualisieren → Run workflow* oder `curl -X POST <Hook-URL>`.

## Daten aktualisieren

Die GitHub Action „Daten aktualisieren“ läuft jeden Montag (und manuell über *Actions → Daten aktualisieren → Run workflow*). Sie holt die Daten neu, committet bei Änderungen, und Cloudflare deployt danach automatisch.

Lokal:

```sh
node scripts/fetch-osm.mjs          # -> data/quellen/osm-roh.json
node scripts/import-osm.mjs data/quellen/osm-roh.json
node scripts/build.mjs
```

## Lizenzen der Daten

- Einträge: © OpenStreetMap-Mitwirkende, [ODbL](https://opendatacommons.org/licenses/odbl/). `data/osm-eintraege.json` ist eine abgeleitete Datenbank und steht ebenfalls unter ODbL. Die Quellenangabe steht im Footer jeder Seite.
- PLZ-Daten: [GeoNames](https://www.geonames.org/), CC BY 4.0 (über zauberware/postal-codes-json-xml-csv).
- Verbandslisten (z. B. Landwirtschaftskammern) nur als Hinweisquelle nutzen und Einträge einzeln prüfen, nicht komplett übernehmen (Datenbankschutz, § 87b UrhG).
