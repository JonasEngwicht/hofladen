// Google Analytics 4 und Google AdSense – nur nach ausdrücklicher Einwilligung (§ 25 TDDDG, Art. 6 Abs. 1 lit. a DSGVO).
// Vor der Einwilligung gibt es keine einzige Anfrage an Google. Die Wahl liegt je Dienst in localStorage
// („statistik“ bzw. „werbung“, jeweils ja/nein) und lässt sich über „Cookie-Einstellungen“ im Fuß jeder Seite jederzeit ändern.
export const SCHLUESSEL = 'statistik';
export const SCHLUESSEL_WERBUNG = 'werbung';

export function wahlLesen(speicher = globalThis.localStorage, schluessel = SCHLUESSEL) {
  try { const w = speicher?.getItem(schluessel); return w === 'ja' || w === 'nein' ? w : null; } catch { return null; }
}
export function wahlSpeichern(w, speicher = globalThis.localStorage, schluessel = SCHLUESSEL) {
  try { speicher?.setItem(schluessel, w); } catch {}
}

// Cookies von Analytics (_ga, _ga_<ID>) bzw. AdSense (__gads, __gpi, __eoi) dieser Website löschen, z. B. nach Widerruf
const MUSTER = { statistik: /^_ga(_|$)|^_gid$|^_gat/, werbung: /^__(gads|gpi|eoi)$|^_gcl_/ };
export function cookiesLoeschen(doc = document, art = 'statistik') {
  const namen = doc.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => MUSTER[art].test(n));
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

let werbungGeladen = false;
export function werbungLaden(client) {
  if (werbungGeladen || !/^ca-pub-\d{16}$/.test(client)) return;
  werbungGeladen = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.append(s);
}

// Welche Dienste sind eingerichtet? Nur diese erscheinen im Hinweis.
function dienste(ga, ads) {
  return [
    ga && { art: 'statistik', schluessel: SCHLUESSEL, name: 'Statistik (Google Analytics)', text: 'zählt, welche Seiten genutzt werden, damit wir die Hofladenliste verbessern können', anker: 'google-analytics', laden: () => analyticsLaden(ga) },
    ads && { art: 'werbung', schluessel: SCHLUESSEL_WERBUNG, name: 'Werbung (Google AdSense)', text: 'zeigt Anzeigen, mit denen wir die kostenlose Hofladenliste finanzieren', anker: 'google-adsense', laden: () => werbungLaden(ads) },
  ].filter(Boolean);
}

function bannerZeigen(liste) {
  if (document.querySelector('.einwilligung')) return;
  const box = document.createElement('div');
  box.className = 'einwilligung';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Einwilligung in Statistik und Werbung');
  const frage = liste.length > 1 ? 'Darf Google mitzählen und Werbung zeigen?' : liste[0].art === 'werbung' ? 'Darf Google Werbung zeigen?' : 'Darf Google Analytics mitzählen?';
  const auswahl = liste.length > 1 ? `<ul class="einwilligung-auswahl">${liste.map((d) => `<li><label><input type="checkbox" data-dienst="${d.art}"${wahlLesen(undefined, d.schluessel) === 'ja' ? ' checked' : ''}> <b>${d.name}</b> – ${d.text}</label></li>`).join('')}</ul>` : '';
  box.innerHTML = `<p><b>${frage}</b> ${liste.length > 1 ? 'Dafür setzt Google Cookies und überträgt Nutzungsdaten auch in die USA.' : `Google ${liste[0].text}. Dafür setzt Google Cookies und überträgt Nutzungsdaten auch in die USA.`} Ohne deine Zustimmung passiert nichts davon. <a href="/datenschutz/#${liste[0].anker}">Mehr dazu</a></p>${auswahl}
<div class="einwilligung-knoepfe"><button type="button" data-wahl="nein">Ablehnen</button>${liste.length > 1 ? '<button type="button" data-wahl="auswahl">Auswahl speichern</button>' : ''}<button type="button" data-wahl="ja">${liste.length > 1 ? 'Alle erlauben' : 'Erlauben'}</button></div>`;
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-wahl]');
    if (!b) return;
    let neuLaden = false;
    for (const d of liste) {
      const feld = box.querySelector(`[data-dienst="${d.art}"]`);
      const w = b.dataset.wahl === 'auswahl' ? (feld?.checked ? 'ja' : 'nein') : b.dataset.wahl;
      const vorher = wahlLesen(undefined, d.schluessel);
      wahlSpeichern(w, undefined, d.schluessel);
      if (w === 'ja') d.laden();
      else if (vorher === 'ja') { cookiesLoeschen(document, d.art); neuLaden = true; } // Widerruf: Skript ist schon geladen
    }
    box.remove();
    if (neuLaden) location.reload();
  });
  document.body.append(box);
}

export function statistikStarten(ga, ads) {
  const liste = dienste(ga, ads);
  if (!liste.length) return;
  for (const k of document.querySelectorAll('[data-cookie-einstellungen]')) {
    k.hidden = false;
    k.addEventListener('click', (ev) => { ev.preventDefault(); bannerZeigen(liste); });
  }
  let offen = false;
  for (const d of liste) {
    const w = wahlLesen(undefined, d.schluessel);
    if (w === 'ja') d.laden();
    else if (w === null) offen = true;
  }
  if (offen) bannerZeigen(liste);
}
