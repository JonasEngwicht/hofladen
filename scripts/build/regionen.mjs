// Build, Teil „regionen“: Bundesland-, Kreis-, Kategorie-, Angebots- und Ortsseiten.
// Wird von scripts/build.mjs in fester Reihenfolge geladen; nutzt die Ergebnisse der vorherigen Teile.
import { distanzKm } from '../lib.mjs';
import { esc } from '../../static/helfer.js';
import { KATEGORIEN, ICON, karteHtml } from '../../static/karte.js';
import { eintraege, istRund, kreisMitte, kreise, laender, offen, plz, proKreis, wocheVon } from './daten.mjs';
import { KATEGORIE_PFADE, SEITENTEXTE, SUCHFELD, filterLeiste, kartenDaten, kartenPanel, plural, seite, zahl } from './html.mjs';
import { angebotHaeufig, MIN_SEITE, ORTE, REGIONEN, UEBERDECKT, UMGEBUNG_PFAD, umgebungIndexiert, UMKREISE, fragen, fragenHtml, gebietsText, gross, hofItems, itemList, km, link, naheOrte, nennung, ortListe, ortSeiten, ortUeberschrift, passend, quellenHtml, regionHtml, regionTeaser, schreibe, umkreis, zaehlung, zaehlungKurz } from './grundlagen.mjs';
import { ANGEBOT, ANGEBOT_SEITEN, AUTOMATEN, BIO, KAT_TYPEN, LAND_KAT, MONATSNAMEN, MONAT_JETZT, SAISON_SEITEN, TYPEN, TYP_KREIS, akkusativ, landKat, marktAbschnitt, typKreis, typKreisLinks, typLinks } from './startseite.mjs';

// Lokale Seiten ohne gepflegten Text (data/seitentexte.json) – für docs/seitentexte-offen.md (abschluss.mjs)
const SEITENTEXT_KANDIDATEN = []; // { pfad, art, titel, n (eigene Einträge) }
const kandidat = (x) => { if (!SEITENTEXTE[x.pfad]) SEITENTEXT_KANDIDATEN.push(x); };

// „Jetzt in der Saison“ für lokale Seiten: nur Sorten, die Höfe dieser Seite selbst nennen (Name, Beschreibung, Angebot),
// dazu gepflegte Saison-Hinweise ("saison" in data/seitentexte.json). Ohne echte Treffer entfällt der Block.
// Der Monat gilt beim Bauen; im Browser blendet app.js den Monatsteil aus, wenn inzwischen ein anderer Monat ist.
const sortenText = (e) => [e.name, e.beschreibung, ...(e.produkte || [])].filter(Boolean).join(' ');
function saisonLokal(liste, wo, pfad) {
  const m = MONAT_JETZT;
  const zeilen = SAISON_SEITEN.filter((s) => s.frisch.includes(m) || s.lager.includes(m))
    .map((s) => ({ s, frisch: s.frisch.includes(m), hoefe: liste.filter((e) => s.re.test(sortenText(e))) }))
    .filter((z) => z.hoefe.length)
    .sort((a, b) => b.frisch - a.frisch || b.hoefe.length - a.hoefe.length || a.s.name.localeCompare(b.s.name, 'de'))
    .slice(0, 8);
  const eigene = (SEITENTEXTE[pfad]?.saison || []).filter((h) => h?.titel && h?.zeit);
  if (!zeilen.length && !eigene.length) return '';
  const hoefe = (h) => nennung(h.slice(0, 3).map(link).concat(h.length > 3 ? [`${zahl(h.length - 3)} ${h.length - 3 === 1 ? 'weiterer' : 'weitere'}`] : []));
  return `<section class="abschnitt saison-lokal" id="saison"${zeilen.length ? ` data-saison-monat="${m}"` : ''}>
  <h2>${zeilen.length ? `Jetzt in der Saison ${esc(wo)}: ${MONATSNAMEN[m - 1]}` : `Saison ${esc(wo)}`}</h2>
  ${zeilen.length ? `<p>Diese Höfe ${esc(wo)} nennen Sorten, die im ${MONATSNAMEN[m - 1]} Saison haben:</p>
  <ul class="saison-lokal-liste">${zeilen.map(({ s, frisch, hoefe: h }) => `<li><b><a href="${s.pfad}">${esc(s.name)}</a></b> <span class="leise">${frisch ? 'frisch' : 'aus dem Lager'}</span>: ${hoefe(h)}</li>`).join('')}</ul>` : ''}
  ${eigene.length ? `<h3>Typisch für die Gegend</h3><ul class="region-highlights">${eigene.map((h) => `<li><b>${esc(h.titel)}</b><span>${esc(h.zeit)}</span></li>`).join('')}</ul>` : ''}
  <p class="leise">Ob es eine Sorte gerade gibt, hängt von Wetter und Ernte ab – im Zweifel vorher anrufen. Alle Sorten nach Monat: <a href="/saisonkalender/">Saisonkalender</a>.</p>
</section>`;
}

// ---------- Bundesland- und Kreisseiten ----------
for (const l of laender) {
  const mitDaten = l.kreise.filter((k) => proKreis.get(k.code)?.length);
  const alle = mitDaten.flatMap((k) => proKreis.get(k.code));
  const topOrte = l.kreise.flatMap((k) => [...(ORTE.get(k.code)?.values() || [])]).filter((o) => o.eigen).sort((a, b) => b.liste.length - a.liste.length).slice(0, 24);
  schreibe(`/${l.slug}/`, seite({
    titel: passend(`Hofladen in ${l.name} – ${zahl(l.anzahl)} Hofläden & Hofautomaten nach Kreis`, `Hofladen in ${l.name} – ${zahl(l.anzahl)} Hofläden & Automaten`, `Hofläden in ${l.name} nach Kreis`),
    beschreibung: `Hofladen in ${l.name} finden: ${zaehlung(alle)} – nach Landkreis, Stadt und Ort sortiert, mit Öffnungszeiten, Angebot und Karte.`,
    pfad: `/${l.slug}/`,
    jsonld: [itemList(`Landkreise und Städte in ${l.name}`, l.kreise.filter((k) => (proKreis.get(k.code)?.length || 0) >= MIN_SEITE).map((k) => [k.titel, k.pfad]))],
    krumen: [[l.name, `/${l.slug}/`]],
    inhalt: `
<section class="seitenkopf">
  <h1>Hofläden in ${esc(l.name)}</h1>
  <p>${plural(l.anzahl, 'Eintrag', 'Einträge')} in ${plural(mitDaten.length, 'Kreis', 'Kreisen')}. Wähle deinen Landkreis oder deine Stadt – oder gib oben deine Postleitzahl ein.</p>
</section>
<section class="abschnitt">
  <h2>Hofläden nach Landkreis und Stadt</h2>
  <ul class="kreis-liste">
    ${l.kreise.map((k) => { const n = proKreis.get(k.code)?.length || 0;
      return `<li><a href="${k.pfad}"${n ? '' : ' class="leer"'}><span>${esc(k.titel)}</span><span class="zahl">${n ? zahl(n) : '–'}</span></a></li>`; }).join('\n    ')}
  </ul>
</section>
${topOrte.length ? `<section class="abschnitt">
  <h2>Orte mit den meisten Hofläden in ${esc(l.name)}</h2>
  <ul class="kreis-liste">${topOrte.map((o) => `<li><a href="${o.pfad}"><span>${esc(ortUeberschrift(o).replace(/ in .*/, ''))} in ${esc(o.ort)}</span><span class="zahl">${zahl(o.liste.length)}</span></a></li>`).join('')}</ul>
</section>` : ''}
${KAT_TYPEN.some((t) => landKat(t, l)) ? `<section class="abschnitt"><h2>Nach Kategorie in ${esc(l.name)}</h2><p class="typ-chips">${KAT_TYPEN.map((t) => landKat(t, l)).filter(Boolean).map((x) => `<a href="${x.pfad}">${x.t.icon}${x.t.plural} <span>${zahl(x.liste.length)}</span></a>`).join('')}</p></section>` : ''}
<section class="abschnitt seo-text">
  <h2>Hofladen in ${esc(l.name)}: Überblick</h2>
  ${gebietsText(alle, `in ${l.name}`, { orteNennen: false })}
  ${typLinks(alle, l.slug)}
</section>
<section class="abschnitt">
  <h2>Hofläden in anderen Bundesländern</h2>
  <ul class="kreis-liste">${laender.filter((x) => x !== l).map((x) => `<li><a href="/${x.slug}/"><span>${esc(x.name)}</span><span class="zahl">${zahl(x.anzahl)}</span></a></li>`).join('')}</ul>
</section>`,
  }));

  for (const k of l.kreise) {
    const liste = (proKreis.get(k.code) || []).slice().sort((a, b) =>
      a.ortAnzeige.localeCompare(b.ortAnzeige, 'de') || a.titel.localeCompare(b.titel, 'de'));
    const mitte = kreisMitte.get(k.code);
    const nachbarn = [...kreise.values()].filter((x) => x !== k && kreisMitte.get(x.code))
      .map((x) => [distanzKm(mitte.lat, mitte.lon, kreisMitte.get(x.code).lat, kreisMitte.get(x.code).lon), x])
      .sort((a, b) => a[0] - b[0]).slice(0, 8).map(([, x]) => x);
    const im = k.im;
    const orte = [...(ORTE.get(k.code)?.values() || [])].sort((a, b) => b.liste.length - a.liste.length || a.ort.localeCompare(b.ort, 'de'));
    const ortLinks = orte.filter((o) => o.pfad !== k.pfad).map((o) => `<a href="${o.pfad}">${esc(o.ort)}</a>`);
    const z = UMGEBUNG_PFAD.get(k.pfad);
    if (z?.kreisSeite) {
      // Kreisfreie Stadt: Stadtseite mit Umgebung
      const ortListeHtml = ortLinks.length ? `<section class="abschnitt"><h2>Hofläden in Stadtteilen von ${esc(k.name)}</h2><ul class="kreis-liste">${orte.filter((o) => o.pfad !== k.pfad && o.eigen).map((o) => `<li><a href="${o.pfad}"><span>${esc(o.ort)}</span><span class="zahl">${o.liste.length ? zahl(o.liste.length) : ''}</span></a></li>`).join('')}</ul></section>` : '';
      schreibe(k.pfad, umgebungsSeite(z, {
        krumen: [[l.name, `/${l.slug}/`], [k.titel, k.pfad]],
        regionProfil: REGIONEN.get(k.code) || null,
        extraUnten: `${ortListeHtml}${marktAbschnitt(k)}<section class="abschnitt nachbarn"><h2>Hofläden in benachbarten Kreisen</h2><ul class="kreis-liste">${nachbarn.map((x) => `<li><a href="${x.pfad}"><span>${esc(x.titel)}</span><span class="zahl">${zahl(proKreis.get(x.code)?.length || 0)}</span></a></li>`).join('')}</ul></section>`,
      }), umgebungIndexiert(z));
      continue;
    }
    const f = liste.length ? fragenHtml(fragen(liste, im, mitte, { orteLinks: ortLinks }), `Häufige Fragen zu Hofläden ${im}`) : { html: '', ld: [] };
    if (liste.length >= MIN_SEITE && !REGIONEN.has(k.code)) kandidat({ pfad: k.pfad, art: 'Kreis', titel: `Hofläden ${im}`, n: liste.length });
    schreibe(k.pfad, seite({
      titel: liste.length > 1 ? passend(`Hofladen ${im} – ${zaehlungKurz(liste)} mit Öffnungszeiten`, `Hofladen ${im} – ${zaehlungKurz(liste)}`, `Hofladen ${im} – ${plural(liste.length, 'Eintrag', 'Einträge')}`, `Hofladen ${im}`)
        : liste.length ? passend(`Hofladen ${im} – Öffnungszeiten, Adresse & Route`, `Hofladen ${im} – Öffnungszeiten`, `Hofladen ${im}`) : `Hofladen ${im} – Hofläden in der Umgebung`,
      beschreibung: liste.length
        ? [`Hofladen ${im} finden: ${zaehlung(liste)}${orte.length > 1 ? `, u. a. in ${orte.slice(0, 3).map((o) => o.ort).join(', ')}` : ''}.`, ...(() => { const ang = angebotHaeufig(liste), so = liste.filter((e) => e.sonntag).length; return [ang.length ? `Oft im Angebot: ${nennung(ang)}.` : '', so >= 2 ? `${zahl(so)} auch sonntags geöffnet.` : '']; })(), 'Öffnungszeiten, Karte und Route.'].filter(Boolean).join(' ')
        : `Hofläden ${im}: noch keine Einträge – hier findest du Hofläden in der Umgebung.`,
      pfad: k.pfad,
      noindex: liste.length < MIN_SEITE,
      klasse: 'kreis',
      jsonld: [...(liste.length ? [itemList(`Hofläden ${im}`, hofItems(liste))] : []), ...f.ld],
      krumen: [[l.name, `/${l.slug}/`], [k.titel, k.pfad]],
      inhalt: `
<section class="seitenkopf">
  <h1>Hofläden ${esc(im)}</h1>
  <p>${liste.length ? `${zaehlung(liste)} – mit Öffnungszeiten, Angebot und Route.` : `Für ${esc(k.titel)} haben wir noch keine Einträge. In den Nachbarkreisen gibt es welche – oder du <a href="/mitmachen/">trägst einen Hof ein</a>.`}</p>
  ${typKreisLinks(k).length ? `<p class="typ-chips">${typKreisLinks(k).map((x) => `<a href="${x.pfad}">${x.t.icon}${x.t.plural} <span>${zahl(x.liste.length)}</span></a>`).join('')}</p>` : ''}
  <p class="plz-hinweis" data-plz-hinweis hidden></p>
</section>
${liste.length ? filterLeiste(liste) : ''}
<div class="geteilt">
  <div class="liste" data-liste>
    <h2 class="sr">Einträge</h2>
    ${liste.map((e) => karteHtml(kartenDaten(e))).join('\n    ')}
    <p class="leer-filter" data-leer-filter hidden>Keine Einträge passen zu deinem Filter. <button type="button" class="link" data-filter-zuruecksetzen>Filter zurücksetzen</button></p>
    <section class="umgebung" data-umgebung hidden><h2>Ganz in der Nähe, aber in anderen Kreisen</h2><div data-umgebung-liste></div></section>
  </div>
  <aside class="karten-spalte">${kartenPanel({ titel: `Karte: Hofläden ${im}` })}</aside>
</div>
${REGIONEN.has(k.code) ? regionHtml(REGIONEN.get(k.code)) : ''}
${liste.length >= MIN_SEITE ? saisonLokal(liste, im, k.pfad) : ''}
${ortLinks.length > 1 ? `<section class="abschnitt">
  <h2>Hofläden nach Ort ${esc(im)}</h2>
  <ul class="kreis-liste">${orte.filter((o) => o.pfad !== k.pfad).map((o) => `<li><a href="${o.pfad}"><span>${esc(o.eigen ? ortUeberschrift(o).replace(/^Hofläden in /, '') : o.ort)}</span><span class="zahl">${o.liste.length ? zahl(o.liste.length) : ''}</span></a></li>`).join('')}</ul>
</section>` : ''}
${marktAbschnitt(k)}
${liste.length ? `<section class="abschnitt seo-text"><h2>Hofladen ${esc(im)}: Überblick</h2>${gebietsText(liste, im, { anker: l.slug })}${typLinks(liste, l.slug, k)}<p>Mehr aus der Region: <a href="/${l.slug}/">alle Hofläden in ${esc(l.name)}</a>.</p></section>` : ''}
${f.html}
<section class="abschnitt nachbarn">
  <h2>Hofläden in der Umgebung</h2>
  <ul class="kreis-liste">${nachbarn.map((x) => `<li><a href="${x.pfad}"><span>${esc(x.titel)}</span><span class="zahl">${zahl(proKreis.get(x.code)?.length || 0)}</span></a></li>`).join('')}</ul>
</section>
${REGIONEN.has(k.code) ? quellenHtml(REGIONEN.get(k.code)) : ''}`,
    }), liste.length >= MIN_SEITE);
  }
}

// ---------- Kategorie je Kreis (Automatentypen, alle Automaten, Bio) ----------
for (const { t, k, liste: roh, pfad } of TYP_KREIS.values()) {
  const liste = roh.slice().sort((a, b) => a.ortAnzeige.localeCompare(b.ortAnzeige, 'de') || a.titel.localeCompare(b.titel, 'de'));
  const n = liste.length;
  const orte = new Map();
  for (const e of liste) orte.set(e.ortAnzeige, (orte.get(e.ortAnzeige) || 0) + 1);
  const ortNamen = [...orte].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).map(([o]) => o);
  const rund = liste.filter((e) => istRund(wocheVon(e))).length;
  const sonntag = liste.filter((e) => e.sonntag).length;
  const mitte = kreisMitte.get(k.code);
  const nachbarn = [...TYP_KREIS.values()].filter((x) => x.t === t && x.k !== k)
    .map((x) => [distanzKm(mitte.lat, mitte.lon, kreisMitte.get(x.k.code).lat, kreisMitte.get(x.k.code).lon), x])
    .sort((a, b) => a[0] - b[0]).slice(0, 8);
  const andere = typKreisLinks(k, t);
  const einzahl = akkusativ(t);
  kandidat({ pfad, art: t.plural, titel: `${t.plural} ${k.im}`, n });
  // Fragen nur aus sichtbaren, echten Angaben dieser Seite
  const rundListe = liste.filter((e) => istRund(wocheVon(e)));
  const sonntagListe = liste.filter((e) => e.sonntag && !istRund(wocheVon(e)));
  const mitZeiten = liste.filter((e) => e.oeffnungszeiten).length;
  const tf = [
    [`Wo gibt es ${einzahl} ${k.im}?`, `In ${nennung(ortNamen.slice(0, 6).map(esc))}${ortNamen.length > 6 ? ` und ${plural(ortNamen.length - 6, 'weiterem Ort', 'weiteren Orten')}` : ''}: ${nennung(liste.slice(0, 4).map((e) => e.titel.includes(e.ortAnzeige) ? link(e) : `${link(e)} (${esc(e.ortAnzeige)})`))}${n > 4 ? ` und ${zahl(n - 4)} weitere` : ''}.`],
    ...(rundListe.length ? [[`Welche ${t.plural} ${k.im} sind rund um die Uhr zugänglich?`, `Laut Angabe ${rundListe.length === 1 ? 'ist' : 'sind'} ${nennung(rundListe.slice(0, 5).map(link))}${rundListe.length > 5 ? ` und ${zahl(rundListe.length - 5)} weitere` : ''} rund um die Uhr zugänglich.`]] : []),
    ...(sonntagListe.length ? [[`Welche ${t.plural} ${k.im} haben sonntags geöffnet?`, `Sonntags geöffnet ${sonntagListe.length === 1 ? 'hat' : 'haben'} laut den hinterlegten Zeiten ${nennung(sonntagListe.slice(0, 5).map(link))}${sonntagListe.length > 5 ? ` und ${zahl(sonntagListe.length - 5)} weitere` : ''}.`]] : []),
    ...(!rundListe.length && mitZeiten < n ? [['Sind die Öffnungszeiten aktuell?', `Für ${plural(mitZeiten, 'Standort', 'Standorte')} von ${zahl(n)} sind Öffnungszeiten hinterlegt. Wenn keine Zeiten angegeben sind, ruf am besten vorher an. Kennst du die Zeiten? Auf der Seite des Standorts kannst du sie ergänzen.`]] : []),
    ...(nachbarn.length ? [[`Wo gibt es weitere ${t.plural} in der Nähe?`, `In den Nachbarkreisen: ${nennung(nachbarn.slice(0, 4).map(([, x]) => `<a href="${x.pfad}">${esc(x.k.titel)}</a> (${zahl(x.liste.length)})`))}.`]] : []),
  ];
  const tfaq = fragenHtml(tf, `Häufige Fragen: ${t.plural} ${k.im}`);
  const mitSaison = !TYPEN.includes(t) && t !== AUTOMATEN;
  schreibe(pfad, seite({
    titel: passend(`${t.plural} ${k.im} – ${zahl(n)} Standorte mit Öffnungszeiten`, `${t.plural} ${k.im} – ${zahl(n)} Standorte`, `${t.plural} ${k.im}`, `${t.plural} ${k.titel.replace(/^(Landkreis|Kreis|Region|Regionalverband|Stadtkreis|Städteregion|Kreisfreie Stadt) /, '')}`),
    beschreibung: `${t.plural} ${k.im}: ${zahl(n)} Standorte${ortNamen.length > 1 ? `, u. a. in ${ortNamen.slice(0, 3).join(', ')}` : ` in ${ortNamen[0]}`}. Adresse, Öffnungszeiten, Angebot und Route – plus ${t.plural} in den Nachbarkreisen.`,
    pfad,
    klasse: 'kreis',
    jsonld: [itemList(`${t.plural} ${k.im}`, hofItems(liste)), ...tfaq.ld],
    krumen: [[k.landName, `/${k.landSlug}/`], [k.titel, k.pfad], [t.plural, pfad]],
    inhalt: `
<section class="seitenkopf">
  <p class="hof-art typ-icon">${t.icon}</p>
  <h1>${t.plural} ${esc(k.im)}</h1>
  <p>${zahl(n)} ${t.plural} in ${plural(ortNamen.length, 'Ort', 'Orten')}${rund ? `, davon ${zahl(rund)} rund um die Uhr zugänglich` : ''} – mit Adresse, Öffnungszeiten und Route.</p>
  ${andere.length ? `<p class="typ-chips">${andere.map((x) => `<a href="${x.pfad}">${x.t.icon}${x.t.plural} <span>${zahl(x.liste.length)}</span></a>`).join('')}<a href="${k.pfad}">Alle Hofläden <span>${zahl(proKreis.get(k.code).length)}</span></a></p>` : ''}
  <p class="plz-hinweis" data-plz-hinweis hidden></p>
</section>
<div class="geteilt">
  <div class="liste" data-liste>
    <h2 class="sr">Einträge</h2>
    ${liste.map((e) => karteHtml(kartenDaten(e))).join('\n    ')}
    <p class="leer-filter" data-leer-filter hidden></p>
    <section class="umgebung" data-umgebung hidden><h2>Ganz in der Nähe, aber in anderen Kreisen</h2><div data-umgebung-liste></div></section>
  </div>
  <aside class="karten-spalte">${kartenPanel({ titel: `Karte: ${t.plural} ${k.im}` })}</aside>
</div>
<section class="abschnitt seo-text">
  <h2>${t.name} ${esc(k.im)} finden</h2>
  <p>${esc(gross(k.im))} gibt es ${zahl(n)} ${t.plural}: ${nennung(ortNamen.slice(0, 8).map((o) => orte.get(o) > 1 ? `${zahl(orte.get(o))} in ${esc(o)}` : esc(o)))}${ortNamen.length > 8 ? ' und weitere Orte' : ''}.${rund ? ` ${rund === n ? 'Alle sind' : `${zahl(rund)} davon sind`} laut Angabe rund um die Uhr zugänglich.` : ''}${sonntag && sonntag !== rund ? ` Sonntags geöffnet: ${zahl(sonntag)}.` : ''} Gib oben deine Postleitzahl ein, um ${einzahl} in deiner Nähe nach Entfernung sortiert zu sehen.</p>
  ${t.text.map((x) => `<p>${x}</p>`).join('')}
  <p>Mehr aus der Region: <a href="${k.pfad}">alle Hofläden ${esc(k.im)}</a>, <a href="${landKat(t, laender.find((l) => l.code === k.land))?.pfad || `/${t.slug}/#${k.landSlug}`}">${t.plural} in ${esc(k.landName)}</a> und alle <a href="/${t.slug}/">${t.plural} in Deutschland</a>.</p>
</section>
${mitSaison ? saisonLokal(liste, k.im, pfad) : ''}
${tfaq.html}
${nachbarn.length ? `<section class="abschnitt nachbarn"><h2>${t.plural} in der Umgebung</h2><ul class="kreis-liste">${nachbarn.map(([, x]) => `<li><a href="${x.pfad}"><span>${esc(x.k.titel)}</span><span class="zahl">${zahl(x.liste.length)}</span></a></li>`).join('')}</ul></section>` : ''}`,
  }));
}

// ---------- „In meiner Nähe“: Standortsuche mit optionalem Filter (Ergebnis per API, Seite bleibt ohne JS vollständig) ----------
const naeheSuche = (filter = {}, text = 'In meiner Nähe suchen') => `<div class="naehe-suche" data-naehe='${esc(JSON.stringify(filter))}'>
  <button type="button" class="knopf knopf-dunkel" data-naehe-start>${ICON.standort}${esc(text)}</button>
  <label class="naehe-offen"><input type="checkbox" data-naehe-offen> nur jetzt geöffnet</label>
  <p class="leise" data-naehe-status hidden></p>
  <div class="karten-reihe" data-naehe-liste></div>
</div>`;
const NAEHE_FILTER = (t) => t === BIO ? { bio: 1 } : t === AUTOMATEN ? { typ: 'automat' } : { art: t.arten.join(',') };

// ---------- Kategorie je Bundesland (kompakte Liste nach Kreis) ----------
for (const { t, l, liste, pfad } of LAND_KAT.values()) {
  const proK = new Map();
  for (const e of liste) { if (!proK.has(e.k)) proK.set(e.k, []); proK.get(e.k).push(e); }
  const kreisListe = [...proK].sort((a, b) => a[0].titel.localeCompare(b[0].titel, 'de'));
  for (const [, es] of kreisListe) es.sort((a, b) => a.ortAnzeige.localeCompare(b.ortAnzeige, 'de') || a.titel.localeCompare(b.titel, 'de'));
  const geordnet = kreisListe.flatMap(([, es]) => es);
  const rund = liste.filter((e) => istRund(wocheVon(e))).length;
  const andere = KAT_TYPEN.filter((x) => x !== t).map((x) => landKat(x, l)).filter(Boolean);
  const top = [...proK].sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([k]) => k.titel);
  schreibe(pfad, seite({
    titel: passend(`${t.plural} in ${l.name} – ${zahl(liste.length)} Standorte nach Kreis`, `${t.plural} in ${l.name} – ${zahl(liste.length)} Standorte`, `${t.plural} in ${l.name}`),
    beschreibung: `${t.plural} in ${l.name}: ${zahl(liste.length)} Standorte in ${plural(proK.size, 'Kreis', 'Kreisen')}, die meisten ${nennung(top.map((x) => x.replace(/^Landkreis /, 'im Landkreis ')))}. Mit Adresse, Öffnungszeiten und Route.`.slice(0, 300),
    pfad,
    klasse: 'kompakt',
    jsonld: [itemList(`${t.plural} in ${l.name}`, hofItems(geordnet))],
    krumen: [[l.name, `/${l.slug}/`], [t.plural, pfad]],
    inhalt: `
<section class="seitenkopf">
  <p class="hof-art typ-icon">${t.icon}</p>
  <h1>${esc(t.plural)} in ${esc(l.name)}</h1>
  <p>${zahl(liste.length)} ${esc(t.plural)} in ${plural(proK.size, 'Kreis', 'Kreisen')}${rund ? `, davon ${zahl(rund)} rund um die Uhr zugänglich` : ''}. Wähle deinen Kreis oder suche ${esc(akkusativ(t))} in deiner Nähe.</p>
  ${naeheSuche(NAEHE_FILTER(t), `${t.plural} in meiner Nähe`)}
  ${andere.length ? `<p class="typ-chips">${andere.map((x) => `<a href="${x.pfad}">${x.t.icon}${x.t.plural} <span>${zahl(x.liste.length)}</span></a>`).join('')}<a href="/${l.slug}/">Alle Hofläden <span>${zahl(l.anzahl)}</span></a></p>` : ''}
</section>
<nav class="abschnitt sprung-liste" aria-label="Kreise"><h2>${esc(t.plural)} nach Kreis</h2><ul class="kreis-liste">${kreisListe.map(([k, es]) => `<li><a href="#k-${k.slug}"><span>${esc(k.titel)}</span><span class="zahl">${zahl(es.length)}</span></a></li>`).join('')}</ul></nav>
${kreisListe.map(([k, es]) => { const tk = typKreis(t, k); return `<section class="abschnitt typ-land" id="k-${k.slug}"><h2>${tk ? `<a href="${tk.pfad}">${esc(t.plural)} ${esc(k.im)}</a>` : `${esc(t.plural)} ${esc(k.im)}`}</h2><ul class="eintrag-liste">${es.map((e) => `<li><a href="${e.pfad}">${esc(e.titelSeite)}</a> <span class="zahl">${esc(e.ortAnzeige)}</span></li>`).join('')}</ul></section>`; }).join('\n')}
<section class="abschnitt seo-text"><h2>${esc(t.name)} in ${esc(l.name)} finden</h2>${t.text.map((x) => `<p>${x}</p>`).join('')}
<p>Alle ${esc(t.plural)} in Deutschland findest du unter <a href="/${t.slug}/">${esc(t.plural)}</a>; alle Höfe in ${esc(l.name)} unter <a href="/${l.slug}/">Hofläden in ${esc(l.name)}</a>.</p></section>`,
  }));
}

// ---------- Alle Hofladen-Automaten (bundesweit) ----------
{
  const t = AUTOMATEN;
  const proLand = laender.map((l) => ({ l, liste: t.liste.filter((e) => e.k.land === l.code) })).filter((x) => x.liste.length);
  const rund = t.liste.filter((e) => istRund(wocheVon(e))).length;
  schreibe('/hofladen-automaten/', seite({
    titel: passend(`Hofladen-Automaten in der Nähe – ${zahl(t.liste.length)} Automaten in Deutschland`, `Hofladen-Automaten in der Nähe – ${zahl(t.liste.length)} Standorte`, `Hofladen-Automat in der Nähe – ${zahl(t.liste.length)} Automaten`),
    beschreibung: `Hofladen-Automat in der Nähe finden: ${zahl(t.liste.length)} Milchtankstellen, Eierautomaten und Regiomaten, ${zahl(rund)} davon rund um die Uhr (24/7) – mit Öffnungszeiten, Route und „jetzt geöffnet“.`,
    pfad: '/hofladen-automaten/',
    krumen: [['Hofladen-Automaten', '/hofladen-automaten/']],
    jsonld: [itemList('Hofladen-Automaten nach Bundesland', proLand.map(({ l }) => [`Hofladen-Automaten in ${l.name}`, landKat(t, l)?.pfad || `/${l.slug}/`]))],
    inhalt: `
<section class="seitenkopf">
  <p class="hof-art typ-icon">${t.icon}</p>
  <h1>Hofladen-Automaten in Deutschland</h1>
  <p>${zahl(t.liste.length)} Automaten mit Lebensmitteln vom Hof, ${zahl(rund)} davon rund um die Uhr zugänglich. Finde den nächsten – auch nur die, die gerade geöffnet sind.</p>
  ${naeheSuche({ typ: 'automat' }, 'Automaten in meiner Nähe')}
  <p class="typ-chips">${TYPEN.map((x) => `<a href="/${x.slug}/">${x.icon}${x.plural} <span>${zahl(x.liste.length)}</span></a>`).join('')}</p>
</section>
<section class="abschnitt seo-text">${t.text.map((x) => `<p>${x}</p>`).join('')}</section>
<section class="abschnitt"><h2>Hofladen-Automaten nach Bundesland</h2><ul class="kreis-liste">${proLand.map(({ l, liste }) => `<li><a href="${landKat(t, l)?.pfad || `/${l.slug}/`}"><span>${esc(l.name)}</span><span class="zahl">${zahl(liste.length)}</span></a></li>`).join('')}</ul></section>`,
  }));
}

// ---------- Angebot: Produkte vom Hof (bundesweit nach Bundesland und Kreis) ----------
// Produkt-Land-Seiten (/angebot/eier/brandenburg/): nur mit mindestens MIN_SEITE Einträgen
const ANGEBOT_LAND = new Map();
for (const kat of ANGEBOT_SEITEN) for (const l of laender) {
  const liste = l.kreise.flatMap((k) => (proKreis.get(k.code) || []).filter((e) => e.kat.includes(kat)));
  if (liste.length >= MIN_SEITE) ANGEBOT_LAND.set(`${kat}|${l.code}`, { kat, l, liste });
}
for (const { kat, l, liste } of ANGEBOT_LAND.values()) {
  const [titelKurz, mit] = ANGEBOT[kat];
  const pfad = `/angebot/${kat}/${l.slug}/`;
  const proK = new Map();
  for (const e of liste) { if (!proK.has(e.k)) proK.set(e.k, []); proK.get(e.k).push(e); }
  const kreisListe = [...proK].sort((a, b) => b[1].length - a[1].length || a[0].titel.localeCompare(b[0].titel, 'de'));
  const nHof = liste.filter((e) => e.typ === 'hofladen').length;
  const andere = ANGEBOT_SEITEN.filter((x) => x !== kat && ANGEBOT_LAND.has(`${x}|${l.code}`));
  schreibe(pfad, seite({
    titel: passend(`${titelKurz} in ${l.name} – ${zahl(liste.length)} Hofläden & Automaten mit ${mit}`, `${titelKurz} in ${l.name} – ${zahl(liste.length)} Höfe`, `${titelKurz} in ${l.name}`),
    beschreibung: `${titelKurz} in ${l.name}: ${zahl(nHof)} ${nHof === 1 ? 'Hofladen' : 'Hofläden'}${liste.length - nHof ? ` und ${zahl(liste.length - nHof)} Hofautomaten` : ''} mit ${mit} in ${plural(kreisListe.length, 'Kreis', 'Kreisen')} – mit Öffnungszeiten, Adresse und Route.`,
    pfad,
    krumen: [['Angebot', '/angebot/'], [titelKurz, `/angebot/${kat}/`], [l.name, pfad]],
    jsonld: [itemList(`${titelKurz} in ${l.name}`, liste.length <= 200 ? hofItems(liste) : kreisListe.map(([k]) => [k.titel, k.pfad]))],
    inhalt: `
<section class="seitenkopf">
  <h1>${esc(titelKurz)} in ${esc(l.name)}</h1>
  <p>${zahl(liste.length)} Hofläden und Hofautomaten mit ${esc(mit)} in ${plural(kreisListe.length, 'Kreis', 'Kreisen')}. Ein Klick auf den Kreis zeigt die Liste schon auf ${esc(KATEGORIEN[kat])} gefiltert.</p>
  ${naeheSuche({ produkt: kat }, `${KATEGORIEN[kat]} in meiner Nähe`)}
  ${andere.length ? `<p class="typ-chips">${andere.map((x) => `<a href="/angebot/${x}/${l.slug}/">${esc(KATEGORIEN[x])}</a>`).join('')}</p>` : ''}
</section>
${kreisListe.map(([k, es]) => `<section class="abschnitt typ-land" id="k-${k.slug}"><h2><a href="${k.pfad}#produkt=${kat}">${esc(titelKurz)} ${esc(k.im)}</a></h2><ul class="eintrag-liste">${es.map((e) => `<li><a href="${e.pfad}">${esc(e.titelSeite)}</a> <span class="zahl">${esc(e.ortAnzeige)}</span></li>`).join('')}</ul></section>`).join('\n')}
<section class="abschnitt seo-text"><p>Welche Höfe ${esc(mit)} anbieten, leiten wir aus den Angaben in OpenStreetMap, aus offenen Quellen und aus dem Namen des Hofs ab – das Sortiment kann je nach Saison abweichen. Alle Höfe in ${esc(l.name)} findest du auf der <a href="/${l.slug}/">Seite für ${esc(l.name)}</a>.</p></section>`,
  }));
}
for (const kat of ANGEBOT_SEITEN) {
  const [titelKurz, mit] = ANGEBOT[kat];
  const alle = eintraege.filter((e) => e.kat.includes(kat));
  const nHof = alle.filter((e) => e.typ === 'hofladen').length;
  const proLand = laender.map((l) => ({ l, ks: l.kreise.map((k) => [k, (proKreis.get(k.code) || []).filter((e) => e.kat.includes(kat)).length]).filter(([, n]) => n) })).filter((x) => x.ks.length);
  const pfad = `/angebot/${kat}/`;
  schreibe(pfad, seite({
    titel: passend(`${titelKurz} – ${zahl(alle.length)} Hofläden & Automaten mit ${mit}`, `${titelKurz} – ${zahl(alle.length)} Höfe in Deutschland`, titelKurz),
    beschreibung: `${titelKurz} in deiner Nähe: ${zahl(nHof)} Hofläden und ${zahl(alle.length - nHof)} Hofautomaten mit ${mit} – nach Bundesland und Landkreis, mit Öffnungszeiten und Route.`,
    pfad,
    krumen: [['Angebot', '/angebot/'], [titelKurz, pfad]],
    jsonld: [itemList(`${titelKurz} nach Kreis`, proLand.flatMap(({ ks }) => ks.map(([k]) => [k.titel, k.pfad])))],
    inhalt: `
<section class="seitenkopf">
  <h1>${esc(titelKurz)}</h1>
  <p>${zahl(alle.length)} Hofläden und Hofautomaten mit ${esc(mit)}${alle.length - nHof ? `, davon ${zahl(alle.length - nHof)} Automaten` : ''}. Wähle deinen Kreis – die Liste ist dann schon auf ${esc(KATEGORIEN[kat])} gefiltert.</p>
  ${naeheSuche({ produkt: kat }, `${KATEGORIEN[kat]} in meiner Nähe`)}
  <p class="typ-chips">${ANGEBOT_SEITEN.filter((x) => x !== kat).map((x) => `<a href="/angebot/${x}/">${esc(KATEGORIEN[x])}</a>`).join('')}</p>
</section>
<section class="abschnitt seo-text"><p>Welche Höfe ${esc(mit)} anbieten, leiten wir aus den Angaben in OpenStreetMap und aus dem Namen des Hofs ab – das Sortiment kann je nach Saison abweichen.${['obst', 'gemuese', 'kartoffeln'].includes(kat) ? ' Was gerade Saison hat, zeigt der <a href="/saisonkalender/">Saisonkalender</a>.' : ''}</p></section>
<nav class="abschnitt sprung-liste" aria-label="Bundesländer"><h2>Nach Bundesland</h2><ul class="kreis-liste">${proLand.map(({ l, ks }) => `<li><a href="#${l.slug}"><span>${esc(l.name)}</span><span class="zahl">${zahl(ks.reduce((x, [, n]) => x + n, 0))}</span></a></li>`).join('')}</ul></nav>
${proLand.map(({ l, ks }) => `<section class="abschnitt" id="${l.slug}"><h2>${ANGEBOT_LAND.has(`${kat}|${l.code}`) ? `<a href="/angebot/${kat}/${l.slug}/">${esc(titelKurz)} in ${esc(l.name)}</a>` : `${esc(titelKurz)} in ${esc(l.name)}`}</h2><ul class="kreis-liste">${ks.sort((a, b) => b[1] - a[1] || a[0].titel.localeCompare(b[0].titel, 'de')).map(([k, n]) => `<li><a href="${k.pfad}#produkt=${kat}"><span>${esc(k.titel)}</span><span class="zahl">${zahl(n)}</span></a></li>`).join('')}</ul></section>`).join('\n')}`,
  }));
}
schreibe('/angebot/', seite({
  titel: 'Angebot im Hofladen – Eier, Milch, Fleisch, Obst & Gemüse',
  beschreibung: 'Was gibt es im Hofladen? Höfe mit Eiern, Milch, Käse, Fleisch und Wurst, Obst, Gemüse, Kartoffeln, Honig und mehr – nach Angebot sortiert, bundesweit.',
  pfad: '/angebot/',
  krumen: [['Angebot', '/angebot/']],
  jsonld: [itemList('Angebot vom Hof', ANGEBOT_SEITEN.map((k) => [ANGEBOT[k][0], `/angebot/${k}/`]))],
  inhalt: `
<section class="seitenkopf">
  <h1>Angebot vom Hof</h1>
  <p>Finde Hofläden und Automaten nach dem, was du suchst.</p>
</section>
<section class="abschnitt"><ul class="kreis-liste">${ANGEBOT_SEITEN.map((k) => `<li><a href="/angebot/${k}/"><span>${esc(ANGEBOT[k][0])}</span><span class="zahl">${zahl(eintraege.filter((e) => e.kat.includes(k)).length)}</span></a></li>`).join('')}</ul></section>`,
}));
for (const k of ANGEBOT_SEITEN) KATEGORIE_PFADE.add(`/angebot/${k}/`);

// ---------- Übersichten: sonntags geöffnet, Bio ----------
for (const u of [
  { pfad: '/sonntags-geoeffnet/', filter: 'sonntag', test: (e) => e.sonntag,
    titel: (n) => `Hofladen sonntags geöffnet – ${zahl(n)} Hofläden & Automaten`,
    h1: 'Hofläden, die sonntags geöffnet haben',
    beschreibung: (n, h) => `Hofladen sonntags geöffnet: ${zahl(h)} Hofläden und ${zahl(n - h)} Hofautomaten mit Öffnungszeiten am Sonntag – nach Bundesland und Landkreis. Mit Adresse und Route.`,
    text: (n, h) => [`Die meisten Hofläden haben sonntags geschlossen. ${zahl(h)} Hofläden in unserem Verzeichnis haben laut Öffnungszeiten auch am Sonntag geöffnet – oft nur vormittags oder in der Saison, etwa zur Spargel- oder Erdbeerzeit. Dazu kommen ${zahl(n - h)} Milchtankstellen, Eierautomaten und Regiomaten, die sonntags zugänglich sind, viele davon rund um die Uhr.`,
      'Wähle unten deinen Landkreis: Die Liste ist dann schon auf „Sonntags geöffnet“ gefiltert. Öffnungszeiten können sich ändern, besonders an Feiertagen und außerhalb der Saison – im Zweifel vorher anrufen.'] },
  { pfad: '/bio-hofladen/', filter: 'bio', test: (e) => e.bio,
    titel: (n) => `Bio-Hofladen in der Nähe – ${zahl(n)} Bio-Höfe in Deutschland`,
    h1: 'Bio-Hofläden in Deutschland',
    beschreibung: (n, h) => `Bio-Hofladen in der Nähe finden: ${zahl(n)} Hofläden und Hofautomaten mit Bio-Angebot – nach Bundesland und Landkreis, mit Öffnungszeiten und Route.`,
    text: (n, h) => [`${zahl(n)} Einträge sind als Bio gekennzeichnet, darunter ${zahl(h)} Hofläden. Die Angabe stammt aus OpenStreetMap: Dort können Höfe vermerken, dass sie ausschließlich oder teilweise Bio-Produkte verkaufen.`,
      'Ob ein Betrieb zertifiziert ist, erkennst du am EU-Bio-Logo und an der Öko-Kontrollstellennummer (z. B. DE-ÖKO-006) auf der Ware oder am Hof. Wähle unten deinen Landkreis – die Liste ist dann schon auf Bio gefiltert.'] },
]) {
  const alle = eintraege.filter(u.test);
  const nHof = alle.filter((e) => e.typ === 'hofladen').length;
  const proLand = laender.map((l) => ({ l, ks: l.kreise.map((k) => [k, (proKreis.get(k.code) || []).filter(u.test).length]).filter(([, n]) => n) }))
    .filter((x) => x.ks.length);
  const andere = u.filter === 'bio' ? '<a href="/sonntags-geoeffnet/">Hofläden, die sonntags geöffnet haben</a>' : '<a href="/bio-hofladen/">Bio-Hofläden</a>';
  schreibe(u.pfad, seite({
    titel: u.titel(alle.length),
    beschreibung: u.beschreibung(alle.length, nHof),
    pfad: u.pfad,
    jsonld: [itemList(u.h1, proLand.flatMap(({ ks }) => ks.map(([k]) => [k.titel, k.pfad])))],
    krumen: [[u.h1, u.pfad]],
    inhalt: `
<section class="seitenkopf">
  <h1>${esc(u.h1)}</h1>
  <p>${plural(alle.length, 'Eintrag', 'Einträge')} in ${plural(proLand.length, 'Bundesland', 'Bundesländern')}, davon ${plural(nHof, 'Hofladen', 'Hofläden')}.</p>
  <form class="kopf-suche gross-suche" action="/suche" method="get"><label class="sr" for="ueb-q">Postleitzahl, Ort oder Name des Hofs</label><input id="ueb-q" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required><button type="submit">Suchen</button></form>
  ${naeheSuche(u.filter === 'bio' ? { bio: 1 } : { sonntag: 1 }, u.filter === 'bio' ? 'Bio-Höfe in meiner Nähe' : 'Sonntags offene in meiner Nähe')}
</section>
<section class="abschnitt seo-text">${u.text(alle.length, nHof).map((x) => `<p>${x}</p>`).join('')}<p>Auch interessant: ${andere}, die <a href="/karte/">Hofladen-Karte</a> und der <a href="/saisonkalender/">Saisonkalender</a>.</p></section>
<nav class="abschnitt sprung-liste" aria-label="Bundesländer"><h2>Nach Bundesland</h2><ul class="kreis-liste">${proLand.map(({ l, ks }) => `<li><a href="#${l.slug}"><span>${esc(l.name)}</span><span class="zahl">${zahl(ks.reduce((x, [, n]) => x + n, 0))}</span></a></li>`).join('')}</ul></nav>
${proLand.map(({ l, ks }) => { const lk = u.filter === 'bio' && landKat(BIO, l);
  return `<section class="abschnitt" id="${l.slug}"><h2>${lk ? `<a href="${lk.pfad}">${esc(u.h1.replace(' in Deutschland', ''))} in ${esc(l.name)}</a>` : `${esc(u.h1.replace(' in Deutschland', ''))} in ${esc(l.name)}`}</h2><ul class="kreis-liste">${ks.sort((a, b) => b[1] - a[1] || a[0].titel.localeCompare(b[0].titel, 'de')).map(([k, n]) => { const tk = u.filter === 'bio' && typKreis(BIO, k);
    return `<li><a href="${tk ? tk.pfad : `${k.pfad}#filter=${u.filter}`}"><span>${esc(k.titel)}</span><span class="zahl">${zahl(n)}</span></a></li>`; }).join('')}</ul></section>`; }).join('\n')}`,
  }));
}

// ---------- Seiten "Hofläden in <Ort> und Umgebung" (Ortsseiten und kreisfreie Städte) ----------
// Eine Zählung für alle Angaben auf Orts- und Umgebungsseiten: Liste = alle Einträge im Umkreis R (25 km, bei
// wenigen Treffern 50 km), höchstens 150, eigene Einträge des Orts immer dabei. Titel, Intro, Filter und Überblick nutzen sie.
// höchstens 150 Einträge in der Liste
function umkreisZahlen(z) {
  const n = (r) => z.umkreis.filter(([d]) => d <= r).length;
  const [n10, n25, n50] = UMKREISE.map(n);
  const R = n25 >= 10 ? 25 : 50;
  const eigen = new Set(z.eigene);
  const imR = z.umkreis.filter(([d, e]) => d <= R || eigen.has(e));
  const auswahl = imR.filter(([, e]) => eigen.has(e)).concat(imR.filter(([, e]) => !eigen.has(e)).slice(0, Math.max(0, 150 - z.eigene.length)))
    .sort((a, b) => a[0] - b[0]);
  const liste = auswahl.map(([, e]) => e);
  const hof = liste.filter((e) => e.typ === 'hofladen').length, aut = liste.length - hof;
  const gekappt = auswahl.length < imR.length;
  const satz = `${gekappt ? `Die ${zahl(liste.length)} nächsten von ${zahl(imR.length)} Einträgen` : `${zahl(liste.length)} ${liste.length === 1 ? 'Eintrag' : 'Einträge'}`} im Umkreis von ${R} km${hof && aut ? `, davon ${plural(hof, 'Hofladen', 'Hofläden')} und ${zahl(aut)} ${aut === 1 ? 'Automat' : 'Automaten'}` : ''}.`;
  return { auswahl, liste, R, n10, n25, n50, hof, aut, satz, gekappt, gesamt: imR.length };
}

function umgebungsSeite(z, { extraOben = '', extraUnten = '', krumen, regionProfil = null }) {
  const { name, k } = z;
  const zl = umkreisZahlen(z);
  const { auswahl, liste, R, n10, n50 } = zl;
  const wo = `in ${name} und Umgebung`;
  const h1 = `Hofläden in ${name} und Umgebung`;
  const nEigen = z.eigene.length;
  const noindex = !umgebungIndexiert(z);
  if (!noindex && !regionProfil) kandidat({ pfad: z.pfad, art: z.kreisSeite ? 'Stadt' : 'Ort', titel: `Hofläden in ${z.titelName || name} und Umgebung`, n: nEigen });
  const ueber = UEBERDECKT.get(z);
  const tn = z.titelName || name, nT = zahl(zl.gesamt);
  const titel = passend(`Hofladen ${tn} und Umgebung – ${nT} Höfe mit Öffnungszeiten`, `Hofladen ${tn} und Umgebung – ${nT} Höfe`, `Hofladen ${tn} und Umgebung`, `Hofladen ${tn}`);
  // Snippet: der nächste Hof mit Namen (konkret statt nur Zahlen), dann Menge, Angebot und Sonntag
  const beschreibung = (() => {
    const [d0, e0] = auswahl[0] || [];
    const naechst = e0 ? `Am nächsten: ${e0.titel}${e0.ortAnzeige.startsWith(name) || e0.titel.includes(e0.ortAnzeige) ? '' : ` in ${e0.ortAnzeige}`}${d0 < 0.05 ? '' : `, ${km(d0)}`}.` : '';
    const ang = angebotHaeufig(liste);
    const so = liste.filter((e) => e.sonntag).length;
    return [`Hofläden in ${name} und Umgebung: ${zahl(zl.gesamt)} im Umkreis von ${R} km${nEigen ? `, ${zahl(nEigen)} direkt im Ort` : ''}.`,
      ang.length ? `Oft im Angebot: ${nennung(ang)}.` : '',
      so >= 2 ? `${zahl(so)} auch sonntags geöffnet.` : '',
      'Mit Öffnungszeiten und Route.',
      // Letzter Satz bleibt beim Kürzen erhalten: der nächste Hof mit Namen
      naechst].filter(Boolean).join(' ');
  })();
  // FAQ aus echten Zahlen
  const automatNah = z.umkreis.find(([, e]) => e.typ === 'automat');
  const f = [
    [`Wie viele Hofläden gibt es in ${name}?`, `${nEigen ? `Direkt in ${esc(name)} sind ${zaehlung(z.eigene)} eingetragen.` : `Direkt in ${esc(name)} ist bisher kein Hofladen eingetragen.`} ${esc(zl.satz)} Bis 10 km sind es ${zahl(n10)}, bis 50 km ${zahl(n50)} Hofläden und Hofautomaten.`],
    [`Welcher Hofladen liegt am nächsten an ${name}?`, `${link(z.umkreis[0][1])} in ${esc(z.umkreis[0][1].ortAnzeige)}, etwa ${km(z.umkreis[0][0])} vom Ortszentrum entfernt.${z.umkreis[1] ? ` Danach folgen ${nennung(z.umkreis.slice(1, 3).map(([d, e]) => `${link(e)} (${km(d)})`))}.` : ''}`],
    ...(automatNah ? [[`Gibt es einen Hofautomaten in der Nähe von ${name}?`, `Ja. Der nächste ist ${link(automatNah[1])} (${esc(automatNah[1].art)}) in ${esc(automatNah[1].ortAnzeige)}, etwa ${km(automatNah[0])} entfernt.`]] : []),
    ...fragen(liste, wo, z).filter(([q]) => !q.startsWith('Wo finde ich')),
  ];
  const faq = fragenHtml(f, `Häufige Fragen: Hofläden in ${name}`);
  const inhalt = `
<section class="seitenkopf">
  <h1>${esc(h1)}</h1>
  <p>${esc(zl.satz)} ${nEigen ? `Direkt in ${esc(name)}: ${zaehlung(z.eigene)}.` : `Direkt in ${esc(name)} ist noch kein Hof eingetragen${auswahl[0] ? ` – der nächste ist ${km(auswahl[0][0])} entfernt: <a href="${auswahl[0][1].pfad}">${esc(auswahl[0][1].titelSeite)}</a> in ${esc(auswahl[0][1].ortAnzeige)}` : ''}. Kennst du einen Hof in ${esc(name)}? <a href="/mitmachen/">Jetzt eintragen</a>.`} Sortiert nach Entfernung vom Ortszentrum, mit Öffnungszeiten und Route.</p>${ueber ? `
  <p>Fast dieselben Höfe zeigt auch die Seite <a href="${ueber.pfad}">Hofläden in ${esc(ueber.titelName || ueber.name)} und Umgebung</a>.</p>` : ''}
  ${typKreisLinks(k).length ? `<p class="typ-chips">${typKreisLinks(k).map((x) => `<a href="${x.pfad}">${x.t.icon}${x.t.plural} ${esc(k.im)} <span>${zahl(x.liste.length)}</span></a>`).join('')}</p>` : ''}
  <p class="plz-hinweis" data-plz-hinweis hidden></p>
</section>
${extraOben}
${filterLeiste(liste, { umkreis: UMKREISE.filter((r) => r <= R).map((r) => [r, auswahl.filter(([d]) => d <= r).length]) })}
<div class="geteilt">
  <div class="liste" data-liste>
    <h2 class="sr">Einträge</h2>
    ${auswahl.map(([d, e]) => karteHtml(kartenDaten(e, Math.round(d * 10) / 10))).join('\n    ')}
    <p class="leer-filter" data-leer-filter hidden>Keine Einträge passen zu deinem Filter. <button type="button" class="link" data-filter-zuruecksetzen>Filter zurücksetzen</button></p>
    <section class="umgebung" data-umgebung hidden><h2>Ganz in der Nähe</h2><div data-umgebung-liste></div></section>
  </div>
  <aside class="karten-spalte">${kartenPanel({ titel: `Karte: ${h1}` })}</aside>
</div>
${regionProfil ? regionHtml(regionProfil) : ''}
${saisonLokal(liste, wo, z.pfad)}
<section class="abschnitt seo-text"><h2>Hofladen ${esc(name)}: Überblick</h2>${gebietsText(liste, `im Umkreis von ${R} km um ${name}`, { anker: k.landSlug })}${typLinks(z.eigene, k.landSlug, k)}
<p>${z.kreisSeite ? '' : `Alle Einträge im Kreis findest du unter <a href="${k.pfad}">Hofläden ${esc(k.im)}</a>. `}Mehr aus der Region: <a href="/${k.landSlug}/">Hofläden in ${esc(k.landName)}</a>.</p>${z.kreisSeite ? '' : regionTeaser(k)}</section>
${faq.html}
${ortListe(naheOrte(z.lat, z.lon, 9, new Set(ortSeiten.filter((o) => o.pfad === z.pfad))), `Hofläden in Orten in der Nähe von ${name}`)}
${extraUnten}
${regionProfil ? quellenHtml(regionProfil) : ''}`;
  return seite({ titel, beschreibung, pfad: z.pfad, klasse: 'kreis', krumen, noindex,
    jsonld: [itemList(h1, hofItems(liste)), ...faq.ld], inhalt });
}

for (const o of ortSeiten) {
  const k = o.k;
  const andereOrte = [...ORTE.get(k.code).values()].filter((x) => x !== o && x.eigen).sort((a, b) => b.liste.length - a.liste.length || a.ort.localeCompare(b.ort, 'de')).slice(0, 12);
  schreibe(o.pfad, umgebungsSeite(o.umgebung, {
    krumen: [[k.landName, `/${k.landSlug}/`], [k.titel, k.pfad], [o.ort, o.pfad]],
    extraUnten: andereOrte.length ? `<section class="abschnitt"><h2>Hofläden in anderen Orten ${esc(k.im)}</h2><ul class="kreis-liste">${andereOrte.map((x) => `<li><a href="${x.pfad}"><span>${esc(x.ort)}</span><span class="zahl">${x.liste.length ? zahl(x.liste.length) : ''}</span></a></li>`).join('')}</ul></section>` : '',
  }), umgebungIndexiert(o.umgebung));
}

export { ANGEBOT_LAND, NAEHE_FILTER, naeheSuche, umgebungsSeite, umkreisZahlen, SEITENTEXT_KANDIDATEN };
