// Verwaltung der Meldungen (nur mit Zugangsschlüssel = Worker-Secret ADMIN_TOKEN)
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SPEICHER = 'verwaltungToken';
const ART = { neu: 'Neuer Eintrag', korrektur: 'Korrektur', uebernahme: 'Übernahme durch Betreiber' };
const FELDER = { name: 'Name', betriebsart: 'Art', strasse: 'Straße', plz: 'PLZ', ort: 'Ort', telefon: 'Telefon', email: 'E-Mail', website: 'Website',
  oeffnungszeiten: 'Öffnungszeiten (OSM)', saison: 'Saison', angebot: 'Angebot', bio: 'Bio', zahlung: 'Bezahlen', beschreibung: 'Beschreibung', hinweis: 'Anmerkung', kontakt_name: 'Kontakt' };
let token = sessionStorage.getItem(SPEICHER) || '';

async function api(pfad, opt = {}) {
  const r = await fetch(`/api/verwaltung/${pfad}`, { ...opt, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  if (r.status === 401) { sessionStorage.removeItem(SPEICHER); token = ''; anmelden('Zugangsschlüssel falsch.'); throw new Error('401'); }
  return r;
}
function anmelden(meldung = '') {
  $('#verwaltung').innerHTML = `<form id="login" class="melde-form"><label>Zugangsschlüssel<input type="password" name="t" autocomplete="current-password" required></label><p><button class="knopf knopf-dunkel">Anmelden</button></p>${meldung ? `<p class="fehler">${esc(meldung)}</p>` : ''}</form>`;
  $('#login').addEventListener('submit', (ev) => { ev.preventDefault(); token = ev.target.t.value.trim(); sessionStorage.setItem(SPEICHER, token); laden(); });
}
async function bild(id) {
  const r = await api(`foto/${id}`);
  return URL.createObjectURL(await r.blob());
}
async function laden(status = 'neu') {
  const box = $('#verwaltung');
  box.innerHTML = '<p>Lade …</p>';
  let d;
  try { const r = await api(`meldungen?status=${status}`); d = await r.json(); if (!r.ok) { box.innerHTML = `<p class="fehler">${esc(d.fehler)}</p>`; return; } } catch { return; }
  box.innerHTML = `<p class="segment">${['neu', 'freigegeben', 'erledigt', 'abgelehnt'].map((s) => `<button type="button" data-status="${s}" aria-pressed="${s === status}">${s}</button>`).join('')}</p>
    ${d.meldungen.length ? '' : '<p>Keine Meldungen.</p>'}
    ${d.meldungen.map((m) => `<article class="block meldung" data-id="${m.id}">
      <h2>#${m.id} · ${esc(ART[m.art] || m.art)}${m.hof ? ` · <a href="/hof/${esc(m.hof)}/" target="_blank">${esc(m.hof)}</a>` : ''}</h2>
      <p class="leise">${esc(new Date(m.erstellt).toLocaleString('de-DE'))}${m.kontakt_email ? ` · <a href="mailto:${esc(m.kontakt_email)}">${esc(m.kontakt_email)}</a>` : ''}</p>
      <dl class="merkmale">${Object.entries(m.daten).map(([k, v]) => `<div><dt>${esc(FELDER[k] || k)}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') : v === true ? 'ja' : v)}</dd></div>`).join('')}</dl>
      <details><summary>Angaben bearbeiten (JSON)</summary><textarea rows="8" data-json>${esc(JSON.stringify(m.daten, null, 2))}</textarea></details>
      <div class="fotos" data-fotos="${m.fotos.join(',')}"></div>
      <label>Notiz<input data-notiz value="${esc(m.notiz || '')}"></label>
      <p class="kk-knoepfe"><button class="knopf knopf-gruen" data-setze="freigegeben">Freigeben</button><button class="knopf knopf-hell" data-setze="abgelehnt">Ablehnen</button><button class="knopf knopf-hell" data-setze="erledigt">Erledigt (ohne Veröffentlichung)</button></p>
    </article>`).join('')}`;
  for (const b of box.querySelectorAll('[data-status]')) b.addEventListener('click', () => laden(b.dataset.status));
  for (const f of box.querySelectorAll('[data-fotos]')) for (const id of f.dataset.fotos.split(',').filter(Boolean)) {
    const img = new Image(); img.alt = `Foto ${id}`; img.width = 240; bild(id).then((u) => { img.src = u; }); f.append(img);
  }
  for (const b of box.querySelectorAll('[data-setze]')) b.addEventListener('click', async () => {
    const art = b.closest('[data-id]');
    let daten;
    try { daten = JSON.parse(art.querySelector('[data-json]').value); } catch { alert('JSON ist ungültig.'); return; }
    await api(`meldung/${art.dataset.id}`, { method: 'POST', body: JSON.stringify({ status: b.dataset.setze, notiz: art.querySelector('[data-notiz]').value, daten }) });
    art.remove();
  });
}
token ? laden() : anmelden();
