// mem_js.ts — THE JS SIDE OF THE SAME MEASUREMENT. For each corpus case:
// restore the seed, evaluate, and read the live heap the world costs, by the
// method bench/mem_census.ts already uses (--expose-gc, heapUsed after three
// collections). The seed string is allocated INSIDE the window and dropped, so
// both sides charge the evaluated world and not the text it came from.
//   node --expose-gc --experimental-strip-types rust/tools/mem_js.ts
import { Rofl } from '../../src/api.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../../facts/port-corpus');
const g = (globalThis as { gc?: () => void }).gc;
function heap(): number {
  if (!g) throw new Error('needs --expose-gc');
  g(); g(); g();
  return process.memoryUsage().heapUsed;
}
// THE SIXTH COLUMN IS PART OF THE CASE. A ticked twin shares its seed with the
// plain case and differs only in how many `tickAdvance` calls stand between the
// seed and the reading, so a measurement that ignored `ticks` would report the
// plain world twice under two names -- and the ticked family's density would be
// a copy of the plain one wearing a `.t3` suffix. Both sides read it: this one
// here, `rust/bytes_table.sh` from the column this emits.
const cases = fs.readFileSync(path.join(DIR, 'INDEX.tsv'), 'utf8').trim().split('\n')
  .slice(1).map((l) => { const c = l.split('\t'); return { name: c[0], ticks: Number(c[5] ?? 0) }; });

function build(n: string, ticks: number): Rofl {
  const r = Rofl.fromSnapshot(fs.readFileSync(path.join(DIR, `${n}.seed.json`), 'utf8'));
  if (ticks === 0) r.evaluate();
  else for (let i = 0; i < ticks; i++) r.tickAdvance();
  return r;
}
// warm the module graph and the memoised kernel answers outside every reading
build('boot_only', 0);

const held: Rofl[] = [];
console.log(['case', 'facts', 'bytes', 'bytesPerFact', 'loadEvalMs', 'ticks'].join('\t'));
for (const { name: n, ticks } of cases) {
  const before = heap();
  const t0 = performance.now();
  const r = build(n, ticks);
  const ms = performance.now() - t0;
  const after = heap();
  held.push(r);
  const f = r.store.factCount();
  console.log([n, f, after - before, ((after - before) / f).toFixed(1), ms.toFixed(1), ticks].join('\t'));
}
if (held.length === 0) throw new Error('unreachable');
