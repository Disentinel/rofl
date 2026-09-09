// join-planner.test.ts — THE OTHER HALF OF `planBody`, and the half that is
// about COST rather than about meaning.
//
// `test/body-order.test.ts` is the first half: where a NEGATION may stand, so
// that literal order cannot change the ANSWER. This file is the second: where a
// POSITIVE may stand, so that literal order stops deciding the price. The item
// is `w_join_planner` and its sentence is "cost is currently a property of how a
// human typed the rule".
//
// WHAT THE PLANNER DOES, and it is one sentence: a positive literal that shares
// no variable with any literal before it is a CROSS PRODUCT where it stands, and
// it is held until one of them binds something it names. Nothing else moves.
//
// WHY NOT A COST MODEL — measured 2026-09-09, and this is the reason the rule is
// this narrow rather than cleverer. A greedy join planner with PERFECT
// statistics (every relation's size and per-position distinct counts taken off a
// finished 434 149-fact store) was built first and scored against the five body
// reorders that had been measured by hand the same week:
//
//   has_return / encloses_s / param_hidden  it reorders, exactly as the humans did
//   tdz_deferred                            it rates the swap at 1.01x — noise, correct
//   closer_v                                it keeps the written order — correct
//
// Five for five, and every one of them a RETRODICTION. On the two orders it
// proposed that nobody had measured, it was wrong twice: one was worth -0.32%
// against a predicted 19.3x, and the other made the world 4.3x MORE expensive
// against a predicted 4.43x improvement. The mechanism is measured rather than
// guessed: the estimate for `ident[code](U, Name)` with Name bound is the MEAN
// rows per name, 4.41 over 553 names — and the join asks it about PARAMETER
// names, where the mean is 648 because one parameter is called `n` and `n`
// occurs 758 times against a median of 2. A mean is not what a correlated join
// sees, and no amount of per-relation statistics fixes that.
//
// So the planner shipped here uses NO statistics at all. A cross product is a
// structural fact about a body — it needs no numbers to see and it cannot be
// wrong about a distribution. Every prefix of the planned order is no wider
// than the same prefix of the written one, which is why it cannot make a body
// dearer — WITH ONE EXCEPTION, named because it is real: if the held relation is
// EMPTY, the written order short-circuits at it and the planned order evaluates
// the literals in between first. An empty relation makes the rule derive nothing
// either way, so what is at stake is the price of a body that concludes nothing.
//
// THE MUTANT SET, run 2026-09-09 against this file plus test/body-order.test.ts,
// test/rofl-safety.test.ts, test/whynot.test.ts and test/head-vars.test.ts.
// ELEVEN mutants of the hold, TEN killed on the first run and ONE SURVIVOR:
//
//   M1  no barrier at all                       killed x4, one of them an ANSWER
//   M2  barrier for builtins but not negations  killed
//   M3  drain from the wrong end                killed
//   M4  never release, only drain               killed
//   M5  hold the CONNECTED literal instead      killed x6
//   M6  drop the first-literal guard            killed x6
//   M7  `shares` ignores the perspective        killed
//   M8  release the LAST releasable, not first  SURVIVED
//   M9  hold negations as well as positives     killed x5
//   M10 release but never drain at the end      killed
//   M11 the hold disabled entirely (liveness)   killed x6
//
// M8 SURVIVED FOR A REASON WORTH THE LINE IT TOOK TO FIX: no body anywhere in
// this file had TWO literals held at once, so `findIndex` and a reverse scan
// agreed on every single assertion. The property it breaks is real — written
// order survives among held literals, which is what makes the hold conservative
// rather than a second planner — and it rested on nothing. One body,
// `p(A, B) :- q(K), r(A), s(B), t(K, A, B).`, kills it.
//
// AND TWO THINGS THE SET MEASURED THAT WERE NOT EXPECTED. (a) The NEGATION
// barrier cannot change an answer: M2 is killed only by a PLAN assertion,
// because `planBody`'s readiness rule already places a negation with its
// variables bound wherever the hold puts it. The BUILTIN barrier is the
// load-bearing one — a builtin is placed where it was WRITTEN — and M1 is
// killed by a derived fact. (b) `test/rofl-safety.test.ts`'s corpus oracle,
// written for range restriction, catches M1 as well: two gates, one hole.
//
// WHERE THIS FILE IS STRUCTURALLY UNABLE TO LOOK, beyond the case named below.
// EVERY assertion here is about the ORDER or about the derived FACTS, so a
// planner that produced a legal but pessimal order would pass all of them bar
// the three named bodies. The cost measurement lives in `facts/findings.rofl`
// and `docs/dogfood/2026-09-09-join-planner.md`, deliberately: a number pinned
// here would be a number that moves with the corpus. And nothing here reaches
// the DEMAND path — `solveDemandRule` solves the written body, not the plan.
//
// WHERE THIS IS STRUCTURALLY UNABLE TO LOOK, and it is measured, not guessed:
// `closer_v` has no cross product in either spelling, so the planner leaves both
// alone — including the one measured at +117% on the control-flow world. A body
// whose every literal is connected is exactly the body this planner has no
// opinion about, and that is the last test in this file.

import { test } from 'node:test';
import assert from 'node:assert';
import { Rofl } from '../src/api.ts';
import { planBody } from '../src/engine.ts';
import { parseProgram } from '../src/parser.ts';
import type { BodyElem, Clause } from '../src/unify.ts';

const B = 20_000_000;

/** the body as the reader typed it, one element per string */
const show = (body: readonly BodyElem[]): string[] => body.map((b) => {
  const t = (x: { k: string; name?: string; v?: unknown; args?: unknown[] }): string =>
    x.k === 'a' || x.k === 'v' ? x.name!
      : x.k === 's' ? JSON.stringify(x.v)
        : x.k === 'i' ? String(x.v)
          : `${x.name}(${(x.args as never[]).map(t).join(', ')})`;
  if (b.t === 'bi') return `${t(b.l as never)} ${b.op} ${t(b.r as never)}`;
  return `${b.t === 'neg' ? 'not ' : ''}${b.lit.rel}(${b.lit.args.map((a) => t(a as never)).join(', ')})`;
});

const clause = (src: string): Clause => {
  const cs = parseProgram(src);
  assert.equal(cs.length, 1, `fixture must be one clause: ${src}`);
  return cs[0];
};
const plan = (src: string): string[] => show(planBody(clause(src)).plan);

/** THE CRITERION, WRITTEN DOWN AND RUNNABLE. The positions at which a positive
 *  literal shares no variable with anything before it — which is the definition
 *  of a cross product and the only thing this planner reacts to. Position 0 is
 *  never one: there is nothing before it. */
function crossAt(body: readonly BodyElem[]): number[] {
  const bound = new Set<string>();
  const vars = (b: BodyElem): string[] => {
    const out: string[] = [];
    const walk = (t: { k: string; name?: string; args?: unknown[] }) => {
      if (t.k === 'v') out.push(t.name!);
      else if (t.k === 'f') for (const a of t.args as never[]) walk(a);
    };
    if (b.t === 'bi') { walk(b.l as never); walk(b.r as never); }
    else { for (const a of b.lit.args) walk(a as never); walk(b.lit.persp as never); }
    return out;
  };
  const out: number[] = [];
  body.forEach((b, i) => {
    if (b.t === 'pos' && i > 0 && !vars(b).some((v) => bound.has(v))) out.push(i);
    for (const v of vars(b)) bound.add(v);
  });
  return out;
}

// ---------------------------------------------------------------------------
// 1. THE THREE SHAPES THAT WERE REPAIRED BY HAND, as self-contained fixtures.
//
// These are the bodies of `has_return`, `encloses_s` and the second arm of
// `param_hidden` as they stood on 2026-09-08, with the relation names kept so a
// reader can find them and the CORPUS deliberately not present: the claim here
// is about the plan, and a claim about the plan must not go red because somebody
// edited rules/js-dataflow.rofl. The numbers those repairs bought are in
// `facts/findings.rofl`; what is asserted here is that nobody has to type them.

test('the three bodies a human reordered for cost, the planner reorders unasked', () => {
  // has_return: the return statements are enumerated against every function
  assert.deepEqual(
    plan('has_return(F) :- fn_node(F), ast_node(R, return_statement), ast_within(F, R).'),
    ['fn_node(F)', 'ast_within(F, R)', 'ast_node(R, return_statement)']);

  // encloses_s: EXACTLY the order the hand repair chose, to the literal
  assert.deepEqual(
    plan('encloses_s(R, D) :- scoped_binder(D), scope_node(R), ast_within(R, D).'),
    ['scoped_binder(D)', 'ast_within(R, D)', 'scope_node(R)']);

  // param_hidden, second arm: also exactly the hand repair
  assert.deepEqual(
    plan('param_hidden(F, N, U) :- param_of(F, N), fn_node_v(G), ast_within(F, G),' +
         ' param_of(G, N), ast_within(G, U), ident(U, N).'),
    ['param_of(F, N)', 'ast_within(F, G)', 'fn_node_v(G)',
     'param_of(G, N)', 'ast_within(G, U)', 'ident(U, N)']);
});

test('and the criterion is a named set, not a permutation: no plan has a cross product', () => {
  const BODIES = [
    'has_return(F) :- fn_node(F), ast_node(R, return_statement), ast_within(F, R).',
    'encloses_s(R, D) :- scoped_binder(D), scope_node(R), ast_within(R, D).',
    'param_hidden(F, N, U) :- param_of(F, N), fn_node_v(G), ast_within(F, G),' +
      ' param_of(G, N), ast_within(G, U), ident(U, N).',
    'tdz_deferred(E, D) :- tdz_cand(E, D), binder_region(D, R), fn_node_v(G),' +
      ' ast_within(R, G), ast_within(G, E).',
  ];
  // POSITIVE CONTROL FIRST: every one of them HAS a cross product as written, so
  // the emptiness below is a measurement and not a vacuous truth.
  assert.deepEqual(
    BODIES.filter((s) => crossAt(clause(s).body).length === 0), [],
    'every fixture must be a cross product as written, or this test asserts nothing');
  assert.deepEqual(
    BODIES.filter((s) => crossAt(planBody(clause(s)).plan).length > 0), [],
    'and none of them is one after planning');
});

// ---------------------------------------------------------------------------
// 2. THE BARRIER, which is the whole correctness argument.
//
// The item this work belongs to names the risk in its own statement: under
// negation, order changes the ANSWER. `planBody` already places a negation at
// the first point its variables are bound; a positive allowed to overtake one
// would move that point. So a negation and a builtin are BARRIERS — everything
// held goes in ahead of them — and the two halves of `planBody` cannot interact.

test('a held literal is put back before a negation, never after it', () => {
  // `s(Z)` is a cross product where it stands and `not r(Y)` follows it. If the
  // hold outlived the negation, `not r(Y)` would be reached with Y unbound —
  // which is the defect test/body-order.test.ts exists for, re-entered from the
  // other side.
  assert.deepEqual(
    plan('p(X) :- q(X, Y), s(Z), not r(Y), t(Y, Z).'),
    ['q(X, Y)', 's(Z)', 'not r(Y)', 't(Y, Z)']);
  // ...and with nothing to hold it back for, the same literal DOES move
  assert.deepEqual(
    plan('p(X) :- q(X, Y), s(Z), t(Y, Z).'),
    ['q(X, Y)', 't(Y, Z)', 's(Z)']);
});

test('a held literal is put back before a builtin, never after it', () => {
  // `Y is X + 1` needs X bound. A positive held across it would be harmless
  // here and is refused anyway: the barrier is the property, not the instance.
  assert.deepEqual(
    plan('p(X, Y) :- q(X), s(Z), Y is X + 1, t(Y, Z).'),
    ['q(X)', 's(Z)', 'Y is +(X, 1)', 't(Y, Z)']);
  assert.deepEqual(
    plan('p(X, Y) :- q(X), s(Z), t(X, Z).'),
    ['q(X)', 't(X, Z)', 's(Z)'], 'positive control: without the builtin it moves');
});

test('the barrier is an ANSWER and not a preference, for a builtin', () => {
  // THE ONE PLACE THE HOLD COULD CHANGE WHAT A PROGRAM MEANS, and it is the
  // builtin rather than the negation. A negation is placed by READINESS — the
  // other half of `planBody` — so it is bound wherever it lands and no hold can
  // make it existential. A builtin is placed where it was WRITTEN and fails if
  // its operands are not bound, so a positive held across one changes the
  // answer rather than the price. `s(Z)` is a cross product at position 2 and
  // `Z + 1` is what needs it.
  const r = new Rofl();
  const res = r.load('q(1).\ns(7).\np(X, Y) :- q(X), s(Z), Y is Z + 1.\n', { budget: B });
  assert.ok(res.ok, `load failed: ${res.diagnostics.join('; ')}`);
  assert.deepEqual(r.query('p(X, Y)', { budget: B }).rows.map((x) => x.text).sort(),
    ['X = 1, Y = 8'], 'the held literal goes in ahead of the builtin that needs it');
  // ...and no arithmetic hole, which is what an unbound `is` leaves behind
  assert.deepEqual(r.query('hole(Q, W)', { budget: B }).rows.map((x) => x.text), []);
  // POSITIVE CONTROL that the fixture exercises the hold at all
  assert.deepEqual(plan('p(X, Y) :- q(X), s(Z), Y is Z + 1.'),
    ['q(X)', 's(Z)', 'Y is +(Z, 1)']);
  assert.deepEqual(crossAt(clause('p(X, Y) :- q(X), s(Z), Y is Z + 1.').body), [1],
    'and position 1 IS a cross product, so the hold is reached');
});

test('the yak fragment keeps the reading its example turns on', () => {
  // examples/yak fragment 09: `risky(X, Y) :- Y = pair(X, Z), who(X), tag(X, Z).`
  // is not range-restricted AS WRITTEN and is unfolded top-down; the same three
  // premises reordered materialise bottom-up, and the fragment IS the pair.
  // `planBody`'s comment says letting the plan wait for `=` would make the two
  // programs one program; the cross-product hold must not do it either.
  assert.deepEqual(
    plan('risky(X, Y) :- Y = pair(X, Z), who(X), tag(X, Z).'),
    ['Y = pair(X, Z)', 'who(X)', 'tag(X, Z)']);
});

// ---------------------------------------------------------------------------
// 3. THE ANSWERS. A reorder that changes one is not an optimisation.

test('every permutation of a body with a cross product derives the same facts', () => {
  const FACTS = 'a(1, x).\na(2, y).\nb(x).\nb(y).\nc(1).\nc(2).\nc(3).\n';
  const parts = ['a(N, T)', 'b(T)', 'c(N)'];
  const perms: string[][] = [];
  const permute = (left: string[], acc: string[]) => {
    if (left.length === 0) { perms.push([...acc]); return; }
    for (let i = 0; i < left.length; i++)
      permute([...left.slice(0, i), ...left.slice(i + 1)], [...acc, left[i]]);
  };
  permute(parts, []);
  assert.equal(perms.length, 6, 'positive control: six permutations of three premises');
  // POSITIVE CONTROL that the fixture exercises the planner: at least one
  // permutation is a cross product as written and is not one after planning.
  const moved = perms.filter((p) => {
    const c = clause(`p(N, T) :- ${p.join(', ')}.`);
    return crossAt(c.body).length > 0 && crossAt(planBody(c).plan).length === 0;
  });
  assert.ok(moved.length > 0, 'no permutation of this fixture is a cross product — it proves nothing');

  const answers = perms.map((p) => {
    const r = new Rofl();
    const res = r.load(`${FACTS}p(N, T) :- ${p.join(', ')}.\n`, { budget: B });
    assert.ok(res.ok, `permutation ${p.join(', ')} refused: ${res.diagnostics.join('; ')}`);
    return r.store.relAll('p').map((f) => f.key).sort().join('\n');
  });
  for (let i = 1; i < answers.length; i++)
    assert.equal(answers[i], answers[0],
      `permutation ${perms[i].join(', ')} disagrees with ${perms[0].join(', ')}`);
  assert.equal(answers[0].split('\n').length, 2,
    'positive control: two facts, so the equality above is not equality of nothing');
});

// ---------------------------------------------------------------------------
// 4. WHERE THIS PLANNER HAS NO OPINION, said out loud rather than left implied.

test('a body whose every literal is connected is left exactly as written', () => {
  // `closer_v`, both spellings. The one on the left is what rules/js-dataflow.rofl
  // holds; the one on the right was argued for from the same principle the three
  // repairs above came from and measured at +117% of the control-flow world's
  // rows before it was reverted by hand. NEITHER has a cross product, so this
  // planner keeps both — it cannot repair the second and it cannot break the
  // first. That is the boundary, and it is the reason a cost model was tried.
  const HEAD = 'closer_v(F, X) :- encloses_v(F, X), encloses_v(G, X), ast_within(F, G), F != G.';
  const ALT  = 'closer_v(F, X) :- encloses_v(F, X), ast_within(F, G), encloses_v(G, X), F != G.';
  for (const src of [HEAD, ALT]) {
    assert.deepEqual(crossAt(clause(src).body), [], `${src}\nis connected throughout`);
    assert.deepEqual(plan(src), show(clause(src).body), 'so the plan is the written order');
  }
  // NEGATIVE CONTROL on `crossAt` itself: break the connection and it reports.
  assert.deepEqual(
    crossAt(clause('closer_v(F, X) :- encloses_v(F, X), encloses_v(G, Y), ast_within(F, G).').body),
    [1], 'the criterion discriminates: an unshared variable IS a cross product');
});

test('MUTANTS: where this gate cannot look', () => {
  // (1) A ONE-ELEMENT BODY, and a body of one positive plus one negation: there
  //     is nothing to hold and the hold must not choke on the empty case.
  assert.deepEqual(plan('p(X) :- q(X).'), ['q(X)']);
  assert.deepEqual(plan('p(X) :- q(X), not r(X).'), ['q(X)', 'not r(X)']);

  // (2) A BODY THAT IS DISCONNECTED THROUGHOUT — a real cross product with no
  //     order that removes it. Everything is held, nothing is ever releasable,
  //     and the drain must give the written order back rather than a reversal.
  //     MUTANT M3 drains from the wrong end, and this is the only assertion in
  //     the whole set that sees it.
  assert.deepEqual(plan('p(X, Y, Z) :- q(X), r(Y), s(Z).'), ['q(X)', 'r(Y)', 's(Z)']);

  // (3) TWO HELD LITERALS RELEASED BY ONE BINDING, and this one was added
  //     BECAUSE A MUTANT SURVIVED. Releasing the LAST releasable held literal
  //     instead of the first is invisible to every other assertion in this file:
  //     no body above ever has two literals held at once, so `findIndex` and a
  //     reverse scan agree on every one of them. It is a real property —
  //     WRITTEN ORDER SURVIVES AMONG HELD LITERALS, which is what makes the
  //     hold conservative rather than a second planner — and until this line it
  //     rested on nothing.
  assert.deepEqual(
    plan('p(A, B) :- q(K), r(A), s(B), t(K, A, B).'),
    ['q(K)', 't(K, A, B)', 'r(A)', 's(B)']);

  // (4) A PERSPECTIVE VARIABLE is a variable for connectedness, and a literal
  //     joined ONLY through the book is not a cross product.
  //     (`show` prints the arguments only, so the book is invisible in the
  //     expectation and visible in the behaviour — which is the point.)
  assert.deepEqual(
    plan('p(X) :- q[P](X), r[P](Y), s(X, Y).'),
    ['q(X)', 'r(Y)', 's(X, Y)'],
    'joined through the perspective alone, so nothing moves');
  //     ...and with the books apart, the SAME body is a cross product
  assert.deepEqual(
    plan('p(X) :- q[P](X), r[Q](Y), s(X, Y).'),
    ['q(X)', 's(X, Y)', 'r(Y)']);

  // (5) THE HOLD CANNOT CREATE AN UNSAFE RULE. `stuck` is about negations, and
  //     a rule whose negation no order settles must still be refused with the
  //     hold in the way.
  const bad = new Rofl().load('q(1).\nr(2).\ns(3).\nt(4).\np(X) :- q(X), t(W), not r(Y), not s(Y).\n', { budget: B });
  assert.equal(bad.ok, false, 'a variable no positive binds is still refused');
  assert.match(bad.diagnostics.join(' '), /\bY\b/);

  // (6) AND THE ONE IT CANNOT SEE, NAMED RATHER THAN LEFT OUT: a body that is
  //     connected and badly ordered. `closer_v` above is the measured instance —
  //     +117% of a world, invisible here by construction, because connectedness
  //     is the whole criterion. Repairing that class needs a cost model, and the
  //     header of this file records what happened when one was measured.
  const CONNECTED_AND_BAD = 'closer_v(F, X) :- encloses_v(F, X), ast_within(F, G), encloses_v(G, X), F != G.';
  assert.deepEqual(plan(CONNECTED_AND_BAD), show(clause(CONNECTED_AND_BAD).body),
    'stated as an assertion so the blind spot cannot close by accident');
});
