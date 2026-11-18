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
  let irgendwas = false, ph;
  for (let regel of s.split(';')) {
    regel = regel.trim();
    if (!regel) continue;
    const m = regel.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/);
    if (!m) return null;
    const tagTeil = m[1];
    const zeitTeil = m[2].trim();
    let tage = [], mitPh = false;
    if (tagTeil) {
      for (const stueck of tagTeil.split(',').map((x) => x.trim())) {
        if (stueck === 'PH') { mitPh = true; continue; }
        const [a, b] = stueck.split('-');
        const ia = TAGE.indexOf(a), ib = b ? TAGE.indexOf(b) : ia;
        if (ia < 0 || ib < 0) return null;
        for (let i = ia; ; i = (i + 1) % 7) { tage.push(i); if (i === ib) break; }
      }
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
    if (mitPh) ph = intervalle; // Regel für Feiertage („PH off“, „PH 10:00-12:00“)
    if (tage.length) irgendwas = true;
  }
  if (!irgendwas) return null;
  const w = woche.map((x) => x || []);
  if (ph) w.ph = ph;
  return w;
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

// Wochentag (0 = Montag), Minute und Datum (JJJJ-MM-TT) in deutscher Ortszeit
export function berlinZeit(datum = new Date()) {
  const teile = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(datum);
  const get = (t) => teile.find((p) => p.type === t).value;
  return { tag: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')), min: +get('hour') * 60 + +get('minute'),
    ymd: `${get('year')}-${get('month')}-${get('day')}` };
}

// Gesetzliche Feiertage je Bundesland (Kürzel wie BY, NW …); ohne Land nur die bundesweiten.
function ostersonntag(j) {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(Date.UTC(j, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
}
const FEIERTAGE_CACHE = new Map();
export function feiertage(jahr, land = '') {
  const schluessel = `${jahr}|${land}`;
  if (FEIERTAGE_CACHE.has(schluessel)) return FEIERTAGE_CACHE.get(schluessel);
  const o = ostersonntag(jahr);
  const plus = (t) => new Date(o.getTime() + t * 864e5).toISOString().slice(0, 10);
  const fix = (m, t) => `${jahr}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
  const nur = (laender, datum, name) => (laender.includes(land) ? [[datum, name]] : []);
  const bussUndBettag = (() => { const d = new Date(Date.UTC(jahr, 10, 22)); while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const liste = [
    [fix(1, 1), 'Neujahr'], [plus(-2), 'Karfreitag'], [plus(1), 'Ostermontag'], [fix(5, 1), 'Tag der Arbeit'], [plus(39), 'Christi Himmelfahrt'],
    [plus(50), 'Pfingstmontag'], [fix(10, 3), 'Tag der Deutschen Einheit'], [fix(12, 25), '1. Weihnachtstag'], [fix(12, 26), '2. Weihnachtstag'],
    ...nur(['BW', 'BY', 'ST'], fix(1, 6), 'Heilige Drei Könige'), ...nur(['BE', 'MV'], fix(3, 8), 'Frauentag'),
    ...nur(['BB'], plus(0), 'Ostersonntag'), ...nur(['BB'], plus(49), 'Pfingstsonntag'),
    ...nur(['BW', 'BY', 'HE', 'NW', 'RP', 'SL'], plus(60), 'Fronleichnam'), ...nur(['SL'], fix(8, 15), 'Mariä Himmelfahrt'),
    ...nur(['TH'], fix(9, 20), 'Weltkindertag'), ...nur(['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'], fix(10, 31), 'Reformationstag'),
    ...nur(['BW', 'BY', 'NW', 'RP', 'SL'], fix(11, 1), 'Allerheiligen'), ...nur(['SN'], bussUndBettag, 'Buß- und Bettag'),
  ];
  const m = new Map(liste);
  FEIERTAGE_CACHE.set(schluessel, m);
  return m;
}
export function feiertag(ymd, land = '') {
  return feiertage(+ymd.slice(0, 4), land).get(ymd) || null;
}

// true/false = jetzt geöffnet/geschlossen, null = unbekannt.
export function jetztOffen(oh, datum = new Date()) {
  const s = status(oh, datum);
  return s ? s.offen : null;
}

// Status für die Anzeige: { offen, kurz: "Geöffnet bis 18:00" | "Öffnet um 14:00" | "Öffnet Do 15:00" | "Geschlossen", heute: "08:00–18:00" | "geschlossen" }
export function status(oh, datum = new Date(), land = '') {
  const w = parse(oh);
  if (!w) return null;
  const { tag, min, ymd } = berlinZeit(datum);
  const ganz = w.every((iv) => iv.length === 1 && iv[0][0] === 0 && iv[0][1] >= 1440);
  if (ganz) return { offen: true, kurz: 'Rund um die Uhr geöffnet', heute: 'durchgehend' };
  // Feiertag: mit PH-Regel gelten deren Zeiten, sonst ist der Status unsicher
  const ft = feiertag(ymd, land);
  if (ft) {
    if (!w.ph) return { offen: null, kurz: `${ft}: Öffnungszeiten an Feiertagen unklar`, heute: 'Feiertag' };
    w[tag] = w.ph;
  }
  const heute = w[tag].length ? w[tag].map(([a, b]) => `${uhr(a)}–${uhr(b)}`).join(', ') : (ft ? `geschlossen (${ft})` : 'geschlossen');
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
