// Kern für den Inhalts-Hash je Seite (data/seiten-stand.json → lastmod in der Sitemap). Ohne Abhängigkeiten, damit testbar.
// lastmod soll nur springen, wenn sich die Seite selbst ändert – nicht, wenn sich auf einer Hofseite nur die Nachbarliste
// oder auf einer Ortsseite nur Öffnungszeiten in den Karten ändern (Crawlbudget, IndexNow-Kontingent).
// HASH_VERSION erhöhen, wenn sich die Berechnung ändert: der nächste Build ersetzt dann nur die Hashes und behält das Datum.
export const HASH_VERSION = 2;

// Hofseiten: nur Angaben des Eintrags selbst. Nachbarlisten, Ortslinks, Saison- und Datumsblöcke bleiben draußen.
export const KERN_FELDER = ['titelSeite', 'titel', 'name', 'art', 'typ', 'adresse', 'strasse', 'plz', 'ortAnzeige', 'lat', 'lon', 'lageUngefaehr',
  'telefon', 'email', 'website', 'facebook', 'instagram', 'betreiber', 'oeffnungszeiten', 'oeffnungszeiten_text', 'kat', 'bio', 'verband',
  'zahlung', 'selbstbedienung', 'beschreibung', 'fotos', 'urlaub', 'saisonHinweis', 'gepflegt', 'geprueft', 'haltestelle', 'quelle', 'osm',
  'quelleUrl', 'ergaenzt', 'letztePruefung', 'duenn'];
export function hofKern(e, extra = {}) {
  const kern = {};
  for (const f of KERN_FELDER) if (e[f] != null && e[f] !== '' && !(Array.isArray(e[f]) && !e[f].length)) kern[f] = e[f];
  kern.kreis = e.k?.code;
  if (e.geschlossenGemeldet >= 2) kern.geschlossenGemeldet = true;
  if (e.termine?.length) kern.termine = e.termine.map((v) => [v.id, v.titel, v.beginn, v.ende, v.beschreibung]);
  return { ...kern, ...extra };
}

// Lokale Listenseiten (unter /<bundesland>/): Titel, Brotkrumen, die verlinkten Höfe, gepflegter Seitentext und Regionsprofil.
// Seiten ohne Hof-Links (oder außerhalb der Länder) → null, dann zählt der ganze Inhalt.
export function listenKern({ pfad, titel, noindex, krumen, inhalt, seitentext = null, landPfad }) {
  if (!landPfad.test(pfad) || pfad.startsWith('/hof/')) return null;
  const hoefe = [...new Set([...inhalt.matchAll(/href="(\/hof\/[^"#?]+)"/g)].map((m) => m[1]))].sort();
  if (!hoefe.length) return null;
  const region = (inhalt.match(/<section class="region"[\s\S]*?<\/section>/g) || []).join('');
  return ['liste', titel, noindex, JSON.stringify(krumen), hoefe.join(' '), JSON.stringify(seitentext), region];
}
