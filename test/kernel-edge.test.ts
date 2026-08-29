// kernel-edge.test.ts — settles finding f_negation_empty_edb: rules that
// negate a relation with no facts and no rules (an optional frame relation
// nobody populated) must still evaluate and stratify. A decision pack must
// be loadable over a frame that omits every optional relation.

import { test } from 'node:test';
import assert from 'node:assert';
import { Rofl } from '../src/api.ts';
import { loadInquiryKernel } from '../runtime/report.ts';

test('negating a never-populated EDB relation still evaluates', () => {
  const r = new Rofl();
  r.assert('claimx(a). claimx(b). flagged(b).');
  assert.ok(r.load('quiet(C) :- claimx(C), not flagged(C).').ok);
  const rows = r.query('quiet(C)').rows.map((x) => x.bindings.C);
  assert.deepEqual(rows, ['a']);
  // and with a relation that has NO facts anywhere:
  assert.ok(r.load('lonely(C) :- claimx(C), not nonexistent(C).').ok);
  const all = r.query('lonely(C)').rows.map((x) => x.bindings.C).sort();
  assert.deepEqual(all, ['a', 'b']);
});

test('a frame omitting every optional relation still derives intents', () => {
  const r = new Rofl();
  loadInquiryKernel(r);
  // minimal frame: no ambiguous, no requires_authority, no observable... no:
  // observable is needed for verify; omit ambiguous and requires_authority.
  assert.ok(r.load(`
    inquiry(mini, decide).
    claim(c1). blocking(mini, c1). observable(c1).
    claim(c2). requires(mini, c2).
  `).ok);
  assert.ok(r.holds('candidate_intent(verify, mini, c1)'), 'verify derives without any ambiguous fact');
  assert.ok(!r.holds('candidate_intent(clarify, mini, K)'), 'no clarify from nothing');
  assert.ok(!r.holds('candidate_intent(escalate, mini, K)'), 'no escalate from nothing');
  assert.ok(r.holds('open_obligation(mini, c2)'), 'unobservable unknown stays an open obligation');
});
