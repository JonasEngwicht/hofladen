// Service Worker: Hofladenliste als installierbare App (PWA).
// Seiten und API: erst Netz, bei Funkloch die gespeicherte Fassung (Merkliste und zuletzt besuchte Höfe offline).
// Feste Dateien (versioniert, Schriften, Kacheln): aus dem Speicher, im Hintergrund aktualisiert.
const VERSION = 'v1';
const SEITEN = `seiten-${VERSION}`, DATEIEN = `dateien-${VERSION}`, KACHELN = `kacheln-${VERSION}`;
const VORAB = ['/', '/merkliste/', '/karte/', '/offline/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SEITEN).then((c) => c.addAll(VORAB)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![SEITEN, DATEIEN, KACHELN].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function begrenzen(name, max) {
  const c = await caches.open(name), ks = await c.keys();
  for (const k of ks.slice(0, Math.max(0, ks.length - max))) await c.delete(k);
}
async function netzZuerst(req, cache, max) {
  try {
    const r = await fetch(req);
    if (r.ok) { const c = await caches.open(cache); c.put(req, r.clone()); begrenzen(cache, max); }
    return r;
  } catch {
    const treffer = await caches.match(req);
    if (treffer) return treffer;
    if (req.mode === 'navigate') return (await caches.match('/offline/')) || Response.error();
    throw new Error('offline');
  }
}
async function speicherZuerst(req, cache, max) {
  const treffer = await caches.match(req);
  const neu = fetch(req).then(async (r) => { if (r.ok) { const c = await caches.open(cache); await c.put(req, r.clone()); begrenzen(cache, max); } return r; }).catch(() => null);
  return treffer || (await neu) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Verwaltung, Betreiber-Bereich, Zähler und Suche nie zwischenspeichern
  if (/^\/(api\/(verwaltung|betrieb|ereignis|meldung|rueckmeldung|nachricht)|verwaltung|betrieb|suche)/.test(url.pathname)) return;
  if (url.pathname.startsWith('/kacheln/')) return e.respondWith(speicherZuerst(req, KACHELN, 1500));
  // Versionierte Dateien ändern sich nie; unversionierte Module (karte.js, oh.js …) lieber frisch aus dem Netz
  if (url.search.includes('v=') || /^\/(fonts|vendor|img)\//.test(url.pathname) || /\.(svg|png|woff2?)$/.test(url.pathname)) return e.respondWith(speicherZuerst(req, DATEIEN, 120));
  if (req.mode === 'navigate' || url.pathname.startsWith('/api/') || /\.(json|js|css)$/.test(url.pathname)) return e.respondWith(netzZuerst(req, SEITEN, 250));
});
