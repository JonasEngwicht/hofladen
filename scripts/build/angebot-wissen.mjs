// Kurze Einkaufs- und Lagerhinweise für die Angebotsseiten (/angebot/<produkt>/), damit sie mehr sind als Linklisten.
// Nur allgemein gültiges Wissen, keine Aussagen über einzelne Höfe. HTML, wird unverändert eingesetzt.
// Kartoffeln: Saison, Lagerung und Sorten stehen auf /saisonkalender/kartoffeln/ (SAISON_WISSEN in themen.mjs) – hier nur der Verweis,
// damit die beiden Seiten nicht um dieselbe Suche konkurrieren.
export const ANGEBOT_WISSEN = {
  eier: `<h2>Woran erkenne ich, woher ein Ei kommt?</h2>
<p>Gestempelte Eier tragen einen Erzeugercode: Die erste Ziffer steht für die Haltung (0 = Bio, 1 = Freiland, 2 = Bodenhaltung), danach folgen das Land und die Nummer des Betriebs. Kleine Betriebe dürfen lose Eier direkt ab Hof auch ohne Stempel verkaufen – dort kannst du einfach nachfragen, wie die Hühner leben. Am Eierautomaten bekommst du Eier auch abends und am Sonntag.</p>
<h2>Eier richtig lagern</h2>
<p>Eier sind ab dem Legetag mindestens 28 Tage haltbar. Spätestens nach gut zwei Wochen gehören sie in den Kühlschrank, am besten mit der Spitze nach unten. Nach Ablauf des Mindesthaltbarkeitsdatums solltest du sie nur noch gut durcherhitzt essen, also zum Backen oder hart gekocht.</p>`,
  milch: `<h2>Rohmilch vom Hof: Was ist das?</h2>
<p>An der Milchtankstelle und ab Hof gibt es meist Rohmilch: unbehandelt, nicht erhitzt und mit dem natürlichen Fettgehalt von etwa vier Prozent. Deshalb steht dort immer der Hinweis „Rohmilch, vor dem Verzehr abkochen“. Manche Höfe bieten zusätzlich pasteurisierte Milch, Joghurt oder Quark an.</p>
<h2>Milch holen und lagern</h2>
<p>Bring eine saubere Flasche mit oder kaufe eine am Automaten. Rohmilch gehört sofort in den Kühlschrank und sollte innerhalb von zwei bis drei Tagen verbraucht werden. Abgekocht hält sie etwas länger.</p>`,
  kaese: `<h2>Käse aus der Hofkäserei</h2>
<p>Hofkäsereien verarbeiten die Milch der eigenen Kühe, Schafe oder Ziegen, oft in kleinen Mengen und mit wechselndem Sortiment. Käse aus Rohmilch ist als solcher gekennzeichnet. Schwangeren wird von Weichkäse aus Rohmilch abgeraten; lange gereifter Hartkäse gilt als unbedenklich.</p>
<h2>Käse richtig lagern</h2>
<p>Käse hält sich am besten in Käsepapier oder einer Dose im Gemüsefach des Kühlschranks. Hartkäse bleibt mehrere Wochen gut, Frischkäse nur wenige Tage. Eine halbe Stunde vor dem Essen herausnehmen, dann entfaltet sich das Aroma.</p>`,
  fleisch: `<h2>Fleisch und Wurst direkt vom Erzeuger</h2>
<p>Viele Höfe schlachten nur an festen Terminen und verkaufen das Fleisch frisch oder als gemischtes Paket auf Vorbestellung. Im Hofladen lohnt die Frage nach Rasse, Haltung und Fütterung und danach, wo geschlachtet wird. Wurst, Schinken und Eingekochtes gibt es meist das ganze Jahr, oft auch am Automaten.</p>
<h2>Fleisch richtig lagern</h2>
<p>Frisches Fleisch gehört an die kälteste Stelle im Kühlschrank und sollte in wenigen Tagen verbraucht werden, Hackfleisch am Tag des Kaufs. Vakuumiert hält es länger. Fleischpakete lassen sich gut portionsweise einfrieren.</p>`,
  gemuese: `<h2>Gemüse nach Saison</h2>
<p>Hofläden verkaufen vor allem, was gerade auf dem eigenen Feld wächst: Spargel im Frühjahr, Tomaten, Gurken und Bohnen im Sommer, Kürbis und Kohl im Herbst. Im Winter kommt Lagergemüse wie Möhren, Rote Bete, Zwiebeln und Kohl dazu. Was wann frisch ist, zeigt der <a href="/saisonkalender/">Saisonkalender</a>.</p>
<h2>Gemüse richtig lagern</h2>
<p>Wurzelgemüse mag es kühl und leicht feucht, zum Beispiel im Gemüsefach. Tomaten verlieren im Kühlschrank Aroma und bleiben besser draußen. Salat und Blattgemüse solltest du rasch verbrauchen. Ungewaschenes Gemüse mit etwas Erde hält länger.</p>`,
  obst: `<h2>Obst nach Saison</h2>
<p>Erdbeeren gibt es ab Mai, Kirschen im Juni und Juli, Zwetschgen ab dem Spätsommer, Äpfel und Birnen ab August. Lageräpfel verkaufen viele Obsthöfe bis ins Frühjahr. Manche Betriebe bieten Felder zum Selbstpflücken an. Was gerade reif ist, zeigt der <a href="/saisonkalender/">Saisonkalender</a>.</p>
<h2>Obst richtig lagern</h2>
<p>Äpfel bleiben kühl und dunkel wochenlang frisch. Lagere sie getrennt von anderem Obst und Gemüse, weil ihr Reifegas alles daneben schneller altern lässt. Beeren sind empfindlich: ungewaschen in den Kühlschrank und innerhalb von ein bis zwei Tagen essen.</p>`,
  kartoffeln: `<h2>Welche Kartoffel wofür?</h2>
<p>Festkochende Sorten passen zu Salat und Bratkartoffeln, vorwiegend festkochende sind die Allrounder, mehligkochende eignen sich für Püree, Klöße und Suppen. Am Hofladen bekommst du oft größere Gebinde zum Einlagern. Wann es Frühkartoffeln gibt und wie du Kartoffeln lagerst, steht auf der Seite zur <a href="/saisonkalender/kartoffeln/">Kartoffel-Saison</a>.</p>`,
  honig: `<h2>Welche Honigsorten gibt es?</h2>
<p>Die Sorte hängt davon ab, was die Bienen angeflogen haben. Rapshonig ist hell und cremig, Lindenhonig kräftig, Wald- und Tannenhonig dunkel und lange flüssig. Dass Honig mit der Zeit fest wird, ist natürlich und kein Mangel. Im Wasserbad bei höchstens 40 °C wird er wieder flüssig.</p>
<h2>Honig richtig lagern</h2>
<p>Honig hält sich kühl, trocken, dunkel und gut verschlossen mehrere Jahre. Immer einen sauberen, trockenen Löffel nehmen. Für Kinder unter einem Jahr ist Honig nicht geeignet.</p>`,
  brot: `<h2>Brot vom Hof</h2>
<p>Hofbäckereien backen oft nur an festen Backtagen, manche im Holzofen und mit Getreide vom eigenen Feld. Wer ein bestimmtes Brot möchte, bestellt am besten vor. Die Backtage stehen häufig bei den Öffnungszeiten des Hofs.</p>
<h2>Brot richtig lagern</h2>
<p>Brot bleibt im Brotkasten oder Tontopf bei Zimmertemperatur am längsten frisch. Im Kühlschrank wird es schneller altbacken. In Scheiben geschnitten lässt es sich gut einfrieren und portionsweise auftauen.</p>`,
  getraenke: `<h2>Saft, Most und Wein vom Erzeuger</h2>
<p>Viele Obsthöfe pressen Direktsaft aus eigenen Äpfeln und Birnen, oft von Streuobstwiesen. Im Herbst nehmen Lohnmostereien auch dein eigenes Obst an. Winzer verkaufen ab Hof und öffnen in der Saison eine Strauß- oder Besenwirtschaft.</p>
<h2>Saft richtig lagern</h2>
<p>Saft im Karton mit Zapfhahn (Bag-in-Box) bleibt auch nach dem Anbruch mehrere Wochen gut, weil keine Luft an den Saft kommt. Flaschen gehören nach dem Öffnen in den Kühlschrank und sollten in wenigen Tagen leer sein.</p>`,
  blumen: `<h2>Blumen zum Selberschneiden</h2>
<p>Auf Blumenfeldern schneidest du selbst und zahlst in die Kasse am Feldrand. Im Frühjahr blühen Tulpen und Narzissen, danach Pfingstrosen, im Sommer Sonnenblumen und Gladiolen, bis in den Herbst Dahlien. Ein Messer liegt meist bereit – Kleingeld solltest du mitbringen.</p>
<h2>So halten Schnittblumen länger</h2>
<p>Stiele schräg anschneiden, Blätter im Wasser entfernen und das Wasser alle zwei Tage wechseln. Der Strauß hält länger, wenn er nicht in der Sonne oder neben der Obstschale steht.</p>`,
  gefluegel: `<h2>Geflügel vom Hof</h2>
<p>Hähnchen und Suppenhühner gibt es oft nur an Schlachtterminen. Gänse und Enten werden vor allem zu St. Martin und Weihnachten verkauft und sind schnell vergeben – viele Höfe nehmen Bestellungen schon ab dem Herbst an.</p>
<h2>Geflügel richtig lagern und zubereiten</h2>
<p>Frisches Geflügel gehört gut gekühlt in den Kühlschrank und sollte in ein bis zwei Tagen verbraucht werden. Immer vollständig durchgaren und für rohes Geflügel ein eigenes Brett und Messer verwenden.</p>`,
  wild: `<h2>Wild direkt vom Jäger oder Hof</h2>
<p>Wildfleisch kommt von Jägern, Forstbetrieben und Höfen mit eigenem Gehege, etwa für Damwild. Die Hauptsaison ist im Herbst und Winter, Wildschwein gibt es fast das ganze Jahr. Verkauft wird frisch, vakuumiert oder gefroren, dazu oft Wurst und Schinken.</p>
<h2>Wild richtig zubereiten</h2>
<p>Wildfleisch ist mager und sollte immer durchgegart werden. Vakuumiert hält es im Kühlschrank einige Tage, eingefroren mehrere Monate.</p>`,
  fisch: `<h2>Fisch aus der Teichwirtschaft</h2>
<p>Teichwirtschaften und Fischzuchten verkaufen Forelle und Saibling meist das ganze Jahr, frisch oder geräuchert. Karpfen hat traditionell in den Monaten mit „r“ Saison, also von September bis April.</p>
<h2>Fisch richtig lagern</h2>
<p>Frischer Fisch gehört gut gekühlt nach Hause und am besten noch am selben Tag in die Pfanne. Räucherfisch hält sich im Kühlschrank einige Tage.</p>`,
  nudeln: `<h2>Nudeln vom Hof</h2>
<p>Viele Geflügelhöfe verarbeiten einen Teil ihrer Eier zu Nudeln, meist mit Hartweizengrieß oder Dinkel. Auf dem Etikett steht, wie viele Eier je Kilo Grieß enthalten sind. Hofnudeln gibt es häufig auch am Automaten.</p>
<h2>Nudeln richtig lagern</h2>
<p>Getrocknete Nudeln sind trocken und dunkel gelagert viele Monate haltbar. Frische Nudeln gehören in den Kühlschrank und sollten in wenigen Tagen gegessen werden.</p>`,
  marmelade: `<h2>Marmelade und Fruchtaufstrich vom Hof</h2>
<p>Hofläden kochen Marmelade und Fruchtaufstriche oft aus eigenem Obst und in kleinen Mengen. Auf dem Etikett stehen Fruchtanteil und Zuckergehalt. Je nach Ernte wechseln die Sorten von Jahr zu Jahr.</p>
<h2>Marmelade richtig lagern</h2>
<p>Ungeöffnet hält Marmelade kühl und dunkel ein Jahr und länger. Nach dem Öffnen gehört das Glas in den Kühlschrank. Ein sauberer Löffel verhindert Schimmel.</p>`,
};
