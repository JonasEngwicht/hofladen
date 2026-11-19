// Verwaltung der Meldungen (nur mit Zugangsschlüssel = Worker-Secret ADMIN_TOKEN)
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SPEICHER = 'verwaltungToken';
const ART = { neu: 'Neuer Eintrag', korrektur: 'Korrektur', uebernahme: 'Übernahme durch Betreiber' };
const FELDER = { fotos: 'Fotos', name: 'Name', betriebsart: 'Art', strasse: 'Straße', plz: 'PLZ', ort: 'Ort', telefon: 'Telefon', email: 'E-Mail', website: 'Website',
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
  box.innerHTML = `<p class="segment">${['neu', 'freigegeben', 'erledigt', 'abgelehnt'].map((s) => `<button type="button" data-status="${s}" aria-pressed="${s === status}">${s}</button>`).join('')}<button type="button" data-schliessungen>Geschlossen gemeldet</button><button type="button" data-tipps>Tipps</button><button type="button" data-statistik>Statistik</button></p>
    ${d.meldungen.length ? '' : '<p>Keine Meldungen.</p>'}
    ${d.meldungen.map((m) => `<article class="block meldung" data-id="${m.id}">
      <h2>#${m.id} · ${esc(ART[m.art] || m.art)}${m.hof ? ` · <a href="/hof/${esc(m.hof)}/" target="_blank">${esc(m.hof)}</a>` : ''}</h2>
      <p class="leise">${esc(new Date(m.erstellt).toLocaleString('de-DE'))}${m.kontakt_email ? ` · <a href="mailto:${esc(m.kontakt_email)}">${esc(m.kontakt_email)}</a>` : ''}</p>
      ${m.daten.eintrag ? `<p>Stabile ID: <code>${esc(m.daten.eintrag)}</code>${m.daten.badge ? ' · <b>möchte das Badge</b>' : ''}${m.daten.utm ? ` · Herkunft: ${esc(Object.values(m.daten.utm).join(' / '))}` : ''}</p>` : (m.daten.utm ? `<p>Herkunft: ${esc(Object.values(m.daten.utm).join(' / '))}</p>` : '')}
      ${m.daten.diff ? (Object.keys(m.daten.diff).length ? `<table class="woche diff"><thead><tr><th>Feld</th><th>alt</th><th>neu</th></tr></thead><tbody>${Object.entries(m.daten.diff).map(([k, [a, n]]) => `<tr><th>${esc(FELDER[k] || k)}</th><td>${esc(a) || '–'}</td><td><b>${esc(n) || '–'}</b></td></tr>`).join('')}</tbody></table>` : '<p class="leise">Keine Änderungen gegenüber dem bisherigen Eintrag.</p>') : ''}
      <details${m.daten.diff ? '' : ' open'}><summary>Alle Angaben</summary><dl class="merkmale">${Object.entries(m.daten).filter(([k]) => !['diff', 'utm', 'eintrag', 'badge'].includes(k)).map(([k, v]) => `<div><dt>${esc(FELDER[k] || k)}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') : v === true ? 'ja' : v)}</dd></div>`).join('')}</dl></details>
      <details><summary>Angaben bearbeiten (JSON)</summary><textarea rows="8" data-json>${esc(JSON.stringify(m.daten, null, 2))}</textarea></details>
      <div class="fotos" data-fotos="${m.fotos.join(',')}"></div>
      <label>Notiz<input data-notiz value="${esc(m.notiz || '')}"></label>
      <p class="kk-knoepfe"><button class="knopf knopf-gruen" data-setze="freigegeben">Freigeben</button><button class="knopf knopf-hell" data-setze="abgelehnt">Ablehnen</button><button class="knopf knopf-hell" data-setze="erledigt">Erledigt (ohne Veröffentlichung)</button></p>
    </article>`).join('')}`;
  for (const b of box.querySelectorAll('[data-status]')) b.addEventListener('click', () => laden(b.dataset.status));
  box.querySelector('[data-statistik]').addEventListener('click', () => statistik());
  box.querySelector('[data-tipps]').addEventListener('click', () => tipps());
  box.querySelector('[data-schliessungen]').addEventListener('click', () => schliessungen());
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
// Tipps und Daumen hoch von Besuchern (per E-Mail bestätigt): freigeben oder ablehnen
async function tipps() {
  const box = $('#verwaltung');
  box.innerHTML = '<p>Lade …</p>';
  const d = await (await api('tipps')).json();
  box.innerHTML = `<p class="segment"><button type="button" data-zurueck>Meldungen</button></p>
    ${d.tipps.length ? '' : '<p>Keine Tipps zum Prüfen.</p>'}
    ${d.tipps.map((t) => `<article class="block meldung" data-tipp="${t.id}"><h2>${t.pfad ? `<a href="${esc(t.pfad)}" target="_blank">${esc(t.titel)}</a>` : esc(t.sid)}</h2>
      <p class="leise">${esc(new Date(t.erstellt).toLocaleString('de-DE'))}${t.name ? ` · ${esc(t.name)}` : ''}</p>
      <p>${esc(t.merkmale.split(',').filter(Boolean).join(' · ')) || '<i>keine Merkmale</i>'}</p>${t.text ? `<blockquote>${esc(t.text)}</blockquote>` : ''}
      <p class="kk-knoepfe"><button class="knopf knopf-gruen" data-tipp-setze="freigegeben">Freigeben</button><button class="knopf knopf-hell" data-tipp-setze="abgelehnt">Ablehnen</button></p></article>`).join('')}`;
  box.querySelector('[data-zurueck]').addEventListener('click', () => laden());
  for (const b of box.querySelectorAll('[data-tipp-setze]')) b.addEventListener('click', async () => {
    const a = b.closest('[data-tipp]');
    await api(`tipp/${a.dataset.tipp}`, { method: 'POST', body: JSON.stringify({ status: b.dataset.tippSetze }) });
    a.remove();
  });
}
// Über „Geschlossen melden“ gemeldete Einträge: bestätigen (Eintrag verschwindet beim nächsten täglichen Abgleich) oder verwerfen
async function schliessungen() {
  const box = $('#verwaltung');
  box.innerHTML = '<p>Lade …</p>';
  const d = await (await api('rueckmeldungen')).json();
  box.innerHTML = `<p class="segment"><button type="button" data-zurueck>Meldungen</button></p>
    <p class="leise">Einträge, die Besucher als geschlossen gemeldet haben. „Geschlossen bestätigen“ nimmt den Eintrag beim nächsten täglichen Abgleich von der Seite (die Seite liefert dann 410). Bei OSM-Einträgen bitte auch in OpenStreetMap als geschlossen markieren.</p>
    ${d.rueckmeldungen.length ? '' : '<p>Keine offenen Schließungsmeldungen.</p>'}
    ${d.rueckmeldungen.map((x) => `<article class="block meldung" data-eintrag="${esc(x.eintrag)}">
      <h2>${x.pfad ? `<a href="${esc(x.pfad)}" target="_blank">${esc(x.titel)}</a>` : esc(x.titel)} · ${esc(x.ort)}</h2>
      <p>${x.anzahl}× als geschlossen gemeldet (${esc(x.erste)}${x.erste !== x.letzte ? ` bis ${esc(x.letzte)}` : ''})${x.bestaetigt ? ` · zuletzt als „stimmt noch“ bestätigt am ${esc(x.bestaetigt)}` : ''} · ID <code>${esc(x.eintrag)}</code>${/^[nwr]\d+$/.test(x.eintrag) ? ` · <a href="https://www.openstreetmap.org/${{ n: 'node', w: 'way', r: 'relation' }[x.eintrag[0]]}/${x.eintrag.slice(1)}" target="_blank" rel="noopener">in OSM ansehen</a>` : ''}</p>
      <p class="kk-knoepfe"><button class="knopf knopf-dunkel" data-schliessen="geschlossen">Geschlossen bestätigen</button><button class="knopf knopf-hell" data-schliessen="verwerfen">Verwerfen</button></p>
    </article>`).join('')}`;
  box.querySelector('[data-zurueck]').addEventListener('click', () => laden());
  for (const b of box.querySelectorAll('[data-schliessen]')) b.addEventListener('click', async () => {
    const art = b.closest('[data-eintrag]');
    await api(`rueckmeldung/${art.dataset.eintrag}`, { method: 'POST', body: JSON.stringify({ aktion: b.dataset.schliessen }) });
    art.remove();
  });
}
const tabelle = (titel, zeilen, spalten) => `<h2>${esc(titel)}</h2>${zeilen.length ? `<table class="woche"><tbody>${zeilen.map((z) => `<tr>${spalten.map((k) => `<td>${esc(z[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="leise">Noch keine Daten.</p>'}`;
async function statistik(tage = 30) {
  const box = $('#verwaltung');
  box.innerHTML = '<p>Lade …</p>';
  const r = await api(`statistik?tage=${tage}`);
  const d = await r.json();
  box.innerHTML = `<p class="segment"><button type="button" data-zurueck>Meldungen</button>${[7, 30, 90, 365].map((t) => `<button type="button" data-tage="${t}" aria-pressed="${t === tage}">${t} Tage</button>`).join('')}</p>
    <p class="leise">Seit ${esc(d.ab)} – anonyme Tageszähler, ohne Bots.</p>
    ${tabelle('Suchen nach Art', d.suchen, ['art', 'anzahl'])}
    ${tabelle('Klicks und Filter', d.ereignisse, ['ereignis', 'seite', 'detail', 'anzahl'])}
    ${tabelle('Meistgesuchte Kreise', d.kreise, ['kreis', 'anzahl'])}
    ${tabelle('Meistgesuchte Postleitzahlen', d.plz, ['plz', 'kreis', 'anzahl'])}
    ${tabelle('Gesuchte Produkte', d.produkte, ['produkt', 'anzahl'])}
    ${tabelle('Klicks je Tag', d.tage, ['tag', 'anzahl'])}`;
  box.querySelector('[data-zurueck]').addEventListener('click', () => laden());
  for (const b of box.querySelectorAll('[data-tage]')) b.addEventListener('click', () => statistik(+b.dataset.tage));
}
token ? laden() : anmelden();
