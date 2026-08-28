// admission.test.ts — the gate between agent output and the fact base:
// schema validation, mandatory attribution (finding f_admission_requires_who),
// agent ledgers that never leak into [epistemic], no agent-minted 'measured'
// evidence, and program-text injection safety.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { loadInquiryKernel } from '../runtime/report.ts';
import { admit, validateResult, type IntentResult } from '../runtime/admission.ts';

const FRAME = fs.readFileSync(new URL('../examples/atlas-launch/frame.rofl', import.meta.url), 'utf8');

function base(): Rofl {
  const r = new Rofl();
  loadInquiryKernel(r);
  assert.ok(r.load(FRAME).ok);
  return r;
}

const GOOD: IntentResult = {
  intent: { kind: 'verify', inquiry: 'atlas_launch', target: 'billing_e2e_verified' },
  outcome: 'progress',
  assertions: [
    { claim: 'billing_e2e_verified', state: 'refuted', based_on: ['chat_note_17'] },
  ],
  evidence: [
    { id: 'chat_note_17', kind: 'human_assertion', source: 'sam_qa',
      content: 'We never tested that.', scope: 'atlas_billing', observed_at: '2026-08-26' },
  ],
  new_intents: [{ kind: 'run_test', target: 'billing_e2e_verified', rationale: 'Measured E2E evidence is absent.' }],
  model_extensions: [],
  summary: 'Current evidence refutes the claim that billing was tested E2E.',
};

test('a valid result admits: agent ledger + journal polarity + epistemic effect', () => {
  const r = base();
  const rep = admit(r, GOOD, { agent: 'claude' });
  assert.ok(rep.ok, rep.diagnostics.join('; '));
  assert.ok(r.holds('agent_state[agent_claude](billing_e2e_verified, refuted)'));
  assert.ok(r.holds('refutes[obs](chat_note_17, billing_e2e_verified)'));
  assert.ok(r.holds('refuted[epistemic](billing_e2e_verified)'));
  // decision (b): the blocking verdict waits for polarity confirmation
  assert.ok(!r.holds('recommendation(atlas_launch, no_go)'));
  assert.ok(r.holds('candidate_intent(confirm, atlas_launch, billing_e2e_verified)'));
  r.assert('confirmed_polarity(chat_note_17, billing_e2e_verified).');
  assert.ok(r.holds('recommendation(atlas_launch, no_go)'));
  assert.deepEqual(r.query('forged[audit](F)').rows, [], 'authority was granted, nothing forged');
  assert.equal(rep.new_intents.length, 1, 'suggestions returned, not asserted');
  assert.ok(!r.holds('candidate_intent(run_test, I, C)'), 'new_intents never become facts directly');
});

test('admission without an agent is refused: anonymity does not bypass audit', () => {
  const r = base();
  const rep = admit(r, GOOD, { agent: undefined });
  assert.equal(rep.ok, false);
  assert.match(rep.diagnostics.join(' '), /refused.*attributed/i);
  assert.equal(rep.asserted, 0);
});

test('agent-minted measured evidence is rejected by the closed vocabulary', () => {
  const bad = structuredClone(GOOD);
  bad.evidence![0].kind = 'measured';
  const d = validateResult(bad);
  assert.ok(d.some((x) => /measured is runtime-only/.test(x)));
  const r = base();
  assert.equal(admit(r, bad, { agent: 'claude' }).ok, false);
});

test('an agent opinion without journal evidence never reaches [epistemic]', () => {
  const r = base();
  const opinion: IntentResult = {
    intent: { kind: 'verify', inquiry: 'atlas_launch', target: 'aggregate_capacity_verified' },
    outcome: 'progress',
    assertions: [{ claim: 'aggregate_capacity_verified', state: 'supported', based_on: ['my_reasoning'] }],
    evidence: [],
    summary: 'It feels fine.',
  };
  const rep = admit(r, opinion, { agent: 'claude' });
  assert.ok(rep.ok);
  assert.ok(r.holds('agent_state[agent_claude](aggregate_capacity_verified, supported)'));
  assert.ok(!r.holds('supports[obs](my_reasoning, aggregate_capacity_verified)'),
    'no journal entry for evidence the result did not carry');
  assert.ok(r.holds('unknown[epistemic](aggregate_capacity_verified)'),
    'the claim stays unknown: agent opinion is not evidence');
  assert.ok(r.holds('candidate_intent(verify, atlas_launch, aggregate_capacity_verified)'),
    'the verify intent survives the opinion');
});

test('program-text injection is rejected at validation', () => {
  const evil = structuredClone(GOOD);
  (evil.assertions![0] as { claim: string }).claim = 'x). breach_attempt(y';
  const d = validateResult(evil);
  assert.ok(d.some((x) => /not a valid atom/.test(x)));
  const r = base();
  const rep = admit(r, evil, { agent: 'claude' });
  assert.equal(rep.ok, false);
  assert.equal(rep.asserted, 0, 'nothing partial leaks into the store');
});

test('malformed shapes are refused with diagnostics', () => {
  assert.ok(validateResult(null).length > 0);
  assert.ok(validateResult({}).length > 0);
  const noSummary = structuredClone(GOOD);
  (noSummary as { summary?: string }).summary = '';
  assert.ok(validateResult(noSummary).some((x) => /summary/.test(x)));
});
