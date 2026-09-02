// FRAGMENT 06 — THE STALE MODEL. Caught today, by replaying a kept scanner.
//
// TASK      write this example; replay the probes the session left behind.
// QUESTION  does the arrival-order effect still hold?
//
// The recorded finding (f_the_quadratic_is_arrival_order) says the store's
// quadratic insert is not a property of the sorted-array index but of the
// ORDER keys arrive in, measured at 64k facts in three arrival orders:
// ascending 132 ms, integer args 505 ms, shuffled 716 ms — a 5.4x spread.
//
// This is that probe, unchanged, still runnable. Run it now and the spread is
// gone. The probe survived; its subject did not: src/store.ts grew `arrived`
// and `absorb`, which append instead of splicing, citing
// performance-invariants.md I1 by name. All three arrival orders now take the
// identical append path, so the spread is absent BY CONSTRUCTION.
//
// A scanner nobody retires goes on answering. It does not go on being about
// anything.
//
// POSTSCRIPT, and it is the same lesson one turn further on. The test that
// guarded this fragment asserted `spread < 3` — a ratio of three wall-clock
// timings, with a threshold calibrated against the engine of the day, when a
// build here cost ~135 ms. An argument index then took the same build to
// 25-38 ms. The absolute noise of a GC pause did not change, so as a fraction
// of the measurement it grew about fourfold, and the ratio began crossing 3
// under parallel load. A ratio-of-timings assertion silently tightens itself
// every time the code it measures improves, which means it is guaranteed to
// fail eventually ON SUCCESS — and it did, on the very improvement it should
// have been indifferent to. The claim above is structural: the orders take the
// same append path, so the STORE cannot depend on the order. That is what the
// test asserts now, and no scheduler hiccup can perturb it. The timings below
// stay because YAK is a catalogue of real runs, but they are evidence and no
// longer a gate; each is now the minimum of three repetitions, because
// interference only ever adds time, so a minimum converges on the cost of the
// code path while a single shot measures the path plus whatever else the box
// was doing.
import { Store } from '../../../src/store.ts';
import { mki, mks, type Term } from '../../../src/unify.ts';
import * as fs from 'node:fs';

export function run(n = 64_000): string[] {
  const out: string[] = [];
  const REPS = 3;
  const best = (f: () => void) => {
    let lo = Infinity;
    for (let r = 0; r < REPS; r++) { const t = Date.now(); f(); lo = Math.min(lo, Date.now() - t); }
    return lo;
  };
  const idx = [...Array(n).keys()];
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }

  const int = (i: number): Term => mki(i);
  const padded = (i: number): Term => mks(String(i).padStart(8, '0'));
  const fill = (arg: (i: number) => Term, order: number[]): Store => {
    const s = new Store();
    for (const i of order) s.add('f', 'main', [arg(i)], { scope: 'tick', base: true });
    return s;
  };
  const up = [...Array(n).keys()];

  const t: number[] = [];
  const row = (label: string, dt: number) => {
    t.push(dt);
    out.push(`  ${label.padEnd(42)} ${String(dt).padStart(6)} ms`);
  };
  out.push(`N = ${n} — same count, three arrival orders (min of ${REPS})`);
  row('integer args (lex order is scrambled)', best(() => { fill(int, up); }));
  row('zero-padded (keys strictly ascending)', best(() => { fill(padded, up); }));
  row('zero-padded, shuffled arrival', best(() => { fill(padded, idx); }));
  const spread = Math.max(...t) / Math.min(...t);
  out.push(`  spread: ${spread.toFixed(1)}x     (recorded when this probe was written: 5.4x)`);

  // The claim the timings used to stand in for, measured directly: an
  // identical append path means the arrival order cannot reach the store.
  // The read compared is `relAll`, not `canonicalState`, because the latter
  // sorts its own key list and would therefore pass an index left scrambled.
  out.push('  order is not observable — the same facts, reordered, build:');
  for (const [label, arg] of [['integer args', int], ['zero-padded', padded]] as [string, (i: number) => Term][]) {
    const a = fill(arg, up);
    const b = fill(arg, idx);
    const ka = a.relAll('f').map((f) => f.key).join('\n');
    const kb = b.relAll('f').map((f) => f.key).join('\n');
    const same = ka === kb && a.canonicalState() === b.canonicalState();
    out.push(`  ${label.padEnd(42)} ${same ? 'the same store' : 'A DIFFERENT STORE'}`
      + ` (${a.relCount('f')} facts)`);
  }
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  console.log(run().join('\n'));
}
