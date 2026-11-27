// Build, Teil „startseite“: Startseite und Typseiten (Milchtankstelle, Eierautomat …).
// Wird von scripts/build.mjs in fester Reihenfolge geladen; nutzt die Ergebnisse der vorherigen Teile.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ortKorrigiert, slugify } from '../lib.mjs';
import { esc } from '../../static/helfer.js';
import { ratgeberKarte, ratgeberSortiert } from '../ratgeber.mjs';
import { KATEGORIEN, ICON, statusHtml, produktIcon } from '../../static/karte.js';
import { ROOT, SAISON, cfg, eintraege, kreise, laender, osm, plz, proKreis } from './daten.mjs';
import { KATEGORIE_PFADE, SUCHFELD, kurz, plural, seite, zahl } from './html.mjs';
import { ART_TYP, GROSSSTAEDTE, MIN_SEITE, ORTE, anzHof, gross, hofItems, itemList, nennung, ortSeiten, passend, schreibe, stand } from './grundlagen.mjs';

// ---------- Startseite ----------
// Sorten des Monats als Chips mit Link zur Sortenseite (frisch und aus dem Lager)
function saisonMonatHtml(monat) {
  const chip = ([n]) => `<li><a href="${SAISON_NACH_NAME.get(n)?.pfad || '/saisonkalender/'}">${esc(n)}</a></li>`;
  const frisch = SAISON.filter(([, f]) => f.includes(monat)), lager = SAISON.filter(([, , l = []]) => l.includes(monat));
  return `<p class="saison-monat">Im ${MONATSNAMEN[monat - 1]} frisch vom Feld${frisch.length ? ':' : ' kommt vor allem Lagerware.'}</p>
  ${frisch.length ? `<ul class="saison-chips">${frisch.map(chip).join('')}</ul>` : ''}
  ${lager.length ? `<p class="saison-monat lager-titel">Aus dem Lager:</p><ul class="saison-chips lager">${lager.map(chip).join('')}</ul>` : ''}`;
}
const TYPEN = [
  { slug: 'milchtankstelle', arten: ['Milchtankstelle'], name: 'Milchtankstelle', plural: 'Milchtankstellen', icon: ICON.milch,
    kurz: 'Frische Rohmilch zum Selbstzapfen, meist rund um die Uhr. Flasche mitbringen oder vor Ort kaufen.',
    text: ['An einer Milchtankstelle – auch Milchautomat genannt – zapfst du frische Milch direkt vom Hof. Die Milch kommt meist noch am selben Tag aus dem Stall, ist gekühlt und wird nicht erhitzt oder homogenisiert.',
      'Weil es sich um Rohmilch handelt, gilt: vor dem Verzehr abkochen. Die meisten Milchtankstellen verkaufen auch Glasflaschen; Mehrwegflaschen kannst du beim nächsten Mal wieder mitbringen. Bezahlt wird mit Münzen, oft auch mit Karte.'] },
  { slug: 'eierautomat', arten: ['Eierautomat'], name: 'Eierautomat', plural: 'Eierautomaten', icon: ICON.eier,
    kurz: 'Eier vom Hof, oft aus Freilandhaltung, auch abends und am Wochenende.',
    text: ['Am Eierautomaten bekommst du frische Eier direkt vom Hof – häufig aus Freiland- oder Bodenhaltung, manchmal auch Bio-Eier. Viele Automaten sind rund um die Uhr zugänglich.',
      'Oft gibt es nebenbei Nudeln, Eierlikör oder Kartoffeln. Eier aus dem Automaten müssen genauso gekennzeichnet sein wie im Laden; den Erzeugercode findest du auf jedem Ei.'] },
  { slug: 'regiomat', arten: ['Regiomat', 'Fleischautomat', 'Kartoffelautomat', 'Honigautomat', 'Nudelautomat'], name: 'Regiomat', plural: 'Regiomaten', icon: ICON.automat,
    kurz: 'Verkaufsautomaten mit Wurst, Kartoffeln, Nudeln, Honig und mehr aus der Region.',
    text: ['Regiomaten sind Verkaufsautomaten mit Fächern für regionale Lebensmittel: Wurst und Fleisch, Käse, Kartoffeln, Nudeln, Honig, Marmelade oder Getränke. Sie stehen meist direkt am Hof oder an gut erreichbaren Stellen im Ort.',
      'Die Fächer werden regelmäßig vom Betrieb aufgefüllt, Kühlware ist gekühlt. Damit kannst du regional einkaufen, auch wenn der Hofladen geschlossen ist – abends, sonntags und an Feiertagen.'] },
];
// Weitere Einstiegstypen (Phase 3): eigene Seiten nur, wenn es genug Einträge gibt (siehe MIN_SEITE in den Land- und Kreisseiten)
const WEITERE_TYPEN = [
  { slug: 'imker', name: 'Imkerei', plural: 'Imkereien', h1: 'Imker und Honig ab Hof', icon: ICON.hofladen,
    naechste: 'die nächste Imkerei', passt: (e) => e.art === 'Imkerei' || e.art === 'Honigautomat',
    kurz: 'Imkereien mit Honigverkauf ab Hof und Honigautomaten.',
    text: ['Bei der Imkerei um die Ecke bekommst du Honig aus deiner Gegend – oft mit Sorten, die es im Supermarkt nicht gibt, etwa Raps-, Linden- oder Waldhonig. Manche Imker verkaufen auch Wachskerzen, Propolis oder Met.',
      'Viele Imkereien verkaufen nebenbei aus dem Haus oder über einen kleinen Automaten. Ruf vorher an, wenn keine Öffnungszeiten angegeben sind.'] },
  { slug: 'selbstpfluecken', name: 'Feld zum Selbstpflücken', plural: 'Felder zum Selbstpflücken', h1: 'Selbstpflücken und Selbsternte', icon: ICON.blatt,
    naechste: 'das nächste Feld zum Selbstpflücken', passt: (e) => e.art === 'Selbstpflücken' || !!e.merkmale?.selbstpfluecken,
    kurz: 'Erdbeeren, Äpfel, Blumen und Kürbisse selbst pflücken – saisonal direkt am Feld.',
    text: ['Beim Selbstpflücken erntest du Erdbeeren, Himbeeren, Äpfel, Blumen oder Kürbisse selbst und zahlst nach Gewicht oder Stück. Die Saison beginnt meist im Juni mit Erdbeeren und endet im Oktober mit Kürbissen.',
      'Ob das Feld gerade geöffnet ist, hängt vom Wetter und der Ernte ab. Schau vorher in die Öffnungszeiten oder ruf kurz an.'] },
  { slug: 'hofcafe', name: 'Hofcafé', plural: 'Hofcafés', h1: 'Hofcafés', icon: ICON.hofladen,
    naechste: 'das nächste Hofcafé', passt: (e) => e.art === 'Hofcafé' || !!e.merkmale?.hofcafe,
    kurz: 'Kuchen, Kaffee und regionale Küche direkt auf dem Hof.',
    text: ['Ein Hofcafé ist ein Café auf einem Bauernhof: Kuchen aus eigenen Eiern und Milch, oft mit Blick auf Felder und Tiere. Viele haben nur am Wochenende oder in der Saison geöffnet.',
      'Häufig gehört ein Hofladen dazu, in dem du nach dem Kaffee noch einkaufen kannst.'] },
  { slug: 'solawi', name: 'Solawi', plural: 'Solawis', h1: 'Solidarische Landwirtschaft (Solawi)', icon: ICON.blatt,
    naechste: 'die nächste Solawi', passt: (e) => e.art === 'Solawi',
    kurz: 'Höfe, bei denen du mit einem Monatsbeitrag Ernteanteile bekommst.',
    text: ['Bei einer Solidarischen Landwirtschaft (Solawi) teilen sich Mitglieder die Kosten eines Hofs und bekommen dafür regelmäßig einen Anteil der Ernte – meist Gemüse, manchmal auch Brot, Eier oder Milch.',
      'Abgeholt wird an festen Tagen am Hof oder an Verteilstellen. Einen Laden mit Öffnungszeiten gibt es meist nicht; frag beim Hof nach freien Anteilen.'] },
];
for (const t of WEITERE_TYPEN) t.arten = [];
for (const t of TYPEN) { t.liste = eintraege.filter((e) => t.arten.includes(e.art)); t.pfadSlug = slugify(t.plural); }
for (const t of WEITERE_TYPEN) { t.liste = eintraege.filter(t.passt); t.pfadSlug = t.slug; }
// Weitere Kategorien mit Seiten auf Bundesland- und Kreisebene
const AUTOMATEN = { slug: 'hofladen-automaten', pfadSlug: 'hofladen-automaten', name: 'Hofladen-Automat', plural: 'Hofladen-Automaten', icon: ICON.automat,
  liste: eintraege.filter((e) => e.typ === 'automat'),
  kurz: 'Alle Hofautomaten: Milchtankstellen, Eierautomaten, Regiomaten, Fleisch- und Kartoffelautomaten.',
  text: ['Hofladen-Automaten verkaufen Lebensmittel direkt vom Hof – auch dann, wenn der Hofladen geschlossen hat. Dazu gehören Milchtankstellen, Eierautomaten, Regiomaten mit gemischtem Sortiment sowie Fleisch-, Wurst- und Kartoffelautomaten.',
    'Viele Automaten sind rund um die Uhr zugänglich. Bezahlt wird meist mit Münzen oder Scheinen, immer öfter auch mit Karte. Mit dem Filter „Jetzt geöffnet“ siehst du, welche Automaten gerade erreichbar sind.'] };
const BIO = { slug: 'bio-hofladen', pfadSlug: 'bio-hofladen', name: 'Bio-Hofladen', plural: 'Bio-Hofläden', icon: ICON.blatt,
  liste: eintraege.filter((e) => e.bio),
  kurz: 'Hofläden und Automaten mit Bio-Angebot.',
  text: ['Als Bio gekennzeichnet sind Höfe, die laut OpenStreetMap ausschließlich oder teilweise Bio-Produkte verkaufen.',
    'Ob ein Betrieb zertifiziert ist, erkennst du am EU-Bio-Logo und an der Öko-Kontrollstellennummer (z. B. DE-ÖKO-006) auf der Ware oder am Hof.'] };
const WEITERE_AKTIV = WEITERE_TYPEN.filter((t) => t.liste.length >= MIN_SEITE);
const KAT_TYPEN = [...TYPEN, AUTOMATEN, BIO, ...WEITERE_AKTIV];
// Typseite zur Art eines Eintrags (nur, wenn es die Seite gibt)
const artTyp = (e) => [...TYPEN, ...WEITERE_AKTIV].find((t) => t.slug === ART_TYP[e.art]) || null;
// Saisonprodukte mit eigener Seite: Höfe, die das Produkt im Namen, in der Beschreibung oder im Angebot (OSM) nennen
const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
// Eine Seite je Sorte aus dem Saisonkalender. Höfe gehören dazu, wenn Name, Beschreibung oder OSM-Produkte die Sorte nennen.
// Unter drei passenden Höfen bleibt die Seite noindex und zeigt die Umkreissuche nach der Produktgruppe.
const SORTEN = {
  Spargel: ['spargel', /spargel/i, 'Spargelhöfe', 'gemuese'], Rhabarber: ['rhabarber', /rhabarber/i, 'Höfe mit Rhabarber', 'gemuese'],
  Erdbeeren: ['erdbeeren', /erdbeer/i, 'Erdbeerhöfe', 'obst'], Kirschen: ['kirschen', /kirsch/i, 'Höfe mit Kirschen', 'obst'],
  Himbeeren: ['himbeeren', /himbeer/i, 'Höfe mit Himbeeren', 'obst'], Heidelbeeren: ['heidelbeeren', /heidelbeer|blaubeer/i, 'Höfe mit Heidelbeeren', 'obst'],
  'Pflaumen und Zwetschgen': ['pflaumen-zwetschgen', /pflaume|zwetsch|zwetschg/i, 'Höfe mit Pflaumen und Zwetschgen', 'obst'],
  Äpfel: ['aepfel', /apfel|äpfel|obsthof/i, 'Obsthöfe mit Äpfeln', 'obst'], Birnen: ['birnen', /birne/i, 'Höfe mit Birnen', 'obst'],
  Walnüsse: ['walnuesse', /walnuss|walnüss/i, 'Höfe mit Walnüssen', 'obst'], Kartoffeln: ['kartoffeln', /kartoffel/i, 'Höfe mit Kartoffeln', 'kartoffeln'],
  Möhren: ['moehren', /möhre|moehre|karotte|mohrrübe/i, 'Höfe mit Möhren', 'gemuese'], Zwiebeln: ['zwiebeln', /zwiebel/i, 'Höfe mit Zwiebeln', 'gemuese'],
  Kohlrabi: ['kohlrabi', /kohlrabi/i, 'Höfe mit Kohlrabi', 'gemuese'], Kopfsalat: ['kopfsalat', /kopfsalat|\bsalat/i, 'Höfe mit Salat', 'gemuese'],
  Erbsen: ['erbsen', /erbse/i, 'Höfe mit Erbsen', 'gemuese'], Gurken: ['gurken', /gurke/i, 'Höfe mit Gurken', 'gemuese'],
  Zucchini: ['zucchini', /zucchini/i, 'Höfe mit Zucchini', 'gemuese'], Tomaten: ['tomaten', /tomate/i, 'Höfe mit Tomaten', 'gemuese'],
  'Grüne Bohnen': ['bohnen', /bohne/i, 'Höfe mit Bohnen', 'gemuese'], Zuckermais: ['zuckermais', /zuckermais|maiskolben|\bsweet ?corn/i, 'Höfe mit Zuckermais', 'gemuese'],
  Blumenkohl: ['blumenkohl', /blumenkohl/i, 'Höfe mit Blumenkohl', 'gemuese'], Brokkoli: ['brokkoli', /brokkoli|broccoli/i, 'Höfe mit Brokkoli', 'gemuese'],
  Spinat: ['spinat', /spinat/i, 'Höfe mit Spinat', 'gemuese'], Weißkohl: ['weisskohl', /weißkohl|weisskohl|sauerkraut/i, 'Höfe mit Weißkohl', 'gemuese'],
  'Rote Bete': ['rote-bete', /rote be(e)?te/i, 'Höfe mit Roter Bete', 'gemuese'], Kürbis: ['kuerbis', /kürbis|kuerbis/i, 'Kürbishöfe', 'gemuese'],
  Porree: ['porree', /porree|\blauch/i, 'Höfe mit Porree', 'gemuese'], Feldsalat: ['feldsalat', /feldsalat/i, 'Höfe mit Feldsalat', 'gemuese'],
  Pastinaken: ['pastinaken', /pastinak/i, 'Höfe mit Pastinaken', 'gemuese'], Rosenkohl: ['rosenkohl', /rosenkohl/i, 'Höfe mit Rosenkohl', 'gemuese'],
  Grünkohl: ['gruenkohl', /grünkohl|gruenkohl/i, 'Höfe mit Grünkohl', 'gemuese'],
};
const SAISON_SEITEN = SAISON.filter(([n]) => SORTEN[n]).map(([name, frisch, lager = []]) => {
  const [slug, re, plural, gruppe] = SORTEN[name];
  const liste = eintraege.filter((e) => re.test([e.name, e.beschreibung, ...(e.produkte || [])].filter(Boolean).join(' ')));
  return { name, slug, re, plural, gruppe, frisch, lager, liste, pfad: `/saisonkalender/${slug}/`, indexiert: liste.length >= MIN_SEITE };
});
const SAISON_NACH_NAME = new Map(SAISON_SEITEN.map((x) => [x.name, x]));
// Saisonale Startseite: Akzentfarbe und Motive wechseln jeden Monat (aus dem Saisonkalender)
const MONATS_FARBE = [null, '#CDE3F0', '#E8D9B5', '#C9E4A6', '#EDE3C0', '#EDE3C0', '#F5A3A8', '#F4A6B5', '#C3B1EC', '#F6C46A', '#F59E4C', '#D7B98E', '#9FD3B4'];
const MONATS_NAME = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function saisonBand() {
  const m = MONAT_JETZT;
  const frisch = SAISON.filter(([, f]) => f.includes(m)).map(([n]) => n);
  const namen = (frisch.length ? frisch : SAISON.filter(([, , l]) => (l || []).includes(m)).map(([n]) => n)).slice(0, 4);
  const motive = m === 12 ? ['weihnachtsbaeume'] : [];
  for (const n of namen) { const g = SORTEN[n]?.[3]; if (g && !motive.includes(g)) motive.push(g); }
  if (!motive.length) motive.push('eier', 'milch');
  const links = namen.map((n) => esc(n));
  return `<p class="saison-band" style="--saison:${MONATS_FARBE[m]}"><span class="saison-motive" aria-hidden="true">${motive.slice(0, 3).map((k) => `<span>${produktIcon(k)}</span>`).join('')}</span><span>Jetzt im ${MONATS_NAME[m]}: ${m === 12 ? 'Weihnachtsbäume vom Hof, ' : ''}${nennung(links)} · <a href="#saison-jetzt">Was gerade wächst</a></span></p>`;
}
const saisonJetzt = JSON.stringify(SAISON.map(([n, frisch, lager]) => [n, frisch, lager || [], SAISON_NACH_NAME.get(n)?.pfad || '/saisonkalender/']));
// Monat beim Bauen; im Browser wird bei einem anderen Monat neu gerechnet (data-saison-stand)
const MONAT_JETZT = +new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(5, 7);
const monatsSpanne = (ms) => { if (!ms.length) return ''; const s = [...ms]; // zusammenhängend, auch über den Jahreswechsel
  let start = s.findIndex((m, i) => !s.includes(((m + 10) % 12) + 1)); if (start < 0) start = 0;
  return `${MONATSNAMEN[s[start] - 1]} bis ${MONATSNAMEN[s[(start + s.length - 1) % s.length] - 1]}`; };
const ANGEBOT = { eier: ['Eier vom Hof', 'Eiern'], milch: ['Milch vom Hof', 'Milch'], kaese: ['Käse vom Hof', 'Käse'], fleisch: ['Fleisch & Wurst vom Hof', 'Fleisch und Wurst'],
  gemuese: ['Gemüse vom Hof', 'Gemüse'], obst: ['Obst vom Hof', 'Obst'], kartoffeln: ['Kartoffeln vom Hof', 'Kartoffeln'], honig: ['Honig vom Hof', 'Honig'],
  brot: ['Brot vom Hof', 'Brot'], getraenke: ['Saft & Wein vom Hof', 'Saft und Wein'], blumen: ['Blumen vom Feld', 'Blumen'],
  weihnachtsbaeume: ['Weihnachtsbäume vom Hof', 'Weihnachtsbäumen'], gefluegel: ['Geflügel vom Hof', 'Geflügel'], wild: ['Wild vom Hof', 'Wild'],
  fisch: ['Fisch vom Hof', 'Fisch'], nudeln: ['Nudeln vom Hof', 'Nudeln'], marmelade: ['Marmelade vom Hof', 'Marmelade'], tierfutter: ['Tierfutter vom Hof', 'Tierfutter'] };
const ANGEBOT_SEITEN = Object.keys(ANGEBOT).filter((kat) => eintraege.filter((e) => e.kat.includes(kat)).length >= 30);
// Weihnachtsbäume vom Hof (Saisonseite, Einträge über Name/Beschreibung oder Angebot des Betriebs)
const WEIHNACHT = eintraege.filter((e) => e.kat.includes('weihnachtsbaeume'));

// ---------- Wochenmärkte (OSM amenity=marketplace, data/osm-maerkte.json) ----------
const MAERKTE = (existsSync(join(ROOT, 'data', 'osm-maerkte.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'osm-maerkte.json'), 'utf8')) : [])
  .filter((m) => kreise.has(m.kreis));
const maerkteProKreis = new Map();
for (const m of MAERKTE) {
  m.ortNah = ortKorrigiert(m.plzNah, m.ortNah); m.ortAnzeige = m.ort || m.ortNah;
  // Namen wie „Wochenmarkt“ allein bekommen den Ort dazu, damit Karte und Listen unterscheidbar bleiben
  m.titel = !m.name ? `Wochenmarkt in ${m.ortAnzeige}` : /^(wochen|bauern|frische|grün|gruen)?markt(platz)?$/i.test(m.name.trim()) ? `${m.name.trim()} ${m.ortAnzeige}` : m.name;
  m.adresse = [m.strasse, [m.plz, m.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || `${m.ortNah} (${m.plzNah})`;
  m.anker = `markt-${m.osm.replace('/', '-')}`;
  if (!maerkteProKreis.has(m.kreis)) maerkteProKreis.set(m.kreis, []);
  maerkteProKreis.get(m.kreis).push(m);
}
for (const l of maerkteProKreis.values()) l.sort((a, b) => (b.oeffnungszeiten ? 1 : 0) - (a.oeffnungszeiten ? 1 : 0) || a.ortAnzeige.localeCompare(b.ortAnzeige, 'de') || a.titel.localeCompare(b.titel, 'de'));
const MARKT_SEITE_AB = MIN_SEITE; // eigene Kreisseite für Märkte ab 3 Märkten
const marktPfad = (k) => `/wochenmaerkte/${k.landSlug}/${k.pfad.split('/')[2]}/`;
const marktKarte = (m, H = 'h3') => `<article class="laden laden-markt" id="${m.anker}" data-typ="markt" data-land="${kreise.get(m.kreis)?.land || ''}" data-lat="${m.lat}" data-lon="${m.lon}"${m.oeffnungszeiten ? ` data-oh="${esc(m.oeffnungszeiten)}"` : ''}>
  <div class="laden-symbol" title="Wochenmarkt">${ICON.markt}</div>
  <div class="laden-text">
    <p class="laden-art">${m.ueberdacht ? 'Markthalle' : 'Wochenmarkt'}${m.bio ? ' <span class="bio">Bio</span>' : ''}</p>
    <${H} class="laden-name">${esc(m.titel)}</${H}>
    <p class="laden-adr">${esc(m.adresse)}</p>
    ${m.oeffnungszeiten ? statusHtml(m.oeffnungszeiten, null) : '<p class="st st-leer">Marktzeiten nicht hinterlegt</p>'}
    <p class="aktionen">
      <a class="akt" href="https://www.google.com/maps/dir/?api=1&amp;destination=${m.lat},${m.lon}" rel="nofollow noopener" target="_blank">${ICON.route}Route</a>${m.website ? `<a class="akt" href="${esc(m.website)}" rel="nofollow noopener" target="_blank">${ICON.web}Website</a>` : ''}<a class="akt" href="https://www.openstreetmap.org/${m.osm}" rel="nofollow noopener" target="_blank">${ICON.stift}In OSM bearbeiten</a>
    </p>
  </div>
</article>`;
// Abschnitt auf der Hofladen-Kreisseite: Märkte im Kreis (höchstens sechs) mit Link zur Marktseite
function marktAbschnitt(k) {
  const ms = maerkteProKreis.get(k.code) || [];
  if (!ms.length) return '';
  const ziel = ms.length >= MARKT_SEITE_AB ? marktPfad(k) : null;
  return `<section class="abschnitt maerkte-kurz"><h2>Wochenmärkte ${esc(k.im)}</h2>
  <p>Frisches vom Erzeuger gibt es auch auf ${ms.length === 1 ? 'dem Wochenmarkt' : `${zahl(ms.length)} Wochenmärkten`} ${esc(k.im)}${ziel ? ` – <a href="${ziel}">alle Wochenmärkte ${esc(k.im)}</a>` : ''}.</p>
  <div class="karten-reihe">${ms.slice(0, 6).map((m) => marktKarte(m)).join('')}</div>
</section>`;
}

const akkusativ = (t) => t.name === 'Milchtankstelle' ? 'eine Milchtankstelle' : `einen ${t.name}${/mat$/.test(t.name) ? 'en' : ''}`;
// Seiten je Automatentyp und Kreis (ab zwei Einträgen), z. B. /bayern/landkreis-x/milchtankstellen/
const TYP_KREIS = new Map(); // `${t.slug}|${kreis-Code}` → { t, k, liste, pfad }
{
  const belegt = new Set([...ORTE.values()].flatMap((m) => [...m.values()].map((o) => o.pfad)));
  for (const t of KAT_TYPEN) {
    const proK = new Map();
    for (const e of t.liste) { if (!proK.has(e.kreis)) proK.set(e.kreis, []); proK.get(e.kreis).push(e); }
    for (const [code, liste] of proK) {
      if (liste.length < MIN_SEITE) continue;
      const k = kreise.get(code);
      // keine Doppelungen: Automaten-Seite nur, wenn sie mehr zeigt als eine Typ-Seite; Bio nur, wenn nicht alle Bio sind
      if (t === AUTOMATEN && TYPEN.some((x) => TYP_KREIS.get(`${x.slug}|${code}`)?.liste.length === liste.length)) continue;
      if (t === BIO && liste.length === (proKreis.get(code) || []).length) continue;
      const pfad = `${k.pfad}${t.pfadSlug}/`;
      if (belegt.has(pfad)) continue;
      TYP_KREIS.set(`${t.slug}|${code}`, { t, k, liste, pfad });
    }
  }
}
const typKreis = (t, k) => TYP_KREIS.get(`${t.slug}|${k.code}`);
const typKreisLinks = (k, ausser) => KAT_TYPEN.map((t) => typKreis(t, k)).filter((x) => x && x.t !== ausser);
const typLinks = (liste, anker, kreis = null) => { const t = TYPEN.map((x) => [x, liste.filter((e) => x.arten.includes(e.art)).length]).filter(([, n]) => n);
  return t.length ? `<p>Hofautomaten hier: ${t.map(([x, n]) => { const tk = kreis && typKreis(x, kreis);
    return `<a href="${tk ? tk.pfad : `/${x.slug}/${anker ? '#' + anker : ''}`}">${zahl(n)} ${n === 1 ? x.name : x.plural}</a>`; }).join(', ')}.</p>` : ''; };
// Kategorieseiten je Bundesland, z. B. /bayern/milchtankstellen/
const LAND_KAT = new Map(); // `${t.slug}|${land-Code}` → { t, l, liste, pfad }
for (const t of KAT_TYPEN) for (const l of laender) {
  const liste = t.liste.filter((e) => e.k.land === l.code);
  // Liegen alle Einträge in einem Kreis (z. B. Stadtstaaten), genügt die Kreisseite
  if (new Set(liste.map((e) => e.kreis)).size === 1 && typKreis(t, liste[0].k)) continue;
  if (liste.length >= MIN_SEITE) LAND_KAT.set(`${t.slug}|${l.code}`, { t, l, liste, pfad: `/${l.slug}/${t.pfadSlug}/` });
}
const landKat = (t, l) => LAND_KAT.get(`${t.slug}|${l.code}`);
for (const x of [...TYP_KREIS.values(), ...LAND_KAT.values()]) KATEGORIE_PFADE.add(x.pfad);

schreibe('/', seite({
  titel: passend(`Hofladen in der Nähe finden – ${zahl(eintraege.length)} Höfe & Automaten`, `Hofladen in der Nähe finden – ${zahl(eintraege.length)} Höfe`),
  beschreibung: `Hofladen in der Nähe finden: ${zahl(eintraege.length)} Hofläden, Milchtankstellen und Eierautomaten in ganz Deutschland – mit Öffnungszeiten, Angebot und Route.`,
  pfad: '/',
  klasse: 'start',
  kopfSuche: false,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'Organization', '@id': `${cfg.domain}/#organisation`, name: cfg.name, url: cfg.domain + '/', logo: cfg.domain + '/icon-512.png' },
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${cfg.domain}/#website`, name: cfg.name, url: cfg.domain + '/', inLanguage: 'de-DE',
      publisher: { '@id': `${cfg.domain}/#organisation` },
      // Interne Suche: /suche?q=… leitet auf die passende Orts-, Kreis- oder Hofseite weiter
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${cfg.domain}/suche?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } }],
  inhalt: `
<section class="held">
  <div class="held-text">
    <h1>Hofläden in deiner Nähe</h1>
    <p class="held-lead">${zahl(eintraege.length)} Hofläden und Hofautomaten in ganz Deutschland – mit Öffnungszeiten, Angebot und Weg dorthin.</p>
    ${saisonBand()}
    <form class="plz-gross" action="/suche" method="get">
      <label for="plz">Postleitzahl, Ort, Name des Hofs – gern mit Produkt</label>
      <div class="plz-zeile">
        <input id="plz" name="q" ${SUCHFELD} placeholder="z. B. Spargel Cottbus" required>
        <button type="submit" aria-label="Hofläden finden"><span class="knopf-lang">Hofläden finden</span><span class="knopf-kurz">Suchen</span></button>
      </div>
      <p class="fehler" id="plz-fehler" hidden>Diese Postleitzahl kennen wir nicht. Bitte prüfe die fünf Ziffern.</p>
      <div class="ort-auswahl" id="ort-auswahl" hidden></div>
      <fieldset class="wunsch">
        <legend>Was suchst du? (optional – wir zeigen dann nur passende Höfe)</legend>
        ${['eier', 'milch', 'fleisch', 'gemuese', 'obst', 'kartoffeln', 'honig', 'kaese'].map((k) => `<label><input type="checkbox" name="produkt" value="${k}"><span>${esc(KATEGORIEN[k])}</span></label>`).join('\n        ')}
      </fieldset>
    </form>
    <button type="button" class="standort" id="standort">${ICON.route}Meinen Standort verwenden</button>
    <p class="zuletzt" id="zuletzt" hidden></p>
  </div>
  <figure class="held-karte">
    <img src="/img/deutschland.svg?v=${KARTE_VERSION}" decoding="async" width="${KARTE_GROESSE[0]}" height="${KARTE_GROESSE[1]}" alt="Deutschlandkarte aus ${zahl(eintraege.length)} gelben Punkten – jeder Punkt ist ein Hofladen oder Hofautomat.">
    <figcaption>Jeder Punkt ein Hof. <a href="/karte/">Zur Karte</a></figcaption>
  </figure>
</section>
<section id="naehe" class="abschnitt naehe" hidden></section>
<section class="abschnitt arten">
  <h2>Was du hier findest</h2>
  <ul class="arten-liste">
    <li>${ICON.hofladen}<div><h3>Hofläden</h3><p>Verkauf direkt auf dem Hof: Gemüse, Obst, Eier, Fleisch, Käse und was die Saison hergibt.</p><p class="anzahl">${zahl(anzHof)} Einträge</p></div></li>
    ${TYPEN.map((t) => `<li>${t.icon}<div><h3><a href="/${t.slug}/">${t.plural}</a></h3><p>${t.kurz}</p><p class="anzahl">${zahl(t.liste.length)} Einträge</p></div></li>`).join('\n    ')}
  </ul>
  <p class="typ-chips start-kategorien">${MAERKTE.length ? `<a href="/wochenmaerkte/">${ICON.markt}Wochenmärkte <span>${zahl(MAERKTE.length)}</span></a>` : ''}${WEIHNACHT.length && [10, 11, 12].includes(new Date().getMonth() + 1) ? `<a href="/weihnachtsbaum-vom-hof/">${ICON.tanne}Weihnachtsbaum vom Hof <span>${zahl(WEIHNACHT.length)}</span></a>` : ''}<a href="/hofladen-automaten/">${ICON.automat}Alle Hofladen-Automaten <span>${zahl(AUTOMATEN.liste.length)}</span></a><a href="/bio-hofladen/">${ICON.blatt}Bio-Hofläden <span>${zahl(BIO.liste.length)}</span></a><a href="/sonntags-geoeffnet/">Sonntags geöffnet</a>${ANGEBOT_SEITEN.map((k) => `<a href="/angebot/${k}/">${esc(SAISON_SEITEN.some((x) => x.name === KATEGORIEN[k]) ? ANGEBOT[k][0] : KATEGORIEN[k])}</a>`).join('')}</p>
</section>
<section class="abschnitt news-start" data-news-start hidden><h2>Neu und frisch auf den Höfen</h2><ul class="news-liste" data-news-start-liste></ul><p class="leise">Meldungen der Betriebe. Du hast einen Hof? <a href="/betrieb/">Neuigkeiten selbst veröffentlichen</a>.</p></section>
<section class="abschnitt saison-jetzt" id="saison-jetzt" data-saison='${esc(saisonJetzt)}' data-saison-stand="${MONAT_JETZT}">
  <h2>Gerade frisch vom Feld</h2>
  <div data-saison-inhalt>${saisonMonatHtml(MONAT_JETZT)}</div>
  <p class="saison-suche-links">Höfe in deiner Nähe finden: <a href="#plz" data-wunsch="gemuese">mit Gemüse</a> · <a href="#plz" data-wunsch="obst">mit Obst</a> · <a href="#plz" data-wunsch="kartoffeln">mit Kartoffeln</a></p>
  <p><a href="/saisonkalender/">Ganzen Saisonkalender ansehen</a></p>
</section>
<section class="abschnitt ratgeber-start">
  <h2>Aus dem Ratgeber</h2>
  <ul class="ratgeber-liste">${ratgeberSortiert(MONAT_JETZT).slice(0, 3).map((a) => ratgeberKarte(a, MONAT_JETZT)).join('')}</ul>
  <p><a href="/ratgeber/">Alle Ratgeber-Artikel lesen</a></p>
</section>
<section class="abschnitt laender">
  <h2>Hofläden nach Bundesland</h2>
  <ul class="laender-liste">
    ${laender.map((l) => `<li><a href="/${l.slug}/"><span>${esc(l.name)}</span><span class="zahl">${zahl(l.anzahl)}</span></a></li>`).join('\n    ')}
  </ul>
</section>
<section class="abschnitt">
  <h2>Hofläden in großen Städten</h2>
  <ul class="kreis-liste">${GROSSSTAEDTE.map((x) => `<li><a href="${x.pfad}"><span>Hofläden in ${esc(x.name)}</span><span class="zahl">${zahl(x.n)}</span></a></li>`).join('')}</ul>
</section>
<section class="abschnitt">
  <h2>Beliebte Orte für Hofläden</h2>
  <ul class="kreis-liste">${ortSeiten.filter((o) => !GROSSSTAEDTE.some((g) => g.pfad === o.pfad)).sort((a, b) => b.liste.length - a.liste.length).slice(0, 30).map((o) => `<li><a href="${o.pfad}"><span>Hofläden in ${esc(o.ortTitel)}</span><span class="zahl">${zahl(o.liste.length)}</span></a></li>`).join('')}</ul>
</section>
<section class="abschnitt seo-text">
  <h2>Hofladen in der Nähe finden</h2>
  <p>Ein Hofladen – auch Bauernladen oder Hofverkauf genannt – ist der direkteste Weg zu regionalen Lebensmitteln: Landwirtinnen und Landwirte verkaufen dort, was auf dem eigenen Hof wächst und entsteht. Gib deine Postleitzahl ein, und du siehst alle Hofläden und Direktvermarkter in deiner Umgebung, sortiert nach Entfernung, mit Öffnungszeiten und Route.</p>
  <h3>Mehr als Kartoffeln und Eier</h3>
  <p>Im Hofladen gibt es je nach Betrieb Obst und Gemüse der Saison, Kartoffeln, Eier, Milch und Käse, Fleisch und Wurst aus eigener Schlachtung, Honig, Brot, Säfte und Wein. Viele Höfe verkaufen auch Bio-Produkte. Was gerade geerntet wird, zeigt dir unser <a href="/saisonkalender/">Kalender für Obst und Gemüse</a>; alle Standorte auf einen Blick findest du auf der <a href="/karte/">Karte aller Hofläden</a>.</p>
  <h3>Sonntags einkaufen, Bio vom Hof</h3>
  <p>Am Wochenende unterwegs? Diese <a href="/sonntags-geoeffnet/">Hofläden haben sonntags geöffnet</a>. Wer Wert auf ökologischen Anbau legt, findet hier alle <a href="/bio-hofladen/">Bio-Hofläden nach Region</a>.</p>
  <h3>Dein Hof fehlt?</h3>
  <p>Der Eintrag ist kostenlos: <a href="/mitmachen/">Hof kostenlos eintragen</a> – für Hofläden, Milchtankstellen, Eierautomaten und Regiomaten.</p>
  <h3>Einkaufen rund um die Uhr: Milchtankstelle, Eierautomat, Regiomat</h3>
  <p>Wenn der Hofladen geschlossen hat, helfen Hofautomaten weiter: An der <a href="/milchtankstelle/">Milchtankstelle</a> zapfst du frische Milch, ein <a href="/eierautomat/">Eierautomat</a> hat Eier vom Hof, und im <a href="/regiomat/">Regiomat</a> findest du Wurst, Kartoffeln, Nudeln und mehr aus der Region – oft auch nachts und am Wochenende.</p>
</section>`,
}));

// ---------- Typseiten (Milchtankstelle, Eierautomat, Regiomat; Imker, Selbstpflücken, Hofcafés, Solawi) ----------
for (const t of [...TYPEN, ...WEITERE_AKTIV]) {
  const proLand = laender.map((l) => ({ l, liste: t.liste.filter((e) => e.k.land === l.code) })).filter((x) => x.liste.length);
  const vollListe = t.liste.length <= 800;
  schreibe(`/${t.slug}/`, seite({
    titel: passend(`${t.name} in der Nähe – alle ${zahl(t.liste.length)} ${t.plural} in Deutschland`, `${t.name} in der Nähe – ${zahl(t.liste.length)} ${t.plural}`, `${t.h1 || t.name} in der Nähe – ${zahl(t.liste.length)} in Deutschland`, `${t.name} in der Nähe – ${zahl(t.liste.length)} Standorte`, `${t.h1 || t.plural} in Deutschland`),
    beschreibung: `${t.name} in der Nähe finden: ${zahl(t.liste.length)} ${t.plural} in ganz Deutschland mit Adresse, Öffnungszeiten und Route – nach Bundesland und Landkreis sortiert.`,
    pfad: `/${t.slug}/`,
    jsonld: [itemList(`${t.plural} in Deutschland`, vollListe ? proLand.flatMap(({ liste }) => {
      const proK = new Map(); for (const e of liste) { if (!proK.has(e.k)) proK.set(e.k, []); proK.get(e.k).push(e); }
      return [...proK].sort((a, b) => a[0].titel.localeCompare(b[0].titel, 'de')).flatMap(([, es]) => hofItems(es)); })
      : [...TYP_KREIS.values()].filter((x) => x.t === t).map((x) => [`${t.plural} ${x.k.im}`, x.pfad]))],
    krumen: [[t.plural, `/${t.slug}/`]],
    inhalt: `
<section class="seitenkopf">
  <p class="hof-art typ-icon">${t.icon}</p>
  <h1>${t.h1 || t.plural} in Deutschland</h1>
  <p>${zahl(t.liste.length)} ${t.plural} in ${plural(proLand.length, 'Bundesland', 'Bundesländern')}. Gib deine Postleitzahl ein, um ${t.naechste || (t.name === 'Milchtankstelle' ? 'die nächste Milchtankstelle' : `den nächsten ${t.name}`)} in deiner Nähe zu finden.</p>
  <form class="kopf-suche gross-suche" action="/suche" method="get"><label class="sr" for="typ-plz">Postleitzahl, Ort oder Name des Hofs</label><input id="typ-plz" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required><button type="submit">Suchen</button></form>
</section>
<section class="abschnitt seo-text">${t.text.map((x) => `<p>${x}</p>`).join('')}
  <p>Auch interessant: ${[...TYPEN, ...WEITERE_AKTIV].filter((x) => x !== t).map((x) => `<a href="/${x.slug}/">${x.plural}</a>`).join(', ')}, die <a href="/karte/">Hofladen-Karte</a> mit allen Standorten und der <a href="/saisonkalender/">Saisonkalender</a> für Obst und Gemüse.</p></section>
<nav class="abschnitt sprung-liste" aria-label="Bundesländer"><h2>${t.plural} nach Bundesland</h2><ul class="kreis-liste">${proLand.map(({ l, liste }) => `<li><a href="#${l.slug}"><span>${esc(l.name)}</span><span class="zahl">${zahl(liste.length)}</span></a></li>`).join('')}</ul></nav>
${proLand.map(({ l, liste }) => {
  const proK = new Map();
  for (const e of liste) { if (!proK.has(e.k)) proK.set(e.k, []); proK.get(e.k).push(e); }
  return `<section class="abschnitt typ-land" id="${l.slug}"><h2>${t.plural} in ${esc(l.name)}</h2><p><a href="/${l.slug}/">Alle Hofläden in ${esc(l.name)}</a></p>${vollListe
    ? [...proK].sort((a, b) => a[0].titel.localeCompare(b[0].titel, 'de')).map(([k, es]) => `<h3><a href="${typKreis(t, k)?.pfad || k.pfad}">${esc(k.titel)}</a></h3><ul class="eintrag-liste">${es.map((e) => `<li><a href="${e.pfad}">${esc(e.titelSeite)}</a> <span class="zahl">${esc(e.ortAnzeige)}</span></li>`).join('')}</ul>`).join('')
    : `<ul class="kreis-liste">${[...proK].sort((a, b) => b[1].length - a[1].length).map(([k, es]) => `<li><a href="${typKreis(t, k)?.pfad || k.pfad}"><span>${esc(k.titel)}</span><span class="zahl">${zahl(es.length)}</span></a></li>`).join('')}</ul>`}</section>`;
}).join('\n')}`,
  }));
}

export { ANGEBOT, ANGEBOT_SEITEN, AUTOMATEN, BIO, KAT_TYPEN, LAND_KAT, MAERKTE, MARKT_SEITE_AB, MONATSNAMEN, MONATS_FARBE, MONATS_NAME, MONAT_JETZT, SAISON_NACH_NAME, SAISON_SEITEN, SORTEN, TYPEN, TYP_KREIS, WEIHNACHT, WEITERE_AKTIV, WEITERE_TYPEN, akkusativ, artTyp, landKat, maerkteProKreis, marktAbschnitt, marktKarte, marktPfad, monatsSpanne, saisonBand, saisonJetzt, saisonMonatHtml, typKreis, typKreisLinks, typLinks };
