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


// ---------------------------------------------------------------------------
// A FINDING ACCUMULATES NOTES, and the arity was never declared.
//
// Seven findings in this ledger carry two `finding_note` rows and one carries
// three, and the second is always a CORRECTION — `DISMISSED THE SAME DAY, and
// the dismissal is the finding`, `CORRECTED WITHIN THE HOUR, by the owner`.
// That is a good convention: a ledger that overwrote its first answer would
// lose the more valuable half.
//
// AN UNDECLARED ARITY IS A TRAP FOR THE NEXT RULE, and one walked into it the
// same week. A comparison of two ledgers loaded as two perspectives read
// `finding_note[a](F, X), finding_note[b](F, Y), X != Y` and reported SEVEN
// findings whose text had diverged between two branches. Not one had: the rule
// was pairing a finding's own first note against its own correction, arriving
// through the other book, and the seven were exactly the seven that carry two.

test('a finding may carry several notes, and every one of them reaches the reader', () => {
  const r = withLedger();
  const notes = r.query('finding_note(F, N)').rows.length;
  const findings = r.query('finding(F, K)').rows.length;
  assert.ok(notes > findings, `positive control: ${notes} notes over ${findings} findings`);
  // AN IDENTITY AND NOT A COUNT, and the first draft got it wrong in a way
  // worth keeping: `corrected` counts FINDINGS and the surplus counts NOTES,
  // and they differ the moment one finding carries three. It does — the split
  // scanner's, corrected once by the owner and once by a witness — so the
  // surplus is 8 over 7 findings. Summing each corrected finding's extra notes
  // is exact and stays exact however the ledger grows.
  const corrected = r.query('corrected(F)').rows.map((x) => String(x.bindings['F']));
  assert.ok(corrected.length > 0, 'positive control: some finding has been corrected');
  const extras = corrected.reduce((n, f) => n + r.query(`finding_note(${f}, N)`).rows.length - 1, 0);
  assert.equal(extras, notes - findings,
    'every note beyond the first belongs to a finding `corrected` names');

  // AND THE REPORT JOINS THEM RATHER THAN PICKING ONE, which is the property a
  // reader depends on and nothing checked. Planted, because every corrected
  // finding in the ledger is settled and the backlog therefore shows none.
  const p = new Rofl();
  loadInquiryKernel(p);
  assert.ok(p.load(LEDGER).ok);
  p.assert('finding(f_probe_notes, defect). recorded(f_probe_notes, "2026-09-08").'
    + ' demands(f_probe_notes, doc).'
    + ' finding_note(f_probe_notes, "FIRST, the original claim.").'
    + ' finding_note(f_probe_notes, "SECOND, which corrects it.").');
  const text = buildReport(p);
  assert.match(text, /FIRST, the original claim\./);
  assert.match(text, /SECOND, which corrects it\./);
});

test('a correction with nothing decided is named, not forgotten', () => {
  // The subtler half of silent forgetting: somebody looked again, wrote down
  // what they found, and did not say what it changed. Empty on the honest tree
  // — every corrected finding here is settled — so the check is planted.
  const r = withLedger();
  assert.equal(r.query('corrected_unsettled[audit](F)').rows.length, 0,
    'no finding has been revisited and left open');
  assert.ok(r.query('corrected(F)').rows.length > 0,
    'positive control: the relation it reads is not empty');

  const p = new Rofl();
  loadInquiryKernel(p);
  assert.ok(p.load(LEDGER).ok);
  p.assert('finding(f_probe_open_correction, defect).'
    + ' recorded(f_probe_open_correction, "2026-09-08"). demands(f_probe_open_correction, doc).'
    + ' finding_note(f_probe_open_correction, "the original claim").'
    + ' finding_note(f_probe_open_correction, "CORRECTED, and nobody said what it changed").');
  assert.deepEqual(p.query('corrected_unsettled[audit](F)').rows.map((x) => x.bindings['F']),
    ['f_probe_open_correction'], 'the gate can say no');
  // ...and settling it takes the row away, which is the other direction.
  p.assert('dismissed(f_probe_open_correction, superseded).');
  assert.equal(p.query('corrected_unsettled[audit](F)').rows.length, 0);
});
