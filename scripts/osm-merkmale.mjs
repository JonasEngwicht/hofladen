// Einordnung von OSM-Objekten: Automatenart, Bio-Verband, Ausflugs-Merkmale (ohne Raten, nur aus Tags)

export function automatArt(sorten) {
  const s = new Set(sorten);
  if (s.size === 1 && s.has('milk')) return 'Milchtankstelle';
  if (s.size === 1 && s.has('eggs')) return 'Eierautomat';
  if ([...s].every((x) => ['meat', 'sausages'].includes(x))) return 'Fleischautomat';
  if (s.size === 1 && s.has('potatoes')) return 'Kartoffelautomat';
  if (s.size === 1 && s.has('honey')) return 'Honigautomat';
  if (s.size && [...s].every((x) => ['noodles', 'pasta'].includes(x))) return 'Nudelautomat';
  return 'Regiomat';
}

// Bio-Verband nur, wenn er im Eintrag steht (Name, Betreiber, Beschreibung, Label-Tags) – nie geraten
const VERBAENDE = [['Bioland', /bioland/i], ['Demeter', /demeter/i], ['Naturland', /naturland/i], ['Biopark', /biopark/i],
  ['Gäa', /\bg(ä|ae)a\b/i], ['Biokreis', /biokreis/i], ['Ecoland', /ecoland/i], ['Ecovin', /ecovin/i]];
export function verbandAus(t) {
  const text = [t.name, t.operator, t.brand, t.description, t.label, t['organic:label'], t['organic:certification'], t.certification]
    .filter(Boolean).join(' ');
  const v = VERBAENDE.filter(([, re]) => re.test(text)).map(([n]) => n);
  return v.length ? v : null;
}
// Ausflugs-Merkmale aus OSM-Tags
export function merkmaleAus(t) {
  const m = {};
  if (['yes', 'limited', 'no'].includes(t.wheelchair)) m.rollstuhl = t.wheelchair;
  if (['yes', 'leashed', 'no'].includes(t.dog)) m.hunde = t.dog === 'no' ? 'no' : 'yes';
  if (t.outdoor_seating === 'yes' || t.cafe === 'yes' || t.amenity === 'cafe') m.sitzen = true;
  if (t.toilets === 'yes') m.toilette = true;
  if (t.playground === 'yes') m.spielplatz = true;
  if (t.self_harvesting === 'yes' || t.pick_your_own === 'yes') m.selbstpfluecken = true;
  if (t.amenity === 'cafe' || t.cafe === 'yes') m.hofcafe = true;
  if (['yes', 'surface', 'customers', 'free'].includes(t.parking)) m.parkplatz = true;
  if (['yes', 'only'].includes(t['delivery']) || t['shop:online'] === 'yes') m.lieferung = true;
  return Object.keys(m).length ? m : null;
}

