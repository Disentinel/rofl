// findings.test.ts — the findings-as-stimuli loop: a recorded finding stays
// open until it gets an explicit disposition, and the report keeps shoving
// open findings back into view.

import { test } from 'node:test';
import assert from 'node:assert';
import { Rofl } from '../src/api.ts';
import { buildReport, loadInquiryKernel } from '../runtime/report.ts';
import * as fs from 'node:fs';

const LEDGER = fs.readFileSync(new URL('../facts/findings.rofl', import.meta.url), 'utf8');

function withLedger(): Rofl {
  const r = new Rofl();
  loadInquiryKernel(r);
  assert.ok(r.load(LEDGER).ok, 'ledger loads');
  return r;
}

test('a finding without disposition is open; disposition settles it', () => {
  const r = new Rofl();
  loadInquiryKernel(r);
  r.assert('finding(f_x, pitfall). demands(f_x, doc).');
  assert.ok(r.holds('open_finding(f_x)'));
  assert.ok(r.holds('finding_action(f_x, doc)'));
  r.assert('addressed_by(f_x, "docs/x.md").');
  assert.ok(!r.holds('open_finding(f_x)'));
  assert.ok(!r.holds('finding_action(f_x, doc)'));
});

test('dismissal with a reason also settles, and why explains the openness', () => {
  const r = new Rofl();
  loadInquiryKernel(r);
  r.assert('finding(f_y, idea). demands(f_y, decision).');
  const why = r.why('open_finding(f_y)');
  assert.ok(why.ok);
  assert.match(why.text, /not settled/);
  r.assert('dismissed(f_y, out_of_scope).');
  assert.ok(!r.holds('open_finding(f_y)'));
});

test('the ledger: nothing open, seventeen settled', () => {
  const r = withLedger();
  assert.deepEqual(r.query('open_finding(F)').rows, []);
  assert.equal(r.query('settled(F)').rows.length, 17);
});

test('the report renders the backlog in your face', () => {
  const r = withLedger();
  const report = buildReport(r);
  assert.match(report, /# Findings backlog/);
  assert.match(report, /all 17 findings settled/);
  assert.doesNotMatch(report, /f_intent_tuple_no_gensym/, 'settled findings stay out of the face');
});
