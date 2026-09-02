// round-eval-demand.test.ts — the constraint `round-eval.test.ts` reported as
// UNCOVERED, and the inputs that cover it.
//
// `peelRounds` builds its dependency graph from EVERY decoded rule, safe or
// not, and the comment above it says why: a demand-backed relation is unfolded
// at its call sites, but `boot.rofl`'s `concludes` reflects the program TEXT
// and knows nothing about materializability, so an unsafe rule still bears its
// dependencies. The mutant that drops them — `peelRounds(rules.filter(r =>
// r.safe))` — slept on all 34 corpus programs and on all 12 danger probes,
// including the one written for it. It was reported as an uncovered
// constraint rather than a passed one, which is why this file exists.
//
// A discriminating input needs the unsafe rule to be the ONLY carrier of an
// edge that decides a round, and that round to decide something observable.
// Two shapes do it, and they fail differently:
//
//   1. the unsafe rule closes a NEGATIVE CYCLE. Nothing safe is on the cycle,
//      so the safe-only peel sees no cycle, does not stall, and ACCEPTS a
//      program the stock evaluator refuses outright.
//   2. the unsafe rule's own NEGATIVE dependency is what places its round. Drop
//      it and the demand relation becomes base, its negator wakes one round too
//      early, and the unfolding at the call site reads a relation that has not
//      finished — so the negator derives less and the store carries demand
//      facts that a complete read would have vetoed.
//
// Each is pinned twice here: the peel must differ (the schedule), and the
// evaluator must agree with the stock one (the answer). The mutant itself runs
// in `saferPeel` below, so the gate demonstrates that it can say no rather
// than assuming it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { roundify, peelRounds, lastRoundEval, RoundEvaluation } from '../runtime/round_eval.ts';
import { Evaluation } from '../src/engine.ts';
import { STRATUM_RULES } from './strata-fixture.ts';

const ROOT = new URL('..', import.meta.url);
const BOOT = fs.readFileSync(new URL('boot.rofl', ROOT), 'utf8');
const BUDGET = 2_000_000;

/** M10 as an executable evaluator: the shipped one with the unsafe rules kept
 *  out of the peel. Test-local and deliberately wrong — its only job is to
 *  differ, so that "the constraint is covered" is a measurement rather than a
 *  claim. Filtering `this.rules` reproduces the mutant exactly: `run()` reads
 *  it in two places, `peelRounds(this.rules)` and a `r.safe` filter that this
 *  one is already a subset of. */
class SaferPeelEvaluation extends RoundEvaluation {
  run() {
    this.rules = this.rules.filter((r) => r.safe);
    return super.run();
  }
}

/** Load boot + a program and evaluate. `how` picks the evaluator. */
function build(text: string, how: 'stock' | 'rounds' | 'safer-peel', ticks = 1) {
  // `'stock'` has to SAY so now: rounds became the default evaluator, so a
  // bare `new Rofl()` is no longer the stratum-table path this file compares
  // against. One word, and the comparison is the one it always was.
  const r = new Rofl(how === 'stock' ? { evaluator: 'strata' } : {});
  if (how !== 'stock') roundify(r);
  if (how === 'safer-peel') {
    // `roundify` replaces the one private entry point every evaluating path
    // funnels through; re-point it at the mutant subclass.
    const R = r as unknown as {
      store: Rofl['store']; naive: boolean; reuse: boolean; diagnostics: string[];
      lastStaged: unknown; lastSteps: number; readsProvenance: boolean; lastEval?: unknown;
      ensure(budget: number, holeId: unknown): { partial: boolean };
    };
    R.ensure = function (budget: number, holeId: never) {
      if (!this.store.dirty) return { partial: this.store.partialEval };
      const ev = new SaferPeelEvaluation(this.store,
        { budget, naive: this.naive, reuse: this.reuse, holeId });
      const out = ev.run();
      this.lastStaged = out.staged;
      this.lastSteps = ev.steps;
      this.readsProvenance = ev.readsProvenance();
      this.lastEval = ev;
      this.store.noteEval(budget, ev.steps, out.partial);
      this.diagnostics.push(...out.diags);
      return { partial: out.partial };
    };
  }
  // THE STOCK ARM NEEDS A SUPPLIER. It orders its negation phases by `stratum/2`
  // and consults `unstratified/1`; boot.rofl used to derive both, and those ten
  // rules were deleted when the primary evaluator started peeling its schedule
  // off the decoded rules. Without them the stock arm has no schedule at all,
  // so a comparison against it would be measuring an unscheduled run rather
  // than the stratum table. `test/strata-fixture.ts` keeps the ten rules
  // verbatim; the rounds arm does not need them and does not get them, which is
  // itself the difference this file exists to compare.
  const boot = how === 'stock' ? BOOT + STRATUM_RULES : BOOT;
  const b = r.load(boot, { budget: BUDGET });
  assert.equal(b.ok, true, `boot: ${b.diagnostics.join('; ')}`);
  const p = r.load(text, { budget: BUDGET });
  if (!p.ok) return { r, rejected: p.diagnostics.join(' | ') };
  for (let i = 1; i < ticks; i++) {
    const a = r.tickAdvance({ budget: BUDGET });
    if (a.quiescent || a.partial) break;
  }
  r.evaluate(BUDGET);
  return { r, rejected: null as string | null };
}

const rows = (r: Rofl, q: string) => r.query(q).rows.map((x) => x.text).sort();

/** The decoded rules of a loaded program, for peeling both ways. */
function rulesOf(text: string) {
  const { r, rejected } = build(text, 'rounds');
  const ev = new Evaluation(r.store, { budget: BUDGET });
  return { rules: ev.rules, r, rejected };
}

// ---------------------------------------------------------------------------
// shape 1: the unsafe rule is the only thing closing a negative cycle

const CYCLE = 's(1).\n'
  + 'p(X)    :- s(X), not q(X, 1).\n'
  // unsafe: `Y > 0` is reached with Y unbound, so the rule is unfoldable at a
  // call site and never fires bottom-up. It is still the rule that makes `q`
  // negate `p`, and that edge is half the cycle.
  + 'q(X, Y) :- s(X), not p(X), Y > 0.\n';

test('a negative cycle carried by an unsafe rule is still refused', () => {
  const stock = build(CYCLE, 'stock');
  const rounds = build(CYCLE, 'rounds');
  assert.notEqual(stock.rejected, null, 'the stock evaluator must refuse it');
  assert.match(stock.rejected!, /unstratified\[main\]\(p\)/,
    `boot.rofl's dep_neg reflects the text, unsafe rules included: ${stock.rejected}`);
  assert.notEqual(rounds.rejected, null, 'rounds must refuse it too');
  assert.match(rounds.rejected!, /settled nothing while p, q remained/,
    `stuck set: ${rounds.rejected}`);
});

test('the peel is not vacuous: dropping the unsafe rules accepts that cycle', () => {
  // The planted defect for shape 1, and the whole of it: with the unsafe rule
  // out of the graph nothing is left on the cycle, no round stalls, and the
  // refusal above disappears. If this peel stalled too, the test above would
  // be proving nothing about which rules the peel reads.
  //
  // `load` rolls the store POINTER back on a rejection; the store object it
  // mutated on the way is simply dropped. Holding a reference to it across the
  // failed load is how the refused program's rules stay readable — and it
  // keeps the peel under test reading the same decoded rules the refusal was
  // taken on, rather than a re-spelling of them.
  const r = new Rofl();
  roundify(r);
  assert.equal(r.load(BOOT, { budget: BUDGET }).ok, true);
  const live = r.store;
  assert.equal(r.load(CYCLE, { budget: BUDGET }).ok, false, 'the cycle must be refused');
  const rules = new Evaluation(live, { budget: BUDGET }).rules;
  const unsafe = rules.filter((x) => !x.safe).map((x) => x.clause.head.rel);
  assert.deepEqual(unsafe, ['q'], `exactly one unsafe rule, concluding q: ${unsafe.join(',')}`);
  assert.equal(peelRounds(rules).stalled, true, 'the shipped peel stalls');
  assert.equal(peelRounds(rules.filter((x) => x.safe)).stalled, false,
    'the safe-only peel stalls too — then the rejection does not depend on unsafe edges');
});

// ---------------------------------------------------------------------------
// shape 2: the unsafe rule's own negative dependency places its round
//
// `amid` is recursive, so it is still growing when the round that settles it
// opens. Merge `zout` into that round and the unfolding of `dem` at `zout`'s
// call site reads a half-built `amid`. The relation names are not decoration:
// `activate` fires a round's rules in canonical order, so `amid` fires first
// here and the failure is NOT the trivial one of firing the negator first.

const DEMAND = 'seed(1). n(1). n(2). n(3). link(1,2). link(2,3). block(9).\n'
  + 'amid(X)   :- seed(X), not block(X).\n'
  + 'amid(Y)   :- amid(X), link(X, Y).\n'
  + 'dem(X, Y) :- n(X), not amid(X), Y > 0.\n'   // unsafe; negDeps = {amid}
  + 'zout(X)   :- n(X), not dem(X, 1).\n';

test('a demand-backed relation carries its own negative dependency into the peel', () => {
  const stock = build(DEMAND, 'stock');
  const rounds = build(DEMAND, 'rounds');
  assert.equal(rounds.rejected, null, `rounds rejected it: ${rounds.rejected}`);
  assert.equal(stock.rejected, null, `stock rejected it: ${stock.rejected}`);
  // THE ORACLE NARROWS, and it says so. It used to be `canonicalState()` byte
  // for byte, which was exact while both worlds loaded the same boot.rofl. They
  // no longer do: the stock arm carries the ten schedule rules the primary path
  // does not need, so the two stores differ in the meta-layer BY CONSTRUCTION
  // and a whole-store comparison would only be re-measuring that. What is
  // compared instead is the program's own relations, fact for fact with their
  // support counts and witnesses — the answer, which is what must agree.
  const mine = (r: Rofl) => r.store.canonicalState().split('\n')
    .filter((l) => /^(wit )?(amid|zout|dem|n|link|seed|block)\[/.test(l)).join('\n');
  assert.ok(mine(rounds.r).length > 0, 'positive control: the projection is not empty');
  assert.equal(mine(rounds.r), mine(stock.r),
    'the two evaluators must leave the same answer');
  assert.deepEqual(rows(rounds.r, 'amid(X)'), ['X = 1', 'X = 2', 'X = 3']);
  assert.deepEqual(rows(rounds.r, 'zout(X)'), ['X = 1', 'X = 2', 'X = 3'],
    'zout reads a finished amid through dem');
  assert.deepEqual(rows(rounds.r, 'dem(X,1)'), [], 'nothing is left of dem once amid is complete');

  // The schedule that produces it: the unsafe rule pushes `dem` past `amid`,
  // and `zout` past `dem`. Three distinct rounds, from two edges only the
  // unsafe rule carries.
  const peel = lastRoundEval(rounds.r)!.peel;
  const [a, d, z] = ['amid', 'dem', 'zout'].map((k) => peel.round.get(k)!);
  assert.ok(a < d && d < z, `amid ${a} < dem ${d} < zout ${z}`);
});

test('the peel is not vacuous: dropping the unsafe rules moves zout into amid\'s round', () => {
  const { rules } = rulesOf(DEMAND);
  const full = peelRounds(rules);
  const safe = peelRounds(rules.filter((x) => x.safe));
  assert.equal(safe.round.get('dem'), 0,
    'without its rule `dem` is base — that is the mutation, and it must take');
  assert.equal(safe.round.get('zout'), safe.round.get('amid'),
    'the two must land in one round, or nothing downstream can differ');
  assert.notEqual(full.round.get('zout'), full.round.get('amid'));
});

test('and the store differs: the negator reads a half-built relation', () => {
  // The planted defect for shape 2, executed rather than argued. Same program,
  // same evaluator, one line of scheduler changed: `zout` wakes with `amid`,
  // unfolds `dem` before the recursion has closed, and loses two of its three
  // answers — while two `dem` facts a complete read would have vetoed stay
  // materialized in the store.
  const good = build(DEMAND, 'rounds');
  const bad = build(DEMAND, 'safer-peel');
  assert.equal(bad.rejected, null, `the mutant rejected the program: ${bad.rejected}`);
  assert.deepEqual(rows(bad.r, 'amid(X)'), ['X = 1', 'X = 2', 'X = 3'],
    'amid itself is unharmed — the damage is in what reads it');
  assert.deepEqual(rows(bad.r, 'zout(X)'), ['X = 1'], 'the mutant loses zout(2) and zout(3)');
  assert.deepEqual(rows(bad.r, 'dem(X,1)'), ['X = 2', 'X = 3'],
    'and materializes demand facts a finished amid would have vetoed');
  assert.notEqual(bad.r.store.canonicalState(), good.r.store.canonicalState(),
    'the oracle passed the mutant: this constraint is uncovered again');
});
