// fork_stages.ts — where one branch's time goes, so "what would make a fork
// cheaper" is answered with a number rather than with a preference.
//
// The parallel arm's speedup is bounded by the pool's fixed cost over the
// search's total work, and BOTH terms move if the branch gets cheaper — in
// opposite directions. A cheaper branch is a smaller search, and a smaller
// search pays the pool setup a larger share. So before ranking copy-on-write
// against threads, measure which stage of a branch a cheaper fork would touch.
//
// One `runSweeps` branch, split. Interleaved with a whole-branch arm so the
// parts can be checked against the sum instead of trusted.
//
//   node --experimental-strip-types bench/fork_stages.ts

import { loadavg } from 'node:os';
import { Rofl } from '../src/api.ts';
import * as W from '../examples/wtf/demo.ts';
import * as T from './fork_task_wtf.ts';

const ms = (): number => Number(process.hrtime.bigint()) / 1e6;
const med = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const REPS = 7;

const base = W.leanWorld().save();
const b = T.branches(base)[10];
const ctx = T.setup(base);

const whole: number[] = [], restore: number[] = [], retracts: number[] = [];
const loadFix: number[] = [], oracle: number[] = [], cloneOnly: number[] = [];

for (let i = 0; i < 3; i++) T.run(ctx, b);           // warm

for (let i = 0; i < REPS; i++) {
  let t = ms(); T.run(ctx, b); whole.push(ms() - t);

  t = ms(); const w = Rofl.fromSnapshot(base); restore.push(ms() - t);
  t = ms(); for (const e of b.es) w.retract(`eff_ts(${e}, ${ctx.origTs.get(e)})`); retracts.push(ms() - t);
  t = ms(); w.load(b.perm.map((e, j) => `eff_ts(${e}, ${b.stamps[j]}).`).join('\n')); loadFix.push(ms() - t);
  t = ms(); w.store.canonicalState(); W.digest(w); oracle.push(ms() - t);

  // `load` takes a rollback clone unconditionally (src/api.ts:229), so the
  // structural clone is inside the fixpoint stage as well as at the fork.
  t = ms(); w.store.clone(); cloneOnly.push(ms() - t);
}

const tot = med(whole);
const row = (name: string, xs: number[], note = '') =>
  console.log(`  ${name.padEnd(34)}${med(xs).toFixed(1).padStart(7)} ms  ${(100 * med(xs) / tot).toFixed(0).padStart(3)}%   ${note}`);

console.log('# where one branch of the wtf order sweep goes');
console.log(`  load average ${loadavg().map((x) => x.toFixed(1)).join(' ')}  <- absolutes inflated by this`);
console.log(`  base ${W.leanWorld().store.facts.size} facts, snapshot ${(base.length / 1024).toFixed(0)} KB\n`);
row('WHOLE BRANCH (T.run)', whole);
row('  Rofl.fromSnapshot(base)', restore, 'what a worker pays that a same-process fork need not');
row('  retract x' + String(b.es.length), retracts);
row('  load + fixpoint', loadFix, 'the work itself');
row('  canonicalState + digest', oracle, 'the GATE, not the workload');
console.log();
row('one store.clone() of that world', cloneOnly, 'what a copy-on-write fork would replace');
const sum = med(restore) + med(retracts) + med(loadFix) + med(oracle);
console.log(`\n  parts sum to ${sum.toFixed(1)} ms against a whole of ${tot.toFixed(1)} ms `
  + `(${(100 * sum / tot).toFixed(0)}%) — the remainder is the split's own overhead`);
