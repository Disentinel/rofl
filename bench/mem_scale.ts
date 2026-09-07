// mem_scale.ts — THE MARGINAL BYTE, which is the one an extrapolation needs.
//
// A world's average bytes-per-fact charges every fact a share of the program:
// the rules, the parse, the reflection the kernel emits per RULE. On a demo of
// four thousand facts that share is most of the number, and an extrapolation
// built on it is wrong in the direction that flatters. What a millions-of-facts
// workload is priced by is the SLOPE — what the next fact costs once the
// program is already standing — so this measures two sizes of the same program
// and reports the difference.
//
// TWO DATA SHAPES, because interning's whole subject is repetition:
//   distinct  every fact carries a symbol nothing else carries
//   repeated  the symbols come from a small vocabulary, as a real corpus's
//             identifiers, paths and kinds do
// The gap between them is what a compact representation is worth on data
// rather than on a program's own reflection.
//
//   node --expose-gc --experimental-strip-types bench/mem_scale.ts <shape> <n>
//   node --experimental-strip-types bench/mem_scale.ts --slope

import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const RULES = `
tagged(X) :- item(X, G).
`;

/** N base facts, one derived fact each, one derived_by row each. The shape of
 *  a scan: a large flat EDB with one cheap rule over it. */
function program(n: number, vocab: number): string {
  const out: string[] = [RULES];
  for (let i = 0; i < n; i++) out.push(`item(id_${i}, g_${i % vocab}).`);
  return out.join('\n');
}

const g = (globalThis as { gc?: () => void }).gc;
function heap(): number {
  if (!g) throw new Error('needs --expose-gc');
  g(); g(); g();
  return process.memoryUsage().heapUsed;
}

const held: Rofl[] = [];

function one(shape: string, n: number): void {
  const vocab = shape === 'distinct' ? n : 100;
  const src = program(n, vocab);
  const before = heap();
  const r = new Rofl();
  held.push(r);
  r.load(src);
  r.evaluate();
  const after = heap();
  const st = r.store;
  let kernel = 0;
  for (const rec of st.allFacts()) if (rec.persp.startsWith('$')) kernel++;
  console.log('ROW ' + JSON.stringify({
    shape, n, facts: st.factCount(), kernelFacts: kernel,
    bytes: after - before,
    bytesPerFact: +((after - before) / st.factCount()).toFixed(1),
  }));
}

function main(): void {
  if (process.argv[2] === '--slope') {
    const self = path.join(import.meta.dirname, 'mem_scale.ts');
    const rows: Record<string, number | string>[] = [];
    for (const shape of ['distinct', 'repeated']) {
      for (const n of [20_000, 40_000]) {
        const out = execFileSync(process.execPath,
          ['--expose-gc', '--experimental-strip-types', self, shape, String(n)],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
        for (const l of out.split('\n')) if (l.startsWith('ROW ')) rows.push(JSON.parse(l.slice(4)));
      }
    }
    const cols = ['shape', 'n', 'facts', 'kernelFacts', 'bytes', 'bytesPerFact'];
    const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
    console.log(cols.map((c, i) => c.padStart(w[i])).join('  '));
    for (const r of rows) console.log(cols.map((c, i) => String(r[c]).padStart(w[i])).join('  '));
    for (const shape of ['distinct', 'repeated']) {
      const a = rows.find((r) => r.shape === shape && r.n === 20_000)!;
      const b = rows.find((r) => r.shape === shape && r.n === 40_000)!;
      const slope = ((b.bytes as number) - (a.bytes as number)) / ((b.facts as number) - (a.facts as number));
      const perGB = (16 * 1024 ** 3) / slope;
      console.log(`SLOPE ${shape} marginal=${slope.toFixed(1)} B/fact  ` +
        `facts-in-16GB=${(perGB / 1e6).toFixed(1)}M`);
    }
    return;
  }
  one(process.argv[2] ?? 'distinct', Number(process.argv[3] ?? 20_000));
  if (held.reduce((n, r) => n + r.store.factCount(), 0) < 0) console.log('unreachable');
}

main();
