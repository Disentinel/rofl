// index-arrival.test.ts — the fact index costs the same whatever order facts
// arrive in, and it is canonically sorted whenever anyone looks.
//
// WHY THIS FILE IS PERMANENT (docs/performance-invariants.md, I1). The index
// is a sorted array per relation per perspective. Appending to a sorted array
// is free; inserting into the middle is a memmove of the tail. So the cost of
// a fact was decided not by the index but by the ORDER facts arrived in:
// measured before this file existed, 64 000 facts into one relation cost
// 123 ms arriving in ascending key order and 2 952 ms shuffled — a 24× spread
// on identical data, and the 128k case took 23.8 s.
//
// That is the engine's permanent case, not a corner: derived facts arrive in
// rule-firing order, which is never key order. `clone()` looked linear only
// because `restore()` replays a sorted snapshot, so every insert appends.
//
// The fix is to append arrivals and put the run back in order once per batch.
// The whole risk of that fix is the window it opens — a read taken between a
// derivation and the batch that absorbs it — because `relPersp`/`relAll`
// returning canonically sorted keys is what `canonicalState()`, the golden
// captures and the witness ordering all rest on. So the shape of this file is:
//
//   §1  arrival order is not observable: three orders, one byte-identical store
//   §2  the window, closed: every read is canonical, including the one taken
//       between a write and any merge, and including a randomized script
//       checked against a reference model after every single operation
//   §3  the engine's own pattern, through the public API
//   §4  the measurement, as a ratio a regression would fail

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { Store, factKey } from '../src/store.ts';
import { mki, mks, type Term } from '../src/unify.ts';

const REL = 'r';
const P1 = 'p';
const P2 = 'q';

/** Deterministic shuffle: the same permutation on every machine and runner. */
function shuffled(n: number): number[] {
  const a = [...Array(n).keys()];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pad = (i: number): Term => mks(String(i).padStart(7, '0'));

function fill(order: number[], persp = P1): Store {
  const s = new Store();
  for (const i of order) s.add(REL, persp, [pad(i)], { scope: 'timeless', base: true });
  return s;
}

function isSorted(keys: string[]): boolean {
  for (let i = 1; i < keys.length; i++) if (!(keys[i - 1] < keys[i])) return false;
  return true;
}

const ms = (f: () => void): number => {
  const t = process.hrtime.bigint();
  f();
  return Number(process.hrtime.bigint() - t) / 1e6;
};

// ---------------------------------------------------------------------------
// §1 arrival order is not observable

test('ascending, shuffled and descending arrival build the same store, byte for byte', () => {
  const n = 500;
  const up = fill([...Array(n).keys()]);
  const down = fill([...Array(n).keys()].reverse());
  const mixed = fill(shuffled(n));

  assert.equal(up.canonicalState(), down.canonicalState(), 'descending arrival');
  assert.equal(up.canonicalState(), mixed.canonicalState(), 'shuffled arrival');
  assert.equal(up.snapshot(), mixed.snapshot(), 'snapshot');
  assert.deepEqual(mixed.relPersp(REL, P1).map((f) => f.key), up.relPersp(REL, P1).map((f) => f.key));
  assert.ok(isSorted(mixed.relPersp(REL, P1).map((f) => f.key)), 'canonical');
  assert.equal(mixed.relCount(REL), n);
});

test('a restored snapshot and a shuffled build are the same store', () => {
  const mixed = fill(shuffled(400));
  const back = Store.restore(mixed.snapshot());
  assert.equal(back.canonicalState(), mixed.canonicalState());
  assert.deepEqual(back.relAll(REL).map((f) => f.key), mixed.relAll(REL).map((f) => f.key));
  assert.equal(mixed.clone().canonicalState(), mixed.canonicalState());
});

test('relAll orders by perspective first, whatever order the perspectives arrived in', () => {
  const s = new Store();
  // P2 before P1, and each perspective's own keys shuffled
  for (const i of shuffled(50)) s.add(REL, P2, [pad(i)], { scope: 'timeless', base: true });
  for (const i of shuffled(50)) s.add(REL, P1, [pad(i)], { scope: 'timeless', base: true });
  const all = s.relAll(REL).map((f) => f.key);
  assert.deepEqual(s.perspectivesOf(REL), [P1, P2]);
  assert.deepEqual(all, [...s.relPersp(REL, P1).map((f) => f.key), ...s.relPersp(REL, P2).map((f) => f.key)]);
  assert.ok(isSorted(s.relPersp(REL, P1).map((f) => f.key)));
  assert.ok(isSorted(s.relPersp(REL, P2).map((f) => f.key)));
});

// ---------------------------------------------------------------------------
// §2 the window between a write and the batch that absorbs it
//
// This is the dangerous case and the reason the absorb happens inside the
// READ rather than at a round boundary a caller has to remember to cross.

test('a read taken between every write and the next is canonical', () => {
  const s = new Store();
  const order = shuffled(300);
  const seen: string[] = [];
  order.forEach((i, at) => {
    s.add(REL, P1, [pad(i)], { scope: 'timeless', base: true });
    seen.push(factKey(REL, P1, [pad(i)]));
    const keys = s.relPersp(REL, P1).map((f) => f.key);
    assert.ok(isSorted(keys), `unsorted after write ${at}`);
    assert.deepEqual(keys, [...seen].sort(), `wrong contents after write ${at}`);
    assert.equal(s.relCount(REL), seen.length, `wrong count after write ${at}`);
  });
});

test('one write between two reads: the second read sees it, in place', () => {
  // The narrowest form of the window. A single arrival is the pattern the
  // engine's own reads produce, and it must be absorbed by the very next
  // read — not deferred to a boundary, because there is none between these
  // two statements.
  const s = fill([...Array(100).keys()].map((i) => i * 2));   // evens
  const before = s.relPersp(REL, P1).map((f) => f.key);
  s.add(REL, P1, [pad(51)], { scope: 'timeless', base: true });
  const after = s.relPersp(REL, P1).map((f) => f.key);
  assert.ok(isSorted(after));
  assert.equal(after.length, before.length + 1);
  assert.equal(after[26], factKey(REL, P1, [pad(51)]), 'landed between 50 and 52');
});

test('a batch big enough to be merged, into a run that is already populated', () => {
  // The absorb has two paths and they are chosen by batch size, so a test
  // that only ever writes one key at a time exercises half of it. This drives
  // the other half: an already-canonical run, then a batch far above the
  // threshold whose keys interleave with what is there.
  const s = fill([...Array(400).keys()].map((i) => i * 2));   // evens, absorbed
  assert.equal(s.relPersp(REL, P1).length, 400);
  const odds = shuffled(400).map((i) => i * 2 + 1);
  for (const i of odds) s.add(REL, P1, [pad(i)], { scope: 'timeless', base: true });
  const keys = s.relPersp(REL, P1).map((f) => f.key);
  assert.ok(isSorted(keys), 'the merged run is not canonical');
  assert.deepEqual(keys, [...Array(800).keys()].map((i) => factKey(REL, P1, [pad(i)])).sort());
  // and again on top of the merged run, so the merge output is a valid input
  for (const i of shuffled(400).map((x) => x + 1000)) {
    s.add(REL, P1, [pad(i)], { scope: 'timeless', base: true });
  }
  assert.ok(isSorted(s.relPersp(REL, P1).map((f) => f.key)), 'a merge of a merge');
  assert.equal(s.relCount(REL), 1200);
});

test('relCount and perspectivesOf agree with relPersp mid-batch', () => {
  // These two never need the order, so they never absorb. They must still
  // answer for the arrivals that have not been absorbed yet.
  const s = new Store();
  for (const i of shuffled(40)) s.add(REL, P2, [pad(i)], { scope: 'timeless', base: true });
  assert.equal(s.relCount(REL), 40, 'counted without absorbing');
  assert.deepEqual(s.perspectivesOf(REL), [P2], 'named without absorbing');
  assert.equal(s.relPersp(REL, P2).length, 40, 'and the absorb agrees');
  assert.equal(s.relCount(REL), 40, 'and the count did not change under it');
});

test('remove finds a key whether or not it has been absorbed yet', () => {
  // never read: every key is still an arrival
  const hot = fill(shuffled(200));
  assert.ok(hot.remove(factKey(REL, P1, [pad(7)])), 'removed unabsorbed');
  assert.ok(!hot.has(factKey(REL, P1, [pad(7)])));
  const keys = hot.relPersp(REL, P1).map((f) => f.key);
  assert.ok(isSorted(keys));
  assert.equal(keys.length, 199);
  assert.ok(!keys.includes(factKey(REL, P1, [pad(7)])));

  // read first: every key is absorbed, and the removal takes a second batch
  const warm = fill(shuffled(200));
  warm.relPersp(REL, P1);
  for (const i of shuffled(50)) warm.remove(factKey(REL, P1, [pad(i)]));
  warm.add(REL, P1, [pad(7)], { scope: 'timeless', base: true });
  assert.ok(isSorted(warm.relPersp(REL, P1).map((f) => f.key)));
  assert.equal(warm.relCount(REL), 151);
});

test('a randomized script of writes, removals and reads agrees with a plain sorted set', () => {
  // The three access patterns interleaved at random, checked against a model
  // that has no index at all — after EVERY operation, so a window one
  // operation wide cannot hide.
  let seed = 987654321;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const s = new Store();
  const model = new Map<string, Set<string>>([[P1, new Set()], [P2, new Set()]]);
  const check = (at: number) => {
    for (const persp of [P1, P2]) {
      const keys = s.relPersp(REL, persp).map((f) => f.key);
      assert.ok(isSorted(keys), `step ${at}: unsorted`);
      assert.deepEqual(keys, [...model.get(persp)!].sort(), `step ${at}: contents`);
    }
    assert.deepEqual(s.relAll(REL).map((f) => f.key),
      [...[...model.get(P1)!].sort(), ...[...model.get(P2)!].sort()], `step ${at}: relAll`);
    assert.equal(s.relCount(REL), model.get(P1)!.size + model.get(P2)!.size, `step ${at}: count`);
  };
  for (let at = 0; at < 400; at++) {
    const persp = rnd() < 0.5 ? P1 : P2;
    const i = Math.floor(rnd() * 120);
    const key = factKey(REL, persp, [pad(i)]);
    const roll = rnd();
    if (roll < 0.6) {
      s.add(REL, persp, [pad(i)], { scope: 'timeless', base: true });
      model.get(persp)!.add(key);
    } else if (roll < 0.8) {
      s.remove(key);
      model.get(persp)!.delete(key);
    }
    // a read only sometimes, so batches of every size get absorbed
    if (rnd() < 0.4) check(at);
  }
  check(-1);
});

test('clearDerived leaves the surviving keys in canonical order', () => {
  const s = new Store();
  for (const i of shuffled(300)) {
    s.add(REL, P1, [pad(i)], { scope: 'tick', base: i % 3 === 0 });
  }
  // dropped without ever being read: the batch removal meets unabsorbed keys
  s.clearDerived();
  const keys = s.relPersp(REL, P1).map((f) => f.key);
  assert.ok(isSorted(keys), 'canonical after a batch removal');
  assert.deepEqual(keys, [...Array(300).keys()].filter((i) => i % 3 === 0)
    .map((i) => factKey(REL, P1, [pad(i)])).sort());
  assert.equal(s.relCount(REL), keys.length);
  // and it takes new arrivals afterwards
  s.add(REL, P1, [pad(1)], { scope: 'timeless', base: true });
  assert.ok(isSorted(s.relPersp(REL, P1).map((f) => f.key)));
});

test('advanceTick drops the tick layer in one batch and keeps the rest canonical', () => {
  const s = new Store();
  for (const i of shuffled(200)) {
    s.add(REL, P1, [pad(i)], { scope: i % 2 === 0 ? 'tick' : 'timeless', base: true });
  }
  const staged = [{ rel: REL, persp: P1, args: [mki(9001)] }];
  s.advanceTick(staged);
  const keys = s.relPersp(REL, P1).map((f) => f.key);
  assert.ok(isSorted(keys), 'canonical after the tick boundary');
  assert.equal(s.tick, 1);
  assert.ok(s.has(factKey(REL, P1, [mki(9001)])), 'the staged fact is in');
  assert.equal(keys.length, 101, '100 timeless survivors plus the staged one');
});

// ---------------------------------------------------------------------------
// §3 the engine's own pattern, through the public API

test('facts injected out of key order are read back in key order by a rule', () => {
  // A derivation is a write followed by more reads of the same relation with
  // no boundary in between. This is that, through the documented surface:
  // the answers must not depend on the order the premises were asserted in.
  const build = (order: number[]): Rofl => {
    const r = new Rofl();
    assert.ok(r.load('e(1, 2).\nt(X, Y) :- e(X, Y).\nt(X, Z) :- t(X, Y), e(Y, Z).').ok);
    for (const i of order) assert.ok(r.assert(`e(${i}, ${i + 1}).`).ok);
    r.evaluate();
    return r;
  };
  const up = build([2, 3, 4, 5, 6, 7, 8]);
  const down = build([8, 7, 6, 5, 4, 3, 2]);
  const mixed = build([5, 2, 8, 3, 7, 4, 6]);
  assert.equal(up.store.canonicalState(), down.store.canonicalState(), 'descending assertion order');
  assert.equal(up.store.canonicalState(), mixed.store.canonicalState(), 'shuffled assertion order');
  assert.ok(isSorted(up.store.relAll('t').map((f) => f.key)), 'the derived layer is canonical');
  assert.equal(up.query('t(1, 9)').rows.length, 1, 'and the closure is complete');
});

test('the derived layer of a real program is canonical in every relation', () => {
  // Derived facts arrive in rule-firing order; nothing here sorts them.
  const r = new Rofl();
  assert.ok(r.load('n(0).\nn(N) :- n(M), M < 40, N is M + 1.\npair(A, B) :- n(A), n(B), A < B.').ok);
  r.evaluate();
  const rels = [...new Set([...r.store.facts.values()].map((f) => f.rel))];
  for (const rel of rels) {
    for (const persp of r.store.perspectivesOf(rel)) {
      const keys = r.store.relPersp(rel, persp).map((f) => f.key);
      assert.ok(isSorted(keys), `${rel}[${persp}] is not canonical`);
    }
    assert.equal(r.store.relCount(rel), r.store.relAll(rel).length, `${rel}: count disagrees`);
  }
  assert.equal(r.store.relCount('pair'), 820, 'and the fixpoint is the whole one');
});

// ---------------------------------------------------------------------------
// §4 the measurement
//
// A ratio, not a wall clock: the absolute numbers belong to whichever machine
// runs this, but the SPREAD between two arrival orders on identical data is
// the property, and it is what a regression moves.

test('shuffled arrival costs about what ascending arrival costs', () => {
  const n = 32000;
  const up = [...Array(n).keys()];
  const mixed = shuffled(n);
  fill(up.slice(0, 2000));   // warm the paths so the first case pays no JIT tax
  fill(mixed.slice(0, 2000));

  const tUp = ms(() => fill(up));
  const tMixed = ms(() => fill(mixed));
  const ratio = tMixed / Math.max(tUp, 1);
  console.log(`  arrival: ascending ${tUp.toFixed(0)} ms, shuffled ${tMixed.toFixed(0)} ms `
    + `(${(tUp * 1000 / n).toFixed(1)} vs ${(tMixed * 1000 / n).toFixed(1)} µs/fact, ${ratio.toFixed(2)}×)`);
  // Measured before the arrival buffer existed: 24× here, 5.4× on the machine
  // performance-invariants.md was written on. Measured after: at or below 1×,
  // because a shuffled batch is sorted once instead of memmoved n times. The
  // bound is loose enough for a loaded CI box and still fails a return to
  // per-fact insertion on the slowest of them.
  assert.ok(ratio < 3, `shuffled arrival cost ${ratio.toFixed(2)}× ascending; I1 has regressed`);
});

test('dropping a derived layer costs about what building it cost', () => {
  // The mirror image of the same defect: a derived layer leaves in the order
  // it arrived in, and removing it a key at a time is the same memmove per
  // fact. Measured before: 40 000 facts took 1 853 ms to drop against 80 ms
  // to build, 23×. The bound is on the ratio for the same reason as above.
  const n = 32000;
  const order = shuffled(n);
  const build = (): Store => {
    const s = new Store();
    for (const i of order) s.add(REL, P1, [pad(i)], { scope: 'tick', base: false });
    return s;
  };
  build();   // warm
  const s = build();
  const tBuild = ms(build);
  const tDrop = ms(() => s.clearDerived());
  assert.equal(s.relCount(REL), 0, 'the layer went');
  const ratio = tDrop / Math.max(tBuild, 1);
  console.log(`  derived layer: build ${tBuild.toFixed(0)} ms, drop ${tDrop.toFixed(0)} ms (${ratio.toFixed(2)}×)`);
  assert.ok(ratio < 3, `dropping cost ${ratio.toFixed(2)}× building; the batch removal has regressed`);
});
