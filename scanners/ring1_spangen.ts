// scanners/ring1_spangen.ts — THE TOKEN SPANS OF ring1, AS RUST.
//
//   node --experimental-strip-types scanners/ring1_spangen.ts [--out FILE]
//
// The fourth layer compiled from the rules, after the automaton
// (`ring1_lexgen.ts`) and the single-index predicates (`ring1_predgen.ts`).
// This one takes the relations that span a RANGE of characters — `punct`,
// `neck`, `op2`, `arithtok`, `word`, `strtok` and the `tok` union above them.
//
// IT IS NOT A CHART PARSER AND THE RULES SAY SO. Reading them rather than
// assuming, the whole token layer is three shapes:
//
//   FIXED    every position is at a known offset from the start —
//            `neck(I, J) :- kind(I, colon), J is I + 1, kind(J, dash).`
//   WHILE    self-recursive, extending one position at a time under a guard —
//            `wext(I, I) :- word_start(I).`
//            `wext(I, J2) :- wext(I, J), J2 is J + 1, wordch(J2).`
//   FIRST    the end is the nearest position satisfying a test, which is what
//            `not close_between(I, J)` says: `close_between` holds when there
//            is an EARLIER close, so excluding it selects the first one.
//
// Anything else is REFUSED with the clause named. That rule has paid three
// times in this family: it found the host boundary the README declares, it
// drew the line between the predicate and span layers without anybody drawing
// it, and when the emitted set was not closed over its dependencies the Rust
// compiler said so — which is a refusal arriving too late to be one.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseProgram } from '../src/parser.ts';
import type { Clause, Term } from '../src/unify.ts';

const REPO = fs.realpathSync(new URL('..', import.meta.url).pathname);
const read = (p: string): string => fs.readFileSync(path.join(REPO, p), 'utf8');
const vn = (t: Term | undefined): string | null => {
  const x = t as unknown as { k?: string; name?: unknown };
  return x && x.k === 'v' ? String(x.name) : null;
};
const an = (t: Term | undefined): string | null => {
  const x = t as unknown as { k?: string; name?: unknown };
  return x && x.k === 'a' ? String(x.name) : null;
};

export type Test =
  | { t: 'kind'; off: number; kind: string }
  /** A character compared with a LITERAL: `ch(I, "i")`. The keywords are
   *  spelled out this way rather than sliced out of the source —
   *  `kw_is(I) :- word(I, J), J is I + 1, ch(I, "i"), ch(J, "s")` — so the text
   *  of a token is NOT needed to read them, which is the opposite of what I
   *  predicted before looking. The rules were simpler than the plan. */
  | { t: 'char'; off: number; ch: string }
  | { t: 'state'; off: number; state: string }
  | { t: 'pred'; off: number; rel: string }
  | { t: 'not'; x: Test };

export type Shape =
  | { s: 'fixed'; end: number; tests: Test[]; value: string | null }
  | { s: 'while'; seed: Test[]; step: Test[]; stopAfter: boolean; value: string | null }
  | { s: 'first'; open: Test[]; close: Test[]; value: string | null };

export interface SpanRel { rel: string; arity: number; shapes: Shape[] }
export interface Refusal { where: string; why: string }

const SKIP = new Set(['at', 'len', 'src']);
/** HOST-PROVIDED, and the span IR named them before this file existed:
 *  `ch(I, C) :- at(I), src(S), C is str_char(S, I)` is a character read and
 *  `kind(I, K) :- ch(I, C), cls(C, K)` its classification, both of which the
 *  generated Rust already has as `kind_of`. Trying to DERIVE them is the
 *  mistake — they are the host boundary
 *  (f_the_generator_found_the_host_boundary_by_refusing_to_guess), and a
 *  generator that does not know what it is given will refuse what it was
 *  handed. */
const HOST = new Set(['ch', 'kind', 'cls']);
/** Predicates the previous layer already emits. */
const PREDS = new Set(['opens_str', 'opens_cmt', 'code_at', 'str_open', 'str_close',
  'wordch', 'prevword', 'dollar_before', 'word_start', 'white']);

function offsets(c: Clause, idx: string): Map<string, number> {
  const m = new Map<string, number>([[idx, 0]]);
  const links: { lhs: string; base: string; d: number }[] = [];
  for (const b of c.body) {
    if (b.t !== 'bi' || b.op !== 'is') continue;
    const lhs = vn(b.l);
    const r = b.r as unknown as { k?: string; name?: string; args?: Term[] };
    if (!lhs || r.k !== 'f' || (r.name !== '+' && r.name !== '-')) continue;
    const base = vn(r.args![0]);
    const n = r.args![1] as unknown as { k?: string; v?: unknown };
    if (base === null || n.k !== 'i') continue;
    links.push({ lhs, base, d: Number(n.v) * (r.name === '-' ? -1 : 1) });
  }
  for (let p = 0; p <= links.length; p++) {
    let moved = false;
    for (const l of links) {
      if (m.has(l.base) && !m.has(l.lhs)) { m.set(l.lhs, m.get(l.base)! + l.d); moved = true; }
      else if (m.has(l.lhs) && !m.has(l.base)) { m.set(l.base, m.get(l.lhs)! - l.d); moved = true; }
    }
    if (!moved) break;
  }
  return m;
}

/** One body literal as a test, or null when it is not one. */
function asTest(rel: string, negated: boolean, args: Term[], off: Map<string, number>): Test | null {
  const at = off.get(vn(args[0]) ?? '');
  if (at === undefined) return null;
  let x: Test | null = null;
  if (rel === 'kind') { const k = an(args[1]); if (k) x = { t: 'kind', off: at, kind: k }; }
  else if (rel === 'ch') {
    const lit = args[1] as unknown as { k?: string; v?: unknown };
    if (lit && lit.k === 's') x = { t: 'char', off: at, ch: String(lit.v) };
  }
  else if (rel === 'st') { const s = an(args[1]); if (s) x = { t: 'state', off: at, state: s }; }
  else if (args.length === 1 && PREDS.has(rel)) x = { t: 'pred', off: at, rel };
  if (!x) return null;
  return negated ? { t: 'not', x } : x;
}

export type Step =
  /** `frame` names WHICH known position the offset is relative to: 0 is where
   *  the production started, 1 is after the first consume, and so on. A test
   *  may look BACK — `identtok(I, J) :- word(I, J), kind(I, lower)` tests the
   *  START after the cursor has moved to the end — so one frame is not enough
   *  and keeping only the current one made ordinary clauses unreadable. */
  | { k: 'test'; frame: number; off: number; test: Test }
  | { k: 'consume'; rel: string; args: (string | null)[] }
  /** Advance to the NEAREST later position where `test` holds. This is what a
   *  clause encodes when it tests the head's END and excludes an earlier one:
   *  `strtok(I, J) :- str_open(I), str_close(J), I < J, not close_between(I, J)`
   *  where `close_between` holds if some close lies strictly between. Without
   *  the exclusion the clause would admit EVERY later close, so the negated
   *  companion is required and its absence is a refusal rather than a guess. */
  | { k: 'search'; test: Test }
  /** A relation over ONE position that carries a VALUE — `punct(I, lpar) :-
   *  kind(I, lpar), code_at(I)`. It tests the position and binds the value
   *  without moving the cursor, which is why `tok(I, I) :- punct(I, K)` has a
   *  zero-width span. The predicate layer emits booleans and cannot hold it. */
  | { k: 'valued'; rel: string }
  /** `consumed(J) :- op2(I, J, Op)` — a single position is interesting when
   *  SOME span of a relation touches it. An existential projection, and the
   *  sixth shape this layer needed. Each was read out of the rules when a
   *  refusal named it, never chosen in advance. */
  | { k: 'projected'; rel: string; end: boolean };

export type Prod =
  | { p: 'chain'; steps: Step[]; endOff: number | null; value: string | null }
  | { p: 'while'; seedRel: string | null; step: Test[]; value: string | null };

export interface SpanRel2 { rel: string; arity: number; prods: Prod[] }
export interface ValuedRel { rel: string; cases: { tests: Test[]; value: string }[] }

/** Relations of the form `R(I, <atom>)` whose every clause is tests at known
 *  offsets. Extracted before the spans, because a span may consume one. */
function valuedRels(prog: Clause[], byHead: Map<string, { c: Clause; i: number }[]>): Map<string, ValuedRel> {
  const out = new Map<string, ValuedRel>();
  for (const [rel, cs] of byHead) {
    if (cs.length === 0) continue;
    const cases: { tests: Test[]; value: string }[] = [];
    let ok = true;
    for (const { c } of cs) {
      const a = c.head.args;
      const I = vn(a[0]);
      const v = a.length === 2 ? an(a[1]) : null;
      if (c.body.length === 0 || I === null || v === null) { ok = false; break; }
      const off = offsets(c, I);
      const tests: Test[] = [];
      for (const b of c.body) {
        if (b.t === 'bi' || SKIP.has(b.lit.rel)) continue;
        const t = asTest(b.lit.rel, b.t === 'neg', b.lit.args, off);
        if (!t) { ok = false; break; }
        tests.push(t);
      }
      if (!ok) break;
      cases.push({ tests, value: v });
    }
    if (ok && cases.length) out.set(rel, { rel, cases });
  }
  return out;
}

/** A production is a CHAIN: walk the body in written order, keeping a cursor.
 *  A premise either TESTS a position at a known offset, or CONSUMES a span of a
 *  relation that is already expressible and moves the cursor to its end. The
 *  end of the head must be where the cursor lands, or at a known offset from I.
 *
 *  BUILT UP TO A FIXPOINT. `tok` cannot be expressed until `word` is, and
 *  `optok` not until `op2` — so the pass repeats while it keeps adding
 *  relations. That is the mirror of the predicate layer, which closes DOWN by
 *  dropping anything reading what it refused; here it closes UP. */
export function extract(): { rels: SpanRel2[]; refused: Refusal[]; valued: ValuedRel[];
                             projected: { rel: string; of: string; end: boolean }[] } {
  const prog = parseProgram(read('examples/ring1/ring1.rofl'));
  const byHead = new Map<string, { c: Clause; i: number }[]>();
  for (const [i, c] of prog.entries()) {
    if (!byHead.has(c.head.rel)) byHead.set(c.head.rel, []);
    byHead.get(c.head.rel)!.push({ c, i });
  }
  const valued = valuedRels(prog, byHead);
  /** rel -> [span relation, true when the projection is onto the span's END] */
  const projected = new Map<string, { of: string; end: boolean }>();
  const done = new Map<string, SpanRel2>();
  let refused: Refusal[] = [];

  for (let pass = 0; pass < 12; pass++) {
    const before = done.size;
    refused = [];
    // projections become available as their span does
    for (const [rel, cs] of byHead) {
      if (projected.has(rel) || cs.length !== 1) continue;
      const c = cs[0]!.c;
      const a = c.head.args;
      if (a.length !== 1 || vn(a[0]) === null || c.body.length !== 1) continue;
      const b = c.body[0]!;
      if (b.t !== 'pos' || !done.has(b.lit.rel) || b.lit.args.length < 2) continue;
      const X = vn(a[0]);
      const at0 = vn(b.lit.args[0]), at1 = vn(b.lit.args[1]);
      if (X === at1) projected.set(rel, { of: b.lit.rel, end: true });
      else if (X === at0) projected.set(rel, { of: b.lit.rel, end: false });
    }
    for (const [rel, cs] of byHead) {
      if (done.has(rel) || HOST.has(rel) || projected.has(rel)) continue;
      // A SINGLE-INDEX RELATION IS A DEGENERATE SPAN — start and end the same
      // position, no cursor movement. Treating them separately was a scaffold
      // that stopped paying: the dependency graph is NOT layered, it is mutual.
      // `kw_is(I) :- word(I, J), ...` is a predicate that consumes a span, and
      // `tok(I, I) :- punct(I, K)` is a span that reads a predicate. One
      // generator over all of them, and the layering falls out instead of
      // being imposed.
      const heads = cs.filter(({ c }) => c.body.length > 0 && c.head.args.length >= 1
        && vn(c.head.args[0]) !== null
        && (c.head.args.length === 1 || vn(c.head.args[1]) !== null));
      if (heads.length === 0 || heads.length !== cs.length) continue;

      const prods: Prod[] = [];
      let stop: Refusal | null = null;
      for (const { c, i } of heads) {
        const where = `ring1.rofl#${i} ${rel}/${c.head.args.length}`;
        const I = vn(c.head.args[0])!;
        const J = c.head.args.length >= 2 ? vn(c.head.args[1])! : I;
        const off = offsets(c, I);
        const value = c.head.args.length >= 3 ? an(c.head.args[2]) : null;

        const selfRead = c.body.find((b) => b.t === 'pos' && b.lit.rel === rel);
        if (selfRead) {
          const cursor = vn((selfRead as { lit: { args: Term[] } }).lit.args[1]);
          const stepOff = cursor ? offsets(c, cursor) : off;
          const step: Test[] = [];
          let bad = false;
          for (const b of c.body) {
            if (b.t === 'bi' || (b.t === 'pos' && b.lit.rel === rel) || SKIP.has(b.lit.rel)) continue;
            const t = asTest(b.lit.rel, b.t === 'neg', b.lit.args, stepOff);
            if (!t) { bad = true; break; }
            step.push(t);
          }
          if (bad) { stop = { where, why: 'a self-extending clause whose guard is not a test' }; break; }
          prods.push({ p: 'while', seedRel: null, step, value });
          continue;
        }

        // THE OFFSETS MOVE WITH THE CURSOR. A test after a consume is relative
        // to where the consumed span ENDED, not to where the production began,
        // and the end is only known at run time. The first draft kept one map
        // anchored at I, so `word(I, J) :- wext(I, J), J2 is J + 1,
        // not wordch(J2)` lost `J2` — J is bound by the consumed span. That is
        // the FOURTH time today a tool reported its own frame as a property of
        // the rules: a classifier with four populations, an offset solver that
        // read one direction, a loop guard anchored at the start, and now this.
        // EVERY ANCHOR IS KEPT, NOT JUST THE CURRENT ONE. This is the fifth
        // time today the tool reported its own frame as a property of the
        // rules: a classifier with four populations, an offset solver reading
        // one direction, a loop guard at the start instead of the cursor, one
        // map for a whole chain, and now a chain that could not look back at a
        // position it had already passed.
        let cur = I;
        const frames: { v: string; off: Map<string, number> }[] = [{ v: I, off }];
        let curOff = off;
        const steps: Step[] = [];
        let bad: string | null = null;
        for (const b of c.body) {
          if (b.t === 'bi') continue;
          if (SKIP.has(b.lit.rel)) continue;
          const a0 = vn(b.lit.args[0]);
          const a1 = b.lit.args.length >= 2 ? vn(b.lit.args[1]) : null;
          if (b.t === 'pos' && done.has(b.lit.rel) && a0 !== null && a1 !== null && a0 !== a1) {
            if (curOff.get(a0) === undefined) { bad = `\`${b.lit.rel}\` starts where the cursor is not`; break; }
            steps.push({ k: 'consume', rel: b.lit.rel, args: b.lit.args.slice(2).map(an) });
            cur = a1;
            curOff = offsets(c, cur);
            frames.push({ v: cur, off: curOff });
            continue;
          }
          // resolve the test against ANY frame, newest first
          let placed = false;
          for (let fi = frames.length - 1; fi >= 0 && !placed; fi--) {
            const t = asTest(b.lit.rel, b.t === 'neg', b.lit.args, frames[fi]!.off);
            if (t) { steps.push({ k: 'test', frame: fi, off: 0, test: t }); placed = true; }
          }
          if (placed) continue;
          // AN EXPRESSIBLE DEGENERATE SPAN IS A TEST. `kw_is/1` is a span in
          // this generator's own terms — start and end the same position — and
          // `optok(I, J, is) :- kw_is(I), word(I, J)` asks it as a test. Once
          // the layers merged, a relation could be expressible and still
          // unusable purely because of which table it was filed under.
          if (a0 !== null && curOff.get(a0) !== undefined && b.lit.args.length === 1
              && done.has(b.lit.rel)) {
            const base: Test = { t: 'pred', off: curOff.get(a0)!, rel: b.lit.rel };
            steps.push({ k: 'test', frame: frames.length - 1, off: 0,
              test: b.t === 'neg' ? { t: 'not', x: base } : base });
            continue;
          }
          // a projection of an expressible span onto one position
          if (a0 !== null && curOff.get(a0) !== undefined && projected.has(b.lit.rel)
              && b.lit.args.length === 1) {
            const pj = projected.get(b.lit.rel)!;
            steps.push({ k: 'test', frame: frames.length - 1, off: 0,
              test: (b.t === 'neg'
                ? { t: 'not', x: { t: 'pred', off: curOff.get(a0)!, rel: b.lit.rel } }
                : { t: 'pred', off: curOff.get(a0)!, rel: b.lit.rel }) });
            void pj;
            continue;
          }
          // host-provided: the generated Rust answers it directly
          if (b.t === 'pos' && HOST.has(b.lit.rel) && a0 !== null && curOff.get(a0) !== undefined) {
            steps.push({ k: 'valued', rel: b.lit.rel });
            continue;
          }
          // a valued single-index relation: tests the position, binds a value,
          // and leaves the cursor where it was
          if (b.t === 'pos' && valued.has(b.lit.rel) && a0 !== null && curOff.get(a0) !== undefined
              && b.lit.args.length === 2 && an(b.lit.args[1]) === null) {
            steps.push({ k: 'valued', rel: b.lit.rel });
            continue;
          }
          // SEARCH: a positive test on the head's END, which no offset can
          // reach because the end is what the clause is looking for.
          if (b.t === 'pos' && a0 === J && b.lit.args.length === 1 && PREDS.has(b.lit.rel)) {
            const excludes = c.body.some((x) => x.t === 'neg' && x.lit.args.length >= 2
              && vn(x.lit.args[0]) === I && vn(x.lit.args[1]) === J);
            if (!excludes) { bad = `\`${b.lit.rel}(${J})\` searches for an end with nothing excluding an earlier one`; break; }
            steps.push({ k: 'search', test: { t: 'pred', off: 0, rel: b.lit.rel } });
            cur = J; curOff = offsets(c, J);
            continue;
          }
          // the negated companion of a search is consumed by it
          if (b.t === 'neg' && b.lit.args.length >= 2 && vn(b.lit.args[0]) === I && vn(b.lit.args[1]) === J
              && steps.some((x) => x.k === 'search')) continue;
          bad = `premise \`${b.lit.rel}/${b.lit.args.length}\` is neither a test nor an expressible span`;
          break;
        }
        if (bad) { stop = { where, why: bad }; break; }
        const endOff = J === cur ? null : (curOff.get(J) ?? null);
        if (endOff === null && J !== cur) { stop = { where, why: 'the end of the span is neither the cursor nor at a known offset' }; break; }
        prods.push({ p: 'chain', steps, endOff, value });
      }
      if (stop) { refused.push(stop); continue; }
      if (prods.length) done.set(rel, { rel, arity: heads[0]!.c.head.args.length, prods });
    }
    if (done.size === before) break;
  }
  return { rels: [...done.values()], refused, valued: [...valued.values()],
           projected: [...projected.entries()].map(([rel, v]) => ({ rel, ...v })) };
}

function main(): void {
  const { rels, refused, valued, projected } = extract();
  console.log(`${rels.length} span relations and ${valued.length} valued relations expressed, ${refused.length} refused\n`);
  console.log('  valued: ' + valued.map((v) => `${v.rel}(${v.cases.length})`).join(' '));
  console.log('  projected: ' + (projected.map((v) => `${v.rel}<-${v.of}.${v.end ? 'end' : 'start'}`).join(' ') || 'none') + '\n');
  for (const r of rels) {
    const kinds = r.prods.map((p) => p.p === 'while' ? 'while'
      : `chain:${p.steps.filter((x) => x.k === 'consume').length}`
        + (p.p === 'chain' && p.steps.some((x) => x.k === 'search') ? '+search' : '')).join(',');
    console.log(`  ${r.rel}/${r.arity}  ${r.prods.length} clause${r.prods.length > 1 ? 's' : ''}  [${kinds}]`);
  }
  if (refused.length) {
    console.log('\nREFUSED:');
    for (const x of refused) console.log(`  ${x.where}\n      ${x.why}`);
  }
}

if (import.meta.filename === process.argv[1]) main();

// ---------------------------------------------------------------------------
// AN INTERPRETER OF THE EXTRACTED FORM, so the extraction can be checked before
// any of it is rendered into Rust. The automaton half was validated this way
// and it was the right order: the risky half is READING the rules, and turning
// a validated tree into code is mechanical. A generator checked only through
// its output makes every mistake look like a compiler error.

export interface World { ch: string[]; kind: string[]; state: string[] }

/** Every span of every expressible relation, as `start,end` keys. */
export function evaluate(w: World, ex: ReturnType<typeof extract>): Map<string, Set<string>> {
  const spans = new Map<string, Set<string>>();
  const valuedAt = new Map<string, Map<number, string>>();
  const n = w.ch.length;

  for (const p of ex.projected) spans.set(p.rel, new Set());

  // ONE FIXPOINT OVER EVERYTHING, not two ordered phases. The first draft
  // computed the valued relations FIRST and they came out empty: `punct(I,
  // lpar) :- kind(I, lpar), code_at(I)` needs `code_at`, which is a span, and
  // the span table had not been built yet. Ordering the phases by what looked
  // like the layering is the same mistake the two generators made before they
  // merged — the dependency graph is mutual, so the evaluation is a fixpoint.
  const recomputeValued = (): void => {
    for (const v of ex.valued) {
      const m = new Map<number, string>();
      for (let i = 0; i < n; i++) {
        for (const c of v.cases) if (c.tests.every((t) => holds(w, spans, valuedAt, t, i))) { m.set(i, c.value); break; }
      }
      valuedAt.set(v.rel, m);
    }
  };

  for (let round = 0; round < 6; round++) {
  const sizeBefore = [...spans.values()].reduce((k, x) => k + x.size, 0)
    + [...valuedAt.values()].reduce((k, x) => k + x.size, 0);
  recomputeValued();
  for (const r of ex.rels) {
    const out = spans.get(r.rel) ?? new Set<string>();
    for (let pass = 0; pass < n + 2; pass++) {
      const before = out.size;
      for (let i = 0; i < n; i++) {
        for (const prod of r.prods) {
          if (prod.p === 'while') {
            // extend every span already known for this relation
            // THE GUARD CARRIES ITS OWN OFFSET. `wext(I, J2) :- wext(I, J),
            // J2 is J + 1, wordch(J2)` extracts as a test at offset +1 from
            // the cursor, so evaluating it at the ALREADY-advanced position
            // counts the step twice and every word came out one character
            // short of itself. Sixth offset mistake of the day, same family:
            // the tool's frame reported as the rule's.
            for (const key of [...out]) {
              const [s, e] = key.split(',').map(Number) as [number, number];
              if (e + 1 >= n) continue;
              if (prod.step.every((t) => holds(w, spans, valuedAt, t, e))) out.add(`${s},${e + 1}`);
            }
            continue;
          }
          for (const end of runChain(w, spans, valuedAt, prod, i, n)) out.add(`${i},${end}`);
        }
      }
      // projections of THIS relation become available immediately
      for (const p of ex.projected) {
        if (p.of !== r.rel) continue;
        const s = spans.get(p.rel) ?? new Set<string>();
        for (const key of out) {
          const [a, b] = key.split(',').map(Number) as [number, number];
          const at = p.end ? b : a;
          s.add(`${at},${at}`);
        }
        spans.set(p.rel, s);
      }
      if (out.size === before) break;
    }
    spans.set(r.rel, out);
  }
  const sizeAfter = [...spans.values()].reduce((k, x) => k + x.size, 0)
    + [...valuedAt.values()].reduce((k, x) => k + x.size, 0);
  if (sizeAfter === sizeBefore) break;
  }
  return spans;
}

/** Every end position a chain production can reach from `start`. */
function runChain(w: World, spans: Map<string, Set<string>>, valued: Map<string, Map<number, string>>,
                  prod: Extract<Prod, { p: 'chain' }>, start: number, n: number): number[] {
  let states: { cursor: number; frames: number[] }[] = [{ cursor: start, frames: [start] }];
  for (const st of prod.steps) {
    const next: { cursor: number; frames: number[] }[] = [];
    for (const s of states) {
      if (st.k === 'test') {
        const base = s.frames[Math.min(st.frame, s.frames.length - 1)]!;
        if (holds(w, spans, valued, st.test, base)) next.push(s);
      } else if (st.k === 'valued') {
        const m = valued.get(st.rel);
        if (m ? m.has(s.cursor) : s.cursor < n) next.push(s);
      } else if (st.k === 'consume') {
        const set = spans.get(st.rel) ?? new Set<string>();
        for (const key of set) {
          const [a, b] = key.split(',').map(Number) as [number, number];
          if (a === s.cursor) next.push({ cursor: b, frames: [...s.frames, b] });
        }
      } else if (st.k === 'search') {
        for (let j = s.cursor + 1; j < n; j++) {
          if (holds(w, spans, valued, st.test, j)) { next.push({ cursor: j, frames: [...s.frames, j] }); break; }
        }
      } else {
        // `projected` never reaches a chain: it is turned into a `test` where
        // it is used, and kept as a step kind only so the emitter can name it.
        next.push(s);
      }
    }
    states = next;
    if (states.length === 0) break;
  }
  const ends = states.map((s) => (prod.endOff === null ? s.cursor : start + prod.endOff));
  return ends.filter((e) => e >= 0 && e < n);
}

function holds(w: World, spans: Map<string, Set<string>>, valued: Map<string, Map<number, string>>,
               t: Test, at: number): boolean {
  switch (t.t) {
    case 'kind': { const i = at + t.off; return i >= 0 && i < w.kind.length && w.kind[i] === t.kind; }
    case 'char': { const i = at + t.off; return i >= 0 && i < w.ch.length && w.ch[i] === t.ch; }
    case 'state': { const i = at + t.off; return i >= 0 && i < w.state.length && w.state[i] === t.state; }
    case 'not': return !holds(w, spans, valued, t.x, at);
    case 'pred': {
      const i = at + t.off;
      const s = spans.get(t.rel);
      if (s) return s.has(`${i},${i}`);
      const m = valued.get(t.rel);
      return m ? m.has(i) : false;
    }
  }
}
