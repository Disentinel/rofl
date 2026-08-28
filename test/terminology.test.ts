// terminology.test.ts — the Phase 5 checklist: reversible normalization,
// intent deduplication over aliases, broader/narrower kept distinct, and
// embedding similarity never creating equivalence.

import { test } from 'node:test';
import assert from 'node:assert';
import { Rofl } from '../src/api.ts';
import { loadInquiryKernel } from '../runtime/report.ts';

function aliased(): Rofl {
  const r = new Rofl();
  loadInquiryKernel(r);
  // one canonical claim, framed twice under different names
  assert.ok(r.load(`
    inquiry(launch, decide).
    claim(aggregate_capacity).
    observable(aggregate_capacity).
    blocking(launch, aggregate_capacity).
    requires(launch, total_shared_load_capacity).
    alias_of(total_shared_load_capacity, aggregate_capacity).
  `).ok);
  return r;
}

test('alias obligations normalize to ONE canonical target and one intent', () => {
  const r = aliased();
  const obligations = r.query('obligation(launch, C)').rows.map((x) => x.bindings.C);
  assert.deepEqual(obligations, ['aggregate_capacity'], 'alias collapsed, no duplicate');
  const intents = r.query('candidate_intent(verify, launch, C)').rows.map((x) => x.bindings.C);
  assert.deepEqual(intents, ['aggregate_capacity'], 'one intent, not two');
});

test('evidence recorded against the alias supports the canonical claim', () => {
  const r = aliased();
  r.assert('supports[obs](load_report_7, total_shared_load_capacity).', { who: 'runtime' });
  assert.ok(r.holds('supported[epistemic](aggregate_capacity)'));
  const why = r.why('supported[epistemic](aggregate_capacity)');
  assert.ok(why.ok);
  assert.match(why.text, /total_shared_load_capacity/, 'the original mention survives in provenance');
});

test('mappings are reversible: retract the alias and the worlds separate', () => {
  const r = aliased();
  r.assert('claim(total_shared_load_capacity). observable(total_shared_load_capacity).');
  assert.deepEqual(r.query('obligation(launch, C)').rows.map((x) => x.bindings.C),
    ['aggregate_capacity'], 'mapping wins while it stands');
  assert.ok(r.retract('alias_of(total_shared_load_capacity, aggregate_capacity)').ok);
  const after = r.query('obligation(launch, C)').rows.map((x) => x.bindings.C).sort();
  assert.deepEqual(after, ['aggregate_capacity', 'total_shared_load_capacity'],
    'no data was destroyed: the original framing reappears whole');
});

test('broader/narrower terms never merge', () => {
  const r = aliased();
  r.assert('claim(isolated_capacity). broader_than(aggregate_capacity, isolated_capacity).');
  r.assert('supports[obs](iso_run_1, isolated_capacity).', { who: 'runtime' });
  assert.ok(r.holds('supported[epistemic](isolated_capacity)'));
  assert.ok(!r.holds('supported[epistemic](aggregate_capacity)'),
    'evidence for the narrower claim does not climb to the broader one');
});

test('embedding similarity proposes, never merges', () => {
  const r = aliased();
  r.assert('claim(production_capacity). observable(production_capacity). requires(launch, production_capacity).');
  r.assert('semantic_candidate(production_capacity, aggregate_capacity, "0_91").');
  assert.ok(r.holds('mapping_proposal(production_capacity, aggregate_capacity)'),
    'the hint surfaces for review');
  const obligations = r.query('obligation(launch, C)').rows.map((x) => x.bindings.C).sort();
  assert.deepEqual(obligations, ['aggregate_capacity', 'production_capacity'],
    'the claims remain distinct until a human admits alias_of');
  r.assert('supports[obs](cap_report, aggregate_capacity).', { who: 'runtime' });
  assert.ok(!r.holds('supported[epistemic](production_capacity)'),
    'similarity is not equivalence: no evidence flow');
});
