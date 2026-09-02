// semiring.ts — annotated evaluation over the support hypergraph.
//
// The Boolean fixpoint is untouched. In provenance-semiring semantics the SET
// of derived facts is exactly the Boolean least fixpoint; the annotation
// changes a fact's VALUE, never whether it holds. So the engine runs first,
// unchanged, and this file folds a semiring over the support the store already
// recorded (Store.witnessesOf).
//
// The kernel knows "a semiring", not any particular one. Instances live
// outside src/; nothing here is named after one.
//
// CONVERGENCE IS PART OF THE CONTRACT. "It did not converge" conflates three
// different situations, so every instance declares which one it is in, up
// front, and the fold picks its strategy from that declaration:
//
//   BOUNDED             the value chain stabilises in finitely many steps,
//                       because the operator is monotone over a domain of
//                       finite height (or values simply never grow). Strategy:
//                       Kleene iteration. Cycles are no obstacle.
//   CLOSED              the instance supplies star(x) = one ⊕ x ⊕ x² ⊕ … and
//                       "unboundedly many" is a LEGAL VALUE OF ITS CARRIER.
//                       Strategy: Kleene iteration plus cycle closure — every
//                       fact on a cycle of the live support graph is
//                       multiplied by star(one), the value of going round that
//                       cycle any number of times. So a count over a cycle
//                       answers "infinite", which is correct, rather than
//                       growing forever.
//   BOUNDED_UNFOLDING   derivations are counted only to a declared depth. This
//                       CHANGES THE SEMANTICS and the instance must say so in
//                       its own documentation. Strategy: exactly `depth`
//                       rounds of Kleene iteration; v_n counts derivations of
//                       height at most n.
//
// `disciplineHeld` in the result reports whether the declared discipline
// actually held on this data. A BOUNDED instance that fails to stabilise is a
// FALSE DECLARATION, and the fold says so rather than hanging.
//
// v1 simplifications, all deliberate, all visible in the result:
//   * Cycle closure uses star(one) as the loop factor. That is exact when one
//     trip round a cycle contributes at least `one` — true for counting, where
//     every unrolling is a distinct derivation tree. Solving the system
//     exactly would need Gauss-Jordan elimination with star, which needs the
//     system to be LINEAR; a rule with two recursive premises is quadratic, so
//     no closed form exists in general. Out of v1 scope, stated, not hidden.
//   * A negated premise contributes `one`. It held vacuously, by finite
//     failure, and finite failure carries no annotation of its own.
//   * A builtin premise contributes `one`, for the same reason.
//   * A support with a premise key absent from the store is dropped as dead.
//     The fold sees only the support recorded for the CURRENT store state, so
//     a frozen fact whose tick-scoped premises are gone reads as underivable.
//   * A fact that is present, not base, and has no live firing (kernel-emitted
//     provenance metadata) gets `zero`: no hypergraph edge reaches it.
//
// THE FOLD IS ABOUT ONE TICK, and it has to be told so, because the support
// graph is not. A fact is named by its content and not by the tick it holds
// in, so the kernel's own persistence idiom — a carry rule `p(X) @next :-
// p(X).` — records, for the fact at tick T, a witness whose premise is THAT
// SAME KEY at tick T-1. In the graph that is a literal self-loop, and the
// CLOSED discipline read it as one: every carried fact came back INFINITE
// along with everything downstream of it, so a five-fact fixture with a clock
// answered "infinitely many" for four facts at tick 1, including one asserted
// by hand, citing nothing, with exactly one origin.
//
// The reading that fixes it is the one already decided for negation
// (docs/time-and-continuity.md): `not p` asks about the CURRENT tick's store,
// and by the same principle "in how many ways is this true" is a question
// about the current tick. A fact that arrived over the boundary is a GIVEN
// here — base, count one — exactly like an asserted one, and the derivation
// that produced it belongs to the tick that has ended. So a support edge
// recorded by a rule concluding '@next' is NOT WALKED, neither for value nor
// for the cycle analysis.
//
// What identifies such an edge is the RULE, not the clock. A witness carries
// the tick it was recorded in, and that stamp does not discriminate: the
// boundary records a staged fact's witness with the tick just ENTERED, so a
// fact carried into tick 1 carries a witness stamped 1 (and keeps that stamp
// at tick 2, the re-staged firing being a duplicate signature the store
// refuses). `conclusion_tense(R, next)` does discriminate, is a fact in the
// store, and is what boot.rofl already reads to keep the SAME edges out of
// the dependency graph. Two readers of one decision.
//
// `why` reached the same place first: asked about a carried fact it prints
// the self-loop and stops, marked `[cycle]`. This brings the fold into
// agreement with the renderer.
//
// The caller is responsible for having evaluated the store first; `load` and
// `query` do that.

import type { FactStore, Witness } from './store.ts';
import { V } from './reflect.ts';

/** Convergence disciplines. Numeric so the kernel stays free of
 *  identifier-shaped string literals; names for reports live outside src/. */
export const BOUNDED = 0;
export const CLOSED = 1;
export const BOUNDED_UNFOLDING = 2;
export type Discipline = typeof BOUNDED | typeof CLOSED | typeof BOUNDED_UNFOLDING;

interface Ops<T> {
  zero: T;                    // additive identity — not derivable
  one: T;                     // multiplicative identity — free, an axiom
  plus(a: T, b: T): T;        // combine alternative derivations
  times(a: T, b: T): T;       // combine the premises of one derivation
  eq(a: T, b: T): boolean;    // convergence test
}

/** A semiring plus its convergence discipline. The union is what forces
 *  `star` on a CLOSED instance and `depth` on a BOUNDED_UNFOLDING one: a
 *  declaration the instance cannot honour will not type-check. */
export type Semiring<T> =
  | (Ops<T> & { discipline: typeof BOUNDED; star?(a: T): T })
  | (Ops<T> & { discipline: typeof CLOSED; star(a: T): T })
  | (Ops<T> & { discipline: typeof BOUNDED_UNFOLDING; depth: number; star?(a: T): T });

export interface FoldOptions<T> {
  /** Round cap. The fold reports rather than looping. A BOUNDED_UNFOLDING
   *  instance runs to its own `depth`, or to this, whichever is smaller. */
  maxRounds?: number;
  /** Annotation of a base fact. Default `one` — an axiom costs nothing. */
  base?: (key: string) => T;
  /** Annotation of one firing, multiplied into its premises. Default `one`. */
  weight?: (key: string, w: Witness) => T;
}

export interface FoldResult<T> {
  value: Map<string, T>;    // every fact key in the store, in sorted order
  rounds: number;
  converged: boolean;       // the value chain stabilised under `eq`
  disciplineHeld: boolean;  // the declared discipline actually held here
  cyclic: number;           // facts on a cycle of the live support graph
}

const DEFAULT_MAX_ROUNDS = 1000;

/** Fold a semiring over the recorded support:
 *    v_0(f)     = base(f) if f is base, else zero
 *    v_{n+1}(f) = loop ⊗ ( v_0(f) ⊕ ⊕_supports ( weight ⊗ ⊗_premises v_n(p) ) )
 *  where `loop` is star(one) for a fact on a cycle under the CLOSED
 *  discipline, and `one` everywhere else. */
export function evaluateSemiring<T>(
  store: FactStore, sr: Semiring<T>, opts: FoldOptions<T> = {},
): FoldResult<T> {
  const keys = store.allFactKeys();
  const seed = new Map<string, T>();
  const support = new Map<string, Witness[]>();
  const edges = new Map<string, string[]>();
  const staged = nextTenseRules(store);
  for (const k of keys) {
    seed.set(k, store.get(k)!.base ? (opts.base ? opts.base(k) : sr.one) : sr.zero);
    // a support with a premise the store no longer holds multiplies in `zero`
    // and can carry nothing; dropping it keeps the cycle analysis exact — and
    // a support recorded at the tick boundary reaches into the tick that has
    // ended, which this fold is not about, so it goes the same way
    const live = store.witnessesOf(k).filter(
      (w) => !staged.has(w.ruleId)
        && w.prems.every((p) => p.t !== 'fact' || store.has(p.key)));
    support.set(k, live);
    const out: string[] = [];
    for (const w of live) for (const p of w.prems) if (p.t === 'fact') out.push(p.key);
    edges.set(k, out);
  }

  // computed for every discipline: a convergence claim tested on acyclic data
  // is a claim tested on nothing, so the caller gets to see the cycle count
  const onCycle = cyclicKeys(keys, edges);
  const closeCycles = sr.discipline === CLOSED;
  const loop = closeCycles ? sr.star(sr.one) : sr.one;
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const cap = sr.discipline === BOUNDED_UNFOLDING ? Math.min(maxRounds, sr.depth) : maxRounds;

  let cur = seed;
  let rounds = 0;
  let converged = false;
  while (rounds < cap) {
    rounds++;
    const next = new Map<string, T>();
    let changed = false;
    for (const k of keys) {
      let acc: T = seed.get(k)!;
      for (const w of support.get(k)!) {
        let prod = opts.weight ? opts.weight(k, w) : sr.one;
        for (const p of w.prems) {
          if (sr.eq(prod, sr.zero)) break;   // annihilation: this branch is dead
          prod = sr.times(prod, p.t === 'fact' ? (cur.get(p.key) ?? sr.zero) : sr.one);
        }
        acc = sr.plus(acc, prod);
      }
      // going round the cycle again is another derivation, any number of times
      if (closeCycles && onCycle.has(k)) acc = sr.times(loop, acc);
      next.set(k, acc);
      if (!changed && !sr.eq(acc, cur.get(k)!)) changed = true;
    }
    cur = next;
    if (!changed) { converged = true; break; }
  }
  const disciplineHeld = sr.discipline === BOUNDED_UNFOLDING
    ? (converged || rounds >= sr.depth)
    : converged;
  return { value: cur, rounds, converged, disciplineHeld, cyclic: onCycle.size };
}

/** The rules whose conclusion is written '@next'. A witness naming one was
 *  recorded at a tick boundary: the fact it supports is installed as base in
 *  the tick that reads it, and the premises it names were derivable in the
 *  tick before. Empty for a store holding no rules, which is the honest
 *  answer — a store with no rules has no boundary-recorded support either. */
function nextTenseRules(store: FactStore): Set<string> {
  const out = new Set<string>();
  for (const f of store.relAll(V.conclusion_tense)) {
    const rid = f.args[0], tense = f.args[1];
    if (rid !== undefined && rid.k === 'a' && tense !== undefined
        && tense.k === 'a' && tense.name === 'next') out.add(rid.name);
  }
  return out;
}

/** Facts lying on a cycle of the support graph: the members of every
 *  non-trivial strongly connected component, plus self-supporting facts.
 *  Iterative Tarjan — the graph is as deep as the derivation is. */
function cyclicKeys(keys: string[], edges: Map<string, string[]>): Set<string> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cyclic = new Set<string>();
  let nextIndex = 0;
  const open = (v: string) => {
    index.set(v, nextIndex); low.set(v, nextIndex); nextIndex++;
    stack.push(v); onStack.add(v);
  };
  for (const root of keys) {
    if (index.has(root)) continue;
    open(root);
    const work: { v: string; i: number }[] = [{ v: root, i: 0 }];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const out = edges.get(frame.v) ?? [];
      if (frame.i < out.length) {
        const w = out[frame.i++];
        if (!index.has(w)) { open(w); work.push({ v: w, i: 0 }); }
        else if (onStack.has(w)) low.set(frame.v, Math.min(low.get(frame.v)!, index.get(w)!));
        continue;
      }
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1].v;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.v)!));
      }
      if (low.get(frame.v) !== index.get(frame.v)) continue;
      const comp: string[] = [];
      for (;;) {
        const w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
        if (w === frame.v) break;
      }
      const selfSupporting = comp.length === 1 && (edges.get(comp[0]) ?? []).includes(comp[0]);
      if (comp.length > 1 || selfSupporting) for (const w of comp) cyclic.add(w);
    }
  }
  return cyclic;
}
