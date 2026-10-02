// A fact derived through an aggregate holds its members in the semiring fold:
// the sealed cell a witness cites is opened into its members' premises.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { evaluateSemiring } from '../src/semiring.ts';
import {
  countingSemiring, provenanceSemiring, provenanceOf, tropicalSemiring, unitFiringCost, INFINITE,
  booleanSemiring, depthBoundedCountingSemiring,
} from '../runtime/semirings.ts';

const BOOT = fs.readFileSync(new URL('../boot.rofl', import.meta.url), 'utf8');

function world(program: string): Rofl {
  const r = new Rofl();
  assert.ok(r.load(BOOT).ok);
  assert.ok(r.load(program).ok);
  return r;
}

const count = (r: Rofl) => evaluateSemiring(r.store, countingSemiring);
const prov = (r: Rofl) => evaluateSemiring(r.store, provenanceSemiring, { base: provenanceOf });
const trop = (r: Rofl) => evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost });

const GROUP = `
grp(g1).
rawa(g1, a, 2). rawb(g1, a, 2). rawa(g1, b, 3). rawb(g1, b, 3). rawa(g1, c, 3).
item(G, X, V) :- rawa(G, X, V).
item(G, X, V) :- rawb(G, X, V).
tot(G, S) :- grp(G), S is sum(V ; X : item(G, X, V)).
cnt(G, N) :- grp(G), N is count(X : item(G, X, _)).
top(G, M) :- grp(G), M is max(V : item(G, X, V)).
lo(G, M) :- grp(G), M is min(V : item(G, X, V)).
tot2(G) :- tot(G, _).
cnt2(G) :- cnt(G, _).
top2(G) :- top(G, _).
lo2(G) :- lo(G, _).
`;
const I = (x: string, v: number) => `item[main](g1,${x},${v})`;
const G1 = 'grp[main](g1)';

test('counting: a Group cell multiplies its members, a Best cell adds the ties', () => {
  const f = count(world(GROUP)).value;
  const items = { a: f.get(I('a', 2)), b: f.get(I('b', 3)), c: f.get(I('c', 3)) };
  assert.deepEqual(items, { a: 2n, b: 2n, c: 1n });
  assert.equal(f.get('tot2[main](g1)'), 4n);
  assert.equal(f.get('cnt2[main](g1)'), 4n);
  assert.equal(f.get('top2[main](g1)'), 3n);   // b and c reach the max: 2 + 1
  assert.equal(f.get('lo2[main](g1)'), 2n);    // only a reaches the min
});

test('provenance: a Group cell is the product of its members, a Best cell their sum', () => {
  const f = prov(world(GROUP)).value;
  const sr = provenanceSemiring;
  const item = (x: string, v: number) => f.get(I(x, v))!;
  const grp = f.get(G1)!;
  const all = [item('a', 2), item('b', 3), item('c', 3)].reduce(sr.times, grp);
  assert.ok(sr.eq(f.get('tot2[main](g1)')!, all));
  assert.ok(sr.eq(f.get('cnt2[main](g1)')!, all));
  assert.ok(sr.eq(f.get('top2[main](g1)')!, sr.times(grp, sr.plus(item('b', 3), item('c', 3)))));
  assert.ok(sr.eq(f.get('lo2[main](g1)')!, sr.times(grp, item('a', 2))));
  assert.equal(f.get('tot2[main](g1)')!.length, 4);   // rawa|rawb for a and b, one c
  assert.ok(f.get('tot2[main](g1)')!.every((m) => m.includes('rawa[main](g1,c,3)')));
});

test('tropical: the cheapest derivation goes through every member of a Group, one of a Best', () => {
  const f = trop(world(GROUP)).value;
  assert.equal(f.get('tot2[main](g1)'), 5);   // tot2 + tot + three items
  assert.equal(f.get('top2[main](g1)'), 3);   // top2 + top + one item
});

const QUORUM = `
top0(z). ax(x1). ax2(x1). ax(x2).
nd(z, x1). nd(z, x2). nd(z, x3).
thm(Q) :- ax(Q).
thm(Q) :- ax2(Q).
qz(S) :- top0(S), at_least(2, Q : nd(S, Q), thm(Q)).
`;

test('counting: a Quorum cell multiplies its N members', () => {
  const f = count(world(QUORUM)).value;
  assert.equal(f.get('thm[main](x1)'), 2n);
  assert.equal(f.get('thm[main](x2)'), 1n);
  assert.equal(f.get('qz[main](z)'), 2n);
});

const CYCLIC = 4;
const CYCLE = `
ax(a).
needs(a, c). needs(c, a). needs(d, a). needs(d, c).
thm(Q) :- ax(Q).
thm(S) :- needs(S, _), at_least(1, Q : needs(S, Q), thm(Q)).
thm2(S) :- needs(S, _), at_least(2, Q : needs(S, Q), thm(Q)).
`;

test('a threshold inside a cycle: CLOSED says infinite, BOUNDED converges', () => {
  const r = world(CYCLE);
  const c = count(r);
  assert.ok(c.disciplineHeld);
  assert.equal(c.cyclic, CYCLIC);
  for (const k of ['thm[main](a)', 'thm[main](c)', 'thm[main](d)', 'thm2[main](d)']) assert.equal(c.value.get(k), INFINITE, k);
  const t = trop(r);
  assert.ok(t.disciplineHeld);
  assert.equal(t.value.get('thm[main](a)'), 1);
  assert.equal(t.value.get('thm[main](c)'), 2);
  const p = prov(r);
  assert.ok(p.disciplineHeld);
  assert.equal(p.value.get('thm2[main](d)')!.length, 1);
});

const BASE = `
grp(g). grp(e).
it(g, a, 2). it(g, b, 5). it(g, c, 5).
tot(G, S) :- grp(G), S is sum(V ; X : it(G, X, V)).
top(G, M) :- grp(G), M is max(V : it(G, X, V)).
tot2(G) :- tot(G, _).
top2(G) :- top(G, _).
`;
const TOT2 = 'tot2[main](g)';
const TOP2 = 'top2[main](g)';

test('a retracted member kills a Group cell and leaves a Best cell alive; none left kills it too', () => {
  const r = world(BASE);
  assert.equal(count(r).value.get(TOT2), 1n);
  assert.ok(r.retract('it(g, b, 5)').ok);
  assert.equal(count(r).value.get(TOT2), 0n);
  assert.equal(count(r).value.get(TOP2), 1n);
  assert.ok(r.retract('it(g, c, 5)').ok);
  assert.equal(count(r).value.get(TOP2), 0n);
});

test('an empty Group cell is one, not zero', () => {
  assert.equal(count(world(BASE)).value.get('tot[main](e,0)'), 1n);
});

test('a Quorum cell is dead when a member is gone', () => {
  const r = world(`
top0(z). thm(x1). thm(x2). nd(z, x1). nd(z, x2). nd(z, x3).
qz(S) :- top0(S), at_least(2, Q : nd(S, Q), thm(Q)).
`);
  assert.equal(count(r).value.get('qz[main](z)'), 1n);
  assert.ok(r.retract('thm(x1)').ok);
  assert.equal(count(r).value.get('qz[main](z)'), 0n);
});

test('boolean: a Group cell needs every member, a Best cell one', () => {
  const r = world(BASE);
  const f = evaluateSemiring(r.store, booleanSemiring, { base: (k) => k !== 'it[main](g,b,5)' }).value;
  assert.equal(f.get(TOT2), false);
  assert.equal(f.get(TOP2), true);
});

test('a cell adds no depth to a depth-bounded fold', () => {
  const r = world(BASE);
  const at = (d: number) => evaluateSemiring(r.store, depthBoundedCountingSemiring(d)).value;
  assert.equal(at(1).get(TOT2), 0n);
  assert.equal(at(2).get(TOT2), 1n);
});

test('a store that cannot open a cell makes the fold throw, not read it as dead', () => {
  const r = world(BASE);
  const blind = new Proxy(r.store, { get: (t, k) => k === 'cells' ? undefined : (t as any)[k]?.bind?.(t) ?? (t as any)[k] });
  assert.throws(() => evaluateSemiring(blind, countingSemiring), /cannot open a sealed cell/);
  assert.equal(count(world('p(1). q(X) :- p(X).')).value.get('q[main](1)'), 1n);
});

test('one cell cited by thousands of facts folds in linear time', () => {
  const n = 3000;
  const rows = Array.from({ length: n }, (_, i) => `it(x${i}). g(y${i}).`).join('\n');
  const r = world(`${rows}
tot(Y, S) :- g(Y), S is count(X : it(X)).
tot2(Y) :- tot(Y, _).
`);
  assert.equal(r.store.cells.size, 1);
  const t0 = Date.now();
  const f = count(r);
  assert.ok(Date.now() - t0 < 700, `took ${Date.now() - t0}ms`);
  assert.equal(f.value.get('tot2[main](y7)'), 1n);
});

test('thousands of cells fold once each', () => {
  const n = 2000;
  const rows = Array.from({ length: n }, (_, i) => `grp(g${i}). it(g${i}, a, 1). it(g${i}, b, 2).`).join('\n');
  const r = world(`${rows}
tot(G, S) :- grp(G), S is sum(V ; X : it(G, X, V)).
tot2(G) :- tot(G, _).
`);
  assert.ok(r.store.cells.size >= n);
  const f = count(r);
  assert.ok(f.converged);
  assert.equal(f.value.get('tot2[main](g7)'), 1n);
  assert.equal(prov(r).value.get('tot2[main](g7)')![0].length, 3);
});
