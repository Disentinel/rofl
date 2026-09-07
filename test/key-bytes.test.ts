// key-bytes.test.ts — a fact key is written flat, and this file is the scale
// that says so.
//
// WHY THIS FILE IS PERMANENT. Concatenation (`a + b`, and a template with
// substitutions, which compiles to the same thing) does not write a string.
// It records the intent to write one: the result is a tree of the fragments,
// and every fragment stays reachable through it. The text is the same either
// way, so nothing observable distinguishes the two forms — no golden moves,
// no test of behaviour notices, and `tsc` is perfectly happy. The only thing
// that separates them is how many bytes survive the call, which means the
// only check that can hold the flat form in place is a check that WEIGHS.
//
// Measured on this machine (node 22, --expose-gc), 40 000 arity-1 facts:
//
//   key built by template/concatenation   332 bytes per fact
//   key built by one join                 296 bytes per fact
//
// and in isolation, on a 14-character key, 96 bytes against 46 — the live
// gap is the narrower of the two because a Map flattens the keys it hashes,
// which pays back part of the waste but leaves the tree itself standing.
// `.slice()` looks like a copy and is not one: it measured 100 bytes, no
// better than what it was meant to collapse.
//
// The threshold below sits between the two measurements, nearer the bad one,
// so that noise cannot fail it but a return to concatenation cannot pass it.
// Verified by reverting `factKey` to its template form: this file failed at
// 332 bytes per fact, then passed again at 296.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.ts';
import { mka, atomCacheSize } from '../src/unify.ts';

/** Facts, 40 000 of them, cost about 12 MB either way — big enough that the
 *  per-fact difference clears the noise of a heap reading, small enough that
 *  building the store twice stays well inside a second. */
const N = 40_000;

/** Ceiling in bytes per fact. Flat measured 296, the tree it replaced 332. */
const MAX_BYTES_PER_FACT = 315;

/** THE STORES MUST OUTLIVE BOTH READINGS. A store that is unreachable by the
 *  time the second reading is taken is collected before it, and the row then
 *  reads about one byte per fact — the probe weighing its own dead object and
 *  reporting a triumph. Parking them at module level is what stops that, and
 *  it is the reason this array exists at all. */
const parked: Store[] = [];

function gc2(): void { (globalThis as { gc?: () => void }).gc!(); (globalThis as { gc?: () => void }).gc!(); }
function heapUsed(): number { gc2(); return process.memoryUsage().heapUsed; }

/** Build a store of `n` arity-1 facts and return the bytes it retained per
 *  fact, together with the store, which the caller must keep. */
function weigh(n: number, atom: (i: number) => string): { bytesPerFact: number; store: Store } {
  const before = heapUsed();
  const store = new Store();
  parked.push(store);
  for (let i = 0; i < n; i++) store.add('rel', 'persp', [mka(atom(i))], { scope: 'timeless', base: true });
  const after = heapUsed();
  return { bytesPerFact: (after - before) / n, store };
}

const HAS_GC = typeof (globalThis as { gc?: () => void }).gc === 'function';
const SKIP = HAS_GC ? false
  : 'needs --expose-gc: run `node --expose-gc --experimental-strip-types --test test/key-bytes.test.ts`';

test('a fact retains no more than the threshold, keys included', { skip: SKIP }, () => {
  // The reading is taken three times because a single heap delta can be moved
  // by an unlucky collection; the median is what the assertion judges.
  const rows = [weigh(N, (i) => 'a' + i), weigh(N, (i) => 'b' + i), weigh(N, (i) => 'c' + i)];
  for (const r of rows) assert.equal(r.store.facts.size, N, 'the store must actually hold the facts');

  const median = [...rows.map((r) => r.bytesPerFact)].sort((x, y) => x - y)[1];
  assert.ok(
    median < MAX_BYTES_PER_FACT,
    `${median.toFixed(1)} bytes per fact, ceiling ${MAX_BYTES_PER_FACT}. A key built by ` +
    `concatenation instead of one join measured 332 here; check factKey.`,
  );
});

// THE SCALE MUST BE ABLE TO SAY NO. Everything above is a comparison against a
// number, and a number is only worth what the instrument reading it is worth.
// So the same probe is pointed at a fact deliberately made heavier: it must
// come back over the ceiling. If this fails, the assertion above proves
// nothing — it is passing because the probe cannot see, not because the store
// is lean.
test('the scale rejects a fact it should reject', { skip: SKIP }, () => {
  const fat = weigh(N, (i) => 'a'.repeat(60) + i);
  assert.equal(fat.store.facts.size, N);
  assert.ok(
    fat.bytesPerFact > MAX_BYTES_PER_FACT,
    `a 60-character atom weighed ${fat.bytesPerFact.toFixed(1)} bytes per fact, which is under ` +
    `the ${MAX_BYTES_PER_FACT} ceiling. The probe is not measuring anything.`,
  );
});

// The stores are read once more at the end so that nothing above can be proved
// dead by an optimizer that noticed `parked` is never observed.
test('the parked stores are still whole', { skip: SKIP }, () => {
  assert.equal(parked.length, 4);
  for (const s of parked) assert.equal(s.facts.size, N);
});

// ---------------------------------------------------------------------------
// THE ATOM CACHE, and why it needs a test at all.
//
// `mka` returns one object per atom name (src/unify.ts). Measured 2026-09-07
// on seven programs, that is 2.3 to 10.0 per cent of the live heap. NO
// CORRECTNESS GATE HERE CAN SEE IT: three mutants were run against the order
// census, the store conformance suite and two golden-bearing tests — the cache
// switched off, the sharing it rests on broken, and its bound removed — and all
// three SURVIVED green. Two equal atoms that are different objects derive
// exactly the same facts, which is the whole reason the sharing is safe and the
// whole reason nothing notices when it stops.
//
// So the two properties are asserted directly. The first holds the sharing in
// place; the second holds the BOUND in place, which is the difference between a
// cache and a leak in a host that loads and excises programs for as long as it
// runs. Nothing may depend on atom identity for meaning — that is what makes
// clearing the cache on overflow harmless — so this file asserts identity as a
// MEMORY property and never as a semantic one.

test('equal atoms are one object, so a program pays for each name once', () => {
  // ACROSS OTHER NAMES, not merely consecutively: a table that held one entry
  // would pass the consecutive form and share nothing, which is exactly what
  // the cap-of-one mutant does.
  const a = mka('some_relation_name');
  for (let i = 0; i < 64; i++) mka(`between_${i}`);
  const b = mka('some_relation_name');
  assert.equal(a, b, 'mka must return the same object for the same name');
  assert.notEqual(mka('x_one'), mka('x_two'), 'and different objects for different names');
  assert.deepEqual(mka('x_one'), { k: 'a', name: 'x_one' }, 'without changing what an atom IS');
});

test('the atom cache is bounded — it is a cache, not an intern table', () => {
  const { cap } = atomCacheSize();
  for (let i = 0; i < cap * 2 + 5; i++) mka(`bounded_probe_${i}`);
  const { size } = atomCacheSize();
  assert.ok(size <= cap,
    `${size} atoms held against a cap of ${cap}. An atom table that only grows is ` +
    `a leak in a long-running host: no store event prunes it, because a term is ` +
    `not reference-counted and remove/clearDerived/advanceTick/excise cannot say ` +
    `whether a name still has a holder. The bound is the only thing that does.`);
  // and it still works after an overflow, which is the property that makes
  // clearing safe rather than merely bounded
  assert.equal(mka('after_overflow'), mka('after_overflow'));
});
