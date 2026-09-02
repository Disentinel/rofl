// examples/npc — the NPC demo, run as a test so it cannot rot.
//
// Every assertion here is the demo's own: the hygiene the rest rests on, the
// fog of war and what one line in one journal is worth, the loop the kernel
// refuses to close, the semiring that arbitrates and the perturbation that
// flips its verdict without changing any priority order, the hole, the rule
// the agent writes for it and its effect on the recorded past, the rule-set
// diff, the frame budget, and the throughput.
//
// The oracle differs per claim, and none of them is the rules re-run:
//   the arbiter          against the arithmetic of the drive table done by
//                        hand, and against one priority moved by three points
//   the closed loop      against the SAME program with '@next' taken off the
//                        transition, which must still be refused — the
//                        positive control is inside the probe, so silence
//                        cannot be read as a result
//   the learned rule     against the store of tick 1, restored and re-derived
//   the rule id          against ruleIdOf recomputed from the text, plus a
//                        rename that must differ and a reflow that must not
//   the tick scan        against the acts the run actually took
//   the budget marker    against the same store evaluated again with room
//   the throughput       against the same run with provenance pruned
//
// Fast by construction: three simulated runs at module level, shared by every
// test below, and no test waits on anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { parseProgram } from '../src/parser.ts';
import { ruleIdOf } from '../src/reflect.ts';
import { evaluateSemiring } from '../src/semiring.ts';
import { probabilityOf, countingSemiring, type Count } from '../runtime/semirings.ts';
import {
  BOOT, NPC, START, TICKS, FRAME, PROPS, WIDTH, HEIGHT,
  head, publish, settle, chosen, rows, col, runSim, restore, lastDerivable,
  arbitrate, scoreFacts, parseKey, intentWeight, proposeRule, ruleIds, ruleSetDiff,
  loopProbe, countProbe, hygiene, firings, physics, render, pruneProvenance,
  type Ent,
} from '../examples/npc/demo.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const WATCH = [
  'spots', 'saw', 'recalls', 'foe', 'ally', 'intent', 'subgoal', 'option',
  'any_option', 'contender', 'preempted', 'does', 'uncovered', 'tie',
];

// one settled world at tick 1, one run, one run with the learned rule
const base = head();
publish(base, START);
settle(base);

const sim = runSim({ ticks: TICKS });
const holes = sim.ticks.flatMap((t) => t.uncovered);
const proposed = proposeRule(holes.filter((h) => h.reason === 'no_action'));
assert.ok(proposed !== null, 'the run must produce enough tend holes to generalise from');
const LEARNED = proposed.text;
const learned = runSim({ ticks: TICKS, extra: LEARNED });

/** THE HEADLINE, pinned line for line. The rule ids in it are content hashes
 *  of npc.rofl's clauses, so editing any of those rules forces this
 *  expectation — and the README and the page that quote it — to be redone.
 *  That is this example's own versioning claim applied to its own text. */
const HEADLINE = [
  'whynot in_sight[mind](npc_1,npc_5):',
  '  rule rd855e15c: in_sight[mind](?A,?E)@now :- recalls[mind](?A,?E,?_$0,?_$1,?_$2,?_$3,?T)@now, now[world](?T)@now',
  '    failed premise: recalls[mind](npc_1,npc_5,?_$0#0,?_$1#0,?_$2#0,?_$3#0,?T#0)',
  '      rule r693c2c00: recalls[mind](?A,?E,?K,?X,?Y,?B,?T)@now :- saw[?A](?E,?K,?X,?Y,?B,?T)@now, not outdated[mind](?A,?E,?T)@now',
  '        failed premise: saw[npc_1](npc_5,?_$0#0,?_$1#0,?_$2#0,?_$3#0,?T#0)',
  '          rule r92e1d2ea: saw[?A](?E,?K,?X,?Y,?B,?T)@now :- spots[world](?A,?E,?X,?Y)@now, kind[world](?E,?K)@now, band[world](?E,?B)@now, now[world](?T)@now',
  '            failed premise: spots[world](npc_1,npc_5,?_$1#0,?_$2#0)',
  '              rule ra4ebf83d: spots[world](?A,?E,?X,?Y)@now :- in_range[world](?A,?E,?X,?Y)@now, not screened[world](?A,?E,?_$0)@now',
  '                failed premise: not screened[world](npc_1,npc_5,?_$0#3) -- blocked: screened[world](npc_1,npc_5,cart_3) holds',
];

// ---------------------------------------------------------------------------
// hygiene: everything else in this file is about a different program if this
// fails, so it is first

test('every rule is range-restricted, nothing is demand-evaluated, nothing is unstratifiable', () => {
  const h = hygiene(base, WATCH);
  assert.equal(h.allSafe, true,
    'an unsafe rule would be unfolded top-down and the folds below would run over a different fact set');
  assert.equal(h.demandRels, 0);
  assert.deepEqual(h.unstratified, []);
});

test("boot.rofl's own audits over NPC's reflection are all empty", () => {
  const h = hygiene(base, WATCH);
  assert.deepEqual(h.audits, {
    malformed: 0, breach: 0, leak: 0, forged: 0, unmoded: 0, undefined_premise: 0,
  });
  // and empty because TWO declarations were written, not because the audit
  // stopped looking: `imports(audit, choice)` for the named walk, and
  // `collects(mind)` for the one no import can express -- ten journals filled
  // by one rule polymorphic in the agent. Both checked, so the zero above is
  // a result and not an assumption.
  assert.ok(base.holds('sees(audit, choice)'), 'the named crossing is declared');
  assert.ok(base.holds('collected[audit](mind)'),
    'the collection declaration was EXERCISED, not merely written');
});

test('the verdicts land in the strata boot.rofl computed, not in an assumed order', () => {
  const lv = Object.fromEntries(hygiene(base, WATCH).strata.map((s) => [s.rel, s.level]));
  // the ones that carry the file: every relation sits strictly above what it
  // NEGATES and level with what it merely reads
  assert.ok(lv.recalls > lv.saw, 'recalls negates outdated, which reads saw');
  assert.ok(lv.uncovered > lv.option, 'the hole negates the option table');
  assert.ok(lv.uncovered > lv.subgoal);
  assert.ok(lv.option > lv.intent, 'option negates prop_at through step_to');
  assert.equal(lv.intent, lv.subgoal, 'a positive premise does not raise a stratum');
  assert.ok(lv.does >= lv.contender);
});

// ---------------------------------------------------------------------------
// the perspectives, and the one rule that writes ten of them

test('one polymorphic carry rule carries ten separate journals, and leaks nothing', () => {
  // the POSITIVE CONTROL is that memory actually survives the clock for two
  // DIFFERENT agents: a carry rule that silently carried nothing would leave
  // `leak[audit]` empty too, and empty is not a measurement.
  const r = head();
  publish(r, START);
  settle(r);
  const before3 = rows(r, 'saw[npc_3](E, K, X, Y, B, T)').length;
  const before4 = rows(r, 'saw[npc_4](E, K, X, Y, B, T)').length;
  assert.ok(before3 > 0 && before4 > 0, 'both journals must have entries to begin with');
  r.tickAdvance();
  publish(r, sim.ticks[1].ents);
  settle(r);
  assert.ok(rows(r, 'saw[npc_3](E, K, X, Y, B, T)').length >= before3);
  assert.ok(rows(r, 'saw[npc_4](E, K, X, Y, B, T)').length >= before4);
  // a sighting stamped with tick 0 is still there after the clock moved
  assert.ok(r.holds('saw[npc_3](npc_5, warden, 4, 5, hurt, 0)'),
    "npc_3's tick-0 sighting must survive into tick 1");
  // and the audit is silent because `collects(mind)` is declared AND carried
  // across the tick boundary. Both halves are checked: a plain `collects(mind).`
  // is tick-scoped and would vanish here, taking the licence with it and
  // putting the leak back at tick 1 with nothing in the file changed.
  assert.ok(r.holds('collected[audit](mind)'), 'the declaration survived the tick');
  assert.deepEqual(rows(r, 'leak[audit](A, B)'), []);
  // and the journals are genuinely separate: npc_3 saw npc_5, npc_1 did not
  assert.ok(!r.holds('saw[npc_1](npc_5, warden, 4, 5, hurt, 0)'));
});

test('the fog of war: in range, unseen, and the blocker is a named prop', () => {
  assert.ok(base.holds('in_range[world](npc_1, npc_5, 4, 5)'), 'so it is not distance');
  assert.ok(!base.holds('in_sight[mind](npc_1, npc_5)'));
  assert.deepEqual(col(base, 'screened[world](npc_1, npc_5, P)', 'P'), ['cart_3']);
});

test('one line in one journal changes what that agent concludes, world untouched', () => {
  const informed = head();
  publish(informed, START);
  informed.assert('saw[npc_1](npc_5, warden, 4, 5, hurt, 0).', { who: 'npc_1' });
  settle(informed);
  const blind = col(base, 'intent[mind](npc_1, G, P)', 'G').sort();
  const seeing = col(informed, 'intent[mind](npc_1, G, P)', 'G').sort();
  assert.deepEqual(blind, ['hold_post']);
  assert.deepEqual(seeing, ['hold_post', 'tend(npc_5)', 'tend_wounded']);
  assert.ok(informed.holds('uncovered[audit](npc_1, no_action, tend(npc_5))'));
  // the world really is untouched: same positions, same wounds
  assert.deepEqual(rows(informed, 'at[world](E, X, Y)'), rows(base, 'at[world](E, X, Y)'));
  assert.deepEqual(rows(informed, 'hp[world](E, H)'), rows(base, 'hp[world](E, H)'));
  // and the agent is not forging: it wrote into its own ledger
  assert.equal(rows(informed, 'forged[audit](F)').length, 0);
});

test('an agent writing into somebody else\'s journal is forged, mechanically', () => {
  const r = head();
  publish(r, START);
  r.assert('saw[npc_1](npc_5, warden, 4, 5, hurt, 0).', { who: 'npc_4' });
  settle(r);
  assert.equal(rows(r, 'forged[audit](F)').length, 1,
    'npc_4 has no authority over npc_1\'s ledger and nothing enforces that but the audit');
});

// ---------------------------------------------------------------------------
// the loop the kernel would not close, and now does

test('the sense-act loop closes across a tick, and is still refused inside one', () => {
  const lp = loopProbe();
  // the loop written across the tick boundary loads
  assert.equal(lp.closedOk, true, 'a @next head is not a same-tick dependency');
  // and computes the right world: npc_1 stepped east, npc_7 saw nobody and stayed
  assert.deepEqual(lp.moved, ['E = npc_1, X = 2, Y = 1', 'E = npc_7, X = 3, Y = 1'],
    'loading is worth nothing if the transition it now permits is wrong');
  // THE DISCRIMINATING CONTROL, one word away from the program above: the same
  // transition with '@next' taken off is a REAL same-tick cycle and must still
  // be refused. A kernel that had simply stopped checking would pass the first
  // assertion and fail this one.
  assert.equal(lp.sameTickOk, false, 'stratification must still reject a same-tick cycle');
  assert.match(lp.sameTickDiag, /settled nothing/);
  assert.match(lp.sameTickDiag, /\bat\b/);
  // and the third arm: the same program with no transition at all must load
  // AND derive, or all three arms are about something else
  assert.equal(lp.openOk, true, 'the control must load');
  assert.ok(lp.openDerives.length > 0, 'the control must derive, not merely load');
});

// ---------------------------------------------------------------------------
// the arbiter

test('the Viterbi fold reproduces the drive table exactly', () => {
  const f = arbitrate(base);
  const strike = f.option.get('option[mind](npc_4,strike(npc_8),drive_off(npc_8))');
  const hold = f.option.get('option[mind](npc_4,hold,hold_post)');
  assert.ok(strike !== undefined && hold !== undefined);
  // repel 65 reaches strike in two steps; hold_post 40 reaches hold in one
  assert.ok(Math.abs(probabilityOf(strike) - 0.65 * 0.65) < 1e-4);
  assert.ok(Math.abs(probabilityOf(hold) - 0.40) < 1e-4);
  assert.equal(f.converged, true);
  assert.equal(f.disciplineHeld, true);
  assert.deepEqual(chosen(base).filter((a) => a.agent === 'npc_4').map((a) => a.act),
    ['strike(npc_8)']);
});

test('one priority from 65 to 62 flips the act, with the priority ORDER unchanged', () => {
  const soft = new Rofl();
  soft.load(BOOT, { budget: 4_000_000 });
  soft.load(NPC.replace('drive[world](warden, repel,        65) @init.',
    'drive[world](warden, repel,        62) @init.'), { who: 'sim', budget: 4_000_000 });
  publish(soft, START);
  settle(soft);
  // 62 is still far above hold_post's 40 — the ORDER did not move
  assert.ok(soft.holds('drive[world](warden, repel, 62)'));
  assert.ok(soft.holds('drive[world](warden, hold_post, 40)'));
  assert.deepEqual(chosen(soft).filter((a) => a.agent === 'npc_4').map((a) => a.act), ['hold'],
    'two steps of 0.62 are worth less than one of 0.40, and no `if` says that');
});

test('the weight hook reads the intent priority off the fact key and nothing else', () => {
  assert.equal(parseKey('intent[mind](npc_3,tend(npc_5),70)')!.args[1], 'tend(npc_5)',
    'a nested term must not be split on its own comma');
  assert.ok(Math.abs(probabilityOf(intentWeight('intent[mind](npc_3,tend(npc_5),70)')) - 0.7) < 1e-6);
  // everything that is not an intent is free — the fold gets its shape from
  // the support graph, not from a table of special cases
  assert.equal(probabilityOf(intentWeight('option[mind](npc_3,hold,hold_post)')), 1);
  assert.equal(probabilityOf(intentWeight('at[world](npc_3,2,5)')), 1);
});

test('the tie the arbiter cannot break is recorded rather than hidden', () => {
  const ties = sim.ticks[0].ties;
  assert.ok(ties.length > 0, 'the wisp has several equally good steps at tick 0');
  assert.ok(ties.every((t) => /^npc_\d+: /.test(t)));
  // and exactly one act survives per agent, whatever the ties
  const acts = sim.ticks[0].acts.map((a) => a.agent);
  assert.equal(new Set(acts).size, acts.length, 'one act per agent');
});

// ---------------------------------------------------------------------------
// why and whynot

test('whynot on an act names the option that outscored it', () => {
  const t = base.whynot('does[mind](npc_4, hold)', { depth: 3 }).text;
  assert.match(t, /failed premise: contender\[mind\]\(npc_4,hold\)/);
  assert.match(t, /blocked: beaten\[mind\]/);
});

test('whynot on an unreachable act names the premise, and the demonstration is the headline', () => {
  const t = base.whynot('option[mind](npc_3, tend(npc_5), tend(npc_5))', { depth: 3 }).text;
  assert.match(t, /failed premise: adjacent\[mind\]\(npc_3,npc_5\)/);
  assert.match(t, /4 <= 1 \[builtin fails\]/);
  const head8 = base.whynot('in_sight[mind](npc_1, npc_5)', { depth: 4 })
    .text.split('\n').slice(0, HEADLINE.length);
  assert.deepEqual(head8, HEADLINE);
});

test('the bounds whynot announces are the bounds it took', () => {
  const t = base.whynot('in_sight[mind](npc_1, npc_5)', { depth: 2 }).text;
  assert.match(t, /\[depth limit 2 reached\]/, 'a cut demonstration says it was cut');
  const wide = base.whynot('in_sight[mind](npc_1, npc_5)', { depth: 6, nodes: 4 }).text;
  assert.match(wide, /\[node limit 4 reached\]/);
});

test('why on an intent walks the whole decomposition down to the drive table', () => {
  const t = base.why('intent[mind](npc_4, drive_off(npc_8), 65)').text;
  assert.match(t, /subgoal\[mind\]\(npc_4,repel,drive_off\(npc_8\)\)/);
  assert.match(t, /intent\[mind\]\(npc_4,repel,65\)/);
  assert.match(t, /drive\[world\]\(warden,repel,65\) \[axiom\]/);
  assert.match(t, /at\[world\]\(npc_8,8,2\) \[axiom\]/);
});

// ---------------------------------------------------------------------------
// the holes

test('a subgoal with no derivable act is an explicit hole at tick 1', () => {
  assert.ok(base.holds('uncovered[audit](npc_3, no_action, tend(npc_5))'));
  // and it is a hole because the SUBGOAL exists; a drive that simply does not
  // apply is not a hole, or every agent would be one every tick
  assert.ok(base.holds('subgoal[mind](npc_3, tend_wounded, tend(npc_5))'));
  assert.ok(!base.holds('uncovered[audit](npc_5, no_action, survive)'));
  assert.equal(chosen(base).find((a) => a.agent === 'npc_3')?.act, 'hold',
    'the agent does something else ON PURPOSE rather than falling through');
});

test('the wisp is unclassified because no table names it, and that hole stays open', () => {
  assert.ok(base.holds('uncovered[audit](npc_2, unclassified, npc_10)'));
  assert.ok(!base.holds('foe[mind](npc_2, npc_10)'));
  assert.ok(!base.holds('ally[mind](npc_2, npc_10)'));
  // the run ends with it still open: one sighting of one thing is not a
  // reason to write a rule, and the example does not pretend otherwise
  assert.ok(learned.ticks[learned.ticks.length - 1].uncovered
    .some((u) => u.reason === 'unclassified'));
});

test('proposeRule refuses to generalise from too little — the negative control', () => {
  const one = [{ agent: 'npc_3', reason: 'no_action', subject: 'tend(npc_5)' }];
  assert.equal(proposeRule(one), null);
  assert.equal(proposeRule([]), null);
  // and it refuses a shape it was not written for, however many there are
  assert.equal(proposeRule(Array.from({ length: 9 }, () => (
    { agent: 'npc_7', reason: 'no_action', subject: 'stalk(npc_4)' }))), null);
});

// ---------------------------------------------------------------------------
// self-extension

test('the rule written after the run closes the hole in the store of tick 1', () => {
  assert.ok(sim.ticks[0].uncovered.some((u) => u.agent === 'npc_3' && u.reason === 'no_action'));
  const past = restore(sim, 1, LEARNED);
  past.evaluate();
  assert.ok(!past.holds('uncovered[audit](npc_3, no_action, tend(npc_5))'));
  assert.ok(col(past, 'option[mind](npc_3, Act, tend(npc_5))', 'Act').length > 0);
  // the past is RE-DERIVED, not patched: the store came back dirty and the
  // whole derived layer was rebuilt with the new rule in it
  assert.equal(past.store.tick, 1);
  assert.equal(rows(past, 'unstratified(X)').length, 0, 'boot.rofl judges the new rule too');
  assert.equal(rows(past, 'undefined_premise[audit](R, Rel)').length, 0);
});

test('the new rule changes behaviour, and the effect reaches the world', () => {
  const before = sim.ticks.map((t) => t.acts.find((a) => a.agent === 'npc_3')?.act ?? '-');
  const after = learned.ticks.map((t) => t.acts.find((a) => a.agent === 'npc_3')?.act ?? '-');
  assert.deepEqual(before, Array.from({ length: TICKS }, () => 'hold'));
  assert.equal(after[0], 'move(east)');
  assert.ok(after.includes('tend(npc_5)'), 'and then it binds the wound');
  const hpBefore = sim.ents.find((e) => e.id === 'npc_5')!.hp;
  const hpAfter = learned.ents.find((e) => e.id === 'npc_5')!.hp;
  assert.equal(hpBefore, 55);
  assert.ok(hpAfter > hpBefore, 'the ally is actually healed, not merely intended at');
  const noActionBefore = sim.ticks.flatMap((t) => t.uncovered).filter((u) => u.reason === 'no_action').length;
  const noActionAfter = learned.ticks.flatMap((t) => t.uncovered).filter((u) => u.reason === 'no_action').length;
  assert.ok(noActionAfter < noActionBefore);
});

test('the rule-set diff of two store snapshots names exactly the rule the text hashes to', () => {
  const d = ruleSetDiff(ruleIds(restore(sim, 1)), ruleIds(restore(sim, 1, LEARNED)));
  assert.equal(d.removed.length, 0);
  assert.deepEqual(d.added, [ruleIdOf(parseProgram(LEARNED)[0])]);
  assert.ok(d.kept > 90);
});

test('a rename changes the rule id and a reflow does not (LOOT\'s finding, with its control)', () => {
  const id = ruleIdOf(parseProgram(LEARNED)[0]);
  const renamed = ruleIdOf(parseProgram(LEARNED.replace(/\bD1\b/g, 'Z1').replace(/\bD0\b/g, 'Z0'))[0]);
  const reflowed = ruleIdOf(parseProgram(LEARNED.replace(/\n\s+/g, ' '))[0]);
  assert.notEqual(renamed, id, 'canonClause keeps the letters the author typed');
  assert.equal(reflowed, id, 'the control: whitespace is not identity, so the first half is a measurement');
});

// ---------------------------------------------------------------------------
// time

test('a tick is restorable, and the store comes back re-derivable rather than replayed', () => {
  const r = restore(sim, 3);
  assert.equal(r.store.tick, 3);
  assert.equal(rows(r, 'at[world](E, X, Y)').length, sim.ticks[3].ents.length);
  assert.ok(rows(r, 'saw[npc_3](E, K, X, Y, B, T)').length > 0);
  // a journal entry stamped with an earlier tick is still there
  assert.ok(rows(r, 'saw[npc_3](E, K, X, Y, B, 0)').length > 0);
});

test('"when was this last derivable" agrees with what the run actually did', () => {
  const ld = lastDerivable(sim, 'does[mind](npc_4, strike(npc_8))');
  assert.ok(ld.tick !== null);
  for (const t of ld.held) {
    assert.ok(sim.ticks.find((x) => x.tick === t)!.acts
      .some((a) => a.agent === 'npc_4' && a.act === 'strike(npc_8)'),
      `tick ${t}: the snapshot scan and the run must agree`);
  }
  for (const t of ld.missed) {
    assert.ok(!sim.ticks.find((x) => x.tick === t)!.acts
      .some((a) => a.agent === 'npc_4' && a.act === 'strike(npc_8)'));
  }
  // and the tick after the last one has a reason
  const after = restore(sim, ld.tick! + 1);
  assert.match(after.whynot('does[mind](npc_4, strike(npc_8))', { depth: 3 }).text,
    /failed premise/);
});

test('a memory outlives what it is about, and says how old it is', () => {
  const late = restore(sim, TICKS - 1);
  const stale = rows(late, 'stale[audit](A, E, Age)').map((x) => Number(x.Age));
  assert.ok(stale.length > 0, 'the fog of war must produce stale beliefs or it is not one');
  assert.ok(Math.max(...stale) >= 3, 'and some of them are several ticks old');
  // a prop never moves, so a memory of one is never counted stale
  assert.equal(rows(late, 'stale[audit](A, E, Age)')
    .filter((x) => PROPS.some((p) => p.id === x.E)).length, 0);
});

// ---------------------------------------------------------------------------
// the frame budget

test('an exhausted frame budget yields a marked partial answer, not a hang and not rubbish', () => {
  const cold = restore(sim, 3);
  const cost = firings(cold);
  assert.ok(cost > FRAME, `the probe is vacuous unless the frame budget (${FRAME}) is under the cost (${cost})`);
  const starved = restore(sim, 3);
  starved.evaluate(FRAME);
  assert.equal(starved.store.partialEval, true);
  assert.ok(rows(starved, 'hole(Id, budget_exhausted)').length > 0);
  // the marker cannot be derived in the frame that wrote the hole — deriving
  // it is itself a firing — but the next evaluation reads it
  assert.equal(rows(starved, 'thought_partial[audit](Id)').length, 0);
  assert.ok(rows(starved, 'intent[mind](A, G, P)').length > 0, 'and it is a PARTIAL answer, not none');
  starved.store.dirty = true;
  starved.evaluate();
  assert.ok(rows(starved, 'thought_partial[audit](Id)').length > 0);
});

// ---------------------------------------------------------------------------
// the semirings across ticks

test('the clock does not change what is countable, and viterbi still converges', () => {
  const c0 = countProbe(head());
  const c3 = countProbe(restore(sim, 3));
  // the carry rule used to put memory on a cycle: tick 3 read 1137 INFINITE
  // against tick 0's 233, and 185 of the extra were the agent's own saw and
  // recalls facts. The fold is about one tick, so the clock moves neither
  // number now.
  assert.equal(c3.infinite, c0.infinite, 'the clock adds no infinities');
  assert.equal(c3.cyclic, c0.cyclic, 'and no cycles');
  assert.equal(c0.memory, 0);
  assert.equal(c3.memory, 0, 'nothing the agent remembers is countless');
  assert.ok(c3.finite > c0.finite, 'the store grows; what grows is finite');
  // the control, and it is the point: the fold has NOT stopped seeing cycles.
  // What is left is boot.rofl's own closure, a cycle inside ONE tick.
  assert.ok(c3.infinite > 0, 'a real cycle is still INFINITE');
  assert.ok(c3.sample.every((k) => k.startsWith('reach[') || k.startsWith('stratum[')
      || k.startsWith('flows_to[') || k.startsWith('crossing[')),
    `what stays INFINITE is the meta-level closure: ${c3.sample.join(', ')}`);
  // the SAME store, folded with the BOUNDED instance, converges
  const f = arbitrate(restore(sim, 3));
  assert.equal(f.converged, true);
  assert.equal(f.disciplineHeld, true);
  assert.ok(f.cyclic > 0, 'over exactly the same cycles — that is what makes it a comparison');
});

test('a carried fact is a given, and its self-loop is still in the graph', () => {
  const r = restore(sim, 3);
  r.evaluate();
  const f = evaluateSemiring(r.store, countingSemiring);
  const carried = [...f.value.keys()].find((k) => k.startsWith('saw[npc_3](npc_5,'));
  assert.ok(carried !== undefined);
  assert.equal(f.value.get(carried) as Count, 1n, 'one way for a memory to be true here');
  // and the fold is declining to walk an edge that is there, which is not the
  // same as there being no edge: the store still records the carry firing
  assert.ok(r.store.witnessesOf(carried).some(
    (w) => w.prems.some((p) => p.t === 'fact' && p.key === carried)),
    'the carried fact is still its own support one tick back');
  assert.equal(r.why(carried).text.includes('[cycle]'), true,
    'and `why` says so, which is the renderer the fold now agrees with');
});

// ---------------------------------------------------------------------------
// throughput

test('throughput is measured, degrades with the journal, and the cause is provenance', () => {
  const plain = runSim({ ticks: 5, snapshots: false });
  const pruned = runSim({ ticks: 5, snapshots: false, prune: true });
  assert.equal(plain.ticks.length, 5);
  assert.ok(plain.ticks[0].facts > 0);
  assert.ok(plain.ticks[4].facts > 2 * plain.ticks[0].facts, 'the store grows');
  assert.ok(pruned.ticks[4].facts < plain.ticks[4].facts,
    'and pruning the kernel\'s completed-tick provenance is what stops it growing');
  // the two runs must agree about the WORLD, or the measurement is of two
  // different simulations
  assert.deepEqual(pruned.ents.map((e) => `${e.id}@${e.x},${e.y}:${e.hp}`),
    plain.ents.map((e) => `${e.id}@${e.x},${e.y}:${e.hp}`));
});

test('pruneProvenance removes provenance and nothing else', () => {
  const r = restore(sim, 3);
  r.evaluate();
  const beforeFacts = r.store.facts.size;
  const acts = chosen(r).length;
  const n = pruneProvenance(r);
  assert.ok(n > 0);
  assert.equal(r.store.facts.size, beforeFacts - n);
  r.store.dirty = true;
  r.evaluate();
  assert.equal(chosen(r).length, acts, 'the same acts are derived from a store with no derived_by');
});

// ---------------------------------------------------------------------------
// the simulator, and the boundary it sits on

test('the physics is deterministic and refuses what the rules could not know', () => {
  const ents: Ent[] = [
    { id: 'npc_1', kind: 'warden', x: 2, y: 4, hp: 100 },
    { id: 'npc_3', kind: 'warden', x: 2, y: 5, hp: 100 },
  ];
  // moving into an occupied cell is refused and SAID, because `step_to` knows
  // about props it has seen and nothing about other agents
  const a = physics(ents, [{ agent: 'npc_1', act: 'move(north)' }]);
  assert.equal(a.ents.find((e) => e.id === 'npc_1')!.y, 4);
  assert.match(a.events[0], /somebody is there/);
  // and into a prop
  const b = physics(ents, [{ agent: 'npc_1', act: 'move(east)' }]);
  assert.equal(b.ents.find((e) => e.id === 'npc_1')!.x, 2);
  assert.match(b.events[0], /a prop or the wall/);
  // twice over the same input gives the same output
  assert.deepEqual(physics(ents, [{ agent: 'npc_1', act: 'move(south)' }]).ents,
    physics(ents, [{ agent: 'npc_1', act: 'move(south)' }]).ents);
});

test('the text visualisation renders the grid it is given', () => {
  const lines = render(START);
  assert.equal(lines.length, HEIGHT + 1);
  assert.ok(lines[0].includes('W2'), 'npc_2 is on the top row');
  assert.ok(lines.some((l) => l.includes('##')), 'the props are drawn');
});

// ---------------------------------------------------------------------------
// the artefacts

test('the README and the page quote the demonstration verbatim', () => {
  const block = HEADLINE.join('\n');
  assert.ok(read('examples', 'npc', 'README.md').includes(block),
    'examples/npc/README.md must contain the real whynot output, unedited');
  assert.ok(read('examples', 'npc', 'page.html').includes(escapeHtml(block)),
    'examples/npc/page.html must contain the real whynot output, unedited');
});

test('the page obeys the artefact constraints', () => {
  const p = read('examples', 'npc', 'page.html');
  assert.equal((p.match(/<title>/g) ?? []).length, 1);
  // real tags, not the prefixes of <header>/<html-ish class names>
  for (const re of [/<!doctype/i, /<html[\s>]/i, /<head[\s>]/i, /<body[\s>]/i]) {
    assert.ok(!re.test(p), `page.html must not contain ${re}`);
  }
  assert.match(p, /@media \(prefers-color-scheme: dark\)/);
  assert.match(p, /:root:not\(\[data-theme="light"\]\)/);
  assert.match(p, /:root\[data-theme="dark"\]/);
  assert.ok(!/(src|href)\s*=\s*["']https?:/i.test(p), 'no external resources');
});

test('the model file says what it does, and the shape of it is stable', () => {
  const m = read('examples', 'npc', 'npc.rofl');
  // the four claims the file is organised around are named in it
  for (const s of ['perspective', 'semiring', 'hole', 'stratif']) {
    assert.ok(m.toLowerCase().includes(s), `npc.rofl must discuss ${s}`);
  }
  const clauses = parseProgram(m);
  assert.ok(clauses.length > 60);
  // exactly one @next rule is not bookkeeping: the memory carry, and it is
  // polymorphic in the ledger
  const carries = clauses.filter((c) => c.head.temporal === 'next');
  assert.ok(carries.some((c) => c.head.rel === 'saw' && c.head.persp.k === 'v'),
    'the ten journals are carried by one rule with a perspective variable');
  assert.equal(carries.filter((c) => c.head.rel === 'saw').length, 1);
  assert.ok(!clauses.some((c) => c.head.rel === 'at' || c.head.rel === 'hp'),
    'nothing may conclude at/hp — that is what keeps the sense-act loop open');
});

test('the demo exports what the transcript is built from', () => {
  assert.equal(START.length, 10, 'ten agents, as the spec asks');
  assert.equal(new Set(START.map((e) => e.kind)).size, 3);
  assert.equal(WIDTH * HEIGHT, 45);
  assert.equal(PROPS.length, 3);
  const acts = new Set(sim.ticks.flatMap((t) => t.acts).map((a) => a.act.replace(/\(.*/, '')));
  assert.deepEqual([...acts].sort(), ['hold', 'move', 'strike'],
    'three act shapes occur in the base run; the fourth arrives with the learned rule');
  const learnedActs = new Set(learned.ticks.flatMap((t) => t.acts).map((a) => a.act.replace(/\(.*/, '')));
  assert.deepEqual([...learnedActs].sort(), ['hold', 'move', 'strike', 'tend']);
});

test('scoreFacts collapses alternatives with the semiring\'s own operator', () => {
  const f = arbitrate(base);
  const { text, best } = scoreFacts(f);
  assert.ok(text.includes('score[choice](npc_4, strike(npc_8),'));
  // one seat per (agent, act), whatever the number of options that reached it
  const seats = text.split('\n').map((l) => l.replace(/, -?\d+\)\.$/, ''));
  assert.equal(new Set(seats).size, seats.length);
  assert.equal(best.size, seats.length);
});
