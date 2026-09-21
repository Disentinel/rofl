// demo.ts — WARM = COLD, BYTE FOR BYTE (S3h, 2026-09-21). The lower layers of a
// SPAT call — boot, the programme, the world, the users, the family's book —
// restored from a snapshot beside the volume (SPAT_WARM=1, examples/spat/
// warm.ts) instead of parsed and derived, then this call's facts and books on
// top and a full re-derivation: the canonical state of the store must be the
// cold path's to the byte, for a read, a week swap, an edit's trial, another
// member's books, a minted week (30). The planted defects: a snapshot with a
// bit flipped is rejected by its content hash and rewritten; a programme that
// changed names a different snapshot; a corrupt volume is not read at all.
//
//   node --experimental-strip-types examples/spat_warm/demo.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { FROM, Group, ROOT, fresh, spat } from '../spat/demolib.ts';
import { run as verb } from '../spat/edits.ts';
import { env, openStore, type Store } from '../spat/store.ts';
import { warmDir } from '../spat/warm.ts';

const NOW = '2026-08-31T21:30:00+03:00';
/** The process is the environment for one call; each path has a volume of its own, since an edit writes. */
const set = (root: string, warm: boolean, extra: Record<string, string> = {}): void => {
  for (const k of ['SPAT_AS', 'SPAT_TENANT', 'SPAT_WARM_LOG']) delete process.env[k];
  Object.assign(process.env, { SPAT_ROOT: root, SPAT_FROM_ID: FROM.robin, SPAT_TZ: 'Europe/Nicosia', SPAT_NOW: NOW, SPAT_WARM: warm ? '1' : '0', ...extra });
};
const quiet = <T,>(f: () => T): { out: string; v: T } => { const lines: string[] = []; const log = console.log; console.log = (...xs: unknown[]) => { lines.push(xs.map(String).join(' ')); }; try { return { out: lines.join('\n'), v: f() }; } finally { console.log = log; } };
/** One call on one path: the canonical state after the verb, and the milliseconds. */
function call(root: string, warm: boolean, extra: Record<string, string>, f?: (s: Store) => void): { canon: string; ms: number; out: string } {
  set(root, warm, extra);
  const t = Date.now();
  const q = quiet(() => { const s = openStore(env()); f?.(s); s.r.evaluate(); const canon = s.r.store.canonicalState(); s.vol.db.close(); return canon; });
  return { canon: q.v, ms: Date.now() - t, out: q.out };
}
const stderrOf = (f: () => void): string => { const lines: string[] = []; const err = console.error; console.error = (...xs: unknown[]) => { lines.push(xs.map(String).join(' ')); }; try { f(); } finally { console.error = err; } return lines.join('\n'); };

async function gate(): Promise<Group> {
  const g = new Group('30. warm = cold — the lower layers restored from a snapshot, this call\'s facts and books on top, the whole base re-derived: canonical state byte for byte; a flipped bit is rejected, a changed programme is another snapshot');
  const cold = fresh(); const warm = fresh();
  const cases: [string, Record<string, string>, ((s: Store) => void) | undefined][] = [
    ['whoami, пн 31.08', {}, undefined],
    ['show, вс 06.09 — неделя даты w0907, swap', { SPAT_NOW: '2026-09-06T21:30:00+03:00' }, undefined],
    ['edit add … — trial и запись', {}, (s) => { verb(s, 'edit', ['add errand thu 17:30-18:30 robin shop']); }],
    ['alex — другие книги открыты', { SPAT_FROM_ID: FROM.alex }, undefined],
    ['пн 14.09 — неделя заведена по дате', { SPAT_NOW: '2026-09-14T09:00:00+03:00' }, undefined],
    ['need add — правило семьи (снимок меняется на следующем вызове)', {}, (s) => { verb(s, 'need', ['add', 'x "X" 60 robin every']); }],
    ['после need add — hh изменилась: новый снимок, тот же мир', {}, undefined],
  ];
  const dir = warmDir({ root: warm, tenant: 'example' } as Parameters<typeof warmDir>[0]);
  const snapshots = (): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []);
  // PLANTED (A): no snapshot yet — the first warm call is cold and saves; the log says so
  set(warm, true, { SPAT_WARM_LOG: '1' });
  const first = stderrOf(() => { const s = openStore(env()); s.r.evaluate(); s.vol.db.close(); });
  g.check('первый тёплый вызов: «warm: no snapshot … — cold» и «warm: saved <hash>.json (… MB)»; в <tenant>.warm/ один снимок и его .sha', /^warm: no snapshot [0-9a-f]{12} — cold\nwarm: saved [0-9a-f]{40}\.json \(\d+\.\d MB\)$/.test(first) && snapshots().length === 1 && fs.existsSync(path.join(dir, `${snapshots()[0]}.sha`)), first);
  for (const [name, extra, f] of cases) {
    const c = call(cold, false, extra, f); const w = call(warm, true, extra, f);
    const A = c.canon.split('\n'), B = w.canon.split('\n');
    g.check(`${name}: canonicalState равен (${A.length} строк); вывод глагола равен`, c.canon === w.canon && c.out === w.out, c.canon === w.canon ? `out: ${c.out.split('\n')[0]} | ${w.out.split('\n')[0]}` : `only cold: ${A.filter((l) => !B.includes(l)).slice(0, 3).join(' ; ')} | only warm: ${B.filter((l) => !A.includes(l)).slice(0, 3).join(' ; ')}`);
  }
  g.check('после need add — два снимка (hh вошла в заголовок), оба с .sha', snapshots().length === 2 && snapshots().every((f) => fs.existsSync(path.join(dir, `${f}.sha`))), snapshots().join(' '));
  // PLANTED (B): a bit flipped in the live snapshot — rejected by the content hash, the call is cold, the file rewritten
  const live = path.join(dir, snapshots()[1]);
  const bytes = fs.readFileSync(live); bytes[Math.floor(bytes.length / 2)] ^= 0x01; fs.writeFileSync(live, bytes);
  // in a fresh process (this one holds the lower layers in memory since C and would not read the file)
  const flipped = await spat(warm, 'robin', ['whoami'], { SPAT_WARM: '1', SPAT_WARM_LOG: '1' });
  const restored = await spat(warm, 'robin', ['whoami'], { SPAT_WARM: '1', SPAT_WARM_LOG: '1' });
  g.check('бит перевёрнут: «warm: rejected <hash>.json: content hash moved — cold», снимок переписан, следующий процесс «restored»; состояние = холодному', flipped.code === 0 && /warm: rejected [0-9a-f]{40}\.json: content hash moved — cold\nwarm: saved/.test(flipped.out) && /warm: restored [0-9a-f]{40}\.json/.test(restored.out) && call(warm, true, {}).canon === call(cold, false, {}).canon, flipped.out.split('\n').slice(0, 2).join(' | '));
  // PLANTED (C): the programme changed — a different header, a third snapshot; the old ones stay (a rollback finds its own)
  const spatFile = path.join(path.dirname(new URL(import.meta.url).pathname), '../spat/spat.rofl');
  const text = fs.readFileSync(spatFile, 'utf8');
  fs.writeFileSync(spatFile, `${text}\nwarm_probe(1).\n`);
  try {
    // a process reads the programme once at start (spat.ts), so the changed text is seen by a CHILD — as every CLI call is
    const changed = await spat(warm, 'robin', ['whoami'], { SPAT_WARM: '1', SPAT_WARM_LOG: '1' });
    g.check('программа изменена (строка в spat.rofl, дочерний процесс): «no snapshot … — cold», «saved» — третий снимок; прежние на месте', changed.code === 0 && /warm: no snapshot [0-9a-f]{12} — cold\nwarm: saved/.test(changed.out) && snapshots().length === 3, changed.out);
  } finally { fs.writeFileSync(spatFile, text); }
  g.check('программа возвращена: новый процесс — «restored» второго снимка (hh с x), без пересборки', /warm: restored [0-9a-f]{40}\.json/.test((await spat(warm, 'robin', ['whoami'], { SPAT_WARM: '1', SPAT_WARM_LOG: '1' })).out));
  // timings, as a line the golden masks (a duration)
  const tc = call(cold, false, {}), tw = call(warm, true, {});
  console.error(`whoami cold ${tc.ms} ms, warm ${tw.ms} ms`);
  return g;
}

const t0 = Date.now();
const g = await gate();
for (const l of g.lines) console.log(l);
console.log(`\n${g.n - g.fails}/${g.n} scenarios`);
console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(g.fails === 0 ? 0 : 1);
