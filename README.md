# hofladenliste.de – Verzeichnis für Hofläden und Hofautomaten

Ziel: Bundesweites Verzeichnis für Hofläden und Hofautomaten (Milchtankstellen, Eier-, Fleisch- und Regiomaten) in Deutschland.

## Routing-Konzept

Empfehlung: **PLZ-Abfrage auf der Startseite, aber keine Subdomain pro PLZ.**

Warum keine Subdomain pro PLZ:
- Deutschland hat rund 8.200 PLZ. Die meisten Subdomains wären dünne oder leere Seiten, die Suchmaschinen schlecht bewerten.
- Die Autorität der Hauptdomain würde auf viele Subdomains verteilt statt gebündelt.
- Mit Subdomains pro PLZ ist die Pflege deutlich aufwendiger.

Besser:
- Pfadstruktur auf der Hauptdomain: `/brandenburg/spree-neisse/`, `/brandenburg/spree-neisse/forst/`, `/plz/03149`.
- PLZ-Eingabe auf der Startseite leitet per Cloudflare Worker (serverseitig, `302`) auf die passende Seite weiter. Suchmaschinen sehen so statische, indexierbare Seiten.
- Die gewählte Region im Cookie merken, damit die Abfrage nicht bei jedem Besuch erscheint.
- Subdomains nur dann, wenn du sie für ein Produkt brauchst (z. B. `bayern.hofladenliste.de`), nicht als Routing-Schicht.

Für die PLZ-Zuordnung (PLZ → Ort → Landkreis) brauchst du eine Postleitzahlen-Tabelle, z. B. GeoNames (CC-BY 4.0) oder die offenen Daten der Bundesnetzagentur. Lizenz vor der Nutzung prüfen.

## Datenformat

Eine JSON-Datei je Landkreis: `data/<bundesland>/<landkreis>.json`. Jeder Eintrag:

```json
{
  "id": "forst-gut-neu-sacro",
  "typ": "hofladen",            // hofladen | automat
  "automat_art": null,          // milk | eggs | meat | food (nur bei automat)
  "name": "Hofladen Gut Neu Sacro",
  "adresse": { "strasse": "Neu Sacro 13", "plz": "03149", "ort": "Forst (Lausitz)", "landkreis": "Spree-Neiße", "bundesland": "Brandenburg" },
  "koordinaten": null,          // { "lat", "lon" } oder null
  "oeffnungszeiten": "09:00–17:00 (…)",
  "kontakt": { "telefon": "…", "email": "…", "website": "…" },
  "quellen": ["https://…"],
  "verifiziert": false          // true erst nach Prüfung auf der Hof-Website oder durch den Hof
}
```

Regel: `verifiziert` bleibt `false`, bis Adresse und Öffnungszeiten direkt auf der Website des Hofes oder im Verband bestätigt sind. Unverifizierte Einträge sollten auf der Seite als „Angaben ohne Gewähr“ erscheinen.

## Datenquellen

1. **OpenStreetMap** (ODbL, Quellenangabe Pflicht). Import mit `scripts/osm_to_json.py`. Overpass-Abfrage steht im Skript-Kopf. Die Abfrage läuft nicht aus dem Repo heraus, sondern über overpass-turbo.eu (Export als JSON).
2. **Verbände, Kammern, Tourismusverbände** als Lead-Liste. Keine Massenkopie (Datenbankschutz, § 87b UrhG). Einträge einzeln prüfen.
3. **Selbsteintragung durch Höfe** (kostenloser Basiseintrag).

## Stand

- `data/brandenburg/spree-neisse.json`: 1 Eintrag (Forst, Gut Neu Sacro), Angaben aus Websuche, nicht verifiziert.
- `scripts/osm_to_json.py`: Import aus Overpass-JSON, getestet mit Beispieldaten.

Offen: OSM-Export für Deutschland (lokal), Pipeline für Seitenbau, Cloudflare-Worker für PLZ-Weiterleitung.
