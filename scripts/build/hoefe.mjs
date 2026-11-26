// Build, Teil „hoefe“: Detailseiten der Höfe.
// Wird von scripts/build.mjs in fester Reihenfolge geladen; nutzt die Ergebnisse der vorherigen Teile.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { QUELLEN } from '../quellen.mjs';
import { esc } from '../../static/helfer.js';
import { titelBreite, TITEL_MAX } from '../pixel.mjs';
import { TIPP_MERKMALE } from '../../src/betrieb.js';
import { zeilen, uebersetze, parse } from '../../static/oh.js';
import { KATEGORIEN, ICON, typIcon, karteHtml, statusHtml, produktIcon } from '../../static/karte.js';
import { HALTE_ART, HEUTE, ROOT, ausstattung, betreiber, cfg, datumDe, eintraege, inDerNaehe, istRund, lizenzLink, osm, quellenHinweis, zeitenKurz } from './daten.mjs';
import { kartenDaten, kartenPanel, kurz, seite, telHref } from './html.mjs';
import { zeitenSnippet, PLURAL_ART, STAND_PLATZHALTER, fragenHtml, gross, km, link, naechsteUmgebungsSeite, naheOrte, nennung, oeffnungsSpezifikation, ortListe, ortUeberschrift, passend, regionTeaser, schreibe, stand } from './grundlagen.mjs';
import { SAISON_SEITEN, artTyp, monatsSpanne, typKreis } from './startseite.mjs';
import { umgebungsSeite } from './regionen.mjs';

// Erste Variante, die mit Marke passt, sonst die erste ohne Marke (null, wenn keine passt)
const passendVorMarke = (...v) => v.find((x) => titelBreite(`${x} | Hofladenliste`) <= TITEL_MAX) || v.find((x) => titelBreite(x) <= TITEL_MAX) || null;
const RECHTSFORM = /,?\s+(GmbH(\s*&\s*Co\.?\s*KG)?|GbR|OHG|KG|UG(\s*\(haftungsbeschränkt\))?|e\.\s?K\.|e\.\s?Kfm\.)(?=[\s,]|$)/g;
// Ohne Rechtsform nur, wenn dadurch kein anderer Eintrag denselben Namen bekommt (eindeutige Titel)
const ohneRechtsform = (t) => t.replace(RECHTSFORM, '').replace(/\s{2,}/g, ' ').trim();
const NAMEN_ZAHL = new Map();
for (const x of eintraege) { const n = ohneRechtsform(x.titelSeite); NAMEN_ZAHL.set(n, (NAMEN_ZAHL.get(n) || 0) + 1); }
// ---------- Detailseiten ----------
// Bearbeiten-Link mit stabiler ID (bleibt gültig, auch wenn sich der Slug ändert)
// ---------- Veranstaltungen der Betriebe (data/betrieb-export.json aus dem Betreiber-Bereich) ----------
const BETRIEB_EXPORT = existsSync(join(ROOT, 'data', 'betrieb-export.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'betrieb-export.json'), 'utf8')) : { hoefeMitKonto: [], veranstaltungen: [] };
const nachSid = new Map(eintraege.map((e) => [e.sid, e]));
const MIT_KONTO = new Set(BETRIEB_EXPORT.hoefeMitKonto || []);
// Freigegebene Tipps von Besuchern je Hof
for (const t of BETRIEB_EXPORT.tipps || []) { const e = nachSid.get(t.sid); if (e) (e.tipps ??= []).push(t); }
const tippsHtml = (e) => {
  const ts = e.tipps || [];
  const zahl_ = {};
  for (const t of ts) for (const m of String(t.merkmale || '').split(',').filter((x) => TIPP_MERKMALE[x])) zahl_[m] = (zahl_[m] || 0) + 1;
  const texte = ts.filter((t) => t.text).slice(-5).reverse();
  return `<section class="block tipps" data-tipps="${esc(e.sid)}"><h2>Was Besucher sagen</h2>
    ${Object.keys(zahl_).length ? `<p class="tipp-chips">${Object.entries(zahl_).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<span>👍 ${esc(TIPP_MERKMALE[m])}${n > 1 ? ` <b>${n}</b>` : ''}</span>`).join('')}</p>` : ''}
    ${texte.length ? `<ul class="tipp-texte">${texte.map((t) => `<li><p>${esc(t.text)}</p><p class="leise">${t.name ? `${esc(t.name)}, ` : ''}${esc(datumDe((t.geaendert || '').slice(0, 10)))}</p></li>`).join('')}</ul>` : ''}
    ${ts.length ? '' : '<p class="leise">Noch keine Tipps. Warst du schon dort?</p>'}
    <p><button type="button" class="knopf knopf-hell" data-tipp-oeffnen>Tipp geben</button></p>
    <form class="betrieb-form" data-tipp-form hidden>
      <fieldset class="breit"><legend>Was war gut? (bis zu 3)</legend><p class="tipp-auswahl">${Object.entries(TIPP_MERKMALE).map(([k, t]) => `<label><input type="checkbox" name="merkmale" value="${k}"> ${esc(t)}</label>`).join('')}</p></fieldset>
      <label class="breit">Kurzer Tipp (optional) <textarea name="text" maxlength="280" rows="2" placeholder="z. B. Samstags gibt es frisches Brot vom Nachbarhof."></textarea></label>
      <label>Vorname (optional) <input name="name" maxlength="40" autocomplete="given-name"></label>
      <label>E-Mail für den Bestätigungslink <input name="email" type="email" required autocomplete="email"></label>
      <div class="breit" data-turnstile></div>
      <button type="submit" class="knopf">Tipp abschicken</button>
      <p class="leise" data-status aria-live="polite">Wir prüfen jeden Tipp, bevor er erscheint. Die E-Mail-Adresse wird nicht veröffentlicht. Beim Öffnen lädt Cloudflare Turnstile (Spam-Schutz).</p>
    </form></section>`;
};
const TERMINE = BETRIEB_EXPORT.veranstaltungen.map((v) => ({ ...v, e: nachSid.get(v.sid) }))
  .filter((v) => v.e && (v.ende || v.beginn).slice(0, 10) >= HEUTE).sort((a, b) => a.beginn.localeCompare(b.beginn));
const terminZeit = (v) => {
  const d = (x) => new Date(`${x.length === 10 ? `${x}T12:00` : x}:00`.slice(0, 19)).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const u = (x) => (x.length > 10 ? `, ${x.slice(11, 16)} Uhr` : '');
  return v.ende && v.ende.slice(0, 10) !== v.beginn.slice(0, 10) ? `${d(v.beginn)}${u(v.beginn)} bis ${d(v.ende)}${u(v.ende)}` : `${d(v.beginn)}${u(v.beginn)}${v.ende && v.ende.length > 10 ? ` bis ${v.ende.slice(11, 16)} Uhr` : ''}`;
};
const terminLd = (v) => ({ '@context': 'https://schema.org', '@type': 'Event', name: v.titel, startDate: v.beginn, ...(v.ende ? { endDate: v.ende } : {}),
  eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  ...(v.beschreibung ? { description: v.beschreibung } : {}), url: `${cfg.domain}/veranstaltungen/#termin-${v.id}`,
  location: { '@type': 'Place', name: v.e.titelSeite, address: { '@type': 'PostalAddress', streetAddress: v.e.strasse || undefined, postalCode: v.e.plz || undefined, addressLocality: v.e.ortAnzeige, addressCountry: 'DE' } },
  organizer: { '@type': 'Organization', name: v.e.titelSeite, url: cfg.domain + v.e.pfad } });
const terminHtml = (v, mitHof = true) => `<li class="termin" id="termin-${v.id}"><p class="termin-zeit">${esc(terminZeit(v))}</p><h3>${esc(v.titel)}</h3>${mitHof ? `<p><a href="${v.e.pfad}">${esc(v.e.titelSeite)}</a> · ${esc(v.e.ortAnzeige)}, ${esc(v.e.k.landName)}</p>` : ''}${v.beschreibung ? `<p>${esc(v.beschreibung)}</p>` : ''}</li>`;
for (const v of TERMINE) (v.e.termine ??= []).push(v);
const bearbeiten = (e, aktion) => `/mitmachen/?eintrag=${encodeURIComponent(e.sid)}&amp;aktion=${aktion}`;
const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const ZAHLUNG_TEXT = { bar: 'Bargeld', girocard: 'Girocard (EC-Karte)', kreditkarte: 'Kreditkarte', kontaktlos: 'kontaktlos (Karte/Handy)', paypal: 'PayPal', ueberweisung: 'Überweisung' };
for (const e of eintraege) {
  const k = e.k;
  const o = e.ortSeite;
  // Einträge am selben Hof (unter 50 m, z. B. Hofladen und Milchautomat) getrennt zeigen, nicht als „0 km“
  const amSelbenHof = inDerNaehe(e, 10).filter(([d]) => d <= 0.05);
  const naehe = inDerNaehe(e, 4 + amSelbenHof.length).filter(([d]) => d > 0.05).slice(0, 4);
  const ld = { '@context': 'https://schema.org', '@type': e.typ === 'hofladen' ? 'Store' : 'LocalBusiness', name: e.titelSeite,
    geo: { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lon }, url: cfg.domain + e.pfad };
  ld.address = { '@type': 'PostalAddress', streetAddress: e.strasse || undefined, postalCode: e.plz || undefined,
    addressLocality: e.ortAnzeige, addressRegion: k.landName, addressCountry: 'DE' };
  if (e.telefon) ld.telephone = e.telefon;
  if (e.website) ld.sameAs = [e.website];
  const woche = e.oeffnungszeiten ? parse(e.oeffnungszeiten) : null;
  if (woche && woche.some((iv) => iv.length)) ld.openingHoursSpecification = oeffnungsSpezifikation(woche);
  ld['@id'] = cfg.domain + e.pfad + '#hof';
  if (e.fotos?.length) ld.image = e.fotos.map((f) => cfg.domain + f);
  if (e.email) ld.email = e.email;
  // Nur Angaben, die auch sichtbar auf der Seite stehen
  if (e.beschreibung) ld.description = e.beschreibung;
  for (const s of [e.facebook, e.instagram]) if (s) (ld.sameAs ??= []).push(s);
  if (e.zahlung?.length) ld.paymentAccepted = e.zahlung.map((z) => ZAHLUNG_TEXT[z]).filter(Boolean).join(', ');
  // Kein Angebot im JSON-LD: Google wertet auch einen OfferCatalog mit reinen Textangaben als Produkt-Snippet und
  // verlangt dann „offers“, „review“ oder „aggregateRating“ (Search Console 23.–25.11.2026). Das Angebot steht sichtbar auf der Seite.
  const ohKurz = e.oeffnungszeiten ? (zeilen(e.oeffnungszeiten) || []).map(([t, v]) => `${t} ${v}`).join(', ') : '';
  const uhr = (m) => `${String(Math.floor(m / 60) % 24 || (m >= 1440 ? 24 : 0)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const ohTabelle = woche
    ? `<table class="woche"><tbody>${woche.map((iv, i) => `<tr data-tag="${i}"><th>${TAGE[i]}</th><td>${iv.length ? iv.map(([a, b]) => `${uhr(a)}–${uhr(b)}`).join(', ') : '<span class="zu">geschlossen</span>'}</td></tr>`).join('')}</tbody></table>`
    : e.oeffnungszeiten_text ? `<p>${esc(e.oeffnungszeiten_text)}</p>`
    : e.oeffnungszeiten ? `<p>${esc(uebersetze(e.oeffnungszeiten))}</p>`
    : `<p class="leise">Keine Öffnungszeiten hinterlegt. ${e.typ === 'automat' ? 'Automaten sind meist rund um die Uhr zugänglich.' : 'Am besten vorher anrufen.'}</p>
      <p class="zeiten-cta">Kennst du die Öffnungszeiten? <a href="${bearbeiten(e, 'ergaenzen')}&amp;fokus=zeiten">Sag uns Bescheid</a></p>`;
  const kontakt = [
    e.telefon && `<li>${ICON.telefon}<a href="${telHref(e.telefon)}">${esc(e.telefon)}</a></li>`,
    e.email && `<li>${ICON.mail}<a href="mailto:${esc(e.email)}">${esc(e.email)}</a></li>`,
    e.website && `<li>${ICON.web}<a href="${esc(e.website)}" rel="nofollow noopener" target="_blank">${esc(kurz(e.website))}</a></li>`,
    e.facebook && `<li>${ICON.web}<a href="${esc(e.facebook)}" rel="nofollow noopener" target="_blank">Facebook</a></li>`,
    e.instagram && `<li>${ICON.web}<a href="${esc(e.instagram)}" rel="nofollow noopener" target="_blank">Instagram</a></li>`,
  ].filter(Boolean);
  const imKreis = k.im;
  const artSatz = e.typ === 'hofladen' ? 'ein Hofladen' : e.art === 'Eierautomat' ? 'ein Eierautomat' : e.art === 'Milchtankstelle' ? 'eine Milchtankstelle' : `ein ${e.art}`;
  const naechsterHof = naehe.find(([, x]) => x.typ === 'hofladen');
  const ueber = [
    `${esc(e.titel)} ist ${artSatz} in ${esc(e.ortAnzeige)}${imKreis.endsWith(e.ortAnzeige) ? '' : ` ${esc(imKreis)}`}.`,
    e.kat.length ? `Im Angebot: ${esc(nennung(e.kat.map((x) => KATEGORIEN[x])))}.` : '',
    ohKurz ? `Geöffnet: ${esc(ohKurz)}.` : '',
    naechsterHof ? `Der nächste weitere Hofladen ist <a href="${naechsterHof[1].pfad}">${esc(naechsterHof[1].titelSeite)}</a> in ${esc(naechsterHof[1].ortAnzeige)}, etwa ${km(naechsterHof[0])} entfernt.` : '',
  ].filter(Boolean).join(' ');
  const titelEnthaeltOrt = e.titel.includes(e.ortAnzeige);
  const mitZeiten = !!(e.oeffnungszeiten || e.oeffnungszeiten_text);
  const rund = istRund(woche);
  const merkmale = [
    e.gepflegt?.art === 'uebernahme' && ['Vom Betrieb gepflegt', `Angaben vom Betrieb selbst, Stand ${datumDe(e.gepflegt.stand)}.`],
    e.bio && ['Bio', 'Laut Eintrag verkauft der Hof Bio-Produkte.'],
    e.verband?.length && [e.verband.length > 1 ? 'Bio-Verbände' : 'Bio-Verband', `${esc(nennung(e.verband))} – so steht es im Eintrag. Das Siegel auf der Ware ist maßgeblich.`],
    rund && ['Rund um die Uhr', e.typ === 'automat' ? 'Der Automat ist jederzeit zugänglich.' : 'Laut Öffnungszeiten jederzeit geöffnet.'],
    !rund && e.sonntag && ['Sonntags geöffnet', `Sonntag: ${(woche[6] || []).map(([a, b]) => `${uhr(a)}–${uhr(b)}`).join(', ')}`],
    e.typ === 'automat' ? ['Automat', `${e.art} mit Selbstbedienung.`] : e.selbstbedienung && ['Selbstbedienung', 'Einkauf in Selbstbedienung, meist mit Kasse des Vertrauens.'],
    e.zahlung && ['Bezahlen', e.zahlung.map((z) => ZAHLUNG_TEXT[z]).join(', ')],
    ausstattung(e).length && ['Vor Ort', ausstattung(e).join(', ')],
    e.haltestelle && ['Bus & Bahn', `${HALTE_ART[e.haltestelle.art]}: Haltestelle „${esc(e.haltestelle.name)}“, etwa ${e.haltestelle.m < 100 ? 'unter 100' : e.haltestelle.m} m Luftlinie. Fahrplan und Fußweg bitte vorher prüfen.`],
  ].filter(Boolean);
  const saisonProdukte = SAISON_SEITEN.filter((sp) => sp.liste.includes(e));
  // FAQ nur aus Angaben, die auf der Seite stehen
  const naechsteDrei = naehe.slice(0, 3);
  const hofFragen = [
    woche && ohKurz && [`Wann hat ${e.titel} geöffnet?`, `Laut den hinterlegten Öffnungszeiten: ${esc(ohKurz)}. Gerade in der Saison können sich die Zeiten ändern – im Zweifel vorher anrufen.`],
    woche && !rund && [`Hat ${e.titel} sonntags geöffnet?`, e.sonntag ? `Ja, sonntags ${(woche[6] || []).map(([a, b]) => `${uhr(a)}–${uhr(b)}`).join(' und ')} Uhr.` : 'Nein, laut den hinterlegten Öffnungszeiten ist sonntags geschlossen.'],
    [`Wo befindet sich ${e.titel}?`, `${e.strasse ? `Die Adresse ist ${esc(e.adresse)}` : `${esc(e.titel)} liegt ${esc(e.adresse)}`} (${esc(k.titel)}). Über „Route planen“ startest du die Navigation.`],
    e.kat.length && [`Was gibt es bei ${e.titel}?`, `Im Angebot: ${esc(nennung(e.kat.map((x) => KATEGORIEN[x])))}. Das Sortiment kann je nach Saison abweichen.`],
    e.zahlung && [`Wie kann man bei ${e.titel} bezahlen?`, `Laut Eintrag: ${esc(nennung(e.zahlung.map((z) => ZAHLUNG_TEXT[z])))}.`],
    naechsteDrei.length && [`Welche Hofläden gibt es in der Nähe von ${e.titel}?`, `${nennung(naechsteDrei.map(([d, x]) => `${link(x)}${x.titel.includes(x.ortAnzeige) ? '' : ` in ${esc(x.ortAnzeige)}`} (${km(d)})`))}.`],
  ].filter(Boolean);
  const hofFaq = hofFragen.length >= 3 ? fragenHtml(hofFragen, `Häufige Fragen zu ${e.titel}`) : { html: '', ld: [] };
  const umgebungsSeite = naechsteUmgebungsSeite(e);
  // Sehr lange Namen (OSM-Freitext) im Title kürzen, die H1 bleibt vollständig
  // Rechtsformen (GmbH, GbR, KG …) braucht im Title niemand – der Platz geht an Ort und „Öffnungszeiten“
  const nameTitel = (() => { const n = ohneRechtsform(e.titelSeite); return n && (n === e.titelSeite || NAMEN_ZAHL.get(n) === 1) ? n : e.titelSeite; })();
  const tn = (() => { if (nameTitel.length <= 60 && titelBreite(nameTitel) <= TITEL_MAX - 10) return nameTitel;
    const w = nameTitel.split(' '); while (w.length > 1 && (w.join(' ').length > 58 || titelBreite(`${w.join(' ')} …`) > TITEL_MAX - 10)) w.pop();
    return `${w.join(' ').replace(/[\s,;:(–-]+$/, '')} …`; })();
  schreibe(e.pfad, seite({
    // Name + Ort + „Öffnungszeiten“ (danach suchen die meisten); „Öffnungszeiten“ nur, wenn welche hinterlegt sind
    titel: titelEnthaeltOrt
      ? (mitZeiten ? passend(`${tn} – Öffnungszeiten, Angebot & Route`, `${tn} – Öffnungszeiten & Route`, `${tn} – Öffnungszeiten`, tn)
        : passend(`${tn} – ${e.art}, Adresse & Route`, `${tn} – Adresse & Route`, tn))
      // „Öffnungszeiten“ geht vor der Marke („| Hofladenliste“ zeigt Google ohnehin als Website-Namen)
      : mitZeiten ? (passendVorMarke(`${tn} – ${e.art} in ${e.ortAnzeige}, Öffnungszeiten`, `${tn} in ${e.ortAnzeige} – Öffnungszeiten`) || passend(`${tn} – ${e.art} in ${e.ortAnzeige}`, `${tn} in ${e.ortAnzeige}`, tn))
        : passend(`${tn} – ${e.art} in ${e.ortAnzeige}`, `${tn} in ${e.ortAnzeige}`, tn),
    // Snippet: Ort und Angebot zuerst (das sucht man), dann kompakte Zeiten; der Name steht schon im Titel
    beschreibung: (() => {
      const art = e.bio && !/bio/i.test(e.art) ? `Bio-${e.art}` : e.art;
      const kreis = e.ortAnzeige.includes(k.titel) || k.titel.includes(e.ortAnzeige) ? '' : ` (${k.titel})`;
      const kat = e.kat.map((x) => KATEGORIEN[x]);
      const angebot = kat.length ? `: ${nennung(kat.length > 4 ? [...kat.slice(0, 4), 'mehr'] : kat)}` : '';
      const zeiten = rund ? 'Rund um die Uhr geöffnet.' : woche && e.oeffnungszeiten ? (() => { const z = zeitenSnippet(zeilen(e.oeffnungszeiten), 75); return z ? `Geöffnet ${z}.` : ''; })() : '';
      const extra = [e.typ !== 'automat' && e.selbstbedienung && 'Selbstbedienung.', !rund && e.sonntag && !zeiten && 'Auch sonntags geöffnet.'].filter(Boolean).join(' ');
      const schluss = `${e.titelSeite}: Adresse, ${e.telefon ? 'Telefon, ' : ''}Karte und Route${naechsterHof ? ` – plus Hofläden in der Nähe von ${e.ortAnzeige}` : ''}.`;
      const teile = [`${art} in ${e.ortAnzeige}${kreis}${angebot}.`, zeiten, extra, schluss].filter(Boolean);
      // Einträge ohne Angebot mit einem allgemeinen Satz auffüllen (steht als letzter Mittelsatz, fällt beim Kürzen zuerst weg)
      if (!angebot) teile.splice(-1, 0, 'Regional einkaufen in deiner Nähe.');
      return teile.join(' ');
    })(),
    pfad: e.pfad,
    bild: e.fotos?.[0] || null,
    noindex: e.duenn,
    klasse: 'hof',
    jsonld: [ld, ...hofFaq.ld, ...(e.termine || []).map(terminLd)],
    krumen: [[k.landName, `/${k.landSlug}/`], [k.titel, k.pfad], ...(o?.eigen ? [[o.ort, o.pfad]] : []), [e.titel, e.pfad]],
    inhalt: `
<section class="hof-kopf laden-${e.typ}" data-land="${k.land}"${e.urlaub?.length ? ` data-urlaub="${esc(e.urlaub.map((u) => `${u.von}/${u.bis}`).join(' '))}"` : ''} data-lat="${e.lat}" data-lon="${e.lon}" data-titel="${esc(e.titel)}" data-typ="${e.typ}">
  <p class="hof-art">${typIcon(e.art)}<span>${artTyp(e) ? `<a href="/${artTyp(e).slug}/">${esc(e.art)}</a>` : esc(e.art)} in ${o?.eigen ? `<a href="${o.pfad}">${esc(e.ortAnzeige)}</a>` : esc(e.ortAnzeige)}${e.bio ? ' · Bio' : ''}</span></p>
  <h1>${esc(e.titelSeite)}</h1>
  <p class="hof-adr">${ICON.route}${esc(e.adresse)}</p>
  ${statusHtml(e.oeffnungszeiten, e.oeffnungszeiten_text)}
  <p class="hof-entfernung"><span data-entfernung hidden></span><button type="button" class="link" data-entfernung-start hidden>Wie weit ist das von mir?</button></p>
</section>
<div class="hof-inhalt">
  <aside class="hof-seite">
    <section class="kontaktkarte" aria-labelledby="kk-titel">
      <h2 id="kk-titel">Kontakt &amp; Zeiten</h2>
      <h3 class="kk-unter">Öffnungszeiten${amSelbenHof.length ? ` ${e.typ === 'hofladen' ? 'Hofladen' : esc(e.art)}` : ''}</h3>
      ${ohTabelle}
      ${e.typ === 'hofladen' && istRund(woche) && amSelbenHof.some(([, x]) => x.typ === 'automat') ? `<p class="leise zeiten-hinweis">Laut OpenStreetMap ist der Hofladen rund um die Uhr geöffnet. Am selben Hof steht ein Automat – vermutlich gelten diese Zeiten für den Automaten. Kennst du die Ladenzeiten? <a href="${bearbeiten(e, 'ergaenzen')}&amp;fokus=zeiten">Bitte ergänzen</a>.</p>` : ''}
      ${amSelbenHof.length ? `<h3 class="kk-unter">Am selben Hof</h3><ul class="am-selben-hof">${amSelbenHof.map(([, x]) => `<li><a href="${x.pfad}">${typIcon(x.art)}<span>${esc(x.titel)}</span></a><span class="leise">${esc(x.typ === 'hofladen' ? 'Hofladen' : x.art)}: ${esc(zeitenKurz(x))}</span></li>`).join('')}</ul>` : ''}
      <p class="kk-knoepfe">
        ${e.telefon ? `<a class="knopf knopf-gruen" href="${telHref(e.telefon)}">${ICON.telefon}Anrufen</a>` : ''}
        <a class="knopf knopf-dunkel" href="https://www.google.com/maps/dir/?api=1&amp;destination=${e.lat},${e.lon}" rel="nofollow noopener" target="_blank">${ICON.route}Route planen</a>
        ${e.website ? `<a class="knopf knopf-hell" href="${esc(e.website)}" rel="nofollow noopener" target="_blank">${ICON.web}Website</a>` : ''}
      </p>
      <p class="leise navi-wechsel"><a href="#" data-navi-wechseln>Andere Navi-App wählen</a></p>
      ${kontakt.length ? `<ul class="kontakt">${kontakt.join('')}</ul>` : ''}
      ${e.betreiber && e.betreiber !== e.name ? `<p class="leise">Betreiber: ${esc(e.betreiber)}</p>` : ''}
    </section>
    <nav class="sticky-aktionen" aria-label="Schnellaktionen">
      <a href="https://www.google.com/maps/dir/?api=1&amp;destination=${e.lat},${e.lon}" rel="nofollow noopener" target="_blank">${ICON.route}<span>Route</span></a>
      ${e.telefon ? `<a href="${telHref(e.telefon)}">${ICON.telefon}<span>Anrufen</span></a>` : ''}
      ${e.website ? `<a href="${esc(e.website)}" rel="nofollow noopener" target="_blank">${ICON.web}<span>Website</span></a>` : ''}
      <button type="button" data-merken="${esc(e.slug)}" aria-pressed="false">${ICON.herz}<span>Merken</span></button>
    </nav>
    <nav class="hof-werkzeuge" aria-label="Aktionen">
      <button type="button" data-merken="${esc(e.slug)}" aria-pressed="false">${ICON.herz}<span class="merken-text">Merken</span></button>
      <button type="button" data-teilen data-titel="${esc(e.titelSeite)}">${ICON.teilen}<span>Teilen</span></button>
      <a href="${bearbeiten(e, 'ergaenzen')}">${ICON.stift}<span>Ergänzen</span></a>
    </nav>
    <div class="hof-karte">
      ${e.lageUngefaehr ? '<p class="leise">Die genaue Lage ist noch nicht erfasst.</p>' : kartenPanel({ titel: `Karte: ${e.titel}` })}
      <p class="leise"><a href="https://www.openstreetmap.org/?mlat=${e.lat}&amp;mlon=${e.lon}#map=16/${e.lat}/${e.lon}" rel="nofollow noopener" target="_blank">Auf OpenStreetMap öffnen</a></p>
    </div>
  </aside>
  <div class="hof-info">
    ${e.kat.length ? `<section class="block"><h2>Angebot</h2><ul class="chips gross">${e.kat.map((x) => `<li>${produktIcon(x)}${esc(KATEGORIEN[x])}</li>`).join('')}</ul>${(e.quelle === 'osm' || QUELLEN[e.quelle]) ? '<p class="leise">Abgeleitet aus dem Eintrag und dem Namen des Hofs – das Sortiment kann je nach Saison abweichen.</p>' : ''}${e.kat.some((x) => ['obst', 'gemuese', 'kartoffeln'].includes(x)) ? '<p class="leise">Was gerade geerntet wird, steht im <a href="/saisonkalender/">Saisonkalender</a>.</p>' : ''}</section>` : ''}
    ${e.fotos?.length ? `<section class="block hof-fotos"><h2>Fotos</h2><div class="foto-reihe">${e.fotos.map((f, i) => `<img src="${esc(f)}" width="1200" height="900" alt="${esc(e.titel)} – Foto ${i + 1}" loading="lazy" decoding="async">`).join('')}</div><p class="leise">Fotos: ${esc(e.titel)}</p></section>` : ''}
    ${e.termine?.length ? `<section class="block termine"><h2>Veranstaltungen</h2><ul class="termin-liste">${e.termine.map((v) => terminHtml(v, false)).join('')}</ul><p class="leise">Angabe des Betriebs · <a href="/veranstaltungen/">Alle Veranstaltungen</a></p></section>` : ''}
    ${e.urlaub?.length ? `<section class="block saison-hinweis urlaub"><h2>Betriebsferien</h2>${e.urlaub.map((u) => `<p><b>${esc(datumDe(u.von))} bis ${esc(datumDe(u.bis))}</b>${u.text ? ` – ${esc(u.text)}` : ''}</p>`).join('')}<p class="leise">Angabe des Betriebs</p></section>` : ''}
    ${e.saisonHinweis ? `<section class="block saison-hinweis"><h2>Aktuell und saisonal</h2><p>${esc(e.saisonHinweis)}</p><p class="leise">${e.vomBetrieb?.saison ? 'Angabe des Betriebs, ' : ''}Stand ${esc(datumDe(e.gepflegt?.stand || HEUTE))}</p></section>` : ''}
    ${merkmale.length || saisonProdukte.length ? `<section class="block"><h2>Auf einen Blick</h2><dl class="merkmale">${merkmale.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('')}${saisonProdukte.map((sp) => `<div><dt><a href="${sp.pfad}">${esc(sp.name)}</a></dt><dd>${sp.frisch.length ? `Saison meist ${esc(monatsSpanne(sp.frisch))}` : 'im Angebot'}</dd></div>`).join('')}</dl></section>` : ''}
    <section class="block"><h2>Über ${esc(e.titel)}</h2>${e.beschreibung ? `<p>${esc(e.beschreibung)}</p>` : ''}<p>${ueber}</p>${regionTeaser(k)}</section>
    ${e.ergaenzt ? `<p class="hinweis">${e.ergaenzt.quellen.map((q) => `${q.felder.map((f) => ({ website: 'Website', oeffnungszeiten: 'Öffnungszeiten', telefon: 'Telefon', email: 'E-Mail', facebook: 'Facebook', instagram: 'Instagram', strasse: 'Adresse' })[f]).join(', ')} ergänzt aus <a href="${esc(q.quelle)}" rel="nofollow noopener" target="_blank">${esc(q.name || kurz(q.quelle).split('/')[0])}</a>${q.lizenz ? ` (${lizenzLink(q.lizenz)})` : ''}${q.stand ? ` (Stand ${esc(datumDe(q.stand))})` : ''}`).join('; ')}. Zeiten können sich saisonal ändern – im Zweifel vorher anrufen.</p>` : ''}
    ${tippsHtml(e)}
    ${MIT_KONTO.has(e.sid) ? `<section class="block nachricht" data-nachricht="${esc(e.sid)}"><h2>Nachricht an den Hof</h2>
      <p>Frag nach Angebot, Vorbestellung oder Öffnungszeiten. Die Nachricht geht direkt an den Betrieb, seine E-Mail-Adresse bleibt verborgen. Die Antwort kommt an deine Adresse.</p>
      <p><button type="button" class="knopf" data-nachricht-oeffnen>Nachricht schreiben</button></p>
      <form class="betrieb-form" data-nachricht-form hidden>
        <label>Dein Name <input name="name" maxlength="80" autocomplete="name"></label>
        <label>Deine E-Mail-Adresse <input name="email" type="email" required autocomplete="email"></label>
        <label class="breit">Nachricht <textarea name="text" rows="5" maxlength="3000" required minlength="10"></textarea></label>
        <div class="breit" data-turnstile></div>
        <button type="submit" class="knopf">Nachricht senden</button>
        <p class="leise" data-status aria-live="polite">Beim Öffnen des Formulars lädt Cloudflare Turnstile (Spam-Schutz), siehe <a href="/datenschutz/">Datenschutz</a>.</p>
      </form></section>` : ''}
    <section class="pruefung" data-rueckmeldung="${esc(e.sid)}" aria-labelledby="pr-titel">
      <h2 id="pr-titel">Stimmt das noch?</h2>
      ${e.geschlossenGemeldet >= 2 ? '<p class="pruef-warnung">Mehrere Besucher haben gemeldet, dass dieser Hof geschlossen sein könnte. Wir prüfen das gerade.</p>' : ''}
      <p class="pruef-stand">${e.letztePruefung ? (e.letztePruefung.besuch ? `${esc(e.letztePruefung.wie[0].toUpperCase() + e.letztePruefung.wie.slice(1))}, zuletzt am <time datetime="${e.letztePruefung.tag}">${esc(datumDe(e.letztePruefung.tag))}</time>.` : `Zuletzt geprüft: <time datetime="${e.letztePruefung.tag}">${esc(datumDe(e.letztePruefung.tag))}</time>, ${esc(e.letztePruefung.wie)}.`) : 'Diese Angaben hat noch niemand geprüft. Warst du in letzter Zeit dort?'}</p>
      <div class="pruef-knoepfe"><button type="button" class="knopf knopf-dunkel" data-rm="stimmt">Ja, stimmt noch</button><button type="button" class="knopf knopf-hell" data-rm="geschlossen">Geschlossen melden</button></div>
      <p class="pruef-frage" data-rm-frage hidden>Ist der ${e.typ === 'automat' ? 'Automat' : 'Hof oder Laden'} dauerhaft geschlossen? <button type="button" class="link" data-rm-ja>Ja, dauerhaft geschlossen</button> · <button type="button" class="link" data-rm-nein>Nein, abbrechen</button></p>
      <p class="pruef-danke" data-rm-danke role="status" hidden></p>
      <p class="leise">Öffnungszeiten oder Angebot haben sich geändert? <a href="${bearbeiten(e, 'ergaenzen')}">Eintrag ergänzen</a>.</p>
    </section>
    <p class="hinweis">Angaben ohne Gewähr. ${e.gepflegt ? `${e.gepflegt.art === 'uebernahme' ? 'Der Betrieb pflegt diesen Eintrag selbst' : 'Angaben geprüft und ergänzt'} (Stand ${esc(datumDe(e.gepflegt.stand))}). ` : ''}${e.quelle === 'betreiber' ? `Eingetragen vom Betrieb. Etwas stimmt nicht? <a href="${bearbeiten(e, 'ergaenzen')}">Eintrag ergänzen</a>.` : QUELLEN[e.quelle] && !e.gepflegt
      ? `${quellenHinweis(e)} Die Angaben sind noch nicht vom Betrieb bestätigt. Etwas stimmt nicht oder ist der Hof geschlossen? <a href="${bearbeiten(e, 'ergaenzen')}">Bitte melden</a>.`
      : e.quelle === 'osm'
      ? `Quelle: <a href="https://www.openstreetmap.org/${e.osm}" rel="nofollow noopener" target="_blank">OpenStreetMap</a>. Etwas stimmt nicht? <a href="https://www.openstreetmap.org/edit?${e.osm.replace('/', '=')}" rel="nofollow noopener" target="_blank">In OpenStreetMap korrigieren</a> oder <a href="${bearbeiten(e, 'ergaenzen')}">Eintrag ergänzen</a>.`
      : `${e.quelleUrl ? `Quelle: <a href="${esc(e.quelleUrl)}" rel="nofollow noopener" target="_blank">${esc(kurz(e.quelleUrl).split('/')[0])}</a>. ` : ''}Etwas stimmt nicht? <a href="${bearbeiten(e, 'ergaenzen')}">Eintrag ergänzen</a>.`}</p>
    <p class="aktualitaet">${e.geprueft ? `Zuletzt vor Ort geprüft: ${esc(datumDe(e.geprueft))} (laut OpenStreetMap) · ` : ''}Seite aktualisiert: ${STAND_PLATZHALTER}</p>
    <section class="block betreiber-box">
      <h2>Ist das dein Hof?</h2>
      <p>Übernimm den Eintrag kostenlos und halte Öffnungszeiten, Angebot und saisonale Hinweise selbst aktuell.</p>
      <p class="kk-knoepfe"><a class="knopf knopf-dunkel" href="${bearbeiten(e, 'uebernehmen')}">Betreiber? Eintrag kostenlos übernehmen</a><a class="knopf knopf-hell" href="${bearbeiten(e, 'ergaenzen')}">Eintrag ergänzen</a></p>
      <p class="leise"><a href="/fuer-hoefe/?eintrag=${esc(e.sid)}">Badge „Wir sind auf hofladenliste.de“ für deine Website</a></p>
    </section>
  </div>
</div>
${naehe.length ? `<section class="abschnitt"><h2>Weitere Hofläden in der Nähe</h2><div class="karten-reihe">${naehe.map(([d, x]) => karteHtml(kartenDaten(x, Math.round(d * 10) / 10))).join('')}</div></section>` : ''}
${hofFaq.html}
${ortListe(naheOrte(e.lat, e.lon, 6, new Set(o?.eigen ? [o] : [])), `Hofläden in Orten in der Nähe`)}
<p class="abschnitt mehr-links">${umgebungsSeite && umgebungsSeite.pfad !== o?.pfad ? `<a class="mehr" href="${umgebungsSeite.pfad}">Hofläden in ${esc(umgebungsSeite.name)} und Umgebung${ICON.pfeil}</a>` : ''}${artTyp(e) ? (() => { const tk = typKreis(artTyp(e), k); return tk ? `<a class="mehr" href="${tk.pfad}">${tk.t.plural} ${esc(imKreis)}${ICON.pfeil}</a>` : `<a class="mehr" href="/${artTyp(e).slug}/#${k.landSlug}">${esc(PLURAL_ART[e.art] || e.art)} in ${esc(k.landName)}${ICON.pfeil}</a>`; })() : ''}${o?.eigen ? `<a class="mehr" href="${o.pfad}">${esc(ortUeberschrift(o))}${ICON.pfeil}</a>` : ''}<a class="mehr" href="${k.pfad}">Alle Hofläden ${esc(imKreis)}${ICON.pfeil}</a></p>`,
  }), !e.duenn);
}

export { BETRIEB_EXPORT, MIT_KONTO, TAGE, TERMINE, ZAHLUNG_TEXT, bearbeiten, nachSid, terminHtml, terminLd, terminZeit, tippsHtml };
