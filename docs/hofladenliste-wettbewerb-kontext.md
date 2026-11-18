# Kontext: Wettbewerb und Anforderungen für hofladenliste.de

Stand: 18.11.2026

## 1. Projekt

- Domain: hofladenliste.de. Verzeichnis aller Hofläden in Deutschland.
- Repo: JonasEngwicht/hofladen. Hosting über einen Cloudflare Worker namens "hofladen".
- URL-Struktur: Pfade nach dem Muster /bundesland/kreis/. Keine Subdomains.
- Die Startseite hat eine PLZ-Abfrage, die auf die passende lokale Seite weiterleitet.
- Kontakt: hofladenliste@gmail.com
- Ziel: Jede Seite soll für „Hofladen“ und verwandte Begriffe ranken, besonders für „Hofladen in <Ort>“.

## 2. Wettbewerber

### hofladenfinder.org (Hauptkonkurrent)

Umami-Statistik, 30 Tage vom 19.10. bis 18.11.2026, Länderfilter DE/AT/CH/FR/IT/NL:

| Kennzahl | Wert | Veränderung zum Vorzeitraum |
| --- | --- | --- |
| Besucher | 88,7k | −7 % |
| Besuche | 97,0k | −7 % |
| Seitenaufrufe | 179k | −5 % |
| Besuchsdauer | 55 s | +8 % |

**Traffic-Quellen:** google.com liefert 73,7k Besucher (96 %). Ecosia (869), google.de (737), Brave, t-online, Bing und DuckDuckGo liegen jeweils bei 1 % oder darunter. Die eigene Android-App (TWA) bringt 184 Besucher.

**Meistbesuchte Seiten:**

| Pfad | Besucher | Anteil |
| --- | --- | --- |
| /search | 4,54k | 35 % |
| /more | 3,49k | 27 % |
| / | 2,31k | 18 % |
| /saisonkalender | 687 | 5 % |
| /neu | 423 | 3 % |
| /farmshop/details/<slug>__<id> | je 199–414 | je 2–3 % |

Die Detailseiten haben das Muster /farmshop/details/<name-in-ort>__<id>: englischer Pfad mit numerischer ID.

**Geräte:** Android 46 %, iOS 28 %, Windows 16 %, macOS 7 %, Linux 2 %. Damit kommen rund 74 % der Besucher mobil.

**Länder:** Deutschland 95 %, Österreich 3 %, Schweiz 2 %.

**Geschäftsmodell (laut Media Kit 2026/27):** Das Media Kit nennt 90.000 Besucher und 180.000 Seitenaufrufe pro Monat, beides als Durchschnitt der letzten 90 Tage. Der Traffic stammt laut Kit zu 100 % aus unbezahlten Quellen. Einnahmen kommen ausschließlich aus Werbung:

- Impressionspakete mit einem TKP von 16–20 €
- eine exklusive Markenpartnerschaft für 2.490 € pro Monat

Das Kit erwähnt keine Funktionen für Hofladen-Betreiber, etwa zum Eintragen, Pflegen oder Beanspruchen eines Eintrags. Die beschriebene Zielgruppe ist breit: Bio, Kochen, Küchengeräte, Biokisten.

### heimischehoflaeden.de

Weiterer Konkurrent. Dazu liegen keine Zahlen vor.

## 3. Schwächen des Hauptkonkurrenten, die wir nutzen

1. **Schwache Detailseiten.** Einzelne Hofläden bekommen kaum Traffic. Hier ist Platz für vollständige, gut rankende Detailseiten.
2. **Kaum Weiterklicks.** Mit rund 2 Seitenaufrufen pro Besuch gibt es wenig interne Navigation. Unsere Ortsseiten verlinken deshalb stark weiter.
3. **Abhängigkeit von Google.** 96 % des Traffics kommen von dort. Wer für „Hofladen + Ort“ besser rankt, übernimmt diesen Traffic direkt.
4. **Fallende Besucherzahlen** (−7 %).
5. **Keine Betreiberfunktionen und keine sichtbaren Angaben zu Aktualität und Datenqualität.**
6. **Englischsprachige URLs mit IDs** statt sprechender deutscher Pfade.

## 4. Keyword-Daten (Google, Deutschland)

| Suchbegriff | Suchen pro Monat | Trend |
| --- | --- | --- |
| hofladen in der nähe | 27.100 | +49 |
| hofladen leipzig | 1.000 | 0 |

Für weitere Begriffe gibt es keine Volumina, weil das kostenlose Keyword-Tool sie nicht liefert. Die Autocomplete-Vorschläge zeigen aber, wonach gesucht wird:

- **Ort mit Umgebung:** „hofladen cottbus und umgebung“, „hofladen dresden umgebung“, „hofladen bei münchen“, „hofladen nähe cottbus“
- **Bio:** „bio hofladen berlin“, „bio hofladen dresden“, „bio hofladen in der nähe“
- **Automaten:** „hofladen automat“, „hofladen automaten in der nähe jetzt geöffnet“, „milchautomat cottbus“
- **Öffnungszeiten:** „öffnungszeiten hofladen leipzig“
- **Stadtteile und Himmelsrichtungen:** „hofladen münchen süd“, „hofladen berlin rudow“, „hofladen leipzig grünau“
- **Produkte:** „hofladen äpfel“, „hofladen mit eigener schlachtung in der nähe“, „ziegenhof bei cottbus“
- **Regionen:** „hofladen berlin brandenburg“, „hofladen leipziger land“, „hofladen bayern“

Zusätzlich auffällig sind Suchen nach einzelnen Hofläden mit Namen, etwa „beckers hofladen“ oder „körners hofladen“. Diese Suchen kann nur eine gute Detailseite abfangen.

## 5. Anforderungen an hofladenliste.de

### 5.1 Seitentypen

1. **Startseite:** PLZ- und Ortssuche, ein Button „In meiner Nähe“ mit Geolocation, Links zu allen Bundesländern und zu den größten Städten.
2. **Bundeslandseite** (/bundesland/): Liste der Kreise mit Anzahl der Hofläden, die wichtigsten Orte und ein kurzer Einleitungstext.
3. **Kreisseite** (/bundesland/kreis/): alle Hofläden des Kreises, Karte, Filter und Links zu den Nachbarkreisen.
4. **Ortsseite** für Städte und Gemeinden mit Suchvolumen. Sie zielt auf „Hofladen <Ort>“ und „Hofladen <Ort> und Umgebung“.
   - H1 nach dem Muster „Hofläden in <Ort> und Umgebung“.
   - Liste mit Entfernung vom Ortszentrum, Umkreis 10/25/50 km.
   - Hinweis „jetzt geöffnet“, Filter für Bio, Automat 24/7, Eier, Milch, Fleisch, Obst & Gemüse.
   - Links zu Nachbarorten und zum Kreis.
   - Ein kurzer FAQ-Abschnitt, der nur echte Daten verwendet (z. B. „Wie viele Hofläden gibt es in <Ort>?“).
5. **Hofladen-Detailseite** mit sprechender deutscher URL, z. B. /hofladen/<name>-<ort>/. Inhalt:
   - Name, Adresse, Karte und Route
   - Öffnungszeiten mit Status „jetzt geöffnet“
   - Produkte, Bio-Kennzeichnung, Automat oder 24/7-Verkauf, Zahlungsarten, Kontakt
   - Datenquelle und Datum „zuletzt geprüft“
   - die nächsten Hofläden in der Umgebung, Link zur Kreis- und Ortsseite
   - einen Button „Eintrag korrigieren / Betreiber? Eintrag übernehmen“
6. **Kategorieseiten** wie /bio-hoflaeden/, /hofladen-automaten/ oder /milchautomaten/, jeweils auch auf Ebene von Bundesland und Kreis. Kombinationen aus Ort und Kategorie entstehen nur, wenn genug Einträge da sind, damit keine dünnen Seiten entstehen.
7. **Saisonkalender:** welches Obst und Gemüse wann Saison hat, verknüpft mit passenden Hofläden. Inhalt und Struktur sind eigenständig, nicht vom Konkurrenten kopiert.
8. **Eintragen-Seite** für Betreiber, mit Formular und Moderation.
9. **Impressum, Datenschutz, Quellenangaben** (inklusive OSM-Attribution).

### 5.2 Technisches SEO

- Alle Inhalte werden serverseitig als HTML gerendert, also im Worker oder statisch. Inhalte, die erst per Client-JavaScript nachgeladen werden, sind nicht erlaubt.
- Jede Seite hat einen eigenen Title und eine eigene Meta-Description nach Vorlage. Pro Seite gibt es genau eine H1 und einen Canonical-Tag.
- Strukturierte Daten in JSON-LD:
  - `LocalBusiness` bzw. `Store` mit `address`, `geo`, `openingHoursSpecification` auf Detailseiten
  - `BreadcrumbList` auf allen Seiten
  - `ItemList` auf Listenseiten
  - `FAQPage` nur dort, wo die FAQ sichtbar auf der Seite steht
- XML-Sitemaps, aufgeteilt nach Seitentyp und bei Bedarf als Sitemap-Index, mit echtem `lastmod`. robots.txt mit Verweis auf die Sitemap.
- Leere oder sehr dünne Seiten (unter etwa 3 Einträgen) bekommen `noindex`. Alternativ zeigen sie Hofläden aus dem Umkreis und verweisen per Canonical auf die übergeordnete Seite.
- Saubere 301-Weiterleitungen, z. B. bei Slash-Varianten und Umlauten. Gelöschte Einträge liefern 404 oder 410.
- Brotkrumen-Navigation und interne Verlinkung auf jeder Seite: von oben nach unten, zu Nachbarn und zu Kategorien.

### 5.3 Performance (mobil zuerst)

- Ziel sind gute Core Web Vitals auf dem Handy: LCP unter 2,5 s, CLS unter 0,1, INP unter 200 ms.
- Die Karte lädt erst bei Interaktion oder wenn sie in den sichtbaren Bereich scrollt. Davor steht ein statisches Vorschaubild oder ein Platzhalter.
- Wenig JavaScript, Bilder in optimierten Formaten mit festen Maßen, Caching über Cloudflare.
- Bedienelemente sind auf Touch ausgelegt. Telefonnummern sind als `tel:`-Links klickbar, und es gibt einen Routen-Link.

### 5.4 Daten

- Eigene Datenbasis aufbauen. Zulässige Quellen sind OpenStreetMap (ODbL, Quelle nennen), eigene Recherche bei öffentlichen Quellen der Höfe selbst und Einträge von Betreibern.
- **Keine Daten, Texte oder Bilder der Wettbewerber übernehmen und nicht scrapen.** Datenbanken sind rechtlich geschützt.
- Jeder Eintrag speichert seine Quelle und das Datum der letzten Prüfung.
- Es gibt einen Prozess für Korrekturmeldungen und Betreiber-Übernahmen.

### 5.5 Betreiberfunktionen (Unterschied zum Wettbewerb)

- Hofläden können ihren Eintrag kostenlos übernehmen und pflegen: Öffnungszeiten, Produkte, Fotos, saisonale Hinweise.
- Ein Badge oder Widget „Wir sind auf hofladenliste.de“ zum Einbinden auf der Website des Hofladens bringt Backlinks.

### 5.6 Messung

- Google Search Console und Bing Webmaster Tools einrichten und die Sitemaps dort einreichen.
- Datenschutzfreundliche Analyse ohne Cookie-Banner, z. B. Cloudflare Web Analytics oder ein selbst gehostetes Umami.
- Die Analyse soll diese Ereignisse erfassen: Klick auf Route, Klick auf Telefon, Nutzung von Filtern, Klick auf „In meiner Nähe“.

## 6. Priorisierung

1. **Fundament:** serverseitiges Rendering, Seitenvorlagen, Meta-Angaben, JSON-LD, Sitemaps, robots.txt, interne Verlinkung, mobile Performance.
2. **Inhalt:** Detailseiten vollständig ausbauen und Ortsseiten für die wichtigsten Städte anlegen. Startorte: Berlin, Cottbus, Dresden, Leipzig, München, dann weitere Großstädte und Städte rund um Forst (Lausitz).
3. **Filter und Kategorien:** Bio, Automat, Produkte, „jetzt geöffnet“, „in meiner Nähe“.
4. **Betreiberfunktionen und Saisonkalender.**
5. **Messen und nachschärfen** anhand der Daten aus der Search Console.
