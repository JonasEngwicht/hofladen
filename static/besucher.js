// Besucherstatistik in der Verwaltung: Live-Zahlen und Grafiken aus der eigenen, cookielosen Zählung (src/besuche.js).
// Wird von verwaltung.js bei Bedarf geladen. Grafiken sind schlichtes SVG ohne Bibliothek; jede hat einen Hover-Tooltip
// und eine Tabellenansicht. Farben kommen aus den Seiten-Variablen (hell/dunkel).
import { esc } from './helfer.js';

const QUELLEN = { google: 'Google', bing: 'Bing', ecosia: 'Ecosia', duckduckgo: 'DuckDuckGo', 'andere-suche': 'Andere Suchmaschinen',
  sozial: 'Soziale Netzwerke', verweis: 'Links von anderen Websites', direkt: 'Direkt / Lesezeichen' };
const GERAETE = { handy: 'Handy', tablet: 'Tablet', rechner: 'Rechner' };
const zahl = (n) => Number(n || 0).toLocaleString('de-DE');
const naiv = (s) => new Date(`${s.replace(' ', 'T')}${s.length === 10 ? 'T00:00' : ''}:00Z`); // „2026-11-24 11:30“ ohne Zeitzonen-Umrechnung
const fmt = (d, len) => d.toISOString().replace('T', ' ').slice(0, len);
const tagKurz = (t) => `${+t.slice(8, 10)}.${+t.slice(5, 7)}.`;
const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
// Achsenteilung: „runde“ Höchstwerte (1, 2, 5 × 10ⁿ)
function rund(max) { if (max <= 4) return 4; const p = 10 ** Math.floor(Math.log10(max)); for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= max) return f * p; return 10 * p; }

// Säulen (Mengen über Zeit). werte: [{ x: Achsentext, y: Zahl, tip: Tooltip-Text }]
function saeulen(werte, { hoehe = 180, titel, jedeNte = 1, B = 640 } = {}) {
  const H = hoehe, L = 34, U = 22, O = 8, n = werte.length;
  const max = rund(Math.max(1, ...werte.map((w) => w.y)));
  const breite = (B - L) / n, b = Math.max(2, breite - 2);
  const y = (v) => O + (H - O - U) * (1 - v / max);
  const raster = [0, max / 2, max].map((v) => `<line x1="${L}" x2="${B}" y1="${y(v)}" y2="${y(v)}" class="b-raster"/><text x="${L - 6}" y="${y(v) + 4}" class="b-achse" text-anchor="end">${zahl(v)}</text>`).join('');
  const balken = werte.map((w, i) => {
    const x = L + i * breite + (breite - b) / 2, h = (H - O - U) * (w.y / max), r = Math.min(4, b / 2, h);
    // nur oben abgerundet, unten an der Grundlinie gerade
    return h > 0 ? `<path class="b-marke" d="M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${b - 2 * r} q${r},0 ${r},${r} v${h - r} z"/>` : '';
  }).join('');
  const achse = werte.map((w, i) => (i % jedeNte === 0 ? `<text x="${L + i * breite + breite / 2}" y="${H - 6}" class="b-achse" text-anchor="middle">${esc(w.x)}</text>` : '')).join('');
  return { html: `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="${esc(titel)}">${raster}${balken}${achse}<line class="b-fokus" y1="${O}" y2="${H - U}" visibility="hidden"/></svg>`,
    treffer: (fx) => Math.min(n - 1, Math.max(0, Math.floor((fx * B - L) / breite))), xVon: (i) => (L + i * breite + breite / 2) / B, B, werte };
}

// Linien (heute gegen gestern). reihen: [{ name, klasse, werte: [Zahl|null] }], achse: Texte
function linien(reihen, achse, { hoehe = 200, titel, B = 640, jedeNte = 3 } = {}) {
  const H = hoehe, L = 34, U = 22, O = 10, n = achse.length;
  const max = rund(Math.max(1, ...reihen.flatMap((r) => r.werte.filter((v) => v != null))));
  const x = (i) => L + (B - L - 8) * (i / (n - 1)), y = (v) => O + (H - O - U) * (1 - v / max);
  const raster = [0, max / 2, max].map((v) => `<line x1="${L}" x2="${B}" y1="${y(v)}" y2="${y(v)}" class="b-raster"/><text x="${L - 6}" y="${y(v) + 4}" class="b-achse" text-anchor="end">${zahl(v)}</text>`).join('');
  const pfade = reihen.map((r) => {
    const punkte = r.werte.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
    const letzte = r.werte.map((v, i) => [v, i]).filter(([v]) => v != null).pop();
    return `<polyline class="b-linie ${r.klasse}" points="${punkte.join(' ')}"/>${letzte ? `<circle class="b-punkt ${r.klasse}" cx="${x(letzte[1])}" cy="${y(letzte[0])}" r="4"/><text class="b-wert" x="${Math.min(x(letzte[1]) + 8, B - 50)}" y="${y(letzte[0]) - 10}" text-anchor="${x(letzte[1]) > B - 60 ? 'end' : 'start'}">${esc(r.name)}</text>` : ''}`;
  }).join('');
  const beschr = achse.map((a, i) => (i % jedeNte === 0 ? `<text x="${x(i)}" y="${H - 6}" class="b-achse" text-anchor="middle">${esc(a)}</text>` : '')).join('');
  return { html: `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="${esc(titel)}">${raster}${pfade}${beschr}<line class="b-fokus" y1="${O}" y2="${H - U}" visibility="hidden"/></svg>`,
    treffer: (fx) => Math.min(n - 1, Math.max(0, Math.round(((fx * B - L) / (B - L - 8)) * (n - 1)))), xVon: (i) => x(i) / B, B };
}

// Rangliste als waagerechte Balken (Herkunft, Geräte, Seitentypen)
function rangliste(zeilen, gesamt) {
  if (!zeilen.length) return '<p class="leise">Noch keine Daten.</p>';
  const max = Math.max(...zeilen.map((z) => z.n));
  return `<ul class="b-rang">${zeilen.map((z) => `<li><span class="b-rang-name">${esc(z.name)}</span><span class="b-rang-spur"><span class="b-rang-balken" style="width:${(100 * z.n / max).toFixed(1)}%"></span></span><span class="b-rang-zahl">${zahl(z.n)}<small>${gesamt ? ` · ${Math.round(100 * z.n / gesamt)} %` : ''}</small></span></li>`).join('')}</ul>`;
}

// Tooltip und Fokuslinie an eine Grafik hängen
function hover(box, grafik, text) {
  const svg = box.querySelector('svg'), tip = box.querySelector('.b-tip'), fokus = svg.querySelector('.b-fokus');
  const zeige = (ev) => {
    const r = svg.getBoundingClientRect(), i = grafik.treffer((ev.clientX - r.left) / r.width), fx = grafik.xVon(i);
    fokus.setAttribute('x1', fx * grafik.B); fokus.setAttribute('x2', fx * grafik.B); fokus.setAttribute('visibility', 'visible');
    tip.innerHTML = text(i); tip.hidden = false;
    const links = fx * r.width, tb = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(0, links - tb / 2), r.width - tb)}px`;
  };
  svg.addEventListener('pointermove', zeige);
  svg.addEventListener('pointerdown', zeige);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; fokus.setAttribute('visibility', 'hidden'); });
}
const karte = (titel, inhalt, unter = '') => `<section class="block b-karte"><h2>${esc(titel)}</h2>${unter ? `<p class="leise">${unter}</p>` : ''}${inhalt}</section>`;
const tabelle = (kopf, zeilen) => `<details class="b-tabelle"><summary>Als Tabelle</summary><table class="woche"><thead><tr>${kopf.map((k) => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>${zeilen.map((z) => `<tr>${z.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
const liste = (zeilen, leer = 'Noch keine Daten.') => (zeilen.length ? `<ol class="b-liste">${zeilen.map(([a, n]) => `<li><span>${a}</span><b>${zahl(n)}</b></li>`).join('')}</ol>` : `<p class="leise">${leer}</p>`);

let timer = null;
export function besucherBeenden() { clearInterval(timer); timer = null; }

export async function besucher(box, api, zurueck, tage = 30) {
  besucherBeenden();
  box.innerHTML = '<p>Lade …</p>';
  const zeichnen = async () => {
    let d;
    try { const r = await api(`besuche?tage=${tage}`); d = await r.json(); if (!r.ok) throw new Error(d.fehler || r.status); } catch (e) { if (!box.isConnected) besucherBeenden(); return; }
    if (!box.isConnected || !box.querySelector('[data-besucher]') && box.dataset.ansicht !== 'neu') { besucherBeenden(); return; }
    box.dataset.ansicht = '';
    // Grafiken in echter Pixelbreite zeichnen, damit Schrift auf dem Handy lesbar bleibt
    const B = Math.max(280, Math.min(1100, Math.round((box.clientWidth || 640) - 46)));
    const schmal = B < 480;
    const jetzt = naiv(d.stand);
    // letzte 60 Minuten, fehlende Minuten = 0
    const proMinute = new Map(d.live.minuten.map((m) => [m.minute, m]));
    const minuten = Array.from({ length: 60 }, (_, i) => { const k = fmt(new Date(jetzt - (59 - i) * 6e4), 16); return { k, a: proMinute.get(k)?.aufrufe || 0 }; });
    const minG = saeulen(minuten.map((m, i) => ({ x: i === 59 ? 'jetzt' : i % 15 === 0 ? `−${60 - i} Min` : '', y: m.a })), { hoehe: schmal ? 110 : 130, B, titel: 'Seitenaufrufe je Minute, letzte 60 Minuten' });
    // heute gegen gestern je Stunde (Besuche = Einstiege von außen)
    const proStunde = new Map(d.stunden.map((s) => [s.stunde, s]));
    const stundeJetzt = +d.stand.slice(11, 13);
    const heute = Array.from({ length: 24 }, (_, h) => (h <= stundeJetzt ? proStunde.get(`${d.heute.tag} ${String(h).padStart(2, '0')}`)?.einstiege || 0 : null));
    const gestern = Array.from({ length: 24 }, (_, h) => proStunde.get(`${d.gestern.tag} ${String(h).padStart(2, '0')}`)?.einstiege || 0);
    const stdG = linien([{ name: 'gestern', klasse: 'b-gestern', werte: gestern }, { name: 'heute', klasse: 'b-heute', werte: heute }],
      Array.from({ length: 24 }, (_, h) => `${h} Uhr`), { titel: 'Besuche je Stunde, heute und gestern', B, hoehe: schmal ? 180 : 220, jedeNte: schmal ? 6 : 3 });
    // Tage im Zeitraum, fehlende Tage = 0
    const proTag = new Map(d.tageListe.map((t) => [t.tag, t]));
    const tageReihe = Array.from({ length: tage }, (_, i) => fmt(new Date(naiv(d.heute.tag) - (tage - 1 - i) * 864e5), 10))
      .map((t) => ({ t, b: proTag.get(t)?.besuche || 0, a: proTag.get(t)?.aufrufe || 0 }));
    const tagG = saeulen(tageReihe.map((x) => ({ x: tagKurz(x.t), y: x.b })), { titel: `Besuche je Tag, letzte ${tage} Tage`, B, hoehe: schmal ? 170 : 200, jedeNte: Math.ceil(tage / Math.max(4, Math.floor(B / 70))) });
    const summe = tageReihe.reduce((s, x) => s + x.b, 0), summeA = tageReihe.reduce((s, x) => s + x.a, 0);
    const qGesamt = d.quellen.reduce((s, q) => s + q.anzahl, 0);
    const suche = d.quellen.filter((q) => ['google', 'bing', 'ecosia', 'duckduckgo', 'andere-suche'].includes(q.quelle)).reduce((s, q) => s + q.anzahl, 0);
    box.innerHTML = `<div data-besucher class="besucher">
      <p class="segment"><button type="button" data-zurueck>Meldungen</button>${[7, 30, 90, 365].map((t) => `<button type="button" data-tage="${t}" aria-pressed="${t === tage}">${t} Tage</button>`).join('')}</p>
      <p class="b-live"><span class="b-puls" aria-hidden="true"></span> Live · aktualisiert ${esc(d.stand.slice(11))} Uhr · alle 30 Sekunden neu</p>
      <div class="b-kacheln">
        <div class="block b-kachel"><span>Gerade aktiv</span><b>${zahl(d.live.aufrufe5)}</b><small>Seitenaufrufe in den letzten 5 Minuten</small></div>
        <div class="block b-kachel"><span>Besuche heute</span><b>${zahl(d.heute.besuche)}</b><small>gestern ${zahl(d.gestern.besuche)}</small></div>
        <div class="block b-kachel"><span>Seitenaufrufe heute</span><b>${zahl(d.heute.aufrufe)}</b><small>gestern ${zahl(d.gestern.aufrufe)}</small></div>
        <div class="block b-kachel"><span>Besuche, ${tage} Tage</span><b>${zahl(summe)}</b><small>${qGesamt ? `${Math.round(100 * suche / qGesamt)} % über Suchmaschinen` : '&nbsp;'}</small></div>
      </div>
      ${karte('Letzte 60 Minuten', `<div class="b-grafik" data-g="min">${minG.html}<div class="b-tip" hidden></div></div>`, 'Seitenaufrufe je Minute')}
      ${karte('Heute nach Stunden', `<div class="b-grafik" data-g="std">${stdG.html}<div class="b-tip" hidden></div></div>
        <p class="b-legende"><span class="b-heute">heute</span><span class="b-gestern">gestern</span></p>${tabelle(['Stunde', 'heute', 'gestern'], heute.map((v, h) => [`${h} Uhr`, v == null ? '–' : zahl(v), zahl(gestern[h])]))}`, 'Besuche (Aufrufe von außerhalb der Seite)')}
      ${karte(`Besuche je Tag`, `<div class="b-grafik" data-g="tag">${tagG.html}<div class="b-tip" hidden></div></div>${tabelle(['Tag', 'Besuche', 'Seitenaufrufe'], tageReihe.slice().reverse().map((x) => [x.t, zahl(x.b), zahl(x.a)]))}`,
        `${zahl(summe)} Besuche, ${zahl(summeA)} Seitenaufrufe${summe ? `, ${(summeA / summe).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Seiten je Besuch` : ''}`)}
      <div class="b-raster2">
        ${karte('Woher die Besucher kommen', rangliste(d.quellen.map((q) => ({ name: QUELLEN[q.quelle] || q.quelle, n: q.anzahl })), qGesamt))}
        ${karte('Geräte', rangliste(d.geraete.map((g) => ({ name: GERAETE[g.geraet] || g.geraet, n: g.anzahl })), d.geraete.reduce((s, g) => s + g.anzahl, 0)))}
        ${karte('Seitentypen', rangliste(d.typen.map((t) => ({ name: t.typ, n: t.anzahl })), d.typen.reduce((s, t) => s + t.anzahl, 0)), 'Seitenaufrufe')}
        ${karte('Verlinkende Websites', liste(d.verweise.map((v) => [`<a href="https://${esc(v.host)}" target="_blank" rel="noopener">${esc(v.host)}</a>`, v.anzahl]), 'Noch keine Besuche über Links von anderen Websites.'))}
        ${karte('Einstiegsseiten', liste(d.einstiege.map((s) => [`<a href="${esc(s.pfad)}" target="_blank">${esc(s.pfad)}</a>`, s.anzahl])), 'Wo Besuche beginnen')}
        ${karte('Meistbesuchte Seiten', liste(d.seiten.map((s) => [`<a href="${esc(s.pfad)}" target="_blank">${esc(s.pfad)}</a>`, s.anzahl])), 'Seitenaufrufe')}
      </div>
      <p class="leise">Eigene Zählung ohne Cookies: echte Seitenaufrufe aus dem Browser, ohne Bots und Vorab-Ladungen. „Besuch“ = Aufruf, der von außerhalb der Seite kommt; einzelne Personen werden nicht wiedererkannt. Gezählt wird seit dem 24.11.2026.</p>
    </div>`;
    hover(box.querySelector('[data-g="min"]'), minG, (i) => `<b>${esc(minuten[i].k.slice(11))} Uhr</b><br>${zahl(minuten[i].a)} Seitenaufrufe`);
    hover(box.querySelector('[data-g="std"]'), stdG, (i) => `<b>${i}–${i + 1} Uhr</b><br>heute ${heute[i] == null ? '–' : zahl(heute[i])} · gestern ${zahl(gestern[i])} Besuche`);
    hover(box.querySelector('[data-g="tag"]'), tagG, (i) => { const x = tageReihe[i]; return `<b>${WOCHENTAG[naiv(x.t).getUTCDay()]}, ${tagKurz(x.t)}</b><br>${zahl(x.b)} Besuche · ${zahl(x.a)} Seitenaufrufe`; });
    box.querySelector('[data-zurueck]').addEventListener('click', () => { besucherBeenden(); zurueck(); });
    for (const b of box.querySelectorAll('[data-tage]')) b.addEventListener('click', () => besucher(box, api, zurueck, +b.dataset.tage));
  };
  box.dataset.ansicht = 'neu';
  await zeichnen();
  // Live: alle 30 Sekunden neu laden, solange die Ansicht offen und der Tab sichtbar ist (offene Tabellen bleiben offen)
  timer = setInterval(() => {
    if (document.hidden) return;
    if (box.querySelector('.b-tabelle[open], .b-tip:not([hidden])')) return;
    zeichnen();
  }, 30000);
}
