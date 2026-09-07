// unify.ts — terms, substitutions, matching, canonical serialization.
// Part of the ROFL kernel. Zero dependencies.

export type Term =
  | { k: 'v'; name: string }                    // variable
  | { k: 'i'; v: number }                       // integer
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
export const mki = (v: number): Term => ({ k: 'i', v });
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

/** Canonical serialization of a term. Total, injective on distinct terms.
 *  Lexicographic order of these strings is the kernel's canonical order. */
export function canonTerm(t: Term): string {
  switch (t.k) {
    case 'v': return '?' + t.name;
    case 'i': return String(t.v);
    case 's': return JSON.stringify(t.v);
    case 'a': return t.name;
    case 'f': return t.name + '(' + t.args.map(canonTerm).join(',') + ')';
  }
}

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

/** Failure sink. The caller owns one and passes it in when it intends to act
 *  on the reason; `evalArith` writes it ONLY on failure, so the successful
 *  path allocates nothing and callers that do not care pass nothing. On a
 *  nested failure the DEEPEST cause survives: an outer call returns on its
 *  operand's null without touching the sink. */
export interface ArithFail { code: number }

/** Evaluate an arithmetic expression term to an integer, or null if it
 *  contains unbound variables / non-arithmetic leaves. Operators: + - * / mod.
 *  Division truncates toward zero. With `fail`, a null return also says which
 *  of the three reasons it was. */
export function evalArith(t: Term, s: Subst, fail?: ArithFail): number | null {
  t = walk(t, s);
  if (t.k === 'i') return t.v;
  if (t.k === 'f' && t.args.length === 2) {
    const l = evalArith(t.args[0], s, fail);
    if (l === null) return null;
    const r = evalArith(t.args[1], s, fail);
    if (r === null) return null;
    switch (t.name) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': if (r !== 0) return Math.trunc(l / r); break;
      case 'mod': if (r !== 0) return l - r * Math.trunc(l / r); break;
      default: if (fail) fail.code = ARITH_TYPE; return null;
    }
    // only the two zero-divisor breaks reach here
    if (fail) fail.code = ARITH_ZERO;
    return null;
  }
  if (fail) fail.code = t.k === 'v' ? ARITH_UNBOUND : ARITH_TYPE;
  return null;
}

export const ARITH_OPS = new Set(['+', '-', '*', '/', 'mod']);

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
    case 'i': return { k: 'i', v: t.v };
    case 's': return { k: 's', v: t.v };
    case 'a': return { k: 'a', name: t.name };
    case 'f': return { k: 'f', name: t.name, args: t.args.map(termToJson) };
  }
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
  | { t: 'bi'; op: string; l: Term; r: Term };

export interface Clause { head: Lit; body: BodyElem[]; }
