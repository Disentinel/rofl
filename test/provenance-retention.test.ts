// provenance-retention.test.ts — the completed-tick provenance policy.
//
// WHAT IS BEING DECIDED. `advanceTick` freezes `derived_by`, so a finished
// tick keeps the record of which rule concluded what. Measured in
// examples/npc: ~2000 facts per tick, dwarfing everything the domain itself
// produces, and pruning it takes that run from 571 to 322 ms per tick. A
// host that runs for a day therefore degrades without bound. The kernel now
// offers a policy, and this file is what the policy is allowed to be.
//
// FOUR THINGS, EACH WITH ITS OWN CONTROL, because each can pass while another
// fails:
//
//   1. OFF BY DEFAULT. An unconfigured `Rofl` keeps everything, byte for byte.
//   2. ON, IT BOUNDS THE STORE. The provenance count stops growing with the
//      tick number — MEASURED as a slope over the run, not asserted against a
//      constant picked to fit — while the domain facts stay identical.
//   3. THE DISCRIMINATING ONE. A program that READS `derived_by` in a rule
//      keeps its provenance even with retention asked for, and its facts are
//      byte-identical to the unpruned run. Its control is a third run that
//      prunes anyway: the answers MOVE, which is what makes the equality in
//      the second run mean something instead of being true by accident.
//   4. THE WINDOW BOUNDARY at N = 0, 1 and 3, against the same run with the
//      policy off, so "these ticks are absent" is distinguishable from "these
//      ticks were never produced".
//
// Plus the budget record: what a tick was evaluated WITH, which is what makes
// "reconstructable" true without a caveat.

import { test } from 'node:test';
import assert from 'node:assert';
import { Rofl } from '../src/api.ts';

const PROV = 'derived_by';

// A program that ticks forever, produces a handful of firings per tick, and
// never looks at its own provenance. Base facts are tick-scoped, so `n` and
// `clock` need carry rules — that is the kernel's persistence idiom, and it
// is also what makes provenance accumulate at the boundary as well as inside
// the tick.
const TICKER = `
n(1). n(2). n(3).
n(X) @next :- n(X).
clock(0).
clock(T1) @next :- clock(T), T1 is T + 1.
mark(T, X) :- clock(T), n(X).
tally(T) :- mark(T, _).
`;

// The same program with LOOT's shape bolted on: rules that join the kernel's
// own provenance with something else. `fired` is loot.rofl §5 verbatim in
// structure (provenance ⋈ a rule-keyed table, tick wildcarded); `busy` is the
// one that reaches ACROSS completed ticks, and is therefore the one a pruning
// policy would silently change.
const READER = TICKER + `
fired[audit](R)      :- derived_by(_, R, _), rule(R).
derived_at[audit](T) :- derived_by(_, _, T).
busy[audit](T)       :- derived_at[audit](T), n(T).
`;

const BUDGET = 50_000;

function loaded(prog: string, opts: { retainTicks?: number } = {}): Rofl {
  const r = new Rofl(opts);
  assert.ok(r.load(prog, { budget: BUDGET }).ok, 'the program must load');
  return r;
}

/** How many provenance records the store holds. */
const provCount = (r: Rofl): number => r.store.relCount(PROV);

/** The ticks those records are about, ascending. Read off the third argument
 *  rather than through a query, so the probe cannot be fooled by a query that
 *  declined to run. */
function provTicks(r: Rofl): number[] {
  const out = new Set<number>();
  for (const f of r.store.facts.values()) {
    if (f.rel !== PROV) continue;
    const t = f.args[2];
    if (t.k === 'i') out.add(t.v);
  }
  return [...out].sort((a, b) => a - b);
}

/** Everything in the store that is NOT provenance: what a retention policy is
 *  claiming not to touch. */
function domainFacts(r: Rofl): string[] {
  return [...r.store.facts.keys()].filter((k) => r.store.get(k)!.rel !== PROV).sort();
}

/** Drop every provenance record, the way a host would have to before this
 *  policy existed (examples/npc/demo.ts `pruneProvenance`). Used ONLY as the
 *  control that proves test 3 can fail. */
function hostPrune(r: Rofl): void {
  const keys: string[] = [];
  for (const f of r.store.facts.values()) if (f.rel === PROV) keys.push(f.key);
  for (const k of keys) r.store.remove(k);
}

/** Run `ticks` boundaries and sample the provenance count after each one,
 *  with the current tick evaluated so the sample includes it. */
function sample(r: Rofl, ticks: number, after?: (r: Rofl) => void): number[] {
  const out: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const res = r.tickAdvance({ budget: BUDGET });
    assert.equal(res.partial, false, `tick ${i} must not hit its budget`);
    assert.equal(res.advanced, true, `tick ${i} must advance`);
    after?.(r);
    r.evaluate(BUDGET);
    out.push(provCount(r));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. OFF BY DEFAULT

test('an unconfigured Rofl keeps every completed tick, exactly as before', () => {
  const r = loaded(TICKER);
  const counts = sample(r, 10);
  assert.equal(r.retainTicks, undefined, 'the policy is opt-in');
  for (let i = 1; i < counts.length; i++) {
    assert.ok(counts[i] > counts[i - 1],
      `default provenance must keep growing: tick ${i} ${counts[i]} <= ${counts[i - 1]}`);
  }
  assert.deepEqual(provTicks(r), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    'every tick from 0 to now is still on the record');
});

// ---------------------------------------------------------------------------
// 2. ON, THE STORE STOPS GROWING — and the domain does not move

test('retention bounds provenance while the domain facts stay identical', () => {
  const TICKS = 10;
  const base = loaded(TICKER);
  const kept = loaded(TICKER, { retainTicks: 0 });
  const baseCounts = sample(base, TICKS);
  const keptCounts = sample(kept, TICKS);

  // THE POSITIVE CONTROL, first, because everything below is about a number
  // that must not be zero for a reason other than the one claimed: the pruned
  // run has to be producing provenance at all.
  for (let i = 0; i < TICKS; i++) {
    assert.ok(keptCounts[i] > 0,
      `tick ${i} produced NO provenance at all (${keptCounts[i]}); this test would ` +
      'pass for the wrong reason');
  }

  // MEASURED, not asserted against a constant: fit the slope over the second
  // half of the run, where any start-up transient is over.
  const half = TICKS >> 1;
  const slope = (xs: number[]) => (xs[TICKS - 1] - xs[half]) / (TICKS - 1 - half);
  const baseSlope = slope(baseCounts);
  const keptSlope = slope(keptCounts);
  assert.ok(baseSlope > 0,
    `the default must grow with the tick number; measured ${baseSlope} facts/tick`);
  assert.equal(keptSlope, 0,
    `retention must stop the growth; measured ${keptSlope} facts/tick ` +
    `(${keptCounts.join(',')}) against ${baseSlope} by default (${baseCounts.join(',')})`);
  const spread = Math.max(...keptCounts.slice(half)) - Math.min(...keptCounts.slice(half));
  assert.equal(spread, 0,
    `a bounded store is flat, not merely slower: spread ${spread} over ` +
    keptCounts.slice(half).join(','));

  assert.deepEqual(provTicks(kept), [kept.store.tick],
    'exactly the current tick is on the record, and nothing completed');
  assert.deepEqual(provTicks(base).length, base.store.tick + 1,
    'the control still holds every tick, so the absence above is the policy');

  // and the thing the policy promises not to touch
  assert.deepEqual(domainFacts(kept), domainFacts(base),
    'pruning provenance must change no other fact in the store');
});

// ---------------------------------------------------------------------------
// 3. THE DISCRIMINATING TEST

test('a program that reads derived_by keeps its provenance, and its answers', () => {
  const TICKS = 10;
  const base = loaded(READER);
  const asked = loaded(READER, { retainTicks: 0 });
  sample(base, TICKS);
  sample(asked, TICKS);

  // The control that makes the equality below a measurement: this program
  // really does read across completed ticks, so there IS something to lose.
  const busy = (r: Rofl) => r.query('busy[audit](T)').rows.map((x) => x.text).sort();
  assert.ok(busy(base).length > 1,
    `the fixture must reach across ticks; busy = ${busy(base).join(' ')}`);

  assert.equal(asked.retainTicks, 0, 'retention was asked for');
  assert.equal(asked.store.canonicalState(), base.store.canonicalState(),
    'a program reading provenance must be byte-identical with retention asked for');

  // AND THE PROOF THAT THE ASSERTION ABOVE CAN FAIL. Same program, same
  // ticks, provenance pruned anyway — the way a host had to before the gate
  // existed. If this run agreed too, the equality above would be vacuous.
  const pruned = loaded(READER);
  sample(pruned, TICKS, hostPrune);
  assert.notEqual(pruned.store.canonicalState(), base.store.canonicalState(),
    'pruning a provenance-reading program MUST change the store, or the gate ' +
    'is guarding nothing');
  assert.notDeepEqual(busy(pruned), busy(base),
    `the derived answers must move: pruned busy = ${busy(pruned).join(' ')} ` +
    `against ${busy(base).join(' ')}`);
  assert.ok(busy(pruned).length < busy(base).length,
    'and move by losing exactly what the completed ticks were carrying');
});

// ---------------------------------------------------------------------------
// 4. THE WINDOW BOUNDARY

test('the window is off unless asked for, and keeps exactly N completed ticks', () => {
  const TICKS = 6;
  const off = loaded(TICKER);
  sample(off, TICKS);
  const all = provTicks(off);
  assert.deepEqual(all, [0, 1, 2, 3, 4, 5, 6],
    'the control: with the window off every tick is present, so an absence below ' +
    'is the window and not a tick that never derived anything');

  for (const n of [0, 1, 3]) {
    const r = loaded(TICKER, { retainTicks: n });
    sample(r, TICKS);
    const now = r.store.tick;
    const want: number[] = [];
    for (let t = now - n; t <= now; t++) want.push(t);
    assert.deepEqual(provTicks(r), want,
      `retainTicks ${n} must keep the current tick and exactly ${n} completed ones`);
    assert.equal(provTicks(r).length, n + 1,
      `off-by-one guard: ${n + 1} ticks on the record for retainTicks ${n}`);
    assert.ok(!provTicks(r).includes(now - n - 1),
      `the tick one past the window (${now - n - 1}) must be gone`);
  }
});

// ---------------------------------------------------------------------------
// 5. THE BUDGET A TICK WAS EVALUATED WITH

test('each tick records the budget it ran under, and a replay can read it', () => {
  const LOAD = 45_000;
  const r = new Rofl();
  assert.ok(r.load(TICKER, { budget: LOAD }).ok);
  // Tick 0's fixpoint is the one `load` computed, so its budget is the load's
  // — the number that actually produced the standing state, not one a later
  // caller passed to a call that found nothing to do.
  assert.equal(r.store.evalOf(0)!.budget, LOAD, "tick 0 ran under the load's budget");
  r.tickAdvance({ budget: LOAD });

  // A DIFFERENT budget per tick from here on, because one number repeated
  // would be reconstructable without recording anything and would prove
  // nothing about the record.
  const given = [30_000, 20_000, 10_000];
  for (const b of given) {
    const t = r.store.tick;
    r.tickAdvance({ budget: b });
    const rec = r.store.evalOf(t);
    assert.ok(rec, `tick ${t} must have an evaluation record`);
    assert.equal(rec.budget, b, `tick ${t} ran under ${b}`);
    assert.equal(rec.partial, false);
    assert.ok(rec.steps <= rec.budget,
      `a complete tick spends within its budget: ${rec.steps} of ${rec.budget}`);
  }
  // the record is per tick, not one number overwritten
  const want = [LOAD, ...given];
  assert.deepEqual(want.map((_, t) => r.store.evalOf(t)!.budget), want,
    'every tick kept ITS budget');

  // A replay starts from a snapshot, so the number has to survive one.
  const back = Rofl.fromSnapshot(r.save());
  for (let t = 0; t < want.length; t++) {
    assert.deepEqual(back.store.evalOf(t), r.store.evalOf(t),
      `tick ${t}'s budget must survive save/restore`);
  }
});

test('a partial tick and a complete one differ by more than a boolean', () => {
  const complete = loaded(TICKER);
  const good = complete.store.evalOf(0)!;

  const starved = new Rofl();
  starved.load(TICKER, { budget: 5 });
  assert.equal(starved.store.partialEval, true,
    'the control: five steps must not be enough to reach the fixpoint');
  const bad = starved.store.evalOf(0)!;

  assert.equal(bad.partial, true);
  assert.equal(good.partial, false);
  // the numbers, which is the point: a partial tick stopped because it ran
  // out, and says so with a step count that reached its budget.
  assert.equal(bad.budget, 5);
  assert.ok(bad.steps > bad.budget,
    `a starved tick overruns its budget by the step that threw: ${bad.steps} > ${bad.budget}`);
  assert.ok(good.steps < good.budget,
    `a complete tick stops short of it: ${good.steps} < ${good.budget}`);
  assert.notDeepEqual(bad, good);
});
