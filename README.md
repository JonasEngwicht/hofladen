# hofladenliste.de

Verzeichnis für Hofläden und Hofautomaten (Milchtankstellen, Eierautomaten, Regiomaten) in Deutschland – mit Karte, Öffnungszeiten, Saisonkalender und Umkreissuche.

- **Für Agenten und Entwickler:** [AGENTS.md](AGENTS.md) – Aufbau, Datenfluss, Befehle, Regeln.
- **Betrieb:** [docs/betrieb.md](docs/betrieb.md) – Workflows, Secrets, Moderation, offene Quellen.
- **Einträge pflegen:** [docs/pflege.md](docs/pflege.md).

```sh
node scripts/build.mjs   # Seiten nach public/, Worker-Daten nach src/generated/
npm test                 # bauen und testen
```

Ausgeliefert wird über einen Cloudflare Worker (`wrangler.jsonc`, Worker `hofladen`). Deploy: Action „Nur deployen“ bzw. Deploy Hook (siehe docs/betrieb.md).

## Lizenzen der Daten

- Einträge: © OpenStreetMap-Mitwirkende, [ODbL](https://opendatacommons.org/licenses/odbl/). `data/osm-eintraege.json` ist eine abgeleitete Datenbank und steht ebenfalls unter ODbL.
- Offene Quellen (Overture Maps, Foursquare Open Source Places, Karte von morgen, offene Verwaltungsdaten): Lizenz je Quelle in docs/betrieb.md und auf /quellen/.
- PLZ-Daten: [GeoNames](https://www.geonames.org/), CC BY 4.0 (über zauberware/postal-codes-json-xml-csv).
- Verbandslisten (z. B. Landwirtschaftskammern) nur als Hinweisquelle nutzen, nicht übernehmen (Datenbankschutz, § 87b UrhG).
