// FRAGMENT 05 — diverging semiring. Provoked deliberately; the run is real.
//
// TASK      fold Counting over a citation graph that advances with a clock.
// QUESTION  the kernel's own persistence idiom is a carry rule,
//           `fact(X) @next :- fact(X).` — "persistence is not a storage
//           property", examples/counter.rofl. Does that idiom poison a
//           non-idempotent semiring?
//
// The recorded finding (f_counting_breaks_under_ticks) says it did, and the
// shape of the damage was the point: every carried fact becomes its OWN
// support one tick back, a self-loop in the support hypergraph, so the CLOSED
// counting instance multiplied by star(one) and answered "infinitely many" —
// including for solo(z), a fact that cites nothing and has exactly one origin.
// At tick 1, six of the seven domain facts were INFINITE.
//
// The engine was not wrong. It answered "how many derivations" about a support
// graph that contained time travel. It was the question that stopped meaning
// what it meant at tick 0.
//
// This is that probe, unchanged, still runnable. Run it now and the divergence
// is gone: 0 INFINITE at every tick. The probe survived; its subject did not.
// The question was the thing that got fixed, not the arithmetic — `not p` was
// decided to mean "not derivable in the CURRENT tick's store", and by the same
// argument the fold is about one tick, so a fact that arrived over the boundary
// is a GIVEN in the tick that reads it and the edge back is not walked. See
// docs/time-and-continuity.md and src/semiring.ts.
//
// POSTSCRIPT, and it is why the CONTROL BLOCK below was added to a fragment
// that used to print six lines. "0 INFINITE" is not evidence of the fix: a fold
// that walked no support at all would print exactly the same thing, and so
// would a fold that had simply stopped detecting cycles. Two readings, one
// output — the same trap as fragment 04's silent grep. What separates them is a
// store holding BOTH kinds of loop at once, so the control runs the same
// program with one citation cycle added (p cites q, q cites p, as OOPS's two
// preprints do) and prints the carried fact beside the cycle. The fix says 1
// and INFINITE. A blind fold says 1 and 1. A fold that walks nothing says 0.
// Note also `self-supported` in the table above: it stays 3, so the self-loop
// is still in the store and the fold is declining to walk it, which is a
// different fact from the loop being gone.
import { Rofl } from '../../../src/api.ts';
import { evaluateSemiring } from '../../../src/semiring.ts';
import { countingSemiring, INFINITE } from '../../../runtime/semirings.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

// The clock is what makes the ticks advance; without it the store is
// quiescent and the defect never appears. That is itself worth knowing — the
// first two attempts at this probe measured a store that never moved.
const PROG = `
clock(2020) @init.
clock(N1) @next :- clock(N), N < 2024, N1 is N + 1.
cite(a, b) @init.
cite(b, c) @init.
solo(z) @init.
cite(X, Y) @next :- cite(X, Y).
solo(X)  @next :- solo(X).
hop(X, Y) :- cite(X, Y).
hop(X, Y) :- cite(X, Z), hop(Z, Y).
`;
const DOMAIN = /^(cite|hop|solo|clock)\[/;

// THE CONTROL. The same program with one citation cycle in it: p cites q and q
// cites p, so hop(p,p) has unboundedly many derivations INSIDE a single tick,
// while cite(p,q) is carried and its loop closes only across a boundary. One
// store, both kinds of loop, and the two must not get the same answer.
const CYCLED = PROG + `
cite(p, q) @init.
cite(q, p) @init.
`;

export function run(): string[] {
  const out: string[] = [];
  const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
  for (const ticks of [0, 1, 3]) {
    const r = new Rofl();
    r.load(BOOT);
    r.load(PROG);
    for (let i = 0; i < ticks; i++) r.tickAdvance();
    r.evaluate();
    const res = evaluateSemiring(r.store, countingSemiring, { maxRounds: 60 });
    const dom = [...res.value.entries()].filter(([k]) => DOMAIN.test(k));
    const inf = dom.filter(([, v]) => v === INFINITE).length;
    let self = 0;
    for (const [k] of dom) {
      for (const w of r.store.witnessesOf(k)) {
        if (w.prems.some((p) => p.t === 'fact' && p.key === k)) { self++; break; }
      }
    }
    const show = (k: string) => {
      const v = res.value.get(k);
      return v === INFINITE ? 'INFINITE' : String(v);
    };
    out.push(`tick=${r.store.tick}  domain facts=${dom.length}  INFINITE=${inf}  self-supported=${self}`);
    out.push(`   solo(z), which cites nothing = ${show('solo[main](z)')}` +
      `      hop(a,c), one route = ${show('hop[main](a,c)')}`);
  }
  // the control: one store, both kinds of loop, after the clock has moved
  const c = new Rofl();
  c.load(BOOT);
  c.load(CYCLED);
  for (let i = 0; i < 3; i++) c.tickAdvance();
  c.evaluate();
  const cv = evaluateSemiring(c.store, countingSemiring, { maxRounds: 60 }).value;
  const cshow = (k: string) => (cv.get(k) === INFINITE ? 'INFINITE' : String(cv.get(k)));
  out.push(`control, same store plus a citation cycle p<->q, at tick ${c.store.tick}:`);
  out.push(`   cite(a,b), carried over the boundary = ${cshow('cite[main](a,b)')}` +
    `   hop(p,p), a cycle inside the tick = ${cshow('hop[main](p,p)')}`);
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  console.log(run().join('\n'));
}
