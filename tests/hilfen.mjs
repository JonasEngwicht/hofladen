// Gemeinsame Hilfen für die Tests: Worker mit nachgebautem Asset-Server laden, HTML-Seiten einlesen.
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PUB = join(ROOT, 'public');
export const DOMAIN = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8')).domain;

const TYPEN = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png', '.woff': 'font/woff' };

// Wie Cloudflare mit html_handling "none": nur exakt passende Dateien
export const ASSETS = {
  async fetch(req) {
    const u = new URL(typeof req === 'string' || req instanceof URL ? req : req.url);
    const p = join(PUB, decodeURIComponent(u.pathname));
    const methode = req.method || 'GET';
    if (!p.startsWith(PUB) || !existsSync(p) || statSync(p).isDirectory()) return new Response('Not Found', { status: 404 });
    return new Response(methode === 'HEAD' ? null : readFileSync(p), { headers: { 'Content-Type': TYPEN[extname(p)] || 'application/octet-stream' } });
  },
};

let worker;
export async function ladeWorker() {
  if (worker) return worker;
  const dir = mkdtempSync(join(tmpdir(), 'hofladen-worker-'));
  const code = readFileSync(join(ROOT, 'src', 'worker.js'), 'utf8').replace(/from '\.\/generated\/(.*?)\.json';/g,
    (_, n) => `from ${JSON.stringify(pathToFileURL(join(ROOT, 'src', 'generated', `${n}.json`)).href)} with { type: 'json' };`)
    .replace(/from '\.\/([a-z-]+\.js)';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(join(ROOT, 'src', n)).href)};`)
    .replace(/from '\.\.\/static\/([a-z-]+\.js)';/g, (_, n) => `from ${JSON.stringify(pathToFileURL(join(ROOT, 'static', n)).href)};`);
  writeFileSync(join(dir, 'worker.mjs'), code);
  workerModul = await import(pathToFileURL(join(dir, 'worker.mjs')).href);
  worker = workerModul.default;
  return worker;
}
let workerModul;
export async function ladeWorkerModul() { await ladeWorker(); return workerModul; }
export async function anfrage(pfad, init = {}) {
  const w = await ladeWorker();
  // Echte Cloudflare-Reihenfolge: exakt passende Datei zuerst, sonst Worker
  const url = new URL(pfad, 'https://hofladenliste.de');
  // wie run_worker_first in wrangler.jsonc
  const vorab = ['/suche', '/plz/', '/api/'].some((x) => url.pathname === x || url.pathname.startsWith(x) && x.endsWith('/')) || url.pathname.endsWith('/index.html');
  if (!vorab && url.hostname === 'hofladenliste.de') {
    const datei = join(PUB, decodeURIComponent(url.pathname));
    if (datei.startsWith(PUB) && existsSync(datei) && statSync(datei).isFile()) return ASSETS.fetch(new Request(url, init));
  }
  return w.fetch(new Request(url, { redirect: 'manual', ...init }), { ASSETS }, { waitUntil() {} });
}

// Alle HTML-Seiten: [pfad, html]
export function* seiten() {
  function* lauf(d) {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) yield* lauf(p);
      else if (f.name === 'index.html') yield ['/' + relative(PUB, d).split(sep).join('/') + (d === PUB ? '' : '/'), readFileSync(p, 'utf8')];
    }
  }
  yield* lauf(PUB);
}
export const sitemapUrls = () => {
  const index = readFileSync(join(PUB, 'sitemap.xml'), 'utf8');
  const dateien = [...index.matchAll(/<loc>[^<]*\/sitemaps\/([^<]+)<\/loc>/g)].map((m) => m[1]);
  return dateien.flatMap((d) => [...readFileSync(join(PUB, 'sitemaps', d), 'utf8').matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/g)].map((m) => ({ datei: d, loc: m[1], lastmod: m[2] })));
};
