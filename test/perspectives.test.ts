// perspectives.test.ts — Phase 7 multi-agent invariants: disagreement
// localizes to claims and yields a discriminating intent; agreeing agents
// are an echo, not evidence.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { loadInquiryKernel } from '../runtime/report.ts';
import { admit, type IntentResult } from '../runtime/admission.ts';

const FRAME = fs.readFileSync(new URL('../examples/atlas-launch/frame.rofl', import.meta.url), 'utf8');

function opinion(agent: string, claim: string, state: 'supported' | 'refuted'): [IntentResult, string] {
  return [{
    intent: { kind: 'verify', inquiry: 'atlas_launch', target: claim },
    outcome: 'progress',
    assertions: [{ claim, state }],
    evidence: [],
    summary: `${agent} judges ${claim} ${state}`,
  }, agent];
}

test('two agents disagreeing on a claim produce a discriminate intent', () => {
  const r = new Rofl();
  loadInquiryKernel(r);
  assert.ok(r.load(FRAME).ok);
  const c = 'aggregate_capacity_verified';
  for (const [res, agent] of [opinion('advocate', c, 'supported'), opinion('challenger', c, 'refuted')]) {
    assert.ok(admit(r, res, { agent }).ok);
  }
  assert.ok(r.holds(`agent_disputed(${c})`));
  assert.ok(r.holds(`candidate_intent(discriminate, atlas_launch, ${c})`));
  assert.deepEqual(r.query('forged[audit](F)').rows, [], 'both wrote their own ledgers');
  assert.ok(r.holds(`unknown[epistemic](${c})`), 'opinions moved nothing epistemic');
});

test('the echo invariant: three agreeing agents are still zero measurements', () => {
  const r = new Rofl();
  loadInquiryKernel(r);
  assert.ok(r.load(FRAME).ok);
  const c = 'aggregate_capacity_verified';
  for (const a of ['advocate', 'judge', 'operator']) {
    assert.ok(admit(r, opinion(a, c, 'supported')[0], { agent: a }).ok);
  }
  assert.equal(r.query(`agent_state[P](${c}, supported)`).rows.length, 3);
  assert.ok(!r.holds(`supported[epistemic](${c})`), 'three echoes are not evidence');
  assert.ok(r.holds(`candidate_intent(verify, atlas_launch, ${c})`),
    'the verify intent survives unanimous agent agreement');
});
