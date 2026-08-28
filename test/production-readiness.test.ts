// production-readiness.test.ts — the first decision pack: GO/CONDITIONAL_GO
// certificates, coverage gaps, authority-gated gap acceptance, evidence
// freshness and scope, and the roadmap §18 mutations driven through excise
// (finding f_excise_as_mutation_primitive: the blast-radius diff IS the
// certificate regression).

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { loadDecisionPack, loadInquiryKernel } from '../runtime/report.ts';

const DIR = new URL('../examples/reflection-readiness/', import.meta.url);
const read = (f: string) => fs.readFileSync(new URL(f, DIR), 'utf8');

const CONCERNS = ['requirements', 'product_coverage', 'testing', 'load', 'monitoring',
  'rollback', 'billing', 'dependencies', 'customer_acceptance'];

function packed(): Rofl {
  const r = new Rofl();
  loadInquiryKernel(r);
  loadDecisionPack(r, 'production-readiness');
  return r;
}

/** A fully green launch: every concern mapped, every claim supported. */
function green(): Rofl {
  const r = packed();
  const facts: string[] = ['inquiry(mini, decide).', 'pack(mini, production_readiness).',
    'decision_authority(mini, vadimr).'];
  for (const con of CONCERNS) {
    const c = `c_${con}`;
    facts.push(`claim(${c}).`, `observable(${c}).`, `concern_claim(mini, ${con}, ${c}).`);
    facts.push(con === 'load' || con === 'billing'
      ? `blocking(mini, ${c}).` : `requires(mini, ${c}).`);
  }
  assert.ok(r.load(facts.join('\n')).ok);
  const ev = CONCERNS.map((con) => `supports[obs](e_${con}, c_${con}).`).join('\n');
  assert.ok(r.load(ev, { who: 'runtime' }).ok);
  return r;
}

// --------------------------------------------------------------------------
test('the Reflection fixture under the pack: no_go plus named coverage gaps', () => {
  const r = packed();
  assert.ok(r.load(read('frame.rofl')).ok);
  assert.ok(r.load(read('evidence.rofl'), { who: 'runtime' }).ok);
  assert.ok(r.load(read('context.rofl')).ok);
  assert.ok(r.holds('recommendation(reflection_launch, no_go)'));
  assert.ok(!r.holds('recommendation(reflection_launch, go)'));
  const gaps = r.query('coverage_gap(reflection_launch, Con)').rows.map((x) => x.bindings.Con).sort();
  assert.deepEqual(gaps, ['customer_acceptance', 'dependencies', 'product_coverage', 'testing']);
});

test('a fully covered, fully supported launch earns GO', () => {
  const r = green();
  assert.ok(r.holds('recommendation(mini, go)'));
  assert.ok(!r.holds('coverage_gap(mini, Con)'));
  const why = r.why('recommendation(mini, go)');
  assert.ok(why.ok, 'GO must survive why');
});

test('an accepted non-blocking gap earns CONDITIONAL_GO; an observer cannot accept it', () => {
  const r = green();
  // NB: excise is a counterfactual QUERY (diff on a scratch store); retract
  // is the actual mutation. Both appear in this file deliberately.
  assert.ok(r.retract('supports[obs](e_testing, c_testing)').ok);
  assert.ok(!r.holds('recommendation(mini, go)'));
  assert.ok(!r.holds('recommendation(mini, conditional_go)'), 'unaccepted gap blocks conditional');

  r.assert('accepted_gap_by(mini, c_testing, observer_oleg).');
  assert.ok(!r.holds('recommendation(mini, conditional_go)'), 'observer acceptance is not acceptance');

  r.assert('accepted_gap_by(mini, c_testing, vadimr).');
  assert.ok(r.holds('gap_accepted(mini, c_testing)'));
  assert.ok(r.holds('recommendation(mini, conditional_go)'));
});

test('an open BLOCKING claim permits neither go nor conditional_go', () => {
  const r = green();
  assert.ok(r.retract('supports[obs](e_load, c_load)').ok);
  r.assert('accepted_gap_by(mini, c_load, vadimr).');
  assert.ok(!r.holds('recommendation(mini, go)'));
  assert.ok(!r.holds('recommendation(mini, conditional_go)'),
    'authority cannot accept away a blocking obligation');
  assert.ok(r.holds('go_blocked(mini, c_load)'));
});

// ------------------------------------------------------------ mutations ---
// The mutation standard (per Vadim, 2026-08-28): a standing green variant,
// violated manually in several distinct ways, each violation checked to
// change the verdict. excise stays a preview diagnostic, not the mutation.

test('mutation: evidence removal drops GO and reopens the claim', () => {
  const r = green();
  assert.ok(r.retract('supports[obs](e_billing, c_billing)').ok);
  assert.ok(!r.holds('recommendation(mini, go)'));
  assert.ok(r.holds('go_blocked(mini, c_billing)'));
  assert.ok(r.holds('candidate_intent(verify, mini, c_billing)'));
});

test('mutation: refuting evidence turns GO into NO-GO', () => {
  const r = green();
  r.assert('refutes[obs](incident_42, c_billing).', { who: 'runtime' });
  assert.ok(!r.holds('recommendation(mini, go)'));
  assert.ok(r.holds('recommendation(mini, no_go)'));
  assert.ok(r.holds('contested_obligation(mini, c_billing)'),
    'the supporting evidence still stands: contested, both visible');
});

test('excise previews the same blast radius without mutating', () => {
  const r = green();
  const e = r.excise('supports[obs](e_billing, c_billing)');
  assert.ok(e.ok);
  assert.ok(e.removed.some((k) => k.includes('recommendation[main](mini,go)')));
  assert.ok(e.added.some((k) => k.includes('candidate_intent[main](verify,mini,c_billing')));
  assert.ok(r.holds('recommendation(mini, go)'), 'the store itself is untouched');
});

test('mutation: a new deployment stales pinned evidence and revokes GO', () => {
  const r = green();
  assert.ok(r.holds('recommendation(mini, go)'));
  r.assert('evidence_version[obs](e_load, "build_100").', { who: 'runtime' });
  assert.ok(r.holds('recommendation(mini, go)'), 'pinned but current: still fresh');
  r.assert('current_version("build_104").');
  assert.ok(r.holds('stale_evidence[epistemic](e_load)'));
  assert.ok(!r.holds('recommendation(mini, go)'), 'stale load test supports nothing');
  assert.ok(r.holds('candidate_intent(verify, mini, c_load)'), 'the claim reopens for verification');
});

test('mutation: evidence for an isolated-scope claim proves nothing aggregate', () => {
  const r = green();
  assert.ok(r.retract('supports[obs](e_load, c_load)').ok);
  assert.ok(!r.holds('recommendation(mini, go)'));
  r.assert('claim(c_load_isolated).');
  r.assert('supports[obs](e_iso_test, c_load_isolated).', { who: 'runtime' });
  assert.ok(r.holds('supported[epistemic](c_load_isolated)'));
  assert.ok(!r.holds('supported[epistemic](c_load)'), 'a weaker claim stays a different atom');
  assert.ok(!r.holds('recommendation(mini, go)'));
});

test('mutation: removing the billing concern mapping surfaces a coverage gap', () => {
  const r = green();
  assert.ok(r.retract('concern_claim(mini, billing, c_billing)').ok);
  assert.ok(r.holds('coverage_gap(mini, billing)'));
  assert.ok(!r.holds('recommendation(mini, go)'));
});
