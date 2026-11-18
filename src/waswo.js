// „Was + Wo“-Suche: trennt Produktwörter („Spargel“, „Eier“) vom Ort („Cottbus“, „03042“).
// Die Wortliste erzeugt der Build (src/generated/suchwoerter.json): [Muster, Kategorie, Zielseite | null]
const FUELL = new Set(['in', 'im', 'bei', 'aus', 'um', 'der', 'die', 'das', 'den', 'nähe', 'naehe', 'nahe', 'hofladen', 'hofläden', 'hoflaeden',
  'vom', 'hof', 'kaufen', 'frisch', 'frische', 'frischer', 'frisches', 'mit', 'und', 'ab', 'direkt', 'regional', 'regionale', 'regionaler', 'meiner', 'umgebung']);

export function wasWoTrennen(q, woerter) {
  const muster = woerter.map(([re, kat, ziel]) => [new RegExp(`^(?:${re})[a-zäöüß]*$`, 'i'), kat, ziel, new RegExp(`^(?:${re})$`, 'i')]);
  const tokens = String(q || '').toLowerCase().split(/[\s,+/;]+/).filter(Boolean);
  const kats = [], rest = [];
  let ziel = null, exakt = true;
  for (const t of tokens) {
    const m = muster.find(([re]) => re.test(t));
    if (m) { if (!kats.includes(m[1])) kats.push(m[1]); ziel ||= m[2]; if (!m[3].test(t)) exakt = false; continue; }
    if (!FUELL.has(t)) rest.push(t);
  }
  if (!kats.length) return null;
  // exakt: nur Produktwörter ohne Anhängsel („Honig“, nicht „Honigsee“) – dann hat das Produkt Vorrang vor gleichnamigen Orten
  return { kats, ziel, rest: rest.join(' '), exakt };
}
