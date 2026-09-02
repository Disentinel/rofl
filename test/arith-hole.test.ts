// arith-hole.test.ts — an expression that cannot be evaluated must SAY so.
//
// `N is "hello" + 1` used to derive nothing and say nothing, which made a
// type error inside the language indistinguishable from a premise that
// honestly failed: the same empty answer, no way to tell "absent" from
// "the instrument declined to look". `is` now emits a `hole` naming the rule
// and the reason, and the premise still fails, so nothing derivable moves.
//
// The load-bearing test in this file is the SECOND one. Reporting is cheap;
// reporting only the right thing is the whole change, and the way to get it
// wrong is to fire on an unbound variable — an ordinary state of a builtin
// that runs before its generator — and put a hole under every rule in every
// program. Nothing in the suite would have noticed, because nothing asserted
// the absence. So that test asserts the absence AND, in the same store,
// proves the machinery could have produced a hole.

import { test } from 'node:test';
import assert from 'node:assert';
import { Rofl } from '../src/api.ts';

/** The `hole` rows as `id reason` pairs, sorted. */
function holes(r: Rofl): string[] {
  return r.query('hole(H, Reason)').rows
    .map((x) => `${x.bindings.H} ${x.bindings.Reason}`).sort();
}

/** The id of the single rule concluding into `rel`. */
function ruleFor(r: Rofl, rel: string): string {
  const ids = r.query(`concludes(Id, ${rel})`).rows.map((x) => x.bindings.Id);
  assert.equal(ids.length, 1, `expected exactly one rule concluding into ${rel}`);
  return ids[0];
}

test('a type error in `is` leaves a queryable hole naming its rule', () => {
  const r = new Rofl();
  r.assert('s("hello").');
  assert.ok(r.load('p(N) :- s(S), N is S + 1.').ok);

  // the premise still fails: no row, and no partial answer
  const q = r.query('p(N)');
  assert.deepEqual(q.rows, []);
  assert.equal(q.partial, false);

  // ...but the store now says WHY it is empty, and names the rule
  assert.deepEqual(holes(r), [`$rule(${ruleFor(r, 'p')}) arith_type_error`]);

  // and a RULE can see it, not just a query: `hole` is readable, and the
  // fact reaches the front of the fixpoint that produced it
  assert.ok(r.load('unevaluable(Reason) :- hole(_, Reason).').ok);
  assert.deepEqual(r.query('unevaluable(R)').rows.map((x) => x.bindings.R),
    ['arith_type_error']);
});

test('an ordinary rule with unbound variables emits NO hole', () => {
  const r = new Rofl();
  // Both rules run their builtin on a variable that is not bound when the
  // builtin is reached: `q` is written safe and binds X from n(X) first,
  // while `unsafe` puts the comparison BEFORE its generator, which is what
  // actually drives evalArith into the unbound case (measured: the safe
  // corpus never reaches it at all).
  r.assert('n(1). n(2). n(3).');
  assert.ok(r.load(`
    q(Y)      :- n(X), Y is X + 1.
    unsafe(X) :- X < 3, n(X).
    cmp(X)    :- n(X), X < 3.
  `).ok);
  assert.deepEqual(r.query('q(Y)').rows.map((x) => x.bindings.Y), ['2', '3', '4']);

  // THE ASSERTION: silence, because an unbound variable is not an error.
  assert.deepEqual(holes(r), []);

  // POSITIVE CONTROL, in this same store: the machinery that just stayed
  // silent is live and would have spoken. Without this, the assertion above
  // is satisfied equally well by a hole emitter that is switched off.
  r.assert('t("widget").');
  assert.ok(r.load('boom(N) :- t(T), N is T + 1.').ok);
  assert.deepEqual(r.query('boom(N)').rows, []);
  assert.deepEqual(holes(r), [`$rule(${ruleFor(r, 'boom')}) arith_type_error`]);
});

test('a zero divisor is its own reason, and the other rows still derive', () => {
  const r = new Rofl();
  r.assert('num(10). d(0). d(2).');
  assert.ok(r.load('over(D, V) :- num(X), d(D), V is X / D.').ok);
  // the divisible row is unaffected — the hole is additive, not a rejection
  assert.deepEqual(r.query('over(D, V)').rows.map((x) => x.text), ['D = 2, V = 5']);
  assert.deepEqual(holes(r), [`$rule(${ruleFor(r, 'over')}) arith_zero_divisor`]);

  // `mod` reports the same way, and a guarded rule stays silent
  const g = new Rofl();
  g.assert('num(10). d(0). d(2).');
  assert.ok(g.load('safe(D, V) :- num(X), d(D), D != 0, V is X mod D.').ok);
  assert.deepEqual(g.query('safe(D, V)').rows.map((x) => x.text), ['D = 2, V = 0']);
  assert.deepEqual(holes(g), []);
});

test('one hole per rule, not one per offending substitution', () => {
  const r = new Rofl();
  // 50 rows, every one of them a type error in the same rule
  r.assert(Array.from({ length: 50 }, (_, i) => `w("s${i}").`).join(' '));
  assert.ok(r.load('z(N) :- w(S), N is S + 1.').ok);
  assert.deepEqual(r.query('z(N)').rows, []);
  assert.deepEqual(holes(r), [`$rule(${ruleFor(r, 'z')}) arith_type_error`]);
});

test('an explanation walk adds no hole of its own', () => {
  const r = new Rofl();
  // `whynot` re-runs a rule body under a head substitution the evaluation
  // never reached; asking a question must not write the store's history.
  r.assert('m("hello"). m(1).');
  assert.ok(r.load('k(N) :- m(S), N is S + 1, N > 100.').ok);
  r.query('k(N)');
  const before = holes(r);
  assert.deepEqual(before, [`$rule(${ruleFor(r, 'k')}) arith_type_error`]);
  const text = r.whynot('k(2)').text;
  assert.ok(text.length > 0);
  assert.deepEqual(holes(r), before);
});
