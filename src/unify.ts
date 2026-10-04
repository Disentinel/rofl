// unify.ts — terms, substitutions, matching, canonical serialization.
// Part of the ROFL kernel. Zero dependencies.

export type Term =
  | { k: 'v'; name: string }                    // variable
  | { k: 'i'; v: Int }                          // integer
  | { k: 's'; v: string }                       // string
  | { k: 'a'; name: string }                    // atom
  | { k: 'f'; name: string; args: Term[] };     // functor(term, ...)

/** ONE ATOM OBJECT PER NAME, up to a bound.
 *
 *  An atom is the kernel's symbol: a relation name reified by `factTerm`, a
 *  perspective, a rule id, a constant written in a program. The same handful of
 *  names is therefore built over and over — `derived_by` alone reifies the
 *  relation and the perspective of every conclusion — and each build used to
 *  cost one more object. Measured on seven programs (docs/performance-
 *  invariants.md, tier 2): sharing them takes 2.3 to 10.0 per cent off the
 *  live heap — paired A/B, 21 of 21 — and it is the largest single share of
 *  what interning buys anywhere.
 *
 *  IT MUST BE HERE, NOT IN THE STORE, and that was measured too. Interning
 *  inside `Store.add` was tried first and it made every program BIGGER — 15 to
 *  21 per cent — for two reasons that only show up on a scale: the term the
 *  store replaces is still reachable from the rule or the parse that built it,
 *  so the copy is added rather than saved; and a table keyed by canonical
 *  renderings retains one string per distinct value, which for functors is as
 *  long as the thing it indexes. A constructor cannot make the duplicate in
 *  the first place, and a table keyed by the atom's own name retains a string
 *  the atom is holding anyway.
 *
 *  NOTHING MAY DEPEND ON THE IDENTITY, and nothing does: no code in `src/`
 *  writes to a term, and every comparison goes through `unify` or `canonTerm`.
 *  That is what makes this a CACHE rather than an identity table, which in turn
 *  is what lets it be bounded.
 *
 *  THE BOUND IS THE LIFETIME ANSWER. An intern table that only grows is a leak
 *  in a host that loads and excises programs for as long as it runs, and no
 *  store event can prune this one: a term is not reference-counted, and
 *  `remove`, `clearDerived`, `advanceTick` and `excise` all drop facts without
 *  being able to say whether an atom still has a holder. So the table is capped
 *  and cleared whole when it overflows. Sharing then restarts, which costs
 *  memory and breaks nothing, because two equal atoms that are different
 *  objects are exactly what this file did before. The programs in this
 *  repository use 265 to 645 distinct atoms; the cap is twelve times the
 *  largest of them and bounds the table's own cost at well under a megabyte.
 *
 *  Integers and strings are deliberately NOT shared. They measured a further
 *  1.2 to 3.2 per cent together — a quarter of what the atoms are worth — and
 *  their value space is the DATA's rather than the program's, so a bound on
 *  them would be a bound on how much of a data set can be shared, which is a
 *  worse thing to have to explain than the 2 per cent it buys. */
const ATOM_CAP = 8192;
const atomCache = new Map<string, Term>();

export const mkv = (name: string): Term => ({ k: 'v', name });
/** An integer of the term range [-2^60, 2^60), exact: a number where one is
 *  exact (within ±(2^53-1)), a bigint past that, so each value has one
 *  spelling and `===` compares values. */
export type Int = number | bigint;
const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
export const TERM_MIN = -(1n << 60n);
export const TERM_MAX = (1n << 60n) - 1n;
export const normInt = (v: Int): Int => (typeof v === 'bigint' && v >= -SAFE && v <= SAFE ? Number(v) : v);
export const mki = (v: Int): Term => ({ k: 'i', v: normInt(v) });
export const mks = (v: string): Term => ({ k: 's', v });
export const mka = (name: string): Term => {
  const hit = atomCache.get(name);
  if (hit !== undefined) return hit;
  const t: Term = { k: 'a', name };
  if (atomCache.size >= ATOM_CAP) atomCache.clear();
  atomCache.set(name, t);
  return t;
};
export const mkf = (name: string, args: Term[]): Term => ({ k: 'f', name, args });

/** How many atom names the cache is holding, and its cap. For the memory
 *  census and for the test that holds the bound in place — a cache that can
 *  grow without limit is the defect this reports, so it is readable rather
 *  than private. */
export const atomCacheSize = (): { size: number; cap: number } =>
  ({ size: atomCache.size, cap: ATOM_CAP });

// A substitution maps variable names to terms.
export type Subst = Map<string, Term>;

/** Follow variable bindings until a non-variable or an unbound variable. */
export function walk(t: Term, s: Subst): Term {
  while (t.k === 'v') {
    const b = s.get(t.name);
    if (b === undefined) return t;
    t = b;
  }
  return t;
}

/** Deeply apply a substitution. */
export function resolve(t: Term, s: Subst): Term {
  t = walk(t, s);
  if (t.k === 'f') return mkf(t.name, t.args.map((a) => resolve(a, s)));
  return t;
}

/** Syntactic unification. No occurs-check (documented v0 omission).
 *  Returns an extended copy of the substitution, or null. */
export function unify(a: Term, b: Term, s: Subst): Subst | null {
  const out = new Map(s);
  if (unifyInto(a, b, out)) return out;
  return null;
}

function unifyInto(a: Term, b: Term, s: Subst): boolean {
  a = walk(a, s);
  b = walk(b, s);
  if (a.k === 'v') {
    if (b.k === 'v' && b.name === a.name) return true;
    s.set(a.name, b);
    return true;
  }
  if (b.k === 'v') { s.set(b.name, a); return true; }
  if (a.k === 'i' && b.k === 'i') return a.v === b.v;
  if (a.k === 's' && b.k === 's') return a.v === b.v;
  if (a.k === 'a' && b.k === 'a') return a.name === b.name;
  if (a.k === 'f' && b.k === 'f') {
    if (a.name !== b.name || a.args.length !== b.args.length) return false;
    for (let i = 0; i < a.args.length; i++) if (!unifyInto(a.args[i], b.args[i], s)) return false;
    return true;
  }
  return false;
}

/** Unify two argument lists against ONE copy of the substitution.
 *
 *  WHY THIS EXISTS, and it is the whole of it: `unify` copies the
 *  substitution BEFORE it knows whether the terms match, so a caller that
 *  unified a literal argument by argument paid one `new Map(s)` PER ARGUMENT
 *  — and threw every one of them away when the candidate failed, which is
 *  what a candidate does most of the time. Measured 2026-09-07 on the ring 1
 *  grammar, where the evaluator matches premises against a store the parse
 *  itself is filling: the garbage collector was the single largest entry in
 *  the CPU profile at 18 per cent, ahead of every function in the kernel.
 *
 *  One copy per candidate instead of one per argument. The contract is
 *  `unify`'s: `s` is never mutated, and a failure returns null having changed
 *  nothing the caller can see.
 *
 *  AND THE TIME IT BUYS IS SMALL, said here rather than left to be assumed: on
 *  the ring 1 grammar it is inside the noise, and on a clause wide enough for
 *  the join to matter it is 2 per cent, consistent in direction over
 *  interleaved arms. The reason is measured too — the evaluator examines 1.4
 *  candidate facts per premise match, because the argument index answers
 *  before a scan can start, so there are few doomed candidates to stop
 *  allocating for. It is kept for being less work and one call instead of a
 *  loop at three sites, not for a number. A companion filter that skipped the
 *  copy for candidates that cannot match was written, measured at zero, and
 *  removed: forty lines of kernel that no workload here can turn red. */
export function unifyAll(a: Term[], b: Term[], s: Subst): Subst | null {
  if (a.length !== b.length) return null;
  const out = new Map(s);
  for (let i = 0; i < a.length; i++) if (!unifyInto(a[i], b[i], out)) return null;
  return out;
}

export function isGround(t: Term): boolean {
  if (t.k === 'v') return false;
  if (t.k === 'f') return t.args.every(isGround);
  return true;
}

export function varsOf(t: Term, into: Set<string> = new Set()): Set<string> {
  if (t.k === 'v') into.add(t.name);
  else if (t.k === 'f') for (const a of t.args) varsOf(a, into);
  return into;
}

// THE UNKNOWN VALUE (docs/aggregates.md, "Shrugs, as built"): a position of a
// tuple a hole left out that is not known, one term for every evaluator.

export const UNKNOWN_VALUE: Term = { k: 'a', name: '$unknown_value' };

export function holdsUnknown(t: Term): boolean {
  return (t.k === 'a' && t.name === '$unknown_value') || (t.k === 'f' && (t.name === '$unk' || t.name === '$by' || t.args.some(holdsUnknown)));
}

// A LABELED UNKNOWN (docs/aggregates.md, "Labeled unknowns"): `$unk(L, Ex, Sure)`, one occurrence of the unknown
// value L, known not to be any of the list `Ex`, `Sure` 1 when the tuple that holds it exists in every completion;
// `$by(L, D, Cases, Sure)`, a value that is `D` and `V` where L is `C` for `c(C, V)` in `Cases`.

export const isLabeled = (t: Term): boolean => t.k === 'f' && (t.name === '$unk' || t.name === '$by');

export const mkList = (xs: Term[]): Term => xs.reduceRight((tl, h) => mkf('$cons', [h, tl]), mka('$nil'));
export function unList(t: Term): Term[] {
  const out: Term[] = [];
  for (; t.k === 'f' && t.name === '$cons'; t = t.args[1]) out.push(t.args[0]);
  return out;
}

export function unkParts(t: Term): { label: Term; ex: Term[]; sure: boolean } | null {
  return t.k === 'f' && t.name === '$unk' ? { label: t.args[0], ex: unList(t.args[1]), sure: t.args[2].k === 'i' && Number(t.args[2].v) === 1 } : null;
}

export function byParts(t: Term): { label: Term; dflt: Term; cases: [Term, Term][]; sure: boolean } | null {
  if (t.k !== 'f' || t.name !== '$by') return null;
  const cases = unList(t.args[2]).filter((c) => c.k === 'f').map((c) => [(c as { args: Term[] }).args[0], (c as { args: Term[] }).args[1]] as [Term, Term]);
  return { label: t.args[0], dflt: t.args[1], cases, sure: t.args[3].k === 'i' && Number(t.args[3].v) === 1 };
}

const MARK = '$unsure';
/** The solution passed an undecided step, so what it gives may not exist. */
export const unsure = (s: Subst): Subst => (s.has(MARK) ? s : new Map(s).set(MARK, mki(1)));
export const isUnsure = (s: Subst): boolean => s.has(MARK);

/** The values a `$by` can have, the leaves of its table; `null` for what is no table. */
export function byValues(t: Term): Term[] | null {
  const b = byParts(t);
  if (b === null) return null;
  const out = new Map<string, Term>();
  for (const v of [...b.cases.map(([, x]) => x), b.dflt]) for (const x of byValues(v) ?? [v]) out.set(canonTerm(x), x);
  return [...out.values()];
}

export function mkUnk(label: Term, ex: Term[], sure: boolean): Term {
  const seen = new Set<string>();
  const xs = ex.map((x) => [`(${canonTerm(x)})`, x] as [string, Term]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).filter(([k]) => !seen.has(k) && !!seen.add(k)).map(([, x]) => x);
  return mkf('$unk', [label, mkList(xs), mki(sure ? 1 : 0)]);
}

/** Every unbound variable of `ts` stands for an unknown value. */
export function bindUnknown(ts: Term[], s: Subst): Subst | null {
  const vs = new Set<string>();
  for (const t of ts) varsOf(resolve(t, s), vs);
  let s2: Subst | null = s;
  for (const v of vs) { s2 = unify({ k: 'v', name: v }, UNKNOWN_VALUE, s2); if (s2 === null) return null; }
  return s2;
}

/** A literal's argument `a` against an unknown's `t`: where `t` holds the
 *  unknown value, whatever `a` has there stands for it; a structure around it
 *  must be `a`'s too. */
export function unifyUnknown(a: Term, t: Term, s: Subst): Subst | null {
  if (t.k === 'a' && t.name === '$unknown_value') return bindUnknown([a], s);
  if (isLabeled(t)) {
    const ra = resolve(a, s);
    const p = unkParts(t);
    if (p !== null && isGround(ra) && !holdsUnknown(ra) && p.ex.some((x) => canonTerm(x) === canonTerm(ra))) return null;
    // a value that depends on a label is one of the values it has, and no other
    if (isGround(ra) && !holdsUnknown(ra)) { const vs = byValues(t); if (vs !== null && !vs.some((x) => canonTerm(x) === canonTerm(ra))) return null; }
    if (ra.k === 'v') return unify(ra, t, s);
    // a value, or another unknown, against this one: it is that value, or it is that unknown, in the completions the
    // tuple that reads it exists in, and in no other (unless it is this very one)
    const pa = unkParts(ra), pt = unkParts(t);
    const same = canonTerm(ra) === canonTerm(t) || (pa !== null && pt !== null && canonTerm(pa.label) === canonTerm(pt.label));
    return bindUnknown([ra], same ? s : unsure(s));
  }
  if (!holdsUnknown(t)) return unify(a, t, s);
  const ra = resolve(a, s);
  if (ra.k === 'v') return unify(ra, t, s);
  if (ra.k === 'f' && t.k === 'f' && ra.name === t.name && ra.args.length === t.args.length) {
    let s2: Subst | null = s;
    for (let i = 0; s2 && i < ra.args.length; i++) s2 = unifyUnknown(ra.args[i], t.args[i], s2);
    return s2;
  }
  return null;
}

/** Canonical serialization of a term. Total, injective on distinct terms.
 *  Lexicographic order of these strings is the kernel's canonical order. */
export function canonTerm(t: Term): string {
  switch (t.k) {
    case 'v': return '?' + t.name;
    case 'i': return String(t.v);
    case 's': return JSON.stringify(t.v);
    case 'a': return t.name === DS_ANY_NAME ? '_' : t.name;
    case 'f': return t.name + '(' + t.args.map(canonTerm).join(',') + ')';
  }
}

/** What stands in the key of a data-stratified correlation for a group no rule bound: an atom no source can write,
 *  spelled `_` wherever a term is printed (`aggeval.ts`). */
export const DS_ANY_NAME = '\u0001any';

/** Rename the variables of a term list to positional placeholders, numbered
 *  by first appearance across the whole list. Ground terms come back
 *  unchanged, so a ground rendering is byte-identical to the input's.
 *  Used where a rendering must not depend on which clause instance produced
 *  it: two terms that differ only by variable naming render alike, while
 *  differing variable SHARING still renders differently. */
export function canonVars(ts: Term[]): Term[] {
  const seen = new Map<string, Term>();
  const go = (t: Term): Term => {
    if (t.k === 'v') {
      let r = seen.get(t.name);
      if (!r) { r = mkv(String(seen.size)); seen.set(t.name, r); }
      return r;
    }
    if (t.k === 'f') return mkf(t.name, t.args.map(go));
    return t;
  };
  return ts.map(go);
}


/** Why `evalArith` could not produce a number. The first is NOT an error: a
 *  variable that is not bound yet is the ordinary state of a builtin that
 *  runs before its generator, and of a clause body solved with open
 *  bindings. The other two are inabilities — no binding of the variables
 *  that remain makes a string or an unknown operator arithmetic, and a zero
 *  divisor has no quotient. Numbers, not names, so the kernel's closed
 *  relation vocabulary does not grow with an internal distinction. */
export const ARITH_UNBOUND = 0;
export const ARITH_TYPE = 1;
export const ARITH_ZERO = 2;
/** A result outside the term range: no value, never a wrapped or rounded one. */
export const ARITH_OVERFLOW = 7;

/** Failure sink. The caller owns one and passes it in when it intends to act
 *  on the reason; `evalArith` writes it ONLY on failure, so the successful
 *  path allocates nothing and callers that do not care pass nothing. On a
 *  nested failure the DEEPEST cause survives: an outer call returns on its
 *  operand's null without touching the sink. */
export interface ArithFail { code: number }

/** Evaluate an arithmetic expression term to an integer, or null if it
 *  contains unbound variables / non-arithmetic leaves. Operators: + - * / mod,
 *  and min(A, B), max(A, B) (the lattice's monotone steps, docs/aggregates.md).
 *  Division truncates toward zero. With `fail`, a null return also says which
 *  of the three reasons it was. */
export function evalArith(t: Term, s: Subst, fail?: ArithFail): Int | null {
  t = walk(t, s);
  if (t.k === 'i') return t.v;
  if (t.k === 'f' && t.args.length === 2) {
    const l = evalArith(t.args[0], s, fail);
    if (l === null) return null;
    const r = evalArith(t.args[1], s, fail);
    if (r === null) return null;
    if (!ARITH_OPS.has(t.name)) { if (fail) fail.code = ARITH_TYPE; return null; }
    if ((t.name === '/' || t.name === 'mod') && (r === 0 || r === 0n)) { if (fail) fail.code = ARITH_ZERO; return null; }
    // EXACT, AND WITHIN THE TERM RANGE, as the Rust engine computes it: a
    // double is exact to 2^53 only, so a result that might pass it is
    // computed again as a bigint, and one past 2^60 has no value
    // (f_arithmetic_wraps_past_the_term_range).
    if (typeof l === 'number' && typeof r === 'number') {
      const v = t.name === '+' ? l + r : t.name === '-' ? l - r : t.name === '*' ? l * r
        : t.name === 'min' ? Math.min(l, r) : t.name === 'max' ? Math.max(l, r) : null;
      if (v !== null && Number.isSafeInteger(v)) return v;
    }
    const a = BigInt(l), b = BigInt(r);
    const v = t.name === '+' ? a + b : t.name === '-' ? a - b : t.name === '*' ? a * b
      : t.name === '/' ? a / b : t.name === 'mod' ? a - b * (a / b) : t.name === 'min' ? (a < b ? a : b) : (a > b ? a : b);
    if (v < TERM_MIN || v > TERM_MAX) { if (fail) fail.code = ARITH_OVERFLOW; return null; }
    return normInt(v);
  }
  if (fail) fail.code = t.k === 'v' ? ARITH_UNBOUND : ARITH_TYPE;
  return null;
}

export const ARITH_OPS = new Set(['+', '-', '*', '/', 'mod', 'min', 'max']);

/** FNV-1a 32-bit hash, hex encoded. Used for content-addressed rule ids. */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Structural JSON encoding for snapshots (terms only). */
export function termToJson(t: Term): unknown {
  switch (t.k) {
    case 'v': return { k: 'v', name: t.name };
    case 'i': return { k: 'i', v: t.v };   // a bigint is written as its digits (`intJson`)
    case 's': return { k: 's', v: t.v };
    case 'a': return { k: 'a', name: t.name };
    case 'f': return { k: 'f', name: t.name, args: t.args.map(termToJson) };
  }
}

/** JSON with a bigint written as the number it is, and read back exactly. */
export function toJson(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? '\u0000' + v.toString() : v))
    .replace(/"\\u0000(-?\d+)"/g, '$1');
}

export function fromJson(text: string): any {
  return JSON.parse(text, ((_k: string, v: unknown, ctx?: { source?: string }) =>
    (typeof v === 'number' && !Number.isSafeInteger(v) && ctx?.source && /^-?\d+$/.test(ctx.source) ? BigInt(ctx.source) : v)) as never);
}

export function termFromJson(j: any): Term {
  switch (j.k) {
    case 'v': return mkv(j.name);
    case 'i': return mki(j.v);
    case 's': return mks(j.v);
    case 'a': return mka(j.name);
    case 'f': return mkf(j.name, j.args.map(termFromJson));
    default: throw new Error('bad term json');
  }
}

// ---------------------------------------------------------------------------
// THE STRUCTURES BUILT OUT OF TERMS.
//
// A literal and a clause are the kernel's own data, not a parse artifact: the
// evaluator, the reflector and the dense reader all build them without any
// text going past. They lived in `parser.ts` because that is where the first
// one was constructed, and that single line of history made the PARSER look
// mandatory to every module that only wanted the shape — five files in `src/`
// imported the grammar to name a record. They live here, in the leaf that
// already owns `Term`, so that a host which never reads ROFL source (a
// compiled program, a dense program, an embedder building clauses in its own
// language) can drop the grammar as a FILE and not merely as a code path.
// ---------------------------------------------------------------------------

export type Temporal = 'init' | 'now' | 'next';

export interface Lit {
  rel: string;
  persp: Term;            // atom or variable
  perspExplicit: boolean; // was [p] written in the source?
  args: Term[];
  temporal: Temporal;
}

export type BodyElem =
  | { t: 'pos'; lit: Lit }
  | { t: 'neg'; lit: Lit }
  | { t: 'bi'; op: string; l: Term; r: Term }
  // A BODY AGGREGATE, `Res is op(Vals ; Keys : Body)` (docs/aggregates.md).
  // The threshold `at_least(N, Vals : Body)` is one too, with N as `res`.
  // `at` (its premise position, from 1) and `shared` (the variables of the
  // element other than the result that also occur elsewhere in the clause,
  // in the order they occur in it) are derived by `annotateAggs` and are no
  // part of the canonical spelling.
  | { t: 'agg'; op: string; res: Term; vals: Term[]; keys: Term[]; body: BodyElem[]; at?: number; shared?: string[] };

/** A clause, a lattice declaration (`lattice dist(A, C, min D).` is the head
 *  `dist(A, C, D)` with no body and `lattice` the operation `min`; a tag's
 *  semiring is in `lattice` with `tag` set), or a dominance rule (`dominator`). */
export interface Clause { head: Lit; body: BodyElem[]; lattice?: string; widen?: number; tag?: boolean; dominator?: Lit; ord?: string[]; }

/** The variables of a body element, in the order they are written: a
 *  literal's arguments then its book, a builtin's two sides, an aggregate's
 *  result then its values, keys and inner body. */
export function elemVars(b: BodyElem, into: Set<string> = new Set()): Set<string> {
  if (b.t === 'pos' || b.t === 'neg') { for (const a of b.lit.args) varsOf(a, into); varsOf(b.lit.persp, into); }
  else if (b.t === 'bi') { varsOf(b.l, into); varsOf(b.r, into); }
  else { varsOf(b.res, into); aggInnerVars(b, into); }
  return into;
}

/** The variables inside an aggregate: values, keys and inner body. */
export function aggInnerVars(a: BodyElem & { t: 'agg' }, into: Set<string> = new Set()): Set<string> {
  for (const t of a.vals) varsOf(t, into);
  for (const t of a.keys) varsOf(t, into);
  for (const b of a.body) elemVars(b, into);
  return into;
}

/** Fill every aggregate's `at` and `shared` from its clause (rust/rofl
 *  `annotate_aggs`). Called wherever a clause is made; returns a new clause
 *  when there is an aggregate, the same one otherwise. */
export function annotateAggs(c: Clause): Clause {
  if (!c.body.some((b) => b.t === 'agg')) return c;
  const body = c.body.map((b, k) => {
    if (b.t !== 'agg') return b;
    const elsewhere = new Set<string>();
    for (const t of c.head.args) varsOf(t, elsewhere);
    varsOf(c.head.persp, elsewhere);
    c.body.forEach((x, j) => { if (j !== k) elemVars(x, elsewhere); });
    const res = b.op === 'at_least' ? new Set<string>() : varsOf(b.res);
    const shared: string[] = [];
    for (const v of aggInnerVars(b)) if (elsewhere.has(v) && !res.has(v) && !shared.includes(v)) shared.push(v);
    return { ...b, at: k + 1, shared };
  });
  return { ...c, body };
}

/** Every literal a body element reads, an aggregate's inner ones included. */
export function litsOf(b: BodyElem): Lit[] {
  if (b.t === 'pos' || b.t === 'neg') return [b.lit];
  if (b.t === 'agg') return b.body.flatMap(litsOf);
  return [];
}

/** Every term a body element writes: a literal's arguments, a builtin's two
 *  sides, an aggregate's result, values, keys and inner terms. */
export function termsOf(b: BodyElem): Term[] {
  if (b.t === 'pos' || b.t === 'neg') return b.lit.args;
  if (b.t === 'bi') return [b.l, b.r];
  return [b.res, ...b.vals, ...b.keys, ...b.body.flatMap(termsOf)];
}

// ---------------------------------------------------------------------------
// A SET HAS ONE SPELLING (docs/aggregates.md, "The join lattice, as built"):
// `set(E, ...)` is the union carrier's value, its elements in the kernel's
// order (the order of their canonical text) with no repeat, so every ground
// set a program writes is read as that value, inner sets first, wherever it
// stands. The Rust engine does the same (`canon_set_literals`,
// rust/rofl/src/cell.rs), so a set held in a plain relation is one fact in
// both engines.

function hasSet(t: Term): boolean {
  return t.k === 'f' && (t.name === 'set' || t.args.some(hasSet));
}

/** A term with every ground set in it written as its canonical value. */
export function canonSets(t: Term): Term {
  if (!hasSet(t) || t.k !== 'f') return t;
  const args = t.args.map(canonSets);
  if (t.name === 'set' && args.every(isGround)) {
    const keyed = args.map((a) => [canonTerm(a), a] as const).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    return mkf('set', keyed.filter((x, i) => i === 0 || x[0] !== keyed[i - 1][0]).map((x) => x[1]));
  }
  return mkf(t.name, args);
}

/** A literal with its sets canonical. */
export function canonLitSets(l: Lit): Lit {
  return l.args.some(hasSet) ? { ...l, args: l.args.map(canonSets) } : l;
}

/** A clause with its sets canonical. */
export function canonClauseSets(c: Clause): Clause {
  const body = (b: BodyElem): BodyElem => {
    if (b.t === 'pos' || b.t === 'neg') return { ...b, lit: canonLitSets(b.lit) };
    if (b.t === 'bi') return { ...b, l: canonSets(b.l), r: canonSets(b.r) };
    return { ...b, res: canonSets(b.res), vals: b.vals.map(canonSets), keys: b.keys.map(canonSets), body: b.body.map(body) };
  };
  return { ...c, head: canonLitSets(c.head), body: c.body.map(body) };
}

/** The first set in `t` written with a variable and more than one element:
 *  its canonical spelling depends on the bindings, so as a pattern or a
 *  stored term it would hold only in the order it is written. The TypeScript
 *  engine has no join to build one and no `in` or `subset` to read one, so
 *  one is refused wherever it stands. */
export function openSet(t: Term): Term | null {
  if (t.k !== 'f') return null;
  if (t.name === 'set' && t.args.length > 1 && !isGround(t)) return t;
  for (const a of t.args) {
    const o = openSet(a);
    if (o) return o;
  }
  return null;
}

/** The first open set a clause writes, anywhere. */
export function clauseOpenSet(c: Clause): Term | null {
  for (const t of [...c.head.args, ...c.body.flatMap(termsOf)]) {
    const o = openSet(t);
    if (o) return o;
  }
  return null;
}

/** Why a set with a variable is refused, in both engines' words
 *  (`set_pattern_reason`, rust/rofl/src/program.rs). */
export function setPatternReason(set: string): string {
  return `${set} is a set written with a variable, so which spelling it has depends on what the variable is bound to, `
    + 'and it would match or be stored only in the order it is written: a set with a variable stands only as a join '
    + "lattice's value in a head, as either side of `subset` and as the right of `in`; elsewhere name the set with a "
    + 'variable and read its members with `in`';
}
