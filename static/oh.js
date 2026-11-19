// Einfache Auswertung von OSM-Öffnungszeiten (opening_hours).
// Unterstützt die häufigen Formen wie "Mo-Fr 08:00-18:00; Sa 08:00-12:00; Su off" und "24/7".
// Saisonzeiten (Monate, Datumsbereiche, Jahre), offenes Ende („10:00+“), Sonnenauf-/-untergang und
// Ausweichregeln nur mit Kommentar („|| "nach Vereinbarung"“) wertet status() je Datum aus (regeln/tagesplan).
// Kalenderwochen, n-ter Wochentag, Schulferien und Regeln mit Kommentar bleiben unausgewertet und werden übersetzt angezeigt.

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
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ?(\d{1,2})\b(?!:)/g, (_, m, d) => `${+d}. ${m}`)
    .replace(/\s*\|\|\s*"([^"]*)"/g, ' (sonst $1)').replace(/"([^"]*)"/g, '„$1“')
    .replace(/(\d{2}:\d{2})\+/g, 'ab $1')
    .replace(/\bTu\b/g, 'Di').replace(/\bWe\b/g, 'Mi').replace(/\bTh\b/g, 'Do').replace(/\bSu\b/g, 'So')
    .replace(/\bPH\b/g, 'Feiertage').replace(/\bSH\b/g, 'Schulferien')
    .replace(/\b(off|closed)\b/g, 'geschlossen').replace(/\bopen\b/g, 'geöffnet')
    .replace(/24\/7/g, 'rund um die Uhr')
    .replace(/\bJan\b/g, 'Jan.').replace(/\bFeb\b/g, 'Feb.').replace(/\bMar\b/g, 'März').replace(/\bApr\b/g, 'Apr.').replace(/\bMay\b/g, 'Mai')
    .replace(/\bJun\b/g, 'Juni').replace(/\bJul\b/g, 'Juli').replace(/\bAug\b/g, 'Aug.').replace(/\bSep\b/g, 'Sept.')
    .replace(/\bOct\b/g, 'Okt.').replace(/\bNov\b/g, 'Nov.').replace(/\bDec\b/g, 'Dez.')
    .replace(/\bsunrise\b/g, 'Sonnenaufgang').replace(/\bsunset\b/g, 'Sonnenuntergang')
    .replace(/(\d)-(\d)/g, '$1–$2')
    .replace(/(\b(?:Mo|Di|Mi|Do|Fr|Sa|So|Jan\.|Feb\.|März|Apr\.|Mai|Juni|Juli|Aug\.|Sept\.|Okt\.|Nov\.|Dez\.|\d{1,2}|Sonnenaufgang))-(?=Mo|Di|Mi|Do|Fr|Sa|So|Jan|Feb|März|Apr|Mai|Juni|Juli|Aug|Sept|Okt|Nov|Dez|\d|Sonnenuntergang)/g, '$1–')
    .replace(/;\s*/g, '; ');
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


// ---------- Erweiterter Leser: Regeln mit Datumsbereichen ----------
const MONATE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONATE_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MON = MONATE.join('|');
const TAG_RE = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?';
const PUNKT = '(?:\\d{1,2}:\\d{2}|sunrise|sunset|dawn|dusk|\\((?:sunrise|sunset|dawn|dusk)[+-]\\d{1,2}:\\d{2}\\))';
const REGEL_CACHE = new Map();

// Zeitpunkt: Minuten oder Sonnenereignis mit Versatz
function punktLesen(t) {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return +m[1] <= 24 && +m[2] < 60 ? { min: +m[1] * 60 + +m[2] } : null;
  const s = t.match(/^\(?(sunrise|sunset|dawn|dusk)(?:([+-])(\d{1,2}):(\d{2}))?\)?$/);
  if (!s) return null;
  return { ev: s[1], off: s[2] ? (s[2] === '-' ? -1 : 1) * (+s[3] * 60 + +s[4]) : 0 };
}

// Datums-Auswahl am Regelanfang, z. B. „Apr-Oct“, „May 01-Oct 31“, „Apr,May,Nov 16-30“, „2026 Dec 24-26,31“
function datumLesen(r) {
  const bereiche = [];
  let rest = r, jahr = null, letzterMonat = null;
  const j = rest.match(/^(\d{4})\s+(?=(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b)/);
  if (j) { jahr = +j[1]; rest = rest.slice(j[0].length); }
  const item = new RegExp(`^(${MON})(?:\\s*(\\d{1,2})(?!\\d*:\\d))?(?:-(?:(${MON})\\s*)?(\\d{1,2}(?!\\d*:\\d))?)?(?![a-z])`);
  const nurTag = /^(\d{1,2})(?:-(\d{1,2}))?(?!\d*:\d)(?=\s*[,:;]|\s+[A-Za-z]|\s*$)/;
  for (let erst = true; ; erst = false) {
    let m = rest.match(item);
    if (m) {
      const m1 = MONATE.indexOf(m[1]) + 1, m2 = m[3] ? MONATE.indexOf(m[3]) + 1 : (m[4] ? m1 : (m[0].includes('-') ? null : m1));
      if (m2 == null) return null;
      const d1 = m[2] ? +m[2] : 1, d2 = m[4] ? +m[4] : (m[3] || !m[2] ? 31 : d1);
      bereiche.push([m1 * 100 + d1, m2 * 100 + d2]); letzterMonat = m2;
      rest = rest.slice(m[0].length);
    } else if (!erst && letzterMonat && (m = rest.match(nurTag))) {
      bereiche.push([letzterMonat * 100 + +m[1], letzterMonat * 100 + +(m[2] || m[1])]);
      rest = rest.slice(m[0].length);
    } else if (erst) return { bereiche: null, jahr: null, rest: r };
    else return null;
    const komma = rest.match(/^\s*,\s*/);
    if (!komma) break;
    const weiter = rest.slice(komma[0].length);
    if (!new RegExp(`^(?:${MON})\\b|^\\d{1,2}(?!\\d*:\\d)`).test(weiter)) break;
    rest = weiter;
  }
  return { bereiche, jahr, rest: rest.replace(/^\s*:?\s*/, '') };
}

// Regeln lesen: [{ bereiche, jahr, tage, ph, zeiten | 'off' }] oder null, wenn nicht auswertbar
export function regeln(oh) {
  if (!oh) return null;
  if (REGEL_CACHE.has(oh)) return REGEL_CACHE.get(oh);
  let erg = null;
  try { erg = regelnLesen(oh); } catch { erg = null; }
  REGEL_CACHE.set(oh, erg);
  return erg;
}
function regelnLesen(oh) {
  // Ausweichregeln, die nur einen Kommentar tragen („|| "nach Vereinbarung"“), ändern die festen Zeiten nicht
  let s = oh.trim().replace(/\s*\|\|\s*"[^"]*"/g, '');
  if (s.includes('||')) return null;
  // Eigenständige Kommentare, die nur zusätzliche Termine nach Absprache nennen, ebenso
  s = s.split(';').filter((r) => !/^\s*"[^"]*(vereinbarung|absprache|telefon|appointment|anmeldung|registration|reservation|if present)[^"]*"\s*$/i.test(r)).join(';');
  if (/["[\]]|\bweek\b|\bSH\b|easter|unknown/i.test(s)) return null;
  // Komma vor einer neuen Auswahl = zusätzliche Regel („Mo-Sa 08:30-12:30, Mo,Fr 14:00-18:00“), markiert mit „+“
  s = s.replace(/\s*-\s*/g, '-')
    .replace(new RegExp(`(\\d{2}:\\d{2}\\+?|\\b(?:off|closed))\\s*,\\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|${MON})\\b)`, 'g'), '$1;+ ')
    .replace(new RegExp(`\\b(${MON})(\\d{1,2})\\b`, 'g'), '$1 $2');
  if (s === '24/7') s = '00:00-24:00';
  const liste = [];
  for (let regel of s.split(';')) {
    regel = regel.trim();
    if (!regel) continue;
    const zusatz = regel.startsWith('+');
    if (zusatz) regel = regel.slice(1).trim();
    if (/^24\/7$/.test(regel)) regel = '00:00-24:00';
    const d = datumLesen(regel);
    if (!d) return null;
    const m = d.rest.match(new RegExp(`^(${TAG_RE}(?:\\s*,\\s*${TAG_RE})*)?\\s*(.*)$`));
    if (!m) return null;
    const tagTeil = m[1], zeitTeil = m[2].replace(/^24\/7$/, '00:00-24:00').trim();
    let tage = null, ph = false;
    if (tagTeil) {
      tage = [];
      for (const stueck of tagTeil.split(',').map((x) => x.trim())) {
        if (stueck === 'PH') { ph = true; continue; }
        const [a, b] = stueck.split('-');
        const ia = TAGE.indexOf(a), ib = b ? TAGE.indexOf(b) : ia;
        if (ia < 0 || ib < 0) return null;
        for (let i = ia; ; i = (i + 1) % 7) { tage.push(i); if (i === ib) break; }
      }
    }
    let zeiten;
    if (/^(off|closed)$/i.test(zeitTeil)) zeiten = 'off';
    else if (zeitTeil === '') return null; // Auswahl ohne Zeiten („Th, Fr“, „Jun 29-Aug 15“) ist meist ein Eintragsfehler
    else if (zeitTeil === 'open') zeiten = [{ von: { min: 0 }, bis: { min: 1440 } }];
    else {
      zeiten = [];
      for (const z of zeitTeil.split(',').map((x) => x.trim())) {
        const zm = z.match(new RegExp(`^(${PUNKT})(?:-(${PUNKT}))?(\\+)?$`));
        if (!zm || (!zm[2] && !zm[3])) return null;
        const von = punktLesen(zm[1]), bis = zm[2] ? punktLesen(zm[2]) : null;
        if (!von || (zm[2] && !bis)) return null;
        zeiten.push({ von, bis, offenEnde: !bis });
      }
    }
    liste.push({ bereiche: d.bereiche, jahr: d.jahr, tage, ph, zeiten, zusatz });
  }
  return liste.length ? liste : null;
}

// Datum (JJJJ-MM-TT) verschieben und Wochentag (0 = Montag) bestimmen
export function plusTage(ymd, n) {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}
const wochentag = (ymd) => (new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7;

// Sonnenzeiten in Minuten deutscher Ortszeit (NOAA-Näherung, auf wenige Minuten genau).
// Ohne Ort: Mitte Deutschlands; Abweichung je nach Lage bis etwa eine halbe Stunde.
function sommerzeit(ymd) {
  const j = +ymd.slice(0, 4);
  const letzterSonntag = (m) => { const d = new Date(Date.UTC(j, m + 1, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
  return ymd >= letzterSonntag(2) && ymd < letzterSonntag(9);
}
export function sonnenzeiten(ymd, ort = {}) {
  const lat = ort.lat ?? 51.16, lon = ort.lon ?? 10.45;
  const n = Math.round((Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) - Date.UTC(+ymd.slice(0, 4), 0, 1)) / 864e5) + 1;
  const g = (2 * Math.PI / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dek = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const rad = Math.PI / 180, versatz = sommerzeit(ymd) ? 120 : 60;
  const zeit = (zenit, auf) => {
    const x = Math.cos(zenit * rad) / (Math.cos(lat * rad) * Math.cos(dek)) - Math.tan(lat * rad) * Math.tan(dek);
    const ha = Math.acos(Math.max(-1, Math.min(1, x))) / rad;
    return Math.round(720 - 4 * (lon + (auf ? ha : -ha)) - eq + versatz);
  };
  return { sunrise: zeit(90.833, true), sunset: zeit(90.833, false), dawn: zeit(96, true), dusk: zeit(96, false) };
}

function inBereich(ymd, r) {
  if (r.jahr && +ymd.slice(0, 4) !== r.jahr) return false;
  if (!r.bereiche) return true;
  const md = +ymd.slice(5, 7) * 100 + +ymd.slice(8, 10);
  return r.bereiche.some(([a, b]) => (a <= b ? md >= a && md <= b : md >= a || md <= b));
}

// Zeiten eines bestimmten Tages: [[von, bis, offenEnde]] in Minuten, [] = geschlossen, null = unklar
export function tagesplan(oh, ymd, land = '', ort = {}) {
  const liste = regeln(oh);
  if (!liste) return null;
  const tag = wochentag(ymd), ft = feiertag(ymd, land);
  // Spätere Regeln ersetzen frühere für dieselben Tage; Zusatzregeln (nach Komma) ergänzen sie
  let normal = null, feiertags = null;
  const anwenden = (alt, r) => (r.zusatz && Array.isArray(alt) && Array.isArray(r.zeiten) ? [...alt, ...r.zeiten] : r.zeiten);
  for (const r of liste) {
    if (!inBereich(ymd, r)) continue;
    const ohneTage = !r.tage && !r.ph;
    if (ohneTage || r.tage?.includes(tag)) normal = anwenden(normal, r);
    if (r.ph || ohneTage) feiertags = anwenden(feiertags, r);
  }
  let zeiten = normal;
  if (ft) { if (!feiertags) return null; zeiten = feiertags; }
  if (!zeiten || zeiten === 'off') return [];
  let sonne = null;
  const min = (p) => (p.min != null ? p.min : (sonne ??= sonnenzeiten(ymd, ort))[p.ev] + p.off);
  return zeiten.map((z) => {
    const von = min(z.von);
    if (z.offenEnde) return von === 0 ? [0, 1440, false] : [von, null, true];
    let bis = min(z.bis);
    if (bis <= von) bis += 1440;
    return [von, bis, false];
  });
}

const monatTag = (ymd) => `${+ymd.slice(8, 10)}. ${MONATE_DE[+ymd.slice(5, 7) - 1]}`;
function statusNachDatum(oh, datum, land, ort) {
  const { min, ymd } = berlinZeit(datum);
  const tag = wochentag(ymd);
  const ft = feiertag(ymd, land);
  const plan = tagesplan(oh, ymd, land, ort);
  if (!plan) return { offen: null, kurz: ft ? `${ft}: Öffnungszeiten an Feiertagen unklar` : 'Öffnungszeiten heute unklar', heute: ft ? 'Feiertag' : 'unklar' };
  const sonne = regeln(oh).some((r) => r.zeiten !== 'off' && r.zeiten.some((z) => z.von.ev || z.bis?.ev));
  const ca = sonne ? 'ca. ' : '';
  const heute = plan.length ? plan.map(([a, b]) => (b == null ? `ab ${uhr(a)}` : `${uhr(a)}–${uhr(b)}`)).join(', ') : (ft ? `geschlossen (${ft})` : 'geschlossen');
  for (const [a, b] of plan) {
    if (b == null && min >= a) return { offen: null, kurz: `Ab ${uhr(a)} geöffnet, Ende nicht angegeben`, heute };
    if (b != null && min >= a && min < b) return { offen: true, kurz: a === 0 && b >= 1440 ? 'Heute durchgehend geöffnet' : `Geöffnet bis ${ca}${uhr(b % 1440 || 1440)}`, heute };
  }
  const gestern = tagesplan(oh, plusTage(ymd, -1), land, ort) || [];
  for (const [, b] of gestern) if (b != null && b > 1440 && min + 1440 < b) return { offen: true, kurz: `Geöffnet bis ${ca}${uhr(b - 1440)}`, heute };
  const spaeter = plan.filter(([a]) => a > min).sort((x, y) => x[0] - y[0])[0];
  if (spaeter) return { offen: false, kurz: `Öffnet um ${ca}${uhr(spaeter[0])}`, heute };
  for (let i = 1; i <= 400; i++) {
    const d = plusTage(ymd, i);
    const p = tagesplan(oh, d, land, ort);
    if (!p || !p.length) continue; // geschlossen oder Feiertag ohne Angabe
    const t = (tag + i) % 7;
    if (i <= 6) return { offen: false, kurz: `Öffnet ${i === 1 ? 'morgen' : TAGE_DE[t]} ${ca}${uhr(p[0][0])}`, heute };
    return { offen: false, kurz: `Saisonpause, öffnet am ${monatTag(d)}`, heute };
  }
  return { offen: false, kurz: 'Geschlossen', heute };
}

// Status für die Anzeige: { offen, kurz: "Geöffnet bis 18:00" | "Öffnet um 14:00" | "Öffnet Do 15:00" | "Geschlossen", heute: "08:00–18:00" | "geschlossen" }
export function status(oh, datum = new Date(), land = '', ort = {}) {
  const w = parse(oh);
  if (!w) return regeln(oh) ? statusNachDatum(oh, datum, land, ort) : null;
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
