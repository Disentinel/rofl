// unify.ts — terms, substitutions, matching, canonical serialization.
// Part of the ROFL kernel. Zero dependencies.

export type Term =
  | { k: 'v'; name: string }                    // variable
  | { k: 'i'; v: number }                       // integer
  | { k: 's'; v: string }                       // string
  | { k: 'a'; name: string }                    // atom
  | { k: 'f'; name: string; args: Term[] };     // functor(term, ...)

export const mkv = (name: string): Term => ({ k: 'v', name });
export const mki = (v: number): Term => ({ k: 'i', v });
export const mks = (v: string): Term => ({ k: 's', v });
export const mka = (name: string): Term => ({ k: 'a', name });
export const mkf = (name: string, args: Term[]): Term => ({ k: 'f', name, args });

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

export function termEq(a: Term, b: Term): boolean {
  return canonTerm(a) === canonTerm(b);
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
