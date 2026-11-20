// Baut die statische Website nach public/ und die Daten für den Worker nach src/generated/.
// Läuft automatisch vor jedem "wrangler deploy" (siehe wrangler.jsonc → build.command).
//
// Aufbau (scripts/build/, in dieser Reihenfolge):
//   daten       Daten laden, zusammenführen, bereinigen und ableiten (Einträge, Kreise, Orte, Kategorien)
//   html        HTML-Helfer und Seitenrahmen (seite(), Karte, Filterleiste)
//   grundlagen  Ausgabe vorbereiten, Texte aus Daten, Orte und Umkreise, strukturierte Daten
//   startseite  Startseite und Typseiten (Milchtankstelle, Eierautomat …)
//   regionen    Bundesland-, Kreis-, Kategorie-, Angebots- und Ortsseiten
//   hoefe       Detailseiten der Höfe
//   themen      Karte, Saison, Ratgeber, Info-, Vertrauens- und Formularseiten, Wochenmärkte
//   abschluss   robots.txt, Sitemaps, Seitenarchiv und Daten für den Worker
import './build/daten.mjs';
import './build/html.mjs';
import './build/grundlagen.mjs';
import './build/startseite.mjs';
import './build/regionen.mjs';
import './build/hoefe.mjs';
import './build/themen.mjs';
import './build/abschluss.mjs';
