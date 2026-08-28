// inquiry.test.ts — the Phase 1 inquiry kernel checklist (roadmap §17):
// epistemic states, obligations, intent generation, explainability, the
// evidence-authority invariant, and mutation of the frontier.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { buildReport, loadInquiryKernel } from '../runtime/report.ts';

const FRAME = fs.readFileSync(new URL('../examples/reflection-readiness/frame.rofl', import.meta.url), 'utf8');
const EVIDENCE = fs.readFileSync(new URL('../examples/reflection-readiness/evidence.rofl', import.meta.url), 'utf8');

function fixture(): Rofl {
  const r = new Rofl();
  loadInquiryKernel(r);
  assert.ok(r.load(FRAME).ok, 'frame loads');
  assert.ok(r.load(EVIDENCE, { who: 'runtime' }).ok, 'evidence loads');
  return r;
}

// --------------------------------------------------------------------------
test('unknown blocking observable claim produces a verify intent', () => {
  const r = fixture();
  assert.ok(r.holds('unknown[epistemic](aggregate_capacity_verified)'));
  assert.ok(r.holds('candidate_intent(verify, reflection_launch, aggregate_capacity_verified)'));
});

test('ambiguous claim produces clarify, and never verify', () => {
  const r = fixture();
  assert.ok(r.holds('candidate_intent(clarify, reflection_launch, pdf_dedup_required)'));
  assert.ok(!r.holds('candidate_intent(verify, reflection_launch, pdf_dedup_required)'));
});

test('supported + refuted produce contested, which produces discriminate', () => {
  const r = fixture();
  assert.ok(r.holds('supported[epistemic](delivery_rate_ok)'));
  assert.ok(r.holds('refuted[epistemic](delivery_rate_ok)'));
  assert.ok(r.holds('contested[epistemic](delivery_rate_ok)'));
  assert.ok(r.holds('candidate_intent(discriminate, reflection_launch, delivery_rate_ok)'));
});

test('authority-only claim produces escalate', () => {
  const r = fixture();
  assert.ok(r.holds('candidate_intent(escalate, reflection_launch, capacity_risk_accepted)'));
});

test('resolved obligations produce no intent at all', () => {
  const r = fixture();
  for (const c of ['requirements_complete', 'monitoring_ready', 'rollback_ready']) {
    assert.ok(r.holds(`resolved_obligation(reflection_launch, ${c})`), `${c} resolved`);
    assert.ok(!r.holds(`candidate_intent(K, reflection_launch, ${c})`), `${c} quiet`);
  }
});

test('missing evidence yields unknown, never refuted', () => {
  const r = fixture();
  assert.ok(!r.holds('refuted[epistemic](aggregate_capacity_verified)'));
  const wn = r.whynot('refuted[epistemic](aggregate_capacity_verified)');
  assert.equal(wn.holds, false);
  assert.match(wn.text, /refutes\[obs\]/, 'names the missing journal entry');
});

// --------------------------------------------------------------------------
test('refuted blocking claim derives no_go, explainable to the evidence', () => {
  const r = fixture();
  assert.ok(r.holds('recommendation(reflection_launch, no_go)'));
  const why = r.why('recommendation(reflection_launch, no_go)');
  assert.ok(why.ok);
  assert.match(why.text, /violated_blocking/);
  assert.match(why.text, /slack_msg_1842/, 'traces to the journal entry');
});

test('why explains where a verify intent came from', () => {
  const r = fixture();
  const why = r.why('candidate_intent(verify, reflection_launch, aggregate_capacity_verified)');
  assert.ok(why.ok);
  assert.match(why.text, /open_obligation/);
  assert.match(why.text, /unknown\[epistemic\]/);
});

test('a contested blocking claim blocks GO even while supported', () => {
  const r = fixture();
  r.assert('blocking(reflection_launch, delivery_rate_ok).');
  assert.ok(r.holds('supported[epistemic](delivery_rate_ok)'));
  assert.ok(r.holds('go_blocked(reflection_launch, delivery_rate_ok)'));
});

// --------------------------------------------------------------------------
test('mutation: new evidence closes the obligation and retires the intent', () => {
  const r = fixture();
  r.assert('supports[obs](load_test_500, aggregate_capacity_verified).', { who: 'runtime' });
  assert.ok(!r.holds('open_obligation(reflection_launch, aggregate_capacity_verified)'));
  assert.ok(!r.holds('candidate_intent(verify, reflection_launch, aggregate_capacity_verified)'));
  assert.ok(!r.holds('go_blocked(reflection_launch, aggregate_capacity_verified)'));
  // billing still blocks: the verdict does not silently improve
  assert.ok(r.holds('recommendation(reflection_launch, no_go)'));
});

test('excise of the refuting evidence: the diff is the verdict blast radius', () => {
  const r = fixture();
  const e = r.excise('refutes[obs](slack_msg_1842, billing_e2e_verified)');
  assert.ok(e.ok);
  assert.ok(e.removed.includes('recommendation[main](reflection_launch,no_go)'));
  assert.ok(e.removed.includes('refuted[epistemic](billing_e2e_verified)'));
  assert.ok(e.added.some((k) => k.includes('candidate_intent[main](verify,reflection_launch,billing_e2e_verified')),
    'without the refutation the blocking claim reopens for verification');
});

// --------------------------------------------------------------------------
test('agent asserting into the observation journal surfaces as forged', () => {
  const r = fixture();
  assert.deepEqual(r.query('forged[audit](F)').rows, []);
  r.assert('supports[obs](agent_hunch_1, aggregate_capacity_verified).', { who: 'agent_claude' });
  const f = r.query('forged[audit](F)');
  assert.equal(f.rows.length, 1);
  assert.match(f.rows[0].text, /agent_hunch_1|supports/);
});

// --------------------------------------------------------------------------
test('the epistemic report renders the full picture after any state', () => {
  const r = fixture();
  const report = buildReport(r);
  assert.match(report, /reflection_launch \(decide\)/);
  assert.match(report, /recommendation:\*\* no_go/);
  assert.match(report, /unknown: aggregate_capacity_verified/);
  assert.match(report, /contested: delivery_rate_ok/);
  assert.match(report, /verify: aggregate_capacity_verified/);
  assert.match(report, /clarify: pdf_dedup_required/);
  assert.match(report, /escalate: capacity_risk_accepted/);
  assert.match(report, /slack_msg_1842/, 'the why section traces to evidence');
});
