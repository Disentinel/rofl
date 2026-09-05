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

/** The three files an image is built from, in the order that builds it. The
 *  ORDER IS PART OF THE RECIPE: measured 2026-09-04, shuffling it changes the
 *  snapshot's bytes while leaving the canonical state identical, because the
 *  `evals` section records HOW the image was built rather than what is in it. */
export const IMAGE_SOURCES = [BOOT, CHARCLASS, RING1];

/** Build the image: ring 1 compiled ahead of time, as an object file.
 *
 *  It is deliberately NOT committed. An image moves the thing a reviewer reads
 *  from a .rofl file to 700 KiB of JSON nobody opens, and this repository has
 *  already recorded that class — so the image stays a CACHE built on demand,
 *  and committing one is a separate decision that needs the gate below to be
 *  standing first. */
export function image(): string {
  return world().save();
}

/** What a reproducibility gate must compare: everything EXCEPT `evals`.
 *
 *  Raw bytes are the wrong oracle and the reason was measured rather than
 *  guessed: `evals` is a log of the load calls, so it differs when the same
 *  three files are loaded in a different order while `facts`, `wits`,
 *  `firings`, `tickLog` and `tick` are byte-identical. A gate on raw bytes
 *  would go red on a reordered list and be switched off. */
export function imageContent(snapshot: string): string {
  const j = JSON.parse(snapshot);
  delete j.evals;
  return JSON.stringify(j);
}

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

/** THE PROMOTER NO LONGER READS THE SOURCE.
 *
 *  Until 2026-09-04 every one of these branches sliced `src` to find out what a
 *  range said, and the host therefore knew TWELVE shapes of this grammar's
 *  tree. `str_sub` and `atom_of` moved that into the rules: a term now arrives
 *  carrying its own name, and what is left here is a copy. That is the
 *  decoupling the tower needed — L0 stopped depending on the levels above it. */
function term(t: J, wild: Map<number, number>): Term {
  let a: J[] | null;
  if ((a = fn(t, 'atom'))) return a[0] as Term;
  if ((a = fn(t, 'var'))) return mkv((a[0] as { v: string }).v);
  if ((a = fn(t, 'wild'))) {
    // A bare `_` is a FRESH variable, numbered per clause exactly as
    // src/parser.ts numbers it; the rank is positional, so this is the one
    // term that still travels as an index.
    const n = wild.get((a[0] as { v: number }).v);
    if (n === undefined) throw new Unsupported('wildcard without a rank');
    return mkv(`_$${n}`);
  }
  if ((a = fn(t, 'int'))) return mki(parseInt((a[0] as { v: string }).v, 10));
  if ((a = fn(t, 'str'))) return mks(unquote((a[0] as { v: string }).v.slice(1, -1)));
  if ((a = fn(t, 'comp'))) {
    return mkf((a[0] as { name: string }).name, unlist(a[1]).map((x) => term(x, wild)));
  }
  if ((a = fn(t, 'op'))) {
    const sym = OPS.get((a[0] as { name: string }).name);
    if (sym === undefined) throw new Unsupported('operator ' + JSON.stringify(a[0]));
    return mkf(sym, [term(a[1], wild), term(a[2], wild)]);
  }
  throw new Unsupported('term: ' + JSON.stringify(t).slice(0, 60));
}

function lit(t: J, wild: Map<number, number>): Lit {
  const a = fn(t, 'node');
  if (!a || a.length !== 4) throw new Unsupported('literal');
  const [relT, perspT, argsT, tenseT] = a;
  const bk = fn(perspT, 'book'), bv = fn(perspT, 'bookvar');
  return {
    rel: (fn(relT, 'atom')![0] as { name: string }).name,
    persp: bk ? (bk[0] as Term) : bv ? mkv((bv[0] as { v: string }).v) : mka('main'),
    perspExplicit: !!(bk || bv),
    args: unlist(argsT).map((x) => term(x, wild)),
    temporal: (tenseT as { name: string }).name as Lit['temporal'],
  };
}

function bodyElem(t: J, wild: Map<number, number>): BodyElem {
  let a: J[] | null;
  if ((a = fn(t, 'pos'))) return { t: 'pos', lit: lit(a[0], wild) };
  if ((a = fn(t, 'neg'))) return { t: 'neg', lit: lit(a[0], wild) };
  if ((a = fn(t, 'bi'))) {
    const sym = OPS.get((a[0] as { name: string }).name);
    if (sym === undefined) throw new Unsupported('builtin ' + JSON.stringify(a[0]));
    return { t: 'bi', op: sym, l: term(a[1], wild), r: term(a[2], wild) };
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

/** Restore ring 1 from an image instead of parsing its source. Measured
 *  2026-09-04: 12.3 ms against 50.5 ms, a factor of 4.1, over 702 KiB. */
export const fromImage = (snapshot: string): Rofl => Rofl.fromSnapshot(snapshot);

/** Split a program at the periods that terminate a clause.
 *
 *  A ROFL fact ends in a period and nothing else in the language contains one
 *  outside a string, so the language is SPLIT BY CONSTRUCTION - recorded on
 *  2026-09-01 and not used until the chart walked into the wall it predicts.
 *  A chart over a whole file ran past fifteen minutes on L2's own source and
 *  was killed; one clause at a time is 14.2 s. The scan is linear and carries
 *  the same three states the grammar's own scanner has. */
export function clauses(src: string): string[] {
  const out: string[] = [];
  let start = 0, i = 0;
  let st: 'code' | 'str' | 'cmt' = 'code';
  while (i < src.length) {
    const c = src[i];
    if (st === 'code') {
      if (c === '"') st = 'str';
      else if (c === '-' && src[i + 1] === '-') st = 'cmt';
      else if (c === '.') { out.push(src.slice(start, i + 1)); start = i + 1; }
    } else if (st === 'str') {
      if (c === '\\') i++; else if (c === '"') st = 'code';
    } else if (c === '\n') st = 'code';
    i++;
  }
  if (src.slice(start).trim()) out.push(src.slice(start));
  return out.filter((p) => p.trim());
}

/** Parse a whole file: split it, and parse each clause in a world restored
 *  from one image. The image earns its keep here and nowhere else - measured
 *  over L2's own source, 18.4 s rebuilding the world per clause against 14.2 s
 *  restoring it, a saving of 22%. */
export function parseFile(src: string, img: string = image()): ParseResult {
  const out: Clause[] = [];
  let subparses = 0;
  const unsupported: string[] = [], stuck: number[] = [];
  let at = 0;
  for (const part of clauses(src)) {
    const got = parse(part, fromImage(img));
    out.push(...got.clauses);
    subparses += got.subparses;
    unsupported.push(...got.unsupported);
    at += part.length;
  }
  return { clauses: out, subparses, unsupported, stuck };
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
  // READ THE RELATION, NOT THE WORLD. This was `JSON.parse(r.save())` and one
  // filter per relation over every fact in the store; measured 2026-09-05, the
  // snapshot alone was 38.7 ms of a 108.5 ms clause — the single largest
  // removable term in the parse, and larger than the fixpoint it reports on.
  // The store's own read gives the same facts with their arguments as terms,
  // and `termToJson` is structure-preserving — `{k:'f',name,args}` for a
  // functor either way — so the readers below are unchanged.
  const facts = (rel: string): J[] => r.store.relAll(rel);
  const rows = facts('parsed');
  const subparses = facts('subparse').length;
  const stuck = facts('stuck_at').map((f) => f.args[0].v as number).sort((a, b) => a - b);
  // Coverage is the invariant that catches BOTH a walk that stopped and a walk
  // that never started; `stuck` only locates the first kind.
  const uncovered = facts('uncovered').map((f) => f.args[0].v as number).sort((a, b) => a - b);

  const wild = new Map<number, number>();
  for (const f of facts('wild')) wild.set(f.args[0].v, f.args[1].v);

  const out: Clause[] = [];
  const unsupported: string[] = [];
  for (const f of rows.sort((x, y) => x.args[0].v - y.args[0].v)) {
    const [, , headT, bodyT] = f.args;
    try {
      out.push({ head: lit(headT, wild), body: unlist(bodyT).map((b) => bodyElem(b, wild)) });
    } catch (e) {
      if (e instanceof Unsupported) unsupported.push(e.message);
      else throw e;
    }
  }
  if (uncovered.length) throw new IncompleteParse(stuck.length ? stuck : uncovered, src);
  return { clauses: out, subparses, unsupported, stuck };
}

export const canon = (cs: Clause[]) => cs.map(canonClause).sort().join('\n');
