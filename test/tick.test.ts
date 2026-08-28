// tick.test.ts — the bounded inquiry loop: top-K scheduling with blocking
// claims first, admission-driven progress, preserved frontier, stagnation
// checkpoint, quiescence, and the anytime report.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { loadInquiryKernel } from '../runtime/report.ts';
import { scheduleIntents } from '../runtime/scheduler.ts';
import { runInquiry } from '../runtime/tick.ts';
import type { IntentRef, IntentResult } from '../runtime/admission.ts';

const FRAME = fs.readFileSync(new URL('../examples/atlas-launch/frame.rofl', import.meta.url), 'utf8');
const EVIDENCE = fs.readFileSync(new URL('../examples/atlas-launch/evidence.rofl', import.meta.url), 'utf8');

function fixture(): Rofl {
  const r = new Rofl();
  loadInquiryKernel(r);
  assert.ok(r.load(FRAME).ok);
  assert.ok(r.load(EVIDENCE, { who: 'runtime' }).ok);
  return r;
}

const capacityResult: IntentResult = {
  intent: { kind: 'verify', inquiry: 'atlas_launch', target: 'aggregate_capacity_verified' },
  outcome: 'progress',
  assertions: [{ claim: 'aggregate_capacity_verified', state: 'supported', based_on: ['load_report_500'] }],
  evidence: [{ id: 'load_report_500', kind: 'document', source: 'ci', scope: 'aggregate_load' }],
  summary: 'CI load report covers aggregate load.',
};

test('scheduler: blocking verify first, top-K bound, frontier preserved', () => {
  const r = fixture();
  const s = scheduleIntents(r, 1);
  assert.equal(s.scheduled.length, 1);
  assert.deepEqual(s.scheduled[0],
    { kind: 'verify', inquiry: 'atlas_launch', target: 'aggregate_capacity_verified' });
  assert.equal(s.deferred.length, 3, 'unscheduled intents remain candidates');
});

test('a tick that closes the blocking obligation retires its intent', async () => {
  const r = fixture();
  const run = await runInquiry(r, (it: IntentRef) =>
    it.kind === 'verify' && it.target === 'aggregate_capacity_verified' ? capacityResult : null,
  { agent: 'claude', maxTicks: 5, topK: 3 });

  assert.equal(run.status, 'stalled', 'after the one executable intent, nothing else moves');
  assert.ok(!r.holds('candidate_intent(verify, atlas_launch, aggregate_capacity_verified)'));
  assert.ok(r.holds('resolved_obligation(atlas_launch, aggregate_capacity_verified)'));
  assert.ok(run.log[0].admitted > 0);
  assert.match(run.report, /# Epistemic report/, 'anytime report present at checkpoint');
  const remaining = scheduleIntents(r, 10).scheduled.map((x) => x.kind).sort();
  assert.deepEqual(remaining, ['clarify', 'confirm', 'discriminate', 'escalate'],
    'frontier preserved; the agent-attached polarity on a blocking claim awaits confirmation');
});

test('quiescence: an inquiry whose frontier empties ends cleanly', async () => {
  const r = new Rofl();
  loadInquiryKernel(r);
  // non-blocking obligation: the plain grade resolves it, no confirmation
  // round needed (decision b asymmetry), so the frontier can empty.
  r.load('inquiry(mini, decide). claim(c1). requires(mini, c1). observable(c1).');
  const run = await runInquiry(r, () => ({
    intent: { kind: 'verify', inquiry: 'mini', target: 'c1' },
    outcome: 'progress',
    assertions: [{ claim: 'c1', state: 'supported', based_on: ['e1'] }],
    evidence: [{ id: 'e1', kind: 'document', source: 'ci' }],
    summary: 'done',
  }), { agent: 'claude', maxTicks: 5, topK: 3 });
  assert.equal(run.status, 'quiescent');
  assert.equal(run.ticks, 1);
  assert.ok(r.holds('resolved_obligation(mini, c1)'));
});

test('tick budget exhaustion yields a checkpoint, not an infinite loop', async () => {
  const r = fixture();
  let n = 0;
  // an executor that always produces admissible motion but never resolves
  const run = await runInquiry(r, (it: IntentRef) => ({
    intent: { kind: it.kind as 'verify', inquiry: it.inquiry, target: it.target },
    outcome: 'progress',
    assertions: [],
    evidence: [{ id: `note_${n++}`, kind: 'document', source: 'notes' }],
    summary: 'gathered context',
  }), { agent: 'claude', maxTicks: 2, topK: 2 });
  assert.equal(run.status, 'budget_exhausted');
  assert.equal(run.ticks, 2);
  assert.match(run.report, /Candidate intents/);
});

test('an executor that produces nothing admits nothing and stalls', async () => {
  const r = fixture();
  const run = await runInquiry(r, () => null, { agent: 'claude', maxTicks: 10, topK: 3 });
  assert.equal(run.status, 'stalled');
  assert.equal(run.ticks, 2, 'two motionless ticks trigger the checkpoint');
});
