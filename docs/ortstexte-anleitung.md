# Ortstexte schreiben: Anleitung für die Pakete

Ziel (Auftrag von Jonas, 21.11.2026): Alle indexierbaren Orts- und Stadtseiten („Hofläden in X und Umgebung“) bekommen nacheinander einen eigenen, individuellen Text mit lokalen Besonderheiten – in Paketen à 25, absteigend nach Relevanz.

- **Arbeitsliste:** `docs/ortstexte-pakete.md` (✓ = fertig). Relevanz = 3 × Zahl der Postleitzahlen des Orts + eigene Einträge im Ort. Neu erzeugen: `SEITENTEXTE_OFFEN=1 node scripts/build.mjs`, danach `git checkout data/seiten-stand.json`.
- **Fakten je Ort** (Kreis, eigene Einträge mit Art und Angebot, nächste Höfe): `SEITENTEXTE_OFFEN=1 ORTSTEXTE_DATEN=/tmp/orte.json node scripts/build.mjs` → `/tmp/orte.json` (Feld `paket`).
- **Format:** `scripts/seitentexte.mjs`. Texte werden in `data/seitentexte.json` unter dem Pfad der Seite gespeichert.
- **Einfügen:** Paket als JSON schreiben (`{ "/pfad/": { … } }`), dann `node scripts/ortstexte-einfuegen.mjs <datei>` (prüft Format und Länge, setzt `stand`).

## Aufbau eines Textes

| Feld | Inhalt |
|---|---|
| `titel` | „Hofläden in <Ort>: gut zu wissen“ |
| `oben` | 2–3 Sätze, höchstens 450 Zeichen (Ziel 200–300): was den Ort für Hofladen-Käufer besonders macht – Landschaft, typische Produkte, Auffälliges aus der Liste |
| `einleitung` | 2 kurze Absätze: regionale Spezialitäten und Anbaugebiete, Märkte, Ausflugs- oder Radtipps, Hinweis auf Nachbarkreise |
| `faq` | 0–1 Frage mit lokalem Bezug (Frage endet mit „?“). Keine Fragen, die die automatische FAQ schon beantwortet (Anzahl, nächster Hof, Automat in der Nähe) |
| `saison` | 3 Einträge `{ titel, zeit }` – typisch für die Gegend |
| `links` | 1–2 interne Links, meist Nachbarkreise oder die Kreisseite; der Test prüft, dass die Seite existiert |
| `quellen` | Belege für recherchierte Fakten (Titel + URL), wenn vorhanden |

## Regeln

- **Eigene Worte**, keine Texte von Wettbewerbern oder anderen Verzeichnissen übernehmen; kurze Recherche (Stadt-, Landes-, Tourismus-Seiten, Wikipedia) ist erwünscht.
- **Nur sichere Fakten.** Unsichere Angaben weglassen oder allgemeiner formulieren. Keine erfundenen Zahlen, Öffnungszeiten oder Hofnamen. Hofnamen nur, wenn sie in den Einträgen der Seite stehen.
- **Individuell:** Kein Textbaustein, der auf beliebige Orte passt. Der Test bricht ab, wenn `oben` oder `einleitung` gleich beginnen wie bei einer anderen Seite.
- **Kleine Orte:** Wenn es zum Ort selbst wenig gibt, Landschaft und Anbaugebiet des Kreises beschreiben (Kreis-Recherche für mehrere Orte nutzen) und konkret auf die Einträge der Seite eingehen (Arten, Angebot, Auffälliges). Trotzdem für jeden Ort eigene Sätze.
- Du-Form, sachlich, keine Werbesprache, kein HTML, keine Web-Adressen im Text (Belege in `quellen`).
- Rohmilch-Hinweis bei Milchtankstellen: „vor dem Trinken abkochen“.

## Ablauf je Paket

1. Branch `ortstexte-paket-<n>`, Texte schreiben, einfügen.
2. `npm test` (muss grün sein), dann `SEITENTEXTE_OFFEN=1 node scripts/build.mjs` für die aktualisierte Paketliste, `git checkout data/seiten-stand.json`.
3. Commit, Push, `bash scripts/pr-mergen.sh <branch> "Ortstexte Paket <n>: <erster> bis <letzter> Ort" <pr-text>`, danach `git checkout main && git pull`.
4. Deploy: `gh workflow run deploy.yml --ref main` (nach dem letzten Paket eines Laufs reicht ein Deploy).
