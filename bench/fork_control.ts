// fork_control.ts — POSITIVE CONTROL for the fork-pool scaling measurement.
//
// A speedup below the core count means one of two things and they call for
// opposite work: either the WORKLOAD does not parallelise, or the BOX does not.
// This measures the second, so the first can be attributed. It runs a pure
// arithmetic loop — no allocation, no I/O, no messages beyond one in and one
// out — on the same pool, at the same worker counts, interleaved with the same
// sequential arm, at the same moment.
//
// If this control also saturates at 3x on eight workers, then 3x is what this
// machine gives today and nothing about the fork search is at fault.
//
//   node --experimental-strip-types bench/fork_control.ts

import * as path from 'node:path';
import { availableParallelism, loadavg } from 'node:os';
import { runForks } from '../runtime/fork_pool.ts';
import { spin } from './fork_task_spin.ts';
import { run as allocRun } from './fork_task_alloc.ts';
import * as W from '../examples/wtf/demo.ts';

const SPIN = path.resolve(import.meta.dirname, 'fork_task_spin.ts');
const ALLOC = path.resolve(import.meta.dirname, 'fork_task_alloc.ts');
/** Which control: arithmetic (default) or allocation. */
const ALLOCATE = process.argv.includes('--alloc');
const TASK = ALLOCATE ? ALLOC : SPIN;
const ms = (): number => Number(process.hrtime.bigint()) / 1e6;
const arg = (n: string, d: number): number => {
  const i = process.argv.indexOf(n);
  return i < 0 ? d : Number(process.argv[i + 1]);
};
const REPS = arg('--reps', 3);
const N = arg('--branches', 41);
const ITERS = arg('--iters', 30_000_000);

const ROUNDS = arg('--rounds', 3);
const snap = ALLOCATE ? W.leanWorld().save() : '';
const branches = ALLOCATE
  ? Array.from({ length: N }, (_, i) => ({ i, iters: 0, rounds: ROUNDS }))
  : Array.from({ length: N }, (_, i) => ({ i, iters: ITERS, rounds: 0 }));
const seq = (): number[] => ALLOCATE
  ? branches.map((b) => allocRun(snap, b))
  : branches.map((b) => spin(b.iters));

console.log(ALLOCATE
  ? '# scaling control: ALLOCATION — JSON.parse of the same 2.5 MB base, nothing else'
  : '# scaling control: a pure arithmetic loop on the same pool');
console.log(ALLOCATE
  ? `  ${N} branches x ${ROUNDS} parses of ${(snap.length / 1024).toFixed(0)} KB, ${availableParallelism()} cores`
  : `  ${N} branches x ${(ITERS / 1e6).toFixed(0)}M iterations, ${availableParallelism()} cores`);
console.log(`  load average ${loadavg().map((x) => x.toFixed(1)).join(' ')}`);
seq(); await runForks({ taskModule: TASK, base: snap, workers: 8 }, branches);

const PS = [1, 2, 4, 6, 8];
const pairs = new Map<number, { sq: number; pr: number; run: number }[]>();
for (const p of PS) pairs.set(p, []);
for (let rep = 0; rep < REPS; rep++) {
  for (const p of PS) {
    let t = ms(); seq(); const sq = ms() - t;
    t = ms();
    const { report } = await runForks({ taskModule: TASK, base: snap, workers: p }, branches);
    pairs.get(p)!.push({ sq, pr: ms() - t, run: report.runMs });
  }
}
const med = (xs: number[]): number => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
console.log('\n  THE PAIRED STATISTIC — one A immediately before every B');
console.log('   P  seq(ms)  par(ms)  speedup  run-only  per-pair ratios');
for (const p of PS) {
  const r = pairs.get(p)!;
  const sq = med(r.map((x) => x.sq)), pr = med(r.map((x) => x.pr)), run = med(r.map((x) => x.run));
  console.log(`  ${String(p).padStart(2)}  ${sq.toFixed(0).padStart(7)}  ${pr.toFixed(0).padStart(7)}`
    + `  ${(sq / pr).toFixed(2).padStart(6)}x  ${(sq / run).toFixed(2).padStart(7)}x`
    + `   ${r.map((x) => (x.sq / x.pr).toFixed(2)).join(' ')}`);
}
