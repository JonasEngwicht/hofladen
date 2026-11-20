# Ortstexte: eigene Texte für lokale Seiten

Hier liegen Texte, die nur auf **einer** lokalen Seite erscheinen: Einleitung, eigene Fragen (FAQ), typische Saisonprodukte der Gegend und Quellen. Damit bekommt eine Orts- oder Kreisseite echten lokalen Inhalt, der nicht aus den Zahlen erzeugt ist. Für neue Texte muss kein Code geändert werden: Datei anlegen, committen, beim nächsten Build ist der Text live.

## Welche Seiten?

Jede indexierbare lokale Listenseite:

| Seite | Beispiel-`pfad` |
|---|---|
| Kreis | `/bayern/oberallgaeu/` |
| Kreisfreie Stadt (mit Umgebung) | `/berlin/berlin/` |
| Ort (mit Umgebung) | `/bayern/oberallgaeu/oberstdorf/` |
| Kategorie im Kreis | `/bayern/oberallgaeu/milchtankstellen/` |

Welche Seiten noch keinen Text haben, steht nach Anzahl der Einträge sortiert in [`OFFEN.md`](OFFEN.md). Am meisten bringen Texte für die Seiten oben in der Liste.

## Format

Eine JSON-Datei je Seite, Name frei wählbar (Vorschlag: Pfad mit `--` statt `/`, z. B. `bayern--oberallgaeu.json`). Dateien, die mit `_` beginnen, werden ignoriert – [`_vorlage.json`](_vorlage.json) ist die Vorlage zum Kopieren.

```json
{
  "pfad": "/bayern/oberallgaeu/",
  "stand": "2026-11-20",
  "einleitung": ["Absatz 1", "Absatz 2"],
  "fragen": [{ "frage": "…?", "antwort": "…" }],
  "saison": [{ "titel": "Allgäuer Bergkäse", "zeit": "ganzjährig" }],
  "quellen": [{ "titel": "…", "url": "https://…" }]
}
```

- `pfad` (Pflicht): genau die URL der Seite, mit Schrägstrich am Ende.
- `einleitung`: 1 bis 4 Absätze mit je 60 bis 900 Zeichen. Der **erste Absatz** steht direkt unter der Überschrift – kurz halten (2–3 Sätze), damit die Höfe auf dem Handy früh sichtbar bleiben. Weitere Absätze stehen im Überblick unter der Liste.
- `fragen`: eigene Fragen; sie stehen vor den automatisch erzeugten Fragen und kommen auch in die strukturierten Daten (FAQPage). Jede Frage endet mit `?`.
- `saison`: erscheint im Block „Jetzt in der Saison“ unter „Typisch für die Gegend“.
- `quellen`: werden unten auf der Seite verlinkt. Bei recherchierten Fakten bitte immer angeben.
- `stand`: Datum der letzten inhaltlichen Prüfung (nur zur Pflege, wird nicht angezeigt).
- Links im Text: nur intern, als `[Linktext](/pfad/)`. Sonst kein HTML.

Mindestens eines von `einleitung`, `fragen` oder `saison` muss da sein.

## Regeln

- **Nur echte, lokale Angaben.** Keine austauschbaren Sätze wie „In X gibt es viele tolle Hofläden“. Gut sind Stadtteile, Nachbarorte, Landmarken, Landschaft, typische Produkte, Märkte, Hoffeste, Anfahrt.
- **Keine Platzhalter.** Texte mit `TODO`, `[ort]`, `{{…}}` oder „Lorem ipsum“ lehnt der Build ab.
- **Keine Texte von Wettbewerbern** oder aus Branchenbüchern abschreiben. Eigene Worte, Quellen nennen.
- **Fragen nur mit sichtbarer Antwort.** Was in `fragen` steht, wird auf der Seite angezeigt – so passen FAQ-Daten und Seite immer zusammen.

## Prüfung

- Der Build überspringt fehlerhafte Dateien und schreibt eine Warnung („Ortstext übersprungen – …“). Ein Text für eine Seite, die es nicht gibt oder die noindex ist, erzeugt die Warnung „keine indexierbare lokale Seite“.
- `npm test` schlägt in beiden Fällen fehl (`tests/ortstexte.test.mjs`), damit Fehler vor dem Live-Gang auffallen.
- Liste der offenen Seiten neu erzeugen: `ORTSTEXTE_OFFEN=1 node scripts/build.mjs`, danach `git checkout data/seiten-stand.json`.
