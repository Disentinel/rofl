// examples/ring1 — the ROFL front end, written in ROFL.
//
// ring1.rofl tokenizes and parses ROFL source with rules; this file is the
// HOST side of that arrangement and is deliberately small, because its size is
// the measurement. It does three things and nothing else:
//
//   1. hands the source text in, as one fact;
//   2. reads the parse trees back out;
//   3. RESOLVES RANGES TO TEXT.
//
// (3) is the declared loan. A token in ring1.rofl is a pair of indices and
// never text, because the kernel has no substring-by-range destructor and
// lengthening a string is concatenation, which the finiteness proof forbids.
// So the rules decide WHERE every name is and the host reads WHAT it says.
// That boundary is why no kernel change was needed for any of this.

import { Rofl } from '../../src/api.ts';
import { type Term, mka, mkv, mki, mks, mkf } from '../../src/unify.ts';
import { escapeString, type Clause, type Lit, type BodyElem } from '../../src/parser.ts';
import { canonClause } from '../../src/reflect.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

export const BOOT = 'boot.rofl';
export const CHARCLASS = 'examples/ring1/charclass.rofl';
export const RING1 = 'examples/ring1/ring1.rofl';

/** Re-exported from the parser, where it lives beside the unescaping it
 *  inverts. Kept as a name here because the demo and its test both use it. */
export const roflStr = escapeString;

const BUDGET = 200_000_000;

export function world(): Rofl {
  const r = new Rofl();
  for (const f of [BOOT, CHARCLASS, RING1]) {
    const res = r.load(read(f), { budget: BUDGET });
    if (!res.ok) throw new Error(`${f}: ${res.diagnostics.join('; ')}`);
  }
  return r;
}

// --- reading terms back out of the store -----------------------------------

type J = any;
const fn = (t: J, name: string): J[] | null =>
  t && t.k === 'f' && t.name === name ? t.args : null;

/** `$cons`-list to array. */
function unlist(t: J): J[] {
  const out: J[] = [];
  for (let c = t; ; ) {
    const a = fn(c, 'cons');
    if (!a) return out;
    out.push(a[0]);
    c = a[1];
  }
}

/** A ROFL string literal's own escaping, undone. MUST MATCH src/parser.ts's
 *  ESCAPES table exactly — this is a second implementation of the same
 *  decision, and the corpus oracle in test/example-ring1.test.ts is what
 *  keeps the two honest. */
const UNESCAPE: ReadonlyMap<string, string> = new Map([
  ['n', '\n'], ['t', '\t'], ['r', '\r'], ['\\', '\\'], ['"', '"'],
]);

function unquote(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\' && i + 1 < raw.length) {
      const r = UNESCAPE.get(raw[i + 1]);
      if (r === undefined) throw new Unsupported(`unknown escape \\${raw[i + 1]}`);
      out += r; i++;
    } else out += raw[i];
  }
  return out;
}

export class Unsupported extends Error {}

/** ring 1 names an operator; the host writes the symbol the kernel uses. */
const OPS: ReadonlyMap<string, string> = new Map([
  ['eq', '='], ['ne', '!='], ['lt', '<'], ['le', '<='], ['gt', '>'], ['ge', '>='],
  ['is', 'is'], ['plus', '+'], ['minus', '-'], ['star', '*'], ['slash', '/'], ['mod', 'mod'],
]);

function term(t: J, src: string, wild: Map<number, number>): Term {
  const at = (a: J[]) => src.slice(a[0].v, a[1].v + 1);
  let a: J[] | null;
  if ((a = fn(t, 'atom'))) return mka(at(a));
  if ((a = fn(t, 'var'))) {
    const name = at(a);
    // A bare `_` is a FRESH variable, numbered per clause, exactly as
    // src/parser.ts numbers it. Reading it as a variable called `_` merges
    // every wildcard in the clause into one and silently adds a join.
    if (name === '_') {
      const n = wild.get(a[0].v);
      if (n === undefined) throw new Unsupported('wildcard without a rank');
      return mkv(`_$${n}`);
    }
    return mkv(name);
  }
  if ((a = fn(t, 'int'))) return mki(parseInt(at(a), 10));
  if ((a = fn(t, 'str'))) return mks(unquote(src.slice(a[0].v + 1, a[1].v)));
  if ((a = fn(t, 'comp'))) {
    return mkf(src.slice(a[0].v, a[1].v + 1), unlist(a[2]).map((x) => term(x, src, wild)));
  }
  if ((a = fn(t, 'op'))) {
    const sym = OPS.get((a[0] as { name: string }).name);
    if (sym === undefined) throw new Unsupported('operator ' + JSON.stringify(a[0]));
    return mkf(sym, [term(a[1], src, wild), term(a[2], src, wild)]);
  }
  throw new Unsupported('term: ' + JSON.stringify(t).slice(0, 60));
}

function lit(t: J, src: string, wild: Map<number, number>): Lit {
  const a = fn(t, 'node');
  if (!a || a.length !== 4) throw new Unsupported('literal');
  const [relT, perspT, argsT, tenseT] = a;
  const ra = fn(relT, 'atom')!;
  const bk = fn(perspT, 'book'), bv = fn(perspT, 'bookvar');
  const span = (x: J[]) => src.slice(x[0].v, x[1].v + 1);
  return {
    rel: span(ra),
    persp: bk ? mka(span(bk)) : bv ? mkv(span(bv)) : mka('main'),
    perspExplicit: !!(bk || bv),
    args: unlist(argsT).map((x) => term(x, src, wild)),
    temporal: (tenseT as { name: string }).name as Lit['temporal'],
  };
}

function bodyElem(t: J, src: string, wild: Map<number, number>): BodyElem {
  let a: J[] | null;
  if ((a = fn(t, 'pos'))) return { t: 'pos', lit: lit(a[0], src, wild) };
  if ((a = fn(t, 'neg'))) return { t: 'neg', lit: lit(a[0], src, wild) };
  if ((a = fn(t, 'bi'))) {
    const sym = OPS.get((a[0] as { name: string }).name);
    if (sym === undefined) throw new Unsupported('builtin ' + JSON.stringify(a[0]));
    return { t: 'bi', op: sym, l: term(a[1], src, wild), r: term(a[2], src, wild) };
  }
  throw new Unsupported('body element');
}

export interface ParseResult {
  clauses: Clause[];
  /** sub-parses the top-level chain rejected — ambiguity as a counted number */
  subparses: number;
  /** parse trees the host could not resolve, by reason */
  unsupported: string[];
  /** byte offsets where the top-level walk stopped; non-empty means the
   *  clause list is a PREFIX and must not be used as the file's content */
  stuck: number[];
}

/** A parse that stopped early. Thrown rather than returned, because the
 *  failure mode being guarded against is a prefix mistaken for a whole file. */
export class IncompleteParse extends Error {
  offsets: number[];
  constructor(offsets: number[], src: string) {
    const at = offsets[0];
    super(`parse stopped at offset ${at}: ${JSON.stringify(src.slice(at, at + 40))}`);
    this.offsets = offsets;
  }
}

/** Parse ROFL source with ring 1 and rebuild host clauses from the ranges. */
export function parse(src: string, r: Rofl = world()): ParseResult {
  const res = r.load(`src(${roflStr(src)}).`, { budget: BUDGET });
  if (!res.ok) throw new Error('source rejected: ' + res.diagnostics.join('; '));
  // A PARTIAL EVALUATION IS NOT A PARSE. Ignoring this return value was the
  // third silent-empty found here: rules/strata.rofl came back with zero
  // clauses, zero stuck and zero uncovered, because the walls were hit before
  // any of those relations was computed. `hole` is the kernel's own word for
  // "this answer is not an answer", and a front end must not paper over it.
  const ev = r.evaluate(BUDGET);
  const holes = r.query('hole(R, Reason)', { budget: BUDGET }).rows.map((x) => x.text);
  if (ev.partial || holes.length) {
    throw new IncompleteParse([0], `evaluation did not finish: ${holes.join('; ') || 'partial'} — `);
  }
  const snap = JSON.parse(r.save());
  const rows = (snap.facts as J[]).filter((f) => f.rel === 'parsed');
  const subparses = (snap.facts as J[]).filter((f) => f.rel === 'subparse').length;
  const stuck = (snap.facts as J[]).filter((f) => f.rel === 'stuck_at')
    .map((f) => f.args[0].v as number).sort((a, b) => a - b);
  // Coverage is the invariant that catches BOTH a walk that stopped and a walk
  // that never started; `stuck` only locates the first kind.
  const uncovered = (snap.facts as J[]).filter((f) => f.rel === 'uncovered')
    .map((f) => f.args[0].v as number).sort((a, b) => a - b);

  const wild = new Map<number, number>();
  for (const f of (snap.facts as J[])) if (f.rel === 'wild') wild.set(f.args[0].v, f.args[1].v);

  const out: Clause[] = [];
  const unsupported: string[] = [];
  for (const f of rows.sort((x, y) => x.args[0].v - y.args[0].v)) {
    const [, , headT, bodyT] = f.args;
    try {
      out.push({ head: lit(headT, src, wild), body: unlist(bodyT).map((b) => bodyElem(b, src, wild)) });
    } catch (e) {
      if (e instanceof Unsupported) unsupported.push(e.message);
      else throw e;
    }
  }
  if (uncovered.length) throw new IncompleteParse(stuck.length ? stuck : uncovered, src);
  return { clauses: out, subparses, unsupported, stuck };
}

export const canon = (cs: Clause[]) => cs.map(canonClause).sort().join('\n');
