// Betreiber-Bereich (/betrieb/): Anmeldung per Link, eigene Höfe, Neuigkeiten, Termine, Statistik
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const datum = (d) => (d ? new Date(d.length === 10 ? `${d}T12:00` : d).toLocaleString('de-DE', d.length === 10 ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');
const zahl = (n) => (n || 0).toLocaleString('de-DE');

async function api(pfad, body) {
  const r = await fetch(`/api/betrieb/${pfad}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, ...d };
}

function hofHtml(h, daten) {
  const news = daten.neuigkeiten.filter((n) => n.sid === h.sid);
  const termine = daten.veranstaltungen.filter((v) => v.sid === h.sid);
  const arten = Object.entries(daten.newsArten);
  return `<article class="betrieb-hof" data-sid="${esc(h.sid)}">
  <h2><a href="${esc(h.pfad)}">${esc(h.titel)}</a></h2>
  <p class="leise">${esc(h.art)} in ${esc(h.ort)} · Angaben zu ${zahl(h.vollstaendigkeit)} % vollständig</p>
  <p class="betrieb-aktionen"><a class="knopf" href="/mitmachen/?eintrag=${encodeURIComponent(h.sid)}&amp;aktion=ergaenzen">Angaben und Öffnungszeiten bearbeiten</a>
    <a class="knopf knopf-hell" href="/betrieb/aushang/?eintrag=${encodeURIComponent(h.sid)}">Aushang mit QR-Code drucken</a>
    <a class="knopf knopf-hell" href="/fuer-hoefe/?eintrag=${encodeURIComponent(h.sid)}">Badge für eure Website</a></p>
  <p class="leise">Als angemeldeter Betrieb gehen deine Änderungen ohne Prüfung durch und erscheinen nach der nächsten Aktualisierung (meist innerhalb von zwei Stunden). Deine Angaben haben Vorrang vor OpenStreetMap.</p>

  <section class="betrieb-block"><h3>Neuigkeit veröffentlichen</h3>
    <form data-news-form class="betrieb-form">
      <label>Was gibt es? <select name="art">${arten.map(([k, t]) => `<option value="${k}">${esc(k === 'da' ? '… ist da!' : k === 'ab' ? '… ab heute' : k === 'verfuegbar' ? '… verfügbar' : t)}</option>`).join('')}</select></label>
      <label>Produkt <input name="produkt" maxlength="40" placeholder="z. B. Spargel, Erdbeeren, Kürbisse"></label>
      <label>Zusatz (optional) <input name="text" maxlength="160" placeholder="z. B. weißer und grüner Spargel"></label>
      <label>Anzeigen für <select name="tage"><option value="1">heute</option><option value="3">3 Tage</option><option value="7">1 Woche</option><option value="14" selected>2 Wochen</option><option value="30">4 Wochen</option><option value="60">8 Wochen</option></select></label>
      <button type="submit" class="knopf">Veröffentlichen</button>
      <p class="leise" data-status aria-live="polite"></p>
    </form>
    ${news.length ? `<ul class="betrieb-liste">${news.map((n) => `<li><b>${esc(n.text)}</b> <span class="leise">bis ${esc(datum(n.bis))}</span> <button type="button" class="link" data-loeschen="neuigkeit/${n.id}">Entfernen</button></li>`).join('')}</ul>` : '<p class="leise">Gerade keine Neuigkeit aktiv. Sie erscheint sofort auf deiner Hofseite, in Listen und auf der Startseite.</p>'}
  </section>

  <section class="betrieb-block"><h3>Veranstaltung eintragen</h3>
    <form data-termin-form class="betrieb-form">
      <label>Titel <input name="titel" maxlength="100" required placeholder="z. B. Hoffest, Tag des offenen Hofes"></label>
      <label>Beginn <input name="beginn" type="datetime-local" required></label>
      <label>Ende (optional) <input name="ende" type="datetime-local"></label>
      <label class="breit">Beschreibung (optional) <textarea name="beschreibung" maxlength="600" rows="3"></textarea></label>
      <button type="submit" class="knopf">Termin speichern</button>
      <p class="leise" data-status aria-live="polite"></p>
    </form>
    ${termine.length ? `<ul class="betrieb-liste">${termine.map((v) => `<li><b>${esc(v.titel)}</b> <span class="leise">${esc(datum(v.beginn))}</span> <button type="button" class="link" data-loeschen="veranstaltung/${v.id}">Absagen</button></li>`).join('')}</ul>` : ''}
  </section>

  <section class="betrieb-block"><h3>Statistik (letzte 90 Tage)</h3><div data-statistik><p class="leise">Wird geladen …</p></div></section>
</article>`;
}

async function statistik(el, sid) {
  const s = await api(`statistik?sid=${encodeURIComponent(sid)}`);
  if (!s.ok) { el.innerHTML = '<p class="leise">Statistik gerade nicht verfügbar.</p>'; return; }
  const z = s.summen || {};
  el.innerHTML = `<dl class="betrieb-zahlen">${[['aufruf', 'Aufrufe der Hofseite'], ['route', 'Klicks auf „Route“'], ['telefon', 'Klicks auf „Anrufen“'], ['website', 'Klicks auf die Website'], ['merken', 'Gemerkt']]
    .map(([k, t]) => `<div><dt>${t}</dt><dd>${zahl(z[k])}</dd></div>`).join('')}</dl><p class="leise">Gezählt werden nur Tagessummen, ohne Cookies und ohne Daten über einzelne Besucher.</p>`;
}

async function zeigen() {
  const wurzel = $('[data-betrieb]');
  const inhalt = $('[data-betrieb-inhalt]', wurzel), login = $('[data-betrieb-anmelden]', wurzel);
  const d = await api('ich');
  if (!d.ok) { login.hidden = false; inhalt.hidden = true; return; }
  login.hidden = true; inhalt.hidden = false;
  inhalt.innerHTML = `<p class="betrieb-kopf">Angemeldet als <b>${esc(d.email)}</b> · <button type="button" class="link" data-abmelden>Abmelden</button></p>
    ${d.hoefe.length ? d.hoefe.map((h) => hofHtml(h, d)).join('') : '<p>Deinem Zugang ist noch kein Hof zugeordnet. Schreib uns an <a href="mailto:hofladenliste@gmail.com">hofladenliste@gmail.com</a>.</p>'}`;
  for (const art of inhalt.querySelectorAll('[data-sid]')) statistik($('[data-statistik]', art), art.dataset.sid);
}

export async function betrieb() {
  const wurzel = $('[data-betrieb]');
  const p = new URLSearchParams(location.search);
  const token = p.get('anmelden');
  if (token) {
    history.replaceState(null, '', '/betrieb/');
    const r = await api('einloesen', { token });
    const box = document.createElement('p');
    box.className = r.ok ? 'hinweis-box' : 'hinweis-box fehler';
    box.textContent = r.ok ? (r.hinweis || 'Du bist angemeldet.') : r.fehler;
    wurzel.prepend(box);
  }
  $('[data-anmelden-form]', wurzel)?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget, st = $('[data-anmelden-status]', f);
    st.textContent = 'Wird gesendet …';
    const r = await api('anmelden', { email: f.email.value });
    st.textContent = r.ok ? 'Wenn es für diese Adresse einen Zugang gibt, ist der Link jetzt unterwegs. Schau auch im Spam-Ordner nach.' : r.fehler;
  });
  wurzel.addEventListener('submit', async (ev) => {
    const f = ev.target;
    if (!f.matches('[data-news-form], [data-termin-form]')) return;
    ev.preventDefault();
    const sid = f.closest('[data-sid]').dataset.sid, st = $('[data-status]', f);
    const daten = Object.fromEntries(new FormData(f));
    st.textContent = 'Wird gespeichert …';
    const r = await api(f.matches('[data-news-form]') ? 'neuigkeit' : 'veranstaltung', { sid, ...daten });
    if (!r.ok) { st.textContent = r.fehler || 'Speichern fehlgeschlagen.'; return; }
    await zeigen();
  });
  wurzel.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-loeschen], [data-abmelden]');
    if (!b) return;
    if (b.matches('[data-abmelden]')) { await api('abmelden', {}); return zeigen(); }
    await api(`${b.dataset.loeschen}/loeschen`, {});
    zeigen();
  });
  await zeigen();
}
