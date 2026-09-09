// eval_cost.ts — a MODEL OF THE EVALUATION, emitted as facts.
//
// scanners/parse_cost.ts measures the parse from OUTSIDE: milliseconds,
// firings, store size, and the cost of two store primitives. That was enough
// to find the reuse cache paying four times what it saved, and it is not
// enough to say where a fixpoint's work goes, because the quantity that can
// EXPLODE is invisible from outside: the width of the join accumulator inside
// one rule firing.
//
// This scanner measures from inside, and it does so WITHOUT INSTRUMENTING THE
// KERNEL. `Evaluation`'s methods are wrapped on the prototype for the length
// of one run and restored afterwards, so src/ carries no counter and no flag
// — the same reason scanners/necessity.ts uses V8 coverage rather than a
// probe. What the wrappers can see is exactly the join's shape:
//
//   fireRule      — one firing of one rule; everything below is attributed to
//                   the rule that is currently firing.
//   matchPremise  — called ONCE PER ACCUMULATED SOLUTION at one body position,
//                   so counting calls whose literal is `plan[i].lit` RECOVERS
//                   the accumulator width at position i without reaching into
//                   solveBody. The returned array's length is the fan-out.
//   negHolds      — the same, for a negative position.
//   conclude      — one head fact built; `factCount` before and after says
//                   whether it was NEW or a re-derivation.
//
// The widths are what the model is for. A body is a left-to-right nested loop
// join, so the width after position i is the PRODUCT of the fan-outs before
// it, and the work of a firing is the SUM of the widths. A fan-out above one
// at an early position multiplies every position after it — that is the whole
// of cardinality explosion, and it is a property of body ORDER, which is what
// `planBody` exists to choose and (measured over the corpus) never changes.

import * as fs from 'node:fs';
import { Evaluation, type ERule } from '../src/engine.ts';
import type { Lit } from '../src/unify.ts';
import { image, fromImage, parse } from '../examples/ring1/demo.ts';

interface Pos { calls: number; out: number; kind: string; rel: string }
interface Rule { rel: string; fires: number; concl: number; fresh: number; pos: Map<number, Pos> }

const rules = new Map<string, Rule>();
let cur: { r: ERule; m: Rule } | null = null;

function ruleOf(r: ERule): Rule {
  let m = rules.get(r.id);
  if (!m) { m = { rel: r.clause.head.rel, fires: 0, concl: 0, fresh: 0, pos: new Map() }; rules.set(r.id, m); }
  return m;
}

/** Which body position this literal stands at, by IDENTITY. The plan holds the
 *  very objects `solveBody` walks, so `===` is exact where a name would not be:
 *  the same relation can stand at two positions of one body. */
function posOf(r: ERule, lit: Lit): number {
  for (let i = 0; i < r.plan.length; i++) {
    const b = r.plan[i];
    if ((b.t === 'pos' || b.t === 'neg') && b.lit === lit) return i;
  }
  return -1;
}

function note(i: number, kind: string, rel: string, out: number): void {
  if (!cur || i < 0) return;
  let p = cur.m.pos.get(i);
  if (!p) { p = { calls: 0, out: 0, kind, rel }; cur.m.pos.set(i, p); }
  p.calls++; p.out += out;
}

export function measure(src: string): void {
  // THE WORLD IS BUILT AND WARMED BEFORE THE WRAPPERS GO ON, and the first
  // version of this file did not do that. `parse(src, fromImage(image()))`
  // evaluates its own argument INSIDE the measured window, so the run
  // included loading charclass.rofl and ring1.rofl -- 161 rules -- and with
  // them the kernel's one-time safety check of the grammar. Read off that
  // run, seven of the eight heaviest rules were `safety.rofl`, and the
  // conclusion `a third of a parse is the kernel checking itself` was an
  // artefact of measuring the BUILD. It is this repository's own recorded
  // trap: a task that does the thing it is measuring the absence of measures
  // nothing. The warm parse also leaves `safetyMemo` populated, which is the
  // steady state a real front end runs in.
  const img = image();
  parse(src, fromImage(img));
  const world = fromImage(img);

  measureWith(() => parse(src, world));
}

/** THE WRAPPERS, over any run at all.
 *
 *  Extracted 2026-09-09 so a second subject — the JS model over a real source
 *  tree — could be measured by THESE wrappers rather than by a copy of them.
 *  A second implementation of a measurement is how two answers drift apart,
 *  and this file's own header already says the widths are the whole point;
 *  they are worth nothing if the ring 1 numbers and the JS numbers come from
 *  two folds. `measure` is now this plus the ring 1 world.
 *
 *  The caller is responsible for the same discipline `measure` documents above:
 *  BUILD AND WARM THE WORLD FIRST. Anything constructed inside `body` is
 *  attributed to the run. */
export function measureWith(body: () => void): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = Evaluation.prototype as unknown as Record<string, any>;
  const orig = {
    fireRule: proto.fireRule, matchPremise: proto.matchPremise,
    negHolds: proto.negHolds, conclude: proto.conclude,
  };

  proto.fireRule = function (this: unknown, r: ERule, ...rest: unknown[]) {
    const outer = cur;
    const m = ruleOf(r); m.fires++;
    cur = { r, m };
    try { return orig.fireRule.call(this, r, ...rest); } finally { cur = outer; }
  };
  proto.matchPremise = function (this: { }, lit: Lit, ...rest: unknown[]) {
    const res = orig.matchPremise.call(this, lit, ...rest) as unknown[];
    if (cur) note(posOf(cur.r, lit), 'pos', lit.rel, res.length);
    return res;
  };
  proto.negHolds = function (this: { }, lit: Lit, ...rest: unknown[]) {
    const res = orig.negHolds.call(this, lit, ...rest) as boolean;
    if (cur) note(posOf(cur.r, lit), 'neg', lit.rel, res ? 1 : 0);
    return res;
  };
  proto.conclude = function (this: { store: { factCount(): number } }, r: ERule, ...rest: unknown[]) {
    const m = ruleOf(r); m.concl++;
    const before = this.store.factCount();
    const res = orig.conclude.call(this, r, ...rest);
    if (this.store.factCount() > before) m.fresh++;
    return res;
  };

  try { body(); } finally { Object.assign(proto, orig); }
}

/** Everything measured so far, as the ledger rows `rules/eval-cost.rofl` reads. */
export function emitFacts(subject?: string): string {
  return emit(subject);
}

/** Forget the previous subject, so two worlds can be measured in one process. */
export function resetCost(): void {
  rules.clear();
  cur = null;
}

function emit(subject = 'ONE ring 1 clause parse'): string {
  const L: string[] = [];
  const q = (s: string) => JSON.stringify(s);
  L.push('-- GENERATED by scanners/eval_cost.ts, do not edit.');
  L.push('--');
  L.push(`-- A model of ${subject}, measured from inside the join.`);
  L.push('-- The reasoning over these rows is rules/eval-cost.rofl; nothing here');
  L.push('-- concludes anything. Taken on node ' + process.version + '.');
  L.push('');
  L.push('-- fires(Rule, N)      how many times solveBody was entered for it');
  L.push('-- conc(Rule, N)       head facts built');
  L.push('-- fresh(Rule, N)      of those, ones the store did not already hold');
  L.push('-- width(Rule, I, N)   accumulator elements reaching body position I,');
  L.push('--                     summed over every firing');
  L.push('-- yield(Rule, I, N)   matches those calls produced in total');
  L.push('-- slot(Rule, I, Kind, Rel)');
  L.push('');
  const ordered = [...rules.entries()]
    .filter(([, m]) => m.fires > 0)
    .sort((a, b) => sum(b[1]) - sum(a[1]));
  for (const [id, m] of ordered) {
    const r = q(id);
    L.push(`fires(${r}, ${m.fires}).  conc(${r}, ${m.concl}).  fresh(${r}, ${m.fresh}).  head(${r}, ${m.rel}).`);
    for (const [i, p] of [...m.pos.entries()].sort((a, b) => a[0] - b[0])) {
      L.push(`  width(${r}, ${i}, ${p.calls}).  yield(${r}, ${i}, ${p.out}).  slot(${r}, ${i}, ${p.kind}, ${p.rel}).`);
    }
  }
  L.push('');
  L.push(`total_rules(${ordered.length}).`);
  L.push(`total_width(${ordered.reduce((a, [, m]) => a + sum(m), 0)}).`);
  L.push(`total_conc(${ordered.reduce((a, [, m]) => a + m.concl, 0)}).`);
  L.push(`total_fresh(${ordered.reduce((a, [, m]) => a + m.fresh, 0)}).`);
  return L.join('\n') + '\n';
}

const sum = (m: Rule) => [...m.pos.values()].reduce((a, p) => a + p.calls, 0);

if (process.argv[1] && process.argv[1].endsWith('eval_cost.ts')) {
  measure(process.argv[2] ?? 'anc(X, Y) :- par(X, Z), anc(Z, Y).');
  const out = emit();
  fs.writeFileSync('facts/eval-cost.rofl', out);
  console.log(`facts/eval-cost.rofl written: ${out.split('\n').length} lines`);
}
