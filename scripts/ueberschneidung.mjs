// Misst, wie stark sich die Seiten „Hofläden in <Ort> und Umgebung“ überschneiden (gleiche Hof-Links) und wie groß sie sind.
// Liest das fertige public/. Aufruf: node scripts/ueberschneidung.mjs [--json]
// Ziel (SEO-Plan B1): möglichst wenige Seitenpaare im selben Kreis, die fast dieselben Höfe zeigen.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function messen(wurzel = 'public') {
  const LAENDER = ['baden-wuerttemberg', 'bayern', 'berlin', 'brandenburg', 'bremen', 'hamburg', 'hessen', 'mecklenburg-vorpommern', 'niedersachsen',
    'nordrhein-westfalen', 'rheinland-pfalz', 'saarland', 'sachsen', 'sachsen-anhalt', 'schleswig-holstein', 'thueringen'];
  const seiten = [];
  const lies = (pfad, kreis) => {
    const datei = join(wurzel, pfad, 'index.html');
    if (!existsSync(datei)) return;
    const html = readFileSync(datei, 'utf8');
    if (!/<h1>Hofläden in [^<]* und Umgebung<\/h1>/.test(html) || /<meta name="robots" content="noindex/.test(html)) return;
    const liste = html.slice(html.indexOf('data-liste'), html.indexOf('class="karten-spalte"'));
    seiten.push({ pfad: `/${pfad}/`, kreis, bytes: Buffer.byteLength(html), hoefe: new Set([...liste.matchAll(/href="(\/hof\/[^"]+)"/g)].map((m) => m[1])) });
  };
  for (const land of LAENDER) {
    if (!existsSync(join(wurzel, land))) continue;
    for (const kreis of readdirSync(join(wurzel, land))) {
      if (!statSync(join(wurzel, land, kreis)).isDirectory()) continue;
      lies(`${land}/${kreis}`, `${land}/${kreis}`);
      for (const ort of readdirSync(join(wurzel, land, kreis))) if (statSync(join(wurzel, land, kreis, ort)).isDirectory()) lies(`${land}/${kreis}/${ort}`, `${land}/${kreis}`);
    }
  }
  const jaccard = (a, b) => { let g = 0; for (const x of a) if (b.has(x)) g++; return g / (a.size + b.size - g || 1); };
  const paare = [];
  const proKreis = Map.groupBy(seiten, (s) => s.kreis);
  for (const gruppe of proKreis.values()) for (let i = 0; i < gruppe.length; i++) for (let j = i + 1; j < gruppe.length; j++) {
    const j2 = jaccard(gruppe[i].hoefe, gruppe[j].hoefe);
    if (j2 >= 0.7) paare.push([j2, gruppe[i].pfad, gruppe[j].pfad]);
  }
  paare.sort((a, b) => b[0] - a[0]);
  const betroffen = (ab) => new Set(paare.filter(([j]) => j >= ab).flatMap(([, a, b]) => [a, b])).size;
  const sortiert = (f) => seiten.map(f).sort((a, b) => a - b);
  const median = (l) => l[Math.floor(l.length / 2)] || 0;
  const bytes = sortiert((s) => s.bytes), n = sortiert((s) => s.hoefe.size);
  return { seiten: seiten.length, paare70: paare.length, paare80: paare.filter(([j]) => j >= 0.8).length, paare95: paare.filter(([j]) => j >= 0.95).length,
    seitenMit70: betroffen(0.7), seitenMit80: betroffen(0.8), bytesMedian: median(bytes), bytesMax: bytes.at(-1) || 0, hoefeMedian: median(n), hoefeMax: n.at(-1) || 0, beispiele: paare.slice(0, 8) };
}

if (process.argv[1]?.endsWith('ueberschneidung.mjs')) {
  const m = messen();
  if (process.argv.includes('--json')) console.log(JSON.stringify(m));
  else {
    console.log(`Indexierbare Orts- und Stadtseiten mit Umgebung: ${m.seiten}`);
    console.log(`Paare im selben Kreis mit ≥ 70 % gleichen Höfen: ${m.paare70} (${m.seitenMit70} Seiten), ≥ 80 %: ${m.paare80} (${m.seitenMit80} Seiten), ≥ 95 %: ${m.paare95}`);
    console.log(`Höfe je Seite: Median ${m.hoefeMedian}, höchstens ${m.hoefeMax} · HTML: Median ${Math.round(m.bytesMedian / 1024)} KB, höchstens ${Math.round(m.bytesMax / 1024)} KB`);
    for (const [j, a, b] of m.beispiele) console.log(`  ${Math.round(j * 100)} %  ${a}  ${b}`);
  }
}
