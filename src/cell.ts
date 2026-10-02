// cell.ts — THE ALGEBRA OF A CELL (docs/aggregates.md): what each aggregate
// operation folds, the join carriers, the interval functions of `is`, the
// declared widening and the semiring tags. The TypeScript side of
// rust/rofl/src/cell.rs, function for function; integers are carried as
// bigint wherever the Rust side carries i128, so a total past 2^53 is exact
// and a total past the term range is a hole, never a rounded value.

import { type Term, type Int, mka, mki, mkf, canonTerm, isGround, TERM_MIN, TERM_MAX } from './unify.ts';

export type AggOp = 'count' | 'sum' | 'min' | 'max' | 'or' | 'and' | 'at_least' | 'median' | 'quantile' | 'rank'
  | 'union' | 'hull' | 'bitor' | 'subsumption';
export type Class = 'invertible' | 'idempotent_order' | 'idempotent_join' | 'threshold' | 'holistic' | 'partial_order';
export type WitnessKind = 'group' | 'best' | 'quorum' | 'cover' | 'antichain';

/** A folded value: an integer (bigint, the i128 of the Rust side) or a boolean. */
export type Val = { k: 'int'; v: bigint } | { k: 'bool'; v: boolean };
/** What one contribution did to the accumulator. */
export type Step = { k: 'unchanged' } | { k: 'tied' } | { k: 'improved'; x: Val };

export const INT_MIN = TERM_MIN;
export const INT_MAX = TERM_MAX;
export const AGG_OVERFLOW = 'agg_overflow';
export const AGG_TYPE = 'agg_type_error';

/** A fold refused, for a reason a hole names (`agg_overflow`, `agg_type_error`). */
export class Refused extends Error {
  reason: string;
  constructor(reason: string) { super(reason); this.reason = reason; }
}

/** The thirteen operations a program writes, in the order the Rust `Vocab` lists them. */
export const AGG_OPS: AggOp[] = ['count', 'sum', 'min', 'max', 'or', 'and', 'at_least', 'median', 'quantile', 'rank', 'union', 'hull', 'bitor'];
export const opFromName = (s: string): AggOp | null => (AGG_OPS as string[]).includes(s) ? s as AggOp : null;

export function opClass(op: AggOp): Class {
  switch (op) {
    case 'count': case 'sum': return 'invertible';
    case 'at_least': return 'threshold';
    case 'median': case 'quantile': case 'rank': return 'holistic';
    case 'union': case 'hull': case 'bitor': return 'idempotent_join';
    case 'subsumption': return 'partial_order';
    default: return 'idempotent_order';
  }
}

export function opWitness(op: AggOp): WitnessKind {
  switch (opClass(op)) {
    case 'invertible': case 'holistic': return 'group';
    case 'idempotent_order': return 'best';
    case 'idempotent_join': return 'cover';
    case 'threshold': return 'quorum';
    case 'partial_order': return 'antichain';
  }
}

export const dedupByProjection = (op: AggOp): boolean =>
  ['invertible', 'threshold', 'holistic'].includes(opClass(op));
/** Quantile's percent and rank's subject come before the projection. */
export const opParams = (op: AggOp): number => (op === 'quantile' || op === 'rank' ? 1 : 0);
export const opRecursive = (op: AggOp): boolean => opClass(op) === 'threshold';
export const isJoin = (op: AggOp): boolean => opClass(op) === 'idempotent_join';
export const opIdentity = (op: AggOp): Val | null => (op === 'count' || op === 'sum' ? { k: 'int', v: 0n } : null);

const inRange = (n: bigint): boolean => n >= INT_MIN && n <= INT_MAX;
export const bigOf = (t: Term): bigint | null => (t.k === 'i' ? BigInt(t.v) : null);

/** A member's value as the fold reads it; anything else is `agg_type_error`. */
export function lift(op: AggOp, t: Term): Val {
  switch (op) {
    case 'count': case 'at_least': return { k: 'int', v: 1n };
    case 'sum': case 'min': case 'max': case 'median': case 'quantile': case 'rank':
      if (t.k === 'i') return { k: 'int', v: BigInt(t.v) };
      throw new Refused(AGG_TYPE);
    case 'or': case 'and':
      if (t.k === 'a' && t.name === 'true') return { k: 'bool', v: true };
      if (t.k === 'a' && t.name === 'false') return { k: 'bool', v: false };
      throw new Refused(AGG_TYPE);
    default: throw new Refused(AGG_TYPE);
  }
}

const cmpVal = (a: Val, b: Val): number => {
  if (a.k === 'int' && b.k === 'int') return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  if (a.k === 'bool' && b.k === 'bool') return a.v === b.v ? 0 : a.v ? 1 : -1;
  throw new Refused(AGG_TYPE);
};
/** `Less` (negative) means the new value is better, `Equal` a tie. */
const order = (o: number, x: Val): Step => (o < 0 ? { k: 'improved', x } : o === 0 ? { k: 'tied' } : { k: 'unchanged' });

/** ⊕: merge one contribution into the accumulator. */
export function insert(op: AggOp, acc: Val | null, x: Val): Step {
  if (acc === null) return { k: 'improved', x };
  if ((op === 'count' || op === 'sum') && acc.k === 'int' && x.k === 'int') {
    const s = acc.v + x.v;
    return s === acc.v ? { k: 'unchanged' } : { k: 'improved', x: { k: 'int', v: s } };
  }
  if (op === 'min' && acc.k === 'int' && x.k === 'int') return order(cmpVal(x, acc), x);
  if (op === 'max' && acc.k === 'int' && x.k === 'int') return order(cmpVal(acc, x), x);
  if (op === 'or' && acc.k === 'bool' && x.k === 'bool') return order(cmpVal(acc, x), x);
  if (op === 'and' && acc.k === 'bool' && x.k === 'bool') return order(cmpVal(x, acc), x);
  throw new Refused(AGG_TYPE);
}

/** The accumulator as a value: a total past the term range is `agg_overflow`. */
export function finish(acc: Val | null): Val | null {
  if (acc !== null && acc.k === 'int' && !inRange(acc.v)) throw new Refused(AGG_OVERFLOW);
  return acc;
}

/** A finished value as a term. */
export function lower(x: Val): Term {
  return x.k === 'int' ? mki(x.v as Int) : mka(x.v ? 'true' : 'false');
}

/** The value of a whole group, folded in the order given and finished. */
export function fold(op: AggOp, xs: Val[]): Val | null {
  let acc: Val | null = null;
  for (const x of xs) {
    const st = insert(op, acc, x);
    if (st.k === 'improved') acc = st.x;
  }
  return finish(acc);
}

/** A holistic group's values sorted ascending, and its distinct values. */
export interface Sorted { values: bigint[]; distinct: bigint[] }

export function sortedOf(xs: Val[]): Sorted {
  const values: bigint[] = [];
  for (const x of xs) {
    if (x.k !== 'int') throw new Refused(AGG_TYPE);
    values.push(x.v);
  }
  values.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const distinct: bigint[] = [];
  for (const v of values) if (distinct.length === 0 || distinct[distinct.length - 1] !== v) distinct.push(v);
  return { values, distinct };
}

/** THE HOLISTIC VALUE of a group already sorted: median (the lower one),
 *  quantile(P) (nearest rank), rank(S) (among the distinct values, from 1).
 *  An empty group has no value, whatever the parameter. */
export function holisticSorted(op: AggOp, param: Val | null, g: Sorted): Val | null {
  let p = 0n;
  if (op === 'median') p = 0n;
  else if (op === 'quantile' && param !== null && param.k === 'int' && param.v >= 0n && param.v <= 100n) p = param.v;
  else if (op === 'rank' && param !== null && param.k === 'int') p = param.v;
  else throw new Refused(AGG_TYPE);
  const ns = g.values;
  if (ns.length === 0) return null;
  const n = BigInt(ns.length);
  const nth = (r: bigint): Val => {
    const c = r < 1n ? 1n : r > n ? n : r;
    return { k: 'int', v: ns[Number(c - 1n)] };
  };
  if (op === 'median') return nth((n + 1n) / 2n);
  if (op === 'quantile') return nth((p * n + 99n) / 100n);
  let lo = 0, hi = g.distinct.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (g.distinct[mid] < p) lo = mid + 1; else hi = mid;
  }
  return lo < g.distinct.length && g.distinct[lo] === p ? { k: 'int', v: BigInt(lo + 1) } : null;
}

export const holistic = (op: AggOp, param: Val | null, xs: Val[]): Val | null => holisticSorted(op, param, sortedOf(xs));

// -------------------------------------------------------------- the joins

/** A join or an order test was handed a term outside the lattice's carrier. */
export class OffCarrier extends Error {}

/** The elements of a `set(...)` term as written, or null for any other term. */
export const setElems = (t: Term): Term[] | null => (t.k === 'f' && t.name === 'set' ? t.args : null);

/** Terms in the kernel's order (their canonical text), each once. */
export function sortTerms(xs: Term[]): Term[] {
  const keyed = xs.map((t) => [canonTerm(t), t] as [string, Term]);
  keyed.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const out: Term[] = [];
  let last: string | null = null;
  for (const [k, t] of keyed) { if (k !== last) out.push(t); last = k; }
  return out;
}

/** Two lists already in the kernel's order, merged, each element once. */
export function mergeTerms(xs: Term[], ys: Term[]): Term[] {
  const out: Term[] = [];
  let i = 0, j = 0;
  while (i < xs.length && j < ys.length) {
    const a = canonTerm(xs[i]), b = canonTerm(ys[j]);
    if (a < b) out.push(xs[i++]);
    else if (a > b) out.push(ys[j++]);
    else { out.push(xs[i++]); j++; }
  }
  while (i < xs.length) out.push(xs[i++]);
  while (j < ys.length) out.push(ys[j++]);
  return out;
}

export const mkSet = (xs: Term[]): Term => mkf('set', xs);

/** An interval's infinite ends, outside the term range. */
export const NINF: bigint = -(1n << 63n);
export const PINF: bigint = (1n << 63n) - 1n;

/** The bounds of `iv(Lo, Hi)`: Lo an integer or `ninf`, Hi an integer or `inf`. */
export function ivBounds(t: Term): [bigint, bigint] | null {
  if (t.k !== 'f' || t.name !== 'iv' || t.args.length !== 2) return null;
  const end = (x: Term, inf: string, sentinel: bigint): bigint | null =>
    x.k === 'i' ? BigInt(x.v) : x.k === 'a' && x.name === inf ? sentinel : null;
  const lo = end(t.args[0], 'ninf', NINF), hi = end(t.args[1], 'inf', PINF);
  return lo === null || hi === null ? null : [lo, hi];
}

export function mkIv(lo: bigint, hi: bigint): Term {
  const end = (x: bigint): Term => (x === NINF ? mka('ninf') : x === PINF ? mka('inf') : mki(x as Int));
  return mkf('iv', [end(lo), end(hi)]);
}

const bitsOf = (t: Term): bigint | null => (t.k === 'i' && BigInt(t.v) >= 0n ? BigInt(t.v) : null);

/** A contribution as its carrier's canonical value, or `agg_type_error`. */
export function joinCanon(op: AggOp, t: Term): Term {
  if (op === 'union') {
    const xs = setElems(t);
    if (xs === null || xs.length === 0 || !xs.every(isGround)) throw new Refused(AGG_TYPE);
    return mkSet(sortTerms(xs));
  }
  if (op === 'hull') {
    const b = ivBounds(t);
    if (b !== null && b[0] <= b[1]) return t;
    throw new Refused(AGG_TYPE);
  }
  if (op === 'bitor') {
    if (bitsOf(t) !== null) return t;
    throw new Refused(AGG_TYPE);
  }
  throw new Refused(AGG_TYPE);
}

/** ⊔ of two canonical values. */
export function join(op: AggOp, a: Term, b: Term): Term {
  if (op === 'union') {
    const xs = setElems(a), ys = setElems(b);
    if (xs === null || ys === null) throw new OffCarrier();
    return mkSet(mergeTerms(xs, ys));
  }
  if (op === 'hull') {
    const x = ivBounds(a), y = ivBounds(b);
    if (x === null || y === null) throw new OffCarrier();
    return mkIv(x[0] < y[0] ? x[0] : y[0], x[1] > y[1] ? x[1] : y[1]);
  }
  if (op === 'bitor') {
    const x = bitsOf(a), y = bitsOf(b);
    if (x === null || y === null) throw new OffCarrier();
    return mki((x | y) as Int);
  }
  throw new OffCarrier();
}

/** `a ⊑ b`, exactly when `join(a, b)` is b. */
export function joinLeq(op: AggOp, a: Term, b: Term): boolean {
  if (op === 'union') {
    const xs = setElems(a), ys = setElems(b);
    if (xs === null || ys === null) throw new OffCarrier();
    const ks = ys.map(canonTerm);
    let j = 0;
    for (const x of xs) {
      const kx = canonTerm(x);
      while (j < ks.length && ks[j] !== kx) j++;
      if (j === ks.length) return false;
      j++;
    }
    return true;
  }
  if (op === 'hull') {
    const x = ivBounds(a), y = ivBounds(b);
    if (x === null || y === null) throw new OffCarrier();
    return y[0] <= x[0] && x[1] <= y[1];
  }
  if (op === 'bitor') {
    const x = bitsOf(a), y = bitsOf(b);
    if (x === null || y === null) throw new OffCarrier();
    return (x & ~y) === 0n;
  }
  throw new OffCarrier();
}

/** Which join carrier a term is spelled in, by its shape alone. */
export function joinCarrierOf(t: Term): AggOp | null {
  if (t.k === 'f' && t.name === 'set') return 'union';
  if (t.k === 'f' && t.name === 'iv') return 'hull';
  if (t.k === 'i') return 'bitor';
  return null;
}

/** Whether the canonical set `xs` holds `e`. */
export function setContains(xs: Term[], e: Term): boolean {
  const ke = canonTerm(e);
  let lo = 0, hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const km = canonTerm(xs[mid]);
    if (km < ke) lo = mid + 1; else hi = mid;
  }
  return lo < xs.length && canonTerm(xs[lo]) === ke;
}

const hasSet = (t: Term): boolean => t.k === 'f' && (t.name === 'set' || t.args.some(hasSet));

/** A term with every ground set in it written as its canonical value, inner sets first. */
export function canonSetLiterals(t: Term): Term {
  if (!hasSet(t) || t.k !== 'f') return t;
  const args = t.args.map(canonSetLiterals);
  if (t.name === 'set' && args.every(isGround)) return mkSet(sortTerms(args));
  return mkf(t.name, args);
}

/** The first set in `t` written with a variable and more than one element. */
export function openSet(t: Term): Term | null {
  if (t.k !== 'f') return null;
  if (t.name === 'set' && t.args.length > 1 && !isGround(t)) return t;
  for (const a of t.args) { const o = openSet(a); if (o) return o; }
  return null;
}

/** `openSet` of a term the kernel canonicalises as it reads it. */
export function openSetBelow(t: Term): Term | null {
  const xs = setElems(t);
  if (xs === null) return openSet(t);
  for (const x of xs) { const o = openSet(x); if (o) return o; }
  return null;
}

// ------------------------------------------------------ interval functions

export type IvFn = 'ivadd' | 'ivsub' | 'ivmul' | 'ivmeet';
export const IV_FNS: ReadonlySet<string> = new Set(['ivadd', 'ivsub', 'ivmul', 'ivmeet']);
export type IvFault = 'type' | 'overflow';
export class IvFailed extends Error { fault: IvFault; constructor(f: IvFault) { super(f); this.fault = f; } }

/** The function over two intervals given as bounds; null is the empty interval (only ivmeet). */
export function ivApply(f: IvFn, a: [bigint, bigint], b: [bigint, bigint]): [bigint, bigint] | null {
  const fin = (x: bigint): bigint => { if (!inRange(x)) throw new IvFailed('overflow'); return x; };
  switch (f) {
    case 'ivadd': return [
      a[0] === NINF || b[0] === NINF ? NINF : fin(a[0] + b[0]),
      a[1] === PINF || b[1] === PINF ? PINF : fin(a[1] + b[1])];
    case 'ivsub': return [
      a[0] === NINF || b[1] === PINF ? NINF : fin(a[0] - b[1]),
      a[1] === PINF || b[0] === NINF ? PINF : fin(a[1] - b[0])];
    case 'ivmul': {
      if (b[0] !== b[1] || b[0] === NINF || b[0] === PINF) throw new IvFailed('type');
      const k = b[0];
      if (k === 0n) return [0n, 0n];
      if (k > 0n) return [a[0] === NINF ? NINF : fin(a[0] * k), a[1] === PINF ? PINF : fin(a[1] * k)];
      return [a[1] === PINF ? NINF : fin(a[1] * k), a[0] === NINF ? PINF : fin(a[0] * k)];
    }
    case 'ivmeet': {
      const lo = a[0] > b[0] ? a[0] : b[0], hi = a[1] < b[1] ? a[1] : b[1];
      return lo > hi ? null : [lo, hi];
    }
  }
}

/** THE DECLARED WIDENING of an interval: each end the join moved goes to its infinity. */
export function widenIv(old: [bigint, bigint], joined: [bigint, bigint], th: bigint[] = []): [bigint, bigint] {
  const up = (x: bigint) => th.find((t) => t >= x) ?? PINF, down = (x: bigint) => [...th].reverse().find((t) => t <= x) ?? NINF;
  return [joined[0] < old[0] ? down(joined[0]) : old[0], joined[1] > old[1] ? up(joined[1]) : old[1]];
}

/** THE NARROWING of a widened interval x by the join `fresh` of what its rules contribute from x: an end the widening raised comes down to the fresh join's end where that is inside it, and every other end stays. Never below `fresh`, so x being a post-fixpoint the result is one too. */
export function narrowIv(x: [bigint, bigint], fresh: [bigint, bigint], raised: [boolean, boolean]): [bigint, bigint] {
  return [raised[0] && fresh[0] > x[0] ? fresh[0] : x[0], raised[1] && fresh[1] < x[1] ? fresh[1] : x[1]];
}

// ------------------------------------------------------------ semiring tags

export type TagAlg = 'tropical' | 'viterbi' | 'trust' | 'counting';
export const TAG_ALGS: TagAlg[] = ['tropical', 'viterbi', 'trust', 'counting'];
export const TAG_UNIT = 1_000_000n;
export type TagFault = 'carrier' | 'overflow';
export class TagFailed extends Error { fault: TagFault; constructor(f: TagFault) { super(f); this.fault = f; } }

export const tagFromName = (s: string): TagAlg | null => (TAG_ALGS as string[]).includes(s) ? s as TagAlg : null;
export const tagTimesName = (a: TagAlg): string => '$' + a;
export const tagFromTimesName = (s: string): TagAlg | null => (s.startsWith('$') ? tagFromName(s.slice(1)) : null);
export const tagIdempotent = (a: TagAlg): boolean => a !== 'counting';
export const tagOrder = (a: TagAlg): AggOp | null => (a === 'tropical' ? 'min' : a === 'counting' ? null : 'max');
export const tagOne = (a: TagAlg): bigint => (a === 'tropical' ? 0n : a === 'counting' ? 1n : TAG_UNIT);
export function tagInCarrier(a: TagAlg, x: bigint): boolean {
  if (a === 'tropical') return inRange(x);
  if (a === 'counting') return x >= 1n && x <= INT_MAX;
  return x >= 0n && x <= TAG_UNIT;
}
/** ⊗, on two values of the carrier. */
export function tagTimes(a: TagAlg, x: bigint, y: bigint): bigint {
  if (!tagInCarrier(a, x) || !tagInCarrier(a, y)) throw new TagFailed('carrier');
  const r = a === 'tropical' ? x + y : a === 'viterbi' ? (x * y) / TAG_UNIT : a === 'trust' ? (x < y ? x : y) : x * y;
  if (!inRange(r)) throw new TagFailed('overflow');
  return r;
}
export const tagPlus = (a: TagAlg): AggOp => tagOrder(a) ?? 'sum';

// ------------------------------------------------------------------ quorum

/** THE QUORUM: of members given as (height, canonical text), the first `n` in
 *  the canonical order — height, then text — as indices, or null while fewer
 *  than `n` exist. A text given twice is one member. */
export function quorum(ms: [number, string][], n: number): number[] | null {
  const idx = ms.map((_, i) => i);
  idx.sort((a, b) => ms[a][0] - ms[b][0] || (ms[a][1] < ms[b][1] ? -1 : ms[a][1] > ms[b][1] ? 1 : 0) || a - b);
  const order: number[] = [];
  for (const i of idx) if (order.length === 0 || ms[order[order.length - 1]][1] !== ms[i][1]) order.push(i);
  if (order.length < n) return null;
  return order.slice(0, n);
}
