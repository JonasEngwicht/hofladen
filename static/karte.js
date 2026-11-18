// Ladenkarte: wird beim Build (Node) und im Browser (Umkreissuche) gleich gerendert.
import { status, zeilen, uebersetze } from './oh.js';

export const KATEGORIEN = {
  eier: 'Eier', milch: 'Milch', kaese: 'Käse', fleisch: 'Fleisch & Wurst', gemuese: 'Gemüse', obst: 'Obst',
  kartoffeln: 'Kartoffeln', honig: 'Honig', brot: 'Brot', getraenke: 'Saft & Wein', blumen: 'Blumen', weihnachtsbaeume: 'Weihnachtsbäume',
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
export function karteHtml(d, { datum = null, ueberschrift = 'h3' } = {}) {
  const kat = (d.kat || []).slice(0, 5);
  const H = ueberschrift;
  return `<article class="laden laden-${d.typ}" data-typ="${d.typ}" data-kat="${esc((d.kat || []).join(' '))}" data-lat="${d.lat}" data-lon="${d.lon}" data-slug="${esc(d.slug)}"${d.oh ? ` data-oh="${esc(d.oh)}"` : ''}${d.bio ? ' data-bio="1"' : ''}${d.km != null ? ` data-km="${d.km}"` : ''}>
  <div class="laden-symbol" title="${esc(d.art)}">${typIcon(d.art)}</div>
  <button class="merken-mini" type="button" data-merken="${esc(d.slug)}" aria-pressed="false" aria-label="${esc(d.titel)} merken">${ICON.herz}</button>
  <div class="laden-text">
    <p class="laden-art">${esc(d.art)}${d.bio ? ' <span class="bio">Bio</span>' : ''}${d.km != null ? ` <span class="km">${String(d.km).replace('.', ',')} km</span>` : ''}</p>
    <${H} class="laden-name"><a href="${esc(d.pfad)}">${esc(d.titel)}</a></${H}>
    <p class="laden-adr">${esc(d.adresse)}</p>
    ${statusHtml(d.oh, d.ohText, datum)}
    ${kat.length ? `<ul class="chips">${kat.map((k) => `<li>${esc(KATEGORIEN[k] || k)}</li>`).join('')}</ul>` : ''}
    <p class="aktionen">
      <a class="akt" href="https://www.google.com/maps/dir/?api=1&amp;destination=${d.lat},${d.lon}" rel="nofollow noopener" target="_blank">${ICON.route}Route</a>${d.telefon ? `<a class="akt" href="${telHref(d.telefon)}">${ICON.telefon}Anrufen</a>` : ''}${d.website ? `<a class="akt" href="${esc(d.website)}" rel="nofollow noopener" target="_blank">${ICON.web}Website</a>` : ''}
    </p>
  </div>
</article>`;
}
