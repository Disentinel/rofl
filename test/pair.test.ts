// pair.test.ts — the pair-work protocol: session state survives across
// separate restores (simulating separate CLI invocations), next hands out
// intents with instructions, admit advances the world, assert lets the
// human answer an escalation.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { initSession, renderNext, restoreSession, saveSession } from '../runtime/pair.ts';
import { admit } from '../runtime/admission.ts';

const FRAME = new URL('../examples/reflection-readiness/frame.rofl', import.meta.url).pathname;
const EVIDENCE = new URL('../examples/reflection-readiness/evidence.rofl', import.meta.url).pathname;

function tmpSession(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-pair-')), 's.snapshot.json');
}

test('init -> next -> admit -> next across separate restores', () => {
  const s = tmpSession();
  initSession(s, [FRAME, EVIDENCE], { whoObs: 'runtime' });

  // a fresh restore, as a new CLI invocation would do
  const r1 = restoreSession(s);
  const next1 = renderNext(r1, 3);
  assert.match(next1, /verify: aggregate_capacity_verified/);
  assert.match(next1, /skills\/guided-formal-reasoning\/verify\.md/);
  assert.match(next1, /discriminate: delivery_rate_ok/);
  assert.match(next1, /skills\/guided-formal-reasoning\/discriminate\.md/);

  const rep = admit(r1, {
    intent: { kind: 'verify', inquiry: 'reflection_launch', target: 'aggregate_capacity_verified' },
    outcome: 'progress',
    assertions: [{ claim: 'aggregate_capacity_verified', state: 'supported', based_on: ['agg_load_ci_9'] }],
    evidence: [{ id: 'agg_load_ci_9', kind: 'document', source: 'ci', scope: 'aggregate_load' }],
    summary: 'aggregate load report found in CI',
  }, { agent: 'claude' });
  assert.ok(rep.ok);
  saveSession(r1, s);

  const r2 = restoreSession(s);
  assert.ok(r2.holds('resolved_obligation(reflection_launch, aggregate_capacity_verified)'),
    'admitted state survived the round-trip');
  assert.doesNotMatch(renderNext(r2, 5), /verify: aggregate_capacity_verified/,
    'the executed intent is gone from next');
});

test('assert lets the authority answer an escalation and retire it', () => {
  const s = tmpSession();
  const r = initSession(s, [FRAME, EVIDENCE], { whoObs: 'runtime' });
  assert.match(renderNext(r, 5), /escalate: capacity_risk_accepted/);
  // the authority's answer arrives as a plain fact
  r.assert('supports[obs](vadimr_signoff_1, capacity_risk_accepted).', { who: 'runtime' });
  saveSession(r, s);
  const r2 = restoreSession(s);
  assert.doesNotMatch(renderNext(r2, 5), /escalate: capacity_risk_accepted/,
    'a resolved obligation escalates no more');
});

test('an empty frontier renders the report instead of intents', () => {
  const s = tmpSession();
  const r = initSession(s, [], {});
  r.assert('inquiry(mini, decide). claim(c1). blocking(mini, c1). observable(c1).');
  r.assert('supports[obs](e1, c1).', { who: 'runtime' });
  assert.match(renderNext(r, 3), /Frontier empty/);
});
