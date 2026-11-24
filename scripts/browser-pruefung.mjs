// Prüft Seiten in einem echten Chrome (headless) über das DevTools-Protokoll – ohne npm-Pakete (Node 22: WebSocket, fetch).
// Meldet JavaScript-Fehler, Konsolenfehler und ob die Seite ihre eigenen Anfragen schickt (Zähler /api/ereignis, Tag Manager).
// Aufruf (in der Action „Browser-Prüfung“): node scripts/browser-pruefung.mjs <url> [<url> …]
import { spawn } from 'node:child_process';
import { setTimeout as warte } from 'node:timers/promises';

// --als-besucher: normale Browser-Kennung statt „HeadlessChrome“, damit der Aufruf in der eigenen Besucherstatistik zählt (Test der Zählung)
const alsBesucher = process.argv.includes('--als-besucher');
const urls = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const chrome = process.env.CHROME || 'google-chrome';
const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9333', '--user-data-dir=/tmp/chrome-pruefung', 'about:blank'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  try { const t = await (await fetch('http://127.0.0.1:9333/json/list')).json(); ws = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {}
  if (!ws) await warte(200);
}
if (!ws) { console.log('FEHL Chrome startet nicht'); process.exit(1); }
const sock = new WebSocket(ws);
await new Promise((r) => sock.addEventListener('open', r, { once: true }));
let id = 0; const offen = new Map(); const ereignisse = [];
sock.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && offen.has(d.id)) { offen.get(d.id)(d); offen.delete(d.id); } else if (d.method) ereignisse.push(d); });
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; offen.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
for (const m of ['Runtime.enable', 'Log.enable', 'Network.enable', 'Page.enable']) await cdp(m);
if (alsBesucher) await cdp('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });

let fehler = 0;
for (const url of urls) {
  ereignisse.length = 0;
  await cdp('Page.navigate', { url });
  await warte(8000);
  const ex = ereignisse.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
  const kons = ereignisse.filter((e) => (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
    .map((e) => e.params.entry?.text + (e.params.entry?.url ? ` (${e.params.entry.url})` : '') || e.params.args?.map((a) => a.value ?? a.description).join(' '));
  const anfragen = ereignisse.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url);
  const zaehler = anfragen.some((u) => u.includes('/api/ereignis'));
  const besuch = anfragen.some((u) => u.includes('/api/besuch'));
  const gtmAnfrage = ereignisse.find((e) => e.method === 'Network.requestWillBeSent' && e.params.request.url.includes('googletagmanager.com/gtm.js'));
  const gtm = Boolean(gtmAnfrage);
  if (gtm) console.log(`     Tag Manager geladen von: ${gtmAnfrage.params.documentURL} · Auslöser ${gtmAnfrage.params.initiator?.type} ${gtmAnfrage.params.initiator?.url || gtmAnfrage.params.initiator?.stack?.callFrames?.[0]?.url || ''} · im HTML: ${(await cdp('Runtime.evaluate', { expression: "document.documentElement.outerHTML.includes('gtm.js')", returnByValue: true })).result?.result?.value}`);
  const module = anfragen.filter((u) => /hofladenliste\.de\/[a-z-]+\.js/.test(u)).map((u) => u.replace(/^.*\.de\//, '').replace(/\?.*/, ''));
  const banner = (await cdp('Runtime.evaluate', { expression: "!!document.querySelector('.einwilligung')", returnByValue: true })).result?.result?.value;
  const mitStatistik = (await cdp('Runtime.evaluate', { expression: "!!(document.documentElement.dataset.gtm || document.documentElement.dataset.ga)", returnByValue: true })).result?.result?.value;
  // Erwartet: keine JS-Fehler; Einwilligungs-Hinweis für neue Besucher, wenn Statistik eingerichtet ist; Zähler-Anfrage auf Hofseiten
  const ok = !ex.length && besuch && (!mitStatistik || banner) && (!/\/hof\//.test(url) || zaehler);
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FEHL'} ${url}\n     Module: ${module.join(', ') || '–'} · Tag Manager: ${gtm ? 'ja' : 'nein'} · Besuch gemeldet: ${besuch ? 'ja' : 'nein'} · Hof-Zähler: ${zaehler ? 'ja' : 'nein'} · Einwilligungs-Hinweis: ${banner ? 'ja' : 'nein'}`);
  for (const x of ex) console.log(`     JS-Fehler: ${x.split('\n').slice(0, 3).join(' | ')}`);
  for (const x of kons.slice(0, 5)) console.log(`     Konsole: ${String(x).slice(0, 200)}`);
}
sock.close(); proc.kill();
process.exit(fehler ? 1 : 0);
