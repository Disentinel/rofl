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
const names = fs.readFileSync(path.join(DIR, 'INDEX.tsv'), 'utf8').trim().split('\n')
  .slice(1).map((l) => l.split('\t')[0]);

function build(n: string): Rofl {
  const r = Rofl.fromSnapshot(fs.readFileSync(path.join(DIR, `${n}.seed.json`), 'utf8'));
  r.evaluate();
  return r;
}
// warm the module graph and the memoised kernel answers outside every reading
build('boot_only');

const held: Rofl[] = [];
console.log(['case', 'facts', 'bytes', 'bytesPerFact', 'loadEvalMs'].join('\t'));
for (const n of names) {
  const before = heap();
  const t0 = performance.now();
  const r = build(n);
  const ms = performance.now() - t0;
  const after = heap();
  held.push(r);
  const f = r.store.factCount();
  console.log([n, f, after - before, ((after - before) / f).toFixed(1), ms.toFixed(1)].join('\t'));
}
if (held.length === 0) throw new Error('unreachable');
