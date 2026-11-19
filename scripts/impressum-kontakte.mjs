#!/usr/bin/env node
// Liest E-Mail-Adresse (und fehlende Telefonnummer) aus dem Impressum der eigenen Websites der Höfe.
// Kandidaten: alle Einträge (OSM, offene Quellen, Betriebe, manuell) mit Website, aber ohne E-Mail –
// so wie sie nach dem Build auf der Seite stehen. Ergebnis: data/impressum.json, gleiches Format wie
// data/recherche.json. Im Build füllen die Funde nur leere Felder; OSM, eigene Pflege und Angaben der
// Betriebe haben Vorrang. Auf der Hofseite steht „E-Mail ergänzt aus <domain> (Stand …)“.
//
// Reihenfolge je Website: Impressum → Kontakt → Startseite. Respektiert robots.txt, eine Abfrage pro Domain,
// 8 Domains parallel, kurze Timeouts. Geprüfte Einträge werden erst nach 120 Tagen erneut abgerufen.
//
// Aufruf: LISTE_EXPORT=/tmp/liste.json node scripts/build.mjs && node scripts/impressum-kontakte.mjs /tmp/liste.json [max]
// Parser-Test ohne Netz: node scripts/impressum-kontakte.mjs --test
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const UA = 'HofladenlisteBot/1.0 (+https://hofladenliste.de/mitmachen/; hofladenliste@gmail.com; Kontaktdaten aus dem Impressum für das Hofladen-Verzeichnis)';
const ZIEL = 'data/impressum.json';
const NEU_PRUEFEN_TAGE = 120;
// Soziale Netzwerke, Baukasten-Startseiten, Verzeichnisse und Wettbewerber: dort steht kein Impressum des Hofs
const FREMD = /(^|\.)(facebook|instagram|google|goo\.gl|wikipedia|youtube|linkedin|tiktok|ebay|kleinanzeigen|twitter|x|whatsapp|linktr|hofladen-bauernladen|regiomat|milchtankstellen|mein-bauernhof|marktschwaermer|dasoertliche|gelbeseiten|11880|cylex|golocal|meinestadt|branchenbuch|yelp|tripadvisor|hofladenfinder|heimischehoflaeden|bauernhofurlaub|landurlaub|creditreform|northdata)\./i;
// Domains mit vielen Einträgen sind Plattformen/Ketten: deren Impressum gehört nicht zum einzelnen Hof
const MAX_EINTRAEGE_PRO_DOMAIN = 4;

// ---------- Text aufbereiten ----------
const ENT = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '-', mdash: '-', commat: '@', period: '.', sol: '/', lpar: '(', rpar: ')', lsqb: '[', rsqb: ']' };
export function entities(s) {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m);
}
// Cloudflare „Email Address Obfuscation“: data-cfemail="…" bzw. /cdn-cgi/l/email-protection#…
export function cfDecode(hex) {
  const k = parseInt(hex.slice(0, 2), 16);
  let s = '';
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
  return s;
}
export function htmlZuText(html) {
  return entities(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|section|article|dt|dd|address|header|footer|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ').replace(/\n\s*/g, '\n');
}
// „info [at] hof [punkt] de“, „info(at)hof.de“, „info @ hof . de“ → info@hof.de
export function entschleiern(text) {
  return text
    .replace(/\s*[[({]\s*(?:at|ät|@|et)\s*[\])}]\s*/gi, '@')
    .replace(/\s*[[({]\s*(?:dot|punkt|\.)\s*[\])}]\s*/gi, '.')
    .replace(/([A-Za-z0-9._%+-])\s+@\s+([A-Za-z0-9-])/g, '$1@$2')
    .replace(/(@[A-Za-z0-9-]+)\s+\.\s+([A-Za-z]{2,})/g, '$1.$2');
}

// ---------- E-Mail ----------
const MAIL_RE = /[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}@(?:[A-Za-z0-9äöü](?:[A-Za-z0-9äöü-]{0,61}[A-Za-z0-9äöü])?\.)+[A-Za-z]{2,12}(?![A-Za-z0-9])/g;
const FREEMAIL = /@(gmail|googlemail|web|gmx|t-online|freenet|arcor|yahoo|outlook|hotmail|live|icloud|me|aol|mail|posteo|online|kabelmail|vodafone|ewe|htp-tel|mailbox|email|1und1|ionos|osnanet|unitybox|netcologne|telekom)\.(de|com|net|at|ch|org)$/i;
const MAIL_UNSINN = /(\.(png|jpe?g|gif|svg|webp|css|js|php|html?)$)|(^|[@.])(example|beispiel|domain|ihre-?domain|musterfirma|mustermann|sentry|wixpress|sentry-next|godaddy|jimdo\.com|wix\.com|strato|ionos\.de|1und1\.de|hosteurope|all-inkl|united-domains|ec\.europa)\b|^(no-?reply|noreply|do-?not-?reply|webmaster|postmaster|abuse|hostmaster|test|name|email|e-mail|mail|ihre|your|vorname\.nachname|max\.mustermann|user)@|@2x\.|@\d+x\./i;
// Abschnitte, in denen fremde Adressen stehen (Webdesign, Hosting, Datenschutzbeauftragte, Behörden, Streitschlichtung)
const FREMD_KONTEXT = /(webdesign|web-design|gestaltung|umsetzung|realisierung|programmierung|erstellt (von|durch)|design (by|von)|konzept(ion)? (&|und) design|technische umsetzung|hosting|gehostet|provider|datenschutzbeauftragte|aufsichtsbehörde|landesbeauftragte|streitschlichtung|schlichtungsstelle|verbraucherzentrale|bildnachweis|fotos?:|fotografie|kammer|ministerium|landratsamt|kontrollstelle|öko-kontrollstelle|zertifizierungsstelle|redaktion(ell)? verantwortlich.*agentur|agentur)/i;

function basisDomain(host) {
  const teile = host.toLowerCase().replace(/^www\./, '').split('.');
  return teile.slice(-2).join('.');
}
function namensKern(host) {
  return basisDomain(host).split('.')[0].replace(/[^a-z0-9äöü]/g, '');
}

// Alle Adressen einer Seite mit Position und Kontext
export function mailsAusHtml(html) {
  const funde = [];
  const text = htmlZuText(html);
  const t2 = entschleiern(text);
  for (const m of t2.matchAll(MAIL_RE)) {
    funde.push({ mail: m[0], pos: m.index / Math.max(t2.length, 1), vorher: t2.slice(Math.max(0, m.index - 160), m.index), text: true });
  }
  for (const m of html.matchAll(/href\s*=\s*["']\s*mailto:([^"'?]+)/gi)) {
    let a = m[1]; try { a = decodeURIComponent(a); } catch { /* egal */ }
    a = entities(a).trim();
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(a)) funde.push({ mail: a, link: true });
  }
  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']|email-protection#([0-9a-f]+)/gi)) {
    const a = cfDecode(m[1] || m[2]);
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(a)) funde.push({ mail: a, link: true });
  }
  // Kontext für Link-Funde aus dem Text nachtragen (gleiche Adresse)
  for (const f of funde) {
    f.mail = f.mail.replace(/^[._-]+|[._-]+$/g, '').toLowerCase();
    if (f.vorher == null) {
      const i = t2.toLowerCase().indexOf(f.mail);
      if (i >= 0) { f.vorher = t2.slice(Math.max(0, i - 160), i); f.pos = i / t2.length; }
    }
  }
  return funde.filter((f) => !MAIL_UNSINN.test(f.mail));
}

// Beste Adresse für den Hof wählen; null, wenn keine passt
export function besteMail(funde, website) {
  let host = '';
  try { host = new URL(/^https?:/i.test(website) ? website : `https://${website}`).host; } catch { /* egal */ }
  const basis = host ? basisDomain(host) : '', kern = host ? namensKern(host) : '';
  const kandidaten = new Map();
  for (const f of funde) {
    const vorher = (f.vorher || '').slice(-120);
    const domain = f.mail.split('@')[1];
    const eigeneDomain = basis && (domain === basis || domain.endsWith(`.${basis}`));
    // Fremder Abschnitt (Webdesign, Hosting, Behörde …) in den zwei Zeilen davor: Adresse gehört nicht dem Hof.
    // Adressen mit der Domain der Website sind immer die des Hofs.
    if (!eigeneDomain && FREMD_KONTEXT.test(vorher.split('\n').slice(-2).join('\n'))) continue;
    let p = 0;
    if (eigeneDomain) p += 4;
    else if (kern.length >= 5 && domain.replace(/[^a-z0-9äöü]/g, '').includes(kern)) p += 3;
    else if (FREEMAIL.test(f.mail)) p += 2;
    else if (/(e-?mail|mail|kontakt)\s*:?\s*$/i.test(vorher.slice(-25))) p += 1;
    else continue; // fremde Domain ohne Hinweis, dass es die Adresse des Hofs ist
    if (/^(info|kontakt|hofladen|laden|mail|post|hallo|hello|office|bestellung|shop|verkauf)@/.test(f.mail)) p += 0.5;
    if (/^(datenschutz|privacy|dsb|rechnung|buchhaltung|bewerbung|jobs|presse|newsletter)@/.test(f.mail)) p -= 2;
    if (f.link) p += 0.3;
    const alt = kandidaten.get(f.mail);
    if (!alt || alt < p) kandidaten.set(f.mail, p);
  }
  const best = [...kandidaten].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 1 ? best[0] : null;
}

// ---------- Telefon ----------
const TEL_RE = /(?:^|[\s(|•·,;])(tel(?:efon)?\.?|fon|telefonnummer|mobil(?:funk)?|handy|phone|festnetz|t)\s*(?:\.|:|-)?\s*((?:\+|00)\s?49\s?(?:\(0\))?\s?[1-9][\d \/().–-]{4,20}\d|0[1-9][\d \/().–-]{4,20}\d)/gi;
export function telefonAusHtml(html) {
  const tel = html.match(/href\s*=\s*["']tel:([+\d][\d\s/().-]{5,})["']/i);
  const text = htmlZuText(html);
  for (const m of text.matchAll(TEL_RE)) {
    if (m[1].toLowerCase() === 't' && !/(^|\n)\s*$/.test(text.slice(Math.max(0, m.index - 3), m.index + 1))) continue;
    const vorher = text.slice(Math.max(0, m.index - 120), m.index + 1);
    if (FREMD_KONTEXT.test(vorher.split('\n').slice(-2).join('\n'))) continue;
    const nr = m[2].replace(/[–]/g, '-').replace(/\s+/g, ' ').trim();
    const ziffern = nr.replace(/\D/g, '');
    if (ziffern.length < 7 || ziffern.length > 15) continue;
    return nr;
  }
  if (tel) {
    const nr = tel[1].replace(/\s+/g, ' ').trim();
    const ziffern = nr.replace(/\D/g, '');
    if (ziffern.length >= 7 && ziffern.length <= 15) return nr;
  }
  return null;
}

// ---------- Links zum Impressum/Kontakt ----------
export function linksFinden(html, basisUrl) {
  const basis = new URL(basisUrl);
  const impressum = [], kontakt = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = entities(m[1].trim()), txt = htmlZuText(m[2]).trim().toLowerCase();
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    let u; try { u = new URL(href, basis); } catch { continue; }
    if (basisDomain(u.host) !== basisDomain(basis.host) || /\.(pdf|jpe?g|png|zip|docx?)$/i.test(u.pathname)) continue;
    const s = `${decodeURIComponent(u.pathname).toLowerCase()} ${txt}`;
    if (/impressum|imprint|impress\b|anbieterkennzeichnung|rechtliche[s]? (hinweise|angaben)|legal notice|site notice|\bimpr\b/.test(s)) impressum.push(u.toString());
    else if (/kontakt|contact|anfahrt|ansprechpartner/.test(s)) kontakt.push(u.toString());
  }
  return { impressum: [...new Set(impressum)], kontakt: [...new Set(kontakt)] };
}

// ---------- Netz ----------
async function hole(url, ms = 15000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'de' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const typ = r.headers.get('content-type') || '';
  if (typ && !/html/i.test(typ)) throw new Error('kein HTML');
  const buf = new Uint8Array(await r.arrayBuffer()).slice(0, 2_000_000);
  let cs = (typ.match(/charset=([\w-]+)/i) || [])[1];
  if (!cs) { const kopf = new TextDecoder('latin1').decode(buf.slice(0, 4000)); cs = (kopf.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1]; }
  let html;
  try { html = new TextDecoder(cs || 'utf-8').decode(buf); } catch { html = new TextDecoder('utf-8').decode(buf); }
  return { url: r.url, html };
}
const robotsCache = new Map();
async function erlaubt(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    const regeln = [];
    try {
      const r = await fetch(`${u.origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        let aktiv = false, gruppeHatte = false;
        for (const zeile of (await r.text()).split('\n')) {
          const [k, ...v] = zeile.replace(/#.*/, '').split(':'); const wert = v.join(':').trim(); const key = k.trim().toLowerCase();
          if (key === 'user-agent') { if (gruppeHatte) { aktiv = false; gruppeHatte = false; } aktiv ||= wert === '*' || /hofladenliste/i.test(wert); }
          else if (key === 'disallow' || key === 'allow') { gruppeHatte = true; if (aktiv && key === 'disallow' && wert) regeln.push(wert); }
        }
      }
    } catch { /* keine robots.txt → erlaubt */ }
    robotsCache.set(u.origin, regeln);
  }
  return !robotsCache.get(u.origin).some((d) => u.pathname.startsWith(d.replace(/\*.*$/, '')));
}

const STANDARD_PFADE = ['/impressum', '/impressum/', '/impressum.html', '/impressum.php', '/de/impressum', '/impressum.htm', '/imprint'];

export async function pruefeWebsite(website) {
  let start = website.trim();
  if (!/^https?:\/\//i.test(start)) start = `https://${start}`;
  if (!(await erlaubt(start))) return { fehler: 'robots.txt' };
  let erste;
  try { erste = await hole(start); } catch (err) {
    // https nicht erreichbar → http versuchen (und umgekehrt)
    const alt = start.startsWith('https:') ? start.replace(/^https:/, 'http:') : start.replace(/^http:/, 'https:');
    try { erste = await hole(alt); } catch { throw err; }
  }
  const { impressum, kontakt } = linksFinden(erste.html, erste.url);
  const seiten = []; // [art, url]
  for (const u of impressum.slice(0, 2)) seiten.push(['impressum', u]);
  if (!impressum.length) for (const p of STANDARD_PFADE.slice(0, 3)) seiten.push(['impressum', new URL(p, erste.url).toString()]);
  for (const u of kontakt.slice(0, 1)) seiten.push(['kontakt', u]);

  const ergebnis = {};
  let impressumGefunden = false;
  const auswerten = (art, s) => {
    if (!ergebnis.email) {
      const mail = besteMail(mailsAusHtml(s.html), erste.url);
      if (mail) Object.assign(ergebnis, { email: mail, emailQuelle: s.url, art });
    }
    if (!ergebnis.telefon && art !== 'startseite') {
      const tel = telefonAusHtml(s.html);
      if (tel) Object.assign(ergebnis, { telefon: tel, telefonQuelle: s.url });
    }
  };
  for (const [art, url] of seiten) {
    if (ergebnis.email && ergebnis.telefon) break;
    if (art === 'kontakt' && ergebnis.email) break;
    if (art === 'impressum' && impressumGefunden) continue;
    try {
      if (!(await erlaubt(url))) continue;
      const s = await hole(url);
      if (art === 'impressum') {
        if (!/impressum|imprint|angaben gemäß|angaben gem\.|§\s*5|verantwortlich/i.test(s.html)) continue;
        impressumGefunden = true;
      }
      auswerten(art, s);
    } catch { /* nächste Seite */ }
  }
  // Startseite zuletzt (oft steht die Adresse im Fußbereich)
  if (!ergebnis.email) auswerten('startseite', erste);
  if (!ergebnis.telefon && !impressumGefunden) { const tel = telefonAusHtml(erste.html); if (tel) Object.assign(ergebnis, { telefon: tel, telefonQuelle: erste.url }); }
  if (!impressumGefunden) ergebnis.hinweis = 'kein-impressum';
  return ergebnis;
}

// Selbsttest und Hauptlauf nur beim direkten Aufruf
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
if (process.argv[2] === '--test') {
  const fall = (name, ist, soll) => { const ok = JSON.stringify(ist) === JSON.stringify(soll); console.log(ok ? 'OK    ' : 'FEHLER', name, '→', ist, ok ? '' : `(erwartet ${JSON.stringify(soll)})`); return ok; };
  const W = 'https://www.hof-sonnenschein.de/';
  const imp = (body) => `<html><body><h1>Impressum</h1>${body}</body></html>`;
  const r = [
    fall('mailto', besteMail(mailsAusHtml(imp('<p>E-Mail: <a href="mailto:info@hof-sonnenschein.de">Schreiben</a></p>')), W), 'info@hof-sonnenschein.de'),
    fall('[at]/[punkt]', besteMail(mailsAusHtml(imp('<p>E-Mail: kontakt [at] hof-sonnenschein [punkt] de</p>')), W), 'kontakt@hof-sonnenschein.de'),
    fall('(at) und Entity', besteMail(mailsAusHtml(imp('<p>Mail: info(at)hof-sonnenschein&#46;de</p>')), W), 'info@hof-sonnenschein.de'),
    fall('&#64;', besteMail(mailsAusHtml(imp('<p>E-Mail: info&#64;hof-sonnenschein.de</p>')), W), 'info@hof-sonnenschein.de'),
    fall('Cloudflare', besteMail(mailsAusHtml(imp(`<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="${(() => { const k = 0x42; return k.toString(16) + [...'info@hof-sonnenschein.de'].map((c) => (c.charCodeAt(0) ^ k).toString(16).padStart(2, '0')).join(''); })()}">[email&#160;protected]</a>`)), W), 'info@hof-sonnenschein.de'),
    fall('Freemail', besteMail(mailsAusHtml(imp('<p>Inhaber: Max Bauer<br>Telefon: 03562 1234<br>E-Mail: bauer.max@web.de</p>')), W), 'bauer.max@web.de'),
    fall('Webdesigner ignorieren', besteMail(mailsAusHtml(imp('<p>E-Mail: info@hof-sonnenschein.de</p><p>Webdesign: Agentur Pixel, kontakt@pixel-agentur.de</p>')), W), 'info@hof-sonnenschein.de'),
    fall('nur Webdesigner → nichts', besteMail(mailsAusHtml(imp('<p>Telefon 0123 45678</p><p>Gestaltung und Umsetzung: kontakt@pixel-agentur.de</p>')), W), null),
    fall('Datenschutzbeauftragter ignorieren', besteMail(mailsAusHtml(imp('<p>Datenschutzbeauftragte: dsb@kanzlei-recht.de</p>')), W), null),
    fall('fremde Domain ohne Label → nichts', besteMail(mailsAusHtml(imp('<p>Bilder von hallo@fotostudio.de</p>')), W), null),
    fall('fremde Domain mit Label', besteMail(mailsAusHtml(imp('<p>Bauer GbR<br>E-Mail: post@bauer-gbr.de</p>')), W), 'post@bauer-gbr.de'),
    fall('Bilddatei', besteMail(mailsAusHtml(imp('<img src="logo@2x.png"><p>E-Mail: info@hof-sonnenschein.de</p>')), W), 'info@hof-sonnenschein.de'),
    fall('info vor datenschutz', besteMail(mailsAusHtml(imp('<p>datenschutz@hof-sonnenschein.de</p><p>info@hof-sonnenschein.de</p>')), W), 'info@hof-sonnenschein.de'),
    fall('Muster-Adresse', besteMail(mailsAusHtml(imp('<p>E-Mail: max@mustermann.de</p>')), W), null),
    fall('Kontrollstelle davor, eigene Domain', besteMail(mailsAusHtml(imp('<p>Öko-Kontrollstelle: DE-ÖKO-039</p><p>E-Mail: info@hof-sonnenschein.de</p>')), W), 'info@hof-sonnenschein.de'),
    fall('Webdesign-Zeile, danach Freemail des Hofs', besteMail(mailsAusHtml(imp('<p>Webdesign: Pixel GmbH</p><p>Hof Sonnenschein</p><p>Dorfstraße 1</p><p>E-Mail: hof.sonne@gmx.de</p>')), W), 'hof.sonne@gmx.de'),
    fall('Telefon', telefonAusHtml(imp('<p>Tel.: 03562 / 12 34 5<br>Fax: 03562 / 12 34 6</p>')), '03562 / 12 34 5'),
    fall('Telefon +49', telefonAusHtml(imp('<p>Telefon: +49 (0) 35 62 - 12345</p>')), '+49 (0) 35 62 - 12345'),
    fall('Fax allein → nichts', telefonAusHtml(imp('<p>Fax: 03562 123456</p>')), null),
    fall('Telefon Webdesigner → nichts', telefonAusHtml(imp('<p>Webdesign: Pixel GmbH, Tel. 0301234567</p>')), null),
    fall('Impressum-Link', linksFinden('<a href="/rechtliches/impressum/">Impressum</a><a href="/kontakt">Kontakt</a><a href="https://andere.de/impressum">x</a>', W), { impressum: ['https://www.hof-sonnenschein.de/rechtliches/impressum/'], kontakt: ['https://www.hof-sonnenschein.de/kontakt'] }),
    fall('Impressum-Link nur Text', linksFinden('<a href="/seite-7.html"><span>Impressum</span></a>', W).impressum, ['https://www.hof-sonnenschein.de/seite-7.html']),
  ];
  const ok = r.filter(Boolean).length;
  console.log(`${ok}/${r.length} Fälle bestanden`);
  process.exit(ok === r.length ? 0 : 1);
}

// ---------- Hauptlauf ----------
const listeDatei = process.argv[2];
if (!listeDatei || !existsSync(listeDatei)) { console.error('Liste fehlt: erst LISTE_EXPORT=/tmp/liste.json node scripts/build.mjs'); process.exit(1); }
const max = parseInt(process.argv[3] || '6000', 10);
const liste = JSON.parse(readFileSync(listeDatei, 'utf8'));
const daten = existsSync(ZIEL) ? JSON.parse(readFileSync(ZIEL, 'utf8')) : {};
const heute = new Date().toISOString().slice(0, 10);
const alt = (d) => !d || (Date.now() - Date.parse(d)) / 864e5 > NEU_PRUEFEN_TAGE;
const domainVon = (w) => { try { return basisDomain(new URL(/^https?:/i.test(w) ? w : `https://${w}`).host); } catch { return null; } };

const proDomain = new Map();
for (const e of liste) { const d = e.website && domainVon(e.website); if (d) proDomain.set(d, (proDomain.get(d) || 0) + 1); }

const stat = { kandidaten: 0, domains: 0, email: 0, telefon: 0, impressum: 0, kontakt: 0, startseite: 0, keinImpressum: 0, nichts: 0, fehler: 0, plattform: 0 };
// Kandidaten je Domain bündeln: eine Abfrage pro Website
const gruppen = new Map();
for (const e of liste) {
  if (!e.website || e.email || !e.schluessel) continue;
  const domain = domainVon(e.website);
  if (!domain || FREMD.test(`${domain.split('.')[0]}.`) || FREMD.test(e.website.replace(/^https?:\/\//, ''))) continue;
  const vorher = daten[e.schluessel];
  if (vorher && !alt(vorher.geprueft)) continue;
  if (proDomain.get(domain) > MAX_EINTRAEGE_PRO_DOMAIN) { stat.plattform++; continue; }
  const k = e.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  if (!gruppen.has(k)) gruppen.set(k, { website: e.website, eintraege: [] });
  gruppen.get(k).eintraege.push(e);
}
const arbeit = [...gruppen.values()].slice(0, max);
stat.domains = arbeit.length;
stat.kandidaten = arbeit.reduce((s, g) => s + g.eintraege.length, 0);
console.log(`${stat.kandidaten} Einträge auf ${stat.domains} Websites werden geprüft (${stat.plattform} übersprungen: Plattform/Kette).`);

let index = 0, fertig = 0;
async function arbeiter() {
  while (index < arbeit.length) {
    const g = arbeit[index++];
    let r;
    try { r = await pruefeWebsite(g.website); } catch (err) { r = { fehler: String(err.message || err).slice(0, 60) }; }
    for (const e of g.eintraege) {
      const felder = {};
      if (r.email) felder.email = { wert: r.email, quelle: r.emailQuelle, stand: heute };
      if (r.telefon && !e.telefon) felder.telefon = { wert: r.telefon, quelle: r.telefonQuelle, stand: heute };
      daten[e.schluessel] = { ...(Object.keys(felder).length ? { felder } : {}), geprueft: heute,
        ...(r.hinweis ? { hinweis: r.hinweis } : {}), ...(r.fehler ? { fehler: r.fehler } : {}) };
      if (felder.email) { stat.email++; stat[r.art]++; }
      if (felder.telefon) stat.telefon++;
      if (r.fehler) stat.fehler++;
      else if (!Object.keys(felder).length) stat.nichts++;
      if (r.hinweis === 'kein-impressum') stat.keinImpressum++;
    }
    if (++fertig % 100 === 0) console.log(`${fertig}/${arbeit.length}`, JSON.stringify(stat));
  }
}
await Promise.all(Array.from({ length: 8 }, arbeiter));
writeFileSync(ZIEL, JSON.stringify(Object.fromEntries(Object.entries(daten).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n');
console.log('Fertig:', JSON.stringify(stat));
}
