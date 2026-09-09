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
  else if (rel === 'st') { const s = an(args[1]); if (s) x = { t: 'state', off: at, state: s }; }
  else if (args.length === 1 && PREDS.has(rel)) x = { t: 'pred', off: at, rel };
  if (!x) return null;
  return negated ? { t: 'not', x } : x;
}

export type Step =
  | { k: 'test'; off: number; test: Test }
  | { k: 'consume'; rel: string; args: (string | null)[] }
  /** Advance to the NEAREST later position where `test` holds. This is what a
   *  clause encodes when it tests the head's END and excludes an earlier one:
   *  `strtok(I, J) :- str_open(I), str_close(J), I < J, not close_between(I, J)`
   *  where `close_between` holds if some close lies strictly between. Without
   *  the exclusion the clause would admit EVERY later close, so the negated
   *  companion is required and its absence is a refusal rather than a guess. */
  | { k: 'search'; test: Test };

export type Prod =
  | { p: 'chain'; steps: Step[]; endOff: number | null; value: string | null }
  | { p: 'while'; seedRel: string | null; step: Test[]; value: string | null };

export interface SpanRel2 { rel: string; arity: number; prods: Prod[] }

/** A production is a CHAIN: walk the body in written order, keeping a cursor.
 *  A premise either TESTS a position at a known offset, or CONSUMES a span of a
 *  relation that is already expressible and moves the cursor to its end. The
 *  end of the head must be where the cursor lands, or at a known offset from I.
 *
 *  BUILT UP TO A FIXPOINT. `tok` cannot be expressed until `word` is, and
 *  `optok` not until `op2` — so the pass repeats while it keeps adding
 *  relations. That is the mirror of the predicate layer, which closes DOWN by
 *  dropping anything reading what it refused; here it closes UP. */
export function extract(): { rels: SpanRel2[]; refused: Refusal[] } {
  const prog = parseProgram(read('examples/ring1/ring1.rofl'));
  const byHead = new Map<string, { c: Clause; i: number }[]>();
  for (const [i, c] of prog.entries()) {
    if (!byHead.has(c.head.rel)) byHead.set(c.head.rel, []);
    byHead.get(c.head.rel)!.push({ c, i });
  }
  const done = new Map<string, SpanRel2>();
  let refused: Refusal[] = [];

  for (let pass = 0; pass < 12; pass++) {
    const before = done.size;
    refused = [];
    for (const [rel, cs] of byHead) {
      if (done.has(rel)) continue;
      const heads = cs.filter(({ c }) => c.body.length > 0 && c.head.args.length >= 2
        && vn(c.head.args[0]) !== null && vn(c.head.args[1]) !== null);
      if (heads.length === 0 || heads.length !== cs.length) continue;

      const prods: Prod[] = [];
      let stop: Refusal | null = null;
      for (const { c, i } of heads) {
        const where = `ring1.rofl#${i} ${rel}/${c.head.args.length}`;
        const I = vn(c.head.args[0])!, J = vn(c.head.args[1])!;
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
        let cur = I;
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
            continue;
          }
          const t = asTest(b.lit.rel, b.t === 'neg', b.lit.args, curOff);
          if (t) { steps.push({ k: 'test', off: 0, test: t }); continue; }
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
  return { rels: [...done.values()], refused };
}

function main(): void {
  const { rels, refused } = extract();
  console.log(`${rels.length} span relations expressed, ${refused.length} refused\n`);
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
