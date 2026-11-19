// Hofläden entlang der Route (/route/): Start und Ziel (Luftlinie) oder eigene GPX-Datei,
// dann alle Einträge in einem Korridor von 2–5 km, sortiert nach der Position auf der Strecke.
import { KATEGORIEN, kmAnzeige } from './karte.js';
import { status } from './oh.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Abstand eines Punkts zur Strecke (lokal eben, km) und Position entlang der Strecke (km ab Start)
export function korridor(punkte, linie, breiteKm) {
  const r = Math.PI / 180, kx = 111.32 * Math.cos(((linie[0][0] + linie.at(-1)[0]) / 2) * r), ky = 110.57;
  const xy = linie.map(([lat, lon]) => [lon * kx, lat * ky]);
  const kum = [0];
  for (let i = 1; i < xy.length; i++) kum.push(kum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  const minLat = Math.min(...linie.map((p) => p[0])) - breiteKm / ky, maxLat = Math.max(...linie.map((p) => p[0])) + breiteKm / ky;
  const minLon = Math.min(...linie.map((p) => p[1])) - breiteKm / kx, maxLon = Math.max(...linie.map((p) => p[1])) + breiteKm / kx;
  const treffer = [];
  for (const p of punkte) {
    if (p.lat < minLat || p.lat > maxLat || p.lon < minLon || p.lon > maxLon) continue;
    const px = p.lon * kx, py = p.lat * ky;
    let best = Infinity, pos = 0;
    for (let i = 1; i < xy.length; i++) {
      const [ax, ay] = xy[i - 1], [bx, by] = xy[i], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < best) { best = d; pos = kum[i - 1] + t * Math.sqrt(l2); }
    }
    if (best <= breiteKm) treffer.push({ ...p, abstand: best, pos });
  }
  return { treffer: treffer.sort((a, b) => a.pos - b.pos), laenge: kum.at(-1) };
}

// GPX: Trackpunkte, sonst Routenpunkte; auf höchstens 2000 Punkte ausgedünnt
export function gpxLesen(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  let pts = [...doc.querySelectorAll('trkpt')];
  if (!pts.length) pts = [...doc.querySelectorAll('rtept')];
  const linie = pts.map((p) => [parseFloat(p.getAttribute('lat')), parseFloat(p.getAttribute('lon'))]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const schritt = Math.max(1, Math.ceil(linie.length / 2000));
  return linie.filter((_, i) => i % schritt === 0 || i === linie.length - 1);
}

async function ortKoordinaten(q) {
  const d = await (await fetch(`/api/orte?q=${encodeURIComponent(q)}`)).json();
  const o = d.treffer?.[0];
  return o?.lat ? { lat: o.lat, lon: o.lon, name: o.wert } : null;
}

export async function route(ctx) {
  const form = $('[data-route-form]'), st = $('[data-route-status]'), liste = $('[data-route-liste]');
  const punkte = (async () => {
    const d = await (await fetch('/punkte.json')).json();
    const kat = d.k;
    return [...d.h.map(([lat, lon, typ, slug, titel, art, oh, k, bio, karte, land]) => ({ lat, lon, typ, titel, art, oh, land, url: `/hof/${slug}/`, kat: [...(k || '')].map((b) => kat['abcdefghijklmnopqrstuvwxyz'.indexOf(b)]).filter(Boolean) })),
      ...(d.m || []).map(([lat, lon, titel, oh, url, land]) => ({ lat, lon, typ: 'markt', titel, art: 'Wochenmarkt', oh, land, url, kat: [] }))];
  })();
  let ebene = null;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const breite = +form.breite.value || 3;
    let linie, titel;
    st.textContent = 'Strecke wird berechnet …';
    const datei = form.gpx.files?.[0];
    if (datei) {
      linie = gpxLesen(await datei.text());
      if (linie.length < 2) { st.textContent = 'In der GPX-Datei stehen keine Track- oder Routenpunkte.'; return; }
      titel = `entlang deiner GPX-Strecke „${datei.name}“`;
    } else {
      const [a, b] = await Promise.all([ortKoordinaten(form.start.value), ortKoordinaten(form.ziel.value)]);
      if (!a || !b) { st.textContent = `Ort nicht gefunden: ${!a ? form.start.value : form.ziel.value}. Bitte Ortsname oder Postleitzahl eingeben.`; return; }
      linie = [[a.lat, a.lon], [b.lat, b.lon]];
      titel = `zwischen ${a.name} und ${b.name} (Luftlinie)`;
    }
    const { treffer, laenge } = korridor(await punkte, linie, breite);
    st.textContent = treffer.length ? `${treffer.length} Höfe, Automaten und Märkte ${titel}, höchstens ${breite} km neben der Strecke (${Math.round(laenge)} km lang).` : `Keine Einträge ${titel} im Abstand von ${breite} km. Versuch einen breiteren Korridor.`;
    liste.innerHTML = treffer.slice(0, 300).map((p) => {
      const s = p.oh ? status(p.oh, new Date(), p.land) : null;
      return `<li class="kl-eintrag kl-${p.typ}"><a href="${esc(p.url)}"><span class="kl-name">${esc(p.titel)}</span><span class="kl-meta">${esc(p.art)} · nach ${kmAnzeige(p.pos)} · ${kmAnzeige(p.abstand)} neben der Strecke${p.kat.length ? ` · ${esc(p.kat.slice(0, 3).map((k) => KATEGORIEN[k]).join(', '))}` : ''}</span>${s ? `<span class="kl-st ${s.offen === null ? 'st-unklar' : s.offen ? 'st-auf' : 'st-zu'}">${esc(s.kurz)}</span>` : ''}</a></li>`;
    }).join('');
    // Karte (falls geladen): Strecke und Treffer
    const k = await ctx?.();
    if (k) {
      const { map, L } = k;
      ebene?.remove();
      ebene = L.layerGroup([L.polyline(linie, { color: '#A2334F', weight: 4, opacity: .8 }),
        ...treffer.map((p) => L.circleMarker([p.lat, p.lon], { radius: 6, color: '#173B2C', weight: 1.5, fillColor: p.typ === 'markt' ? '#C8553D' : '#F4C430', fillOpacity: 1 }).bindPopup(`<a href="${esc(p.url)}">${esc(p.titel)}</a><br>${esc(p.art)}`))]).addTo(map);
      map.fitBounds(L.polyline(linie).getBounds().pad(0.15));
    }
  });
}
