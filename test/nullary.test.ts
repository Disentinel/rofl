// test/nullary.test.ts — WHAT THE NULLARY AUDIT CAN AND CANNOT SEE.
//
// `rules/nullary.rofl` derives, from the reflection alone, which relations are
// propositions wearing a dummy argument and which rules carry a head variable
// only so there is something to name. Between 2026-09-10 morning and evening
// its answer over the tree's 48 packs went from 49 rows to 1, and every step of
// that fall was a defect in the MODEL rather than work anybody did:
//
//     49  the first sweep
//     45  -4  three guards on `dressed_constant`: two constant tuples, an
//             argument a consumer binds, a variable nested in `$fact`
//     36  -9  the nine constants converted (kernel-policy, parse-cost, profile)
//     24  -12 `$builtin` operands opened, as `joins` and not as `mentions`
//      9  -15 the verdict made per RULE: every head variable must be droppable
//      1  -8  the `$lit` PERSPECTIVE slot walked, and a passenger required to
//             have a positive premise that feeds nothing into the head
//
// A NUMBER THAT FALLS BECAUSE THE INSTRUMENT NARROWED LOOKS EXACTLY LIKE ONE
// THAT FALLS BECAUSE THE WORK WAS DONE. So this file is the positive control:
// every guard added above is planted here as a mutant that MUST still fire,
// and every narrowing is planted as a negative control that MUST stay silent.
// Without it, "1 of 49" is a claim about a model nobody measured.
//
// The last two tests are the SURVIVORS — where the model is structurally
// unable to look, written down rather than discovered later.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const NULLARY = fs.readFileSync(path.join(ROOT, 'rules/nullary.rofl'), 'utf8');
const BUDGET = 20_000_000;

const unq = (t: unknown): string => String(t).replace(/^"|"$/g, '');

/** A program plus the audit, evaluated together. The audit reads the
 *  REFLECTION of the rules in the store, so the program under test has to be
 *  loaded into the same store — which also means the audit's own rules are in
 *  the population, and the assertions below name relations rather than count
 *  rows for exactly that reason. */
function audit(program: string) {
  const r = new Rofl();
  const a = r.load(program, { who: 'tester', budget: BUDGET });
  assert.ok(a.ok, `program: ${a.diagnostics.join('; ')}`);
  const b = r.load(NULLARY, { who: 'tester', budget: BUDGET });
  assert.ok(b.ok, `rules/nullary.rofl: ${b.diagnostics.join('; ')}`);
  r.evaluate(BUDGET);
  assert.equal(r.query('hole(Q, W)').rows.length, 0, 'the audit left no hole');
  return {
    constants: r.query('dressed_constant[audit](Rel)').rows.map((x) => unq(x.bindings.Rel)).sort(),
    wants: r.query('wants_nullary[audit](Rel)').rows.map((x) => unq(x.bindings.Rel)).sort(),
    passengers: r.query('passenger[audit](R, V)').rows.map((x) => unq(x.bindings.V)).sort(),
  };
}

// ------------------------------------------------------- the two live shapes

test('POSITIVE CONTROL: a proposition wearing a dummy argument is named', () => {
  // The shape `wf_declared(yes)` had: one rule, one constant, and every
  // consumer reading that same constant back. Without this test every guard
  // below could be a way of answering nothing.
  const a = audit(`
    neg_rule(r1).
    flag(yes)  :- neg_rule(_).
    gated(X)   :- neg_rule(X), flag(yes).
  `);
  assert.ok(a.constants.includes('flag'), `constants were ${a.constants.join(', ')}`);
  assert.ok(a.wants.includes('flag'));
});

test('POSITIVE CONTROL: a head variable riding on an existential is named', () => {
  // `any_unblocker(W) :- takeable(W), unblocking_work(_).` — the rule the
  // finding quoted when it argued for nullary heads at all.
  const a = audit(`
    takeable(w1). takeable(w2). unblocking_work(w1).
    rider(W) :- takeable(W), unblocking_work(_).
  `);
  assert.deepEqual(a.passengers, ['W']);
  assert.ok(a.wants.includes('rider'), `wants was ${a.wants.join(', ')}`);
});

// ------------------------- the guards on `dressed_constant`, one mutant each

test('mutant: TWO constant tuples are a table, not a proposition', () => {
  // `slow_because(fixpoint, barren_rules)` and `slow_because(fixpoint,
  // late_filter)` — no variable in either head, and the argument is the entire
  // content of the relation. `not varying_head` alone said proposition.
  const a = audit(`
    p(1). q(1).
    two(fixpoint, barren) :- p(_).
    two(fixpoint, late)   :- q(_).
    one(fixpoint)         :- p(_).
  `);
  assert.ok(!a.constants.includes('two'), 'a relation with two head shapes is a table');
  assert.ok(a.constants.includes('one'), 'positive control: the same rule with one shape IS named');
});

test('mutant: an argument a consumer BINDS is data, not a dress', () => {
  // `saves_nothing(reuse_plan)` feeds `pure_overhead(P) :- saves_nothing(P),
  // ...` and the constant travels out as the answer's name.
  const a = audit(`
    p(1). other(x).
    named(reuse_plan) :- p(_).
    kept(fixpoint)    :- p(_).
    reads(P)          :- named(P), other(_).
    keeps(X)          :- other(X), kept(fixpoint).
  `);
  assert.ok(!a.constants.includes('named'), 'a bound argument is read, so it is not a dummy');
  assert.ok(a.constants.includes('kept'), 'positive control: the one read back as a constant IS named');
});

test('mutant: a variable NESTED in a head term is still a head variable', () => {
  // `forged[audit]($fact(R, P, A))` — the `$cons` spine carries `$fact(...)`,
  // not `$var(...)`, so the head read as constant until `$fact` was named.
  const a = audit(`
    asserted_by($fact(rel, main, $nil), user, t1).
    wrapped($fact(R, P, A)) :- asserted_by($fact(R, P, A), user, _).
  `);
  assert.ok(!a.constants.includes('wrapped'),
    `a nested variable is a head variable; constants were ${a.constants.join(', ')}`);
});

// ---------------------------- the guards on `passenger`, one mutant each

test('mutant: a BUILTIN joins two premises that share no argument', () => {
  // `being_fed(F, Pct) :- fed_share(F, Pct), fed_cut(C), Pct >= C.` — the hole
  // this model recorded and deliberately left open for a day.
  const a = audit(`
    fed_share("a.ts", 40). fed_cut(15).
    fed(F, Pct) :- fed_share(F, Pct), fed_cut(C), Pct >= C.
  `);
  assert.deepEqual(a.passengers, [], 'the comparison joins them');
  assert.ok(!a.wants.includes('fed'));
});

test('mutant: a PERSPECTIVE variable joins two premises', () => {
  // `mechanism_seen[audit](M) :- env_ran(E), resolve_via[E](_, M, _).` — the
  // join runs through the book, which is a slot of `$lit` the walk skipped.
  const a = audit(`
    env_ran(node).
    resolve_via[node](a, exports, b).
    seen(M) :- env_ran(E), resolve_via[E](_, M, _).
  `);
  assert.deepEqual(a.passengers, [], 'the book joins them');
  assert.ok(!a.wants.includes('seen'));
});

test('mutant: a DELIBERATE product whose head is the product', () => {
  // `cell[audit](Lang, K, L) :- node_kind(Lang, K), layer(L).` — two
  // disconnected premises, and every variable of both is read downstream.
  const a = audit(`
    node_kind(js, call). layer(dataflow). layer(scope).
    grid(Lang, K, L) :- node_kind(Lang, K), layer(L).
  `);
  assert.deepEqual(a.passengers, [], 'nothing here rides: the head IS the product');
  assert.ok(!a.wants.includes('grid'));
});

test('mutant: ONE passenger among two head variables is not a nullary head', () => {
  // `share(R, P) :- touched(R, T), total_width(A), P is T * 100 / A.` — drop R
  // and the relation narrows; it does not become a proposition.
  const a = audit(`
    touched(r1, 40). total_width(200).
    sh(R, P) :- touched(R, T), total_width(A), P is T * 100 / A.
  `);
  assert.ok(!a.wants.includes('sh'),
    `a head with a stayer is not a proposition; wants was ${a.wants.join(', ')}`);
});

test('mutant: a NEGATED premise is a test and never makes a passenger', () => {
  // Range restriction means a negation can never feed the head, so counting
  // negations as guards would make every `p(X) :- q(X), not r(_).` a passenger
  // rule — and X is that relation's subject.
  const a = audit(`
    q(1). r(2).
    p(X) :- q(X), not r(_).
  `);
  assert.deepEqual(a.passengers, []);
  assert.ok(!a.wants.includes('p'));
});

test('NEGATIVE CONTROL: a head that is ALREADY nullary is not a candidate', () => {
  // The demo caught this in its first minute: `$nil` args carry no variables,
  // so a nullary head read as a constant head and the model recommended the
  // thing it was looking at.
  const a = audit(`
    service(a). healthy(a).
    blocked() :- service(S), not healthy(S).
    ship(S)   :- service(S), not blocked().
  `);
  assert.ok(!a.constants.includes('blocked'), 'the destination is not a candidate');
  assert.ok(!a.wants.includes('blocked'));
});

// ----------------------------------------------------------- the survivors

test('SURVIVOR: a variable inside an ARITHMETIC operand is invisible', () => {
  // `P is T * 100 / A` reifies its right operand as a compound, and the walk
  // sees the `$cons` spine only — so `T` never appears and `touched(R, T)`
  // reads as disconnected from a comparison that in fact uses it. Measured:
  // `str_pre(S, "/")` IS writable as a term pattern and could be named the way
  // `$fact` is, but an OPERATOR functor is not — `*(A, B)` is refused by the
  // parser with `expected a term, got '*'`. So the hole can be closed for
  // seven destructors and never for arithmetic, and a half-closed hole that
  // reads as closed is worse than one that is written down.
  //
  // WHAT IT COSTS IS BOUNDED AND STATED: a false `passenger` row. It cannot
  // reach `wants_nullary` unless it is the rule's ONLY head variable, which is
  // what the previous test measures.
  const a = audit(`
    touched(r1, 40). total_width(200).
    sh(R, P) :- touched(R, T), total_width(A), P is T * 100 / A.
  `);
  assert.deepEqual(a.passengers, ['R'],
    'SURVIVED: T hides inside the arithmetic, so its premise reads disconnected');
});

test('SURVIVOR: a USER functor in a head reads as a constant', () => {
  // `$fact` is named because it is the kernel's own reified fact, the way
  // safety.rofl names `$lit`, `$not` and `$builtin`. An arbitrary functor
  // cannot be — safety.rofl says why in as many words, "a term carries an
  // arbitrary functor and Datalog cannot destructure one it does not name",
  // which is why the kernel seeds `premise_var` from the host instead. There
  // is no type test to fall back on either: `str_len` refuses an atom, a
  // number and a compound alike.
  const a = audit(`
    left(1). right(2).
    paired($pair(A, B)) :- left(A), right(B).
  `);
  assert.ok(a.constants.includes('paired'),
    'SURVIVED: the model cannot see A and B inside a functor it does not know');
});
