// Pixelbreite von Suchergebnis-Titeln und -Beschreibungen, wie Google und SEO-Checker sie messen:
// Titel in Arial 20 px (Grenze ~580 px), Beschreibung in Arial 14 px (Grenze ~1000 px).
// Tabelle: Zeichenbreiten in Arial (metrisch gleich Liberation Sans) bei 20 px.
const BREITE_20 = {"0":11.12,"1":11.12,"2":11.12,"3":11.12,"4":11.12,"5":11.12,"6":11.12,"7":11.12,"8":11.12,"9":11.12," ":5.56,"!":5.56,"\"":7.1,"#":11.12,"$":11.12,"%":17.78,"&":13.34,"'":3.82,"(":6.66,")":6.66,"*":7.78,"+":11.68,",":5.56,"-":6.66,".":5.56,"/":5.56,":":5.56,";":5.56,"<":11.68,"=":11.68,">":11.68,"?":11.12,"@":20.3,"A":13.34,"B":13.34,"C":14.44,"D":14.44,"E":13.34,"F":12.22,"G":15.56,"H":14.44,"I":5.56,"J":10,"K":13.34,"L":11.12,"M":16.66,"N":14.44,"O":15.56,"P":13.34,"Q":15.56,"R":14.44,"S":13.34,"T":12.22,"U":14.44,"V":13.34,"W":18.88,"X":13.34,"Y":13.34,"Z":12.22,"[":5.56,"\\":5.56,"]":5.56,"^":9.38,"_":11.12,"`":6.66,"a":11.12,"b":11.12,"c":10,"d":11.12,"e":11.12,"f":5.56,"g":11.12,"h":11.12,"i":4.44,"j":4.44,"k":10,"l":4.44,"m":16.66,"n":11.12,"o":11.12,"p":11.12,"q":11.12,"r":6.66,"s":10,"t":5.56,"u":11.12,"v":10,"w":14.44,"x":10,"y":10,"z":10,"{":6.68,"|":5.2,"}":6.68,"~":11.68,"Ä":13.34,"Ö":15.56,"Ü":14.44,"ä":11.12,"ö":11.12,"ü":11.12,"ß":12.22,"é":11.12,"è":11.12,"ê":11.12,"á":11.12,"à":11.12,"â":11.12,"ó":11.12,"ò":11.12,"ô":11.12,"í":5.56,"ì":5.56,"î":5.56,"ú":11.12,"ù":11.12,"û":11.12,"ç":10,"ñ":11.12,"ë":11.12,"ï":5.56,"ÿ":10,"–":11.12,"—":20,"„":6.66,"“":6.66,"”":6.66,"‘":4.44,"’":4.44,"…":20,"·":6.66,"•":7,"€":11.12,"§":11.12,"°":8,"²":6.66,"³":6.66,"½":16.68,"×":11.68};
const UNBEKANNT = 11.12; // Breite eines mittleren Kleinbuchstabens
// Checker runden leicht nach oben (Kerning, Hinting) – 1 % Aufschlag
export function pixelBreite(text, px = 20) {
  let s = 0;
  for (const z of String(text)) s += BREITE_20[z] ?? UNBEKANNT;
  return Math.round(s * 1.01 * px / 20);
}
export const TITEL_MAX = 580;
export const BESCHREIBUNG_MAX = 1000;
export const titelBreite = (t) => pixelBreite(t, 20);
export const beschreibungBreite = (t) => pixelBreite(t, 14);

// Titel mit Marke, solange er passt – sonst ohne „| Hofladenliste“ (Google zeigt den Seitennamen ohnehin an).
const MARKE = ' | Hofladenliste';
export function titelMitMarke(titel) {
  const ohne = String(titel).replace(/\s*\|\s*Hofladenliste\s*$/, '');
  return titelBreite(ohne + MARKE) <= TITEL_MAX ? ohne + MARKE : ohne;
}

// Beschreibung auf höchstens 1000 px kürzen, ohne Wörter zu zerschneiden.
// Reihenfolge: Nebensätze und Zusätze zuerst, dann mittlere Sätze, zuletzt hart am Wortende.
export function kuerzeBeschreibung(text, max = BESCHREIBUNG_MAX) {
  let b = String(text).replace(/\s+/g, ' ').trim();
  const passt = (x) => beschreibungBreite(x) <= max;
  if (passt(b)) return b;
  const schritte = [
    (x) => x.replace(/ – plus [^.]*\./, '.'),
    (x) => x.replace(/, u\. a\. in ([^,.]+), ([^,.]+), ([^,.]+)\./, ', u. a. in $1, $2.'),
    (x) => x.replace(/, u\. a\. in ([^,.]+), ([^,.]+)\./, ', u. a. in $1.'),
    (x) => x.replace(/ Telefon: [^]*?\.(?= |$)/, ''),
    (x) => x.replace(/^([^.]*?) \([^)]*\)/, '$1'),
  ];
  for (const s of schritte) { b = s(b).trim(); if (passt(b)) return b; }
  // Sätze an „. “ trennen (Abkürzungen wie „u. a.“ und Zahlen wie „13.994“ bleiben heil)
  const saetze = b.split(/(?<=[^\s.]{2}[.!?“])\s+(?=[A-ZÄÖÜ0-9„])/);
  const erster = saetze[0], letzter = saetze.length > 1 ? saetze[saetze.length - 1] : null;
  // a) erster und letzter Satz bleiben (Schlusssatz ist meist der Hinweis „Mit … und Route“), mittlere so viele wie passen
  if (letzter && passt(`${erster} ${letzter}`)) {
    const mitte = saetze.slice(1, -1).filter(Boolean);
    let auswahl = [];
    for (const x of mitte) if (passt([erster, ...auswahl, x, letzter].join(' '))) auswahl.push(x);
    return [erster, ...auswahl, letzter].join(' ');
  }
  // b) Sätze der Reihe nach, zu lange überspringen; reicht es nur für den ersten, den nächsten am Wortende kürzen
  if (passt(erster)) {
    const auswahl = [erster];
    let erstUebersprungen = null;
    for (const x of saetze.slice(1)) {
      if (!erstUebersprungen && passt([...auswahl, x].join(' '))) auswahl.push(x);
      else erstUebersprungen ??= x;
    }
    const ergebnis = auswahl.join(' ');
    if (erstUebersprungen && ergebnis.length < 110) {
      const w = erstUebersprungen.split(' ');
      while (w.length > 2 && !passt(`${ergebnis} ${w.join(' ')} …`)) w.pop();
      if (w.length > 2) return `${ergebnis} ${w.join(' ').replace(/[\s,;:–-]+$/, '')} …`;
    }
    return ergebnis;
  }
  const woerter = saetze[0].split(' ');
  while (woerter.length > 1 && !passt(woerter.join(' ') + ' …')) woerter.pop();
  return woerter.join(' ').replace(/[\s,;:–-]+$/, '') + ' …';
}
