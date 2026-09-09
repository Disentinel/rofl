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

export function extract(): { rels: SpanRel[]; refused: Refusal[] } {
  const prog = parseProgram(read('examples/ring1/ring1.rofl'));
  const byHead = new Map<string, { c: Clause; i: number }[]>();
  for (const [i, c] of prog.entries()) {
    if (!byHead.has(c.head.rel)) byHead.set(c.head.rel, []);
    byHead.get(c.head.rel)!.push({ c, i });
  }
  const rels: SpanRel[] = [];
  const refused: Refusal[] = [];

  for (const [rel, cs] of byHead) {
    const heads = cs.filter(({ c }) => c.body.length > 0 && c.head.args.length >= 2
      && vn(c.head.args[0]) !== null);
    if (heads.length === 0) continue;
    // a span relation: some clause's second head argument is an index
    const spanish = heads.some(({ c }) => {
      const j = vn(c.head.args[1]);
      return j !== null && (j === vn(c.head.args[0]) || offsets(c, vn(c.head.args[0])!).has(j));
    });
    if (!spanish) continue;

    const shapes: Shape[] = [];
    let ok = true;
    for (const { c, i } of heads) {
      const where = `ring1.rofl#${i} ${rel}/${c.head.args.length}`;
      const I = vn(c.head.args[0])!;
      const J = vn(c.head.args[1]);
      const off = offsets(c, I);
      const value = c.head.args.length >= 3 ? an(c.head.args[2]) : null;

      // WHILE: the body reads this same relation and extends by one
      const selfRead = c.body.find((b) => b.t === 'pos' && b.lit.rel === rel);
      if (selfRead) {
        // A LOOP'S GUARD IS RELATIVE TO THE CURSOR, NOT TO THE START. The step
        // clause is `wext(I, J2) :- wext(I, J), J2 is J + 1, wordch(J2)`, and
        // `J` is bound by the self-read rather than by the head, so anchoring
        // the offsets at I leaves `wordch(J2)` unanchored and the clause looks
        // unsupported. It is not: it is anchored at the END SO FAR. The first
        // draft reported its own choice of origin as a property of the rule —
        // the same shape as the offset solver that read `I is J + 1` in one
        // direction only, earlier today.
        const cursor = vn((selfRead as { lit: { args: Term[] } }).lit.args[1]);
        const stepOff = cursor ? offsets(c, cursor) : off;
        const step: Test[] = [];
        let bad = false;
        for (const b of c.body) {
          if (b.t === 'bi') continue;
          if (b.t === 'pos' && b.lit.rel === rel) continue;
          if (SKIP.has(b.lit.rel)) continue;
          const t = asTest(b.lit.rel, b.t === 'neg', b.lit.args, stepOff);
          if (!t) { bad = true; break; }
          step.push(t);
        }
        if (bad) { refused.push({ where, why: `a self-extending clause with a premise that is not a test` }); ok = false; break; }
        const seed = shapes.find((s) => s.s === 'while');
        if (seed) (seed as { step: Test[] }).step = step;
        else shapes.push({ s: 'while', seed: [], step, stopAfter: false, value });
        continue;
      }
      // FIXED: J at a known offset, every premise a test
      const tests: Test[] = [];
      let bad: string | null = null;
      for (const b of c.body) {
        if (b.t === 'bi') continue;
        if (SKIP.has(b.lit.rel)) continue;
        const t = asTest(b.lit.rel, b.t === 'neg', b.lit.args, off);
        if (!t) { bad = `premise \`${b.lit.rel}/${b.lit.args.length}\` is not a test this layer can express`; break; }
        tests.push(t);
      }
      if (bad) { refused.push({ where, why: bad }); ok = false; break; }
      const end = J === null ? null : off.get(J);
      if (end === undefined || end === null) { refused.push({ where, why: `the end of the span is not at a known offset` }); ok = false; break; }
      shapes.push({ s: 'fixed', end, tests, value });
    }
    if (ok && shapes.length) rels.push({ rel, arity: heads[0]!.c.head.args.length, shapes });
  }
  return { rels, refused };
}

function main(): void {
  const { rels, refused } = extract();
  console.log(`${rels.length} span relations expressed, ${refused.length} refused\n`);
  for (const r of rels) {
    const kinds = r.shapes.map((s) => s.s).join(',');
    console.log(`  ${r.rel}/${r.arity}  ${r.shapes.length} clause${r.shapes.length > 1 ? 's' : ''}  [${kinds}]`);
  }
  if (refused.length) {
    console.log('\nREFUSED:');
    for (const x of refused) console.log(`  ${x.where}\n      ${x.why}`);
  }
}

if (import.meta.filename === process.argv[1]) main();
