// fork_clone_cost.ts — what a fork of a REALISTIC world costs, re-measured,
// because the recorded figure was taken through a door that has since closed.
//
// `docs/performance-invariants.md` records `store.clone()` at 21.7-22.5 us per
// fact on "a realistic store — rules, derived facts, provenance, witnesses",
// against 5.6-7.2 on a bare store of integer facts, and that pair is the whole
// basis of the copy-on-write item (§5.3). It was measured when `clone()` went
// `snapshot() -> JSON -> restore()`. It no longer does: commit 3cff6f4 replaced
// it with a structural copy that walks the fact map directly, and a figure
// measured through the serialising path is not a figure about this one.
//
// So: three stores of rising realism, a bare-facts control in the same run, and
// the JSON round trip beside the structural clone so the two are separable.
// Interleaved, because a mean over a loaded box is a mean of the box.
//
//   node --experimental-strip-types bench/fork_clone_cost.ts

import { loadavg } from 'node:os';
import { Rofl } from '../src/api.ts';

const ms = (): number => Number(process.hrtime.bigint()) / 1e6;
const med = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const REPS = 7;

/** A store of nothing but flat ground facts. The control: whatever this costs
 *  is the floor, and the difference between it and the others is what rules,
 *  derivation and provenance actually add. */
function bare(n: number): Rofl {
  const r = new Rofl();
  const lines: string[] = [];
  for (let i = 0; i < n; i++) lines.push(`ctl(a${i}, b${i % 97}).`);
  if (!r.load(lines.join('\n')).ok) throw new Error('bare');
  return r;
}

/** Rules, a derived layer, a self-join, negation — so witnesses and firing
 *  provenance are real rather than nominal. */
function realistic(n: number): Rofl {
  const r = new Rofl();
  const lines = [
    'link(X, Y) :- item(X, G), item(Y, G), X < Y.',
    'peer(X, Y) :- link(X, Y).',
    'peer(X, Y) :- link(Y, X).',
    'odd(X) :- item(X, _G), M is X mod 2, M = 1.',
    'even(X) :- item(X, _G), not odd(X).',
  ];
  for (let i = 0; i < n; i++) lines.push(`item(${i}, g${i % 40}).`);
  if (!r.load(lines.join('\n')).ok) throw new Error('realistic');
  return r;
}

console.log('# what a fork costs, re-measured after the structural clone');
console.log(`  load average ${loadavg().map((x) => x.toFixed(1)).join(' ')}  <- absolutes inflated by this\n`);
console.log('  store                       facts     clone      us/fact   save+restore   us/fact   ratio');

for (const [name, build] of [
  ['bare ground facts, 5k', () => bare(5_000)],
  ['bare ground facts, 40k', () => bare(40_000)],
  ['realistic, 300 items', () => realistic(300)],
  ['realistic, 700 items', () => realistic(700)],
] as [string, () => Rofl][]) {
  const r = build();
  const n = r.store.facts.size;
  const snap = r.save();
  for (let i = 0; i < 2; i++) { r.store.clone(); Rofl.fromSnapshot(r.save()); }
  const A: number[] = [], B: number[] = [];
  for (let i = 0; i < REPS; i++) {
    let t = ms(); r.store.clone(); A.push(ms() - t);
    t = ms(); Rofl.fromSnapshot(r.save()); B.push(ms() - t);
  }
  const a = med(A), b = med(B);
  console.log(`  ${name.padEnd(26)}${String(n).padStart(6)}  ${a.toFixed(1).padStart(7)} ms `
    + `${(a * 1000 / n).toFixed(2).padStart(9)}  ${b.toFixed(1).padStart(11)} ms ${(b * 1000 / n).toFixed(2).padStart(9)}`
    + `  ${(b / a).toFixed(1).padStart(5)}x   (snapshot ${(snap.length / 1024).toFixed(0)} KB)`);
}

console.log(`\n  The right-hand column is what a WORKER must pay, because a worker cannot`);
console.log(`  be handed an object graph. The left is what a same-process fork pays. The`);
console.log(`  ratio between them is the boundary's real price, and it is per WORKER`);
console.log(`  rather than per branch: every branch of a fork search starts from the same`);
console.log(`  world, so the snapshot crosses once and is restored once.`);
