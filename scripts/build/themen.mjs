// Build, Teil „themen“: Karte, Saison, Ratgeber, Info-, Vertrauens- und Formularseiten, Wochenmärkte.
// Wird von scripts/build.mjs in fester Reihenfolge geladen; nutzt die Ergebnisse der vorherigen Teile.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RATGEBER } from '../ratgeber.mjs';
import { esc } from '../../static/helfer.js';
import { SAISON_PRODUKTE } from '../../src/betrieb.js';
import { KATEGORIEN, ICON, karteHtml, produktIcon } from '../../static/karte.js';
import { HEUTE, KACHELN, OUT, ROOT, SAISON, betreiber, cfg, datumDe, eintraege, impressum, kreise, laender, manuell, offen, offenDatensaetze, offenNeu, offenNeuSumme, osm, plz, proKreis, verwaltungsDatensaetze } from './daten.mjs';
import { GA_ID, KARTENZAHLUNG, KATEGORIE_PFADE, KAT_CODES_KARTE, LOGO, SUCHFELD, kartenDaten, kartenPanel, plural, seite, zahl } from './html.mjs';
import { MIN_SEITE, PLURAL_ART, anzHof, gross, hofItems, itemList, km, link, passend, schreibe } from './grundlagen.mjs';
import { MAERKTE, MARKT_SEITE_AB, MONATSNAMEN, MONAT_JETZT, SAISON_NACH_NAME, SAISON_SEITEN, TYPEN, WEIHNACHT, maerkteProKreis, marktKarte, marktPfad, monatsSpanne, saisonMonatHtml } from './startseite.mjs';
import { naeheSuche } from './regionen.mjs';
import { TERMINE, ZAHLUNG_TEXT, bearbeiten, terminHtml, terminLd } from './hoefe.mjs';

// ---------- Deutschlandkarte ----------
// Punkte für die Vollkarte: Höfe [lat, lon, Typ, Slug, Titel, Art, Öffnungszeiten, Angebots-Buchstaben, Bio, Kartenzahlung, Land]
// und Wochenmärkte [lat, lon, Titel, Marktzeiten, Link, Land]. Typ: h Hofladen, m Milchtankstelle, e Eierautomat, r Regiomat u. a.
const KARTE_TYP = (e) => (e.typ === 'hofladen' ? 'h' : e.art === 'Milchtankstelle' ? 'm' : e.art === 'Eierautomat' ? 'e' : 'r');
writeFileSync(join(OUT, 'punkte.json'), JSON.stringify({
  h: eintraege.map((e) => [+e.lat.toFixed(5), +e.lon.toFixed(5), KARTE_TYP(e), e.slug, e.titel, e.art, e.oeffnungszeiten || '',
    e.kat.map((x) => 'abcdefghijklmnopqrstuvwxyz'[KAT_CODES_KARTE.indexOf(x)]).join(''), e.bio ? 1 : 0, e.zahlung?.some((z) => KARTENZAHLUNG.includes(z)) ? 1 : 0, e.k?.land || '']),
  m: MAERKTE.map((m) => { const k = kreise.get(m.kreis); const viele = (maerkteProKreis.get(m.kreis) || []).length >= MARKT_SEITE_AB;
    return [+m.lat.toFixed(5), +m.lon.toFixed(5), m.titel, m.oeffnungszeiten || '', `${viele ? marktPfad(k) : `/wochenmaerkte/${k.landSlug}/`}#${m.anker}`, k.land]; }),
  k: KAT_CODES_KARTE,
}));
schreibe('/karte/', seite({
  titel: 'Hofladen-Karte: alle Hofläden in Deutschland auf einer Karte',
  beschreibung: `Hofladen-Karte: alle ${zahl(eintraege.length)} Hofläden, Milchtankstellen, Eierautomaten und Regiomaten in Deutschland auf einer Karte – hineinzoomen, Hof antippen, Route planen.`,
  pfad: '/karte/',
  krumen: [['Karte', '/karte/']],
  klasse: 'vollkarte',
  inhalt: `
<section class="seitenkopf kompakt">
  <h1>Alle Hofläden auf der Karte</h1>
  <p>${zahl(anzHof)} Hofläden, ${zahl(eintraege.length - anzHof)} Hofautomaten${MAERKTE.length ? ` und ${zahl(MAERKTE.length)} Wochenmärkte` : ''}. Filter wählen, hineinzoomen, Punkt antippen – die Liste zeigt, was im Kartenausschnitt liegt.</p>
</section>
<div class="kartenseite" data-vollkarte>
  <div class="kartenseite-werkzeug" data-kf role="group" aria-label="Filter für die Karte">
    <div class="segment kf-typ" role="radiogroup" aria-label="Art">
      ${[['alle', 'Alle'], ['h', 'Hofläden'], ['m', 'Milchtankstellen'], ['e', 'Eierautomaten'], ['r', 'Regiomaten'], ...(MAERKTE.length ? [['markt', 'Wochenmärkte']] : [])].map(([k, t], i) => `<button type="button" data-kf-typ="${k}" aria-pressed="${i === 0}">${t}</button>`).join('')}
    </div>
    <button type="button" class="umschalter" data-kf-schalter="offen" aria-pressed="false">Jetzt geöffnet</button>
    <button type="button" class="umschalter" data-kf-schalter="bio" aria-pressed="false">Bio</button>
    <button type="button" class="umschalter" data-kf-schalter="rund" aria-pressed="false">24/7</button>
    <button type="button" class="umschalter" data-kf-schalter="karte" aria-pressed="false">Kartenzahlung</button>
    <div class="kat-filter" aria-label="Angebot">${Object.entries(KATEGORIEN).map(([k, n]) => `<button type="button" data-kf-kat="${k}" aria-pressed="false">${produktIcon(k)}${esc(n)}</button>`).join('')}</div>
  </div>
  <div class="kartenseite-haupt">
    <div class="kartenseite-karte">${kartenPanel({ titel: 'Karte aller Hofläden in Deutschland' })}
      <button type="button" class="knopf knopf-dunkel kf-standort" data-mein-standort hidden>${ICON.standort}Mein Standort</button>
      <div class="legende"><span class="punkt hofladen"></span>Hofladen <span class="punkt milch"></span>Milchtankstelle <span class="punkt eier"></span>Eierautomat <span class="punkt automat"></span>Regiomat${MAERKTE.length ? ' <span class="punkt markt"></span>Wochenmarkt' : ''}</div>
    </div>
    <aside class="kartenseite-liste" data-kl aria-label="Einträge im Kartenausschnitt">
      <button type="button" class="kl-griff" data-kl-griff aria-expanded="false"><span class="sr">Liste ein- oder ausklappen</span></button>
      <p class="kl-status" data-kl-status aria-live="polite">Lade die Karte, um die Einträge im Ausschnitt zu sehen. Ohne Karte findest du alle Höfe über die Bundesländer unten.</p>
      <ol class="kl-liste" data-kl-liste></ol>
    </aside>
  </div>
</div>
<section class="abschnitt">
  <h2>Hofläden nach Bundesland</h2>
  <ul class="kreis-liste">${laender.map((l) => `<li><a href="/${l.slug}/"><span>${esc(l.name)}</span><span class="zahl">${zahl(l.anzahl)}</span></a></li>`).join('')}</ul>
</section>
<section class="abschnitt seo-text">
  <h2>Hofautomaten in Deutschland</h2>
  <p>${TYPEN.map((t) => `<a href="/${t.slug}/">${zahl(t.liste.length)} ${t.plural}</a>`).join(', ')} – nach Bundesland und Landkreis sortiert. Was gerade Saison hat, zeigt der <a href="/saisonkalender/">Saisonkalender</a>.</p>
</section>`,
}));

// ---------- Saisonkalender ----------
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
schreibe('/saisonkalender/', seite({
  titel: 'Saisonkalender Obst & Gemüse: Was gibt es wann vom Hof?',
  beschreibung: 'Wann gibt es Spargel, Erdbeeren, Kürbis und Grünkohl aus der Region? Der Saisonkalender für Obst und Gemüse aus deutschem Anbau – Monat für Monat.',
  pfad: '/saisonkalender/',
  krumen: [['Saisonkalender', '/saisonkalender/']],
  klasse: 'saison',
  inhalt: `
<section class="seitenkopf">
  <h1>Saisonkalender für Obst und Gemüse</h1>
  <p>Was bei uns gerade wächst und was aus dem Lager kommt. Im Hofladen findest du vor allem, was Saison hat – frischer und oft günstiger.</p>
  <p class="legende-saison"><span class="frisch"></span>frisch vom Feld <span class="lager"></span>aus dem Lager</p>
</section>
<div class="abschnitt saison-werkzeug" data-saison-werkzeug>
  <div class="segment" role="group" aria-label="Sorten filtern"><button type="button" data-saison-gruppe="alle" aria-pressed="true">Alle</button><button type="button" data-saison-gruppe="obst" aria-pressed="false">Obst</button><button type="button" data-saison-gruppe="gemuese" aria-pressed="false">Gemüse</button></div>
  <label class="saison-suchfeld"><span class="sr">Sorte suchen</span><input type="search" data-saison-suche placeholder="Sorte suchen, z. B. Kürbis" autocomplete="off"></label>
  <label class="saison-monatswahl"><span>Monat</span><select data-saison-monat-wahl>${MONATSNAMEN.map((m, i) => `<option value="${i + 1}"${i + 1 === MONAT_JETZT ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
</div>
<section class="abschnitt saison-monatsansicht" data-saison-monatsansicht aria-live="polite">${saisonMonatHtml(MONAT_JETZT)}</section>
<div class="abschnitt saison-tabelle-rahmen">
  <table class="saison-tabelle">
    <thead><tr><th scope="col">Sorte</th>${MONATE.map((m, i) => `<th scope="col" data-monat="${i + 1}"${i + 1 === MONAT_JETZT ? ' class="aktuell" aria-current="date"' : ''}>${m}</th>`).join('')}</tr></thead>
    <tbody>
      ${SAISON.map(([n, frisch, lager = []]) => `<tr data-gruppe="${SAISON_NACH_NAME.get(n)?.gruppe === 'obst' ? 'obst' : 'gemuese'}" data-name="${esc(n.toLowerCase())}"><th scope="row">${SAISON_NACH_NAME.has(n) ? `<a href="${SAISON_NACH_NAME.get(n).pfad}">${esc(n)}</a>` : esc(n)}</th>${MONATE.map((m, i) => { const mo = i + 1; const c = frisch.includes(mo) ? 'frisch' : lager.includes(mo) ? 'lager' : ''; return `<td data-monat="${mo}"${c ? ` class="${c}"` : ''}><span class="sr">${c === 'frisch' ? 'frisch' : c === 'lager' ? 'Lager' : '–'}</span></td>`; }).join('')}</tr>`).join('\n      ')}
    </tbody>
  </table>
</div>
<p class="abschnitt leise">Richtwerte für den Freilandanbau in Deutschland; je nach Region und Wetter verschiebt sich die Saison um einige Wochen.</p>
<section class="abschnitt seo-text">
  <h2>Saisonales Obst und Gemüse im Hofladen kaufen</h2>
  <p>Am frischesten bekommst du die Ernte direkt vom Erzeuger. Gib deine Postleitzahl ein und wähle, was du suchst – wir zeigen dir Hofläden in deiner Nähe, sortiert nach Entfernung.</p>
  <form class="saison-suche" action="/suche" method="get">
    <label class="sr" for="saison-plz">Postleitzahl oder Ort</label>
    <input id="saison-plz" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required>
    ${['obst', 'gemuese', 'kartoffeln', 'eier', 'honig'].map((k) => `<label class="haken"><input type="checkbox" name="produkt" value="${k}"> ${esc(KATEGORIEN[k])}</label>`).join('')}
    <button type="submit" class="knopf">Hofläden finden</button>
  </form>
  <p>Kein Hofladen offen? An <a href="/regiomat/">Regiomaten</a> gibt es Kartoffeln, Obst und mehr auch abends und am Wochenende, frische Eier am <a href="/eierautomat/">Eierautomaten</a> und Milch an der <a href="/milchtankstelle/">Milchtankstelle</a>.</p>
</section>
<section class="abschnitt">
  <h2>Hofläden in deinem Bundesland</h2>
  <ul class="kreis-liste">${laender.map((l) => `<li><a href="/${l.slug}/"><span>${esc(l.name)}</span><span class="zahl">${zahl(l.anzahl)}</span></a></li>`).join('')}</ul>
</section>`,
}));

// ---------- Saisonprodukte: Höfe mit Spargel, Erdbeeren, Äpfeln … ----------
for (const sp of SAISON_SEITEN) {
  const proLand = laender.map((l) => ({ l, liste: sp.liste.filter((e) => e.k.land === l.code).sort((a, b) => a.k.titel.localeCompare(b.k.titel, 'de') || a.ortAnzeige.localeCompare(b.ortAnzeige, 'de')) })).filter((x) => x.liste.length);
  const geordnet = proLand.flatMap(({ liste }) => liste);
  const nHof = sp.liste.filter((e) => e.typ === 'hofladen').length;
  const saison = monatsSpanne(sp.frisch), lager = monatsSpanne(sp.lager);
  const andere = SAISON_SEITEN.filter((x) => x !== sp);
  schreibe(sp.pfad, seite({
    titel: passend(`${sp.name} vom Hof – ${zahl(sp.liste.length)} ${sp.plural} in Deutschland`, `${sp.name} vom Hof – ${zahl(sp.liste.length)} Höfe`, `${sp.name} vom Hof`),
    beschreibung: `${sp.name} direkt vom Erzeuger: ${zahl(sp.liste.length)} ${sp.plural} und Hofläden${saison ? `. Saison: ${saison}` : ''}${lager ? `, aus dem Lager ${lager}` : ''}. Mit Öffnungszeiten, Adresse und Route.`,
    pfad: sp.pfad,
    klasse: 'kompakt',
    noindex: !sp.indexiert,
    krumen: [['Saisonkalender', '/saisonkalender/'], [sp.name, sp.pfad]],
    jsonld: geordnet.length ? [itemList(`${sp.plural} in Deutschland`, hofItems(geordnet))] : [],
    inhalt: `
<section class="seitenkopf">
  <h1>${esc(sp.name)} vom Hof</h1>
  <p>${sp.liste.length ? `${zahl(sp.liste.length)} ${esc(sp.plural)}${nHof !== sp.liste.length ? ` (davon ${zahl(nHof)} Hofläden)` : ''} in ${plural(proLand.length, 'Bundesland', 'Bundesländern')} nennen ${esc(sp.name)} ausdrücklich.` : `Noch hat kein Hof ${esc(sp.name)} ausdrücklich im Eintrag – viele Höfe mit ${esc(KATEGORIEN[sp.gruppe])} verkaufen sie trotzdem in der Saison.`}${saison ? ` Frisch vom Feld gibt es ${esc(sp.name)} von ${esc(saison)}${lager ? `, aus dem Lager ${esc(lager)}` : ''}.` : ''}</p>
  <h2 class="naehe-titel">Hier gibt’s ${esc(sp.name)} in deiner Nähe</h2>
  ${naeheSuche({ produkt: sp.gruppe }, `Höfe mit ${KATEGORIEN[sp.gruppe]} in meiner Nähe`)}
  ${(() => { const p = SAISON_PRODUKTE.find((x) => x.replace(/^Neue /, '').toLowerCase().startsWith(sp.name.toLowerCase().slice(0, 5))); return p ? `<p class="saison-abo-link"><a href="/saison-benachrichtigung/#produkt=${encodeURIComponent(p)}">🔔 Sag mir Bescheid, wenn es ${esc(sp.name)} in meiner Nähe gibt</a></p>` : ''; })()}
  <form class="kopf-suche gross-suche" action="/suche" method="get"><label class="sr" for="sp-q">Postleitzahl, Ort oder Name des Hofs</label><input id="sp-q" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required><button type="submit">Suchen</button></form>
</section>
<section class="abschnitt seo-text"><p>Welche Höfe ${esc(sp.name)} anbieten, erkennen wir am Namen des Hofs, an der Beschreibung und an den Angaben in OpenStreetMap. Gerade bei saisonaler Ware lohnt sich vor dem Besuch ein Anruf – Erntebeginn und Verkaufszeiten hängen vom Wetter ab. Wann welches Obst und Gemüse Saison hat, zeigt der <a href="/saisonkalender/">Saisonkalender</a>.</p></section>
<nav class="abschnitt sprung-liste" aria-label="Bundesländer"><h2>${esc(sp.plural)} nach Bundesland</h2><ul class="kreis-liste">${proLand.map(({ l, liste }) => `<li><a href="#${l.slug}"><span>${esc(l.name)}</span><span class="zahl">${zahl(liste.length)}</span></a></li>`).join('')}</ul></nav>
${proLand.map(({ l, liste }) => `<section class="abschnitt typ-land" id="${l.slug}"><h2>${esc(sp.plural)} in ${esc(l.name)}</h2><ul class="eintrag-liste">${liste.map((e) => `<li><a href="${e.pfad}">${esc(e.titelSeite)}</a> <span class="zahl">${esc(e.ortAnzeige)} · ${esc(e.k.titel)}</span></li>`).join('')}</ul></section>`).join('\n')}
<section class="abschnitt"><h2>Weitere Saisonprodukte</h2><p class="typ-chips">${andere.map((x) => `<a href="${x.pfad}">${esc(x.name)} <span>${zahl(x.liste.length)}</span></a>`).join('')}</p></section>`,
  }), sp.indexiert);
  if (sp.indexiert) KATEGORIE_PFADE.add(sp.pfad);
}

// ---------- Infoseiten ----------
const imp = cfg.impressum;
const impFehlt = !imp.name || !imp.strasse || !imp.plzOrt || !imp.email;
const kontaktMail = cfg.kontaktEmail || imp.email;
// ---------- Seite /veranstaltungen/ (Daten siehe oben bei den Hofseiten) ----------
{
  const proLand = laender.map((l) => ({ l, liste: TERMINE.filter((v) => v.e.k.land === l.code) })).filter((x) => x.liste.length);
  schreibe('/veranstaltungen/', seite({
    titel: TERMINE.length ? `Hoffeste und Veranstaltungen auf Höfen – ${zahl(TERMINE.length)} Termine` : 'Hoffeste und Veranstaltungen auf Höfen',
    beschreibung: 'Hoffeste, Tag des offenen Hofes, Schlachtfeste und Weihnachtsmärkte am Hof – Termine, die die Betriebe selbst eintragen, nach Bundesland sortiert.',
    pfad: '/veranstaltungen/', noindex: TERMINE.length < MIN_SEITE, krumen: [['Veranstaltungen', '/veranstaltungen/']],
    jsonld: TERMINE.slice(0, 100).map(terminLd),
    inhalt: `
<section class="seitenkopf">
  <h1>Hoffeste und Veranstaltungen</h1>
  <p>${TERMINE.length ? `${plural(TERMINE.length, 'Termin', 'Termine')} von Höfen in ${plural(proLand.length, 'Bundesland', 'Bundesländern')}.` : 'Gerade sind keine Termine eingetragen.'} Die Termine tragen die Betriebe selbst ein – Hoffeste, Tag des offenen Hofes, Schlachtfeste oder Weihnachtsmärkte am Hof.</p>
  ${proLand.length > 1 ? `<p class="typ-chips">${proLand.map(({ l, liste }) => `<a href="#${l.slug}">${esc(l.name)} <span>${liste.length}</span></a>`).join('')}</p>` : ''}
</section>
${proLand.map(({ l, liste }) => `<section class="abschnitt" id="${l.slug}"><h2>${esc(l.name)}</h2><ul class="termin-liste">${liste.map((v) => terminHtml(v)).join('')}</ul></section>`).join('\n')}
<section class="abschnitt seo-text"><p>Du betreibst einen Hof und planst ein Fest? Im <a href="/betrieb/">Betreiber-Bereich</a> trägst du Termine selbst ein. Sie erscheinen hier und auf der Seite deines Hofs.</p></section>`,
  }), TERMINE.length >= MIN_SEITE);
}

schreibe('/merkliste/', seite({
  titel: 'Deine Merkliste | Hofladenliste',
  beschreibung: 'Deine gemerkten Hofläden und Hofautomaten – gespeichert nur in deinem Browser.',
  pfad: '/merkliste/',
  krumen: [['Merkliste', '/merkliste/']],
  noindex: true,
  inhalt: `
<section class="seitenkopf kompakt">
  <h1>Deine Merkliste</h1>
  <p>Höfe, die du mit ${ICON.herz} merkst, landen hier. Gespeichert wird nur in deinem Browser.</p>
</section>
<section class="abschnitt" data-merkliste>
  <p class="leise" data-merkliste-status>Merkliste wird geladen …</p>
  <div class="karten-reihe" data-merkliste-liste></div>
  <p data-merkliste-leeren hidden><button type="button" class="knopf knopf-hell">Merkliste leeren</button></p>
</section>`,
}), false);

// Betreiber-Bereich: Anmeldung per Link, danach Höfe, Neuigkeiten, Termine und Statistik (Inhalt per JavaScript)
schreibe('/betrieb/', seite({
  titel: 'Für Betriebe: Eintrag selbst pflegen | Hofladenliste',
  beschreibung: 'Betreiber-Bereich von Hofladenliste: Öffnungszeiten, Angebot und Fotos selbst pflegen, Neuigkeiten wie „Spargel ist da!“ und Hoffeste veröffentlichen.',
  pfad: '/betrieb/', noindex: true, klasse: 'textseite', krumen: [['Für Betriebe', '/betrieb/']],
  inhalt: `
<section class="seitenkopf kompakt">
  <h1>Dein Hof auf Hofladenliste</h1>
  <p>Öffnungszeiten, Angebot und Fotos selbst pflegen, Neuigkeiten und Termine veröffentlichen – ohne Passwort, mit einem Link per E-Mail.</p>
</section>
<section class="abschnitt betrieb" data-betrieb>
  <div class="betrieb-anmelden" data-betrieb-anmelden>
    <h2>Anmelden</h2>
    <form data-anmelden-form>
      <label for="betrieb-email">E-Mail-Adresse deines Betriebs</label>
      <div class="plz-zeile"><input id="betrieb-email" name="email" type="email" autocomplete="email" required placeholder="info@dein-hof.de"><button type="submit" class="knopf">Anmeldelink schicken</button></div>
      <p class="leise" data-anmelden-status aria-live="polite"></p>
    </form>
    <p>Noch kein Zugang? Such deinen Hof und wähle auf seiner Seite „Eintrag übernehmen“. Passt deine E-Mail-Adresse zur Website des Hofs, bekommst du sofort einen Bestätigungslink, sonst prüfen wir die Übernahme von Hand. Fragen: <a href="mailto:hofladenliste@gmail.com">hofladenliste@gmail.com</a></p>
    <p>Du kaufst gern bei einem Hof ein, der hier noch fehlt? <a href="/aushang/empfehlen/">Flyer „Empfiehl deinen Lieblingshof“ ausdrucken</a>.</p>
  </div>
  <div data-betrieb-inhalt hidden></div>
  <noscript><p>Der Betreiber-Bereich braucht JavaScript.</p></noscript>
</section>`,
}), false);

// Aushang zum Ausdrucken (A4/A5) mit QR-Code, und Flyer „Empfiehl deinen Lieblingshof“ (Inhalt per JavaScript, QR aus static/qr.js)
const AUSHANG_LEISTE = `<div class="aushang-leiste"><div class="segment" role="radiogroup" aria-label="Papierformat"><button type="button" data-papier-wahl="A4" aria-pressed="true">A4</button><button type="button" data-papier-wahl="A5" aria-pressed="false">A5</button></div><button type="button" class="knopf" data-drucken>Drucken oder als PDF speichern</button></div>`;
schreibe('/betrieb/aushang/', seite({
  titel: 'Aushang mit QR-Code drucken | Hofladenliste', pfad: '/betrieb/aushang/', noindex: true, klasse: 'aushang-seite', kopfSuche: false, krumen: [['Für Betriebe', '/betrieb/'], ['Aushang', '/betrieb/aushang/']],
  beschreibung: 'Aushang für deinen Hofladen zum Ausdrucken: Öffnungszeiten, Angebot und QR-Code zum Eintrag auf Hofladenliste, als A4 oder A5.',
  inhalt: `<section class="abschnitt kein-druck"><h1>Aushang für deinen Hof</h1><p>Häng ihn an die Tür oder neben die Kasse. Der QR-Code führt zu deinem Eintrag – dort stehen Öffnungszeiten und Angebot immer aktuell.</p>${AUSHANG_LEISTE}<p class="leise" data-aushang-status>Wird geladen …</p></section>
<article class="aushang" data-aushang="hof" hidden>
  <p class="aushang-marke">${LOGO}<span>Hofladenliste</span></p>
  <h2 class="aushang-name" data-hof-name></h2><p class="aushang-art" data-hof-art></p>
  <div class="aushang-spalten"><div><div data-hof-zeiten></div><div data-hof-angebot></div><p data-hof-telefon></p></div>
    <figure class="aushang-qr"><div data-qr></div><figcaption><b>Öffnungszeiten &amp; Angebot immer aktuell</b><span data-qr-url></span></figcaption></figure></div>
  <p class="aushang-fuss">Hofläden, Milchtankstellen und Hofautomaten in ganz Deutschland: hofladenliste.de</p>
</article>`,
}), false);
schreibe('/aushang/empfehlen/', seite({
  titel: 'Flyer: Empfiehl deinen Lieblingshof | Hofladenliste', pfad: '/aushang/empfehlen/', noindex: true, klasse: 'aushang-seite', kopfSuche: false, krumen: [['Flyer: Hof empfehlen', '/aushang/empfehlen/']],
  beschreibung: 'Flyer zum Ausdrucken: Gib ihn deinem Lieblingshof, damit er sich kostenlos auf Hofladenliste einträgt.',
  inhalt: `<section class="abschnitt kein-druck"><h1>Empfiehl deinen Lieblingshof</h1><p>Druck den Flyer aus und gib ihn dem Hof, bei dem du gern einkaufst. Der Eintrag ist kostenlos.</p>${AUSHANG_LEISTE}</section>
<article class="aushang" data-aushang="empfehlung">
  <p class="aushang-marke">${LOGO}<span>Hofladenliste</span></p>
  <h2 class="aushang-name">Wir kaufen gern bei Ihnen ein!</h2>
  <p class="aushang-art">Damit noch mehr Menschen Ihren Hof finden: Tragen Sie ihn kostenlos auf hofladenliste.de ein.</p>
  <div class="aushang-spalten"><div><h2>So geht’s</h2><ol><li>QR-Code scannen oder hofladenliste.de/mitmachen/ öffnen</li><li>Name, Adresse und Öffnungszeiten eintragen</li><li>Fertig – Neuigkeiten wie „Spargel ist da!“ können Sie danach selbst veröffentlichen</li></ol>
    <p>Kostenlos, ohne Werbung im Eintrag. Fragen: hofladenliste@gmail.com</p></div>
    <figure class="aushang-qr"><div data-qr></div><figcaption><b>Jetzt eintragen</b><span>hofladenliste.de/mitmachen/</span></figcaption></figure></div>
  <p class="aushang-fuss">Empfohlen von einer Kundin oder einem Kunden.</p>
</article>`,
}), false);

const textSeite = (pfad, titel, beschreibung, html, noindex = true) => schreibe(pfad, seite({ titel: `${titel} | Hofladenliste`, beschreibung, pfad, noindex, klasse: 'textseite', krumen: [[titel.replace(/ – .*/, ''), pfad]], inhalt: `<article class="text">${html}</article>` }), !noindex);
// Hofläden entlang der Route (Start/Ziel als Luftlinie oder eigene GPX-Datei, Korridor 2–5 km; Berechnung im Browser)
schreibe('/route/', seite({
  titel: 'Hofläden entlang der Route – für Radtour und Ausflug',
  beschreibung: 'Hofläden, Milchtankstellen, Hofautomaten und Wochenmärkte entlang deiner Strecke finden: Start und Ziel eingeben oder GPX-Datei hochladen, Korridor von 2 bis 5 km.',
  pfad: '/route/', krumen: [['Hofläden entlang der Route', '/route/']],
  inhalt: `
<section class="seitenkopf">
  <h1>Hofläden entlang der Route</h1>
  <p>Für Radtour, Wanderung oder Wochenendausflug: Gib Start und Ziel ein oder lade die GPX-Datei deiner Tour hoch. Wir zeigen alle Hofläden, Automaten und Wochenmärkte, die höchstens ein paar Kilometer neben der Strecke liegen – in der Reihenfolge, in der du an ihnen vorbeikommst.</p>
</section>
<section class="abschnitt route" data-route>
  <form class="betrieb-form route-form" data-route-form>
    <label>Start <input name="start" ${SUCHFELD} placeholder="Ort oder PLZ, z. B. Cottbus"></label>
    <label>Ziel <input name="ziel" ${SUCHFELD} placeholder="z. B. Forst (Lausitz)"></label>
    <label>Korridor <select name="breite"><option value="2">2 km neben der Strecke</option><option value="3" selected>3 km</option><option value="5">5 km</option></select></label>
    <label>Oder GPX-Datei <input name="gpx" type="file" accept=".gpx,application/gpx+xml"></label>
    <button type="submit" class="knopf">Höfe entlang der Strecke zeigen</button>
    <p class="leise breit">Ohne GPX-Datei rechnen wir mit der Luftlinie zwischen Start und Ziel. Die GPX-Datei bleibt in deinem Browser und wird nicht hochgeladen.</p>
  </form>
  <p data-route-status aria-live="polite"></p>
  <div class="route-haupt">${kartenPanel({ titel: 'Karte der Strecke' })}<ol class="kl-liste route-liste" data-route-liste></ol></div>
</section>`,
}));

// ---------- Ratgeber (eigene Artikel, scripts/ratgeber.mjs) ----------
{
  const ldArtikel = (a) => ({ '@context': 'https://schema.org', '@type': 'Article', headline: a.titel, description: a.beschreibung, inLanguage: 'de',
    datePublished: a.datum, dateModified: a.geaendert || a.datum, mainEntityOfPage: `${cfg.domain}/ratgeber/${a.slug}/`,
    author: { '@type': 'Organization', name: 'Hofladenliste', url: cfg.domain }, publisher: { '@type': 'Organization', name: 'Hofladenliste', url: cfg.domain, logo: { '@type': 'ImageObject', url: `${cfg.domain}/icon-512.png` } } });
  for (const a of RATGEBER) {
    const pfad = `/ratgeber/${a.slug}/`;
    const andere = RATGEBER.filter((x) => x !== a).slice(0, 4);
    schreibe(pfad, seite({
      titel: a.seitentitel || a.titel, beschreibung: a.beschreibung, pfad, klasse: 'textseite', jsonld: [ldArtikel(a)],
      krumen: [['Ratgeber', '/ratgeber/'], [a.kurz, pfad]],
      inhalt: `<article class="text ratgeber">
<h1>${esc(a.titel)}</h1>
<p class="leise">Ratgeber · Stand <time datetime="${a.geaendert || a.datum}">${esc(datumDe(a.geaendert || a.datum))}</time></p>
${a.html}
<section class="passend"><h2>Passend dazu</h2><ul>${a.links.map(([p, t]) => `<li><a href="${p}">${esc(t)}</a></li>`).join('')}</ul></section>
<section class="passend"><h2>Mehr aus dem Ratgeber</h2><ul>${andere.map((x) => `<li><a href="/ratgeber/${x.slug}/">${esc(x.titel)}</a></li>`).join('')}</ul></section>
</article>`,
    }));
  }
  schreibe('/ratgeber/', seite({
    titel: 'Ratgeber: Einkaufen direkt vom Hof | Hofladenliste',
    beschreibung: 'Ratgeber rund um Hofladen, Milchtankstelle und Eierautomat: Rohmilch abkochen, Eier-Kennzeichnung, Bio-Siegel, Solawi, Spargelzeit und mehr.',
    pfad: '/ratgeber/', klasse: 'textseite', krumen: [['Ratgeber', '/ratgeber/']],
    jsonld: [itemList('Ratgeber', RATGEBER.map((a) => [a.titel, `/ratgeber/${a.slug}/`]))],
    inhalt: `<section class="seitenkopf"><h1>Ratgeber: Einkaufen direkt vom Hof</h1><p>Praktisches Wissen für den Einkauf im Hofladen, an der Milchtankstelle und am Eierautomaten – von uns geschrieben, ohne Werbung.</p></section>
<section class="abschnitt"><ul class="ratgeber-liste">${RATGEBER.map((a) => `<li><a href="/ratgeber/${a.slug}/"><b>${esc(a.titel)}</b><span>${esc(a.beschreibung)}</span></a></li>`).join('')}</ul></section>`,
  }));
}

// Saison-Benachrichtigung per E-Mail (Double-Opt-in), ausgelöst von Neuigkeiten der Betriebe
schreibe('/saison-benachrichtigung/', seite({
  titel: 'Saison-Benachrichtigung: Spargel, Erdbeeren & Co. | Hofladenliste',
  beschreibung: 'Lass dich per E-Mail benachrichtigen, wenn Höfe in deiner Nähe melden, dass es Spargel, Erdbeeren, Kürbisse oder Weihnachtsbäume gibt. Kostenlos, jederzeit abbestellbar.',
  pfad: '/saison-benachrichtigung/', krumen: [['Saison-Benachrichtigung', '/saison-benachrichtigung/']], klasse: 'textseite',
  inhalt: `<section class="seitenkopf"><h1>Sag mir Bescheid, wenn’s losgeht</h1>
  <p>Wenn ein Hof in deiner Nähe meldet „Spargel ist da!“ oder „Erdbeeren ab heute“, bekommst du eine kurze E-Mail – höchstens alle drei Tage, gebündelt. Die Meldungen kommen direkt von den Betrieben.</p></section>
<section class="abschnitt saison-abo" data-saison-abo>
  <form class="betrieb-form" data-abo-form>
    <fieldset class="breit"><legend>Was interessiert dich?</legend><p class="tipp-auswahl">${SAISON_PRODUKTE.map((p) => `<label><input type="checkbox" name="produkte" value="${esc(p)}"> ${esc(p)}</label>`).join('')}</p></fieldset>
    <label>Postleitzahl <input name="plz" inputmode="numeric" pattern="\\d{5}" maxlength="5" required autocomplete="postal-code"></label>
    <label>Umkreis <select name="radius"><option value="10">10 km</option><option value="25" selected>25 km</option><option value="50">50 km</option></select></label>
    <label class="breit">E-Mail-Adresse <input name="email" type="email" required autocomplete="email"></label>
    <div class="breit" data-turnstile></div>
    <button type="submit" class="knopf">Benachrichtigung bestellen</button>
    <p class="leise breit" data-status aria-live="polite">Du bekommst zuerst eine E-Mail mit Bestätigungslink. Abmelden geht mit einem Klick in jeder Nachricht. Zum Schutz vor Spam lädt beim Absenden Cloudflare Turnstile.</p>
  </form>
</section>`,
}));

// Ersatzseite ohne Netz (Service Worker)
schreibe('/offline/', seite({ titel: 'Gerade offline | Hofladenliste', beschreibung: 'Keine Verbindung: Deine Merkliste und zuletzt besuchte Höfe sind trotzdem verfügbar.', pfad: '/offline/', noindex: true, klasse: 'textseite', krumen: [['Offline', '/offline/']],
  inhalt: '<article class="text"><h1>Gerade keine Verbindung</h1><p>Diese Seite ist noch nicht auf deinem Gerät gespeichert. Deine <a href="/merkliste/">Merkliste</a> und Höfe, die du schon einmal geöffnet hast, funktionieren auch ohne Netz.</p><p>Sobald du wieder online bist, lädt die Seite normal.</p></article>' }), false);
// Ergebnisseite der Hofsuche (/suche leitet bei mehreren Treffern hierher); Inhalt kommt per JavaScript aus /api/hoefe
schreibe('/hofsuche/', seite({ titel: 'Hof suchen | Hofladenliste', beschreibung: 'Hofläden, Hofautomaten und Milchtankstellen nach Namen suchen: Ergebnisse mit Ort, Öffnungszeiten und Entfernung.', pfad: '/hofsuche/', noindex: true, klasse: 'textseite', krumen: [['Hof suchen', '/hofsuche/']],
  inhalt: `<section class="seitenkopf"><h1>Hof suchen</h1>
  <form class="kopf-suche gross-suche" action="/suche" method="get"><label class="sr" for="hs-q">Postleitzahl, Ort oder Name des Hofs</label><input id="hs-q" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required><button type="submit">Suchen</button></form>
  <p class="plz-hinweis" data-hofsuche-status>Suche läuft …</p></section>
<div class="liste" data-hofsuche><noscript><p>Die Ergebnisliste braucht JavaScript. Gib alternativ eine Postleitzahl ein.</p></noscript></div>` }), false);
textSeite('/impressum/', 'Impressum', 'Impressum von hofladenliste.de: Anbieter, Kontakt und Verantwortlicher für das Verzeichnis der Hofläden und Hofautomaten.', `<h1>Impressum</h1>
${impFehlt ? '<p class="fehler">Das Impressum wird gerade vervollständigt.</p>' : ''}
<p>Angaben gemäß § 5 DDG</p>
<p>${esc(imp.name)}<br>${esc(imp.strasse)}<br>${esc(imp.plzOrt)}</p>
<p>E-Mail: ${imp.email ? `<a href="mailto:${esc(imp.email)}">${esc(imp.email)}</a>` : ''}${imp.telefon ? `<br>Telefon: ${esc(imp.telefon)}` : ''}</p>
<p>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: ${esc(imp.name)}, Anschrift wie oben.</p>
<h2>Datenquellen und Lizenzen</h2>
<p>Einträge: © OpenStreetMap-Mitwirkende, Open Database License (ODbL), <a href="https://www.openstreetmap.org/copyright">openstreetmap.org/copyright</a>. Ergänzende Einträge und Kontaktdaten: Overture Maps Foundation, <a href="https://overturemaps.org/">overturemaps.org</a> (CDLA-Permissive-2.0; Datensätze von Foursquare unter Apache-2.0); Foursquare Open Source Places (Apache-2.0); Karte von morgen (CC0-1.0); offene Verwaltungsdaten${offenDatensaetze.size ? `: ${verwaltungsDatensaetze()}` : ''} (Herausgeber, Urheber und Lizenz auf der jeweiligen Hofseite). Postleitzahlen: GeoNames, CC BY 4.0. Umriss Deutschlands: Natural Earth (gemeinfrei). Karte: Leaflet (BSD-2-Clause). Schriften: Zilla Slab und Atkinson Hyperlegible Next (SIL Open Font License).</p>`);
textSeite('/datenschutz/', 'Datenschutzerklärung', GA_ID ? 'Datenschutzerklärung von hofladenliste.de: welche Daten beim Besuch, bei Karte und Suche anfallen, und Google Analytics nur mit Einwilligung.' : 'Datenschutzerklärung von hofladenliste.de: keine Cookies, kein Tracking – welche Daten beim Besuch, bei Karte und Suche anfallen.', `<h1>Datenschutzerklärung</h1>
<h2>Verantwortlicher</h2>
<p>${esc(imp.name) || '[Name]'}, ${esc(imp.strasse) || '[Straße]'}, ${esc(imp.plzOrt) || '[PLZ Ort]'}, ${esc(imp.email) || '[E-Mail]'}</p>
<h2>Rückmeldung „Stimmt das noch?“</h2>
<p>Klickst du auf einer Hofseite auf „Ja, stimmt noch“ oder „Geschlossen melden“, speichern wir nur den Eintrag, die Art der Rückmeldung und das Datum. Damit dieselbe Rückmeldung nicht mehrfach zählt, bilden wir aus deiner IP-Adresse, dem Tag und dem Eintrag einen nicht umkehrbaren Prüfwert, der nach einem Tag gelöscht wird. Die IP-Adresse selbst speichern wir nicht.</p>
<h2>Hosting</h2>
<p>Diese Website wird über Cloudflare (Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA) ausgeliefert. Beim Aufruf verarbeitet Cloudflare technisch notwendige Verbindungsdaten (z. B. IP-Adresse, Zeitpunkt, angeforderte Seite), um die Website auszuliefern und vor Angriffen zu schützen (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare ist unter dem EU-US Data Privacy Framework zertifiziert.</p>
<h2>Schriften und Skripte</h2>
<p>Schriften und Programmbibliotheken liegen auf unserem eigenen Server. Es werden keine Inhalte von Google Fonts oder anderen Schriftanbietern geladen.</p>
<h2>Karten</h2>
${KACHELN ? '<p>Die Karten liefern wir von unserem eigenen Server aus (Kartendaten © OpenStreetMap-Mitwirkende, aufbereitet mit Protomaps). Dabei werden keine Daten an Dritte übertragen; es gelten die Angaben zu Cloudflare oben.</p>' : `<p>Karten werden erst geladen, wenn du auf „Karte laden“ klickst. Dann ruft dein Browser Kartenbilder von den Servern der OpenStreetMap Foundation (St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS, Großbritannien) ab; dabei wird deine IP-Adresse übertragen (Art. 6 Abs. 1 lit. a DSGVO). Wenn du „Für diese Website merken“ auswählst, speichert dein Browser diese Entscheidung lokal (localStorage). Du kannst sie jederzeit über die Browsereinstellungen löschen. Datenschutzhinweise der OpenStreetMap Foundation: <a href="https://osmfoundation.org/wiki/Privacy_Policy">osmfoundation.org/wiki/Privacy_Policy</a>.</p>`}
<h2>Postleitzahl- und Standortsuche</h2>
<p>Wenn du eine Postleitzahl eingibst, wird sie an unseren Server übermittelt, um passende Hofläden anzuzeigen. Wenn du „Meinen Standort verwenden“ wählst, fragt dein Browser zuerst um Erlaubnis; die Koordinaten werden nur für diese Suche übertragen und nicht gespeichert. Die zuletzt gesuchte Postleitzahl speichert dein Browser lokal (localStorage).</p>
<h2>Betreiber-Bereich</h2>
<p>Betriebe melden sich unter /betrieb/ mit einem Link per E-Mail an, ein Passwort gibt es nicht. Wir speichern dafür die E-Mail-Adresse, die zugeordneten Höfe und den Zeitpunkt der letzten Anmeldung. Nach der Anmeldung setzt dein Browser ein technisch notwendiges Sitzungs-Cookie („hl_sitzung“, 30 Tage), das nur der Anmeldung dient (§ 25 Abs. 2 TTDSG). E-Mails (Anmeldelinks, Bestätigungen) versenden wir über Resend (Resend, Inc., USA, EU-US Data Privacy Framework); übermittelt werden Empfängeradresse und Inhalt der Nachricht (Art. 6 Abs. 1 lit. b DSGVO).</p>
<h2>Saison-Benachrichtigung</h2>
<p>Für die Saison-Benachrichtigung speichern wir deine E-Mail-Adresse, Postleitzahl, Umkreis und die gewählten Produkte, bis du dich abmeldest (Art. 6 Abs. 1 lit. a DSGVO, Einwilligung per Bestätigungslink). Beim Abmelden löschen wir die E-Mail-Adresse. Versand über Resend.</p>
<h2>Tipps von Besuchern</h2>
<p>Tipps und „Daumen hoch“ zu einem Hof bestätigst du über einen Link per E-Mail (Versand über Resend). Wir speichern Merkmale, Text, den optionalen Vornamen und eine Prüfsumme der E-Mail-Adresse gegen Mehrfachabgaben, nicht die Adresse selbst. Veröffentlicht werden Merkmale, Text, Vorname und Datum, erst nach unserer Prüfung. Auch hier lädt Cloudflare Turnstile erst, wenn du „Tipp geben“ wählst.</p>
<h2>Nachricht an den Hof (Cloudflare Turnstile)</h2>
<p>Bei Höfen, die ihren Eintrag selbst pflegen, kannst du über ein Formular eine Nachricht schicken. Erst wenn du „Nachricht schreiben“ wählst, lädt dein Browser Cloudflare Turnstile (Cloudflare, Inc.) zum Schutz vor Spam; dabei werden technische Daten wie IP-Adresse und Browsermerkmale an Cloudflare übertragen (Art. 6 Abs. 1 lit. f DSGVO). Name, E-Mail-Adresse und Text leiten wir per E-Mail (Resend) an den Betrieb weiter und speichern sie nicht.</p>
<h2>Merkliste</h2>
<p>Höfe, die du mit „Merken“ markierst, speichert nur dein Browser (localStorage) – wir haben darauf keinen Zugriff. Wenn du die Merkliste öffnest, lädt dein Browser die aktuellen Angaben zu diesen Höfen von unserem Server; dabei wird nichts gespeichert. Du kannst die Merkliste jederzeit dort leeren oder über die Browsereinstellungen löschen.</p>
<h2>Suchstatistik</h2>
<p>Damit wir sehen, in welchen Regionen Hofläden gesucht werden, zählen wir auf unserem Server, wie oft am Tag nach einer Postleitzahl gesucht wurde – zusammen mit dem zugehörigen Landkreis, dem gewählten Angebotsfilter und der Art der Suche (Postleitzahl, Ortsname oder Standort). Bei der Suche nach einem Ortsnamen zählen wir die Postleitzahl des gefundenen Orts; den eingegebenen Text speichern wir nicht. Bei der Standortsuche wird nur die nächstgelegene Postleitzahl gezählt, nicht die Koordinaten. IP-Adressen, Uhrzeiten, Geräte- oder Browserdaten speichern wir dabei nicht, und auf deinem Gerät wird nichts gespeichert oder ausgelesen. Ein Rückschluss auf einzelne Personen ist nicht möglich. Die Zähler liegen in einer Datenbank von Cloudflare (Cloudflare, Inc., Region Westeuropa); Rechtsgrundlage ist unser berechtigtes Interesse an der Verbesserung des Angebots (Art. 6 Abs. 1 lit. f DSGVO).</p>
<h2>Nutzungsstatistik</h2>
<p>Um zu sehen, welche Funktionen genutzt werden, zählen wir auf unserem Server Klicks auf „Route“, „Anrufen“, „Website“, auf Filter und auf „In meiner Nähe“ – als reine Tageszähler je Seitentyp (z. B. „heute 12-mal Route auf Hofseiten“). Auf Hofseiten zählen wir zusätzlich Aufrufe und diese Klicks je Hof als Tagessumme, damit der Betrieb sieht, wie oft sein Eintrag genutzt wird. Dabei speichern wir weder IP-Adressen noch Uhrzeiten, Geräte- oder Browserdaten; auf deinem Gerät wird nichts gespeichert oder ausgelesen. Ein Rückschluss auf einzelne Personen ist nicht möglich. Rechtsgrundlage ist unser berechtigtes Interesse an der Verbesserung des Angebots (Art. 6 Abs. 1 lit. f DSGVO).</p>
<h2 id="formular">Formular „Mitmachen“</h2>
<p>Wenn du über das Formular einen Hof einträgst, Angaben korrigierst oder einen Eintrag übernimmst, speichern wir deine Angaben in einer Datenbank von Cloudflare (Cloudflare, Inc., Region Westeuropa): die Angaben zum Betrieb, gegebenenfalls Fotos sowie – freiwillig, bei der Übernahme eines Eintrags erforderlich – deinen Namen und deine E-Mail-Adresse. Die Angaben zum Betrieb und freigegebene Fotos veröffentlichen wir nach Prüfung. Name und E-Mail-Adresse verwenden wir nur für Rückfragen und zur Bestätigung von Betreibern; sie werden nicht veröffentlicht und spätestens sechs Monate nach Bearbeitung gelöscht. Abgelehnte Fotos löschen wir sofort. Gegen Missbrauch zählen wir Meldungen je Absender und Tag über einen anonymisierten Tages-Hash der IP-Adresse; die IP-Adresse selbst speichern wir nicht. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) bzw. bei Betreibern die Durchführung der Eintragung (Art. 6 Abs. 1 lit. b DSGVO). Du kannst deine Angaben jederzeit über die Kontaktadresse löschen lassen.</p>
${GA_ID ? `<h2 id="google-analytics">Google Analytics (nur mit deiner Einwilligung)</h2>
<p>Wenn du im Hinweis „Darf Google Analytics mitzählen?“ auf „Erlauben“ klickst, nutzen wir Google Analytics 4, einen Webanalysedienst der Google Ireland Limited (Gordon House, Barrow Street, Dublin 4, Irland). Vorher wird nichts von Google geladen und kein Cookie gesetzt. Nach deiner Einwilligung lädt dein Browser ein Skript von googletagmanager.com und setzt die Cookies „_ga“ und „_ga_*“ (Speicherdauer bis zu zwei Jahre), mit denen wiederkehrende Besuche erkannt werden. Erfasst werden aufgerufene Seiten, Klicks auf Funktionen wie „Route“ oder „Anrufen“ und auf Links zu anderen Websites, Scrolltiefe, Suchbegriffe der Suche auf dieser Website, Herkunftsseite, ungefährer Ort (aus der gekürzten IP-Adresse), Geräte- und Browsertyp sowie Zeitpunkt. Google Analytics 4 speichert keine vollständigen IP-Adressen. Google-Signale und Werbefunktionen sind ausgeschaltet. Die Daten können an Google LLC in den USA übermittelt werden; Google ist unter dem EU-US Data Privacy Framework zertifiziert. Wir nutzen die Auswertung nur, um zu sehen, welche Seiten und Funktionen gebraucht werden; die Daten werden nach 14 Monaten gelöscht.</p>
<p>Rechtsgrundlage ist deine Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO). Du kannst sie jederzeit über „Cookie-Einstellungen“ unten auf jeder Seite widerrufen; dann löschen wir die Analytics-Cookies in deinem Browser und laden das Skript nicht mehr. Deine Wahl speichert dein Browser lokal (localStorage, Eintrag „statistik“). Mehr in der <a href="https://policies.google.com/privacy?hl=de" rel="nofollow noopener" target="_blank">Datenschutzerklärung von Google</a>.</p>
<h2>Sonstige Cookies</h2>
<p>Außer den Analytics-Cookies nach Einwilligung und dem Anmelde-Cookie im Betreiber-Bereich setzt diese Website keine Cookies. Links zu Routenplanern und zu Websites der Höfe öffnen externe Seiten; dort gelten deren Datenschutzbestimmungen.</p>` : `<h2>Cookies und Tracking</h2>
<p>Für Besucher setzt diese Website keine Cookies und nutzt kein Tracking über Websites hinweg (zum Anmelde-Cookie im Betreiber-Bereich siehe oben). Links zu Routenplanern und zu Websites der Höfe öffnen externe Seiten; dort gelten deren Datenschutzbestimmungen.</p>`}
<h2>Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde.</p>`);
// ---------- Badge für Höfe (Backlink) ----------
{
  const innen = LOGO.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const badge = (hell) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="56" viewBox="0 0 200 56" role="img" aria-label="Wir sind auf hofladenliste.de"><rect width="200" height="56" rx="10" fill="${hell ? '#FFFFFF' : '#173B2C'}" stroke="${hell ? '#D9E0DA' : '#173B2C'}"/><g transform="translate(10 10) scale(.5625)">${innen}</g><text x="56" y="24" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="${hell ? '#56635B' : '#CFE0D5'}">Wir sind auf</text><text x="56" y="41" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="${hell ? '#173B2C' : '#F4C430'}">hofladenliste.de</text></svg>`;
  writeFileSync(join(OUT, 'badge.svg'), badge(true));
  writeFileSync(join(OUT, 'badge-dunkel.svg'), badge(false));
  const code = (bild) => esc(`<a href="${cfg.domain}/" title="Hofladen auf hofladenliste.de"><img src="${cfg.domain}/${bild}" width="200" height="56" alt="Wir sind auf hofladenliste.de"></a>`);
  schreibe('/fuer-hoefe/', seite({
    titel: 'Für Höfe: Eintrag übernehmen und Badge für die Website',
    beschreibung: 'Für Hofläden und Automaten-Betreiber: Eintrag auf hofladenliste.de kostenlos übernehmen, Öffnungszeiten und Angebot selbst pflegen und das Badge „Wir sind auf hofladenliste.de“ einbinden.',
    pfad: '/fuer-hoefe/',
    klasse: 'textseite',
    krumen: [['Für Höfe', '/fuer-hoefe/']],
    inhalt: `<article class="text" data-badge-seite>
<h1>Für Höfe und Direktvermarkter</h1>
<p>hofladenliste.de ist kostenlos – für Besucher und für Betriebe. Wenn dein Hof schon eingetragen ist, kannst du den Eintrag übernehmen und selbst aktuell halten: Öffnungszeiten, Angebot, Zahlungsarten, Fotos und saisonale Hinweise wie „Spargel ab Mitte April“.</p>
<p><a class="knopf knopf-dunkel" href="/mitmachen/" data-badge-uebernehmen>Eintrag übernehmen oder neu eintragen</a></p>
<h2>Badge für deine Website</h2>
<p>Zeig deinen Kundinnen und Kunden, dass sie dich auf hofladenliste.de mit Öffnungszeiten und Route finden. Kopiere einfach den Code in deine Website.</p>
<p class="badge-vorschau"><img src="/badge.svg" width="200" height="56" alt="Wir sind auf hofladenliste.de"> <img src="/badge-dunkel.svg" width="200" height="56" alt="Wir sind auf hofladenliste.de (dunkel)"></p>
<label for="badge-code-hell">Code (hell)</label>
<textarea id="badge-code-hell" rows="3" readonly data-badge-code="badge.svg">${code('badge.svg')}</textarea>
<label for="badge-code-dunkel">Code (dunkel)</label>
<textarea id="badge-code-dunkel" rows="3" readonly data-badge-code="badge-dunkel.svg">${code('badge-dunkel.svg')}</textarea>
<p class="leise">Öffnest du diese Seite über „Badge für deine Website“ auf der Seite deines Hofs, verlinkt der Code direkt auf deinen Eintrag.</p>
<h2>Woher kommen die Daten?</h2>
<p>Die meisten Einträge stammen aus <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, ergänzt um Angaben von den Websites der Höfe und von Betrieben selbst. Angaben von Betrieben haben bei uns Vorrang. Mehr dazu unter <a href="/quellen/">Quellen</a>.</p>
</article>`,
  }));
}

// ---------- Verwaltung der Meldungen (nicht öffentlich verlinkt, noindex) ----------
schreibe('/verwaltung/', seite({
  titel: 'Verwaltung | Hofladenliste', beschreibung: 'Verwaltung der Meldungen zu Hofläden – nur für die Redaktion von hofladenliste.de.',
  pfad: '/verwaltung/', noindex: true, klasse: 'textseite', krumen: [['Verwaltung', '/verwaltung/']],
  inhalt: '<section class="abschnitt"><h1>Meldungen</h1><div id="verwaltung"></div></section><script type="module" src="/verwaltung.js"></script>',
}), false);

// ---------- Vertrauen: Über uns, Kontakt, Presse, Datenstand & Statistik ----------
{
  const nHof = eintraege.filter((e) => e.typ === 'hofladen').length, nAut = eintraege.length - nHof;
  const proz = (f) => Math.round(100 * eintraege.filter(f).length / eintraege.length);
  const verlauf = existsSync(join(ROOT, 'data', 'verlauf.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'verlauf.json'), 'utf8')) : [];
  const nachArt = Object.entries(eintraege.reduce((a, e) => ((a[e.art] = (a[e.art] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  const quellenZahl = { osm: 0, overture: 0, foursquare: 0, kvm: 0, kommunal: 0, betreiber: 0, manuell: 0 };
  for (const e of eintraege) quellenZahl[e.quelle] = (quellenZahl[e.quelle] || 0) + 1;
  const QUELL_NAME = { osm: 'OpenStreetMap', overture: 'Overture Maps', foursquare: 'Foursquare Open Source Places', kvm: 'Karte von morgen', kommunal: 'Offene Verwaltungsdaten', betreiber: 'Angaben von Betrieben', manuell: 'Eigene Recherche' };
  const proLandStat = laender.map((l) => {
    const es = l.kreise.flatMap((k) => proKreis.get(k.code) || []);
    return { l, hof: es.filter((e) => e.typ === 'hofladen').length, aut: es.filter((e) => e.typ === 'automat').length, maerkte: l.kreise.reduce((s, k) => s + (maerkteProKreis.get(k.code)?.length || 0), 0), zeiten: es.filter((e) => e.oeffnungszeiten).length, n: es.length };
  }).sort((a, b) => b.n - a.n);
  const datumLang = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const zahlenSatz = `${zahl(nHof)} Hofläden und Direktvermarkter, ${zahl(nAut)} Hofautomaten und ${zahl(MAERKTE.length)} Wochenmärkte in allen 16 Bundesländern`;

  textSeite('/ueber-uns/', 'Über uns', 'Wer hinter Hofladenliste steht und warum: ein unabhängiges, kostenloses Verzeichnis für Hofläden, Milchtankstellen und Hofautomaten auf Basis offener Daten.', `<h1>Über Hofladenliste</h1>
<p>Hofladenliste ist ein unabhängiges Verzeichnis für Lebensmittel direkt vom Hof: ${zahlenSatz}. Die Idee ist einfach: Wer frische Eier, Milch, Kartoffeln oder Honig aus der Nähe kaufen möchte, soll schnell sehen, wo es das gibt, wann geöffnet ist und wie man hinkommt.</p>
<h2>Wer dahinter steht</h2>
<p>Hofladenliste wird von ${esc(imp.name)} aus ${esc(imp.plzOrt.replace(/^\d{5}\s*/, ''))} betrieben. Die Seite ist kein Angebot eines Verbands, einer Handelskette oder eines Hofs, und sie verkauft nichts.</p>
<h2>Was uns wichtig ist</h2>
<ul>
<li><b>Offene Daten:</b> Die meisten Einträge stammen aus OpenStreetMap und weiteren offenen Quellen mit freier Lizenz. Woher eine Angabe kommt, steht auf jeder Hofseite und unter <a href="/quellen/">Quellen</a>. Inhalte anderer Verzeichnisse übernehmen wir nicht.</li>
<li><b>Kostenlos für Höfe:</b> Jeder Betrieb kann sich <a href="/mitmachen/">eintragen</a> und seinen Eintrag im <a href="/betrieb/">Betreiber-Bereich</a> selbst pflegen – mit Öffnungszeiten, Neuigkeiten und Terminen.</li>
${GA_ID ? '<li><b>Datensparsam:</b> keine Werbung, Google Analytics nur, wenn du es erlaubst. Die Karte kommt von unserem eigenen Server. Details in der <a href="/datenschutz/">Datenschutzerklärung</a>.</li>' : '<li><b>Ohne Tracking:</b> keine Cookies für Besucher, keine Werbung, keine Analysedienste von Dritten. Die Karte kommt von unserem eigenen Server. Details in der <a href="/datenschutz/">Datenschutzerklärung</a>.</li>'}
<li><b>Gemeinsam besser:</b> Öffnungszeiten ändern sich. Mit „Stimmt das noch?“ auf jeder Hofseite hilfst du, die Angaben aktuell zu halten.</li>
</ul>
<p>Fragen, Hinweise oder Kritik: <a href="/kontakt/">Kontakt</a>.</p>`, false);

  textSeite('/kontakt/', 'Kontakt', 'Kontakt zu Hofladenliste: E-Mail hofladenliste@gmail.com – für Korrekturen, Einträge, Betriebe und Presseanfragen.', `<h1>Kontakt</h1>
<p>Am schnellsten erreichst du uns per E-Mail: <a href="mailto:hofladenliste@gmail.com">hofladenliste@gmail.com</a>.</p>
<h2>Worum geht es?</h2>
<ul>
<li><b>Eine Angabe stimmt nicht</b> (Öffnungszeiten, Adresse, Hof geschlossen): Nutze auf der Seite des Hofs „Stimmt das noch?“ oder „Fehler melden“ – dann landet die Meldung direkt beim richtigen Eintrag.</li>
<li><b>Ein Hof fehlt:</b> <a href="/mitmachen/">Hofladen eintragen</a>, kostenlos.</li>
<li><b>Du betreibst einen Hof:</b> Im <a href="/betrieb/">Betreiber-Bereich</a> pflegst du deinen Eintrag selbst. Ein Aushang mit QR-Code für deinen Laden ist dort auch zu finden.</li>
<li><b>Presse:</b> Zahlen, Logo und Ansprechpartner auf der <a href="/presse/">Presseseite</a>.</li>
</ul>
<p>Anbieter dieser Website: siehe <a href="/impressum/">Impressum</a>.</p>`, false);

  textSeite('/presse/', 'Presse', `Presseinformationen zu Hofladenliste: ${zahlenSatz}. Zahlen, Logo und Ansprechpartner.`, `<h1>Presse</h1>
<p>Hofladenliste ist ein kostenloses, unabhängiges Verzeichnis für Lebensmittel direkt vom Hof. Stand ${esc(datumLang(HEUTE))}: ${zahlenSatz}.</p>
<h2>Zahlen</h2>
<ul class="presse-zahlen">
<li><b>${zahl(nHof)}</b> Hofläden und Direktvermarkter, davon ${zahl(eintraege.filter((e) => e.art === 'Imkerei').length)} Imkereien und ${zahl(eintraege.filter((e) => e.art === 'Hofcafé').length)} Hofcafés</li>
<li><b>${zahl(nAut)}</b> Hofautomaten, darunter ${zahl(eintraege.filter((e) => e.art === 'Milchtankstelle').length)} Milchtankstellen und ${zahl(eintraege.filter((e) => e.art === 'Eierautomat').length)} Eierautomaten</li>
<li><b>${zahl(MAERKTE.length)}</b> Wochenmärkte</li>
<li>Meiste Einträge: ${proLandStat.slice(0, 3).map((x) => `${esc(x.l.name)} (${zahl(x.n)})`).join(', ')}</li>
</ul>
<p>Alle Zahlen nach Bundesland und ihre Entwicklung stehen unter <a href="/statistik/">Datenstand &amp; Statistik</a>. Gern dürfen Sie sie mit Quellenangabe „hofladenliste.de“ verwenden.</p>
<h2>Logo</h2>
<p><img src="/favicon.svg" alt="Logo von Hofladenliste: gelbe Kartennadel mit grüner Ähre" width="96" height="96"></p>
<p><a href="/favicon.svg" download>Logo als SVG</a> · <a href="/icon-512.png" download>Logo als PNG (512 × 512)</a> · <a href="/og-bild.png" download>Vorschaubild (1200 × 630)</a></p>
<h2>Ansprechpartner</h2>
<p>${esc(imp.name)}, ${esc(imp.plzOrt)}<br>E-Mail: <a href="mailto:hofladenliste@gmail.com">hofladenliste@gmail.com</a></p>
<h2>Kurzbeschreibung zum Übernehmen</h2>
<blockquote><p>Hofladenliste.de zeigt Hofläden, Milchtankstellen, Eier- und Regiomaten, Imkereien und Wochenmärkte in ganz Deutschland – mit Öffnungszeiten, Angebot, Karte und der Anzeige „jetzt geöffnet“. Die Daten stammen überwiegend aus OpenStreetMap und weiteren offenen Quellen; Betriebe können ihren Eintrag kostenlos selbst pflegen.</p></blockquote>`, false);

  textSeite('/statistik/', 'Datenstand & Statistik', `Datenstand von Hofladenliste: ${zahlenSatz} – nach Bundesland, Art und Quelle, mit Vollständigkeit der Angaben und Verlauf.`, `<h1>Datenstand &amp; Statistik</h1>
<p>Stand ${esc(datumLang(HEUTE))}: ${zahlenSatz}. Die Zahlen werden bei jeder Aktualisierung neu berechnet.</p>
<h2>Nach Bundesland</h2>
<div class="tabelle-scroll"><table class="stat-tabelle"><thead><tr><th scope="col">Bundesland</th><th scope="col">Hofläden</th><th scope="col">Automaten</th><th scope="col">Wochenmärkte</th><th scope="col">mit Öffnungszeiten</th></tr></thead><tbody>
${proLandStat.map((x) => `<tr><th scope="row"><a href="/${x.l.slug}/">${esc(x.l.name)}</a></th><td>${zahl(x.hof)}</td><td>${zahl(x.aut)}</td><td>${zahl(x.maerkte)}</td><td>${x.n ? Math.round(100 * x.zeiten / x.n) : 0} %</td></tr>`).join('')}
</tbody></table></div>
<h2>Nach Art</h2>
<div class="tabelle-scroll"><table class="stat-tabelle"><tbody>${nachArt.map(([a, n]) => `<tr><th scope="row">${esc(PLURAL_ART[a] || a)}</th><td>${zahl(n)}</td></tr>`).join('')}</tbody></table></div>
<h2>Woher die Einträge kommen</h2>
<div class="tabelle-scroll"><table class="stat-tabelle"><tbody>${Object.entries(quellenZahl).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([q, n]) => `<tr><th scope="row">${esc(QUELL_NAME[q] || q)}</th><td>${zahl(n)}</td></tr>`).join('')}</tbody></table></div>
<p>Lizenzen und Details: <a href="/quellen/">Quellen</a>.</p>
<h2>Wie vollständig die Angaben sind</h2>
<ul><li>Öffnungszeiten: ${proz((e) => e.oeffnungszeiten)} %</li><li>Telefon: ${proz((e) => e.telefon)} %</li><li>Website: ${proz((e) => e.website)} %</li><li>Angebot (was es gibt): ${proz((e) => e.kat?.length)} %</li><li>Adresse mit Straße: ${proz((e) => e.strasse)} %</li><li>Haltestelle im Umkreis von 1 km: ${proz((e) => e.haltestelle)} %</li></ul>
<p>Fehlt etwas bei einem Hof in deiner Nähe? Auf jeder Hofseite kannst du Angaben ergänzen.</p>
${verlauf.length > 1 ? `<h2>Verlauf</h2><div class="tabelle-scroll"><table class="stat-tabelle"><thead><tr><th scope="col">Datum</th><th scope="col">Einträge</th><th scope="col">Hofläden</th><th scope="col">Automaten</th><th scope="col">Wochenmärkte</th></tr></thead><tbody>${[...verlauf].reverse().slice(0, 60).map((v) => `<tr><th scope="row">${esc(datumLang(v.datum))}</th><td>${zahl(v.eintraege)}</td><td>${zahl(v.hoefe)}</td><td>${zahl(v.automaten)}</td><td>${zahl(v.maerkte)}</td></tr>`).join('')}</tbody></table></div>` : ''}`, false);
}

textSeite('/quellen/', 'Quellen und Datenstand', 'Woher die Daten auf hofladenliste.de stammen: OpenStreetMap (ODbL), weitere offene Quellen wie Overture Maps, Foursquare und Karte von morgen, Websites der Höfe, Angaben von Betrieben und PLZ-Daten von GeoNames.', `<h1>Quellen und Datenstand</h1>
<h2>OpenStreetMap</h2>
<p>Die meisten Einträge stammen aus <a href="https://www.openstreetmap.org/">OpenStreetMap</a>: Hofläden (<code>shop=farm</code>) und Hofautomaten (<code>amenity=vending_machine</code> mit Milch, Eiern, Fleisch, Kartoffeln usw.). Wir gleichen die Daten jeden Montag und Donnerstag ab. Daten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>, verfügbar unter der <a href="https://opendatacommons.org/licenses/odbl/">Open Database License (ODbL)</a>.</p>
<h2>Weitere offene Quellen</h2>
<p>Hofläden und Automaten, die in OpenStreetMap noch fehlen, ergänzen wir aus weiteren offenen Datenquellen (aktuell ${offenNeuSumme.toLocaleString('de-DE')} Einträge). Daraus füllen wir außerdem fehlende Telefonnummern, Websites, Adressen und Öffnungszeiten bestehender Einträge auf. Wir übernehmen nur Orte mit eindeutigem Namen (zum Beispiel Hofladen, Hofverkauf oder Milchtankstelle) oder solche, die die Quelle selbst als Hofladen oder Direktvermarkter einordnet, und gleichen alles mit OpenStreetMap und untereinander ab, damit kein Hof doppelt erscheint. Ist eine Quelle unsicher, prüfen wir den Direktverkauf auf der eigenen Website des Hofs. Diese Einträge sind auf ihrer Seite als „noch nicht vom Betrieb bestätigt“ gekennzeichnet und nennen ihre Quelle. Wir gleichen die Daten einmal im Monat ab.</p>
<ul>
<li><a href="https://overturemaps.org/">Overture Maps Foundation</a>, Places (${(offenNeu.overture || 0).toLocaleString('de-DE')} Einträge): <a href="https://cdla.dev/permissive-2-0/">CDLA-Permissive-2.0</a>, Datensätze von Foursquare unter Apache-2.0. Das Overture-Places-Thema enthält keine OpenStreetMap-Daten.</li>
<li><a href="https://opensource.foursquare.com/os-places/">Foursquare Open Source Places</a> (${(offenNeu.foursquare || 0).toLocaleString('de-DE')} Einträge): <a href="https://www.apache.org/licenses/LICENSE-2.0">Apache-2.0</a>.</li>
<li><a href="https://kartevonmorgen.org/">Karte von morgen</a> (${(offenNeu.kvm || 0).toLocaleString('de-DE')} Einträge): gemeinfrei (CC0-1.0).</li>
<li>Offene Verwaltungsdaten über <a href="https://www.govdata.de/">GovData</a> und Open Data Bayern (${(offenNeu.kommunal || 0).toLocaleString('de-DE')} Einträge): ${offenDatensaetze.size ? `${verwaltungsDatensaetze()}. ` : ''}Wir übernehmen nur Daten unter CC0, CC BY 4.0 oder der Datenlizenz Deutschland (Zero bzw. Namensnennung 2.0), keine Share-Alike-Lizenzen. Herausgeber, Urheber und Lizenz nennen wir auf der jeweiligen Hofseite.</li>
</ul>
<h2>Websites der Höfe</h2>
<p>Fehlen in OpenStreetMap Öffnungszeiten oder Kontaktdaten, ergänzen wir sie aus der eigenen Website des Hofs. Auf der Seite des Eintrags steht dann, welche Angaben woher stammen und mit welchem Stand.</p>
<h2>Angaben von Betrieben</h2>
<p>Betriebe können ihren Eintrag über <a href="/mitmachen/">Mitmachen</a> übernehmen und pflegen. Diese Angaben prüfen wir und zeigen sie mit Stand an; sie haben Vorrang vor anderen Quellen.</p>
<h2>Postleitzahlen und Orte</h2>
<p>Postleitzahlen, Orte und Kreise: <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0). ${KACHELN ? `Kartenkacheln: © OpenStreetMap-Mitwirkende (ODbL), erzeugt mit <a href="https://protomaps.com/">Protomaps</a> (Stand ${KACHELN.version.slice(6)}.${KACHELN.version.slice(4, 6)}.${KACHELN.version.slice(0, 4)}), auf unserem eigenen Server.` : 'Kartenbilder: OpenStreetMap, erst nach deiner Zustimmung geladen.'}</p>
<h2>Keine Daten anderer Verzeichnisse</h2>
<p>Wir übernehmen keine Daten, Texte oder Bilder aus anderen Hofladen-Verzeichnissen.</p>
`, false);

// ---------- Mitmachen: Formular für neue Einträge, Korrekturen und Übernahmen ----------
{
  const TAGE_FORM = [['mo', 'Montag'], ['di', 'Dienstag'], ['mi', 'Mittwoch'], ['do', 'Donnerstag'], ['fr', 'Freitag'], ['sa', 'Samstag'], ['so', 'Sonntag']];
  const zeitZeile = ([k, n]) => `<tr><th scope="row">${n}</th><td><input type="time" name="${k}_von1" aria-label="${n} von"> – <input type="time" name="${k}_bis1" aria-label="${n} bis"></td><td><input type="time" name="${k}_von2" aria-label="${n} zweites Zeitfenster von"> – <input type="time" name="${k}_bis2" aria-label="${n} zweites Zeitfenster bis"></td></tr>`;
  const formular = `
<form class="melde-form" action="/api/meldung" method="post" enctype="multipart/form-data" data-meldeform>
  <fieldset class="melde-art">
    <legend>Was möchtest du tun?</legend>
    <label><input type="radio" name="art" value="neu" checked><span>Neuen Hof oder Automaten eintragen</span></label>
    <label><input type="radio" name="art" value="korrektur"><span>Bestehenden Eintrag ergänzen oder korrigieren</span></label>
    <label><input type="radio" name="art" value="uebernahme"><span>Ich betreibe den Hof und möchte den Eintrag übernehmen</span></label>
  </fieldset>
  <input type="hidden" name="hof" value=""><input type="hidden" name="eintrag" value="">
  ${["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].map((k) => `<input type="hidden" name="${k}" value="">`).join("")}

  <div class="feldgruppe">
    <h2>Betrieb</h2>
    <label data-feld="name">Name<input name="name" maxlength="120" autocomplete="organization"></label>
    <label>Art<select name="betriebsart"><option value="">bitte wählen</option><option>Hofladen</option><option>Milchtankstelle</option><option>Eierautomat</option><option>Regiomat</option><option>Fleischautomat</option><option>Kartoffelautomat</option><option>sonstiger Automat</option></select></label>
    <label data-feld="adresse">Straße und Hausnummer<input name="strasse" maxlength="120" autocomplete="street-address"></label>
    <div class="zeile"><label data-feld="adresse">PLZ<input name="plz" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="postal-code"></label><label>Ort<input name="ort" maxlength="80" autocomplete="address-level2"></label></div>
    <div class="zeile"><label data-feld="telefon">Telefon<input name="telefon" type="tel" maxlength="40"></label><label data-feld="online">E-Mail des Betriebs<input name="email" type="email" maxlength="120"></label></div>
    <label data-feld="online">Website<input name="website" type="url" maxlength="200" placeholder="https://"></label>
  </div>
  <div class="feldgruppe" data-feld="zeiten" id="zeiten">
    <h2>Öffnungszeiten</h2>
    <p class="leise" data-bisher-zeiten hidden></p>
    <label class="haken"><input type="checkbox" name="rund" value="ja"><span>Rund um die Uhr geöffnet (z. B. Automat)</span></label>
    <table class="zeiten-form"><thead><tr><th></th><th>Zeitfenster</th><th>Zweites Zeitfenster (optional)</th></tr></thead><tbody>${TAGE_FORM.map(zeitZeile).join('')}</tbody></table>
    <p class="leise">Leere Tage gelten als geschlossen.</p>
    <label>Saisonale Hinweise<textarea name="saison" maxlength="300" rows="2" placeholder="z. B. Spargel ab Mitte April, im Januar Betriebsferien"></textarea></label>
  </div>
  <div class="feldgruppe">
    <h2>Angebot</h2>
    <div class="haken-liste" data-feld="angebot">${Object.entries(KATEGORIEN).map(([k, n]) => `<label class="haken"><input type="checkbox" name="angebot" value="${k}"><span>${esc(n)}</span></label>`).join('')}</div>
    <label class="haken"><input type="checkbox" name="bio" value="ja"><span>Bio (zertifiziert)</span></label>
    <h3>Bezahlen</h3>
    <div class="haken-liste" data-feld="bezahlen">${Object.entries(ZAHLUNG_TEXT).map(([k, n]) => `<label class="haken"><input type="checkbox" name="zahlung" value="${k}"><span>${esc(n)}</span></label>`).join('')}</div>
    <label data-feld="beschreibung">Kurze Beschreibung<textarea name="beschreibung" maxlength="600" rows="3"></textarea></label>
  </div>
  <div class="feldgruppe">
    <h2>Fotos (optional)</h2>
    <label data-feld="fotos">Bis zu 3 Fotos vom Hof oder Laden<input type="file" name="fotos" accept="image/jpeg,image/png,image/webp" multiple></label>
    <label class="haken"><input type="checkbox" name="fotorechte" value="ja"><span>Ich habe die Rechte an den Fotos und erlaube die Veröffentlichung auf hofladenliste.de. Auf den Fotos sind keine erkennbaren Personen ohne deren Einverständnis.</span></label>
  </div>
  <div class="feldgruppe">
    <h2>Kontakt</h2>
    <div class="zeile"><label>Dein Name<input name="kontakt_name" maxlength="120" autocomplete="name"></label><label>Deine E-Mail<input name="kontakt_email" type="email" maxlength="120" autocomplete="email"></label></div>
    <p class="leise">Für Rückfragen; bei der Übernahme eines Eintrags Pflicht. Wird nicht veröffentlicht. Mit E-Mail-Adresse sagen wir dir Bescheid, sobald deine Meldung online ist.</p>
    <label class="haken" data-nur-uebernahme hidden><input type="checkbox" name="badge" value="ja"><span>Schickt mir bitte das Badge „Wir sind auf hofladenliste.de“ für unsere Website.</span></label>
    <label>Anmerkungen<textarea name="hinweis" maxlength="2000" rows="3"></textarea></label>
    <label class="falle" aria-hidden="true">Firma<input name="firma" tabindex="-1" autocomplete="off"></label>
    <input type="hidden" name="t" value="">
    <label class="haken"><input type="checkbox" name="einwilligung" value="ja" required><span>Ich habe den <a href="/datenschutz/#formular">Datenschutzhinweis</a> gelesen. Die Angaben zum Betrieb werden nach Prüfung veröffentlicht.</span></label>
  </div>
  <p><button type="submit" class="knopf knopf-dunkel">Absenden</button></p>
  <p class="fehler" data-melde-fehler hidden></p>
</form>`;
  textSeite('/mitmachen/', 'Hofladen eintragen – kostenlos', 'Hofladen eintragen: Trage deinen Hofladen, deine Milchtankstelle, deinen Eierautomaten oder Regiomaten kostenlos ein, korrigiere Angaben oder übernimm deinen Eintrag.', `<h1 data-melde-titel>Hofladen kostenlos eintragen</h1>
<div class="melde-hof" data-melde-hof hidden></div>
<p data-intro>Der Eintrag ist kostenlos. Wir prüfen jede Meldung und veröffentlichen sie in der Regel innerhalb weniger Tage. Willkommen sind alle, die direkt verkaufen: Hofläden und Bauernläden, <a href="/milchtankstelle/">Milchtankstellen</a>, <a href="/eierautomat/">Eierautomaten</a> und <a href="/regiomat/">Regiomaten</a>.</p>
<p data-intro>Betreibst du einen Hof, der schon eingetragen ist? Dann übernimm den Eintrag – du kannst Öffnungszeiten, Angebot, Fotos und saisonale Hinweise selbst aktuell halten. Danach gibt es auf Wunsch ein <a href="/fuer-hoefe/">Badge für deine Website</a>.</p>
${formular}
${kontaktMail ? `<p>Lieber per E-Mail? <a id="mail-link" href="mailto:${esc(kontaktMail)}?subject=${encodeURIComponent('Eintrag Hofladenliste')}">E-Mail schreiben</a></p>` : ''}
<h2>Direkt in OpenStreetMap eintragen</h2>
<p>Die meisten Einträge stammen aus <a href="https://www.openstreetmap.org/">OpenStreetMap</a>. Wenn du deinen Hof dort einträgst (Kategorie „Hofladen“, Merkmal <code>shop=farm</code>; für Automaten <code>amenity=vending_machine</code> mit <code>vending=milk</code>, <code>eggs</code> usw.), erscheint er nach der nächsten Aktualisierung (montags und donnerstags) auch hier.</p>`, false);
  textSeite('/mitmachen/danke/', 'Danke für deine Meldung', 'Deine Meldung ist bei uns angekommen. Wir prüfen sie und veröffentlichen die Angaben in der Regel innerhalb weniger Tage.', `<h1>Danke – deine Meldung ist angekommen</h1>
<p>Wir prüfen die Angaben und veröffentlichen sie in der Regel innerhalb weniger Tage. Bei Rückfragen melden wir uns, falls du eine E-Mail-Adresse angegeben hast.</p>
<p><a href="/">Zur Startseite</a> · <a href="/fuer-hoefe/">Badge für deine Website</a></p>`);
}
schreibe('/404.html', seite({
  titel: 'Seite nicht gefunden | Hofladenliste', beschreibung: 'Diese Seite gibt es nicht.', pfad: '/404.html', noindex: true, klasse: 'textseite',
  inhalt: '<article class="text"><h1>Diese Seite gibt es nicht</h1><p>Vielleicht wurde der Eintrag verschoben. Gib oben deine Postleitzahl ein oder starte auf der <a href="/">Startseite</a>.</p></article>',
}), false);

// ---------- Wochenmärkte: Übersicht, Bundesländer, Kreise (ab 3 Märkten) ----------
if (MAERKTE.length) {
  const mitZeiten = MAERKTE.filter((m) => m.oeffnungszeiten).length;
  const landInfo = laender.map((l) => {
    const ks = l.kreise.map((k) => ({ k, ms: maerkteProKreis.get(k.code) || [] })).filter((x) => x.ms.length);
    return { l, ks, n: ks.reduce((a, x) => a + x.ms.length, 0), pfad: `/wochenmaerkte/${l.slug}/` };
  }).filter((x) => x.n);
  const osmHinweis = '<p class="leise">Die Märkte stammen aus <a href="https://www.openstreetmap.org/">OpenStreetMap</a> (© OpenStreetMap-Mitwirkende, ODbL). Fehlt ein Markt oder stimmen die Zeiten nicht? Über „In OSM bearbeiten“ kannst du ihn direkt in OpenStreetMap ergänzen; wir übernehmen Änderungen zweimal pro Woche.</p>';
  schreibe('/wochenmaerkte/', seite({
    titel: `Wochenmärkte in Deutschland – ${zahl(MAERKTE.length)} Märkte mit Marktzeiten`,
    beschreibung: `${zahl(MAERKTE.length)} Wochenmärkte, Bauernmärkte und Markthallen in Deutschland, ${zahl(mitZeiten)} davon mit Marktzeiten – nach Bundesland und Kreis, mit Route und Hofläden in der Nähe.`,
    pfad: '/wochenmaerkte/', krumen: [['Wochenmärkte', '/wochenmaerkte/']],
    inhalt: `<section class="seitenkopf"><h1>Wochenmärkte in Deutschland</h1>
  <p>${zahl(MAERKTE.length)} Wochenmärkte, Bauernmärkte und Markthallen, ${zahl(mitZeiten)} davon mit Marktzeiten. Auf dem Markt verkaufen viele Höfe aus der Region – die Hofläden findest du auf den Seiten der Kreise.</p></section>
<section class="abschnitt"><h2>Wochenmärkte nach Bundesland</h2>
  <ul class="laender-liste">${landInfo.map((x) => `<li><a href="${x.pfad}"><span>${esc(x.l.name)}</span><span class="zahl">${zahl(x.n)}</span></a></li>`).join('')}</ul></section>
<section class="abschnitt">${osmHinweis}</section>`,
  }));
  for (const x of landInfo) {
    const gross = x.ks.filter((y) => y.ms.length >= MARKT_SEITE_AB), klein = x.ks.filter((y) => y.ms.length < MARKT_SEITE_AB);
    schreibe(x.pfad, seite({
      titel: passend(`Wochenmärkte in ${x.l.name} – ${zahl(x.n)} Märkte nach Kreis`, `Wochenmärkte in ${x.l.name}`),
      beschreibung: `${zahl(x.n)} Wochenmärkte und Bauernmärkte in ${x.l.name}: nach Kreis sortiert, mit Marktzeiten, Adresse und Route.`,
      pfad: x.pfad, noindex: x.n < MIN_SEITE, krumen: [['Wochenmärkte', '/wochenmaerkte/'], [x.l.name, x.pfad]],
      inhalt: `<section class="seitenkopf"><h1>Wochenmärkte in ${esc(x.l.name)}</h1><p>${zahl(x.n)} Märkte in ${zahl(x.ks.length)} Kreisen. <a href="/${x.l.slug}/">Hofläden in ${esc(x.l.name)}</a></p></section>
${gross.length ? `<section class="abschnitt"><h2>Kreise mit mehreren Wochenmärkten</h2><ul class="kreis-liste">${gross.map((y) => `<li><a href="${marktPfad(y.k)}"><span>${esc(y.k.titel)}</span><span class="zahl">${zahl(y.ms.length)}</span></a></li>`).join('')}</ul></section>` : ''}
${klein.map((y) => `<section class="abschnitt"><h2>Wochenmärkte ${esc(y.k.im)}</h2><div class="karten-reihe">${y.ms.map((m) => marktKarte(m)).join('')}</div><p><a href="${y.k.pfad}">Hofläden ${esc(y.k.im)}</a></p></section>`).join('\n')}
<section class="abschnitt">${osmHinweis}</section>`,
    }), x.n >= MIN_SEITE);
    for (const { k, ms } of gross) {
      const hoefe = (proKreis.get(k.code) || []).slice(0, 6);
      const n = ms.length, z = ms.filter((m) => m.oeffnungszeiten).length;
      const orte = [...new Set(ms.map((m) => m.ortAnzeige))];
      schreibe(marktPfad(k), seite({
        titel: passend(`Wochenmärkte ${k.im} – ${zahl(n)} Märkte mit Marktzeiten`, `Wochenmärkte ${k.im} – ${zahl(n)} Märkte`, `Wochenmärkte ${k.im}`),
        beschreibung: `${zahl(n)} Wochenmärkte ${k.im}${orte.length > 1 ? `, u. a. in ${orte.slice(0, 3).join(', ')}` : ` in ${orte[0]}`}${z ? `, ${zahl(z)} davon mit Marktzeiten` : ''}. Mit Adresse, Route und Hofläden in der Nähe.`,
        pfad: marktPfad(k), krumen: [['Wochenmärkte', '/wochenmaerkte/'], [x.l.name, x.pfad], [k.titel, marktPfad(k)]],
        inhalt: `<section class="seitenkopf"><h1>Wochenmärkte ${esc(k.im)}</h1><p>${zahl(n)} Märkte${z ? `, ${zahl(z)} davon mit Marktzeiten` : ''}. Der Status „Jetzt geöffnet“ richtet sich nach den hinterlegten Marktzeiten.</p></section>
<div class="liste">${ms.map((m) => marktKarte(m, 'h2')).join('\n')}</div>
${hoefe.length ? `<section class="abschnitt"><h2>Hofläden ${esc(k.im)}</h2><div class="karten-reihe">${hoefe.map((e) => karteHtml(kartenDaten(e))).join('')}</div><p><a href="${k.pfad}">Alle Hofläden ${esc(k.im)}</a></p></section>` : ''}
<section class="abschnitt">${osmHinweis}</section>`,
      }));
    }
  }
}

// ---------- Saisonseite: Weihnachtsbaum vom Hof ----------
{
  const proLand = laender.map((l) => ({ l, liste: WEIHNACHT.filter((e) => e.k?.land === l.code).sort((a, b) => a.ortAnzeige.localeCompare(b.ortAnzeige, 'de')) })).filter((x) => x.liste.length);
  schreibe('/weihnachtsbaum-vom-hof/', seite({
    titel: WEIHNACHT.length ? passend(`Weihnachtsbaum vom Hof – ${zahl(WEIHNACHT.length)} Höfe mit Weihnachtsbäumen`, `Weihnachtsbaum vom Hof kaufen – ${zahl(WEIHNACHT.length)} Höfe`) : 'Weihnachtsbaum vom Hof kaufen',
    beschreibung: `Weihnachtsbaum direkt vom Hof kaufen: ${WEIHNACHT.length ? `${zahl(WEIHNACHT.length)} Höfe und Hofläden mit Weihnachtsbäumen,` : 'Höfe und Hofläden mit Weihnachtsbäumen,'} nach Bundesland, mit Öffnungszeiten und Route. Verkauft ihr Bäume? Kostenlos eintragen.`,
    pfad: '/weihnachtsbaum-vom-hof/', noindex: WEIHNACHT.length < MIN_SEITE, krumen: [['Weihnachtsbaum vom Hof', '/weihnachtsbaum-vom-hof/']],
    inhalt: `<section class="seitenkopf"><h1>Weihnachtsbaum vom Hof</h1>
  <p>${WEIHNACHT.length ? `${zahl(WEIHNACHT.length)} ${WEIHNACHT.length === 1 ? 'Hof verkauft' : 'Höfe verkaufen'} laut Eintrag Weihnachtsbäume – oft frisch geschlagen und aus der Region.` : 'Hier sammeln wir Höfe, die Weihnachtsbäume verkaufen.'} Viele Höfe verkaufen nur in der Adventszeit; frag im Zweifel vorher nach.</p>
  ${naeheSuche({ produkt: 'weihnachtsbaeume' }, 'Weihnachtsbäume in meiner Nähe')}
</section>
<section class="abschnitt hinweis-box"><h2>Ihr verkauft Weihnachtsbäume?</h2><p>Tragt euren Hof kostenlos ein oder ergänzt euren bestehenden Eintrag um „Weihnachtsbäume“ – dann erscheint ihr hier und bei der Suche nach dem Angebot.</p><p><a class="knopf knopf-dunkel" href="/mitmachen/?angebot=weihnachtsbaeume">Hof mit Weihnachtsbäumen eintragen</a></p></section>
${proLand.map((x) => `<section class="abschnitt"><h2>Weihnachtsbäume vom Hof in ${esc(x.l.name)}</h2><div class="karten-reihe">${x.liste.map((e) => karteHtml(kartenDaten(e))).join('')}</div></section>`).join('\n')}`,
  }), WEIHNACHT.length >= MIN_SEITE);
}

export { AUSHANG_LEISTE, KARTE_TYP, MONATE, imp, impFehlt, kontaktMail, textSeite };
