// Literal order must not change the answer.
//
// It did. `val(X, K) :- par(X, Y), not own_key(X, K), val(Y, K).` gave one row
// and the same rule with the negation last gave three, on the same facts, with
// `unsafe[audit]` and `malformed[audit]` both empty and `whynot` explaining an
// absence the evaluator would not admit to. The reading of `not p(X, K)` was
// decided by where the author put the comma: unbound it asks whether ANY such
// fact exists, bound it asks about that one.
//
// `planBody` fixes the reading by taking the first READY premise rather than
// the first written one, and the load door refuses a body no order can settle.

import { test } from 'node:test';
import assert from 'node:assert';
import { Rofl } from '../src/api.ts';
import { planBody } from '../src/engine.ts';
import { parseProgram } from '../src/parser.ts';

const B = 5_000_000;
const rows = (r: Rofl, q: string) => r.query(q, { budget: B }).rows.map((x) => x.text).sort();
function world(text: string): Rofl {
  const r = new Rofl();
  const res = r.load(text, { budget: B });
  assert.ok(res.ok, `load failed: ${res.diagnostics.join('; ')}`);
  return r;
}

const FACTS = 'par(b, c).\npar(c, k).\nown_key(k, k).\nown_key(c, q).\nval(K, K) :- own_key(K, K).\n';

test('the reproduction: the negation reads the same wherever it stands', () => {
  const second = world(FACTS + 'val(X, K) :- par(X, Y), not own_key(X, K), val(Y, K).\n');
  const last = world(FACTS + 'val(X, K) :- par(X, Y), val(Y, K), not own_key(X, K).\n');
  const a = rows(second, 'val(X, K)'), b = rows(last, 'val(X, K)');
  assert.deepEqual(a, b, 'the same rule, two orders, one answer');

  // WHICH answer, said out loud rather than left to whichever the plan picked:
  // the BOUND reading. `c` owns key `q` and not `k`, so `val(c, k)` stands.
  assert.ok(a.includes('K = k, X = c'),
    `the bound reading derives val(c, k); got ${JSON.stringify(a)}`);
  // POSITIVE CONTROL that the fixture can tell them apart at all: under the
  // existential reading `c` has A key, so the negation blocks and this row is
  // absent — which is exactly what the written-order evaluator produced.
  assert.equal(a.length, 3, `three rows under the bound reading; got ${JSON.stringify(a)}`);
});

test('and the instrument that explains absence agrees with the evaluator', () => {
  const r = world(FACTS + 'val(X, K) :- par(X, Y), not own_key(X, K), val(Y, K).\n');
  assert.equal(r.whynot('val(c, k)', { budget: B }).holds, true,
    'whynot used to answer "no failing premise found" about a fact the evaluator refused');
});

test('a builtin the negation needs is waited for, in either written order', () => {
  const facts = 'q(1).\nq(5).\nr(2).\n';
  const rule = 'p(X) :- q(X), Y is X + 1, not r(Y).\n';
  const moved = 'p(X) :- q(X), not r(Y), Y is X + 1.\n';
  assert.deepEqual(rows(world(facts + rule), 'p(X)'), rows(world(facts + moved), 'p(X)'));
  // and the answer is the bound one: 1 is dropped because r(2) holds, 5 stands
  assert.deepEqual(rows(world(facts + moved), 'p(X)'), ['X = 5']);
  // THIS ONE ACTUALLY MOVES, which is what says the planner is not inert: the
  // negation is written second and solved third.
  const c = parseProgram(moved)[0];
  const { plan } = planBody(c);
  assert.deepEqual(plan.map((b) => b.t), ['pos', 'bi', 'neg']);
  assert.deepEqual(c.body.map((b) => b.t), ['pos', 'neg', 'bi'], 'as written');
});

test('a wildcard is existential by construction and keeps its reading', () => {
  const r = world('q(1).\nq(2).\nr(1, x).\np(X) :- q(X), not r(X, _).\n');
  assert.deepEqual(rows(r, 'p(X)'), ['X = 2'], 'not r(X, _) asks whether ANY r(X, ...) exists');
  // a NAMED variable confined to the same literal is the same sentence
  const named = world('q(1).\nq(2).\nr(1, x).\np(X) :- q(X), not r(X, Z).\n');
  assert.deepEqual(rows(named, 'p(X)'), ['X = 2']);
});

test('a body no order can settle is refused at the door, by name', () => {
  const r = new Rofl();
  const res = r.load('q(1).\nr(2).\ns(3).\np(X) :- q(X), not r(Y), not s(Y).\n', { budget: B });
  assert.equal(res.ok, false, 'Y is bound by no positive premise and shared by two negations');
  const d = res.diagnostics.join(' ');
  assert.match(d, /\bY\b/, `the refusal must name the variable; got: ${d}`);
  assert.match(d, /not r\/1|not s\/1/, `and the literal; got: ${d}`);
  // NEGATIVE CONTROL: bind Y in a positive premise and the same shape loads
  const ok = new Rofl().load('q(1).\nr(2).\ns(3).\nt(2).\np(X) :- q(X), t(Y), not r(Y), not s(Y).\n', { budget: B });
  assert.equal(ok.ok, true, `the bound form must still load: ${ok.diagnostics.join('; ')}`);
});

test('permuting a body does not change the answer, over every permutation', () => {
  // The bug's own rule, because a fixture that cannot tell the orders apart
  // proves nothing: on this one the written-order evaluator gave one row for
  // two of the six permutations and three for the other four.
  const parts = ['par(X, Y)', 'not own_key(X, K)', 'val(Y, K)'];
  const perms: string[][] = [];
  const permute = (left: string[], acc: string[]) => {
    if (left.length === 0) { perms.push([...acc]); return; }
    for (let i = 0; i < left.length; i++) {
      permute([...left.slice(0, i), ...left.slice(i + 1)], [...acc, left[i]]);
    }
  };
  permute(parts, []);
  assert.equal(perms.length, 6, 'positive control: six permutations of three premises');

  // THE DERIVED FACTS, not `canonicalState` — which is what the first version
  // of this compared, and it went red for the right reason in the wrong place:
  // a witness records its premises in SOLVE order, and two permutations are
  // two different rule texts with two different ids, so their provenance
  // differs while their conclusions must not. The claim is about answers.
  const answers = perms.map((p) => {
    const r = new Rofl();
    const res = r.load(`${FACTS}val(X, K) :- ${p.join(', ')}.\n`, { budget: B });
    assert.ok(res.ok, `permutation ${p.join(', ')} was refused: ${res.diagnostics.join('; ')}`);
    return r.store.relAll('val').map((f) => f.key).sort().join('\n');
  });
  for (let i = 1; i < answers.length; i++) {
    assert.equal(answers[i], answers[0],
      `permutation ${perms[i].join(', ')} disagrees with ${perms[0].join(', ')}`);
  }
  assert.equal(answers[0].split('\n').length, 3,
    'positive control: the rule derives three facts, so the equality above is not equality of nothing');
});

test('MUTANTS: where this gate cannot look', () => {
  // (1) a negation whose only free variable is the PERSPECTIVE, not an argument
  const p = new Rofl().load('[k] q(1).\nbook(k).\np(X) :- q(X), not [P] r(X).\n', { budget: B });
  assert.equal(p.ok, false, 'a free perspective variable in a negation is the same ambiguity');

  // (2) a one-element body has no order to get wrong — the plan must not choke
  const one = parseProgram('p(X) :- q(X).\n')[0];
  assert.equal(planBody(one).stuck, null);
  assert.deepEqual(planBody(one).plan.map((b) => b.t), ['pos']);

  // (3) a body of negations ONLY, every variable confined to its own literal:
  //     existential throughout, nothing to bind, and it must still load
  const only = new Rofl().load('r(2).\np(1) :- not r(Z).\n', { budget: B });
  assert.equal(only.ok, true, `all-existential body: ${only.diagnostics.join('; ')}`);

  // (4) the head is a CONCLUSION, not a binder, so `p(Y) :- q(X), not r(Y).`
  //     has no order that settles Y — and it must still LOAD, because it is
  //     already a range-restriction violation, already unsafe, and already
  //     reported by the audit that computes range restriction in ROFL. The
  //     door refuses only rules that would otherwise pass silently; refusing
  //     this one would take away the program a working audit needs to find.
  //     The first version of the door did refuse it, and took test/head-vars
  //     with it — `negonly(Q) :- not tag(Q).` is loaded there on purpose.
  const fromHead = new Rofl().load('q(1).\nr(2).\np(Y) :- q(X), not r(Y).\n', { budget: B });
  assert.equal(fromHead.ok, true, 'an unrange-restricted head keeps its long-standing verdict');
  // and the SAME shape with a bound head IS refused, so (4) is not the door
  // being asleep
  const ground = new Rofl().load('q(1).\nr(2).\np(1) :- q(X), not r(Y), not s(Y).\n', { budget: B });
  assert.equal(ground.ok, false, 'a ground head leaves the negation as the only ambiguity');
});
