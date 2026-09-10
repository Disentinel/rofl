// test/layering.check.ts — THE BOUNDARY INVARIANTS.
//
// `.check.ts` and not `.test.ts`, for the same reason as its neighbour: the
// owner's instruction of 2026-09-10 is that a new table is used in anger
// before it becomes a gate. `npm run layercheck` runs it.
//
// THE TWO INVARIANTS, and they are not symmetric. `deep_crossing` is a library
// reaching past the engine's declared surface — untidy, and a ratchet is the
// right shape. `inversion` is the ENGINE knowing about a library, which is the
// promise the kernel grep test makes one level in, and there is no acceptable
// number for it other than zero.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, n, pairs } from '../scanners/layering_report.ts';

test('the model fits: no hole, and all three sides are populated', () => {
  const r = build();
  assert.deepEqual(r.query('hole(Q, W)').rows.map((x) => String(x.bindings.W)), [],
    'a budget or space wall — every count below would be about the wall');
  for (const s of ['engine', 'library', 'harness']) {
    assert.ok(n(r, `side(P, ${s})`) > 5, `side ${s} is populated`);
  }
  assert.ok(n(r, 'crossing(A, B)') > 10, 'positive control: the library does enter the engine');
});

test('THE ENGINE KNOWS NOTHING ABOUT ANY LIBRARY — inversion is zero, always', () => {
  const r = build();
  assert.deepEqual(pairs(r, 'inversion[audit](A, B)'), [],
    'the engine reached into a library. This is the kernel grep test\'s promise ' +
    'one level out: src/, boot.rofl, policy.rofl, safety.rofl and the port may ' +
    'not name a domain. There is no acceptable number here but zero.');
});

test('deep crossings are a named set, not a count', () => {
  const r = build();
  // A SET AND NOT A NUMBER, because a count sleeps through a swap — remove one,
  // add one. Two today, both in one file, both reaching for a TYPE and a
  // parser the public surface does not re-export.
  assert.deepEqual(pairs(r, 'deep_crossing[audit](A, B)'), [
    'test/js-ast.test.ts -> src/parser.ts',
    'test/js-ast.test.ts -> src/unify.ts',
  ], 'a library entered the engine somewhere other than src/api.ts, src/store.ts or boot.rofl');
});

test('mutant: a library reaching a new engine internal is reported by name', () => {
  const r = build();
  const before = pairs(r, 'deep_crossing[audit](A, B)').length;
  r.assert('edge[dep]("rules/js-probe.rofl", "src/engine.ts", ts_import).', { who: 'scanner' });
  r.assert('artifact[dep]("rules/js-probe.rofl", rofl).', { who: 'scanner' });
  r.evaluate(80_000_000);
  const after = pairs(r, 'deep_crossing[audit](A, B)');
  assert.equal(after.length, before + 1);
  assert.ok(after.includes('rules/js-probe.rofl -> src/engine.ts'));
});

test('mutant (NEGATIVE CONTROL): a library reaching the SURFACE is not a deep crossing', () => {
  // If the surface list were ignored, every one of the 56 crossings would be
  // reported and the audit would be a census wearing an alarm.
  const r = build();
  const before = pairs(r, 'deep_crossing[audit](A, B)').length;
  r.assert('edge[dep]("rules/js-probe.rofl", "src/api.ts", ts_import).', { who: 'scanner' });
  r.assert('artifact[dep]("rules/js-probe.rofl", rofl).', { who: 'scanner' });
  r.evaluate(80_000_000);
  assert.equal(pairs(r, 'deep_crossing[audit](A, B)').length, before,
    'entering through the front door is what a library is FOR');
});
