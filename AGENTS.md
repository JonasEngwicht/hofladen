# AGENTS.md – Einstieg für Agenten

hofladenliste.de: Verzeichnis für Hofläden und Hofautomaten in Deutschland (ca. 14.000 Einträge).
Statische Seiten aus einem Node-Build, ausgeliefert von einem Cloudflare Worker mit D1 (Statistik, Konten, Meldungen) und R2 (eigene Kartenkacheln).
Das Repo ist **öffentlich**: keine Secrets, keine personenbezogenen Notizen.

## Befehle

```sh
node scripts/build.mjs        # baut public/ (≈18.000 Dateien) und src/generated/ (Daten für den Worker)
npm test                      # baut und testet (node:test, keine Abhängigkeiten)
npm run test:schnell          # nur testen, wenn public/ schon aktuell ist
```

Keine npm-Abhängigkeiten: nur Node-Bordmittel (Node 22). Ausnahme: einige Abrufe offener Quellen sind Python (`scripts/*.py`, nur in den Workflows).

## Aufbau

| Pfad | Inhalt |
|---|---|
| `scripts/build.mjs` | Einstieg des Builds; lädt `scripts/build/*.mjs` in fester Reihenfolge |
| `scripts/build/daten.mjs` | alle Datenquellen laden, zusammenführen, bereinigen, ableiten (Kreise, Orte, Kategorien) |
| `scripts/build/html.mjs` | `seite()` (Kopf, Meta, JSON-LD, Fuß), HTML-Helfer |
| `scripts/build/grundlagen.mjs` | Ausgabe, Texte aus Daten, Orte und Umkreise, Sitemap-Hilfen, `MIN_SEITE` |
| `scripts/build/startseite.mjs` … `themen.mjs` | je eine Gruppe von Seitentypen (Start/Typen, Regionen, Höfe, Themen) |
| `scripts/build/abschluss.mjs` | robots.txt, Sitemaps, Seitenarchiv, Daten für den Worker |
| `scripts/*.mjs` | Helfer (`lib`, `pixel`, `pflege`, `quellen`, `bereinigen`, `seitentexte`) und Import-/Pflegeskripte |
| `src/worker.js` | Worker: Weiterleitungen (https, www, 301/410), Suche, APIs, Formulare, Verwaltung |
| `src/betrieb.js`, `src/eintraege.js` | Betreiber-Bereich und Mails; Zugriff auf Eintragszeilen (Feldliste dort) |
| `static/` | CSS und Browser-JS (`app.js` lädt Karte, Route, Betrieb … bei Bedarf nach); `helfer.js`, `oh.js`, `karte.js` nutzen Build und Browser gemeinsam |
| `tests/` | Tests; `hilfen.mjs` lädt den Worker mit nachgebautem Asset-Server |
| `docs/` | `betrieb.md` (Workflows, Secrets, Moderation), `pflege.md`, Berichte |
| `.github/workflows/` | Datenläufe, Deploy, Live-Prüfung; gemeinsame Schritte in `.github/actions/` |

## Daten und Vorrang

Alles landet im Build in einer Liste `eintraege` (`scripts/build/daten.mjs`). Bei widersprüchlichen Angaben gilt (schwach → stark):

1. `data/osm-eintraege.json` (OpenStreetMap, Workflow „Daten aktualisieren“) und `data/offene-quellen.json` (Overture, Foursquare, Karte von morgen, Verwaltungsdaten; IDs `o-`/`f-`/`k-`/`g-`)
2. Ergänzungen nur für leere Felder: `data/ergaenzungen.json` (Hof-Websites), `data/recherche.json`, `data/impressum.json`
3. eigene Pflege: `data/pflege.json` (`aenderungen`, `neu`, `geschlossen`; Format: `docs/pflege.md`)
4. Angaben der Betriebe: `data/betreiber.json` (freigegebene Meldungen), `data/betrieb-export.json`

Weitere Eingaben: `data/quellen/plz-de.csv` (PLZ → Ort/Kreis), `data/osm-maerkte.json`, `data/haltestellen.json`, `data/regionen/*.json` (Regionsprofile), `data/seitentexte.json` (gepflegte Texte je Seite, Format in `scripts/seitentexte.mjs`; welche lokalen Seiten noch keinen haben: `docs/seitentexte-offen.md`; Ortstexte in 25er-Paketen nach Relevanz: `docs/ortstexte-pakete.md`, Anleitung `docs/ortstexte-anleitung.md`).
`data/seiten-stand.json` (Hash und lastmod je Seite, Grundlage für 301/410) schreibt nur CI – **nie von Hand ändern**.

Stabile IDs: `n`/`w`/`r` + Zahl (OSM), `o-`/`f-`/`k-`/`g-` (offene Quellen), `b` + Zahl (Betrieb), `m-` (eigene Pflege).

## Änderungen ausliefern

1. Branch anlegen, kleine Commits, Tests zu jeder Änderung (`npm test` muss grün sein).
2. `bash scripts/pr-mergen.sh <branch> "<titel>" <datei-mit-pr-text>`: PR per REST, wartet auf die Checks, merged. (In Claude-Sitzungen ist GraphQL gesperrt → `gh api repos/...` statt `gh pr`.)
3. `git checkout main && git pull`, dann `gh workflow run deploy.yml --ref main`. Ein Push auf main deployt **nicht** von selbst; Datenläufe rufen den Deploy Hook selbst auf.
4. Nach ca. 5 Minuten prüft die Action „Live-Prüfung“ Statuscodes, Weiterleitungen, Header und Antwortzeiten (Log lesen oder `gh workflow run live-check.yml`).

Für Refactorings: Ausgabe vorher und nachher mit festem `BUILD_DATUM=…` bauen und `public/` sowie `src/generated/` vergleichen – sie sollen byte-gleich bleiben (bis auf `?v=`).

## Feste Regeln

- **Quellen:** nur OpenStreetMap (ODbL, Quelle nennen), offene Quellen mit Lizenzhinweis, Betreiber und eigene Pflege. Keine Daten, Texte oder Bilder von Wettbewerbern; kein Scraping von Google Maps, Branchenbüchern o. Ä.
- **URLs:** `/bundesland/kreis/`, `/bundesland/kreis/ort/` und `/hof/<name>-<ort>/` bleiben. Jede Änderung bekommt eine 301 (läuft automatisch über das Seitenarchiv), entfernte Höfe liefern 410.
- **Indexierung:** Listenseiten unter 3 Einträgen `noindex`; Umgebungsseiten („Hofläden in X und Umgebung“) ohne eigenen Eintrag im Ort und Schreibvarianten desselben Orts mit fast gleicher Liste `noindex` (`UEBERDECKT` in `grundlagen.mjs`); Formular-, Login-, Verwaltungs- und Suchseiten `noindex`; robots.txt sperrt `/suche`, `/api/`, `/merkliste/`, `/verwaltung/`.
- **Titel ≤ 580 px, Beschreibung ≤ 1000 px** (`scripts/pixel.mjs`, Test für alle Seiten). Neue Seitentypen mit kurzen Titelvarianten über `passend(...)`.
- **Strukturierte Daten** nur für echte, sichtbare Angaben; kein `aggregateRating` ohne echte Bewertungen.
- **Keine Parameter-Links** in Übersichten: Filter als `#produkt=…`/`#filter=…`; andere interne Links mit `?` bekommen automatisch `nofollow`.
- **Dritte nur mit Zustimmung:** Kacheln, Schriften, Analytics und Karten kommen vom eigenen Server oder laden erst nach Einwilligung. Teilen-Links ohne fremde Skripte.
- **E-Mails an Betriebe** nur nach Freigabe durch Jonas. Kontakt überall: hofladenliste@gmail.com.
- **Secrets** (nur Namen): GitHub `CF_DEPLOY_HOOK`, `ADMIN_TOKEN`, `RESEND_API_KEY`, `HUGGINGFACE_KEY`, `PAGESPEED_API_KEY`, Turnstile; Worker `RESEND_API_KEY`, `TURNSTILE_*`, `ADMIN_TOKEN`. Nie ausgeben, speichern oder in Links einbauen.
