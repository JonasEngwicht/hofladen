// Vollkarte (/karte/): Cluster mit Zahl, Marker je Typ, Filter in der Adresse, Liste des Kartenausschnitts
// (Desktop daneben, mobil als Bottom-Sheet), Popup mit Status und Aktionen, „Mein Standort“ mit Umkreis.
// Wird von app.js erst nach der Zustimmung zur Karte geladen.
import { status } from './oh.js';
import { KATEGORIEN, kmAnzeige } from './karte.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const distanz = (aLat, aLon, bLat, bLon) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const speicher = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// Farben und Symbole je Typ (Hofladen gelb, Milch blau, Eier hell, Regiomat grün, Wochenmarkt rot)
export const TYPEN = {
  h: { name: 'Hofladen', farbe: '#F4C430', zeichen: 'H' },
  m: { name: 'Milchtankstelle', farbe: '#7FB3D5', zeichen: 'M' },
  e: { name: 'Eierautomat', farbe: '#F2E2C4', zeichen: 'E' },
  r: { name: 'Regiomat', farbe: '#6B8F7E', zeichen: 'R' },
  markt: { name: 'Wochenmarkt', farbe: '#C8553D', zeichen: 'W' },
};

// Filterzustand aus der Adresse lesen und dorthin schreiben, damit gefilterte Karten teilbar sind
export function filterAusUrl(search) {
  const p = new URLSearchParams(search);
  return {
    typ: p.get('typ') || 'alle', offen: p.get('offen') === '1', bio: p.get('bio') === '1', rund: p.get('rund') === '1', karte: p.get('zahlung') === 'karte',
    kat: new Set((p.get('produkt') || '').split(',').filter((k) => KATEGORIEN[k])),
    lat: parseFloat(p.get('lat')), lon: parseFloat(p.get('lon')), z: parseInt(p.get('z'), 10),
  };
}
export function filterInUrl(f, map) {
  const p = new URLSearchParams();
  if (f.typ !== 'alle') p.set('typ', f.typ);
  if (f.offen) p.set('offen', '1');
  if (f.bio) p.set('bio', '1');
  if (f.rund) p.set('rund', '1');
  if (f.karte) p.set('zahlung', 'karte');
  if (f.kat.size) p.set('produkt', [...f.kat].join(','));
  if (map) { const c = map.getCenter(); p.set('lat', c.lat.toFixed(4)); p.set('lon', c.lng.toFixed(4)); p.set('z', map.getZoom()); }
  return p.toString();
}

// Einheitliche Punkte aus /punkte.json
export function punkteLesen(d) {
  const kat = d.k || Object.keys(KATEGORIEN);
  const hoefe = d.h.map(([lat, lon, typ, slug, titel, art, oh, k, bio, karte, land]) => ({
    lat, lon, typ, titel, art, oh, land, bio: !!bio, karte: !!karte, url: `/hof/${slug}/`, slug,
    kat: [...(k || '')].map((b) => kat['abcdefghijklmnop'.indexOf(b)]).filter(Boolean),
  }));
  const maerkte = (d.m || []).map(([lat, lon, titel, oh, url, land]) => ({ lat, lon, typ: 'markt', titel, art: 'Wochenmarkt', oh, land, url, kat: [] }));
  return [...hoefe, ...maerkte];
}
const rundUhr = (oh) => /^24\/7$/.test((oh || '').trim());
export function passt(p, f, jetzt = new Date()) {
  if (f.typ !== 'alle' && p.typ !== f.typ) return false;
  if (f.bio && !p.bio) return false;
  if (f.karte && !p.karte) return false;
  if (f.rund && !rundUhr(p.oh)) return false;
  if (f.kat.size && ![...f.kat].every((k) => p.kat.includes(k))) return false;
  if (f.offen && !(p.oh && status(p.oh, jetzt, p.land)?.offen === true)) return false;
  return true;
}

// Raster-Cluster in Bildschirmpixeln: Punkte in derselben Zelle werden zu einem Kreis mit Zahl
export function clustern(punkte, projiziere, zelle = 56) {
  const zellen = new Map();
  for (const p of punkte) {
    const { x, y } = projiziere(p);
    const key = `${Math.floor(x / zelle)}:${Math.floor(y / zelle)}`;
    let c = zellen.get(key);
    if (!c) zellen.set(key, (c = { punkte: [], lat: 0, lon: 0 }));
    c.punkte.push(p); c.lat += p.lat; c.lon += p.lon;
  }
  return [...zellen.values()].map((c) => ({ ...c, lat: c.lat / c.punkte.length, lon: c.lon / c.punkte.length }));
}

function popupHtml(p) {
  const s = p.oh ? status(p.oh, new Date(), p.land) : null;
  const st = s ? `<p class="kp-status ${s.offen === null ? 'st-unklar' : s.offen ? 'st-auf' : 'st-zu'}"><b>${esc(s.kurz)}</b></p>` : '<p class="kp-status st-leer">Keine Zeiten hinterlegt</p>';
  const chips = p.kat.length ? `<p class="kp-kat">${p.kat.slice(0, 5).map((k) => `<span>${esc(KATEGORIEN[k])}</span>`).join('')}</p>` : '';
  return `<div class="kp"><p class="kp-art">${esc(p.art)}${p.bio ? ' · Bio' : ''}</p><p class="kp-name"><a href="${esc(p.url)}">${esc(p.titel)}</a></p>${st}${chips}
  <p class="kp-aktionen"><a class="akt" href="https://www.google.com/maps/dir/?api=1&amp;destination=${p.lat},${p.lon}" rel="nofollow noopener" target="_blank">Route</a>${p.slug ? `<button type="button" class="akt" data-merken="${esc(p.slug)}" aria-pressed="false">Merken</button>` : ''}<a class="akt" href="${esc(p.url)}">Details</a></p></div>`;
}

export async function vollkarte(ctx, { params, standortMerken, standortLesen, merkAnzeige }) {
  const { map, L } = ctx;
  const seite = $('[data-vollkarte]');
  const f = filterAusUrl(location.search);
  const alle = punkteLesen(await (await fetch('/punkte.json')).json());
  const ebene = L.layerGroup().addTo(map);
  const status_ = $('[data-kl-status]'), liste = $('[data-kl-liste]');
  if (f.lat && f.lon && f.z) map.setView([f.lat, f.lon], f.z); else map.setView([51.2, 10.4], 6);

  // Filterknöpfe auf den Zustand aus der Adresse setzen
  for (const b of $$('[data-kf-typ]', seite)) b.setAttribute('aria-pressed', String(b.dataset.kfTyp === f.typ));
  for (const b of $$('[data-kf-schalter]', seite)) b.setAttribute('aria-pressed', String(!!f[b.dataset.kfSchalter]));
  for (const b of $$('[data-kf-kat]', seite)) b.setAttribute('aria-pressed', String(f.kat.has(b.dataset.kfKat)));

  const pin = (p) => L.divIcon({ className: `kp-pin kp-${p.typ}`, html: `<span>${TYPEN[p.typ].zeichen}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
  let gefiltert = [];
  const zeichne = () => {
    ebene.clearLayers();
    const grenzen = map.getBounds().pad(0.2);
    const sichtbar = gefiltert.filter((p) => grenzen.contains([p.lat, p.lon]));
    const z = map.getZoom();
    if (z >= 13 || sichtbar.length <= 60) {
      for (const p of sichtbar) L.marker([p.lat, p.lon], { icon: pin(p), title: p.titel, keyboard: true }).bindPopup(() => popupHtml(p)).addTo(ebene);
    } else {
      for (const c of clustern(sichtbar, (p) => map.project([p.lat, p.lon], z))) {
        if (c.punkte.length === 1) { const p = c.punkte[0]; L.marker([p.lat, p.lon], { icon: pin(p), title: p.titel }).bindPopup(() => popupHtml(p)).addTo(ebene); continue; }
        const n = c.punkte.length, gr = n < 10 ? 34 : n < 100 ? 40 : 48;
        L.marker([c.lat, c.lon], { icon: L.divIcon({ className: 'kp-cluster', html: `<span>${n.toLocaleString('de-DE')}</span>`, iconSize: [gr, gr], iconAnchor: [gr / 2, gr / 2] }), title: `${n} Einträge`, keyboard: true })
          .on('click', () => map.setView([c.lat, c.lon], Math.min(z + 2, 15))).addTo(ebene);
      }
    }
    listeZeigen();
    history.replaceState(null, '', `${location.pathname}?${filterInUrl(f, map)}`);
  };
  // Liste: Einträge im sichtbaren Ausschnitt, nach Entfernung zur Kartenmitte (oder zum Standort)
  const listeZeigen = () => {
    const b = map.getBounds(), c = map.getCenter(), st = standortLesen();
    const bezug = st && b.contains([st.lat, st.lon]) ? { lat: st.lat, lon: st.lon, text: `ab ${st.label}` } : { lat: c.lat, lon: c.lng, text: 'ab Kartenmitte' };
    const drin = gefiltert.filter((p) => b.contains([p.lat, p.lon])).map((p) => [distanz(bezug.lat, bezug.lon, p.lat, p.lon), p]).sort((x, y) => x[0] - y[0]);
    status_.textContent = drin.length ? `${drin.length.toLocaleString('de-DE')} ${drin.length === 1 ? 'Eintrag' : 'Einträge'} in diesem Kartenausschnitt${drin.length > 60 ? ' – die 60 nächsten' : ''} (Entfernung ${bezug.text}).` : 'In diesem Ausschnitt passt nichts zu deinen Filtern. Zoom heraus oder ändere die Filter.';
    liste.innerHTML = drin.slice(0, 60).map(([d, p]) => {
      const s = p.oh ? status(p.oh, new Date(), p.land) : null;
      return `<li class="kl-eintrag kl-${p.typ}"><a href="${esc(p.url)}"><span class="kl-name">${esc(p.titel)}</span><span class="kl-meta">${esc(p.art)} · ${kmAnzeige(d)}</span>${s ? `<span class="kl-st ${s.offen === null ? 'st-unklar' : s.offen ? 'st-auf' : 'st-zu'}">${esc(s.kurz)}</span>` : ''}</a></li>`;
    }).join('');
  };
  const anwenden = () => { gefiltert = alle.filter((p) => passt(p, f)); zeichne(); };
  map.on('moveend', zeichne);

  seite.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-kf-typ], [data-kf-schalter], [data-kf-kat]');
    if (!b) return;
    if (b.dataset.kfTyp) { f.typ = b.dataset.kfTyp; for (const x of $$('[data-kf-typ]', seite)) x.setAttribute('aria-pressed', String(x === b)); }
    if (b.dataset.kfSchalter) { const k = b.dataset.kfSchalter; f[k] = !f[k]; b.setAttribute('aria-pressed', String(f[k])); }
    if (b.dataset.kfKat) { const k = b.dataset.kfKat; if (f.kat.has(k)) f.kat.delete(k); else f.kat.add(k); b.setAttribute('aria-pressed', String(f.kat.has(k))); }
    anwenden();
  });
  map.on('popupopen', () => merkAnzeige?.());

  // „Mein Standort“ mit 5-km-Kreis
  const knopf = $('[data-mein-standort]', seite);
  let standortEbene = null;
  const zeigeStandort = (lat, lon) => {
    standortEbene?.remove();
    standortEbene = L.layerGroup([L.circle([lat, lon], { radius: 5000, color: '#A2334F', weight: 1.5, fillOpacity: 0.06 }),
      L.circleMarker([lat, lon], { radius: 7, color: '#fff', weight: 3, fillColor: '#A2334F', fillOpacity: 1 }).bindTooltip('Dein Standort')]).addTo(map);
    map.setView([lat, lon], 12);
  };
  if ('geolocation' in navigator && knopf) {
    knopf.hidden = false;
    knopf.addEventListener('click', () => {
      knopf.disabled = true;
      navigator.geolocation.getCurrentPosition((pos) => {
        knopf.disabled = false;
        standortMerken(pos.coords.latitude, pos.coords.longitude, 'deinem Standort');
        zeigeStandort(pos.coords.latitude, pos.coords.longitude);
      }, () => { knopf.disabled = false; status_.textContent = 'Standort nicht verfügbar. Du kannst die Karte auch verschieben.'; }, { timeout: 10000, maximumAge: 600000 });
    });
  }
  if (params.get('standort') === '1') knopf?.click();

  // Mobil: Liste als Bottom-Sheet zum Hochziehen
  const sheet = $('[data-kl]', seite), griff = $('[data-kl-griff]', seite);
  griff?.addEventListener('click', () => { const offen = sheet.classList.toggle('offen'); griff.setAttribute('aria-expanded', String(offen)); });
  let startY = null;
  griff?.addEventListener('pointerdown', (ev) => { startY = ev.clientY; });
  addEventListener('pointerup', (ev) => {
    if (startY == null) return;
    const dy = ev.clientY - startY; startY = null;
    if (Math.abs(dy) > 30) { const offen = dy < 0; sheet.classList.toggle('offen', offen); griff.setAttribute('aria-expanded', String(offen)); }
  });
  anwenden();
}
