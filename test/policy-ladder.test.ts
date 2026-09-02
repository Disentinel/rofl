// policy-ladder.test.ts — the before-A policy of tiers 1-3, written as rules,
// checked two ways: the ANSWER against the host, and the ORDER against the
// block ladder that `scanners/engine_split.ts` measures.
//
// The unit here is the RELATION, not the line-range block. A block is the right
// unit for "how many lines would a rewrite carry" and the wrong one for "what
// stands on what": the readings below disagree, and the disagreement is the
// finding — one block holds three relations at three different depths, and one
// dependency that runs through a function PARAMETER is invisible to a probe
// that follows fields, locals, calls and the store.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  world, answerCheck, kernelStrata, relationDepth, blockTier, POLICY_RELS, BROKEN, PACK,
} from '../scanners/policy_ladder.ts';
import { STRATUM_RULES } from './strata-fixture.ts';

const W = world(['examples/sensors.rofl']);
const N = (q: string) => W.r.query(q).rows.length;

test('the pack loads under boot.rofl and raises no audit of its own', () => {
  // boot + pack alone: the sensors leak below belongs to sensors.rofl and is
  // measured separately, so this arm carries no program at all
  const bare = world([]);
  assert.deepEqual(bare.r.query('unstratified(X)').rows, []);
  for (const q of ['malformed[audit](R)', 'breach[audit](R)', 'leak[audit](A, B)',
    'forged[audit](F)', 'unmoded[audit](R)', 'undefined_premise[audit](R, Rel)']) {
    assert.equal(bare.r.query(q).rows.length, 0, `${q} fires on the policy pack`);
  }
});

test('THE ANSWER: every policy relation agrees with the host, on non-empty input', () => {
  const checks = answerCheck(W);
  for (const c of checks) assert.equal(c.disagree, 0, `${c.rel}: host ${c.host}, rules ${c.rules}`);
  // ...and the comparison is not vacuous: every relation has something in it
  const by = Object.fromEntries(checks.map((c) => [c.rel, c.host]));
  assert.ok(by['executable'] > 30, `executable ${by['executable']}`);
  assert.ok(by['mono_rule'] > 20, `mono_rule ${by['mono_rule']}`);
  assert.equal(by['demand_rel'], 3, 'sensors: close, corroborated, temp');
  assert.equal(by['neg_rule'] > 0, true);

  // `late_rule` IS ZERO NOW, and that is the measurement rather than a hole.
  // The cone `stratumCone` holds back is rooted at `stratum` — the monotone
  // rules concluding the table, and anything reading what they conclude. The
  // four rules at that root were boot.rofl's own `stratum/2` clauses, and they
  // were deleted when the evaluator started peeling its schedule off the
  // decoded rules. With nothing concluding `stratum`, the cone is empty and the
  // two-wave split of phase A has nothing to hold back on this program.
  assert.equal(by['late_rule'], 0, 'no rule concludes stratum any more');

  // POSITIVE CONTROL, so that the zero is a fact about the program and not
  // about a comparison that stopped looking: put the four rules back as an
  // ordinary program and the cone fills again, host and rules still agreeing.
  const withTable = answerCheck(world(['examples/sensors.rofl'], PACK, STRATUM_RULES));
  for (const c of withTable) assert.equal(c.disagree, 0, `${c.rel} disagrees with the table back`);
  assert.equal(withTable.find((c) => c.rel === 'late_rule')!.host, 4,
    'the four stratum rules, wherever they are written');
});

test('POSITIVE CONTROL: one rule broken on purpose, and the count moves', () => {
  // `mono_rule` stops excluding what tier 0 called unsafe. Nothing else changes.
  const before = answerCheck(W).reduce((a, c) => a + c.disagree, 0);
  const after = answerCheck(world(['examples/sensors.rofl'], BROKEN));
  const total = after.reduce((a, c) => a + c.disagree, 0);
  assert.equal(before, 0);
  assert.ok(total > 0, 'breaking a rule changed nothing: the comparison is blind');
  const moved = after.filter((c) => c.disagree > 0).map((c) => c.rel);
  assert.deepEqual(moved, ['mono_rule'], 'the break is localised, as written');
  // and it moved in the direction the missing premise predicts: one rule more
  const m = after.find((c) => c.rel === 'mono_rule')!;
  assert.equal(m.rules, m.host + 1, 'sensors has exactly one unsafe rule');
});

test('THE ORDER: the kernel stratifies the pack, and rounds are NEGATION depth', () => {
  const s = kernelStrata(W.r);
  // three relations sit in the FIRST derived round — the ones nothing negates
  // below them. This used to read `stratum/2`, where the same three sat at 0;
  // a round is a wave, so everything a rule concludes wakes at 1 at the
  // earliest, and the whole ladder is shifted by one without changing shape.
  assert.deepEqual(POLICY_RELS.filter((x) => s.get(x) === 1).sort(),
    ['blocked_head', 'has_neg_rule', 'wf_declared']);
  // everything else is exactly one negation deeper. The schedule answers the
  // question the KERNEL needs — when may a negation be judged — and a positive
  // dependency does not raise it, so it is not the dependency ladder.
  assert.deepEqual(POLICY_RELS.filter((x) => (s.get(x) ?? -1) > 2), []);
  assert.deepEqual(POLICY_RELS.filter((x) => (s.get(x) ?? -1) < 1), [],
    'positive control: every policy relation has a round');
});

test('THE ORDER: the relation ladder is finer than the block ladder', () => {
  const { depth, cyclic } = relationDepth(W.r);
  const blocks = blockTier();
  // mutual recursion inside one rung is legal; none of these are in one
  assert.deepEqual(cyclic.filter((c) => c.some((x) => POLICY_RELS.includes(x))), []);

  // THE GLUE: one block, several relations, several depths. This is what the
  // block unit cannot see, stated as the count it gets wrong.
  const byBlock = new Map<string, number[]>();
  for (const rel of POLICY_RELS) {
    const k = blocks.get(rel)!.block;
    if (!byBlock.has(k)) byBlock.set(k, []);
    byBlock.get(k)!.push(depth.get(rel)!);
  }
  const glued = [...byBlock.entries()]
    .filter(([, ds]) => new Set(ds).size > 1)
    .map(([k, ds]) => `${k}:${Math.min(...ds)}-${Math.max(...ds)}`).sort();
  // BY NAME, NOT BY RANGE (2026-09-01): these were '107-118:1-2', '214-224:3-5',
  // '509-521:3-5' and '677-692:1-4', which asserted where src/engine.ts sits.
  assert.deepEqual(glued, ['prepare:1-2', 'runGate:3-5', 'runWellFounded:1-4', 'stratumCone:3-5']);
  // 12 relations over 4 block rungs, but 5 distinct relation depths
  assert.equal(new Set(POLICY_RELS.map((r) => depth.get(r))).size, 5);
  assert.equal(new Set(POLICY_RELS.map((r) => blocks.get(r)!.tier)).size, 4);
});

test('THE ORDER: the block ladder inverts the cone and the demand set', () => {
  const { depth } = relationDepth(W.r);
  const blocks = blockTier();
  // the blocks say the cone comes FIRST...
  assert.ok(blocks.get('mono_rule')!.tier < blocks.get('demand_rel')!.tier);
  // ...the relations say the cone's own head is level with the demand set and
  // everything downstream of it comes after
  assert.equal(depth.get('mono_rule'), depth.get('demand_rel'));
  assert.ok(depth.get('stratum_cone')! > depth.get('demand_rel')!);
  assert.ok(depth.get('late_rule')! > depth.get('stratum_cone')!);
});
