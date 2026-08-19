// Phase 1 — parser, store, unify, naive fixpoint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';

const TC = `
edge(a, b). edge(b, c). edge(c, d).
path(X, Y) :- edge(X, Y).
path(X, Y) :- edge(X, Z), path(Z, Y).
`;

test('transitive closure derives the correct closure (seminaive)', () => {
  const r = new Rofl();
  assert.equal(r.load(TC).ok, true);
  const rows = r.query('path(X, Y)').rows.map((x) => x.text);
  assert.deepEqual(rows, [
    'X = a, Y = b', 'X = a, Y = c', 'X = a, Y = d',
    'X = b, Y = c', 'X = b, Y = d', 'X = c, Y = d',
  ]);
});

test('transitive closure derives the correct closure (naive)', () => {
  const r = new Rofl({ naive: true });
  assert.equal(r.load(TC).ok, true);
  assert.equal(r.query('path(X, Y)').rows.length, 6);
  assert.equal(r.holds('path(a, d)'), true);
  assert.equal(r.holds('path(d, a)'), false);
});

test('structured terms: list append via moded rules', () => {
  const r = new Rofl();
  const ok = r.load(`
    app(nil, Ys, Ys) :- Ys = Ys.
    app(cons(H, T), Ys, cons(H, Zs)) :- app(T, Ys, Zs).
  `);
  assert.equal(ok.ok, true);
  const q = r.query('app(cons(1, cons(2, nil)), cons(3, nil), Z)');
  assert.deepEqual(q.rows.map((x) => x.text), ['Z = cons(1,cons(2,cons(3,nil)))']);
  // and used as a premise of a materialized rule
  r.assert('pair(cons(1, nil), cons(2, nil)).');
  r.assert('joined(Z) :- pair(X, Y), app(X, Y, Z).');
  assert.deepEqual(r.query('joined(Z)').rows.map((x) => x.text), ['Z = cons(1,cons(2,nil))']);
});

test('@async parses but is rejected with a diagnostic', () => {
  const r = new Rofl();
  const res = r.load('later(1) @async.');
  assert.equal(res.ok, false);
  assert.match(res.diagnostics.join(' '), /not in v0/);
});

test('@next is rejected in rule bodies', () => {
  const r = new Rofl();
  const res = r.load('a(X) :- b(X) @next.');
  assert.equal(res.ok, false);
});

test('arithmetic builtins: is, mod, comparisons, negatives', () => {
  const r = new Rofl();
  r.load(`
    n(7). n(10).
    m(X, Y) :- n(X), Y is X mod 3.
    big(X) :- n(X), X >= 10.
    neg(X, Y) :- n(X), Y is 0 - X, Y <= -7.
  `);
  assert.deepEqual(r.query('m(X, Y)').rows.map((x) => x.text), ['X = 10, Y = 1', 'X = 7, Y = 1']);
  assert.deepEqual(r.query('big(X)').rows.map((x) => x.text), ['X = 10']);
  assert.deepEqual(r.query('neg(7, Y)').rows.map((x) => x.text), ['Y = -7']);
});
