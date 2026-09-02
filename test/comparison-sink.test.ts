// comparison-sink.test.ts — every operation that can fail must be able to say
// so, IN EVERY CONTEXT WHERE IT CAN APPEAR.
//
// The invariant, and what broke it. `is` has had a failure sink since the day
// `N is "hello" + 1` was found producing no rows and no diagnostic: it emits
// `hole(rule, reason)` so a store can be ASKED why a rule derived nothing.
// COMPARISON never got one, and that decision was documented and HARMLESS at
// the time — every operand of a comparison was a plain term or arithmetic that
// could not fail interestingly, so the branch was unreachable by a real
// refusal. String destructors made it reachable, and the silence observable.
//
// Measured before the repair: `str_len(7) < 5` gave no rows and NO hole, while
// `N is str_len(7)` gave the hole `str_type_error`. Same inability, one
// audible and one mute. And a second asymmetry with no reason a reader could
// find: `N is str_len(S), N < 5` worked while `str_len(S) < 5` was silently
// false for ever.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';

const BOOT = fs.readFileSync(new URL('../boot.rofl', import.meta.url), 'utf8');

interface Out { rows: number; holes: string[] }
function run(prog: string, q: string): Out {
  const r = new Rofl();
  assert.ok(r.load(BOOT).ok);
  const res = r.load(prog);
  assert.ok(res.ok, res.diagnostics[0] ?? '');
  r.evaluate(200_000);
  return {
    rows: r.query(q).rows.length,
    holes: r.query('hole(I, R)').rows.map((x) => String(x.bindings['R'])).sort(),
  };
}

test('a destructor works inside a comparison, as it does beside `is`', () => {
  // the asymmetry that had no reason: both forms must now agree
  const twoStep = run('edb(w).\nw("ab").\nshort(S) :- w(S), N is str_len(S), N < 5.', 'short(S)');
  const direct  = run('edb(w).\nw("ab").\nshort(S) :- w(S), str_len(S) < 5.', 'short(S)');
  assert.equal(twoStep.rows, 1);
  assert.equal(direct.rows, 1, 'the direct form was silently false before this');
  assert.deepEqual(direct.holes, [], 'and it succeeds, so it says nothing');
  // every ordering operator goes through the same branch, so all four are checked
  for (const op of ['<', '<=', '>', '>=']) {
    const o = run(`edb(w).\nw("ab").\nq(S) :- w(S), str_len(S) ${op} 5.`, 'q(S)');
    assert.deepEqual(o.holes, [], `${op}: an honest comparison must stay quiet`);
  }
});

test('a refusal inside a comparison is now AUDIBLE, and names which refusal', () => {
  const wrongType = run('edb(w).\nw(7).\nq(S) :- w(S), str_len(S) < 5.', 'q(S)');
  assert.equal(wrongType.rows, 0);
  assert.deepEqual(wrongType.holes, ['str_type_error'],
    'a non-string operand refuses, and says so — it used to be mute');
  // a destructor answering a STRING cannot be ordered by `<`, which reads numbers
  const notANumber = run('edb(w).\nw("a-b").\nq(S) :- w(S), str_seg(S, "-", 0) < 5.', 'q(S)');
  assert.equal(notANumber.rows, 0);
  assert.deepEqual(notANumber.holes, ['str_type_error']);
});

test('NEGATIVE SIDE: what was quiet and SHOULD be quiet, still is', () => {
  // ordinary arithmetic comparison, the overwhelmingly common case
  const plain = run('edb(w).\nw(3).\nq(S) :- w(S), S < 5.', 'q(S)');
  assert.equal(plain.rows, 1);
  assert.deepEqual(plain.holes, []);
  // an honestly FALSE comparison is not an inability and must emit nothing
  const isFalse = run('edb(w).\nw(9).\nq(S) :- w(S), S < 5.', 'q(S)');
  assert.equal(isFalse.rows, 0);
  assert.deepEqual(isFalse.holes, [], 'false is not the same as could-not-tell');
  // AN UNBOUND OPERAND IS "not ready yet", not a refusal. Emitting here would
  // put a hole under every ordinary rule and flood the store while the suite
  // stayed green — the reason `is` carries the same exception.
  const unbound = run('edb(w).\nw(3).\nq(S) :- w(S), S < Z.', 'q(S)');
  assert.equal(unbound.rows, 0);
  assert.deepEqual(unbound.holes, [], 'an unbound variable must stay silent');
});

test('THE SHARED SINK: a refusal in the FIRST operand is not overwritten by the second', () => {
  // `arithFail` is ONE reused object. The old code evaluated both operands and
  // then looked — which reports the SECOND operand's code for a failure in the
  // first. Here the left refuses (non-string) and the right is a plain number,
  // so a shared-sink bug would report the right operand's state instead.
  const leftFails = run('edb(w).\nw(7).\nq(S) :- w(S), str_len(S) < 5.', 'q(S)');
  assert.deepEqual(leftFails.holes, ['str_type_error'],
    'the left operand refused and its reason survived');
  // and the mirror: right refuses, left is fine
  const rightFails = run('edb(w).\nw(7).\nq(S) :- w(S), 5 < str_len(S).', 'q(S)');
  assert.deepEqual(rightFails.holes, ['str_type_error']);
  // one hole per rule, not one per substitution — a rule failing over many rows
  // must not leave one hole per row
  const many = run('edb(w).\nw(1). w(2). w(3). w(4). w(5).\nq(S) :- w(S), str_len(S) < 5.', 'q(S)');
  assert.equal(many.rows, 0);
  assert.equal(many.holes.length, 1, 'five refusing rows, ONE hole');
});

test('an explanation walk must not write the store', () => {
  // `why`/`whynot` re-evaluate, and a walk that emitted holes would pollute the
  // history with rows nobody asserted. Same exception `is` already carries.
  const r = new Rofl();
  assert.ok(r.load(BOOT).ok);
  assert.ok(r.load('edb(w).\nw(7).\nq(S) :- w(S), str_len(S) < 5.').ok);
  r.evaluate(200_000);
  const before = r.query('hole(I, R)').rows.length;
  r.whynot('q(7)');
  r.why('w(7)');
  assert.equal(r.query('hole(I, R)').rows.length, before,
    'an explanation walk added holes to the store');
});
