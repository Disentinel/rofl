// test/space.test.ts — THE MATERIALIZATION WALL, AND WHO DECIDES WHERE IT IS.
//
// `Evaluation` has read `opts.space` since it was written and nothing ever put
// it there, so the wall was a hard 500 000 rows for every caller — while
// src/reflect.ts:249 says `budget_exhausted` and `space_exhausted` demand
// OPPOSITE repairs, advice nobody could act on in either direction.
//
// `examples/reach` is the demo: 480 services whose reachability closure is
// 111 360 pairs by closed form, refused at the default and complete at two
// million. These are the unit-sized version of the same two facts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = join(import.meta.dirname, '..');
const boot = readFileSync(join(ROOT, 'boot.rofl'), 'utf8');

/** A deliberate cross product: `e` has N rows and the body joins it to itself
 *  on nothing, so the intermediate is N squared. Deliberate BECAUSE the wall
 *  exists for exactly this too — `examples/reach` carries the other case,
 *  where the answer is honestly quadratic and no reordering helps. */
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
