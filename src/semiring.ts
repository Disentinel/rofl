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
//   * An aggregate premise (a sealed cell) is a hyperedge over its members,
//     each member a firing's worth of premises (facts or nested cells): a
//     Group cell (count, sum, median, quantile, rank) is the ⊗ of all its
//     members, a Quorum cell (at_least) the ⊗ of its N members, and any other
//     cell (min, max, or, and, lattice, cover, antichain) the ⊕ over its
//     members, the alternative derivations of the value. An empty or hole
//     cell is `one`, like a negation. A quorum is ONE N-member witness, not
//     every N-subset of the supporters, so a count over it is a lower bound
//     of the derivation trees a walk would count. A cell with a premise the
//     store lacks is dead like a firing: Group and Quorum need every member
//     live, any other cell one. A cell is a node of the support graph
//     of its own: its value is computed once per round and adds no depth, and
//     the cycle analysis runs through it. A store that cannot open a cell
//     makes the fold throw rather than read every cell as dead.
//   * A cell member is ONE derivation per distinct projection (count, sum,
//     rank, at_least): with it(g,a,2) and it(g,b,2) under count, the total's
//     provenance cites one of them. The engine records no more; a fold cannot
//     recover the rest. The provenance product over a large cell is large by
//     nature, the other semirings stay linear in members.
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

import type { FactStore, Witness, PremRef } from './store.ts';
import { V } from './reflect.ts';
import { tarjan, indexer } from './scc.ts';
import { opWitness, type AggOp } from './cell.ts';

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
  const cells = new Map<string, CellNode | null>();
  const cellOf = (key: string): CellNode | null => {
    if (!cells.has(key)) cells.set(key, openCell(store, key));
    return cells.get(key)!;
  };
  const alive = (p: PremRef): boolean =>
    p.t === 'fact' ? store.has(p.key) : p.t !== 'cell' || cellOf(p.key) !== null;
  // a cell is a node of its own: citers point at it, it points at its members
  const nodes = [...keys];
  const edgesOf = (prems: PremRef[]): string[] => prems.flatMap((p) => {
    if (p.t === 'fact') return [p.key];
    if (p.t !== 'cell') return [];
    if (!edges.has(p.key)) {
      edges.set(p.key, []);
      nodes.push(p.key);
      edges.set(p.key, cellOf(p.key)!.members.flatMap(edgesOf));
    }
    return [p.key];
  });
  for (const k of keys) {
    seed.set(k, store.get(k)!.base ? (opts.base ? opts.base(k) : sr.one) : sr.zero);
    // a support with a premise the store no longer holds multiplies in `zero`
    // and can carry nothing; dropping it keeps the cycle analysis exact — and
    // a support recorded at the tick boundary reaches into the tick that has
    // ended, which this fold is not about, so it goes the same way
    const live = store.witnessesOf(k).filter(
      (w) => !staged.has(w.ruleId) && w.prems.every(alive));
    support.set(k, live);
    edges.set(k, live.flatMap((w) => edgesOf(w.prems)));
  }

  // computed for every discipline: a convergence claim tested on acyclic data
  // is a claim tested on nothing, so the caller gets to see the cycle count
  const onCycle = cyclicKeys(nodes, edges);
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
    const cellValue = new Map<string, T>();
    const premValue = (p: PremRef): T => {
      if (p.t === 'fact') return cur.get(p.key) ?? sr.zero;
      if (p.t !== 'cell') return sr.one;
      const memo = cellValue.get(p.key);
      if (memo !== undefined) return memo;
      const c = cellOf(p.key)!;
      cellValue.set(p.key, sr.one);
      let v: T = c.best ? sr.zero : sr.one;
      for (const m of c.members) {
        const prod = timesAll(sr, m, premValue);
        v = c.best ? sr.plus(v, prod) : sr.times(v, prod);
        if (!c.best && sr.eq(v, sr.zero)) break;
      }
      if (c.members.length === 0) v = sr.one;
      cellValue.set(p.key, v);
      return v;
    };
    let changed = false;
    for (const k of keys) {
      let acc: T = seed.get(k)!;
      for (const w of support.get(k)!) {
        acc = sr.plus(acc, timesAll(sr, w.prems, premValue, opts.weight ? opts.weight(k, w) : sr.one));
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
  return { value: cur, rounds, converged, disciplineHeld, cyclic: keys.filter((k) => onCycle.has(k)).length };
}

/** ⊗ over premises, stopping at `zero`: this branch is dead. */
function timesAll<T>(sr: Ops<T>, prems: PremRef[], val: (p: PremRef) => T, start: T = sr.one): T {
  let prod = start;
  for (const p of prems) {
    if (sr.eq(prod, sr.zero)) break;
    prod = sr.times(prod, val(p));
  }
  return prod;
}

/** A sealed cell as the fold reads it: its live members' premises, ⊕'d when
 *  `best` and ⊗'d otherwise. */
interface CellNode { best: boolean; members: PremRef[][] }
const ONE_CELL: CellNode = { best: false, members: [] };

/** null when the cell is dead: absent, or citing what the store lacks. */
function openCell(store: FactStore, key: string): CellNode | null {
  const rec = store.cellOf(key);
  if (!rec) return null;
  if (rec.value.k !== 'value') return ONE_CELL;
  const best = opWitness(rec.op as AggOp) !== 'group' && opWitness(rec.op as AggOp) !== 'quorum';
  const live = rec.members.filter((m) => m.prems.every((p) => p.t !== 'fact' || store.has(p.key)));
  if (best ? live.length === 0 && rec.members.length > 0 : live.length < rec.members.length) return null;
  return { best, members: live.map((m) => m.prems) };
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
 *  non-trivial strongly connected component, plus self-supporting facts. */
function cyclicKeys(keys: string[], edges: Map<string, string[]>): Set<string> {
  const g = indexer();
  for (const k of keys) g.id(k);
  for (let i = 0; i < g.keys.length; i++) for (const w of edges.get(g.keys[i]) ?? []) g.succ[i].push(g.id(w));
  const comp = tarjan(g.succ);
  const size = new Map<number, number>();
  for (const c of comp) size.set(c, (size.get(c) ?? 0) + 1);
  const cyclic = new Set<string>();
  for (let i = 0; i < g.keys.length; i++) if (size.get(comp[i])! > 1 || g.succ[i].includes(i)) cyclic.add(g.keys[i]);
  return cyclic;
}
