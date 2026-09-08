// test/space-and-clear-derived.test.ts — TWO SETTINGS THAT WERE UNREACHABLE
// AND ONE CALL THAT DID NOTHING.
//
// Both are the class this repository keeps paying for: a knob nothing exercises
// cannot go red, so its absence is invisible from every gate we own. These are
// the demos.
//
//   `space`  — `Evaluation` has read `opts.space` since it was written and
//              nothing ever put it there, so the materialization wall was a
//              hard 500 000 rows for every caller. The kernel's own comment
//              (src/reflect.ts:249) says `budget_exhausted` and
//              `space_exhausted` demand OPPOSITE repairs — and a caller could
//              act on neither.
//
//   `clearDerived` — dropped the derived layer, left the store clean and left
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

/** A deliberate cross product: `e` has N rows and the body joins it to itself
 *  on nothing, so the intermediate is N squared. 900 gives 810 000, which is
 *  above the default wall and below anything that would hurt to hold. */
function crossProduct(n: number): string {
  return 'pair(X, Y) :- e(X), e(Y).\n'
    + Array.from({ length: n }, (_, i) => `e(${i}).`).join('\n');
}

const holes = (r: Rofl) => r.query('hole(A, B)').rows.map((x) => x.text).join('; ');

test('the space wall is where the caller puts it, and it refuses when crossed', () => {
  const tight = new Rofl();
  tight.load(boot);
  tight.load(crossProduct(900));
  tight.evaluate(2_000_000_000);
  assert.match(holes(tight), /space_exhausted/,
    'the default wall must still refuse a cross product');
  assert.equal(tight.query('pair(X, Y)').rows.length, 0);

  const roomy = new Rofl({ space: 2_000_000 });
  roomy.load(boot);
  roomy.load(crossProduct(900));
  roomy.evaluate(2_000_000_000);
  assert.doesNotMatch(holes(roomy), /space_exhausted/,
    'a raised wall must let the same program past it');
  assert.ok(roomy.query('pair(X, Y)').rows.length > 0);
});

test('a fork carries the space its parent was given', () => {
  // The setting is a property of the session — what the machine can hold —
  // so a fork that dropped it would evaluate under a wall its parent does not
  // have, and the difference would show only on a big world.
  const parent = new Rofl({ space: 2_000_000 });
  parent.load(boot);
  const child = parent.fork();
  child.load(crossProduct(900));
  child.evaluate(2_000_000_000);
  assert.doesNotMatch(holes(child), /space_exhausted/);
  assert.ok(child.query('pair(X, Y)').rows.length > 0);
});

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
