// confirmation.test.ts — decision (b): agent-attached polarity on a
// blocking claim moves the verdict only after confirmation; runtime-native
// links are confirmed by construction; non-blocking obligations live on the
// plain grade (the asymmetry).

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { loadInquiryKernel } from '../runtime/report.ts';
import { admit, type IntentResult } from '../runtime/admission.ts';

const FRAME = fs.readFileSync(new URL('../examples/atlas-launch/frame.rofl', import.meta.url), 'utf8');
const EVIDENCE = fs.readFileSync(new URL('../examples/atlas-launch/evidence.rofl', import.meta.url), 'utf8');

function frameOnly(): Rofl {
  const r = new Rofl();
  loadInquiryKernel(r);
  assert.ok(r.load(FRAME).ok);
  return r;
}

function agentLink(claim: string, state: 'supported' | 'refuted', evidence: string): IntentResult {
  return {
    intent: { kind: 'verify', inquiry: 'atlas_launch', target: claim },
    outcome: 'progress',
    assertions: [{ claim, state, based_on: [evidence] }],
    evidence: [{ id: evidence, kind: 'human_assertion', source: 'sam_qa' }],
    summary: `agent read ${evidence} as ${state} for ${claim}`,
  };
}

test('an agent-attached refutation on a blocking claim waits for confirmation', () => {
  const r = frameOnly();
  assert.ok(admit(r, agentLink('billing_e2e_verified', 'refuted', 'chat_note_99'), { agent: 'claude' }).ok);
  assert.ok(r.holds('refuted[epistemic](billing_e2e_verified)'), 'plain grade moves');
  assert.ok(!r.holds('refuted_confirmed[epistemic](billing_e2e_verified)'));
  assert.ok(!r.holds('recommendation(atlas_launch, no_go)'), 'no blocking verdict on interpretation alone');
  assert.ok(r.holds('candidate_intent(confirm, atlas_launch, billing_e2e_verified)'), 'the link stays visible');

  r.assert('confirmed_polarity(chat_note_99, billing_e2e_verified).');
  assert.ok(r.holds('refuted_confirmed[epistemic](billing_e2e_verified)'));
  assert.ok(r.holds('recommendation(atlas_launch, no_go)'), 'confirmed: the verdict lands');
  assert.ok(!r.holds('candidate_intent(confirm, atlas_launch, billing_e2e_verified)'), 'and the intent retires');
});

test('agent-attached support does not clear a blocking claim until confirmed', () => {
  const r = frameOnly();
  assert.ok(admit(r, agentLink('aggregate_capacity_verified', 'supported', 'load_doc_3'), { agent: 'claude' }).ok);
  assert.ok(r.holds('supported[epistemic](aggregate_capacity_verified)'));
  assert.ok(r.holds('go_blocked(atlas_launch, aggregate_capacity_verified)'), 'still blocks GO');
  assert.ok(r.holds('candidate_intent(confirm, atlas_launch, aggregate_capacity_verified)'));

  r.assert('confirmed_polarity(load_doc_3, aggregate_capacity_verified).');
  assert.ok(!r.holds('go_blocked(atlas_launch, aggregate_capacity_verified)'));
});

test('runtime-native links are confirmed by construction', () => {
  const r = frameOnly();
  assert.ok(r.load(EVIDENCE, { who: 'runtime' }).ok);
  assert.ok(r.holds('refuted_confirmed[epistemic](billing_e2e_verified)'));
  assert.ok(r.holds('recommendation(atlas_launch, no_go)'));
  assert.ok(!r.holds('candidate_intent(confirm, atlas_launch, C)'), 'nothing pending');
});

test('the asymmetry: non-blocking obligations resolve on the plain grade', () => {
  const r = frameOnly();
  assert.ok(admit(r, agentLink('delivery_rate_ok', 'supported', 'metrics_note_1'), { agent: 'claude' }).ok);
  assert.ok(r.holds('resolved_obligation(atlas_launch, delivery_rate_ok)'),
    'no confirmation needed off the blocking path');
  assert.ok(!r.holds('candidate_intent(confirm, atlas_launch, delivery_rate_ok)'));
});
