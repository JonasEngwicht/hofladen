import { status, berlinZeit, parse } from './oh.js';
import { karteHtml, kmAnzeige } from './karte.js';
import { felderAusEintrag } from './vorbelegung.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const hofSlug = location.pathname.match(/^\/hof\/([a-z0-9-]+)\/$/)?.[1] || '';
const speicher = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const distanz = (aLat, aLon, bLat, bLon) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// ---------- Gemerkter Standort (PLZ-Suche oder Ortung, 30 Tage, nur in diesem Browser) ----------
const standortLesen = () => {
  try { const s = JSON.parse(speicher.get('standort') || 'null'); return s && Date.now() - s.t < 30 * 864e5 ? s : null; } catch { return null; }
};
const standortMerken = (lat, lon, label) => speicher.set('standort', JSON.stringify({ lat: +lat, lon: +lon, label, t: Date.now() }));
const kmText = (km) => kmAnzeige(km);
function zeigeEntfernungen(root = document) {
  const s = standortLesen();
  if (!s) return null;
  for (const k of $$('.laden[data-lat]', root)) {
    if (k.dataset.kmEigen) continue; // Entfernung kommt schon aus der Umkreissuche
    const km = distanz(s.lat, s.lon, +k.dataset.lat, +k.dataset.lon);
    k.dataset.km = Math.round(km * 10) / 10;
    const art = $('.laden-art', k);
    if (!art) continue;
    let el = $('.km', art);
    if (!el) { art.insertAdjacentHTML('beforeend', ' <span class="km"></span>'); el = $('.km', art); }
    el.textContent = kmText(km);
    el.title = `Luftlinie ab ${s.label}`;
  }
  return s;
}

// ---------- Öffnungsstatus ----------
function zeigeStatus(root = document) {
  for (const el of $$('.st[data-oh]', root)) {
    const s = status(el.dataset.oh, new Date(), el.closest('[data-land]')?.dataset.land || '');
    if (!s) continue;
    // Betriebsferien (Angabe des Betriebs) gehen vor
    const ymd = berlinZeit().ymd;
    const ferien = (el.closest('[data-urlaub]')?.dataset.urlaub || '').split(' ').map((x) => x.split('/')).find(([a, b]) => a <= ymd && ymd <= b);
    if (ferien) {
      el.className = 'st st-zu';
      el.innerHTML = `<b>Betriebsferien bis ${esc(new Date(`${ferien[1]}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }))}</b>`;
      continue;
    }
    el.className = `st ${s.offen === null ? 'st-unklar' : s.offen ? 'st-auf' : 'st-zu'}`;
    el.innerHTML = `<b>${esc(s.kurz)}</b><span>Heute ${esc(s.heute)}</span>`;
  }
  const heute = berlinZeit().tag;
  for (const tr of $$('.woche tr[data-tag]', root)) tr.classList.toggle('heute', +tr.dataset.tag === heute);
  // „Jetzt geöffnet“-Schalter zeigt, wie viele Einträge in der Liste gerade offen haben
  const offenKnopf = $('[data-offen-filter]');
  if (offenKnopf && root === document) {
    const n = $$('[data-liste] > .laden[data-oh]').filter((k) => status(k.dataset.oh, new Date(), k.dataset.land || '')?.offen === true).length;
    let z = $('span', offenKnopf);
    if (!z) { offenKnopf.insertAdjacentHTML('beforeend', ' <span></span>'); z = $('span', offenKnopf); }
    z.textContent = n;
  }
}
zeigeStatus();
// Status jede Minute neu berechnen (Seite bleibt offen, Laden öffnet oder schließt)
setInterval(() => zeigeStatus(), 60000);

// ---------- Karten (Leaflet, erst nach Zustimmung) ----------
let leafletLaden;
function ladeLeaflet() {
  if (!leafletLaden) {
    leafletLaden = new Promise((ok, fehler) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = '/vendor/leaflet.css';
      document.head.append(css);
      const js = document.createElement('script');
      js.src = '/vendor/leaflet.js'; js.onload = () => ok(window.L); js.onerror = fehler;
      document.head.append(js);
    });
  }
  return leafletLaden;
}
const FARBE = { hofladen: '#F4C430', automat: '#6B8F7E' };
const karten = [];

async function starteKarte(panel) {
  if (panel.dataset.geladen) return;
  panel.dataset.geladen = '1';
  panel.classList.add('aktiv');
  const L = await ladeLeaflet();
  const flaeche = $('.karte-flaeche', panel);
  const map = L.map(flaeche, { preferCanvas: true, scrollWheelZoom: !!panel.closest('[data-vollkarte]') });
  await kachelEbene(L).then((ebene) => ebene.addTo(map));
  const ctx = { map, L, panel, marker: new Map() };
  karten.push(ctx);

  const hofKopf = $('.hof-kopf');
  if (panel.closest('[data-vollkarte]')) await vollkarte(ctx);
  else if (hofKopf && panel.closest('.hof-karte')) {
    const p = [+hofKopf.dataset.lat, +hofKopf.dataset.lon];
    L.circleMarker(p, punktStil(hofKopf.dataset.typ, true)).addTo(map);
    map.setView(p, 14);
  } else listenKarte(ctx);
}

// Kartenhintergrund: eigene Vektorkacheln vom eigenen Server (data-kacheln), sonst OSM-Kacheln nach Zustimmung
const KACHELN = document.documentElement.dataset.kacheln || '';
const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende';
let protomapsLaden, zugestimmt = false;
async function kachelEbene(L) {
  if (KACHELN) {
    try {
      protomapsLaden ||= new Promise((ok, fehler) => {
        const js = document.createElement('script');
        js.src = '/vendor/protomaps-leaflet.js'; js.onload = () => ok(window.protomapsL); js.onerror = fehler;
        document.head.append(js);
      });
      const pl = await protomapsLaden;
      return pl.leafletLayer({ url: `/kacheln/${KACHELN}/{z}/{x}/{y}.mvt`, flavor: 'light', lang: 'de', maxDataZoom: +document.documentElement.dataset.kachelnZ || 14,
        attribution: `${OSM_ATTR} · <a href="https://protomaps.com/">Protomaps</a>` });
    } catch (e) { console.warn('Eigene Kacheln nicht verfügbar', e); }
    // Ersatz von OpenStreetMap nur mit Zustimmung (Klick auf „Karte laden“ oder gemerkt)
    if (!zugestimmt && speicher.get('karteOk') !== '1') return L.layerGroup();
  }
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM_ATTR });
}

function punktStil(typ, gross = false) {
  return { radius: gross ? 10 : 7, color: '#173B2C', weight: 2, fillColor: FARBE[typ] || FARBE.hofladen, fillOpacity: 1 };
}

function listenKarte(ctx) {
  const { map, L } = ctx;
  const punkte = [];
  for (const k of $$('[data-liste] .laden, [data-umgebung-liste] .laden')) {
    const p = [+k.dataset.lat, +k.dataset.lon];
    const titel = $('.laden-name a', k);
    const m = L.circleMarker(p, punktStil(k.dataset.typ)).addTo(map)
      .bindPopup(`<a href="${esc(titel.getAttribute('href'))}"><b>${esc(titel.textContent)}</b></a><br>${esc($('.laden-art', k).firstChild.textContent)}`);
    m.on('click', () => { k.scrollIntoView({ behavior: 'smooth', block: 'center' }); markiere(k); });
    k.addEventListener('mouseenter', () => m.setStyle({ radius: 11, weight: 3 }));
    k.addEventListener('mouseleave', () => m.setStyle({ radius: 7, weight: 2 }));
    ctx.marker.set(k, m);
    punkte.push(p);
  }
  const ort = window.__plzOrt;
  if (ort) punkte.push([ort.lat, ort.lon]);
  map.invalidateSize();
  if (punkte.length) map.fitBounds(punkte, { padding: [30, 30], maxZoom: 13 });
  else map.setView([51.2, 10.4], 6);
  setTimeout(() => { map.invalidateSize(); if (punkte.length) map.fitBounds(punkte, { padding: [30, 30], maxZoom: 13 }); }, 200);
  if (ort) L.circleMarker([ort.lat, ort.lon], { radius: 6, color: '#fff', weight: 3, fillColor: '#A2334F', fillOpacity: 1 }).addTo(map).bindTooltip(`PLZ ${ort.plz}`);
  syncFilterKarte();
}

function markiere(k) {
  k.classList.add('markiert');
  setTimeout(() => k.classList.remove('markiert'), 1600);
}

// Betreiber-Bereich (/betrieb/) als eigenes Modul
if ($('[data-betrieb]')) import(new URL('./betrieb.js' + new URL(import.meta.url).search, import.meta.url)).then((m) => m.betrieb());

// Hof-News der Betriebe („Spargel ist da!“): auf Hofseiten, an Karten in Listen und auf der Startseite
async function neuigkeitenZeigen() {
  const karten = $$('.laden[data-slug]');
  const start = $('[data-news-start]');
  if (!hofSlug && !karten.length && !start) return;
  const sids = hofSlug ? [hofSlug] : karten.map((k) => k.dataset.slug).slice(0, 200);
  let d;
  try { d = await (await fetch(start && !karten.length ? '/api/neuigkeiten' : `/api/neuigkeiten?sids=${encodeURIComponent(sids.join(','))}`)).json(); } catch { return; }
  const news = d.neuigkeiten || [];
  if (!news.length) return;
  const proHof = new Map();
  for (const n of news) if (!proHof.has(n.pfad)) proHof.set(n.pfad, n);
  for (const k of karten) {
    const n = proHof.get(`/hof/${k.dataset.slug}/`);
    if (n && !$('.news-badge', k)) $('.laden-name', k)?.insertAdjacentHTML('afterend', `<p class="news-badge news-${esc(n.art)}">${esc(n.text)}</p>`);
  }
  if (hofSlug) {
    const n = news[0];
    $('.hof-kopf h1')?.insertAdjacentHTML('afterend', `<p class="news-badge news-${esc(n.art)}">${esc(n.text)} <span>Meldung des Betriebs, bis ${esc(new Date(`${n.bis}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }))}</span></p>`);
  }
  if (start) {
    const st = standortLesen();
    const dist = (n) => (st ? Math.hypot(n.lat - st.lat, (n.lon - st.lon) * 0.63) : 0);
    const liste = [...proHof.values()].filter((n) => !st || dist(n) < 0.9).sort((a, b) => dist(a) - dist(b)).slice(0, 6);
    if (!liste.length) return;
    $('[data-news-start-liste]', start).innerHTML = liste.map((n) => `<li><a href="${esc(n.pfad)}"><b>${esc(n.text)}</b><span>${esc(n.titel)} · ${esc(n.ort)}</span></a></li>`).join('');
    $('h2', start).textContent = st ? 'Neu und frisch in deiner Region' : 'Neu und frisch auf den Höfen';
    start.hidden = false;
  }
}
neuigkeitenZeigen();

// Die Vollkarte (Cluster, Filter, Liste) liegt in einem eigenen Modul und wird erst mit der Karte geladen
async function vollkarte(ctx) {
  const modul = await import(new URL('./vollkarte.js' + new URL(import.meta.url).search, import.meta.url));
  await modul.vollkarte(ctx, { params, standortMerken, standortLesen, merkAnzeige });
}

for (const panel of $$('[data-karte]')) {
  $('[data-karte-laden]', panel)?.addEventListener('click', () => {
    zugestimmt = true;
    if ($('[data-karte-merken]', panel)?.checked) speicher.set('karteOk', '1');
    starteKarte(panel);
  });
}
// Mit gespeicherter Zustimmung lädt die Karte erst, wenn sie in den sichtbaren Bereich kommt
function karteAutomatisch() {
  // Eigene Kacheln brauchen keine Zustimmung (keine Anfrage an Dritte)
  if (speicher.get('karteOk') !== '1' && !KACHELN) return;
  const panels = $$('[data-karte]');
  if (!('IntersectionObserver' in window)) return panels.forEach((p) => starteKarte(p));
  const io = new IntersectionObserver((eintraege) => {
    for (const e of eintraege) if (e.isIntersecting) { io.unobserve(e.target); starteKarte(e.target); }
  }, { rootMargin: '200px 0px' });
  for (const p of panels) io.observe(p);
}

// Höhe der klebenden Filterleiste für die Kartenspalte
const wz = $('.werkzeug');
if (wz) {
  const setze = () => document.documentElement.style.setProperty('--wz', wz.offsetHeight + 'px');
  setze();
  addEventListener('resize', setze);
}

// ---------- Filter auf Kreisseiten ----------
const filter = { typ: 'alle', offen: false, sonntag: false, bio: false, rund: false, karte: false, kinder: false, oepnv: false, radius: null, kat: new Set() };
const rundUmDieUhr = (oh) => { try { const w = oh && parse(oh); return !!w && w.every((iv) => iv.some(([a, b]) => a === 0 && b >= 1440)); } catch { return false; } };
const sonntagsOffen = (oh) => { try { return !!oh && !!parse(oh)?.[6]?.length; } catch { return false; } };
function wendeFilterAn() {
  const karten = $$('[data-liste] > .laden');
  let n = 0;
  for (const k of karten) {
    let ok = filter.typ === 'alle' || k.dataset.typ === filter.typ;
    if (ok && filter.offen) ok = !!k.dataset.oh && status(k.dataset.oh, new Date(), k.dataset.land || '')?.offen === true;
    if (ok && filter.sonntag) ok = sonntagsOffen(k.dataset.oh);
    if (ok && filter.bio) ok = k.dataset.bio === '1';
    if (ok && filter.rund) ok = rundUmDieUhr(k.dataset.oh);
    if (ok && filter.karte) ok = k.dataset.karteZahlung === '1';
    if (ok && filter.kinder) ok = k.dataset.kinder === '1';
    if (ok && filter.oepnv) ok = k.dataset.oepnv === '1';
    if (ok && filter.radius) ok = +k.dataset.km <= filter.radius;
    if (ok && filter.kat.size) { const ks = k.dataset.kat.split(' '); ok = [...filter.kat].every((x) => ks.includes(x)); }
    k.hidden = !ok;
    if (ok) n++;
  }
  const z = $('[data-trefferzahl]');
  if (z) { z.textContent = n; z.nextSibling.textContent = n === 1 ? ' Eintrag' : ' Einträge'; }
  const leer = $('[data-leer-filter]');
  if (leer) leer.hidden = n > 0 || !karten.length;
  syncFilterKarte();
}
function syncFilterKarte() {
  for (const ctx of karten) for (const [k, m] of ctx.marker) {
    if (k.hidden) ctx.map.removeLayer(m); else if (!ctx.map.hasLayer(m)) m.addTo(ctx.map);
  }
}
for (const b of $$('[data-typ-filter]')) b.addEventListener('click', () => {
  filter.typ = b.dataset.typFilter;
  for (const x of $$('[data-typ-filter]')) x.setAttribute('aria-pressed', String(x === b));
  wendeFilterAn();
});
$('[data-offen-filter]')?.addEventListener('click', (ev) => {
  filter.offen = !filter.offen;
  ev.currentTarget.setAttribute('aria-pressed', String(filter.offen));
  wendeFilterAn();
});
for (const b of $$('[data-radius-filter]')) b.addEventListener('click', () => {
  const r = +b.dataset.radiusFilter;
  const groesster = Math.max(...$$('[data-radius-filter]').map((x) => +x.dataset.radiusFilter));
  filter.radius = r === groesster ? null : r;
  for (const x of $$('[data-radius-filter]')) x.setAttribute('aria-pressed', String(x === b));
  wendeFilterAn();
});
for (const [attr, key] of [['data-sonntag-filter', 'sonntag'], ['data-bio-filter', 'bio'], ['data-rund-filter', 'rund'], ['data-kinder-filter', 'kinder'], ['data-oepnv-filter', 'oepnv']]) $(`[${attr}]`)?.addEventListener('click', (ev) => {
  filter[key] = !filter[key];
  ev.currentTarget.setAttribute('aria-pressed', String(filter[key]));
  wendeFilterAn();
});
for (const b of $$('[data-kat-filter]')) b.addEventListener('click', () => {
  const k = b.dataset.katFilter;
  if (filter.kat.has(k)) filter.kat.delete(k); else filter.kat.add(k);
  b.setAttribute('aria-pressed', String(filter.kat.has(k)));
  wendeFilterAn();
});
function filterZuruecksetzen() {
  filter.typ = 'alle'; filter.offen = false; filter.sonntag = false; filter.bio = false; filter.rund = false; filter.karte = false; filter.kinder = false; filter.oepnv = false; filter.radius = null; filter.kat.clear();
  const radien = $$('[data-radius-filter]');
  radien.forEach((x, i) => x.setAttribute('aria-pressed', String(i === radien.length - 1)));
  for (const x of $$('[data-typ-filter]')) x.setAttribute('aria-pressed', String(x.dataset.typFilter === 'alle'));
  for (const x of $$('[data-kat-filter], [data-offen-filter], [data-sonntag-filter], [data-bio-filter], [data-rund-filter], [data-karte-filter], [data-kinder-filter], [data-oepnv-filter]')) x.setAttribute('aria-pressed', 'false');
  wendeFilterAn();
}
$('[data-karte-filter]')?.addEventListener('click', (ev) => {
  filter.karte = !filter.karte;
  ev.currentTarget.setAttribute('aria-pressed', String(filter.karte));
  wendeFilterAn();
});
$('[data-filter-zuruecksetzen]')?.addEventListener('click', filterZuruecksetzen);
// Vorauswahl über die Adresse, z. B. ?filter=sonntag, ?filter=bio oder ?produkt=eier (Links von den Übersichtsseiten)
{
  // Angebot aus der Suche (Startseite „Was suchst du?“) als aktiven Filter setzen und sichtbar machen
  const gewaehlt = params.getAll('produkt').flatMap((x) => x.split(',')).filter(Boolean).map((p) => $(`[data-kat-filter="${CSS.escape(p)}"]`)).filter(Boolean);
  for (const b of gewaehlt) b.click();
  const leiste = $('.werkzeug');
  if (gewaehlt.length && leiste) {
    leiste.insertAdjacentHTML('beforebegin', `<p class="filter-aktiv" role="status">Aktiver Filter aus deiner Suche: <b>${gewaehlt.map((b) => esc(b.textContent.trim())).join(', ')}</b> · <button type="button" class="link" data-filter-zuruecksetzen>Filter entfernen</button></p>`);
    $('.filter-aktiv [data-filter-zuruecksetzen]').addEventListener('click', (ev) => { filterZuruecksetzen(); ev.target.closest('.filter-aktiv').remove(); });
  }
}
for (const f of (params.get('filter') || '').split(',')) {
  if (f === 'sonntag') $('[data-sonntag-filter]')?.click();
  if (f === 'bio') $('[data-bio-filter]')?.click();
  if (f === 'offen') $('[data-offen-filter]')?.click();
  if (f === 'rund') $('[data-rund-filter]')?.click();
}

// ---------- PLZ-Suche: nach Entfernung sortieren ----------
const plz = params.get('plz');
const produkte = (params.get('produkt') || '').split(',').filter(Boolean);
async function plzModus() {
  const liste = $('[data-liste]');
  if (!liste || !/^\d{5}$/.test(plz || '')) return;
  speicher.set('letztePlz', plz);
  try {
    const r = await fetch(`/api/umkreis?plz=${plz}&limit=40&radius=30${produkte.length ? `&produkt=${produkte.join(',')}` : ''}`);
    const d = await r.json();
    if (!r.ok) return;
    window.__plzOrt = d.ort;
    standortMerken(d.ort.lat, d.ort.lon, `PLZ ${d.ort.plz} (${d.ort.name})`);
    const karten = $$('.laden', liste);
    for (const k of karten) {
      const km = Math.round(distanz(d.ort.lat, d.ort.lon, +k.dataset.lat, +k.dataset.lon) * 10) / 10;
      k.dataset.km = km;
      k.dataset.kmEigen = '1';
      const art = $('.laden-art', k);
      if (!$('.km', art)) art.insertAdjacentHTML('beforeend', ` <span class="km">${kmAnzeige(km)}</span>`);
    }
    karten.sort((a, b) => a.dataset.km - b.dataset.km);
    const vor = $('[data-leer-filter]', liste);
    for (const k of karten) liste.insertBefore(k, vor);
    const hinweis = $('[data-plz-hinweis]');
    if (hinweis) {
      hinweis.textContent = `Sortiert nach Entfernung zu PLZ ${d.ort.plz} (${d.ort.name}).`;
      hinweis.hidden = false;
    }
    const vorhanden = new Set(karten.map((k) => k.dataset.slug));
    const naechsteHier = karten.length ? +karten[0].dataset.km : Infinity;
    const andere = d.ergebnisse.filter((e) => !vorhanden.has(e.slug) && (e.km < 12 || e.km < naechsteHier + 5)).slice(0, 6);
    if (andere.length) {
      $('[data-umgebung-liste]').innerHTML = andere.map((e) => karteHtml(e)).join('');
      $('[data-umgebung]').hidden = false;
      zeigeStatus($('[data-umgebung]'));
    }
  } catch {}
}

// ---------- „In meiner Nähe“ auf Kategorieseiten ----------
for (const box of $$('[data-naehe]')) {
  const start = $('[data-naehe-start]', box), meldung = $('[data-naehe-status]', box), liste = $('[data-naehe-liste]', box);
  const nurOffen = $('[data-naehe-offen]', box);
  if (!('geolocation' in navigator)) { start.hidden = true; nurOffen.parentElement.hidden = true; continue; }
  const filterAnwenden = () => {
    let n = 0;
    for (const k of $$('.laden', liste)) { k.hidden = nurOffen.checked && !(k.dataset.oh && status(k.dataset.oh)?.offen); if (!k.hidden) n++; }
    if (liste.children.length) { meldung.textContent = n ? `${n} Treffer im Umkreis von 40 km.` : 'Gerade ist hier in der Nähe nichts geöffnet.'; meldung.hidden = false; }
  };
  nurOffen.addEventListener('change', filterAnwenden);
  start.addEventListener('click', () => {
    start.disabled = true; meldung.hidden = false; meldung.textContent = 'Standort wird ermittelt …';
    navigator.geolocation.getCurrentPosition(async (pos) => {
      standortMerken(pos.coords.latitude, pos.coords.longitude, 'deinem Standort');
      try {
        const f = JSON.parse(box.dataset.naehe || '{}');
        const q = new URLSearchParams({ lat: pos.coords.latitude.toFixed(4), lon: pos.coords.longitude.toFixed(4), limit: 24, radius: 40, ...f });
        const d = await (await fetch(`/api/umkreis?${q}`)).json();
        liste.innerHTML = (d.ergebnisse || []).map((e) => karteHtml(e)).join('');
        for (const k of $$('.laden', liste)) k.dataset.kmEigen = '1';
        zeigeStatus(liste);
        if (!d.ergebnisse?.length) meldung.textContent = 'Im Umkreis von 40 km haben wir dazu noch keine Einträge.';
        else filterAnwenden();
      } catch { meldung.textContent = 'Die Suche hat gerade nicht geklappt.'; }
      start.disabled = false;
    }, () => { start.disabled = false; meldung.textContent = 'Standort nicht verfügbar – bitte oben die Postleitzahl eingeben.'; }, { timeout: 10000, maximumAge: 600000 });
  });
}

// ---------- Startseite ----------
function startseite() {
  if (params.get('fehler') === 'plz') {
    $('#plz-fehler') && ($('#plz-fehler').hidden = false);
    if ($('#plz') && plz) $('#plz').value = plz;
  }
  const fehlerOrt = params.get('fehler');
  const box = $('#ort-auswahl');
  if (box && (fehlerOrt === 'ort' || fehlerOrt === 'ort-unbekannt')) {
    const q = params.get('q') || '';
    $('#plz').value = q;
    box.hidden = false;
    box.innerHTML = fehlerOrt === 'ort-unbekannt'
      ? `<p class="fehler">Einen Ort „${esc(q)}“ kennen wir nicht. Prüf die Schreibweise oder gib die Postleitzahl ein.</p>`
      : '<p>Suche läuft …</p>';
    if (fehlerOrt === 'ort') Promise.all([fetch(`/api/orte?alle=1&q=${encodeURIComponent(q)}`).then((r) => r.json()), fetch(`/api/hoefe?limit=6&q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({}))]).then(([d, h]) => {
      box.innerHTML = (d.treffer?.length
        ? `<p class="ort-auswahl-titel">Welches ${esc(q)} meinst du?</p><ul>${d.treffer.map((t) => `<li><a href="/suche?q=${encodeURIComponent(`${t.name}, ${t.kreis}`)}"><b>${esc(t.name)}</b><span>${esc(t.kreis)} · ${esc(t.plz)}</span></a></li>`).join('')}</ul>`
        : `<p class="fehler">Einen Ort „${esc(q)}“ kennen wir nicht. Gib am besten die Postleitzahl ein.</p>`)
        + (h.treffer?.length ? `<p class="ort-auswahl-titel">Oder meinst du einen Hof?</p><ul>${h.treffer.map((e) => `<li><a href="${esc(e.pfad)}"><b>${esc(e.titel)}</b><span>${esc(e.art)} · ${esc(e.ort)}</span></a></li>`).join('')}</ul>${h.gesamt > h.treffer.length ? `<p><a href="/hofsuche/?q=${encodeURIComponent(q)}">Alle ${h.gesamt} Höfe zu „${esc(q)}“</a></p>` : ''}` : '');
    }).catch(() => { box.innerHTML = '<p class="fehler">Die Ortssuche hat gerade nicht geklappt. Gib bitte die Postleitzahl ein.</p>'; });
  }
  const zuletzt = $('#zuletzt');
  const l = speicher.get('letztePlz');
  if (zuletzt && l && /^\d{5}$/.test(l)) {
    zuletzt.innerHTML = `Zuletzt gesucht: <a href="/plz/${l}">${l}</a>`;
    zuletzt.hidden = false;
  }
  const standort = $('#standort');
  if (standort) {
    if (!('geolocation' in navigator)) standort.hidden = true;
    standort.addEventListener('click', () => {
      standort.disabled = true;
      standort.lastChild.textContent = 'Standort wird ermittelt …';
      navigator.geolocation.getCurrentPosition(async (pos) => {
        standortMerken(pos.coords.latitude, pos.coords.longitude, 'deinem Standort');
        const prod = $$('.wunsch input:checked').map((i) => i.value);
        const r = await fetch(`/api/umkreis?lat=${pos.coords.latitude.toFixed(4)}&lon=${pos.coords.longitude.toFixed(4)}&limit=9&radius=40${prod.length ? `&produkt=${prod.join(',')}` : ''}`);
        const d = await r.json();
        const box = $('#naehe');
        standort.hidden = true;
        box.hidden = false;
        box.innerHTML = d.ergebnisse?.length
          ? `<h2>In deiner Nähe</h2><div class="karten-reihe">${d.ergebnisse.map((e) => karteHtml(e)).join('')}</div><p><a class="mehr" href="${esc(d.ort.kreisPfad)}">Alle Einträge im Kreis ${esc(d.ort.name)}</a></p>`
          : '<h2>In deiner Nähe</h2><p>Im Umkreis von 40 km haben wir noch keine passenden Einträge.</p>';
        zeigeStatus(box);
        box.scrollIntoView({ behavior: 'smooth' });
      }, () => {
        standort.disabled = false;
        standort.lastChild.textContent = 'Standort nicht verfügbar – bitte PLZ eingeben';
      }, { timeout: 10000, maximumAge: 600000 });
    });
  }
  // Saison steht schon im HTML (Monat beim Bauen); nur bei einem anderen Monat neu rechnen
  const saison = $('[data-saison]');
  if (saison && +saison.dataset.saisonStand !== berlinMonat()) $('[data-saison-inhalt]', saison).innerHTML = saisonHtml(JSON.parse(saison.dataset.saison), berlinMonat());
  // Angebotswahl aus Links wie /?produkt=gemuese#plz vorbelegen
  for (const p of params.getAll('produkt').flatMap((x) => x.split(','))) { const i = $(`.wunsch input[value="${CSS.escape(p)}"]`); if (i) i.checked = true; }
}

// ---------- Saisonkalender: Monat hervorheben, Obst/Gemüse filtern, Sorte suchen, Monatsansicht ----------
const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function berlinMonat() { return +new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(5, 7); }
function saisonHtml(daten, monat, filter = () => true) {
  const chip = ([n, , , pfad]) => `<li><a href="${esc(pfad)}">${esc(n)}</a></li>`;
  const frisch = daten.filter((d) => d[1].includes(monat) && filter(d)), lager = daten.filter((d) => d[2].includes(monat) && filter(d));
  return `<p class="saison-monat">Im ${MONATSNAMEN[monat - 1]} frisch vom Feld${frisch.length ? ':' : ' kommt vor allem Lagerware.'}</p>${frisch.length ? `<ul class="saison-chips">${frisch.map(chip).join('')}</ul>` : ''}${lager.length ? `<p class="saison-monat lager-titel">Aus dem Lager:</p><ul class="saison-chips lager">${lager.map(chip).join('')}</ul>` : ''}`;
}
{
  const monat = berlinMonat();
  for (const c of $$('.saison-tabelle .aktuell')) { c.classList.remove('aktuell'); c.removeAttribute('aria-current'); }
  for (const c of $$(`.saison-tabelle [data-monat="${monat}"]`)) c.classList.add('aktuell');
  const werkzeug = $('[data-saison-werkzeug]');
  if (werkzeug) {
    const zeilen = $$('.saison-tabelle tbody tr');
    // Daten für die Monatsansicht aus der Tabelle lesen: [Name, frisch[], lager[], Pfad, Gruppe]
    const daten = zeilen.map((tr) => [tr.querySelector('th').textContent.trim(),
      $$('td.frisch', tr).map((td) => +td.dataset.monat), $$('td.lager', tr).map((td) => +td.dataset.monat),
      tr.querySelector('th a')?.getAttribute('href') || '/saisonkalender/', tr.dataset.gruppe, tr.dataset.name]);
    const wahl = $('[data-saison-monat-wahl]', werkzeug), suche = $('[data-saison-suche]', werkzeug), ansicht = $('[data-saison-monatsansicht]');
    let gruppe = 'alle';
    if (+wahl.value !== monat) wahl.value = String(monat);
    const anwenden = () => {
      const q = suche.value.trim().toLowerCase();
      const passt = (d) => (gruppe === 'alle' || d[4] === gruppe) && (!q || d[5].includes(q));
      for (const [i, tr] of zeilen.entries()) tr.hidden = !passt(daten[i]);
      ansicht.innerHTML = saisonHtml(daten, +wahl.value, passt);
      for (const c of $$('.saison-tabelle .gewaehlt')) c.classList.remove('gewaehlt');
      for (const c of $$(`.saison-tabelle [data-monat="${wahl.value}"]`)) c.classList.add('gewaehlt');
    };
    werkzeug.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-saison-gruppe]');
      if (!b) return;
      gruppe = b.dataset.saisonGruppe;
      for (const x of $$('[data-saison-gruppe]', werkzeug)) x.setAttribute('aria-pressed', String(x === b));
      anwenden();
    });
    suche.addEventListener('input', anwenden);
    wahl.addEventListener('change', anwenden);
    document.documentElement.classList.add('saison-js');
    anwenden();
  }
}

// Formulare: PLZ oder Ortsname; reine Ziffern müssen fünfstellig sein
for (const form of $$('form[action="/suche"]')) {
  form.addEventListener('submit', (ev) => {
    const i = $('input[name="q"]', form);
    if (!i) return;
    i.value = i.value.trim();
    const nurZiffern = /^[\d\s]+$/.test(i.value);
    if (nurZiffern) i.value = i.value.replace(/\D/g, '');
    if (!i.value || (nurZiffern && !/^\d{5}$/.test(i.value)) || (!nurZiffern && i.value.length < 2)) {
      ev.preventDefault();
      i.setCustomValidity(nurZiffern ? 'Bitte eine fünfstellige Postleitzahl eingeben.' : 'Bitte einen Ortsnamen oder eine Postleitzahl eingeben.');
      i.reportValidity();
      i.focus();
    }
  });
}
// Ortsvorschläge beim Tippen
const vorschlagListe = $('#orte-vorschlaege');
let vorschlagTimer = 0, vorschlagLetzt = '';
for (const i of $$('input[list="orte-vorschlaege"]')) i.addEventListener('input', () => {
  i.setCustomValidity('');
  clearTimeout(vorschlagTimer);
  const q = i.value.trim();
  if (q.length < 2 || /^\d/.test(q) || q === vorschlagLetzt) return;
  vorschlagTimer = setTimeout(async () => {
    try {
      const d = await (await fetch(`/api/orte?hoefe=1&q=${encodeURIComponent(q)}`)).json();
      vorschlagLetzt = q;
      vorschlagListe.innerHTML = (d.treffer || []).map((t) => `<option value="${esc(t.wert)}">${esc(t.wert === t.name ? `${t.kreis} · ${t.plz}` : t.plz)}</option>`).join('')
        + (d.hoefe || []).map((h) => `<option value="${esc(h.wert)}">${esc(`${h.art} · ${h.ort}`)}</option>`).join('');
    } catch {}
  }, 150);
});

// Mitmachen: Korrektur zu einem bestimmten Hof vorbereiten (?hof=slug&thema=zeiten)
{
  const mail = $('#mail-link');
  const hof = params.get('eintrag') || params.get('hof');
  if (mail && hof && /^[a-z0-9-]{1,120}$/i.test(hof)) {
    const thema = params.get('thema');
    const zeiten = thema === 'zeiten' || params.get('fokus') === 'zeiten', uebernahme = thema === 'uebernahme' || params.get('aktion') === 'uebernehmen';
    const adresse = mail.getAttribute('href').replace(/^mailto:/, '').split('?')[0];
    const betreff = zeiten ? `Öffnungszeiten: ${hof}` : uebernahme ? `Eintrag übernehmen: ${hof}` : `Korrektur: ${hof}`;
    const text = `Eintrag: ${location.origin}/hof/${hof}/bearbeiten/\n\n${zeiten ? 'Die Öffnungszeiten sind:\nMo:\nDi:\nMi:\nDo:\nFr:\nSa:\nSo:\n\nWoher weißt du das (z. B. Schild am Hof, Website)?\n'
      : uebernahme ? 'Ich betreibe diesen Hof und möchte den Eintrag selbst pflegen.\n\nName des Betriebs:\nAnsprechperson:\nTelefon:\nWebsite (falls vorhanden):\n\nÖffnungszeiten:\nAngebot:\n'
      : 'Was soll geändert werden?\n'}`;
    mail.href = `mailto:${adresse}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
    mail.textContent = zeiten ? 'Öffnungszeiten per E-Mail schicken' : uebernahme ? 'Übernahme per E-Mail anfragen' : 'Korrektur per E-Mail schicken';
  }
}

// ---------- Formular „Mitmachen“: Vorbelegung, Fotos verkleinern, Absenden ----------
const meldeForm = $('[data-meldeform]');
if (meldeForm) {
  meldeForm.elements.t.value = Date.now();
  // Bearbeiten-Link: ?eintrag=<stabile ID>&aktion=ergaenzen|uebernehmen (alt: ?hof=<slug>&thema=…)
  const eintragId = params.get('eintrag') || params.get('hof');
  const aktion = params.get('aktion') || (params.get('thema') === 'uebernahme' ? 'uebernehmen' : eintragId ? 'ergaenzen' : '');
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) if (params.get(k)) meldeForm.elements[k].value = params.get(k).slice(0, 80);
  // ?angebot=weihnachtsbaeume (z. B. von der Saisonseite): Angebot vorauswählen
  for (const i of meldeForm.querySelectorAll('input[name="angebot"]')) if (params.getAll('angebot').includes(i.value)) i.checked = true;
  const box = $('[data-melde-hof]');
  const artWaehlen = (wert) => {
    const r = meldeForm.querySelector(`input[name="art"][value="${wert}"]`);
    if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
  };
  const modus = () => {
    const art = meldeForm.querySelector('input[name="art"]:checked')?.value;
    meldeForm.elements.kontakt_email.required = art === 'uebernahme';
    for (const x of $$('[data-nur-uebernahme]', meldeForm)) x.hidden = art !== 'uebernahme';
    if (art === 'neu' && meldeForm.elements.eintrag.value) { meldeForm.elements.hof.value = ''; meldeForm.elements.eintrag.value = ''; box.hidden = true; $('[data-melde-titel]').textContent = 'Hofladen kostenlos eintragen'; for (const x of $$('[data-intro]')) x.hidden = false; for (const x of $$('.fehlt', meldeForm)) x.classList.remove('fehlt'); }
  };
  for (const r of meldeForm.querySelectorAll('input[name="art"]')) r.addEventListener('change', modus);
  if (eintragId && /^[a-z0-9-]{1,120}$/i.test(eintragId)) {
    artWaehlen(aktion === 'uebernehmen' ? 'uebernahme' : 'korrektur');
    fetch(`/api/eintrag?id=${encodeURIComponent(eintragId)}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const e = d?.eintrag;
      if (!e) {
        artWaehlen('neu');
        box.innerHTML = '<p><b>Diesen Eintrag haben wir nicht gefunden.</b> Vielleicht ist der Link veraltet. Du kannst den Hof hier neu eintragen – oder ihn über die Suche oben finden und dort auf „Eintrag ergänzen“ gehen.</p>';
        box.hidden = false;
        return;
      }
      meldeForm.elements.hof.value = e.slug;
      meldeForm.elements.eintrag.value = e.id;
      const v = felderAusEintrag(e);
      for (const [k, w] of Object.entries(v.werte)) if (meldeForm.elements[k] && !meldeForm.elements[k].value) meldeForm.elements[k].value = w;
      for (const [k, liste] of Object.entries(v.haken)) for (const x of meldeForm.querySelectorAll(`input[name="${k}"]`)) x.checked = liste.includes(x.value);
      if (v.zeiten?.rund) meldeForm.elements.rund.checked = true;
      for (const [k, w] of Object.entries(v.zeiten?.felder || {})) if (meldeForm.elements[k]) meldeForm.elements[k].value = w;
      if (v.bisher) { const b = $('[data-bisher-zeiten]', meldeForm); b.textContent = `Bisher hinterlegt: ${v.bisher}`; b.hidden = false; }
      for (const f of v.fehlt) for (const x of $$(`[data-feld="${f}"]`, meldeForm)) x.classList.add('fehlt');
      const fehlt = e.vollstaendigkeit.fehlt.map((x) => x.label);
      box.innerHTML = `<p class="melde-hof-titel">Du bearbeitest: <a href="${esc(e.pfad)}">${esc(e.titel)}</a>, ${esc(e.ortAnzeige)}</p>
        <p class="vollst"><span class="vollst-balken" style="--p:${e.vollstaendigkeit.prozent}%"></span>Profil zu ${e.vollstaendigkeit.prozent} % vollständig${fehlt.length ? ` – es fehlen: ${esc(fehlt.join(', '))}` : ''}</p>
        <p class="leise">Ändere oder ergänze einfach die Felder. Wir prüfen jede Einsendung, bevor sie erscheint.</p>`;
      box.hidden = false;
      $('[data-melde-titel]').textContent = aktion === 'uebernehmen' ? 'Eintrag kostenlos übernehmen' : 'Eintrag ergänzen';
      for (const x of $$('[data-intro]')) x.hidden = true;
      if (params.get('fokus') === 'zeiten') $('#zeiten')?.scrollIntoView({ block: 'start' });
    }).catch(() => {});
  }
  modus();
  const verkleinern = (datei) => new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const f = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => ok(b ? new File([b], datei.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : datei), 'image/jpeg', 0.82);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => ok(datei);
    img.src = URL.createObjectURL(datei);
  });
  meldeForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fehler = $('[data-melde-fehler]', meldeForm);
    const knopf = meldeForm.querySelector('button[type="submit"]');
    fehler.hidden = true; knopf.disabled = true; knopf.textContent = 'Wird gesendet …';
    try {
      const fd = new FormData(meldeForm);
      const fotos = fd.getAll('fotos').filter((x) => x.size);
      fd.delete('fotos');
      for (const x of fotos.slice(0, 3)) fd.append('fotos', await verkleinern(x));
      const r = await fetch('/api/meldung', { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { location.href = '/mitmachen/danke/'; return; }
      fehler.textContent = d.fehler || 'Das hat nicht geklappt. Bitte versuch es noch einmal.';
    } catch { fehler.textContent = 'Keine Verbindung. Bitte versuch es noch einmal.'; }
    fehler.hidden = false; knopf.disabled = false; knopf.textContent = 'Absenden';
  });
}

// ---------- Merkliste & Teilen ----------
const MERK = 'merkliste';
const merkliste = {
  lesen() { try { const l = JSON.parse(speicher.get(MERK) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } },
  schreiben(l) { speicher.set(MERK, JSON.stringify(l.slice(0, 100))); },
};
function merkAnzeige(root = document) {
  const l = new Set(merkliste.lesen());
  for (const b of $$('[data-merken]', root)) {
    const an = l.has(b.dataset.merken);
    if (b.getAttribute('aria-pressed') !== String(an)) b.setAttribute('aria-pressed', String(an));
    const t = $('.merken-text', b), soll = an ? 'Gemerkt' : 'Merken';
    if (t && t.textContent !== soll) t.textContent = soll;
  }
  for (const z of $$('.merk-zahl')) { const soll = String(l.size || ''); if (z.textContent !== soll) z.textContent = soll; z.hidden = !l.size; }
}
document.addEventListener('click', async (ev) => {
  const merk = ev.target.closest('[data-merken]');
  if (merk) {
    ev.preventDefault();
    const slug = merk.dataset.merken;
    const l = merkliste.lesen();
    const i = l.indexOf(slug);
    if (i >= 0) l.splice(i, 1); else l.unshift(slug);
    merkliste.schreiben(l);
    merkAnzeige();
    if (i >= 0 && merk.closest('[data-merkliste-liste]')) { merk.closest('.laden')?.remove(); merklisteStatus(); }
    return;
  }
  const teilen = ev.target.closest('[data-teilen]');
  if (teilen) {
    ev.preventDefault();
    const daten = { title: teilen.dataset.titel || document.title, url: location.href.split('?')[0] };
    if (navigator.share) { try { await navigator.share(daten); } catch { /* abgebrochen */ } return; }
    // Ohne Web Share API: kleines Menü mit „Link kopieren“ und WhatsApp
    auswahlMenue(teilen, 'Teilen', [
      ['Link kopieren', async () => { try { await navigator.clipboard.writeText(daten.url); meldeKurz(teilen, 'Link kopiert'); } catch { prompt('Link kopieren:', daten.url); } }],
      ['Per WhatsApp teilen', () => window.open(`https://wa.me/?text=${encodeURIComponent(`${daten.title} ${daten.url}`)}`, '_blank', 'noopener')],
      ['Per E-Mail teilen', () => { location.href = `mailto:?subject=${encodeURIComponent(daten.title)}&body=${encodeURIComponent(daten.url)}`; }],
    ]);
  }
});
// Nachgeladene Karten (Umkreissuche, Merkliste) bekommen den richtigen Herz-Zustand
new MutationObserver((liste) => {
  if (liste.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.('[data-merken]') || n.querySelector?.('[data-merken]'))))) merkAnzeige();
}).observe(document.body, { childList: true, subtree: true });
merkAnzeige();

function merklisteStatus() {
  const n = $$('[data-merkliste-liste] .laden').length;
  const st = $('[data-merkliste-status]');
  if (st) st.textContent = n ? `${n} gemerkte${n === 1 ? 'r Eintrag' : ' Einträge'}.` : 'Noch nichts gemerkt. Tippe auf einer Hofseite auf „Merken“ oder in der Liste auf das Herz.';
  const leeren = $('[data-merkliste-leeren]');
  if (leeren) leeren.hidden = !n;
}
async function merklisteSeite() {
  const box = $('[data-merkliste]');
  if (!box) return;
  const slugs = merkliste.lesen();
  if (!slugs.length) { merklisteStatus(); return; }
  try {
    const r = await fetch(`/api/eintraege?slugs=${encodeURIComponent(slugs.join(','))}`);
    const d = await r.json();
    if (d.unbekannt?.length) merkliste.schreiben(slugs.filter((x) => !d.unbekannt.includes(x)));
    $('[data-merkliste-liste]').innerHTML = d.ergebnisse.map((e) => karteHtml(e)).join('');
    zeigeStatus($('[data-merkliste-liste]'));
  } catch { $('[data-merkliste-status]').textContent = 'Die Merkliste konnte gerade nicht geladen werden.'; return; }
  merklisteStatus();
  $('[data-merkliste-leeren] button')?.addEventListener('click', () => { merkliste.schreiben([]); $('[data-merkliste-liste]').innerHTML = ''; merkAnzeige(); merklisteStatus(); });
}

startseite();
await merklisteSeite();
await plzModus();
karteAutomatisch();

// ---------- Badge-Seite: Code auf den eigenen Eintrag zuschneiden ----------
{
  const seite = $('[data-badge-seite]');
  const hof = params.get('eintrag') || params.get('hof');
  if (seite && hof && /^[a-z0-9-]{1,120}$/i.test(hof)) {
    fetch(`/api/eintrag?id=${encodeURIComponent(hof)}`).then((r) => r.json()).then((d) => {
      const e = d.eintrag;
      if (!e) return;
      for (const t of $$('[data-badge-code]', seite)) t.value = `<a href="${location.origin}${e.pfad}" title="${esc(e.titel)} auf hofladenliste.de"><img src="${location.origin}/${t.dataset.badgeCode}" width="200" height="56" alt="Wir sind auf hofladenliste.de"></a>`;
      $('[data-badge-uebernehmen]', seite).href = `/mitmachen/?eintrag=${e.id}&aktion=uebernehmen`;
    }).catch(() => {});
  }
  for (const t of $$('[data-badge-code]')) t.addEventListener('focus', () => t.select());
}

// ---------- Nutzungsstatistik: anonyme Tageszähler (siehe Datenschutz) ----------
const seitenTyp = document.body.dataset.seite || 'sonstige';
// Auf Hofseiten zählt jeder Klick auch für die Statistik des Betriebs (nur Tagessummen je Hof, hofSlug oben)
function zaehle(e, d = '') {
  try {
    const daten = JSON.stringify({ e, s: seitenTyp, d, ...(hofSlug ? { h: hofSlug } : {}) });
    if (!navigator.sendBeacon?.('/api/ereignis', new Blob([daten], { type: 'application/json' }))) fetch('/api/ereignis', { method: 'POST', body: daten, keepalive: true });
  } catch {}
}
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a, button');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (href.startsWith('tel:')) zaehle('telefon');
  else if (href.includes('google.com/maps/dir')) zaehle('route');
  else if (a.matches('.akt[href^="http"], .knopf-hell[href^="http"], .kontakt a[href^="http"]') && !href.includes('openstreetmap.org')) zaehle('website');
  else if (a.matches('[data-naehe-start], #standort')) zaehle('naehe');
  else if (a.matches('[data-merken]')) zaehle('merken');
  else if (a.matches('[data-teilen]')) zaehle('teilen');
  else if (a.matches('[data-typ-filter]')) zaehle('filter', `typ-${a.dataset.typFilter}`);
  else if (a.matches('[data-kat-filter]')) zaehle('filter', a.dataset.katFilter);
  else if (a.matches('[data-radius-filter]')) zaehle('filter', `umkreis-${a.dataset.radiusFilter}`);
  else if (a.matches('[data-offen-filter]')) zaehle('filter', 'offen');
  else if (a.matches('[data-sonntag-filter]')) zaehle('filter', 'sonntag');
  else if (a.matches('[data-bio-filter]')) zaehle('filter', 'bio');
  else if (a.matches('[data-rund-filter]')) zaehle('filter', 'rund');
}, { capture: true });
if (hofSlug && !/bot|crawl|spider|lighthouse/i.test(navigator.userAgent)) zaehle('aufruf');
for (const f of $$('form[action="/suche"]')) f.addEventListener('submit', () => zaehle('suche', /^\d/.test(f.elements.q?.value || '') ? 'plz' : 'ort'));

// ---------- Entfernung auf Listen und Hofseiten ----------
function entfernungAnzeigen() {
  const s = plz ? null : zeigeEntfernungen();
  const hinweis = $('[data-plz-hinweis]');
  if (s && hinweis && hinweis.hidden && $$('[data-liste] > .laden').length > 1) {
    hinweis.innerHTML = `Entfernungen (Luftlinie) ab ${esc(s.label)}. <button type="button" class="link" data-km-sortieren>Nach Entfernung sortieren</button> · <button type="button" class="link" data-standort-vergessen>Standort vergessen</button>`;
    hinweis.hidden = false;
  }
  const kopf = $('.hof-kopf[data-lat]');
  const ziel = $('[data-entfernung]');
  if (kopf && ziel) {
    const zeige = (st) => {
      ziel.innerHTML = `<b>${kmText(distanz(st.lat, st.lon, +kopf.dataset.lat, +kopf.dataset.lon))}</b> Luftlinie ab ${esc(st.label)}`;
      ziel.hidden = false;
      const knopf = $('[data-entfernung-start]');
      if (knopf) knopf.hidden = true;
    };
    const st = standortLesen();
    if (st) zeige(st);
    else if ('geolocation' in navigator) {
      const knopf = $('[data-entfernung-start]');
      if (knopf) {
        knopf.hidden = false;
        knopf.addEventListener('click', () => {
          knopf.disabled = true; knopf.textContent = 'Standort wird ermittelt …';
          navigator.geolocation.getCurrentPosition((pos) => {
            standortMerken(pos.coords.latitude, pos.coords.longitude, 'deinem Standort');
            zeige(standortLesen());
          }, () => { knopf.disabled = false; knopf.textContent = 'Standort nicht verfügbar'; }, { timeout: 10000, maximumAge: 600000 });
        });
      }
    }
  }
}
entfernungAnzeigen();
document.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-km-sortieren]')) {
    const liste = $('[data-liste]');
    const karten = $$('.laden', liste).sort((a, b) => a.dataset.km - b.dataset.km);
    const vor = $('[data-leer-filter]', liste);
    for (const k of karten) liste.insertBefore(k, vor);
    ev.target.closest('[data-km-sortieren]').remove();
  }
  if (ev.target.closest('[data-standort-vergessen]')) {
    try { localStorage.removeItem('standort'); } catch {}
    for (const el of $$('.laden-art .km')) el.remove();
    const h = $('[data-plz-hinweis]'); if (h) h.hidden = true;
  }
});

// ---------- Ergebnisseite der Hofsuche ----------
{
  const ziel = $('[data-hofsuche]');
  if (ziel) {
    const q = (params.get('q') || '').slice(0, 60);
    const meldung = $('[data-hofsuche-status]');
    if ($('#hs-q')) $('#hs-q').value = q;
    if (q.length < 3) meldung.textContent = 'Gib mindestens drei Buchstaben ein, zum Beispiel einen Teil des Hofnamens.';
    else fetch(`/api/hoefe?limit=40&q=${encodeURIComponent(q)}`).then((r) => r.json()).then((d) => {
      const n = d.gesamt || 0;
      meldung.textContent = n ? `${n} ${n === 1 ? 'Hof passt' : 'Höfe passen'} zu „${q}“${n > d.treffer.length ? ` – die ersten ${d.treffer.length}. Mit Ort oder PLZ wird die Liste kürzer, z. B. „${q} Forst“.` : '.'}` : `Zu „${q}“ haben wir keinen Hof gefunden. Prüf die Schreibweise oder such nach Ort oder PLZ.`;
      ziel.innerHTML = d.treffer.map((e) => karteHtml(e)).join('');
      zeigeStatus(ziel);
      zeigeEntfernungen(ziel);
    }).catch(() => { meldung.textContent = 'Die Suche hat gerade nicht geklappt. Bitte versuch es noch einmal.'; });
  }
}

// ---------- Ein-Klick-Rückmeldung „Stimmt das noch?“ ----------
for (const box of $$('[data-rueckmeldung]')) {
  const sid = box.dataset.rueckmeldung, danke = $('[data-rm-danke]', box), frage = $('[data-rm-frage]', box), knoepfe = $('.pruef-knoepfe', box);
  const merkKey = `rm:${sid}`;
  const zeigeDanke = (text) => { knoepfe.hidden = true; frage.hidden = true; danke.textContent = text; danke.hidden = false; };
  const frueher = speicher.get(merkKey);
  if (frueher) {
    try { const f = JSON.parse(frueher); if (Date.now() - f.t < 30 * 864e5) zeigeDanke(f.art === 'stimmt' ? 'Danke, du hast diese Angaben schon bestätigt.' : 'Danke, du hast diesen Eintrag schon als geschlossen gemeldet.'); } catch {}
  }
  const senden = async (art) => {
    for (const b of $$('button', box)) b.disabled = true;
    try {
      const r = await fetch('/api/rueckmeldung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eintrag: sid, art }) });
      if (!r.ok) throw new Error();
      speicher.set(merkKey, JSON.stringify({ art, t: Date.now() }));
      zeigeDanke(art === 'stimmt' ? 'Danke! Das Prüfdatum auf dieser Seite wird in den nächsten Tagen aktualisiert.' : 'Danke für den Hinweis! Wir prüfen den Eintrag und nehmen ihn heraus, wenn er wirklich geschlossen ist.');
      zaehle('rueckmeldung', art);
    } catch {
      for (const b of $$('button', box)) b.disabled = false;
      danke.textContent = 'Das hat gerade nicht geklappt. Bitte versuch es später noch einmal.';
      danke.hidden = false;
    }
  };
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.rm === 'stimmt') senden('stimmt');
    else if (b.dataset.rm === 'geschlossen') { frage.hidden = false; $('[data-rm-ja]', box).focus(); }
    else if (b.matches('[data-rm-ja]')) senden('geschlossen');
    else if (b.matches('[data-rm-nein]')) frage.hidden = true;
  });
}

// ---------- Kleines Auswahlmenü (Route, Teilen) ----------
function meldeKurz(el, text) {
  const t = $('span', el) || el; const alt = t.textContent; t.textContent = text; setTimeout(() => { t.textContent = alt; }, 2000);
}
function auswahlMenue(anker, titel, optionen, fuss = '') {
  $('.auswahl-menue')?.remove();
  const m = document.createElement('div');
  m.className = 'auswahl-menue';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-label', titel);
  m.innerHTML = `<p class="auswahl-titel">${esc(titel)}</p>${optionen.map(([t], i) => `<button type="button" data-wahl="${i}">${esc(t)}</button>`).join('')}${fuss}<button type="button" class="link auswahl-zu">Schließen</button>`;
  document.body.append(m);
  const r = anker.getBoundingClientRect();
  m.style.top = `${Math.min(window.scrollY + r.bottom + 6, window.scrollY + innerHeight - m.offsetHeight - 8)}px`;
  m.style.left = `${Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + innerWidth - m.offsetWidth - 8))}px`;
  const zu = () => { m.remove(); document.removeEventListener('keydown', esc_); anker.focus?.(); };
  const esc_ = (ev) => { if (ev.key === 'Escape') zu(); };
  document.addEventListener('keydown', esc_);
  m.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.wahl != null) optionen[+b.dataset.wahl][1](m);
    zu();
  });
  setTimeout(() => document.addEventListener('click', function weg(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', weg); } }), 0);
  $('button', m).focus();
}

// ---------- Routen-Button: Navi-App wählen (Google Maps, Apple Karten, OpenStreetMap, OsmAnd, Komoot), Wahl wird gemerkt ----------
const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const NAVI = {
  google: ['Google Maps', (la, lo) => `https://www.google.com/maps/dir/?api=1&destination=${la},${lo}`],
  ...(ios ? { apple: ['Apple Karten', (la, lo) => `https://maps.apple.com/?daddr=${la},${lo}`] } : {}),
  osm: ['OpenStreetMap', (la, lo) => `https://www.openstreetmap.org/directions?route=%3B${la}%2C${lo}#map=15/${la}/${lo}`],
  osmand: ['OsmAnd', (la, lo) => `https://osmand.net/map?pin=${la},${lo}#15/${la}/${lo}`],
  komoot: ['Komoot (Fahrrad)', (la, lo) => `https://www.komoot.com/plan/@${la},${lo},15z`],
};
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[href*="google.com/maps/dir/"]');
  if (!a) return;
  const m = (a.getAttribute('href') || '').match(/destination=(-?[\d.]+),(-?[\d.]+)/);
  if (!m) return;
  const [, la, lo] = m;
  const gemerkt = speicher.get('navi');
  if (gemerkt && NAVI[gemerkt] && !ev.altKey) { a.href = NAVI[gemerkt][1](la, lo); return; } // Link öffnet direkt die gemerkte App
  ev.preventDefault();
  const merken = '<label class="auswahl-merken"><input type="checkbox" data-navi-merken checked> Auswahl merken</label>';
  auswahlMenue(a, 'Route planen mit …', Object.entries(NAVI).map(([k, [name, url]]) => [name, (menue) => {
    if ($('[data-navi-merken]', menue)?.checked) speicher.set('navi', k);
    window.open(url(la, lo), '_blank', 'noopener');
  }]), merken);
});
// Gemerkte Navi-App vergessen (Link „Andere Navi-App“ unter dem Routen-Button)
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('[data-navi-wechseln]')) return;
  ev.preventDefault();
  try { localStorage.removeItem('navi'); } catch {}
  ev.target.closest('[data-navi-wechseln]').textContent = 'Beim nächsten Klick auf „Route“ wählst du die App neu.';
});
