// ONE BODY ORDER PER SEMI-NAIVE VERSION, and the two ways getting it wrong is
// silent.
//
// `propagate` re-fires a rule once per body position whose relation the round's
// front carries, and every one of those firings is a DIFFERENT join: one
// position reads a delta and the rest read whole relations. Until this landed
// they all shared one order — `planBody(r.clause)` is asked once per rule in
// `prepare` — so an order that suits the version whose delta arrives on the
// second premise is forced on the version whose delta arrives on the first.
//
// Two things about that are worth a test rather than a comment.
//
// THE WINDOW IS AN INDEX INTO A PARTICULAR PLAN. `frontAt.pos` names a position
// and `solveBody` compares it against its own loop counter. Once the version's
// plan is a different array from the rule's, the number that `fireRuleFront`
// computed (a position of the SHARED plan) is not the number `solveBody` needs
// (the delta literal's index in the VERSION's plan). Naming the wrong one has
// two outcomes and only one of them is visible to an answer-comparing oracle,
// which is why both are planted below.
//
// A REORDERED BODY SIGNS ITS DERIVATIONS DIFFERENTLY. `solveBody` returns one
// premise reference per body element in the order it solved them, and
// `conclude` builds the firing signature out of that list. Two versions solving
// one derivation in two orders would record it as two supports of one fact —
// a number `canonicalState` prints. The permutation back to the shared order is
// the fix, and the mutant below shows the gate can see it.

import { test } from 'node:test';
import assert from 'node:assert';
import { Rofl } from '../src/api.ts';
import { Evaluation, planBody, planVersions, orderReady, connected,
         type ERule, type VerPlan } from '../src/engine.ts';
import { parseProgram } from '../src/parser.ts';

const B = 5_000_000;

/** A left-to-right chain plus mutual recursion, so BOTH premises of the
 *  recursive rule are derived and both carry a delta on some round. Without
 *  that second growing relation the rule has one live version and nothing
 *  here would be exercised at all. */
function program(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += `e(${i}, ${i + 1}).\n`;
  // THE RECURSION RUNS THROUGH THE SECOND PREMISE ONLY. `e` is base, so its
  // delta exists in round 0 and never again: from round 1 the version whose
  // delta arrives on `q` is the ONLY route to a new `p`, which is what makes
  // a broken window on that version lose facts instead of merely repeating
  // work. With the recursion on the first premise the two versions cover for
  // each other and every mutant below comes back green.
  return s + 'p(X, Y) :- e(X, Y).\np(X, Z) :- e(X, Y), q(Y, Z).\nq(X, Y) :- p(X, Y).\n';
}

interface Run { rows: string[]; canon: string; width: number; used: number }

/** Load the program with `edit` applied to every rule's version plans, and
 *  report what came out, what the store says, and how much accumulator the
 *  join spent. The wrappers go on the PROTOTYPE for the length of one run and
 *  come off in a finally, so src/ carries no counter and no flag — the same
 *  arrangement scanners/eval_cost.ts uses. */
function run(src: string, edit?: (r: ERule) => void): Run {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = Evaluation.prototype as unknown as Record<string, any>;
  const orig = { prepare: proto.prepare, fireRule: proto.fireRule, matchPremise: proto.matchPremise };
  let width = 0, used = 0;
  let cur: ERule | null = null;
  proto.prepare = function (this: { rules: ERule[] }, ...a: unknown[]) {
    const res = orig.prepare.apply(this, a);
    if (edit) for (const r of this.rules) edit(r);
    return res;
  };
  proto.fireRule = function (this: unknown, r: ERule, frontAt: unknown, ...rest: unknown[]) {
    const outer = cur; cur = r;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (frontAt !== null && (this as any).pickVersion(r, frontAt) !== null) used++;
    try { return orig.fireRule.call(this, r, frontAt, ...rest); } finally { cur = outer; }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.matchPremise = function (this: unknown, lit: any, ...rest: unknown[]) {
    const out = orig.matchPremise.call(this, lit, ...rest);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (cur && cur.plan.some((b: any) => b.t !== 'bi' && b.lit === lit)) width++;
    return out;
  };
  try {
    const r = new Rofl();
    const res = r.load(src, { budget: B });
    assert.ok(res.ok, `load failed: ${res.diagnostics.join('; ')}`);
    const rows = r.query('p(X, Y)', { budget: B }).rows.map((x) => x.text).sort();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canon = ((r as any).store as { canonicalState(): string }).canonicalState();
    return { rows, canon, width, used };
  } finally { Object.assign(proto, orig); }
}

const off = (r: ERule) => { r.verPlans = r.plan.map(() => null); };

test('a version whose delta is not first gets its own order, and the window follows it', () => {
  const [c] = parseProgram('p(X, Z) :- e(X, Y), q(Y, Z).\n');
  const { plan } = planBody(c);
  const vs = planVersions(c, plan);
  assert.equal(vs[0], null, 'version 0 already leads with its delta and needs no plan');
  const v = vs[1] as VerPlan;
  assert.ok(v, 'the version whose delta arrives on q gets a plan');
  assert.equal(v.plan[0], plan[1], 'and that plan leads with q');
  assert.equal(v.pos, 0, 'the window names the delta literal WHERE IT NOW STANDS, not where it was');
  assert.deepEqual(v.perm, [1, 0], 'and perm says where each element sits in the shared plan');
});

test('the version plan is actually exercised, or everything below is vacuous', () => {
  const r = run(program(12));
  assert.ok(r.used >= 5, `version plans chosen ${r.used} times; the fixture must exercise them`);
  assert.ok(r.rows.length > 0);
});

test('per-version orders derive the same facts, with the same provenance, byte for byte', () => {
  const src = program(12);
  const a = run(src, off), b = run(src);
  assert.deepEqual(b.rows, a.rows, 'same answers');
  assert.ok(b.canon === a.canon,
    'canonicalState carries every support count and every canonical witness premise list; '
    + 'a reordered body must not move one');
  assert.ok(b.width < a.width, `and it is cheaper: ${a.width} -> ${b.width} accumulator elements`);
});

// ---------------------------------------------------------------------------
// The two failure modes of the window index, planted one at a time.

test('MUTANT: the window naming the WRONG literal drops facts, and the answer says so', () => {
  const src = program(12);
  const good = run(src);
  // `pos` is the delta literal's index in the version's own plan (0). Point it
  // at the OTHER literal and that literal is restricted to a front of keys
  // belonging to a different relation, which matches nothing.
  const bad = run(src, (r) => {
    for (const v of r.verPlans) if (v && v.plan.length > 1) v.pos = 1;
  });
  assert.ok(bad.rows.length < good.rows.length,
    `a window on the wrong literal must lose derivations; got ${good.rows.length} -> ${bad.rows.length}. `
    + 'If this passes, the fixture is not exercising a version plan whose order differs '
    + 'from the shared one, or the other version is covering for it.');
});

test('MUTANT: the window naming NO literal is invisible to the answer and visible only to the counter', () => {
  const src = program(12);
  const good = run(src);
  // Past the end of the plan: `frontAt.pos === i` is never true, so no position
  // is restricted and every version degrades into a full scan. THE ANSWERS ARE
  // IDENTICAL. This is the failure the equivalence test above structurally
  // cannot see, and the reason a width counter is part of this file.
  const bad = run(src, (r) => { for (const v of r.verPlans) if (v) v.pos = 99; });
  assert.deepEqual(bad.rows, good.rows, 'a lost window is not a wrong answer');
  assert.ok(bad.width > good.width,
    `semi-naive degraded to a full scan and only the width says so: ${good.width} -> ${bad.width}`);
  // AND ON THIS FIXTURE THE STORE CANNOT SEE IT EITHER: same facts, same
  // support counts, same canonical witnesses. Both oracles this repository owns
  // are blind to a lost semi-naive window, and the only instrument that reports
  // it is a counter that lives in a test wrapper.
  assert.ok(bad.canon === good.canon, 'and the store records the same derivation either way');

  // THE SAME MUTANT ON A DIFFERENT FIXTURE DOES MOVE PROVENANCE, which is why
  // the sentence above is about this fixture and not about the engine. With the
  // recursion running through the FIRST premise both versions can reach a
  // derivation, a full scan reaches it in an earlier round than the delta
  // would, and `Store.support` keeps the FIRST firing as the canonical witness.
  // So the schedule is visible in what the store remembers — measured here
  // rather than argued — and that is exactly why the real implementation
  // permutes its premise lists back to the shared order instead of trusting
  // that nobody looks.
  // TWELVE LINKS, AND THE NUMBER IS LOAD-BEARING: swept at 4, 6, 8, 12 and 20,
  // this mutant moves provenance at 12 and 20 and not below. A shorter chain
  // reaches its fixpoint before a full scan can beat a delta to any derivation,
  // so a four-link fixture would have reported "provenance is stable" and meant
  // "the fixture is too small to tell".
  let sym = '';
  for (let i = 0; i < 12; i++) sym += `e(${i}, ${i + 1}).\n`;
  sym += 'p(X, Y) :- e(X, Y).\np(X, Z) :- p(X, Y), q(Y, Z).\nq(X, Y) :- p(X, Y).\n';
  const symGood = run(sym);
  const symBad = run(sym, (r) => { for (const v of r.verPlans) if (v) v.pos = 99; });
  assert.deepEqual(symBad.rows, symGood.rows, 'still not a wrong answer');
  assert.ok(symBad.canon !== symGood.canon,
    'but here the canonical witness moves: WHEN a firing happens decides which support is recorded');
});

test('MUTANT: dropping the permutation back to the shared order invents a second support', () => {
  const src = program(12);
  const good = run(src);
  // Identity permutation: the version's premise list is recorded in the order
  // IT solved the body, so a derivation found by two versions signs itself two
  // ways and one fact grows a support out of nothing.
  const bad = run(src, (r) => {
    for (const v of r.verPlans) if (v) v.perm = v.plan.map((_, i) => i);
  });
  assert.deepEqual(bad.rows, good.rows, 'the facts are the same either way');
  assert.notEqual(bad.canon, good.canon,
    'but the support counts are not, and canonicalState is where that shows');
  const sup = (s: string) => s.split('\n').filter((l) => l.includes(' support=')).length;
  assert.equal(sup(bad.canon), sup(good.canon), 'same facts, so the same number of lines');
});

// ---------------------------------------------------------------------------
// Safety, which is what `planBody` is besides a cost heuristic.

test('moving a literal EARLIER cannot unbind anything, and the corpus says so', () => {
  // The mode analysis is MONOTONE in the direction this optimiser moves things:
  // pulling one literal to the front can only bind more, sooner, so a version
  // plan inherits the shared plan's readiness. Measured over the .rofl corpus
  // (2072 rules with a body, 1927 candidate versions): the safety half refuses
  // ZERO of them and every refusal is the cost half. That is a claim about the
  // analysis, so it is asserted on the analysis rather than remembered.
  const cs = parseProgram(
    'p(X) :- a(X), Y is X + 1, b(Y).\n'
    + 'q(X) :- a(X), not r(X, Y), c(X, Y).\n'
    + 'w(X, Z) :- a(X), X < 9, c(X, Y), d(Y, Z), Y != Z.\n');
  for (const c of cs) {
    const { plan } = planBody(c);
    assert.ok(orderReady(c, plan), 'the fixture rules are run-ready as written');
    for (let i = 1; i < plan.length; i++) {
      const b = plan[i];
      if (b.t !== 'pos') continue;
      const res = planBody({ ...c, body: [b, ...plan.filter((_, j) => j !== i)] });
      assert.equal(res.stuck, null, `moving position ${i} first stranded a negation`);
      assert.ok(res.headGround, `moving position ${i} first left the head unbound`);
      assert.ok(orderReady(c, res.plan), `moving position ${i} first left a builtin unready`);
    }
  }
});

test('a body whose written order is not run-ready is left alone, and the corpus cannot see it', () => {
  // examples/yak fragment 09: `Y = pair(X, Z)` with neither side ground is a
  // legal rule that is NOT range-restricted as written, and it is unfolded
  // top-down against the same premises reordered, which materialises. That
  // pair is the reason `planBody` moves nothing but negations, and it is the
  // reason this optimiser declines a rule it cannot reason about.
  //
  // IT LIVES IN A TYPESCRIPT STRING, not in a .rofl file — the same hole the
  // recorded corpus measurement of `planBody` had — so a scan of the corpus
  // reports zero of this class and the zero means nothing. Hence a fixture.
  const [c] = parseProgram('risky(X, Y) :- Y = pair(X, Z), who(X), tag(X, Z).\n');
  const { plan } = planBody(c);
  assert.equal(orderReady(c, plan), false, 'the control: this order is not run-ready');
  assert.deepEqual(planVersions(c, plan), plan.map(() => null),
    'so it gets no version plans at all');
});

test('a delta that would lead a cartesian jump is refused, and that is a cost rule not a safety one', () => {
  // `args(I, J2, ...) :- term(I, J, T), nexttok(J, K), p(K, comma), nexttok(K, I2), args(I2, J2, R).`
  // is a chain: every literal is reached with a key already bound. Its LAST
  // literal shares no variable with its first, so leading with that delta puts
  // `term` under it as a full scan multiplied by the delta. Measured on one
  // ring 1 clause before this check existed: +401 accumulator elements on this
  // very rule, +260 on `lit0`, +138 on `prim`.
  const [c] = parseProgram(
    'args(I, J2, R2) :- term(I, J, T), nexttok(J, K), p(K, comma), nexttok(K, I2), args(I2, J2, R2).\n');
  const { plan } = planBody(c);
  const vs = planVersions(c, plan);
  assert.equal(vs[4], null, 'the recursive tail must not lead: it joins with nothing before it');
  assert.ok(connected(plan), 'the control: the written order IS a chain');
  assert.equal(connected([plan[4], ...plan.filter((_, i) => i !== 4)]), false,
    'and putting the tail first breaks it');
  assert.ok(vs[1] !== null, 'while a literal that DOES share a key with the leader is allowed');
});
