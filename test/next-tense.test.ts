// next-tense.test.ts — settles f_next_does_not_break_a_negative_cycle,
// f_next_tense_is_decided_reading_one and
// f_a_next_conclusion_gets_its_stratum_through_the_edge_to_be_cut.
//
// THE DECISION: `not p` means "p is not derivable in the CURRENT TICK's
// store". A rule whose head is '@next' therefore contributes NO same-tick
// dependency edge — its conclusion is not derived in this tick at all, it is
// staged and installed at the tick boundary — and its conclusion relation
// takes stratum 0, which is also what such a fact IS there: base for the tick
// that sees it. The kernel carries the head's tense as `conclusion_tense/2`
// because the marker otherwise lives only inside the reified `$lit` of
// `conclusion_lit`, where `$` is unwritable and no rule can reach it.
//
// Three things have to hold together and each can pass while another fails,
// so each has its own test and its own control:
//
//   1. a SAME-TICK negative cycle is still refused. This is the one that
//      matters: a change that simply disabled stratification would turn every
//      other test in this file green.
//   2. a '@next'-concluded relation still HAS a stratum. It used to inherit
//      one through the very edge that is now removed.
//   3. a '@next' rule that negates runs AFTER every stratum, not at its head
//      relation's level. Staging is monotone, so a premature firing over an
//      incomplete relation can never be taken back.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { peelRounds } from '../src/rounds.ts';

/** The schedule the evaluation ran on, taken off the decoded rules. */
const peelOf = (r: Rofl) => peelRounds(new Evaluation(r.store, { budget: 4000 }).rules);

const BOOT = fs.readFileSync(new URL('../boot.rofl', import.meta.url), 'utf8');

/** boot.rofl loaded, so `dep`/`stratum`/`unstratified` are real. The budget is
 *  small on purpose: a rejected program's demonstration is the slow path, and
 *  a test nobody will sit through is a test that gets switched off. */
function booted(): Rofl {
  const r = new Rofl();
  assert.ok(r.load(BOOT, { budget: 20_000 }).ok, 'boot.rofl must load');
  return r;
}

const rows = (r: Rofl, q: string): string[] => r.query(q).rows.map((x) => x.text);

// ---------------------------------------------------------------------------
// 1. THE DISCRIMINATING TEST

test('a same-tick negative cycle is still refused, and the same program opened is not', () => {
  const closed = booted();
  const c = closed.load(`
    seed(a).
    p(X) :- seed(X), not q(X).
    q(X) :- seed(X), p(X).
  `, { budget: 2000 });
  assert.equal(c.ok, false, 'stratification must still reject a same-tick cycle');
  assert.match(c.diagnostics.join('\n'), /settled nothing while .*\bp\b/);
  assert.match(c.diagnostics.join('\n'), /negated dependencies/, 'and refuse with a demonstration');

  // THE POSITIVE CONTROL: the same shape with the back edge cut must load AND
  // derive. If it did not, the refusal above would be about something else.
  const open = booted();
  const o = open.load(`
    seed(a).
    edb(blocker).
    p(X) :- seed(X), not q(X).
    q(X) :- seed(X), blocker(X).
  `, { budget: 2000 });
  assert.equal(o.ok, true, 'the control must load');
  assert.deepEqual(rows(open, 'p(X)'), ['X = a'], 'the control must derive, not merely load');
});

test('the SAME loop written across the tick boundary loads and runs', () => {
  // sense -> decide -> act -> world -> sense: acyclic in time, and the world
  // transition is the only thing that closes it.
  const CORE = `
    edb(at).
    at(a, 1) @init.
    saw(E, X) :- at(E, X).
    steps(E) :- saw(E, _), not parked(E).
    parked(E) :- saw(E, 0).
  `;
  const ACROSS = `
    at(E, X2) @next :- steps(E), at(E, X), X2 is X + 1.
    at(E, X) @next :- at(E, X), not steps(E).
  `;
  // the same two rules with the marker taken off: now the transition really
  // does write, in one tick, what deliberation reads in it
  const WITHIN = `
    at(E, X2) :- steps(E), at(E, X), X2 is X + 1.
    at(E, X) :- at(E, X), not steps(E).
  `;

  const across = booted();
  assert.equal(across.load(CORE + ACROSS, { budget: 4000 }).ok, true,
    'a @next head is not a same-tick dependency');
  assert.deepEqual(rows(across, 'at(E, X)'), ['E = a, X = 1']);
  across.tickAdvance({ budget: 4000 });
  assert.deepEqual(rows(across, 'at(E, X)'), ['E = a, X = 2'],
    'loading is worth nothing unless the world it computes is the right one');
  assert.deepEqual(rows(across, 'unstratified(R)'), []);

  // THE CONTROL, one word away: the same transition inside one tick is a real
  // negative cycle and must still be refused.
  const within = booted();
  const w = within.load(CORE + WITHIN, { budget: 4000 });
  assert.equal(w.ok, false, 'the marker is the whole difference and it must decide');
  assert.match(w.diagnostics.join('\n'), /settled nothing while .*\bat\b/);
});

// ---------------------------------------------------------------------------
// 2. THE HAZARD, AND WHY IT NO LONGER EXISTS. A '@next' conclusion used to get
//    its stratum through the very edge that is now removed, so removing the
//    edge alone left the relation with no stratum at all — which is why
//    boot.rofl carried a floor rule, `stratum(Rel, 0) :- concludes(R, Rel),
//    conclusion_tense(R, next)`, saying such a relation is base for the tick
//    that sees it. That rule went with the other nine. The peel needs no floor
//    because it never assigns the relation a level in the first place: a
//    '@next' head settles nothing, so nothing orders it, so it runs last. The
//    hazard was an artefact of having to write the answer down as a number.

test('a relation only ever concluded @next draws no same-tick edge, and is ordered by nothing', () => {
  const r = booted();
  assert.equal(r.load('seed(a). carried(X) @next :- seed(X).', { budget: 2000 }).ok, true);

  for (const tick of [0, 1]) {
    assert.equal(r.store.tick, tick);
    // `advanceTick` installs a staged fact as base but asserts no `edb` mark
    // for its relation — the route the old floor rule existed to replace
    assert.deepEqual(rows(r, 'edb(carried)'), [], 'no edb mark, at either tick');
    assert.deepEqual(rows(r, 'edb(seed)'), ['true'], '...and the control says the query works');
    // the edge is gone, and now it is gone from the SCHEDULE rather than from
    // a relation describing the schedule
    const peel = peelOf(r);
    assert.deepEqual([...(peel.deps.pos.get('carried') ?? [])], [],
      'a @next head draws no same-tick edge');
    assert.deepEqual([...(peel.deps.neg.get('carried') ?? [])], []);
    assert.equal(peel.round.has('carried'), false,
      'and no round settles it: nothing in this tick can read a staged conclusion');
    assert.equal(peel.round.has('saw_nothing'), false, 'control: an unknown relation is absent too');
    assert.ok(peel.round.size > 0, 'positive control: the peel did settle relations');
    if (tick === 0) {
      assert.deepEqual(rows(r, 'carried(X)'), [], 'not derived in the tick that stages it');
      r.tickAdvance({ budget: 2000 });
    } else {
      assert.deepEqual(rows(r, 'carried(X)'), ['X = a'], 'and present in the tick that sees it');
    }
  }
});

test('the kernel publishes the head tense, and it is readable by a rule', () => {
  const r = booted();
  assert.equal(r.load('seed(a). here(X) :- seed(X). later(X) @next :- seed(X).').ok, true);
  const tensed = (t: string) =>
    r.query(`conclusion_tense(R, ${t})`).rows.length;
  assert.ok(tensed('next') >= 1, 'the @next rule is marked');
  assert.ok(tensed('now') > tensed('next'), 'and boot.rofl\'s own rules are marked now');
  // the tense reaches a relation NAME through an ordinary join, which is
  // exactly what boot.rofl does with it
  assert.equal(r.load('staged_rel(Rel) :- concludes(R, Rel), conclusion_tense(R, next).').ok, true);
  assert.deepEqual(rows(r, 'staged_rel(Rel)'), ['Rel = later']);
});

// ---------------------------------------------------------------------------
// 3. THE SCHEDULING HALF. `mark(a)` holds and `mark(b)` does not, so exactly
//    carried(b) may be staged. Judged at stratum 0 — which is where the head
//    relation now sits — `not mark(X)` succeeds for both.

test('a @next rule that negates runs after every stratum, not at its head\'s level', () => {
  const r = booted();
  assert.equal(r.load(`
    seed(a). seed(b). gone(b).
    mark(X)          :- seed(X), not gone(X).
    carried(X) @next :- seed(X), not mark(X).
  `, { budget: 4000 }).ok, true);
  // the control: the relation the @next rule negates is genuinely split
  assert.deepEqual(rows(r, 'mark(X)'), ['X = a']);
  const peel = peelOf(r);
  assert.equal(peel.round.has('carried'), false, 'no round settles the staged head');
  assert.ok((peel.round.get('mark') ?? -1) >= 1, 'while the relation it negates does have one');
  assert.equal(r.strataPlan().find((p) => p.rel === 'carried')!.level, null,
    'and the plan says it runs in the final pass instead');
  assert.ok(r.strataPlan().find((p) => p.rel === 'mark')!.level !== null,
    'positive control: the plan CAN report a level, so the null above is a verdict');
  r.tickAdvance({ budget: 4000 });
  assert.deepEqual(rows(r, 'carried(X)'), ['X = b'],
    'staging is monotone: one firing over an incomplete `mark` could never be taken back');
});
