// store-index.test.ts — the argument index is the join's only fast path, so
// it must agree with a full scan everywhere, always. A silently incomplete
// index does not fail loudly: it drops derived facts, and the engine reports
// a clean, wrong fixpoint. These tests pin it against the scan it replaces.

import { test } from 'node:test';
import assert from 'node:assert';
import { Rofl } from '../src/api.ts';
import { Store } from '../src/store.ts';
import { canonTerm, mka, mki, mkv, mkf } from '../src/unify.ts';

/** Full scan: the ground truth the index must reproduce. */
function scan(store: Store, rel: string, pos: number, arg: string) {
  return store.relAll(rel)
    .filter((f) => f.args.length > pos && canonTerm(f.args[pos]) === arg)
    .map((f) => f.key);
}

function agreesEverywhere(store: Store, rels: string[]): void {
  for (const rel of rels) {
    const facts = store.relAll(rel);
    const arities = new Set(facts.map((f) => f.args.length));
    for (const arity of arities) {
      for (let pos = 0; pos < arity; pos++) {
        const values = new Set(facts.filter((f) => f.args.length > pos)
          .map((f) => canonTerm(f.args[pos])));
        for (const v of values) {
          const hit = store.argMatch(rel, pos, v);
          assert.notEqual(hit, null, `${rel} arg ${pos} should be index-servable`);
          assert.deepEqual(hit!.map((f) => f.key), scan(store, rel, pos, v),
            `${rel} arg ${pos} = ${v}`);
        }
        // a value nobody carries yields nothing, never everything
        assert.deepEqual(store.argMatch(rel, pos, '"absent-value"'), []);
      }
    }
  }
}

test('the index reproduces a full scan on every relation, position and value', () => {
  const r = new Rofl();
  assert.ok(r.load(`
    edge(a, b). edge(b, c). edge(c, a). edge(a, a).
    tag(a, "x"). tag(b, "x"). tag(c, "y").
    triple(a, b, c). triple(b, b, b).
    path(X, Y) :- edge(X, Y).
    path(X, Z) :- path(X, Y), edge(Y, Z).
  `).ok);
  agreesEverywhere(r.store, ['edge', 'tag', 'triple', 'path']);
});

test('retraction empties the index with the store, leaving no stale key', () => {
  const r = new Rofl();
  assert.ok(r.load('edge(a, b). edge(a, c). edge(b, c).').ok);
  assert.equal(r.store.argMatch('edge', 0, 'a')!.length, 2);
  assert.ok(r.retract('edge(a, b)').ok);
  assert.deepEqual(r.store.argMatch('edge', 0, 'a')!.map((f) => f.key),
    scan(r.store, 'edge', 0, 'a'));
  assert.deepEqual(r.store.argMatch('edge', 1, 'b'), [], 'the last b is gone');
  agreesEverywhere(r.store, ['edge']);
});

test('perspectives do not leak through the index', () => {
  const r = new Rofl();
  assert.ok(r.load(`
    perspective(alpha). perspective(beta).
    fact[alpha](a, "1"). fact[beta](a, "2"). fact[beta](b, "3").
    seen[alpha](X) :- fact[alpha](X, V).
  `).ok);
  // the index is perspective-blind by construction — it hands back both
  // worlds and the engine filters, so the blindness must not reach a rule
  assert.equal(r.store.argMatch('fact', 0, 'a')!.length, 2, 'index spans perspectives');
  assert.ok(r.holds('seen[alpha](a)'));
  assert.ok(!r.holds('seen[alpha](b)'), 'the beta-only subject must not cross over');
  assert.equal(r.query('seen[alpha](X)').rows.length, 1);
});

test('a relation holding a non-ground argument is refused, not half-served', () => {
  const s = new Store();
  s.add('open', 'main', [mka('a'), mkv('X')], { scope: 'timeless', base: true });
  s.add('open', 'main', [mka('b'), mki(1)], { scope: 'timeless', base: true });
  assert.equal(s.argMatch('open', 0, 'a'), null,
    'one non-ground argument disables the index for the whole relation');
  assert.equal(s.argMatch('open', 1, '1'), null);
  // a neighbouring relation stays servable
  s.add('closed', 'main', [mka('a')], { scope: 'timeless', base: true });
  assert.equal(s.argMatch('closed', 0, 'a')!.length, 1);
});

test('structured terms index by their canonical form', () => {
  const s = new Store();
  s.add('holds', 'main', [mkf('pair', [mka('a'), mki(2)])], { scope: 'timeless', base: true });
  s.add('holds', 'main', [mkf('pair', [mka('a'), mki(3)])], { scope: 'timeless', base: true });
  const key = canonTerm(mkf('pair', [mka('a'), mki(2)]));
  assert.deepEqual(s.argMatch('holds', 0, key)!.map((f) => f.key), scan(s, 'holds', 0, key));
  assert.equal(s.argMatch('holds', 0, key)!.length, 1, 'sibling terms do not collide');
});

test('a self-join on a repeated variable derives exactly the scan answer', () => {
  // both premises bind the same variable in different positions: whichever
  // bucket the index picks, the answer must be the full one
  const r = new Rofl();
  assert.ok(r.load(`
    edge(a, b). edge(b, a). edge(b, c). edge(c, c).
    loop(X) :- edge(X, Y), edge(Y, X).
    twohop(X, Z) :- edge(X, Y), edge(Y, Z).
  `).ok);
  assert.deepEqual(r.query('loop(X)').rows.map((row) => row.bindings.X).sort(),
    ['a', 'b', 'c']);
  assert.equal(r.query('twohop(X, Z)').rows.length, 5);
  agreesEverywhere(r.store, ['edge', 'loop', 'twohop']);
});

test('snapshot/restore rebuilds the index, not just the facts', () => {
  const r = new Rofl();
  assert.ok(r.load('edge(a, b). edge(a, c). edge(b, c).').ok);
  const back = Rofl.fromSnapshot(r.save());
  agreesEverywhere(back.store, ['edge']);
  assert.deepEqual(back.store.argMatch('edge', 0, 'a')!.map((f) => f.key),
    r.store.argMatch('edge', 0, 'a')!.map((f) => f.key));
});
