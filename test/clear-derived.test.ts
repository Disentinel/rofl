// test/clear-derived.test.ts — ONE CALL THAT DID NOTHING, IN TWO LAYERS.
//
// `Store.clearDerived()` is the evaluator's own reset and is also reachable by
// any caller holding the store — scanners, benchmarks, the seed path. Called
// from outside it dropped the derived layer and then let the next `evaluate()`
// return `{partial: false}` over a world of base facts.
//
//   `clearDerived` dropped the derived layer, left the store clean and left
//              the reuse fingerprints standing, so the next `evaluate()`
//              returned `{partial: false}` over a world of base facts. Two
//              layers, and the second only showed with `reuse` on, which is
//              the default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = join(import.meta.dirname, '..');
const boot = readFileSync(join(ROOT, 'boot.rofl'), 'utf8');

/** A fact that is BOTH base and derived, which is the shape that makes every
 *  question here visible: `p(a).` stands whatever happens, and `p(X) :-
 *  claimed(X).` has to be re-run to say so again. */
const BOTH = 'seed_thing(a).\nclaimed(X) :- seed_thing(X).\np(a).\np(X) :- claimed(X).\n';

test('clearDerived leaves the store asking to be evaluated again', () => {
  const r = new Rofl();
  r.load(boot);
  r.load(BOTH);
  r.evaluate();
  assert.equal(r.query('claimed(X)').rows.length, 1);
  r.store.clearDerived();
  assert.equal(r.store.dirty, true, 'a dropped derived layer is a dirty store');
  r.evaluate();
  assert.equal(r.query('claimed(X)').rows.length, 1,
    'the derived layer must come back; it did not until the flag was set');
});

test('clearDerived drops the reuse fingerprints, so reuse cannot skip what was deleted', () => {
  // THE SECOND LAYER, and it is why the flag alone was not the fix. `planReuse`
  // reads `derivedKeys` as "this relation is already served, do not run its
  // rules"; a layer dropped behind its back leaves the claim standing over
  // facts that are gone. With `reuse` off the repair was invisible, and `reuse`
  // is on by default — so a test that took the easy arm would have passed
  // against a store that still lost the layer.
  for (const reuse of [true, false]) {
    const r = new Rofl({ reuse });
    r.load(boot);
    r.load(BOTH);
    r.evaluate();
    r.store.clearDerived();
    assert.equal(r.store.derivedKeys.size, 0, `reuse=${reuse}: fingerprints survived the drop`);
    r.evaluate();
    assert.equal(r.query('claimed(X)').rows.length, 1, `reuse=${reuse}: the layer did not come back`);
  }
});

test('what a clearDerived cycle still loses is exactly the one known defect', () => {
  // Pinned rather than tolerated. The cycle restores every fact and every
  // witness but ONE row: the `derived_by` for `p`, whose firing survived the
  // drop with a premise that did not
  // (f_a_stale_firing_outlives_the_premise_it_rests_on). Repairing it is a
  // semantics decision — dropping the stale firing breaks the seed round-trip,
  // measured — so the residue is asserted here so that it cannot GROW while the
  // decision is open, and so that closing it turns this test red on purpose.
  const r = new Rofl();
  r.load(boot);
  r.load(BOTH);
  r.evaluate();
  const before = r.store.canonicalState().split('\n');
  r.store.clearDerived();
  r.evaluate();
  const after = new Set(r.store.canonicalState().split('\n'));
  const lost = before.filter((line) => !after.has(line));
  assert.equal(lost.length, 1, `expected exactly one lost row, got:\n${lost.join('\n')}`);
  assert.match(lost[0], /^derived_by\[\$kernel\]\(\$fact\(p,main,/);
});
