// Build, Teil „html“: HTML-Helfer und Seitenrahmen (seite(), Karte, Filterleiste).
// Wird von scripts/build.mjs in fester Reihenfolge geladen; nutzt die Ergebnisse der vorherigen Teile.
import { readFileSync, existsSync } from 'node:fs';
import { seitentext, seitentextOben, faqZusammenfuehren } from '../seitentexte.mjs';
import { join } from 'node:path';
import { domainToUnicode } from 'node:url';
import { createHash } from 'node:crypto';
import { RATGEBER } from '../ratgeber.mjs';
import { esc } from '../../static/helfer.js';
import { titelMitMarke, kuerzeBeschreibung } from '../pixel.mjs';
import { KATEGORIEN, ICON, PRODUKT_SPRITE, produktIcon } from '../../static/karte.js';
import { BUILD_DATUM, ICON_VERSION, KACHELN, ROOT, VERSION, cfg, impressum, istRund, laender, mitKindern, offen, plz, wocheVon } from './daten.mjs';

// ---------- HTML-Helfer ----------
// data/analytics.json: Google-Dienste (IDs sind öffentlich). "aktiv": false schaltet Tag Manager, Analytics und das
// AdSense-Werbeskript ab – damit entfällt auch der Einwilligungs-Hinweis. Die IDs bleiben stehen; AdSense-Bestätigung
// (Meta-Tag, ads.txt) bleibt, sie baut keine Verbindung zu Google auf. Besucher zählt der Worker cookielos (src/besuche.js).
const ANALYTICS = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'data', 'analytics.json'), 'utf8')); } catch { return {}; } })();
const GOOGLE_AKTIV = ANALYTICS.aktiv !== false;
const GA_ID = GOOGLE_AKTIV ? ANALYTICS.ga4 || '' : '';
if (GA_ID && !/^G-[A-Z0-9]+$/.test(GA_ID)) throw new Error(`data/analytics.json: ungültige GA4-Mess-ID ${GA_ID}`);
const ADSENSE_KONTO = ANALYTICS.adsense || '';
if (ADSENSE_KONTO && !/^ca-pub-\d{16}$/.test(ADSENSE_KONTO)) throw new Error(`data/analytics.json: ungültige AdSense-ID ${ADSENSE_KONTO}`);
const ADSENSE_ID = GOOGLE_AKTIV ? ADSENSE_KONTO : ''; // Werbeskript (nur nach Einwilligung)
const GTM_ID = GOOGLE_AKTIV ? ANALYTICS.gtm || '' : '';
if (GTM_ID && !/^GTM-[A-Z0-9]+$/.test(GTM_ID)) throw new Error(`data/analytics.json: ungültige GTM-Container-ID ${GTM_ID}`);
// Fest eingebundener Tag-Manager-Code (auf Jonas’ Wunsch, damit Google ihn findet): Consent Mode steht auf „denied“,
// eine gespeicherte Zustimmung (localStorage statistik/werbung) wird sofort weitergegeben. Cookies erst nach Zustimmung.
const GTM_KOPF = GTM_ID ? `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});
gtag('set','ads_data_redaction',true);gtag('set','url_passthrough',false);
try{var e=localStorage;if(e.getItem('statistik')==='ja')gtag('consent','update',{analytics_storage:'granted'});if(e.getItem('werbung')==='ja')gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});}catch(x){}
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');</script>
` : '';
const STATISTIK_AKTIV = Boolean(GA_ID || GTM_ID); // Analytics direkt (GA4) oder über den Tag Manager
const EINWILLIGUNG = Boolean(STATISTIK_AKTIV || ADSENSE_ID);
// Eigene Besucherstatistik (src/besuche.js): meldet Pfad und Herkunft einmal pro Anzeige an den eigenen Server.
// Vorgerenderte Seiten (Google lädt Suchtreffer vorab) zählen erst, wenn sie wirklich angezeigt werden. Keine Cookies.
const BESUCH_SKRIPT = `<script>(function(){function z(){try{navigator.sendBeacon('/api/besuch',JSON.stringify({p:location.pathname,r:document.referrer}))}catch(e){}}if(document.prerendering)document.addEventListener('prerenderingchange',z,{once:true});else z()})()</script>\n`;
// Pfade der Kategorieseiten (werden bei den Kategorien gefüllt; seitenTyp() braucht sie)
const KATEGORIE_PFADE = new Set();
const telHref = (t) => 'tel:' + t.replace(/[^\d+]/g, '').replace(/^00/, '+');
const kurz = (u) => { let t = u; try { const x = new URL(u); t = domainToUnicode(x.hostname) + x.pathname + x.search; } catch {} return t.replace(/^www\./, '').replace(/\/$/, ''); };
const zahl = (n) => n.toLocaleString('de-DE');
const plural = (n, s, p) => `${zahl(n)} ${n === 1 ? s : p}`;
const KARTENZAHLUNG = ['girocard', 'kreditkarte', 'kontaktlos'];
const KAT_CODES_KARTE = Object.keys(KATEGORIEN);
const kartenDaten = (e, km) => ({ pfad: e.pfad, slug: e.slug, titel: e.titel, art: e.art, typ: e.typ, adresse: e.adresse, land: e.k?.land,
  karte: !!e.zahlung?.some((z) => KARTENZAHLUNG.includes(z)),
  oh: e.oeffnungszeiten, ohText: e.oeffnungszeiten_text, telefon: e.telefon, website: e.website, kat: e.kat,
  urlaub: e.urlaub?.length ? e.urlaub.map((u) => `${u.von}/${u.bis}`).join(' ') : null,
  lat: e.lat, lon: e.lon, bio: e.bio, verband: e.verband?.[0] || null, kinder: mitKindern(e), oepnv: !!e.haltestelle, km });

const SUCHFELD = 'type="search" maxlength="60" autocomplete="off" list="orte-vorschlaege" enterkeyhint="search"';
const LOGO = `<svg class="logo-mark" viewBox="0 0 64 64" width="34" height="34" aria-hidden="true"><path d="M32 3C19 3 8.5 13.3 8.5 26.2 8.5 43.4 32 61 32 61s23.5-17.6 23.5-34.8C55.5 13.3 45 3 32 3z" fill="#F4C430"/><g fill="#173B2C"><rect x="30.4" y="21" width="3.2" height="27" rx="1.6"/><ellipse cx="32" cy="15.6" rx="3.5" ry="6"/><ellipse cx="25.9" cy="25.4" rx="3.2" ry="5.8" transform="rotate(-38 25.9 25.4)"/><ellipse cx="38.1" cy="25.4" rx="3.2" ry="5.8" transform="rotate(38 38.1 25.4)"/><ellipse cx="25.9" cy="35.4" rx="3.2" ry="5.8" transform="rotate(-38 25.9 35.4)"/><ellipse cx="38.1" cy="35.4" rx="3.2" ry="5.8" transform="rotate(38 38.1 35.4)"/></g></svg>`;

// Seitentyp für die Nutzungsstatistik
const NATIONALE_KATEGORIEN = new Set(['/milchtankstelle/', '/eierautomat/', '/regiomat/', '/hofladen-automaten/', '/bio-hofladen/', '/sonntags-geoeffnet/']);
function seitenTyp(p) {
  if (p === '/') return 'start';
  if (p.startsWith('/hof/')) return 'hof';
  if (p.startsWith('/saisonkalender/')) return 'saison';
  if (p.startsWith('/angebot/') || NATIONALE_KATEGORIEN.has(p) || KATEGORIE_PFADE.has(p)) return 'kategorie';
  if (/^\/[^/]+\/[^/]+\/[^/]+\/$/.test(p)) return 'ort';
  if (/^\/[^/]+\/([^/]+\/)?$/.test(p) && laender.some((l) => p.startsWith(`/${l.slug}/`))) return 'kreis';
  return 'sonstige';
}
// Inhalts-Hash je Seite (ohne Kopf/Fuß/Build-Version) – daraus entsteht das echte lastmod der Sitemap
const SEITEN_HASH = new Map();
const hash = (x) => createHash('sha1').update(x).digest('base64url').slice(0, 10);
// Ratgeber-Artikel, die auf eine Seite verweisen, werden dort unten verlinkt
const RATGEBER_FUER = new Map();
for (const a of RATGEBER) for (const [p] of a.links) RATGEBER_FUER.set(p, [...(RATGEBER_FUER.get(p) || []), a]);
const ratgeberHinweis = (pfad) => {
  const as = RATGEBER_FUER.get(pfad);
  return as ? `<aside class="abschnitt ratgeber-hinweis" aria-label="Ratgeber"><h2>Aus dem Ratgeber</h2><ul>${as.map((a) => `<li><a href="/ratgeber/${a.slug}/">${esc(a.titel)}</a></li>`).join('')}</ul></aside>` : '';
};
// Interne Links mit Parametern (z. B. /fuer-hoefe/?eintrag=…) sind Funktionen, keine Seiten: nofollow.
// Ausnahme: Bearbeiten-Links /mitmachen/?… bleiben folgbar (Ziel ist noindex mit Canonical auf /mitmachen/).
const nofollowParameter = (html) => html.replace(/<a ([^>]*?)href="(\/[^"#]*\?[^"]*)"([^>]*)>/g, (m, vor, href, nach) => /\brel=/.test(vor + nach) || href.startsWith('/mitmachen/') ? m : `<a ${vor}href="${href}" rel="nofollow"${nach}>`);
// Bestätigung für Google Search Console / Bing Webmaster Tools: site.config.json → verifizierung
// oder Umgebungsvariablen GOOGLE_SITE_VERIFICATION / BING_SITE_VERIFICATION (nur auf der Startseite)
const VERIFIZIERUNG = [['google-site-verification', process.env.GOOGLE_SITE_VERIFICATION || cfg.verifizierung?.google],
  ['msvalidate.01', process.env.BING_SITE_VERIFICATION || cfg.verifizierung?.bing]]
  .filter(([, v]) => v).map(([n, v]) => `<meta name="${n}" content="${esc(v)}">\n`).join('');
const SEITENTEXTE = existsSync(join(ROOT, 'data', 'seitentexte.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'seitentexte.json'), 'utf8')) : {};
const SEITENTEXT_GENUTZT = new Set(); // Pfade, deren Text auf einer gebauten Seite steht (Prüfung in abschluss.mjs)
// Listen-Seiten: ItemList bekommt eine @id und eine CollectionPage, die auf sie zeigt
function mitSammlung(jsonld, { titel, beschreibung, pfad }) {
  const liste = jsonld.find((j) => j['@type'] === 'ItemList');
  if (!liste || jsonld.some((j) => j['@type'] === 'CollectionPage')) return jsonld;
  const url = cfg.domain + pfad;
  return [{ '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': `${url}#seite`, url, name: titel.replace(/\s*\|\s*Hofladenliste\s*$/, ''),
    description: kuerzeBeschreibung(beschreibung), inLanguage: 'de-DE', isPartOf: { '@id': `${cfg.domain}/#website` }, mainEntity: { '@id': `${url}#liste` } },
  ...jsonld.map((j) => (j === liste ? { ...j, '@id': `${url}#liste` } : j))];
}
function seite({ titel, beschreibung, pfad, inhalt, noindex = false, jsonld = [], krumen = [], klasse = '', kopfSuche = true, bild = null }) {
  inhalt += ratgeberHinweis(pfad);
  // Gepflegte Texte je Seite (data/seitentexte.json): Einleitung, Abschnitte, FAQ – nur wenn vorhanden
  const st = seitentext(SEITENTEXTE[pfad], pfad);
  if (st) { inhalt += st.html; jsonld = faqZusammenfuehren(jsonld, st.faq); }
  // Kurztext "oben": direkt unter Überschrift und Zahlen, vor dem Hinweis zur PLZ (sonst gleich nach der H1)
  const oben = seitentextOben(SEITENTEXTE[pfad]);
  if (oben) { inhalt = inhalt.includes('<p class="plz-hinweis"') ? inhalt.replace('<p class="plz-hinweis"', `${oben}\n  <p class="plz-hinweis"`) : inhalt.replace('</h1>', `</h1>${oben}`); SEITENTEXT_GENUTZT.add(pfad); }
  if (SEITENTEXTE[pfad]) SEITENTEXT_GENUTZT.add(pfad);
  jsonld = mitSammlung(jsonld, { titel, beschreibung, pfad });
  SEITEN_HASH.set(pfad, hash([titel, beschreibung, noindex, JSON.stringify(jsonld), JSON.stringify(krumen), inhalt.replace(/\?v=[a-z0-9]+/g, '')].join('\u0000')));
  const url = cfg.domain + pfad;
  const bc = krumen.length ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [['Start', '/'], ...krumen].map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: cfg.domain + p })) }] : [];
  return nofollowParameter(`<!doctype html>
<html lang="de"${GA_ID ? ` data-ga="${GA_ID}"` : ''}${GTM_ID ? ` data-gtm="${GTM_ID}"` : ''}${ADSENSE_ID ? ` data-ads="${ADSENSE_ID}"` : ''}${KACHELN ? ` data-kacheln="${KACHELN.version}" data-kacheln-z="${KACHELN.maxzoom || 14}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${BESUCH_SKRIPT}${GTM_KOPF}<title>${esc(titelMitMarke(titel))}</title>
<meta name="description" content="${esc(kuerzeBeschreibung(beschreibung))}">
<link rel="canonical" href="${esc(url)}">
${noindex ? '<meta name="robots" content="noindex, follow">\n' : ''}<meta property="og:title" content="${esc(titel.replace(/\s*\|\s*Hofladenliste\s*$/, ''))}">
<meta property="og:description" content="${esc(kuerzeBeschreibung(beschreibung))}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta name="theme-color" content="#173B2C">${ADSENSE_KONTO ? `\n<meta name="google-adsense-account" content="${ADSENSE_KONTO}">` : ''}
<link rel="icon" href="/favicon.ico?v=${ICON_VERSION}" sizes="48x48">
<link rel="icon" href="/favicon.svg?v=${ICON_VERSION}" type="image/svg+xml">
<link rel="icon" href="/favicon-96.png?v=${ICON_VERSION}" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${ICON_VERSION}">
<link rel="manifest" href="/site.webmanifest">
${bild ? `<meta property="og:image" content="${esc(cfg.domain + bild)}">` : `<meta property="og:image" content="${cfg.domain}/og-bild.png?v=${ICON_VERSION}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">`}
<meta property="og:site_name" content="Hofladenliste">
<meta name="twitter:card" content="summary_large_image">
${pfad === '/' ? VERIFIZIERUNG : ''}
<link rel="preload" href="/fonts/zilla-slab-bold.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="/fonts/atkinson-next.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="/style.css?v=${VERSION}">
${[...bc, ...jsonld].map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body class="${klasse}" data-seite="${seitenTyp(pfad)}">
${PRODUKT_SPRITE}
<a class="sprung" href="#inhalt">Zum Inhalt</a>
<header class="kopf"><div class="kopf-innen">
  <a class="logo" href="/">${LOGO}<span>Hofladenliste</span></a>
  <nav class="kopf-nav" aria-label="Hauptnavigation">
    <a href="/karte/"${pfad === '/karte/' ? ' aria-current="page"' : ''}>Karte</a>
    <a href="/saisonkalender/"${pfad === '/saisonkalender/' ? ' aria-current="page"' : ''}>Saisonkalender</a>
    <a href="/merkliste/"${pfad === '/merkliste/' ? ' aria-current="page"' : ''}>${ICON.herz}Merkliste<span class="merk-zahl" hidden></span></a>
    <a class="nav-optional" href="/mitmachen/"${pfad === '/mitmachen/' ? ' aria-current="page"' : ''}>Hof eintragen</a>
  </nav>
  ${kopfSuche ? `<form class="kopf-suche" action="/suche" method="get" role="search">
    <label class="sr" for="kopf-plz">Postleitzahl, Ort oder Name des Hofs</label>
    <input id="kopf-plz" name="q" ${SUCHFELD} placeholder="PLZ, Ort oder Hof" required>
    <button type="submit">Suchen</button>
  </form>` : ''}
</div></header>
${krumen.length ? `<nav class="krumen" aria-label="Brotkrümel"><a href="/">Start</a>${krumen.map(([n, p], i) => i === krumen.length - 1 ? `<span aria-current="page">${esc(n)}</span>` : `<a href="${esc(p)}">${esc(n)}</a>`).join('')}</nav>` : ''}
<main id="inhalt">
${inhalt}
</main>
<footer class="fuss"><div class="fuss-innen">
  <div>
    <p class="fuss-logo">${LOGO}<span>Hofladenliste</span></p>
    <p>Hofläden, Milchtankstellen und Hofautomaten in ganz Deutschland. Alle Angaben ohne Gewähr – Öffnungszeiten ändern sich, besonders saisonal.</p>
  </div>
  <ul class="fuss-links">
    <li><a href="/karte/">Hofladen-Karte</a></li>
    <li><a href="/milchtankstelle/">Milchtankstelle in der Nähe</a></li>
    <li><a href="/eierautomat/">Eierautomat in der Nähe</a></li>
    <li><a href="/regiomat/">Regiomat in der Nähe</a></li>
    <li><a href="/hofladen-automaten/">Hofladen-Automaten</a></li>
    <li><a href="/angebot/">Angebot vom Hof</a></li>
    <li><a href="/sonntags-geoeffnet/">Sonntags geöffnete Höfe</a></li>
    <li><a href="/bio-hofladen/">Bio-Hofladen in der Nähe</a></li>
    <li><a href="/saisonkalender/">Saisonkalender Obst &amp; Gemüse</a></li>
    <li><a href="/saison-benachrichtigung/">Saison-Benachrichtigung</a></li>
    <li><a href="/ratgeber/">Ratgeber</a></li>
    <li><a href="/mitmachen/">Hofladen eintragen</a></li>
    <li><a href="/fuer-hoefe/">Für Höfe</a></li>
    <li><a href="/wochenmaerkte/">Wochen- &amp; Bauernmärkte</a></li>
    <li><a href="/veranstaltungen/">Hoffeste &amp; Termine</a></li>
    <li><a href="/route/">Höfe entlang der Route</a></li>
    <li><a href="/ueber-uns/">Über uns</a></li>
    <li><a href="/kontakt/">Kontakt</a></li>
    <li><a href="/presse/">Presse</a></li>
    <li><a href="/statistik/">Datenstand &amp; Statistik</a></li>
    <li><a href="/quellen/">Quellen</a></li>
    <li><a href="/impressum/">Impressum</a></li>
    <li><a href="/datenschutz/">Datenschutz</a></li>${EINWILLIGUNG ? `
    <li><button type="button" class="link-knopf" data-cookie-einstellungen hidden>Cookie-Einstellungen</button></li>` : ''}
  </ul>
  ${(() => { const u = encodeURIComponent(url), t = encodeURIComponent(titel.replace(/\s*\|\s*Hofladenliste\s*$/, ''));
    return `<p class="fuss-teilen">Seite teilen: ${[['WhatsApp', `https://wa.me/?text=${t}%20${u}`], ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
      ['Pinterest', `https://pinterest.com/pin/create/button/?url=${u}&amp;description=${t}`], ['X', `https://twitter.com/intent/tweet?url=${u}&amp;text=${t}`]]
      .map(([n, h]) => `<a href="${h}" rel="nofollow noopener" target="_blank">${n}</a>`).join(' · ')} · <a href="mailto:?subject=${t}&amp;body=${u}" rel="nofollow">E-Mail</a></p>`; })()}
  <p class="fuss-quelle">Daten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a> (ODbL) und <a href="/quellen/">weitere offene Quellen</a>, PLZ-Daten <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0). Stand ${BUILD_DATUM.split('-').reverse().join('.')}.</p>
</div></footer>
<datalist id="orte-vorschlaege"></datalist>
<script type="module" src="/app.js?v=${VERSION}"></script>
</body>
</html>
`);
}

function kartenPanel({ titel = 'Karte', hinweis = KACHELN ? 'Die Karte kommt von unserem eigenen Server, ohne Anfragen an Dritte. Kartendaten © OpenStreetMap-Mitwirkende.' : 'Die Karte lädt Kartenbilder von OpenStreetMap. Dabei wird deine IP-Adresse an die OpenStreetMap Foundation übertragen.' } = {}) {
  return `<div class="kartenpanel" data-karte>
  <div class="karte-flaeche" role="region" aria-label="${esc(titel)}"></div>
  <div class="karte-zustimmung">
    <p><b>Karte anzeigen?</b> ${esc(hinweis)}</p>
    <button type="button" class="knopf" data-karte-laden>Karte laden</button>
    <label class="merken"><input type="checkbox" data-karte-merken checked> Für diese Website merken</label>
  </div>
</div>`;
}

function filterLeiste(liste, { umkreis = null } = {}) {
  const nRund = liste.filter((e) => istRund(wocheVon(e))).length;
  const nHof = liste.filter((e) => e.typ === 'hofladen').length;
  const nAut = liste.length - nHof;
  const nSo = liste.filter((e) => e.sonntag).length;
  const nBio = liste.filter((e) => e.bio).length;
  const nKarte = liste.filter((e) => e.zahlung?.some((z) => KARTENZAHLUNG.includes(z))).length;
  const nKinder = liste.filter(mitKindern).length;
  const nOepnv = liste.filter((e) => e.haltestelle).length;
  const katZahl = new Map();
  for (const e of liste) for (const k of e.kat) katZahl.set(k, (katZahl.get(k) || 0) + 1);
  const kats = Object.keys(KATEGORIEN).filter((k) => katZahl.get(k));
  return `<div class="werkzeug" role="group" aria-label="Filter">
  ${umkreis ? `<div class="segment umkreis" role="radiogroup" aria-label="Umkreis">${umkreis.map(([r, n], i) => `<button type="button" data-radius-filter="${r}" aria-pressed="${i === umkreis.length - 1}">${r} km <span>${n}</span></button>`).join('')}</div>` : ''}
  <div class="segment" role="radiogroup" aria-label="Art">
    <button type="button" data-typ-filter="alle" aria-pressed="true">Alle <span>${liste.length}</span></button>
    ${nHof ? `<button type="button" data-typ-filter="hofladen" aria-pressed="false">Hofläden <span>${nHof}</span></button>` : ''}
    ${nAut ? `<button type="button" data-typ-filter="automat" aria-pressed="false">Automaten <span>${nAut}</span></button>` : ''}
  </div>
  <button type="button" class="umschalter" data-offen-filter aria-pressed="false">Jetzt geöffnet</button>
  ${nSo ? `<button type="button" class="umschalter" data-sonntag-filter aria-pressed="false">Sonntags geöffnet <span>${nSo}</span></button>` : ''}
  ${nBio ? `<button type="button" class="umschalter" data-bio-filter aria-pressed="false">Bio <span>${nBio}</span></button>` : ''}
  ${nRund ? `<button type="button" class="umschalter" data-rund-filter aria-pressed="false">24/7 <span>${nRund}</span></button>` : ''}
  ${nKarte ? `<button type="button" class="umschalter" data-karte-filter aria-pressed="false">Kartenzahlung <span>${nKarte}</span></button>` : ''}
  ${nKinder ? `<button type="button" class="umschalter" data-kinder-filter aria-pressed="false">Ausflug mit Kindern <span>${nKinder}</span></button>` : ''}
  ${nOepnv ? `<button type="button" class="umschalter" data-oepnv-filter aria-pressed="false" title="Haltestelle höchstens 1 km entfernt">Mit Bus &amp; Bahn <span>${nOepnv}</span></button>` : ''}
  ${kats.length ? `<div class="kat-filter" aria-label="Angebot">${kats.map((k) => `<button type="button" data-kat-filter="${k}" aria-pressed="false">${produktIcon(k)}${esc(KATEGORIEN[k])}</button>`).join('')}</div>` : ''}
  <p class="treffer" aria-live="polite"><span data-trefferzahl>${liste.length}</span> ${liste.length === 1 ? 'Eintrag' : 'Einträge'}</p>
</div>`;
}

export { ADSENSE_ID, ADSENSE_KONTO, GA_ID, GTM_ID, STATISTIK_AKTIV, KARTENZAHLUNG, KATEGORIE_PFADE, KAT_CODES_KARTE, LOGO, NATIONALE_KATEGORIEN, RATGEBER_FUER, SEITENTEXTE, SEITENTEXT_GENUTZT, SEITEN_HASH, SUCHFELD, filterLeiste, hash, kartenDaten, kartenPanel, kurz, nofollowParameter, plural, ratgeberHinweis, seite, seitenTyp, telHref, zahl };
