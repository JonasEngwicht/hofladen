// Ladenkarte: wird beim Build (Node) und im Browser (Umkreissuche) gleich gerendert.
import { status, zeilen, uebersetze } from './oh.js';

export const KATEGORIEN = {
  eier: 'Eier', milch: 'Milch', kaese: 'Käse', fleisch: 'Fleisch & Wurst', gefluegel: 'Geflügel', wild: 'Wild', fisch: 'Fisch',
  gemuese: 'Gemüse', obst: 'Obst', kartoffeln: 'Kartoffeln', honig: 'Honig', brot: 'Brot', nudeln: 'Nudeln', marmelade: 'Marmelade',
  getraenke: 'Saft & Wein', blumen: 'Blumen', weihnachtsbaeume: 'Weihnachtsbäume', tierfutter: 'Tierfutter',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telHref = (t) => 'tel:' + String(t).replace(/[^\d+]/g, '').replace(/^00/, '+');

// Symbole (24×24, Strich in currentColor)
const S = (inner) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
export const ICON = {
  hofladen: S('<path d="M3 11 12 4l9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-6h5v6"/><path d="M9.5 14l5 6M14.5 14l-5 6"/>'),
  milch: S('<path d="M9 3h6v3l2 3v12H7V9l2-3z"/><path d="M7 13h10"/>'),
  eier: S('<path d="M12 3c3.5 0 6 5.2 6 9.5S15.3 21 12 21s-6-4.2-6-8.5S8.5 3 12 3z"/>'),
  automat: S('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M5 9h14M5 15h14M12 3v18"/>'),
  route: S('<path d="M12 21s-6-5.6-6-11a6 6 0 1 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>'),
  telefon: S('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>'),
  web: S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'),
  pfeil: S('<path d="M9 6l6 6-6 6"/>'),
  mail: S('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  herz: S('<path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6.4 5 5 0 0 1 21.2 11C19 15.6 12 20 12 20z"/>'),
  teilen: S('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>'),
  blatt: S('<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/>'),
  standort: S('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>'),
  stift: S('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>'),
  markt: S('<path d="M3 9h18l-1.5-4.5h-15z"/><path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/>'),
  tanne: S('<path d="M12 3 7 10h3l-4 6h4l-3 4h10l-3-4h4l-4-6h3z"/><path d="M12 20v1.5"/>'),
};
export function typIcon(art) {
  if (art === 'Milchtankstelle') return ICON.milch;
  if (art === 'Eierautomat') return ICON.eier;
  if (art === 'Hofladen') return ICON.hofladen;
  return ICON.automat;
}

// Entfernung für Karten: unter 1 km in Metern, unter 50 m „am selben Ort“
export const kmAnzeige = (km) => km < 0.05 ? 'am selben Ort' : km < 1 ? `${Math.max(50, Math.round(km * 20) * 50)} m` : `${String(km < 10 ? Math.round(km * 10) / 10 : Math.round(km)).replace('.', ',')} km`;

export function kurzUrl(u) {
  try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/\/$/, ''); } catch { return u; }
}

// Zeile mit Status und heutigen Zeiten. Im Browser wird sie beim Laden aktualisiert (data-oh).
export function statusHtml(oh, ohText, datum) {
  if (ohText) return `<p class="st st-info">${esc(ohText)}</p>`;
  if (!oh) return '<p class="st st-leer">Keine Öffnungszeiten hinterlegt</p>';
  const s = datum ? status(oh, datum) : null;
  if (s) return `<p class="st ${s.offen ? 'st-auf' : 'st-zu'}" data-oh="${esc(oh)}"><b>${esc(s.kurz)}</b><span>Heute ${esc(s.heute)}</span></p>`;
  const z = zeilen(oh);
  const text = z ? z.map(([t, v]) => `${t} ${v}`).join(', ') : uebersetze(oh);
  return `<p class="st st-wochen" data-oh="${esc(oh)}"><span>${esc(text)}</span></p>`;
}

// d: { pfad, titel, art, typ, adresse, oh, ohText, telefon, website, kat[], lat, lon, km, bio, slug }
// Produkt-Icons (24er-Raster, Strich 1,8): als Symbol-Sprite einmal pro Seite, Verwendung über <use href="#p-…">
export const PRODUKT_PFADE = {
  eier: '<path d="M12 3c3.5 0 6 5.2 6 9.5S15.3 21 12 21s-6-4.2-6-8.5S8.5 3 12 3z"/>',
  milch: '<path d="M8 3h8M9 3v3L7 9v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9l-2-3V3"/><path d="M7 13h10"/>',
  kaese: '<path d="M3 17 14 6l7 6v5z"/><path d="M3 17h18"/><circle cx="12" cy="13" r="1.2"/><circle cx="16.5" cy="14.5" r=".9"/>',
  fleisch: '<path d="M5 13c0-5 4-8 9-8 4 0 6 3 6 6 0 4-3 8-9 8-3 0-6-2-6-6z"/><circle cx="14" cy="10.5" r="2"/>',
  gefluegel: '<path d="M14.5 3.5a5 5 0 0 1 3 8.8c-1.8 1.4-3.6 1.2-4.9 1.2L9 17l.4 2-1.9.5-.5-1.9-1.9-.5.5-1.9 2 .4 3.5-3.6c0-1.3-.2-3.1 1.2-4.9a5 5 0 0 1 2.2-3.6z"/>',
  wild: '<path d="M8 21v-5l-3-3V8M5 10 3 8M16 21v-5l3-3V8M19 10l2-2M8 16h8M10 12h4"/>',
  fisch: '<path d="M3 12c3-4 7-6 11-6 3 0 5 2 7 6-2 4-4 6-7 6-4 0-8-2-11-6z"/><path d="m3 12-1-3M3 12l-1 3"/><circle cx="16.5" cy="11" r=".9"/>',
  gemuese: '<path d="M14 8 4.5 19.5c-.6.7.3 1.6 1 1L17 11"/><path d="M14 8c0-2 1.2-3.6 3-4.5M15.5 9.5c2 0 3.6-1.2 4.5-3M14 8l3 3"/>',
  obst: '<path d="M12 7.5c-2.2-1.8-7-1.5-7 4 0 5 3 9 5 9 1 0 1.4-.5 2-.5s1 .5 2 .5c2 0 5-4 5-9 0-5.5-4.8-5.8-7-4z"/><path d="M12 7.5c0-2 .8-3.5 2.2-4.5"/>',
  kartoffeln: '<path d="M5.5 9.5c1.3-3.2 5-4.2 8.3-3.2 3.3 1 5.7 3.3 5.2 6.7-.5 3.4-3 5.8-6.6 5.8C8.6 18.8 4 16.8 4 13.5c0-1.6.6-2.8 1.5-4z"/><circle cx="9.5" cy="11" r=".8"/><circle cx="14" cy="13.5" r=".8"/>',
  honig: '<path d="M7 9h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M8 9V6h8v3M7 13h10"/>',
  brot: '<path d="M4 12a4.5 4.5 0 0 1 4-6h8a4.5 4.5 0 0 1 4 6v7H4z"/><path d="m9 10-1 3M13 10l-1 3M17 10l-1 3"/>',
  nudeln: '<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M8 12c0-3 1.8-5 4-5s4 2 4 5M10.5 3l1 4M14 3l-1 4"/>',
  marmelade: '<path d="M7 8h10l-1 2v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-9z"/><path d="M7 4h10v4H7zM9.5 13h5v4h-5z"/>',
  getraenke: '<path d="M10 3h4v4l2 3v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10l2-3z"/><path d="M8 14h8"/>',
  blumen: '<path d="M12 21v-9"/><circle cx="12" cy="8" r="2"/><path d="M12 6a2.5 2.5 0 1 1 2.4-1.5M14 8a2.5 2.5 0 1 1 1.5 2.4M12 10a2.5 2.5 0 1 1-2.4 1.5M10 8a2.5 2.5 0 1 1-1.5-2.4"/><path d="M12 17c-2.5 0-4-1.5-4-3 2.5 0 4 1.3 4 3z"/>',
  weihnachtsbaeume: '<path d="M12 3 6.5 10.5h3L5 17h14l-4.5-6.5h3z"/><path d="M12 17v4"/>',
  tierfutter: '<path d="M12 21V8"/><path d="M12 8c-2-1-3-3-3-5 2 1 3 2.5 3 5zM12 8c2-1 3-3 3-5-2 1-3 2.5-3 5zM12 13c-2-1-3-3-3-5 2 1 3 2.5 3 5zM12 13c2-1 3-3 3-5-2 1-3 2.5-3 5z"/>',
};
export const PRODUKT_SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${Object.entries(PRODUKT_PFADE)
  .map(([k, p]) => `<symbol id="p-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</symbol>`).join('')}</svg>`;
export const produktIcon = (k) => (PRODUKT_PFADE[k] ? `<svg class="pi" aria-hidden="true" focusable="false"><use href="#p-${k}"/></svg>` : '');

export function karteHtml(d, { datum = null, ueberschrift = 'h3' } = {}) {
  const kat = (d.kat || []).slice(0, 5);
  const H = ueberschrift;
  return `<article class="laden laden-${d.typ}" data-typ="${d.typ}" data-kat="${esc((d.kat || []).join(' '))}" data-lat="${d.lat}" data-lon="${d.lon}" data-slug="${esc(d.slug)}"${d.land ? ` data-land="${esc(d.land)}"` : ''}${d.oh ? ` data-oh="${esc(d.oh)}"` : ''}${d.bio ? ' data-bio="1"' : ''}${d.karte ? ' data-karte-zahlung="1"' : ''}${d.kinder ? ' data-kinder="1"' : ''}${d.oepnv ? ' data-oepnv="1"' : ''}${d.urlaub ? ` data-urlaub="${esc(d.urlaub)}"` : ''}${d.km != null ? ` data-km="${d.km}"` : ''}>
  <div class="laden-symbol" title="${esc(d.art)}">${typIcon(d.art)}</div>
  <button class="merken-mini" type="button" data-merken="${esc(d.slug)}" aria-pressed="false" aria-label="${esc(d.titel)} merken">${ICON.herz}</button>
  <div class="laden-text">
    <p class="laden-art">${esc(d.art)}${d.bio || d.verband ? ` <span class="bio">${esc(d.verband || 'Bio')}</span>` : ''}${d.km != null ? ` <span class="km">${kmAnzeige(d.km)}</span>` : ''}</p>
    <${H} class="laden-name"><a href="${esc(d.pfad)}">${esc(d.titel)}</a></${H}>
    <p class="laden-adr">${esc(d.adresse)}</p>
    ${statusHtml(d.oh, d.ohText, datum)}
    ${kat.length ? `<ul class="chips">${kat.map((k) => `<li>${produktIcon(k)}${esc(KATEGORIEN[k] || k)}</li>`).join('')}</ul>` : ''}
    <p class="aktionen">
      <a class="akt" href="https://www.google.com/maps/dir/?api=1&amp;destination=${d.lat},${d.lon}" rel="nofollow noopener" target="_blank">${ICON.route}Route</a>${d.telefon ? `<a class="akt" href="${telHref(d.telefon)}">${ICON.telefon}Anrufen</a>` : ''}${d.website ? `<a class="akt" href="${esc(d.website)}" rel="nofollow noopener" target="_blank">${ICON.web}Website</a>` : ''}
    </p>
  </div>
</article>`;
}
