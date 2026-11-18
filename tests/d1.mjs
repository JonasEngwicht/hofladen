// Minimaler Nachbau der Cloudflare-D1-Schnittstelle auf node:sqlite (nur für Tests)
import { DatabaseSync } from 'node:sqlite';
export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const wert = (v) => (v instanceof Uint8Array ? v : v);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a.map(wert)),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (l) => Promise.all(l.map((s) => s.run())), _db: db };
}
