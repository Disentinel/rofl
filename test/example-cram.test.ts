// example-cram.test.ts — the memory-budget example (examples/cram/).
//
// WHAT IS PINNED HERE. CRAM is the corpus's only exercise of the two policy
// flags on the `Rofl` constructor, and a policy flag is the class of thing
// that passes every other check while doing nothing: the goldens do not move,
// the answers do not move, and the suite stays green whether the flag works or
// is ignored. So every claim below is written as a DIFFERENCE that the flag
// must make, against a control run where it is absent — and, where the claim
// is that nothing moved, against a comparison shown able to report movement.
//
//   §1  the craft is the craft            the program really ran
//   §2  retention bounds the provenance   and leaves the domain byte-identical
//   §3  the window                        n + 1 ticks, exactly, both edges
//   §4  the silence                       pruned and never-happened are one answer
//   §5  the second gate                   a provenance-reading program is not
//                                         pruned at all, and the control says the
//                                         same pair of settings does differ
//   §6  the lie the gate prevents         the forbidden sweep, performed
//   §7  reuse                             fewer firings, identical answers
//   §8  naive                             identical firings — the meter's blind
//                                         spot, pinned rather than assumed
//   §9  the reboot                        the policy is on `fromSnapshot` too
//   §10 the additive model                one run's store predicted from two others
//
// Runs at four ticks, not the transcript's eight: every claim here is about a
// difference that is already present at four, and the suite is not the place
// to re-measure a slope.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Rofl } from '../src/api.ts';
import {
  BUDGET, PACKETS, packet, head, runCraft, domainState, window, sweepProvenance,
  increments, growth, exchange, type Run,
} from '../examples/cram/demo.ts';

const T = 4;
/** The provenance-reading and naive arms run one tick shorter: both cost
 *  several times a plain run (reuse is off in the first by the kernel's own
 *  gate and by the flag in the second), and every claim they carry is already
 *  present at three ticks. The suite is not the place to re-measure a slope. */
const TL = 3;

/** A run and the domain state it ended with, HASHED and CAPTURED AT THE END OF
 *  THE RUN.
 *
 *  Both halves were paid for. Captured at the end, because `tickAdvance` leaves
 *  the store dirty and the first query afterwards BUILDS the next tick's
 *  derived layer — so a test that asks one run a question before comparing it
 *  with another is comparing two different moments and blaming the policy.
 *  Hashed, because these states are 60-90 KB and a failed `assert.equal` on
 *  them prints both in full, which buries the failure it is reporting. */
interface Fixture { run: Run; dig: string; lines: number }
const memo = new Map<string, Fixture>();
function fixture(key: string, make: () => Run): Fixture {
  if (!memo.has(key)) {
    const r = make();
    const state = domainState(r.r);
    memo.set(key, {
      run: r,
      dig: createHash('sha256').update(state).digest('hex').slice(0, 16),
      lines: state.split('\n').length,
    });
  }
  return memo.get(key)!;
}
const digestOf = (r: Run): string => createHash('sha256').update(domainState(r.r)).digest('hex').slice(0, 16);

const BASE = () => fixture('base', () => runCraft({}, T, false, 'unpruned'));
const KEEP0 = () => fixture('keep0', () => runCraft({ retainTicks: 0 }, T, false, 'retainTicks: 0'));
const KEEP1 = () => fixture('keep1', () => runCraft({ retainTicks: 1 }, T, false, 'retainTicks: 1'));
const base = () => BASE().run;
const keep0 = () => KEEP0().run;
const keep1 = () => KEEP1().run;

// ---------------------------------------------------------------------------
// §1  the program really ran

test('the craft is the craft cram.rofl describes', () => {
  const r = base().r;
  const count = (q: string) => r.query(q, { budget: BUDGET }).rows.length;
  assert.equal(count('sensor[bus](S, Sub)'), 24);
  assert.equal(count('subsystem[bus](Sub)'), 4);
  assert.equal(count('segment[bus](G)'), 18);
  assert.equal(count('feeds[bus](A, B)'), 17);
  // and it decided something on every tick, in both directions — a transcript
  // that never leaves `safe` would be measuring a craft on fire
  const postures = new Set(base().samples.map((s) => s.posture));
  assert.equal(base().samples.length, T, 'one sample per tick, taken at fixpoint');
  assert.ok(postures.has('safe') && postures.has('science'),
    `the mission must do both: saw ${[...postures].join(',')}`);
});

// ---------------------------------------------------------------------------
// §2  retention bounds the provenance and nothing else

test('retainTicks bounds the provenance while the domain stays byte-identical', () => {
  const b = base(), k0 = keep0();
  assert.ok(b.prov > k0.prov * 3, `unpruned ${b.prov} vs pruned ${k0.prov}: no bound was applied`);
  assert.equal(b.facts - b.prov, k0.facts - k0.prov, 'everything that is not provenance is the same size');
  assert.equal(KEEP0().dig, BASE().dig,
    `and the same facts, byte for byte: ${BASE().lines} lines either side`);
  assert.equal(b.steps, k0.steps, 'the same firings: retention is not a change of program');

  // POSITIVE CONTROL: the comparison must be able to report a difference, or
  // the equality above is a fact about the comparison.
  const shorter = runCraft({}, T - 1, false, 'shorter');
  assert.notEqual(digestOf(shorter), BASE().dig);
});

test('the provenance grows per tick and the policy is what stops it', () => {
  const incBase = increments(base().samples).map((x) => x.prov);
  const incKept = increments(keep0().samples).map((x) => x.prov);
  assert.ok(incBase.every((x) => x > 100), `unpruned mints per tick: ${incBase.join(',')}`);
  assert.ok(Math.max(...incKept) < Math.min(...incBase),
    `pruned increments ${incKept.join(',')} must all be under the unpruned ${incBase.join(',')}`);
  // the leak this example is about is named, not guessed: `derived_by` is the
  // relation that grows, and the assertion ledger is what remains after it
  const g = growth(base().samples[1], base().samples[base().samples.length - 1]);
  assert.equal(g[0].rel, 'derived_by', 'provenance is the dominant growing relation');
  const kept = growth(keep0().samples[1], keep0().samples[keep0().samples.length - 1]);
  assert.ok(kept.some((x) => x.rel === 'asserted_by' && x.per > 0),
    'and the assertion ledger keeps growing under the policy — the flag does not bound it');
});

// ---------------------------------------------------------------------------
// §3  the window: n + 1 ticks, both edges

test('the window is exactly the current tick and n completed ones', () => {
  for (const [n, r] of [[0, keep0()], [1, keep1()]] as [number, Run][]) {
    const now = r.r.store.tick;
    const live = window(r.r, now).filter((x) => x.rows > 0).map((x) => x.tick);
    const want = Array.from({ length: n + 1 }, (_, i) => now - n + i);
    assert.deepEqual(live, want, `retainTicks: ${n} at tick ${now}`);
  }
  // the control that makes the zeros mean "pruned" rather than "never fired"
  const now = base().r.store.tick;
  const all = window(base().r, now);
  assert.ok(all.every((x) => x.rows > 0), `unpruned, every tick answers: ${all.map((x) => x.rows).join(',')}`);
});

// ---------------------------------------------------------------------------
// §4  the silence

test('a pruned tick and a tick that never happened give the same answer', () => {
  const r = keep0().r;
  const pruned = r.query('derived_by(F, R, 1)', { budget: BUDGET });
  const never = r.query('derived_by(F, R, 9999)', { budget: BUDGET });
  assert.equal(pruned.error, undefined);
  assert.equal(never.error, undefined);
  assert.equal(pruned.rows.length, 0);
  assert.equal(never.rows.length, 0);
  // and tick 1 DID happen: the unpruned run says how much fired in it
  assert.ok(window(base().r, 1)[1].rows > 0, 'tick 1 really did fire rules');
  // what survives is the domain's own memory of when, which is a different claim
  assert.ok(r.query('latched[bus](Sub, Tk)', { budget: BUDGET }).rows.length > 0,
    'the craft still knows WHEN a subsystem latched — just not which rule concluded it');
});

// ---------------------------------------------------------------------------
// §5  the second gate

test('a program whose rules read derived_by is not pruned at all', () => {
  const on = runCraft({}, TL, true, 'log');
  const off = runCraft({ retainTicks: 0 }, TL, true, 'log, retainTicks: 0');
  assert.equal(on.facts, off.facts, 'retainTicks was asked for and refused');
  assert.equal(on.prov, off.prov);
  assert.equal(digestOf(off), digestOf(on));
  // POSITIVE CONTROL: the same pair of settings on the program WITHOUT those
  // rules does differ, so the equality above is the gate and not the harness
  assert.notEqual(base().facts, keep0().facts);
  // the same predicate turns reuse off, so the log program pays twice
  const plain = runCraft({}, TL, false, 'plain');
  assert.ok(on.steps > plain.steps * 2,
    `log ${on.steps} firings against ${plain.steps}: reuse should be off too`);
});

// ---------------------------------------------------------------------------
// §6  the lie the gate prevents

test('the forbidden sweep changes a fact the program derives about its past', () => {
  const g = runCraft({}, TL, true, 'log');
  const activeBefore = g.r.query('active[log](Tk)', { budget: BUDGET }).rows.length;
  const quietBefore = g.r.query('quiet[log](Tk)', { budget: BUDGET }).rows.length;
  const dropped = sweepProvenance(g.r);
  assert.ok(dropped > 0, 'the sweep must actually remove something');
  const activeAfter = g.r.query('active[log](Tk)', { budget: BUDGET }).rows.length;
  const quietAfter = g.r.query('quiet[log](Tk)', { budget: BUDGET }).rows.length;
  assert.ok(activeAfter < activeBefore, `active[log]: ${activeBefore} -> ${activeAfter}`);
  assert.ok(quietAfter > quietBefore,
    `quiet[log] went from ${quietBefore} to ${quietAfter}: the store now asserts a falsehood`);
});

// ---------------------------------------------------------------------------
// §7 and §8  what the work costs, and what the meter cannot see

test('reuse saves firings and moves no answer', () => {
  const scratch = runCraft({ reuse: false }, T, false, 'reuse: false');
  const dScratch = digestOf(scratch);
  // The answers are the invariant and must hold whatever the engine does.
  assert.equal(dScratch, BASE().dig, 'reuse must not change a single answer');
  // The saving is a measurement of the engine, and it is asserted rather than
  // reported because a flag that has stopped doing anything is exactly what
  // this example exists to notice. IF THIS FAILS, measure before editing it:
  // the meta layer may now be cached by another mechanism, in which case the
  // finding is that `reuse` has been made redundant, not that the test is
  // wrong. Measured 2026-08-31 at four ticks: 1.83x.
  assert.ok(scratch.steps > base().steps,
    `reuse off ${scratch.steps} firings did not exceed reuse on ${base().steps}: ` +
    'either the flag stopped being consulted or the derived layer is cached elsewhere');
});

test('naive and seminaive spend the identical budget — the step meter is blind to it', () => {
  const a = runCraft({ naive: true, reuse: false }, TL, false, 'naive');
  const b = runCraft({ naive: false, reuse: false }, TL, false, 'seminaive');
  assert.equal(a.steps, b.steps, 'the kernel counts firings, and both perform the same ones');
  assert.equal(digestOf(a), digestOf(b));
  assert.equal(a.facts, b.facts);
  // The cost of `naive` is in candidates examined, which nothing in the store
  // records. That it is a WALL CLOCK difference is measured in the transcript
  // over three runs; a single timing in a suite would be noise, so what is
  // pinned here is the part that is exact: the budget does not see it.
});

// ---------------------------------------------------------------------------
// §9  the policy survives a reboot

test('fromSnapshot carries the retention policy', () => {
  const saved = base().r.save();
  const cold = Rofl.fromSnapshot(saved, { retainTicks: 0 });
  const carried = cold.store.relCount('derived_by');
  assert.ok(carried > 100, `the snapshot must bring the backlog in: ${carried}`);
  for (let p = 0; p < PACKETS; p++) {
    assert.ok(cold.load(packet(T, p), { who: 'bus', budget: BUDGET }).ok);
    cold.query('posture[bus](P)', { budget: BUDGET });
  }
  cold.tickAdvance({ budget: BUDGET });
  assert.ok(cold.store.relCount('derived_by') < carried / 3,
    'the first boundary under the policy collects the whole backlog');

  // POSITIVE CONTROL: restored WITHOUT the flag, the same snapshot keeps growing
  const warm = Rofl.fromSnapshot(saved);
  for (let p = 0; p < PACKETS; p++) {
    warm.load(packet(T, p), { who: 'bus', budget: BUDGET });
    warm.query('posture[bus](P)', { budget: BUDGET });
  }
  warm.tickAdvance({ budget: BUDGET });
  assert.ok(warm.store.relCount('derived_by') > carried, 'without the flag it only grows');
});

// ---------------------------------------------------------------------------
// §10  the additive model, checked against a run it did not see

test('a third run\'s store is predicted exactly from the other two', () => {
  const inc = [base().samples[0].prov, ...increments(base().samples).map((x) => x.prov)];
  const last = base().samples.length - 1;
  const predictedProv = inc[last] + inc[last - 1];              // retainTicks: 1 keeps two ticks
  const predictedFacts = keep0().samples[last].facts + (predictedProv - keep0().samples[last].prov);
  assert.equal(keep1().samples[last].prov, predictedProv);
  assert.equal(keep1().samples[last].facts, predictedFacts);
});

test('the exchange rate says a window costs mission time, and says how much', () => {
  const rows = exchange(100_000, 2_000, 100, 900, [0, 1, 8, 64]);
  assert.deepEqual(rows.map((x) => x.window), [0, 1, 8, 64]);
  assert.ok(rows[0].ticks > rows[1].ticks && rows[1].ticks > rows[2].ticks && rows[2].ticks > rows[3].ticks,
    `a wider window must cost ticks: ${rows.map((x) => x.ticks).join(',')}`);
  // and the arithmetic is the one the doc comment states
  assert.equal(rows[0].ticks, Math.floor((100_000 - 2_000) / 100));
  assert.equal(rows[2].ticks, Math.floor((100_000 - 2_000 - 8 * 900) / 100));
});
