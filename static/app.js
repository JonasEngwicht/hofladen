import { jetztOffen } from './oh.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);

// "Jetzt geöffnet"-Hinweise
function offenBadges(root = document) {
  for (const b of $$('.badge.offen[data-oh]', root)) {
    const o = jetztOffen(b.dataset.oh);
    if (o === null) continue;
    b.textContent = o ? 'Jetzt geöffnet' : 'Jetzt geschlossen';
    b.classList.toggle('zu', !o);
    b.hidden = false;
  }
}
offenBadges();

// Filter auf Kreisseiten
const filter = $('.filter');
if (filter) {
  filter.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-filter]');
    if (!btn) return;
    for (const b of $$('button', filter)) b.setAttribute('aria-pressed', String(b === btn));
    const f = btn.dataset.filter;
    for (const k of $$('.karte')) {
      let zeigen = f === 'alle' || k.dataset.typ === f;
      if (f === 'offen') zeigen = k.dataset.oh ? jetztOffen(k.dataset.oh) === true : false;
      k.hidden = !zeigen;
    }
    for (const s of $$('section.ort')) s.hidden = !$$('.karte', s).some((k) => !k.hidden);
  });
}

// Ergebnisse "in deiner Nähe"
async function zeigeNaehe(query, titel) {
  const box = $('#naehe');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = '<p class="laden">Suche Hofläden in der Nähe …</p>';
  try {
    const r = await fetch('/api/umkreis?' + query + '&limit=12&radius=40');
    const d = await r.json();
    if (!r.ok) throw new Error(d.fehler || 'Fehler');
    const ueberschrift = titel || `In der Nähe von PLZ ${esc(d.ort.plz)} (${esc(d.ort.name)})`;
    if (!d.ergebnisse.length) {
      box.innerHTML = `<h2>${ueberschrift}</h2><p>Im Umkreis von 40 km haben wir leider noch keine Einträge.</p>`;
      return;
    }
    box.innerHTML = `<h2>${ueberschrift}</h2>
      <ol class="naehe-liste">${d.ergebnisse.map((e) => `<li>
        <a href="${esc(e.pfad)}">${esc(e.titel)}</a>
        <span class="klein">${esc(e.art)} · ${esc(e.ort)} · ${String(e.km).replace('.', ',')} km</span>
        ${e.oeffnungszeiten ? `<span class="badge offen" data-oh="${esc(e.oeffnungszeiten)}" hidden></span>` : ''}
      </li>`).join('')}</ol>
      ${d.anzahl > d.ergebnisse.length ? `<p class="klein">${d.anzahl} Einträge im Umkreis von 40 km.</p>` : ''}
      ${!location.pathname.startsWith(d.ort.kreisPfad) ? `<p><a href="${esc(d.ort.kreisPfad)}">Alle Einträge im Kreis anzeigen</a></p>` : ''}`;
    offenBadges(box);
  } catch {
    box.innerHTML = '<p>Die Umkreissuche ist gerade nicht erreichbar.</p>';
  }
}

const plz = params.get('plz');
if (plz && /^\d{5}$/.test(plz) && !params.get('fehler')) {
  try { localStorage.setItem('letztePlz', plz); } catch {}
  zeigeNaehe('plz=' + plz);
}

// Startseite
if (params.get('fehler') === 'plz') {
  const f = $('#plz-fehler');
  if (f) f.hidden = false;
  const i = $('#plz');
  if (i && plz) i.value = plz;
}
const zuletzt = $('#zuletzt');
if (zuletzt) {
  let l = null;
  try { l = localStorage.getItem('letztePlz'); } catch {}
  if (l && /^\d{5}$/.test(l)) {
    zuletzt.innerHTML = `Zuletzt gesucht: <a href="/plz/${l}">${l}</a>`;
    zuletzt.hidden = false;
  }
}
const standort = $('#standort');
if (standort) {
  if (!('geolocation' in navigator)) standort.hidden = true;
  standort.addEventListener('click', () => {
    standort.disabled = true;
    standort.textContent = 'Standort wird ermittelt …';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        standort.hidden = true;
        zeigeNaehe(`lat=${pos.coords.latitude.toFixed(4)}&lon=${pos.coords.longitude.toFixed(4)}`, 'In deiner Nähe');
      },
      () => {
        standort.disabled = false;
        standort.textContent = 'Standort nicht verfügbar – bitte PLZ eingeben';
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  });
}

// Formulare: nur fünfstellige PLZ abschicken
for (const form of $$('form[action="/suche"]')) {
  form.addEventListener('submit', (ev) => {
    const i = $('input[name="plz"]', form);
    i.value = i.value.replace(/\D/g, '');
    if (!/^\d{5}$/.test(i.value)) { ev.preventDefault(); i.focus(); }
  });
}
