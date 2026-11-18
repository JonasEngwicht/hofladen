# Betrieb von hofladenliste.de

## Abläufe (GitHub Actions)

| Workflow | Wann | Was |
| --- | --- | --- |
| Daten aktualisieren | Mo und Do nachts, bei Änderungen am Import | OSM-Daten holen, `data/osm-eintraege.json` und `data/seiten-stand.json` committen, Deploy |
| Website-Öffnungszeiten | monatlich | Öffnungszeiten von den Websites der Höfe ergänzen (`data/ergaenzungen.json`) |
| Betreiberdaten übernehmen | täglich | freigegebene Meldungen aus `/verwaltung/` nach `data/betreiber.json` und `data/fotos/`, Deploy |
| Nur deployen | von Hand | Cloudflare-Build auslösen |
| Live-Prüfung | nach jedem Deploy | Statuscodes, Weiterleitungen, PageSpeed (mobil) |
| Tests | bei jedem Push auf einen Branch | Build und `npm test` |

## Secrets

| Wo | Name | Wofür |
| --- | --- | --- |
| GitHub | `CF_DEPLOY_HOOK` | Cloudflare-Deploy auslösen |
| GitHub | `PAGESPEED_API_KEY` | PageSpeed in der Live-Prüfung (optional) |
| GitHub **und** Cloudflare-Worker `hofladen` | `ADMIN_TOKEN` | Verwaltung `/verwaltung/` und Übernahme der Freigaben – in beiden derselbe Wert, mindestens 20 Zeichen |

## Meldungen moderieren

1. `https://hofladenliste.de/verwaltung/` öffnen und mit `ADMIN_TOKEN` anmelden.
2. Meldung prüfen (bei Übernahmen: Ist die E-Mail-Adresse plausibel dem Betrieb zuzuordnen? Im Zweifel nachfragen), bei Bedarf die Angaben im JSON korrigieren.
3. **Freigeben**: Der tägliche Workflow übernimmt die Angaben und Fotos, danach sind sie live. Eilig? Workflow „Betreiberdaten übernehmen“ von Hand starten.
4. **Ablehnen** löscht die Fotos sofort.

Angaben aus Meldungen haben Vorrang vor OpenStreetMap. Einen freigegebenen Datensatz zurücknehmen: Eintrag aus `data/betreiber.json` löschen und committen.

## Statistik

In `/verwaltung/` → „Statistik“: Suchen (PLZ, Ort, Standort), meistgesuchte Kreise und PLZ, Produkte, Klicks auf Route/Telefon/Website, Filter und „In meiner Nähe“ – als anonyme Tageszähler.

## Regeln

- Keine Daten, Texte oder Bilder anderer Verzeichnisse übernehmen.
- Listenseiten erst ab 3 Einträgen indexieren (`MIN_SEITE` in `scripts/build.mjs`).
- URLs nicht ändern; wenn doch, leitet das Seitenarchiv (`data/seiten-stand.json`) automatisch per 301 weiter.
- Keine `_redirects`-Regeln für `/…/index.html`: Cloudflare wendet sie auch auf die interne Abfrage des Workers an (alle Seiten wären 404).

## Recherche-Funde übernehmen

Funde aus einer Recherche-Datenbank (SQLite mit Tabelle `anreicherung`) übernimmt
`node scripts/recherche-uebernehmen.mjs pfad/zur/hofladen.sqlite` nach `data/recherche.json`.
Übernommen werden nur Konfidenz „hoch“ und „mittel“, keine Branchenbücher oder kommerziellen
Verzeichnisse. Die Funde füllen im Build nur leere Felder und werden auf der Hofseite mit Quelle
und Stand genannt. Öffnungszeiten werden nur strukturiert übernommen, wenn sie eindeutig lesbar
sind (`--test` prüft den Parser), sonst als Text.

## Kontakt

Für alles, wo eine E-Mail-Adresse gebraucht wird (Impressum, Datenschutz, Formular, Bots, Dienste): **hofladenliste@gmail.com**. Die Adresse steht zentral in `site.config.json`.
