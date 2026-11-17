// Einfache Auswertung von OSM-Öffnungszeiten (opening_hours).
// Unterstützt die häufigen Formen wie "Mo-Fr 08:00-18:00; Sa 08:00-12:00; Su off" und "24/7".
// Komplexere Angaben (Monate, Wochen, Sonnenaufgang, Kommentare) werden nicht ausgewertet,
// sondern nur übersetzt angezeigt.

const TAGE = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const TAGE_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function minuten(s) {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return +m[1] * 60 + +m[2];
}

// Liefert Array[7] mit Intervallen [[von,bis],...] in Minuten oder null, wenn nicht auswertbar.
export function parse(oh) {
  if (!oh) return null;
  // Häufiger Tippfehler: Regeln mit Komma statt Semikolon getrennt ("Mo-Fr 14:00-17:00, Sa 09:00-12:00")
  const s = oh.trim().replace(/(\d{2}:\d{2})\s*,\s*(?=(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/g, '$1; ');
  if (s === '24/7') return Array.from({ length: 7 }, () => [[0, 1440]]);
  if (/[[\]"]|sunrise|sunset|dawn|dusk|week|\|\||\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|SH/.test(s)) return null;
  const woche = Array.from({ length: 7 }, () => null);
  let irgendwas = false;
  for (let regel of s.split(';')) {
    regel = regel.trim();
    if (!regel) continue;
    const m = regel.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/);
    if (!m) return null;
    const tagTeil = m[1];
    const zeitTeil = m[2].trim();
    let tage = [];
    if (tagTeil) {
      for (const stueck of tagTeil.split(',').map((x) => x.trim())) {
        if (stueck === 'PH') continue;
        const [a, b] = stueck.split('-');
        const ia = TAGE.indexOf(a), ib = b ? TAGE.indexOf(b) : ia;
        if (ia < 0 || ib < 0) return null;
        for (let i = ia; ; i = (i + 1) % 7) { tage.push(i); if (i === ib) break; }
      }
      if (!tage.length) continue; // reine Feiertagsregel
    } else tage = [0, 1, 2, 3, 4, 5, 6];

    let intervalle;
    if (/^(off|closed)$/i.test(zeitTeil)) intervalle = [];
    else if (zeitTeil === '' || zeitTeil === 'open') intervalle = [[0, 1440]];
    else {
      intervalle = [];
      for (const z of zeitTeil.split(',').map((x) => x.trim())) {
        const zm = z.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?$/);
        if (!zm) return null;
        let von = minuten(zm[1]), bis = minuten(zm[2]);
        if (von == null || bis == null) return null;
        if (bis <= von) bis += 1440;
        intervalle.push([von, bis]);
      }
    }
    for (const t of tage) woche[t] = intervalle;
    irgendwas = true;
  }
  if (!irgendwas) return null;
  return woche.map((w) => w || []);
}

const zwei = (n) => String(n).padStart(2, '0');
const uhr = (m) => (m === 1440 ? '24:00' : `${zwei(Math.floor(m / 60) % 24)}:${zwei(m % 60)}`);

// Gruppierte Tageszeilen, z. B. [["Mo–Fr","08:00–18:00"],["Sa","08:00–12:00"],["So","geschlossen"]].
export function zeilen(oh) {
  const w = parse(oh);
  if (!w) return null;
  const text = w.map((iv) => (iv.length ? iv.map(([a, b]) => `${uhr(a)}–${uhr(b)}`).join(', ') : 'geschlossen'));
  const out = [];
  for (let i = 0; i < 7; ) {
    let j = i;
    while (j + 1 < 7 && text[j + 1] === text[i]) j++;
    const tage = i === j ? TAGE_DE[i] : (j === i + 1 ? `${TAGE_DE[i]}, ${TAGE_DE[j]}` : `${TAGE_DE[i]}–${TAGE_DE[j]}`);
    out.push([tage, text[i] === '00:00–24:00' ? 'durchgehend' : text[i]]);
    i = j + 1;
  }
  return out;
}

// Übersetzt eine nicht auswertbare Angabe lesbar ins Deutsche.
export function uebersetze(oh) {
  if (!oh) return '';
  return oh
    .replace(/\bTu\b/g, 'Di').replace(/\bWe\b/g, 'Mi').replace(/\bTh\b/g, 'Do').replace(/\bSu\b/g, 'So')
    .replace(/\bPH\b/g, 'Feiertage').replace(/\bSH\b/g, 'Schulferien')
    .replace(/\b(off|closed)\b/g, 'geschlossen').replace(/\bopen\b/g, 'geöffnet')
    .replace(/24\/7/g, 'rund um die Uhr')
    .replace(/\bJan\b/g, 'Jan.').replace(/\bMar\b/g, 'März').replace(/\bMay\b/g, 'Mai')
    .replace(/\bOct\b/g, 'Okt.').replace(/\bDec\b/g, 'Dez.')
    .replace(/\bsunrise\b/g, 'Sonnenaufgang').replace(/\bsunset\b/g, 'Sonnenuntergang')
    .replace(/(\d)-(\d)/g, '$1–$2').replace(/;\s*/g, '; ');
}

// Wochentag (0 = Montag) und Minute in deutscher Ortszeit
export function berlinZeit(datum = new Date()) {
  const teile = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(datum);
  const get = (t) => teile.find((p) => p.type === t).value;
  return { tag: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')), min: +get('hour') * 60 + +get('minute') };
}

// true/false = jetzt geöffnet/geschlossen, null = unbekannt.
export function jetztOffen(oh, datum = new Date()) {
  const s = status(oh, datum);
  return s ? s.offen : null;
}

// Status für die Anzeige: { offen, kurz: "Geöffnet bis 18:00" | "Öffnet um 14:00" | "Öffnet Do 15:00" | "Geschlossen", heute: "08:00–18:00" | "geschlossen" }
export function status(oh, datum = new Date()) {
  const w = parse(oh);
  if (!w) return null;
  const { tag, min } = berlinZeit(datum);
  const heute = w[tag].length ? w[tag].map(([a, b]) => `${uhr(a)}–${uhr(b)}`).join(', ') : 'geschlossen';
  const ganz = w.every((iv) => iv.length === 1 && iv[0][0] === 0 && iv[0][1] >= 1440);
  if (ganz) return { offen: true, kurz: 'Rund um die Uhr geöffnet', heute: 'durchgehend' };
  for (const [a, b] of w[tag]) if (min >= a && min < b) return { offen: true, kurz: b >= 1440 && a === 0 ? 'Heute durchgehend geöffnet' : `Geöffnet bis ${uhr(b % 1440 || 1440)}`, heute };
  const vortag = (tag + 6) % 7;
  for (const [, b] of w[vortag]) if (b > 1440 && min + 1440 < b) return { offen: true, kurz: `Geöffnet bis ${uhr(b - 1440)}`, heute };
  const spaeter = w[tag].filter(([a]) => a > min).sort((x, y) => x[0] - y[0])[0];
  if (spaeter) return { offen: false, kurz: `Öffnet um ${uhr(spaeter[0])}`, heute };
  for (let i = 1; i <= 7; i++) {
    const t = (tag + i) % 7;
    if (w[t].length) return { offen: false, kurz: `Öffnet ${i === 1 ? 'morgen' : TAGE_DE[t]} ${uhr(w[t][0][0])}`, heute };
  }
  return { offen: false, kurz: 'Geschlossen', heute };
}
