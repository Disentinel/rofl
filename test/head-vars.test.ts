// head-vars.test.ts — what became expressible when `$` stopped being a
// parse error: the reflection is now readable from the language that emits it.
//
// `conclusion_lit(R, 1, $lit(Rel, Persp, Args, Tense))` has always carried the
// head's ARGUMENT LIST IN ORDER, with each variable's own name, and a rule
// could not reach any of it — the payload is a `$lit(...)` term and `$` was
// unwritable in surface syntax. The kernel worked around its own ban by
// emitting `conclusion_tense` as a separate flat fact (src/reflect.ts, the
// note above the emission), which is one field rescued out of four.
//
// The program below reaches all of them. It walks the reified argument list
// positionally, so it can say WHICH VARIABLE STANDS AT WHICH POSITION in a
// rule head, and then answers a real question with it: which head variables no
// positive premise can bind — range restriction, computed inside ROFL over
// ROFL's own reflection.
//
// That answer has an exact host oracle: `Evaluation.rules[].safe` is the same
// property computed in TypeScript. The tests below compare the two SETS, on a
// program built to contain both kinds of rule.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

/** Reads the reflection through `$`. Self-contained: nothing here is a
 *  builtin, and every line of it was a parse error before src/parser.ts
 *  admitted `$` in leading position. */
export const HEAD_VARS = `
-- the head's argument list, walked positionally
head_walk(R, 1, A, Rest) :- conclusion_lit(R, 1, $lit(_, _, $cons(A, Rest), _)).
head_walk(R, K, A, Rest) :- head_walk(R, J, _, $cons(A, Rest)), K is J + 1.
head_var(R, K, Name)     :- head_walk(R, K, $var(Name), _).

-- every variable a POSITIVE premise can bind. '$not(...)' and '$builtin(...)'
-- do not match '$lit(...)', so a variable that only ever appears under a
-- negation is correctly not counted as bound.
prem_walk(R, A, Rest) :- premise_lit(R, _, $lit(_, _, $cons(A, Rest), _)).
prem_walk(R, A, Rest) :- prem_walk(R, _, $cons(A, Rest)).
prem_walk(R, A, Rest) :- prem_walk(R, $cons(A, Rest), _).
prem_walk(R, A, Rest) :- prem_walk(R, $lit(_, _, $cons(A, Rest), _), _).
prem_walk(R, A, Rest) :- prem_walk(R, $builtin(_, $cons(A, Rest)), _).
prem_walk(R, A, $nil) :- prem_walk(R, $var(A), _).
prem_var(R, Name)     :- prem_walk(R, $var(Name), _).
prem_var(R, Name)     :- prem_walk(R, _, $var(Name)).
-- 'X is Expr' binds X: the mode table says the left operand is the output
prem_var(R, Name)     :- premise_lit(R, _, $builtin("is", $cons($var(Name), _))).

unbound_head_var[audit](R, K, Name) :- head_var(R, K, Name), not prem_var(R, Name).
`;

const DEMO = `
route(A, B, C)  :- edge(A, B), edge(B, C).
counted(A, N)   :- edge(A, _), N is 1 + 1.
dangling(A, Z)  :- edge(A, _).
negonly(Q)      :- not tag(Q).
edge(x, y).
edge(y, z).
tag(y).
-- reading the map back out for one named relation
route_head_var(K, N) :- concludes(R, route), head_var(R, K, N).
`;

function build(...programs: string[]) {
  const r = new Rofl();
  for (const p of programs) {
    const res = r.load(p);
    assert.ok(res.ok, 'load failed: ' + JSON.stringify(res.diagnostics));
  }
  r.evaluate();
  return r;
}

const rows = (r: Rofl, q: string) => r.query(q).rows.map((x) => x.text).sort();

test('which variable stands at which position in a rule head', () => {
  const r = build(BOOT, HEAD_VARS, DEMO);
  // The headline: the head's argument list, in order, with the source names.
  assert.deepEqual(rows(r, 'route_head_var(K, N)'),
    ['K = 1, N = "A"', 'K = 2, N = "B"', 'K = 3, N = "C"']);
});

test('range restriction, computed in ROFL, equals the host oracle', () => {
  const r = build(BOOT, HEAD_VARS, DEMO);

  // CONTROL: the walker actually looked. Without this, an agreement of two
  // empty sets below would be a fact about the probe, not about the program.
  const seen = r.query('head_var(R, K, N)').rows.length;
  assert.ok(seen > 40, `the walker must reach many rules, saw ${seen}`);

  const flagged = new Set(r.query('unbound_head_var[audit](R, K, N)').rows.map((x) => x.bindings.R));
  const ev = new Evaluation(r.store);
  const unsafe = new Set(ev.rules.filter((x) => !x.safe).map((x) => x.id));

  // CONTROL: the oracle is non-empty, so set equality is not vacuous.
  assert.equal(unsafe.size, 2, 'the demo carries exactly two unsafe rules');
  assert.deepEqual([...flagged].sort(), [...unsafe].sort(),
    'ROFL and TypeScript must name the same rules');

  // and it names the position and the variable, which the host oracle does not
  const byRel = new Map(ev.rules.map((x) => [x.id, x.canon]));
  const named = [...r.query('unbound_head_var[audit](R, K, N)').rows]
    .map((x) => `${byRel.get(x.bindings.R)!.split('[')[0]} #${x.bindings.K} ${x.bindings.N}`).sort();
  assert.deepEqual(named, ['dangling #2 "Z"', 'negonly #1 "Q"']);
});

test('the gate says no as well as yes: binding the variable clears the flag', () => {
  // Same program, one rule repaired. If `unbound_head_var` flagged on some
  // incidental property rather than on binding, this would not move.
  const REPAIRED = DEMO
    .replace('dangling(A, Z)  :- edge(A, _).', 'dangling(A, Z)  :- edge(A, Z).')
    .replace('negonly(Q)      :- not tag(Q).', 'negonly(Q)      :- edge(Q, _), not tag(Q).');
  const r = build(BOOT, HEAD_VARS, REPAIRED);
  assert.deepEqual(rows(r, 'unbound_head_var[audit](R, K, N)'), []);
  const ev = new Evaluation(r.store);
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), [],
    'and the host agrees the repair worked');
});

test('the walker is clean on boot.rofl and on itself', () => {
  const r = build(BOOT, HEAD_VARS);
  assert.ok(r.query('head_var(R, K, N)').rows.length > 40, 'it looked');
  assert.deepEqual(rows(r, 'unbound_head_var[audit](R, K, N)'), [],
    'boot.rofl and the walker itself are range-restricted');
  const ev = new Evaluation(r.store);
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), []);
});
