// Gepflegte Texte je Seite aus data/seitentexte.json – für Kategorie-, Kreis-, Orts- und Typseiten.
// Format (alle Felder optional, Text ohne HTML; Leerzeile = neuer Absatz):
// {
//   "/milchtankstelle/": {
//     "oben": "…",          ← 1–3 Sätze direkt unter der Überschrift (über der Liste; kurz halten, Handy)
//     "einleitung": "…",
//     "abschnitte": [{ "ueberschrift": "…", "text": "…" }],
//     "faq": [{ "frage": "…", "antwort": "…" }],
//     "links": [{ "text": "…", "pfad": "/…/" }],
//     "saison": [{ "titel": "Spreewälder Gurken", "zeit": "Ernte im Hochsommer" }],   ← lokale Seiten: Block „Saison“
//     "quellen": [{ "titel": "…", "url": "https://…" }],                              ← Belege für recherchierte Fakten
//     "stand": "2026-11-20"                                                           ← letzte Prüfung (nicht angezeigt)
//   }
// }
// Welche lokalen Seiten noch keinen Text haben: docs/seitentexte-offen.md (SEITENTEXTE_OFFEN=1 node scripts/build.mjs).
// Die FAQ erscheint sichtbar auf der Seite und zusätzlich im FAQPage-JSON-LD (nur echte, sichtbare Angaben).
import { esc } from '../static/helfer.js';

const absaetze = (t) => String(t || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');

// Kurztext unter der Überschrift (oder leer)
export const seitentextOben = (eintrag) => eintrag?.oben ? `<div class="ortstext">${absaetze(eintrag.oben)}</div>` : '';

export function seitentext(eintrag, pfad = '') {
  if (!eintrag || typeof eintrag !== 'object') return null;
  const quellen = (eintrag.quellen || []).filter((q) => q?.titel && /^https?:\/\/\S+$/.test(q.url || ''));
  const faq = (eintrag.faq || []).filter((f) => f?.frage && f?.antwort);
  const links = (eintrag.links || []).filter((l) => l?.text && /^\/[a-z0-9\-/]*$/.test(l.pfad || ''));
  const teile = [
    eintrag.einleitung && absaetze(eintrag.einleitung),
    ...(eintrag.abschnitte || []).filter((a) => a?.text).map((a) => `${a.ueberschrift ? `<h3>${esc(a.ueberschrift)}</h3>` : ''}${absaetze(a.text)}`),
    faq.length && `<h3>Häufige Fragen</h3><dl class="faq">${faq.map((f) => `<dt>${esc(f.frage)}</dt><dd>${absaetze(f.antwort)}</dd>`).join('')}</dl>`,
    links.length && `<ul class="kreis-liste">${links.map((l) => `<li><a href="${esc(l.pfad)}">${esc(l.text)}</a></li>`).join('')}</ul>`,
    quellen.length && `<p class="leise">Quellen: ${quellen.map((q) => `<a href="${esc(q.url)}" rel="nofollow noopener" target="_blank">${esc(q.titel)}</a>`).join(' · ')}</p>`,
  ].filter(Boolean);
  // Quellen allein sind kein Seitentext
  if (teile.length === (quellen.length ? 1 : 0)) return null;
  const titel = eintrag.titel || 'Gut zu wissen';
  return { html: `<section class="abschnitt seo-text seitentext" data-seitentext="${esc(pfad)}"><h2>${esc(titel)}</h2>${teile.join('')}</section>`, faq };
}

// Fragen in ein bestehendes FAQPage-JSON-LD übernehmen oder ein neues anlegen
export function faqZusammenfuehren(jsonld, faq) {
  if (!faq?.length) return jsonld;
  const fragen = faq.map((f) => ({ '@type': 'Question', name: f.frage, acceptedAnswer: { '@type': 'Answer', text: f.antwort } }));
  const vorhanden = jsonld.find((j) => j['@type'] === 'FAQPage');
  if (vorhanden) return jsonld.map((j) => (j === vorhanden ? { ...j, mainEntity: [...(j.mainEntity || []), ...fragen] } : j));
  return [...jsonld, { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: fragen }];
}

// Prüfung der gepflegten Texte (Test und Build-Warnung): keine Platzhalter, keine externen Links im Text,
// nur bekannte Felder – damit keine austauschbaren Ortstexte oder kaputten Angaben live gehen.
const FELDER = new Set(['titel', 'oben', 'einleitung', 'abschnitte', 'faq', 'links', 'saison', 'quellen', 'stand']);
const PLATZHALTER = /\bTODO\b|\bTBD\b|lorem ipsum|\bxxx\b|\{\{?\s*\w+\s*\}?\}|\[(ort|stadt|kreis)\]|<(ort|stadt|kreis)>/i;
export function pruefeSeitentexte(alle) {
  const f = [];
  if (!alle || typeof alle !== 'object' || Array.isArray(alle)) return ['data/seitentexte.json muss ein Objekt { "/pfad/": { … } } sein'];
  for (const [pfad, e] of Object.entries(alle)) {
    if (!/^\/([a-z0-9-]+\/)*$/.test(pfad)) f.push(`${pfad}: Pfad wie "/bayern/oberallgaeu/" (mit Schrägstrich am Ende)`);
    if (!e || typeof e !== 'object') { f.push(`${pfad}: kein Objekt`); continue; }
    for (const k of Object.keys(e)) if (!FELDER.has(k)) f.push(`${pfad}: unbekanntes Feld "${k}"`);
    const texte = [e.titel, e.oben, e.einleitung, ...(e.abschnitte || []).flatMap((a) => [a?.ueberschrift, a?.text]), ...(e.faq || []).flatMap((q) => [q?.frage, q?.antwort]),
      ...(e.saison || []).flatMap((x) => [x?.titel, x?.zeit])].filter((x) => typeof x === 'string');
    if (texte.some((x) => PLATZHALTER.test(x))) f.push(`${pfad}: enthält einen Platzhalter (TODO, [ort], {{…}} …)`);
    if (texte.some((x) => /https?:\/\/|<[a-z]/i.test(x))) f.push(`${pfad}: Text ohne HTML und ohne Web-Adressen (Belege gehören in "quellen")`);
    if (e.oben && String(e.oben).length > 450) f.push(`${pfad}: "oben" ist zu lang (höchstens 450 Zeichen, damit die Höfe auf dem Handy sichtbar bleiben)`);
    for (const q of e.faq || []) if (!q?.frage || !q?.antwort || !String(q.frage).trim().endsWith('?')) f.push(`${pfad}: FAQ braucht "frage" (mit ?) und "antwort"`);
    for (const x of e.saison || []) if (!x?.titel || !x?.zeit) f.push(`${pfad}: saison braucht "titel" und "zeit"`);
    for (const q of e.quellen || []) if (!q?.titel || !/^https?:\/\/\S+$/.test(q.url || '')) f.push(`${pfad}: quelle braucht "titel" und "url"`);
    for (const l of e.links || []) if (!/^\/[a-z0-9\-/]*$/.test(l?.pfad || '')) f.push(`${pfad}: link "${l?.pfad}" ist kein interner Pfad`);
  }
  return f;
}
