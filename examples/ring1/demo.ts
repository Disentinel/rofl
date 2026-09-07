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
import { type Term, canonTerm, mka, mkv, mki, mks, mkf } from '../../src/unify.ts';
import { escapeString, type Clause, type Lit, type BodyElem } from '../../src/parser.ts';
import { V, canonClause, unreifyTerm, SEALED_REASON } from '../../src/reflect.ts';
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

/** The files an image is built from, in the order that builds it. The ORDER IS
 *  PART OF THE RECIPE: measured 2026-09-04, shuffling it changes the snapshot's
 *  bytes while leaving the canonical state identical, because the `evals`
 *  section records HOW the image was built rather than what is in it.
 *
 *  boot.rofl IS NOT AMONG THEM. The grammar reads none of its relations — the
 *  audits, the stratum table and the inquiry vocabulary are about programs, and
 *  this world's only program is a parser. Measured 2026-09-05, arms interleaved
 *  in one process: 88.5 ms a clause with it and 80.4 without, 9.1%, and the
 *  parse is byte-identical either way. It is still loaded by `world()`, which
 *  is what the tower's own gates read, so nothing that audits the grammar loses
 *  its subject. */
export const IMAGE_SOURCES = [CHARCLASS, RING1];

/** Build the image: ring 1 compiled ahead of time, as an object file.
 *
 *  It is deliberately NOT committed. An image moves the thing a reviewer reads
 *  from a .rofl file to 700 KiB of JSON nobody opens, and this repository has
 *  already recorded that class — so the image stays a CACHE built on demand,
 *  and committing one is a separate decision that needs the gate below to be
 *  standing first. */
export function image(): string {
  const r = new Rofl({ reuse: false });
  for (const f of IMAGE_SOURCES) {
    const res = r.load(read(f), { budget: BUDGET });
    if (!res.ok) throw new Error(`${f}: ${res.diagnostics.join('; ')}`);
  }
  return r.save();
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
  // REUSE OFF, AND IT IS NOT A TUNING KNOB HERE. `fromImage` below has always
  // passed it; this world did not, and the difference was measured on
  // 2026-09-06: one clause costs 217 ms with the cache and 42 ms without, for
  // 639 FIRINGS EITHER WAY and a store of 3737 FACTS EITHER WAY. The cache
  // saves nothing on a parse because the source characters change and every
  // relation is downstream of them, so every fingerprint misses -- and a miss
  // still pays for the fingerprint, which materialises each relation whole
  // (`store.relAll` costs 84 us on 1000 facts and 6361 us on 40000).
  // rules/parse-cost.rofl derives the whole chain; `npm run whyslow` prints it.
  const r = new Rofl({ reuse: false });
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

/** WHAT THE HOST STILL KNOWS ABOUT THIS GRAMMAR IS SIX LEAF SHAPES, and they
 *  are exactly the terms the LANGUAGE FORBIDS A RULE TO BUILD.
 *
 *  Ring 1 now emits the kernel's own reflected vocabulary for everything
 *  structural — `$lit`, `$not`, `$builtin`, `$cons`, `$nil`, `$var` — so the
 *  promoter no longer knows `node`, `pos`, `neg`, `bi`, `cons`, `book`,
 *  `bookvar`, `var` or `atom`. Nine shapes gone.
 *
 *  THE SIX THAT REMAIN CANNOT GO, and that is a measurement rather than a plan
 *  for later: a functor whose name is a variable is a SYNTAX ERROR, there is no
 *  univ (every non-arithmetic operation is a destructor), joining two strings
 *  is `arith_type_error`, and `_$0` is a concatenation. Building a term out of
 *  a name and a list is a CONSTRUCTOR, and the finiteness proof is what forbids
 *  it — the same principle that bans concatenation. So the residue is
 *  principled: `comp` and `op` need a functor built from a name, `str` needs an
 *  unescaped string built from an escaped one, `int` and `negint` need a number
 *  built from digits, and `wild` needs a name built from a rank. */
const LEAVES = ['comp', 'op', 'str', 'int', 'negint', 'wild'] as const;

/** Replace this grammar's six leaves with real terms. Everything else in the
 *  tree is already the kernel's reified form, so `unreifyTerm` finishes it. */
function leaf(t: J, wild: Map<number, number>): Term {
  let a: J[] | null;
  if ((a = fn(t, 'wild'))) {
    // A bare `_` is a FRESH variable, numbered per clause exactly as
    // src/parser.ts numbers it; the rank is positional, so this is the one
    // term that still travels as an index.
    const n = wild.get((a[0] as { v: number }).v);
    if (n === undefined) throw new Unsupported('wildcard without a rank');
    return mkv(`_$${n}`);
  }
  if ((a = fn(t, 'int'))) return mki(parseInt((a[0] as { v: string }).v, 10));
  // The digits arrive without their sign, so the host applies it: the text of
  // the whole span would break on `- 1`, which the host reads as -1.
  if ((a = fn(t, 'negint'))) return mki(-parseInt((a[0] as { v: string }).v, 10));
  if ((a = fn(t, 'str'))) return mks(unquote((a[0] as { v: string }).v.slice(1, -1)));
  if ((a = fn(t, 'comp'))) {
    return mkf((a[0] as { name: string }).name, unlistK(a[1]).map((x) => term(x, wild)));
  }
  if ((a = fn(t, 'op'))) {
    // The SYMBOL travels now, not a name for it, so the table of names the host
    // used to keep is gone: ring 1 reads the operator's text with `str_sub`.
    return mkf((a[0] as { v: string }).v, [term(a[1], wild), term(a[2], wild)]);
  }
  throw new Unsupported('term: ' + JSON.stringify(t).slice(0, 60));
}

function term(t: J, wild: Map<number, number>): Term {
  for (const k of LEAVES) if (fn(t, k)) return leaf(t, wild);
  // `$var` AT THE TOP MEANS RING 1 SAYS VARIABLE, and it does not collide with
  // a source term that happens to be written `$var("X")`: that one arrives
  // through the compound production as `comp`, because the grammar reads it as
  // a functor with an argument. The kernel's non-injective `reifyTerm` is the
  // reason this distinction has to be made here rather than assumed away.
  if (fn(t, '$var')) return unreifyTerm(t as Term);
  if (t && t.k === 'f') return mkf(t.name, (t.args as J[]).map((x) => term(x, wild)));
  return t as Term;
}

/** `$cons`/`$nil` to an array. The kernel's own `unlist` does this, and it is
 *  re-implemented here for one reason: it takes a `Term` and these trees carry
 *  the six leaf shapes until `term` has run over them. */
function unlistK(t: J): J[] {
  const out: J[] = [];
  for (let c = t; c && c.k === 'f' && c.name === '$cons'; c = c.args[1]) out.push(c.args[0]);
  return out;
}

/** `$lit(Rel, Persp, Args, Tense)`, with ONE convention the reified form has no
 *  room for: `$bare` where no `[book]` was written. The kernel's own `$lit`
 *  cannot carry it — `unreifyLit` sets `perspExplicit: true` unconditionally,
 *  which is right for a rule read back out of the store, since resolution has
 *  already happened by then. Here it has not, and `resolveBook` reads the bit:
 *  a kernel-book relation written WITHOUT a bracket is moved to `$kernel`, one
 *  written `[main]` is left alone and reported. `canonClause` does not print
 *  the bit, so the corpus oracle cannot see it — hence the separate gate. */
function lit(t: J, wild: Map<number, number>): Lit {
  const a = fn(t, '$lit');
  if (!a || a.length !== 4) throw new Unsupported('literal');
  const [relT, perspT, argsT, tenseT] = a;
  const bare = perspT && perspT.k === 'a' && perspT.name === '$bare';
  return {
    rel: (relT as { name: string }).name,
    persp: bare ? mka('main') : term(perspT, wild),
    perspExplicit: !bare,
    args: unlistK(argsT).map((x) => term(x, wild)),
    temporal: (tenseT as { name: string }).name.slice(1) as Lit['temporal'],
  };
}

function bodyElem(t: J, wild: Map<number, number>): BodyElem {
  let a: J[] | null;
  if ((a = fn(t, '$not'))) return { t: 'neg', lit: lit(a[0], wild) };
  if ((a = fn(t, '$builtin'))) {
    const [l, r] = unlistK(a[1]);
    const op = (a[0] as { v: string }).v as (BodyElem & { t: 'bi' })['op'];
    return { t: 'bi', op, l: term(l, wild), r: term(r, wild) };
  }
  return { t: 'pos', lit: lit(t, wild) };
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
/** `reuse` is OFF: the source fact changes on every clause, so every relation
 *  downstream of it is refingerprinted and the plan buys nothing it does not
 *  first pay for. Measured 3.7% of a clause. */
export const fromImage = (snapshot: string): Rofl =>
  Rofl.fromSnapshot(snapshot, { reuse: false });

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
  let code = false;   // has anything in CODE state been seen since `start`?
  let st: 'code' | 'str' | 'cmt' = 'code';
  while (i < src.length) {
    const c = src[i];
    if (st === 'code') {
      if (c === '"') { st = 'str'; code = true; }
      else if (c === '-' && src[i + 1] === '-') { st = 'cmt'; i++; }
      else if (c === '.') { out.push(src.slice(start, i + 1)); start = i + 1; code = false; }
      else if (c !== ' ' && c !== '\t' && c !== '\r' && c !== '\n') code = true;
    } else if (st === 'str') {
      if (c === '\\') i++; else if (c === '"') st = 'code';
    } else if (c === '\n') st = 'code';
    i++;
  }
  // A TAIL WITH NO TERMINATING PERIOD IS TWO DIFFERENT THINGS and the first
  // version pushed both. An unfinished clause must be handed on, so the parse
  // refuses and says where; a tail of COMMENTS AND WHITESPACE must be dropped,
  // because it is not a clause and the file did not end mid-sentence.
  //
  // MEASURED: boot.rofl ends with a comment block, and the splitter reported 29
  // parts against the host parser's 28 clauses. Found by sweeping the whole
  // corpus instead of the files at or under 2.5 KiB — the cap that existed for
  // speed was also hiding this.
  if (code) out.push(src.slice(start));
  return out;
}

/** Parse a whole file: split it, and parse each clause in a world restored
 *  from one image. The image earns its keep here and nowhere else - measured
 *  over L2's own source, 18.4 s rebuilding the world per clause against 14.2 s
 *  restoring it, a saving of 22%.
 *
 *  RESTORED ONCE, FORKED PER CLAUSE. This called `fromImage(img)` in the loop,
 *  which re-parsed 545 KiB of JSON and re-`add`ed 2453 facts for every clause
 *  of the file, to arrive at the same world every time. The image is a
 *  constant, so the world it names is one world and each clause needs a COPY
 *  of it. Measured 2026-09-07 on the ring 1 image: `fromImage` 3.09 ms, of
 *  which `JSON.parse` alone is 1.71, against 0.20 ms for `fork`. The two are
 *  the same world by both oracles the repository owns -- `canonicalState` and
 *  `snapshot` are byte-identical.
 *
 *  AND THE ARRIVAL-ORDER HALF OF THAT SENTENCE CITED THE WRONG INSTRUMENT. It
 *  read: `allFactKeys` agrees element for element, which is the arrival order
 *  the fork was taught to preserve. It does agree, and it says NOTHING about
 *  order -- `allFactKeys()` is `[...facts.keys()].sort()`. Measured 2026-09-07
 *  with a mutant that fills the clone's fact map in reverse: every
 *  `allFactKeys` comparison in this repository slept through it, and
 *  `allFacts()`, which is documented as arrival order and deliberately
 *  unsorted, killed it at once. The gate that states the property now lives in
 *  test/example-ring1.test.ts and reads `allFacts()`. */
export function parseFile(src: string, img: string = image()): ParseResult {
  const out: Clause[] = [];
  let subparses = 0;
  const unsupported: string[] = [], stuck: number[] = [];
  let at = 0;
  const base = fromImage(img);
  for (const part of clauses(src)) {
    const got = parse(part, base.fork());
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
  //
  // AND `ev.partial` DOES NOT SUBSUME IT. Measured 2026-09-07 with a positive
  // control -- `q(7).  p(X) :- q(Y), X is str_len(Y).` -- which finishes its
  // fixpoint, returns `partial: false`, and leaves
  // `hole($rule(...), str_type_error)` standing. An `is` that cannot be
  // evaluated is an INABILITY, not a wall, so the evaluator records it and
  // carries on; a front end reading only `partial` would report an empty parse
  // for a grammar rule that silently failed. The check stays.
  //
  // ASK THE STORE, NOT THE EVALUATOR. This was `r.query('hole(R, Reason)')`,
  // and the query is the same answer at 300x the price: `Rofl.query` builds a
  // FRESH `Evaluation` for every call, and that constructor decodes all 140
  // rules out of the reflection and re-runs `planBody` over every body before
  // it looks at a single fact. Measured 2026-09-07, arms interleaved ABAB in
  // one process over a finished clause: query 0.676 ms median, `relAll` 0.002
  // -- 5.3% of a clause here, 11% on the machine the stage split was taken on.
  // The match cost NOTHING either way; `hole` is empty and `matchPremise` over
  // it timed at 0.00 ms. The saving is the evaluator that was never needed.
  const ev = r.evaluate(BUDGET);
  // A STANDING REFUSAL IS NOT A FAILED EVALUATION, and the two are one
  // relation. `ring1.rofl` seals its own rule reflection, so this world carries
  // `hole($sealed(rules), reflection_sealed)` from load onward; read
  // unfiltered, every parse in this file would refuse itself. Filtering by
  // REASON is what keeps the check alive rather than switching it off: the
  // seven reasons that mean the kernel could not finish still stop a parse, and
  // the one that means the program declined to keep something does not.
  //
  // THE PRICE IS NAMED: a check that filters is weaker than one that does not,
  // and the standing hole makes every `is there a hole` test in this world
  // trivially true. That is why the reason atom is load-bearing and not
  // decoration -- without it the two sentences are indistinguishable.
  const holes = r.store.relAll(V.hole)
    .filter((f) => !(f.args[1].k === 'a' && f.args[1].name === SEALED_REASON))
    .map((f) => f.args.map(canonTerm).join(' '));
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
  // A CHARACTER THAT MAKES NO TOKEN is invisible to `uncovered`, which
  // quantifies over token starts. `stray` states the same invariant over
  // characters, and it is what refuses `p({a}).` — which ring 1 used to parse
  // to `p[main](a)@now` while src/parser.ts refused it.
  const stray = facts('stray').map((f) => f.args[0].v as number).sort((a, b) => a - b);

  const wild = new Map<number, number>();
  for (const f of facts('wild')) wild.set(f.args[0].v, f.args[1].v);

  const out: Clause[] = [];
  const unsupported: string[] = [];
  for (const f of rows.sort((x, y) => x.args[0].v - y.args[0].v)) {
    const [, , headT, bodyT] = f.args;
    try {
      out.push({ head: lit(headT, wild), body: unlistK(bodyT).map((b) => bodyElem(b, wild)) });
    } catch (e) {
      if (e instanceof Unsupported) unsupported.push(e.message);
      else throw e;
    }
  }
  if (uncovered.length || stray.length) {
    throw new IncompleteParse(stuck.length ? stuck : uncovered.length ? uncovered : stray, src);
  }
  return { clauses: out, subparses, unsupported, stuck };
}

export const canon = (cs: Clause[]) => cs.map(canonClause).sort().join('\n');
