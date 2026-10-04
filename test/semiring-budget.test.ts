// A fold that runs out of rounds reports a spent budget, not a false
// declaration; a BOUNDED instance that declares its height is given a cap
// derived from it, and is refuted only by running that proven bound in full.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { evaluateSemiring, heightBound, BOUNDED, type Semiring } from '../src/semiring.ts';
import { chaosSemiring } from '../runtime/semirings.ts';
import { world, chaosWeight, clashSet } from '../examples/heck/demo.ts';

const BOOT = fs.readFileSync(new URL('../boot.rofl', import.meta.url), 'utf8');

test('HECK at ceiling 4000: converged with a declared height, exhausted (not false) without', () => {
  const r = world();
  assert.ok(clashSet(r).length < 4000);
  const declared = evaluateSemiring(r.store, chaosSemiring(4000), { weight: chaosWeight });
  assert.equal(declared.converged, true);
  assert.equal(declared.exhausted, false);
  assert.equal(declared.disciplineHeld, true);
  assert.ok(declared.rounds > 1000, `needed more than the flat default: ${declared.rounds}`);

  // same instance, no declared height: the flat default of 1000 runs out
  const flat = evaluateSemiring(r.store, { ...chaosSemiring(4000), height: undefined }, { weight: chaosWeight });
  assert.equal(flat.rounds, 1000);
  assert.equal(flat.converged, false);
  assert.equal(flat.exhausted, true);
  assert.equal(flat.disciplineHeld, null, 'an exhausted budget is not a refutation');
});

function cycle(): Rofl {
  const r = new Rofl();
  assert.ok(r.load(BOOT).ok);
  assert.ok(r.load('p(a). p(X) :- q(X). q(X) :- p(X).').ok);
  return r;
}

// counting over a cycle never stabilises under plain iteration: a false BOUNDED declaration
const lying: Semiring<bigint> = {
  discipline: BOUNDED, height: 2,
  zero: 0n, one: 1n,
  plus: (a, b) => a + b, times: (a, b) => a * b, eq: (a, b) => a === b,
};

test('a declared height that is false is refuted at the proven bound, and only there', () => {
  const r = cycle();
  const bound = heightBound(2, r.store.allFactKeys().length);
  const res = evaluateSemiring(r.store, lying, { maxRounds: bound });
  assert.equal(res.rounds, bound);
  assert.equal(res.exhausted, false);
  assert.equal(res.disciplineHeld, false);
  const dflt = evaluateSemiring(r.store, lying);
  assert.equal(dflt.rounds, bound, 'the declared height sizes the cap');
  assert.equal(dflt.disciplineHeld, false);
  // a caller's smaller budget proves nothing
  const small = evaluateSemiring(r.store, lying, { maxRounds: bound - 1 });
  assert.equal(small.exhausted, true);
  assert.equal(small.disciplineHeld, null);
});

test('a BOUNDED instance with no height is never called false', () => {
  const r = cycle();
  const res = evaluateSemiring(r.store, { ...lying, height: undefined }, { maxRounds: 50 });
  assert.equal(res.rounds, 50);
  assert.equal(res.converged, false);
  assert.equal(res.exhausted, true);
  assert.equal(res.disciplineHeld, null);
});
