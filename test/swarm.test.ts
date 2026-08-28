// swarm.test.ts — assignment discipline: the frontier is the work queue,
// leases and reports are facts, a dead lease re-derives as retryable.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { loadInquiryKernel } from '../runtime/report.ts';

const SWARM = fs.readFileSync(new URL('../rules/swarm.rofl', import.meta.url), 'utf8');

function store(): { r: Rofl; k: string } {
  const r = new Rofl();
  loadInquiryKernel(r);
  assert.ok(r.load(SWARM).ok, 'swarm rules load');
  r.assert('inquiry(sw, explore). claim(c_a). claim(c_b).' +
    ' requires(sw, c_a). requires(sw, c_b). observable(c_a). observable(c_b).');
  const rows = r.query('candidate_intent(K, sw, c_a)').rows;
  assert.ok(rows.length > 0, 'the frontier generates an intent for c_a');
  return { r, k: rows[0].bindings.K };
}

test('an unclaimed intent is available; a claim removes it', () => {
  const { r, k } = store();
  assert.ok(r.holds(`swarm_available(${k}, sw, c_a)`));
  assert.ok(r.holds(`swarm_available(${k}, sw, c_b)`));
  r.assert(`claimed(${k}, sw, c_a, agent_one).`);
  assert.ok(!r.holds(`swarm_available(${k}, sw, c_a)`));
  assert.ok(r.holds(`swarm_available(${k}, sw, c_b)`), 'other intents stay available');
});

test('a claim without a report is pending; a report settles it', () => {
  const { r, k } = store();
  r.assert(`claimed(${k}, sw, c_a, agent_one).`);
  assert.ok(r.holds(`swarm_pending(${k}, sw, c_a, agent_one)`));
  r.assert(`reported(${k}, sw, c_a, agent_one, done).`);
  assert.ok(!r.holds(`swarm_pending(${k}, sw, c_a, agent_one)`));
  assert.ok(r.holds(`swarm_done(${k}, sw, c_a)`));
});

test('a failed report settles the pending lease but not the intent', () => {
  const { r, k } = store();
  r.assert(`claimed(${k}, sw, c_b, agent_two). reported(${k}, sw, c_b, agent_two, failed).`);
  assert.ok(!r.holds(`swarm_pending(${k}, sw, c_b, agent_two)`));
  assert.ok(!r.holds(`swarm_done(${k}, sw, c_b)`));
});

test('an expired lease with no report re-derives as retryable', () => {
  const { r, k } = store();
  r.assert(`claimed(${k}, sw, c_a, agent_one).`);
  assert.ok(!r.holds(`swarm_retryable(${k}, sw, c_a)`));
  r.assert('lease_expired(agent_one).');
  assert.ok(r.holds(`swarm_retryable(${k}, sw, c_a)`));
  r.assert(`reported(${k}, sw, c_a, agent_one, done).`);
  assert.ok(!r.holds(`swarm_retryable(${k}, sw, c_a)`), 'a delivered report ends retry');
});
