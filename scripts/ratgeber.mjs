// Ratgeber-Artikel (/ratgeber/): eigene Texte. Jeder Artikel verlinkt passende Kategorie- und Ortsseiten.
// Felder: slug, titel, beschreibung, datum (veröffentlicht), geaendert, links (für „Passend dazu“), html (Inhalt ab der Einleitung).
// Optional: icon (Name aus ARTIKEL_ICON in build/themen.mjs), monate (Monate 1–12, in denen der Artikel als „Jetzt aktuell“
// vorn steht – auf /ratgeber/ und auf der Startseite), kurzgesagt (2–4 Sätze für den Kasten „Das Wichtigste in Kürze“).
import { esc } from '../static/helfer.js';
import { ICON } from '../static/karte.js';

// Symbole für die Artikel (Linien-Icons wie in static/karte.js; nur im Build, nicht im Browser-Skript)
const S = (inner) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
export const ARTIKEL_ICON = {
  milch: ICON.milch, eier: ICON.eier, markt: ICON.markt, blatt: ICON.blatt, herz: ICON.herz, tanne: ICON.tanne,
  kuerbis: S('<path d="M12 7c-5 0-8 3-8 6.5S7 20 12 20s8-3 8-6.5S17 7 12 7z"/><path d="M12 7c-2.2 2-2.2 11 0 13M12 7c2.2 2 2.2 11 0 13M12 7V4.5"/>'),
  braten: S('<path d="M5 11h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M3 11h18M9.500 8c0-1.200 1-1.200 1-2.500M13.500 8c0-1.200 1-1.200 1-2.500"/>'),
  schnee: S('<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M12 6.5 9.8 4.3M12 6.5l2.2-2.2M12 17.5l-2.2 2.2M12 17.5l2.2 2.2"/>'),
  geschenk: S('<rect x="4" y="11" width="16" height="9" rx="1"/><path d="M3 7.5h18V11H3zM12 7.5V20"/><path d="M12 7.5C10.5 4.5 7 4 7 6s2.5 1.500 5 1.500c2.500 0 5 .5 5-1.500s-3.500-1.500-5 1.500z"/>'),
};
export const artikelIcon = (a) => ARTIKEL_ICON[a.icon] || ICON.blatt;
// „Jetzt aktuell“: Artikel, deren Monate (Feld monate) den laufenden Monat enthalten
export const istAktuell = (a, monat) => Array.isArray(a.monate) && a.monate.includes(monat);
// Reihenfolge für Übersicht und Startseite: aktuelle zuerst (neueste vorn), dann der Rest in der Reihenfolge der Datei
export const ratgeberSortiert = (monat) => [...RATGEBER.filter((a) => istAktuell(a, monat)).sort((a, b) => b.datum.localeCompare(a.datum)), ...RATGEBER.filter((a) => !istAktuell(a, monat))];
// Lesezeit in Minuten (200 Wörter pro Minute, mindestens 2)
export const lesezeit = (a) => Math.max(2, Math.round(a.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 200));
export const ratgeberKarte = (a, monat) => `<li><a href="/ratgeber/${a.slug}/"><span class="rk-icon">${artikelIcon(a)}</span><span class="rk-text">${istAktuell(a, monat) ? '<em>Jetzt aktuell</em>' : ''}<b>${esc(a.titel)}</b><span>${esc(a.beschreibung)}</span></span></a></li>`;

export const RATGEBER = [
  {
    slug: 'rohmilch-milchtankstelle',
    icon: 'milch',
    titel: 'Rohmilch aus der Milchtankstelle: abkochen, abfüllen, aufbewahren',
    seitentitel: 'Rohmilch aus der Milchtankstelle: abkochen & aufbewahren',
    kurz: 'Rohmilch aus der Milchtankstelle',
    beschreibung: 'Was du über Rohmilch aus der Milchtankstelle wissen musst: warum sie abgekocht werden muss, welche Flaschen sich eignen und wie lange sie hält.',
    datum: '2026-11-19',
    links: [['/milchtankstelle/', 'Milchtankstellen in der Nähe'], ['/angebot/milch/', 'Milch vom Hof'], ['/hofladen-automaten/', 'Hofladen-Automaten']],
    html: `<p>An einer Milchtankstelle zapfst du Milch direkt vom Hof – meist frisch vom Morgen- oder Abendmelken. Diese Milch ist <b>Rohmilch</b>: Sie wurde weder erhitzt noch homogenisiert. Das macht sie besonders, verlangt aber ein paar Handgriffe.</p>
<h2>Warum Rohmilch abgekocht werden muss</h2>
<p>Rohmilch kann Keime enthalten, die beim Erhitzen in der Molkerei abgetötet würden. Deshalb steht an jeder Milchtankstelle der Hinweis <b>„Rohmilch, vor dem Verzehr abkochen“</b>. Das gilt besonders für Kinder, Schwangere, ältere und immungeschwächte Menschen. Zum Abkochen erhitzt du die Milch im Topf, bis sie kurz aufwallt, und lässt sie dann abkühlen. Für Kaffee, Kakao oder zum Backen, wo die Milch ohnehin erhitzt wird, reicht das mit.</p>
<h2>Die richtige Flasche</h2>
<p>Am besten eignen sich Glasflaschen mit weiter Öffnung und Schraub- oder Bügelverschluss. Viele Milchtankstellen haben einen kleinen Automaten mit Flaschen daneben. Spül die Flasche nach dem Gebrauch heiß aus und lass sie offen trocknen. Plastikflaschen von Getränken sind weniger geeignet, weil sie sich schlecht reinigen lassen.</p>
<h2>Kühl transportieren, schnell verbrauchen</h2>
<ul><li>Bring eine Kühltasche mit, wenn du länger unterwegs bist.</li><li>Zu Hause gleich in den Kühlschrank, am besten nach hinten, wo es am kältesten ist.</li><li>Abgekochte Milch hält gekühlt etwa zwei bis drei Tage. Riecht oder schmeckt sie säuerlich, nicht mehr trinken.</li></ul>
<h2>Was die Milch anders macht</h2>
<p>Weil Rohmilch nicht homogenisiert ist, setzt sich oben Rahm ab. Einfach vor dem Eingießen schütteln – oder den Rahm abschöpfen und für Kaffee nutzen. Der Fettgehalt schwankt je nach Jahreszeit und Futter, im Sommer schmeckt die Milch oft etwas anders als im Winter.</p>
<h2>Bezahlen und Öffnungszeiten</h2>
<p>Die meisten Milchtankstellen sind rund um die Uhr oder bis zum Abend geöffnet und nehmen Münzen, manche auch Scheine oder Karte. Ob eine Milchtankstelle gerade offen ist, siehst du in unserer Liste mit „jetzt geöffnet“.</p>`,
  },
  {
    slug: 'eier-vom-automaten',
    icon: 'eier',
    titel: 'Eier vom Automaten und ab Hof: Kennzeichnung, Frische, Lagerung',
    seitentitel: 'Eier vom Automaten: Kennzeichnung, Frische, Lagerung',
    kurz: 'Eier vom Automaten',
    beschreibung: 'Was der Stempel auf dem Ei bedeutet, woran du frische Eier erkennst und wie du Eier vom Automaten oder Hofladen richtig lagerst.',
    datum: '2026-11-19',
    links: [['/eierautomat/', 'Eierautomaten in der Nähe'], ['/angebot/eier/', 'Eier vom Hof'], ['/sonntags-geoeffnet/', 'Sonntags geöffnet']],
    html: `<p>Eierautomaten stehen oft direkt am Hof oder an der Straße davor. Die Eier sind meist nur wenige Tage alt – frischer bekommst du sie kaum.</p>
<h2>Was der Stempel bedeutet</h2>
<p>Auf vielen Eiern steht ein Erzeugercode wie <b>1-DE-0312345</b>. Die erste Ziffer verrät die Haltung: <b>0</b> steht für ökologische Haltung (Bio), <b>1</b> für Freilandhaltung, <b>2</b> für Bodenhaltung und <b>3</b> für Käfighaltung (in Deutschland als Kleingruppenhaltung). Danach folgen das Land (DE) und die Nummer des Betriebs mit Bundesland und Stall.</p>
<p>Verkauft ein Hof seine Eier direkt an dich, kann der Stempel fehlen – etwa bei kleinen Betrieben, die nur ab Hof verkaufen. Dann sollten Hof und Haltungsform am Automaten angegeben sein. Frag ruhig nach, wie die Hühner leben; die meisten Betriebe erzählen gern davon.</p>
<h2>So erkennst du frische Eier</h2>
<ul><li><b>Wasserprobe:</b> Ein frisches Ei bleibt in einem Glas Wasser am Boden liegen. Stellt es sich auf, ist es älter; schwimmt es, lieber nicht mehr essen.</li><li><b>Aufschlagen:</b> Beim frischen Ei ist das Eigelb hoch gewölbt und das Eiklar fest.</li><li><b>Datum:</b> Steht ein Mindesthaltbarkeitsdatum auf der Packung, liegt es 28 Tage nach dem Legen.</li></ul>
<h2>Richtig lagern</h2>
<p>Im Kühlschrank halten Eier am längsten, am besten in der Packung, damit sie keine Gerüche annehmen. Ungewaschene Eier haben eine natürliche Schutzschicht – deshalb Eier erst kurz vor dem Gebrauch abwischen, nicht waschen. Für Rezepte mit rohen Eiern, etwa Tiramisu oder Mayonnaise, nur ganz frische Eier nehmen.</p>
<h2>Tipps für den Automaten</h2>
<p>Viele Eierautomaten sind auch sonntags und abends erreichbar. Nimm einen eigenen Eierkarton mit – manche Höfe freuen sich darüber und verwenden ihn wieder. Wenn der Automat leer ist, hilft oft ein Blick auf den Zettel am Gerät: Dort steht, wann wieder aufgefüllt wird.</p>`,
  },
  {
    slug: 'hofladen-wochenmarkt-solawi',
    icon: 'markt',
    titel: 'Hofladen, Wochenmarkt oder Solawi: Was passt zu dir?',
    kurz: 'Hofladen, Wochenmarkt oder Solawi?',
    beschreibung: 'Drei Wege zu Lebensmitteln aus der Region im Vergleich: Hofladen, Wochenmarkt und Solidarische Landwirtschaft – mit Vor- und Nachteilen.',
    datum: '2026-11-19',
    links: [['/wochenmaerkte/', 'Wochenmärkte'], ['/solawi/', 'Solawis'], ['/karte/', 'Hofläden auf der Karte']],
    html: `<p>Wer regional einkaufen möchte, hat mehrere Möglichkeiten. Sie unterscheiden sich darin, wie flexibel du bist, wie nah du am Hof bist und wie viel Planung nötig ist.</p>
<h2>Hofladen und Hofautomat</h2>
<p>Im Hofladen kaufst du direkt beim Betrieb, oft mit Blick auf Felder und Ställe. Das Angebot ist saisonal und hängt davon ab, was der Hof selbst erzeugt – viele ergänzen es mit Produkten von Nachbarhöfen. Hofautomaten wie Regiomaten, Eierautomaten und Milchtankstellen haben oft länger geöffnet, manche rund um die Uhr.</p>
<p><b>Gut für dich, wenn</b> du gern einen festen Hof in der Nähe hast, spontan einkaufen möchtest und wissen willst, wo dein Essen herkommt.</p>
<h2>Wochenmarkt</h2>
<p>Auf dem Wochenmarkt findest du viele Anbieter an einem Ort: Gemüse, Obst, Käse, Fleisch, Brot und Blumen. Nicht jeder Stand ist ein Erzeuger – manche sind Händler. Ein Schild „aus eigenem Anbau“ oder ein Gespräch am Stand schafft Klarheit.</p>
<p><b>Gut für dich, wenn</b> du alles in einem Weg erledigen möchtest und gern vergleichst. Die Markttage stehen bei jedem Markt in unserer Liste.</p>
<h2>Solidarische Landwirtschaft (Solawi)</h2>
<p>Bei einer Solawi zahlen Mitglieder einen festen Monatsbeitrag und teilen sich dafür die Ernte eines Hofs. Du bekommst jede Woche einen Anteil, meist Gemüse, manchmal auch Brot, Eier oder Milch. Dafür trägst du das Risiko mit: In einem schlechten Jahr ist der Anteil kleiner.</p>
<p><b>Gut für dich, wenn</b> du regelmäßig kochst, dich auf saisonale Überraschungen freust und einen Hof dauerhaft unterstützen möchtest. Viele Solawis haben Wartelisten – frag früh im Jahr nach.</p>
<h2>Kurz verglichen</h2>
<table><thead><tr><th scope="col"></th><th scope="col">Hofladen</th><th scope="col">Wochenmarkt</th><th scope="col">Solawi</th></tr></thead><tbody>
<tr><th scope="row">Flexibilität</th><td>hoch</td><td>an Markttagen</td><td>feste Abholtage</td></tr>
<tr><th scope="row">Auswahl</th><td>je nach Hof</td><td>groß</td><td>was gerade wächst</td></tr>
<tr><th scope="row">Bindung</th><td>keine</td><td>keine</td><td>Mitgliedschaft, oft ein Jahr</td></tr></tbody></table>`,
  },
  {
    slug: 'bio-siegel-erklaert',
    icon: 'blatt',
    titel: 'Bio-Siegel erklärt: EU-Bio, Bioland, Demeter, Naturland & Co.',
    kurz: 'Bio-Siegel erklärt',
    beschreibung: 'Was das EU-Bio-Logo garantiert, was die Anbauverbände wie Bioland, Demeter und Naturland zusätzlich verlangen und worauf du im Hofladen achten kannst.',
    datum: '2026-11-19',
    links: [['/bio-hofladen/', 'Bio-Hofläden'], ['/angebot/', 'Angebot vom Hof'], ['/solawi/', 'Solawis']],
    html: `<p>„Bio“ und „Öko“ sind in der EU geschützte Begriffe. Wer Lebensmittel so bezeichnet, muss nach der EU-Öko-Verordnung arbeiten und wird regelmäßig kontrolliert. Darüber hinaus gibt es Anbauverbände mit eigenen, strengeren Regeln.</p>
<h2>EU-Bio-Logo</h2>
<p>Das grüne Blatt aus Sternen ist auf verpackten Bio-Lebensmitteln aus der EU Pflicht. Daneben steht die Nummer der Kontrollstelle, in Deutschland etwa <b>DE-ÖKO-006</b>. Das Logo steht unter anderem für: keine chemisch-synthetischen Pflanzenschutzmittel, keine Gentechnik, mehr Platz und Auslauf für Tiere und überwiegend Bio-Futter.</p>
<p>Das sechseckige deutsche Bio-Siegel steht für dieselben Regeln und wird freiwillig zusätzlich verwendet.</p>
<h2>Anbauverbände</h2>
<p>Verbände wie <b>Bioland</b>, <b>Demeter</b>, <b>Naturland</b>, <b>Biopark</b>, <b>Gäa</b>, <b>Biokreis</b> oder <b>Ecoland</b> gehen in vielen Punkten weiter als die EU-Regeln. Typisch sind:</p>
<ul><li>der ganze Betrieb muss ökologisch wirtschaften, nicht nur ein Teil,</li><li>weniger Tiere pro Fläche und strengere Regeln für Futter und Dünger,</li><li>weniger erlaubte Zusatzstoffe bei verarbeiteten Lebensmitteln.</li></ul>
<p>Demeter arbeitet zusätzlich biodynamisch, etwa mit eigenen Präparaten für Boden und Kompost. Ecovin ist der Verband für ökologischen Weinbau.</p>
<h2>Bio im Hofladen</h2>
<p>Lose Ware im Hofladen trägt oft kein Logo. Ein Bio-Betrieb hat trotzdem ein Zertifikat seiner Kontrollstelle und zeigt es auf Nachfrage. Bei uns steht ein Verband nur dann an einem Hof, wenn er im Eintrag genannt ist – maßgeblich ist das Siegel auf der Ware oder das Zertifikat.</p>
<h2>Nicht bio, aber regional</h2>
<p>Viele kleine Höfe wirtschaften naturnah, ohne zertifiziert zu sein – die Kontrolle kostet Geld und Zeit. Frag nach, wie die Tiere gehalten und die Felder bewirtschaftet werden. Ehrliche Antworten sind oft aussagekräftiger als ein Etikett.</p>`,
  },
  {
    slug: 'einkaufen-mit-kindern',
    icon: 'herz',
    titel: 'Hofladen mit Kindern: Ausflugstipps für Familien',
    kurz: 'Hofladen mit Kindern',
    beschreibung: 'Tiere anschauen, selbst pflücken, Eier aus dem Automaten ziehen: Wie der Einkauf auf dem Hof zum Ausflug für die ganze Familie wird.',
    datum: '2026-11-19',
    links: [['/selbstpfluecken/', 'Selbstpflücken'], ['/hofcafe/', 'Hofcafés'], ['/veranstaltungen/', 'Hoffeste und Termine']],
    html: `<p>Für Kinder ist ein Hof ein Abenteuer: Hühner, Kühe, Traktoren und Felder, auf denen man sieht, wo das Essen wächst. Mit ein bisschen Planung wird aus dem Einkauf ein Ausflug.</p>
<h2>Gute Ziele für Familien</h2>
<ul><li><b>Selbstpflücken:</b> Erdbeeren im Juni, Himbeeren und Blumen im Sommer, Äpfel und Kürbisse im Herbst. Kinder lieben es, ihre eigene Schale zu füllen.</li><li><b>Hofcafés:</b> Kuchen nach dem Spaziergang, oft mit Spielecke oder Tieren in Sichtweite.</li><li><b>Hoffeste:</b> Viele Höfe laden zum Tag des offenen Hofes, zu Erntefesten oder Weihnachtsmärkten ein.</li><li><b>Automaten:</b> Eier oder Milch selbst aus dem Automaten zu ziehen, ist für Kleine ein Erlebnis.</li></ul>
<p>Bei vielen Einträgen steht unter „Vor Ort“, ob es Spielplatz, Tiere zum Anschauen, Sitzplätze oder ein Hofcafé gibt. In Listen hilft der Filter „Ausflug mit Kindern“.</p>
<h2>Ein paar Regeln auf dem Hof</h2>
<ul><li>Tiere nur streicheln oder füttern, wenn es ausdrücklich erlaubt ist.</li><li>Abstand zu Maschinen und Fahrzeugen halten, auch wenn sie stillstehen.</li><li>Auf Feldern auf den Wegen bleiben, beim Selbstpflücken nur in den freigegebenen Reihen.</li><li>Nach dem Besuch im Stall Hände waschen.</li></ul>
<h2>Was du mitnehmen solltest</h2>
<p>Feste Schuhe, Kühltasche, Körbe oder Schalen zum Pflücken und etwas Kleingeld für Automaten und Kasse des Vertrauens. Manche Höfe nehmen inzwischen Karte – bei uns steht es, wenn bekannt, unter „Bezahlen“.</p>`,
  },
  {
    slug: 'spargelzeit',
    icon: 'blatt', monate: [4, 5, 6],
    titel: 'Spargelzeit: Wann es losgeht und woran du frischen Spargel erkennst',
    seitentitel: 'Spargelzeit: Beginn, Ende und frischen Spargel erkennen',
    kurz: 'Spargelzeit',
    beschreibung: 'Spargel vom Hof: wann die Saison beginnt und endet, woran du frische Stangen erkennst und wie du Spargel lagerst.',
    datum: '2026-11-19',
    links: [['/saisonkalender/spargel/', 'Spargel im Saisonkalender'], ['/angebot/gemuese/', 'Gemüse vom Hof'], ['/saisonkalender/', 'Saisonkalender']],
    html: `<p>Kaum ein Gemüse wird so sehnsüchtig erwartet wie Spargel. Direkt vom Hof ist er am frischesten – oft am selben Morgen gestochen.</p>
<h2>Wann ist Spargelzeit?</h2>
<p>Je nach Wetter und Region beginnt die Saison im April, mit beheizten oder abgedeckten Feldern manchmal schon Ende März. Traditionell endet sie am <b>24. Juni</b>, dem Johannistag. Danach brauchen die Pflanzen Zeit, um Kraft für das nächste Jahr zu sammeln.</p>
<h2>Frischen Spargel erkennen</h2>
<ul><li>Die Schnittenden sind saftig und hell, nicht eingetrocknet oder hohl.</li><li>Reibt man zwei Stangen aneinander, quietschen sie leicht.</li><li>Die Köpfe sind fest geschlossen.</li><li>Beim Drücken auf das Ende tritt etwas Saft aus.</li></ul>
<h2>Weiß, grün oder violett?</h2>
<p>Weißer Spargel wächst unter der Erde und wird gestochen, bevor er ans Licht kommt. Grüner Spargel wächst über der Erde, schmeckt kräftiger und muss meist nur im unteren Drittel geschält werden. Violetter Spargel hat kurz Licht abbekommen und schmeckt etwas süßer.</p>
<h2>Lagern</h2>
<p>Am besten am selben oder nächsten Tag essen. Bis dahin in ein feuchtes Tuch wickeln und in den Kühlschrank legen. Viele Höfe bieten an, den Spargel gleich zu schälen – frag einfach nach.</p>
<p>Ob ein Hof in deiner Nähe schon Spargel hat, siehst du an den Neuigkeiten der Betriebe („Spargel ist da!“) und im Saisonkalender.</p>`,
  },
  {
    slug: 'kuerbis-vom-hof',
    icon: 'kuerbis', monate: [9, 10],
    titel: 'Kürbis vom Hof: Sorten, Lagerung und Selbstbedienung',
    kurz: 'Kürbis vom Hof',
    beschreibung: 'Hokkaido, Butternut oder Zierkürbis: welche Kürbisse es ab Hof gibt, wie du gute Kürbisse erkennst und wie lange sie halten.',
    datum: '2026-11-19',
    links: [['/saisonkalender/kuerbis/', 'Kürbis im Saisonkalender'], ['/angebot/gemuese/', 'Gemüse vom Hof'], ['/selbstpfluecken/', 'Selbstpflücken']],
    html: `<p>Im Herbst stehen an vielen Höfen Kürbisse zur Selbstbedienung am Straßenrand – mit Kasse des Vertrauens. Die Saison läuft von etwa September bis in den November.</p>
<h2>Beliebte Sorten</h2>
<ul><li><b>Hokkaido:</b> orange, klein, die Schale kann mitgegessen werden. Ideal für Suppe und Ofengemüse.</li><li><b>Butternut:</b> birnenförmig, nussiges Aroma, wenig Kerne. Schale vorher entfernen.</li><li><b>Muskatkürbis:</b> groß und gerippt, sehr aromatisch, wird oft in Stücken verkauft.</li><li><b>Spaghettikürbis:</b> das Fruchtfleisch zerfällt nach dem Garen in Fäden.</li><li><b>Zierkürbisse:</b> nur zur Deko – nicht essen, sie können Bitterstoffe enthalten.</li></ul>
<h2>Einen guten Kürbis erkennen</h2>
<p>Ein reifer Kürbis klingt beim Klopfen hohl, hat einen festen, verholzten Stiel und eine Schale ohne weiche Stellen. Kauf Kürbisse am besten mit Stiel – ohne ihn halten sie kürzer.</p>
<h2>Lagerung</h2>
<p>Ganze Kürbisse halten kühl, trocken und luftig gelagert mehrere Wochen bis Monate, etwa im Keller oder Flur. Angeschnittene Stücke in Folie im Kühlschrank aufbewahren und in wenigen Tagen verbrauchen.</p>
<h2>Bitter? Nicht essen</h2>
<p>Schmeckt ein Speisekürbis bitter, kann er Cucurbitacine enthalten – dann nicht essen. Das kommt bei gekauften Speisekürbissen selten vor, eher bei selbst gezogenen Pflanzen, die sich mit Zierkürbissen gekreuzt haben.</p>`,
  },
  {
    slug: 'weihnachtsbaum-vom-hof',
    icon: 'tanne', monate: [11, 12],
    titel: 'Weihnachtsbaum vom Hof: frisch geschlagen, länger schön',
    kurz: 'Weihnachtsbaum vom Hof',
    beschreibung: 'Warum ein Weihnachtsbaum vom Hof länger hält, welche Sorten es gibt und wie du deinen Baum bis Neujahr frisch hältst.',
    datum: '2026-11-19',
    links: [['/weihnachtsbaum-vom-hof/', 'Weihnachtsbäume vom Hof'], ['/veranstaltungen/', 'Weihnachtsmärkte am Hof'], ['/saisonkalender/', 'Saisonkalender']],
    html: `<p>Viele Höfe verkaufen im Dezember Weihnachtsbäume aus eigenen Kulturen – manche lassen dich den Baum sogar selbst aussuchen und schlagen. Weil er nicht wochenlang transportiert und gelagert wurde, nadelt er deutlich später.</p>
<h2>Welche Sorte?</h2>
<ul><li><b>Nordmanntanne:</b> der Klassiker, weiche Nadeln, hält sehr lange.</li><li><b>Blaufichte:</b> bläuliche, stechende Nadeln, kräftiger Duft, stabile Äste für schweren Schmuck.</li><li><b>Rotfichte:</b> günstig und duftend, nadelt aber früher.</li><li><b>Nobilistanne:</b> silbrig-blau, sehr haltbar, eher selten.</li></ul>
<h2>Frische prüfen</h2>
<p>Ein frischer Baum hat eine helle, feuchte Schnittfläche. Streich gegen die Wuchsrichtung über einen Zweig: Fallen kaum Nadeln ab, ist er frisch. Beim Selberschlagen weißt du es ohnehin.</p>
<h2>So bleibt er bis Neujahr schön</h2>
<ul><li>Bis zum Aufstellen draußen oder im kühlen Treppenhaus lagern, das Netz erst kurz vorher entfernen.</li><li>Vor dem Aufstellen ein paar Zentimeter vom Stamm absägen.</li><li>Einen Ständer mit Wasserbehälter verwenden und täglich nachfüllen.</li><li>Nicht direkt neben die Heizung stellen.</li></ul>
<p>Viele Höfe verbinden den Baumverkauf mit Glühwein, Feuerschalen oder einem kleinen Weihnachtsmarkt – schau bei den Veranstaltungen nach.</p>`,
  },
  {
    slug: 'weihnachtsgans-vom-hof',
    icon: 'braten', monate: [11, 12],
    titel: 'Weihnachtsgans und Ente vom Hof: rechtzeitig bestellen, richtig lagern',
    seitentitel: 'Weihnachtsgans & Ente vom Hof: bestellen und lagern',
    kurz: 'Weihnachtsgans und Ente vom Hof',
    beschreibung: 'Gans, Ente oder Pute direkt vom Hof: wann du bestellen solltest, wie viel du pro Person brauchst und wie du frisches Geflügel bis zum Fest lagerst.',
    datum: '2026-11-28',
    kurzgesagt: ['Früh bestellen: Viele Höfe nehmen Vorbestellungen schon ab Herbst an, kurz vor Weihnachten ist oft alles vergeben.', 'Faustregel für die Menge: bei Gans und Ente rund 600 bis 700 Gramm Rohgewicht pro Person.', 'Frisches Geflügel gehört an die kälteste Stelle im Kühlschrank und sollte innerhalb weniger Tage in den Ofen.'],
    links: [['/angebot/gefluegel/', 'Geflügel vom Hof'], ['/angebot/wild/', 'Wild vom Hof und vom Jäger'], ['/angebot/fleisch/', 'Fleisch und Wurst vom Hof'], ['/weihnachtsbaum-vom-hof/', 'Weihnachtsbäume vom Hof']],
    html: `<p>Zu Sankt Martin und zu Weihnachten haben Gänse und Enten Hochsaison. Viele Höfe ziehen ihre Tiere über den Sommer auf der Weide groß und schlachten erst kurz vor dem Fest. Die Zahl der Tiere steht schon im Frühjahr fest – wer zu spät fragt, geht leer aus.</p>
<h2>Wann bestellen?</h2>
<p>Am besten, sobald du weißt, wie viele Gäste kommen. Viele Betriebe führen ab Oktober oder November eine Bestellliste, manche schon früher. Ruf an oder frag im Hofladen nach und kläre gleich drei Dinge: das gewünschte Gewicht, den Abholtag und ob das Tier frisch oder gefroren übergeben wird. Die Abholung liegt meist in den letzten Tagen vor Heiligabend – oft nur zu festen Zeiten.</p>
<h2>Wie viel pro Person?</h2>
<table><thead><tr><th>Geflügel</th><th>übliches Gewicht</th><th>reicht für</th></tr></thead><tbody>
<tr><td>Gans</td><td>4 bis 5,5 kg</td><td>6 bis 8 Personen</td></tr>
<tr><td>Ente</td><td>2 bis 3 kg</td><td>3 bis 4 Personen</td></tr>
<tr><td>Pute (ganze)</td><td>5 bis 8 kg</td><td>10 und mehr Personen</td></tr>
</tbody></table>
<p>Gans und Ente haben viel Fett und Knochen, deshalb rechnest du mit rund 600 bis 700 Gramm Rohgewicht pro Person. Mit Klößen, Rotkohl und Soße wird davon jeder satt. Für kleine Runden sind Keulen oder eine halbe Gans eine gute Lösung – frag danach, viele Höfe teilen auf Wunsch.</p>
<h2>Fragen, die sich lohnen</h2>
<ul><li><b>Haltung:</b> Laufen die Tiere auf der Weide? Gänse sind Weidetiere und fressen vor allem Gras.</li><li><b>Futter:</b> Kommt das Getreide vom eigenen Hof?</li><li><b>Alter:</b> Langsam gewachsene Tiere haben festeres, aromatischeres Fleisch.</li><li><b>Innereien:</b> Herz, Magen und Leber sind die Grundlage für eine gute Soße – sag dazu, ob du sie mitnehmen möchtest.</li></ul>
<h2>Frisch lagern und sicher zubereiten</h2>
<ul><li>Frisches Geflügel nach dem Abholen sofort kühlen: unterstes Fach über dem Gemüsefach, bei höchstens 4 Grad. Innerhalb von zwei bis drei Tagen zubereiten.</li><li>Gefrorenes Geflügel langsam im Kühlschrank auftauen. Eine Gans braucht dafür gut einen Tag, oft länger. Das Auftauwasser weggießen, es soll nicht mit anderen Lebensmitteln in Berührung kommen.</li><li>Rohes Geflügel nicht abwaschen – Spritzer verteilen Keime in der Küche. Brett, Messer und Hände danach gründlich mit heißem Wasser und Spülmittel reinigen.</li><li>Immer durchgaren: Das Fleisch ist fertig, wenn an der dicksten Stelle klarer Saft austritt. Mit Bratenthermometer sind mindestens 70 Grad im Kern das Ziel.</li></ul>
<h2>Wild als Alternative</h2>
<p>Im Spätherbst und Winter gibt es bei Jägern, Forstbetrieben und manchen Hofläden Reh, Hirsch und Wildschwein aus der Region – als Keule, Rücken oder Gulasch, oft auch als Wurst und Schinken. Auch hier gilt: früh fragen, denn die Mengen sind begrenzt.</p>`,
  },
  {
    slug: 'wintergemuese-vom-hof',
    icon: 'schnee', monate: [11, 12, 1, 2],
    titel: 'Wintergemüse vom Hof: was es jetzt gibt und wie du es lagerst',
    seitentitel: 'Wintergemüse vom Hof: was es gibt, wie du es lagerst',
    kurz: 'Wintergemüse vom Hof',
    beschreibung: 'Grünkohl, Rosenkohl, Feldsalat, Pastinaken und Lagergemüse: was Hofläden im Winter anbieten und wie Kohl, Wurzeln und Kartoffeln lange frisch bleiben.',
    datum: '2026-11-28',
    kurzgesagt: ['Frisch vom Feld kommen im Winter vor allem Grünkohl, Rosenkohl, Porree, Feldsalat und Wurzelgemüse.', 'Aus dem Lager gibt es Kartoffeln, Möhren, Rote Bete, Kohlköpfe, Zwiebeln und Äpfel – oft bis ins Frühjahr.', 'Kühl, dunkel und nicht zu trocken lagern; Kartoffeln und Äpfel getrennt.'],
    links: [['/saisonkalender/', 'Saisonkalender für Obst und Gemüse'], ['/angebot/gemuese/', 'Gemüse vom Hof'], ['/angebot/kartoffeln/', 'Kartoffeln vom Hof'], ['/angebot/obst/', 'Obst vom Hof']],
    html: `<p>Auch zwischen November und Februar ist der Hofladen nicht leer. Ein Teil des Gemüses steht noch auf dem Feld und verträgt Frost, der andere Teil kommt aus dem Lager. Beides ist regional – und hat oft kürzere Wege hinter sich als jede Tomate im Winter.</p>
<h2>Frisch vom Feld</h2>
<ul><li><b>Grünkohl:</b> Ernte vom Spätherbst bis in den Februar. Kälte macht ihn milder, weil die Pflanze dann mehr Zucker einlagert.</li><li><b>Rosenkohl:</b> von Oktober bis in den Winter. Kleine, feste Röschen sind am zartesten.</li><li><b>Porree und Wirsing:</b> stehen den Winter über auf dem Feld und werden nach Bedarf geerntet.</li><li><b>Feldsalat:</b> der klassische Wintersalat, im Freiland und im ungeheizten Folientunnel.</li><li><b>Pastinaken, Schwarzwurzeln, Topinambur:</b> bleiben im Boden, solange er nicht durchgefroren ist.</li></ul>
<h2>Aus dem Lager</h2>
<p>Kartoffeln, Möhren, Rote Bete, Sellerie, Weiß- und Rotkohl, Zwiebeln und Kürbisse werden im Herbst geerntet und kühl eingelagert. Gute Lagerware erkennst du daran, dass sie fest ist und nicht schrumpelt. Äpfel und Birnen aus dem Kühllager gibt es bei vielen Obsthöfen bis weit ins Frühjahr; Chicorée wird im Winter im Dunkeln getrieben.</p>
<h2>So lagerst du zu Hause</h2>
<table><thead><tr><th>Gemüse</th><th>Lagerort</th><th>hält etwa</th></tr></thead><tbody>
<tr><td>Kartoffeln</td><td>dunkel, kühl, luftig (Keller, 4 bis 8 Grad)</td><td>mehrere Wochen</td></tr>
<tr><td>Möhren, Rote Bete, Pastinaken</td><td>Gemüsefach, ohne Grün, in ein feuchtes Tuch gewickelt</td><td>2 bis 3 Wochen</td></tr>
<tr><td>Weiß- und Rotkohl</td><td>kühl, am Stück</td><td>mehrere Wochen</td></tr>
<tr><td>Grünkohl, Rosenkohl</td><td>Gemüsefach</td><td>einige Tage</td></tr>
<tr><td>Feldsalat</td><td>Gemüsefach, locker in einer Dose</td><td>2 bis 3 Tage</td></tr>
<tr><td>Zwiebeln, Kürbis</td><td>trocken und luftig, nicht im Kühlschrank</td><td>mehrere Wochen</td></tr>
</tbody></table>
<ul><li>Kartoffeln nicht neben Äpfeln lagern: Äpfel geben ein Reifegas ab, das Kartoffeln schneller keimen lässt.</li><li>Grüne Stellen und Keime an Kartoffeln großzügig wegschneiden.</li><li>Erde am Wurzelgemüse erst kurz vor dem Kochen abwaschen – sie schützt vor dem Austrocknen.</li></ul>
<h2>Tipp für den Einkauf</h2>
<p>Viele Höfe verkaufen Kartoffeln, Möhren und Äpfel im Winter auch im größeren Gebinde. Das lohnt sich, wenn du einen kühlen Keller hast. Frag nach der Sorte: Für Suppe und Püree eignen sich mehlige, für Salat und Bratkartoffeln festkochende Kartoffeln.</p>`,
  },
  {
    slug: 'geschenke-aus-dem-hofladen',
    icon: 'geschenk', monate: [11, 12],
    titel: 'Geschenke aus dem Hofladen: Präsentkorb selbst zusammenstellen',
    seitentitel: 'Geschenke aus dem Hofladen: Präsentkorb mit Regionalem',
    kurz: 'Geschenke aus dem Hofladen',
    beschreibung: 'Honig, Marmelade, Saft, Wurst im Glas oder ein Gutschein: Ideen für Geschenke aus dem Hofladen und worauf du bei Haltbarkeit und Transport achtest.',
    datum: '2026-11-28',
    kurzgesagt: ['Haltbares zuerst: Honig, Marmelade, Säfte, Nudeln und Wurst im Glas kannst du Wochen vorher kaufen.', 'Frisches wie Käse, Eier oder Räucherfisch erst kurz vor dem Verschenken dazulegen.', 'Viele Hofläden packen Präsentkörbe auf Bestellung – ein Anruf ein bis zwei Wochen vorher genügt meist.'],
    links: [['/angebot/honig/', 'Honig vom Imker und vom Hof'], ['/angebot/marmelade/', 'Marmelade und Eingemachtes'], ['/angebot/getraenke/', 'Saft und Wein vom Hof'], ['/angebot/kaese/', 'Käse vom Hof']],
    html: `<p>Ein Korb mit Dingen, die ein paar Kilometer weiter gewachsen und gemacht sind, ist persönlicher als jede Pralinenschachtel – und wird garantiert aufgegessen. Die meisten Hofläden haben dafür mehr im Regal, als man denkt.</p>
<h2>Was sich gut verschenken lässt</h2>
<ul><li><b>Honig:</b> hält sich bei trockener, dunkler Lagerung sehr lange. Schön ist ein Paar aus einem hellen, cremigen und einem dunklen, kräftigen Honig.</li><li><b>Marmelade, Gelee, Chutney:</b> oft aus dem eigenen Obst und in kleinen Gläsern.</li><li><b>Saft, Most, Wein und Liköre:</b> Apfelsaft von der Streuobstwiese, Eierlikör vom Geflügelhof, Wein vom Winzer.</li><li><b>Wurst und Fleisch im Glas:</b> Leberwurst, Sülze oder Gulasch aus der Hofschlachtung halten verschlossen meist mehrere Monate – das Etikett sagt, ob das Glas gekühlt werden muss.</li><li><b>Nudeln, Mehl, Öl:</b> Eiernudeln vom Hühnerhof, Leinöl oder Rapsöl aus der Ölmühle.</li><li><b>Käse:</b> Hartkäse am Stück übersteht einen Tag ohne Kühlung besser als Frischkäse.</li></ul>
<h2>So wird ein Korb daraus</h2>
<ul><li>Fünf bis sieben Teile reichen. Wähle etwas Süßes, etwas Herzhaftes und etwas zu trinken.</li><li>Ein Thema hilft: Frühstück (Honig, Marmelade, Saft, Eier), Brotzeit (Wurst, Käse, Senf, Brot) oder Kochen (Nudeln, Öl, Soße im Glas).</li><li>Statt Folie: ein Spankorb, eine Holzkiste oder ein Geschirrtuch – das lässt sich weiterverwenden.</li><li>Holzwolle, Heu oder Stroh polstern Gläser beim Transport.</li></ul>
<h2>Haltbarkeit und Kühlung</h2>
<p>Schau auf jedes Etikett: Auch selbst gemachte Ware trägt ein Mindesthaltbarkeitsdatum. Kühlpflichtiges wie Frischkäse, Räucherfisch oder frische Wurst kommt erst am Tag des Verschenkens in den Korb – und der Beschenkte sollte wissen, dass es in den Kühlschrank gehört. Bei Likör und Wein an das Alter der Beschenkten denken.</p>
<h2>Wenn es schnell gehen muss</h2>
<p>Viele Höfe bieten Gutscheine an oder stellen fertige Körbe in verschiedenen Preisstufen zusammen. Und wer an einem Sonntag noch etwas braucht: An Regiomaten und Hofautomaten gibt es Honig, Wurst im Glas und Nudeln oft rund um die Uhr.</p>`,
  },
];
