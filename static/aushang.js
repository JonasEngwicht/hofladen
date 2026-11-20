// Aushang zum Ausdrucken (A4/A5) mit QR-Code zum eigenen Eintrag, und der Flyer „Empfiehl deinen Lieblingshof“
import { qrSvg } from './qr.js';
import { zeilen } from './oh.js';
import { KATEGORIEN } from './karte.js';
import { esc } from './helfer.js';

const $ = (s, el = document) => el.querySelector(s);

function papier(format) {
  let st = $('#papier-format');
  if (!st) { st = document.createElement('style'); st.id = 'papier-format'; document.head.append(st); }
  st.textContent = `@page { size: ${format} portrait; margin: 0; }`;
  document.documentElement.dataset.papier = format;
  for (const b of document.querySelectorAll('[data-papier-wahl]')) b.setAttribute('aria-pressed', String(b.dataset.papierWahl === format));
}

export async function aushang() {
  const blatt = $('[data-aushang]');
  for (const b of document.querySelectorAll('[data-papier-wahl]')) b.addEventListener('click', () => papier(b.dataset.papierWahl));
  $('[data-drucken]')?.addEventListener('click', () => print());
  papier('A4');
  if (blatt.dataset.aushang === 'empfehlung') {
    $('[data-qr]', blatt).innerHTML = qrSvg('https://hofladenliste.de/mitmachen/?utm_source=empfehlung&utm_medium=flyer');
    return;
  }
  const id = new URLSearchParams(location.search).get('eintrag');
  const status = $('[data-aushang-status]');
  if (!id) { status.textContent = 'Öffne diese Seite über den Betreiber-Bereich oder hänge ?eintrag=<ID> an.'; return; }
  const r = await fetch(`/api/eintrag?id=${encodeURIComponent(id)}`);
  if (!r.ok) { status.textContent = 'Eintrag nicht gefunden.'; return; }
  const { eintrag: e } = await r.json();
  const url = `https://hofladenliste.de${e.pfad}`;
  const z = e.oeffnungszeiten ? zeilen(e.oeffnungszeiten) : null;
  $('[data-hof-name]', blatt).textContent = e.titel;
  $('[data-hof-art]', blatt).textContent = `${e.art} · ${e.adresse}`;
  $('[data-hof-zeiten]', blatt).innerHTML = z ? `<h2>Öffnungszeiten</h2><table>${z.map(([t, x]) => `<tr><th>${esc(t)}</th><td>${esc(x)}</td></tr>`).join('')}</table>`
    : e.oeffnungszeitenText ? `<h2>Öffnungszeiten</h2><p>${esc(e.oeffnungszeitenText)}</p>` : '';
  $('[data-hof-angebot]', blatt).innerHTML = e.angebot?.length ? `<h2>Bei uns gibt es</h2><p class="aushang-chips">${e.angebot.map((k) => `<span>${esc(KATEGORIEN[k] || k)}</span>`).join('')}</p>` : '';
  $('[data-hof-telefon]', blatt).textContent = e.telefon ? `Telefon ${e.telefon}` : '';
  $('[data-qr]', blatt).innerHTML = qrSvg(`${url}?utm_source=aushang&utm_medium=qr`);
  $('[data-qr-url]', blatt).textContent = url.replace('https://', '');
  status.textContent = '';
  blatt.hidden = false;
}
