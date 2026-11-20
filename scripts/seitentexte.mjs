// Gepflegte Texte je Seite aus data/seitentexte.json – für Kategorie-, Kreis-, Orts- und Typseiten.
// Format (alle Felder optional, Text ohne HTML; Leerzeile = neuer Absatz):
// {
//   "/milchtankstelle/": {
//     "einleitung": "…",
//     "abschnitte": [{ "ueberschrift": "…", "text": "…" }],
//     "faq": [{ "frage": "…", "antwort": "…" }],
//     "links": [{ "text": "…", "pfad": "/…/" }]
//   }
// }
// Die FAQ erscheint sichtbar auf der Seite und zusätzlich im FAQPage-JSON-LD (nur echte, sichtbare Angaben).
import { esc } from '../static/helfer.js';

const absaetze = (t) => String(t || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');

export function seitentext(eintrag, pfad = '') {
  if (!eintrag || typeof eintrag !== 'object') return null;
  const faq = (eintrag.faq || []).filter((f) => f?.frage && f?.antwort);
  const links = (eintrag.links || []).filter((l) => l?.text && /^\/[a-z0-9\-/]*$/.test(l.pfad || ''));
  const teile = [
    eintrag.einleitung && absaetze(eintrag.einleitung),
    ...(eintrag.abschnitte || []).filter((a) => a?.text).map((a) => `${a.ueberschrift ? `<h3>${esc(a.ueberschrift)}</h3>` : ''}${absaetze(a.text)}`),
    faq.length && `<h3>Häufige Fragen</h3><dl class="faq">${faq.map((f) => `<dt>${esc(f.frage)}</dt><dd>${absaetze(f.antwort)}</dd>`).join('')}</dl>`,
    links.length && `<ul class="kreis-liste">${links.map((l) => `<li><a href="${esc(l.pfad)}">${esc(l.text)}</a></li>`).join('')}</ul>`,
  ].filter(Boolean);
  if (!teile.length) return null;
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
