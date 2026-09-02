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

// The census used to be pinned here ("nothing open, twenty-four settled"),
// which made the suite go red the moment anyone recorded a finding — and
// CLAUDE.md's protocol explicitly allows a finding to be *left open
// deliberately*. A test may not forbid what the protocol permits. What is
// worth pinning is the partition itself: every finding is settled or open,
// never neither and never both.
test('the ledger: every finding is exactly one of settled or open', () => {
  const r = withLedger();
  const ids = (q: string, v: string) => new Set(r.query(q).rows.map((x) => x.bindings[v]));
  const all = ids('finding(F, K)', 'F');
  const open = ids('open_finding(F)', 'F');
  const settled = ids('settled(F)', 'F');
  assert.ok(all.size > 0, 'the ledger carries findings');
  assert.ok(settled.size > 0, 'the ledger carries settled findings');
  for (const f of all) {
    assert.equal(open.has(f) !== settled.has(f), true, `${f} is exactly one of open/settled`);
  }
  // catches the silent typo: a disposition naming an id no finding declares
  for (const f of settled) assert.ok(all.has(f), `settled id ${f} is a declared finding`);
});

test('the report renders the backlog in your face', () => {
  const r = withLedger();
  const report = buildReport(r);
  assert.match(report, /# Findings backlog/);
  const open = r.query('open_finding(F)').rows.map((x) => x.bindings.F);
  if (open.length === 0) assert.match(report, /findings settled/);
  for (const f of open) assert.ok(report.includes(f), `open finding ${f} is in your face`);
  assert.doesNotMatch(report, /f_intent_tuple_no_gensym/, 'settled findings stay out of the face');
});
