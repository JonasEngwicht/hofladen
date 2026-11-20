// Google Analytics 4 – nur nach ausdrücklicher Einwilligung (§ 25 TDDDG, Art. 6 Abs. 1 lit. a DSGVO).
// Vor der Einwilligung gibt es keine einzige Anfrage an Google. Die Wahl liegt in localStorage „statistik“ (ja/nein)
// und lässt sich über „Cookie-Einstellungen“ im Fuß jeder Seite jederzeit ändern.
export const SCHLUESSEL = 'statistik';

export function wahlLesen(speicher = globalThis.localStorage) {
  try { const w = speicher?.getItem(SCHLUESSEL); return w === 'ja' || w === 'nein' ? w : null; } catch { return null; }
}
export function wahlSpeichern(w, speicher = globalThis.localStorage) {
  try { speicher?.setItem(SCHLUESSEL, w); } catch {}
}

// Analytics-Cookies dieser Website löschen (_ga, _ga_<ID>), z. B. nach Widerruf
export function cookiesLoeschen(doc = document) {
  const namen = doc.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^_ga(_|$)|^_gid$|^_gat/.test(n));
  const domains = ['', location.hostname, `.${location.hostname.replace(/^www\./, '')}`];
  for (const n of namen) for (const d of domains) doc.cookie = `${n}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
  return namen;
}

let geladen = false;
export function analyticsLaden(id) {
  if (geladen || !/^G-[A-Z0-9]+$/.test(id)) return;
  geladen = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  window.gtag('js', new Date());
  window.gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(s);
}

function bannerZeigen(id) {
  if (document.querySelector('.einwilligung')) return;
  const box = document.createElement('div');
  box.className = 'einwilligung';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Einwilligung in die Statistik');
  box.innerHTML = `<p><b>Darf Google Analytics mitzählen?</b> Wir möchten sehen, welche Seiten genutzt werden, um die Hofladenliste zu verbessern. Dafür setzt Google Cookies und überträgt Nutzungsdaten auch in die USA. Ohne deine Zustimmung passiert nichts davon. <a href="/datenschutz/#google-analytics">Mehr dazu</a></p>
<div class="einwilligung-knoepfe"><button type="button" data-wahl="nein">Ablehnen</button><button type="button" data-wahl="ja">Erlauben</button></div>`;
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-wahl]');
    if (!b) return;
    const vorher = wahlLesen();
    wahlSpeichern(b.dataset.wahl);
    box.remove();
    if (b.dataset.wahl === 'ja') analyticsLaden(id);
    else if (vorher === 'ja') { cookiesLoeschen(); location.reload(); } // Widerruf: Skript ist schon geladen, Seite neu laden
  });
  document.body.append(box);
}

export function statistikStarten(id) {
  if (!id) return;
  for (const k of document.querySelectorAll('[data-cookie-einstellungen]')) {
    k.hidden = false;
    k.addEventListener('click', (ev) => { ev.preventDefault(); bannerZeigen(id); });
  }
  const w = wahlLesen();
  if (w === 'ja') analyticsLaden(id);
  else if (w === null) bannerZeigen(id);
}
