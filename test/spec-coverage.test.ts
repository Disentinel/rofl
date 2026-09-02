// spec-coverage.test.ts — the obligation model, run as a test so it cannot rot.
//
// The model under test is `facts/spec.rofl` + `rules/spec-coverage.rofl`: the
// kernel's own obligations as facts, and the rules that ask which of them has
// nothing mechanical behind it. Two things have to be true of it before any
// number it produces means anything, and both are checked here:
//
//   1. It can say NO. A model of coverage in which everything comes out
//      covered is a mirror. The deliberate-removal arm hides ONE test name
//      from the census and watches four obligations fall out of `covered`,
//      each with the broken link named. That arm is the positive control for
//      every count below it.
//
//   2. It cannot say YES on air. Every duty carries its citation, and the
//      planted-duty arm shows an anchor that is not at the line it names
//      being reported as `unfounded` rather than believed.
//
// Three findings the model produced are pinned as their own tests at the
// foot of the file, because each is a defect in the tree rather than in the
// model, and a test is how this repository keeps such a thing from healing
// quietly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { peelRounds } from '../src/rounds.ts';
import { world, testNames, checkCitation, report, unq, type Duty } from '../scanners/spec.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// one fixpoint, shared: every arm below reads the same world
const W = world();
const R = W.r;
const col = (q: string, v: string): string[] => R.query(q).rows.map((x) => unq(x.bindings[v])).sort();
const n = (q: string): number => R.query(q).rows.length;

/** The uncovered set, pinned. This list IS the deliverable: adding a test that
 *  guards one of these, or writing a document that retires it, is expected to
 *  turn this red — that is the point of pinning it rather than a count. */
const UNCOVERED = [
  'b_collected_declared_only',
  'd_veto_belongs_inside',
  'l_comparisons_need_ground_ints',
  'l_demand_depth_512',
  'l_demand_no_enumeration',
  'l_init_after_zero_inert',
  'l_next_not_assertable',
  'l_no_aggregation',
  'l_no_floats_no_bignums',
  'l_no_occurs_check',
  'l_queries_are_god_view',
  'l_reflection_in_main',
  'l_retraction_leaves_no_trail',
  'l_reuse_switchable',
  'l_undefined_silenced_by_one_fact',
  'p_i2_self_audit_tracks_program_size',
  'p_p2_provenance_is_not_the_cost',
  'r_perspective_registration',
  'r_timeless_kernel_facts',
  's8_out_of_scope',
  's_document_no_occurs_check',
  's_done_limits',
  's_done_readme',
  's_init_at_tick_zero',
  's_main_is_named',
  's_persistence_is_a_rule',
  's_report_loc_overrun',
  's_zero_deps',
];

// ---------------------------------------------------------------------------
// hygiene: everything else is about a different program if this fails

test('the model loads clean under boot.rofl: every audit empty, nothing unstratifiable', () => {
  const ev = new Evaluation(R.store, { budget: 4_000_000 });
  assert.equal(ev.rules.every((x) => x.safe), true, 'an unsafe rule would be unfolded top-down');
  assert.equal(ev.demandRels.size, 0, 'nothing here is demand-backed');
  assert.deepEqual(col('unstratified(X)', 'X'), []);
  assert.deepEqual({
    malformed: n('malformed[audit](R)'), breach: n('breach[audit](R)'),
    leak: n('leak[audit](A, B)'), forged: n('forged[audit](F)'),
    unmoded: n('unmoded[audit](R)'), undefined_premise: n('undefined_premise[audit](R, Rel)'),
  }, { malformed: 0, breach: 0, leak: 0, forged: 0, unmoded: 0, undefined_premise: 0 });
});

test('the gather is a DECLARED bridge, not a leak: seven ledgers cross into one', () => {
  // `duty_of[coverage](O, K, P, F, L, A) :- duty[P](O, K, F, L, A).` reads a
  // VARIABLE ledger and writes a named one.
  //
  // The bracket on the head USED TO BE the declaration: the kernel emitted
  // `bridge_decl` for any rule whose head named a ledger and whose body read
  // another, and `crossing` read that back as a licence — so this rule
  // authorised its own read by existing, and typing the bracket was the whole
  // of the authorisation. That is gone. The sentence is now written by hand in
  // rules/spec-coverage.rofl, and it has to be `collects` rather than
  // `imports`, because `$var("P")` has no `authority` fact and can never be
  // the From of an import.
  //
  // Read through `collected[audit]`, which is the licence EXERCISED — a row
  // that only exists when the declaration actually caught something — instead
  // of through a row the kernel emitted from the rule's shape alone.
  assert.ok(R.holds('collects(coverage)'), 'the declaration is written out');
  assert.ok(R.holds('collected[audit](coverage)'),
    'and it did work: something polymorphic really did flow into [coverage]');
  // the `why` names the gathering rule and the reason the escape applied, so
  // the licence can be ASKED about rather than merely being in force
  const why = R.why('collected[audit](coverage)').text;
  assert.match(why, /collects\[main\]\(coverage\) \[axiom\]/, why);
  assert.match(why, /not perspective\[main\]\(\$var\("P"\)\)/,
    'the source is no registered ledger, which is why the sentence is collects and not imports:\n' + why);

  // MUTANT: strike the one declaration out of the rule file and the gather is
  // reported as a leak. Without this the two assertions above would pass in a
  // world where nothing was licensed because nothing had crossed.
  const RULES = read('rules', 'spec-coverage.rofl');
  assert.ok(RULES.includes('\ncollects(coverage).'), 'mutant is vacuous if the line is not there');
  const bare = new Rofl();
  assert.equal(bare.load(read('boot.rofl')).ok, true);
  assert.equal(bare.load(RULES.replace('\ncollects(coverage).', '')).ok, true);
  const bareLeaks = bare.query('leak[audit](A, B)').rows
    .map((x) => `${x.bindings['A']} -> ${x.bindings['B']}`);
  assert.ok(bareLeaks.includes('$var("P") -> coverage'),
    `undeclared, the gather is a leak — that is what makes the declaration a licence: ${JSON.stringify(bareLeaks)}`);
  const ledgers = new Set(W.duties.map((d) => d.ledger));
  assert.deepEqual([...ledgers].sort(),
    ['boot', 'decided', 'limits', 'perf', 'readme', 'spec', 'wfs']);
});

test('negation lands strictly above what it negates', () => {
  // The schedule this model was evaluated under, peeled off its own decoded
  // rules. It used to be read from `stratum(Rel, N)`, which boot.rofl derived;
  // those ten rules left boot.rofl when the evaluator stopped needing them, and
  // the round a relation settles in is the same level under another name.
  const peel = peelRounds(new Evaluation(R.store, {}).rules);
  const lv = (r: string) => peel.round.get(r) ?? -1;
  assert.equal(peel.stalled, false, 'positive control: the model itself is stratifiable');
  assert.ok(lv('uncovered') > lv('covered'), `uncovered ${lv('uncovered')} vs covered ${lv('covered')}`);
  assert.ok(lv('live_duty') > lv('superseded'));
  assert.ok(lv('unattended') > lv('prose_discharged'));
  assert.ok(lv('unwritten') > lv('named_file'));
});

// ---------------------------------------------------------------------------
// the census is a measurement, not an empty probe

test('the census reads every test file, and no file comes back silently empty', () => {
  const c = W.census;
  // FLOORS, not equalities. This census measures the tree it lives in, and the
  // tree grows: an equality here turns red the next time anyone adds a test
  // file, and that red says nothing about the model. (Paid for immediately —
  // `test/example-rip.test.ts` landed while this file was being written and
  // broke two pinned totals.) A floor still fails if the extractor silently
  // stops finding tests, which is the failure this arm exists for.
  assert.ok(c.testFiles.length >= 55, `${c.testFiles.length} test files, 55 when this was built`);
  assert.ok(c.checks.filter((x) => x.kind === 'test').length >= 640,
    `${c.checks.filter((x) => x.kind === 'test').length} tests, 649 when this was built`);

  // POSITIVE CONTROL, and the reason the floor above is enough: a file the
  // regex fails on contributes zero rows and reads exactly like a file with no
  // tests. Per FILE, so it stays true however many files there are.
  for (const f of c.testFiles) {
    assert.ok(c.checks.some((x) => x.file === f), `${f} contributed no test at all`);
  }
  // and the extractor survives the escapes real names contain
  assert.deepEqual(testNames(`test('a rule\\'s own name', () => {\ntest("double", () => {\n  test('nested', () => {`),
    ["a rule's own name", 'double']);

  // A citation is keyed on (file, name), so two tests sharing a name in one
  // file would make a guard ambiguous. Nothing else in the tree checks this.
  const seen = new Set<string>();
  const dupes = c.checks.filter((x) => {
    const k = `${x.file}::${x.name}`;
    if (seen.has(k)) return true;
    seen.add(k); return false;
  });
  assert.deepEqual(dupes, [], 'two checks share one (file, name) — a guard would be ambiguous');
});

test('the gates and CI steps are a closed list, and it is exact on purpose', () => {
  // These two ARE equalities, and the reason is that they do not track the
  // tree: `GATE_SCRIPTS` in scanners/spec.ts is a hand-maintained set, so this
  // asserts the scanner's own list rather than how much the repository has
  // grown. Adding a gate is a deliberate act and should re-confirm here.
  const names = (kind: string) => W.census.checks.filter((x) => x.kind === kind)
    .map((x) => x.name).sort();
  assert.deepEqual(names('gate'), [
    'npm run grepcheck', 'npm run measurecheck', 'npm run test', 'npm run test:bun',
    'npm run textcheck',
  ]);
  assert.deepEqual(names('ci'), [
    'install dependencies (the scanner needs @babel/parser)',
    'kernel grep test (vocabulary check)', 'tests (bun test)', 'tests (node --test)',
    'typecheck',
  ]);
});

test('every duty in the ledger reached the model, and every one carries a citation', () => {
  const written = read('facts', 'spec.rofl').split('\n')
    .filter((l) => /^duty\[/.test(l)).length;
  assert.equal(W.duties.length, written, 'a duty in the file that the model did not load');
  assert.equal(W.duties.length, 129);
  for (const d of W.duties) {
    assert.ok(d.file.length > 0 && d.line > 0 && d.anchor.length > 0, d.id);
  }
});

test('every citation resolves at the line it names', () => {
  const broken = W.citations.filter((x) => !x.ok).map((x) => `${x.duty.id}: ${x.why}`);
  assert.deepEqual(broken, []);
  assert.deepEqual(col('unfounded[coverage](O)', 'O'), []);
});

test('POSITIVE CONTROL: a duty whose anchor is not at the cited line is unfounded', () => {
  const planted: Duty = {
    id: 'x_planted', kind: 'guaranteed', ledger: 'spec',
    file: 'START.md', line: 1, anchor: 'the kernel shall be written in Fortran',
  };
  assert.equal(checkCitation(planted).ok, false, 'the verifier believed an invented sentence');
  const w = world({ extra: 'duty[spec](x_planted, guaranteed, "START.md", 1, "the kernel shall be written in Fortran").\n' });
  assert.deepEqual(w.r.query('unfounded[coverage](O)').rows.map((x) => x.bindings['O']), ['x_planted']);
  // and the same sentence at the line that really carries it is believed
  assert.equal(checkCitation({ ...planted, line: 133, anchor: 'Hardcoding any boot.rofl rule' }).ok, true);
});

test('POSITIVE CONTROL: a guard naming a check id nothing declares is reported, not silent', () => {
  const w = world({ extra: 'guards[map](c_no_such_check, s_determinism).\n' });
  assert.deepEqual(w.r.query('undefined_citation[coverage](C, O)').rows.map((x) => x.text),
    ['C = c_no_such_check, O = s_determinism']);
});

// ---------------------------------------------------------------------------
// THE DISCRIMINATING PROPERTY: the model can report an obligation as uncovered

test('THE DELIBERATE REMOVAL: hiding one test moves four obligations out of covered', () => {
  const gone = 'round-trip: serialize store -> new process -> load -> identical evaluation, no re-parse';
  const before = new Set(col('covered[coverage](O)', 'O'));
  for (const o of ['s_a_round_trip', 's_evaluator_reads_store', 's_rules_are_subgraphs', 's7_no_clause_objects']) {
    assert.ok(before.has(o), `${o} must be covered before the removal, or this proves nothing`);
  }
  const w = world({ omit: (c) => c.name === gone });
  const after = new Set(w.r.query('covered[coverage](O)').rows.map((x) => x.bindings['O']));
  assert.deepEqual(
    [...before].filter((o) => !after.has(o)).sort(),
    ['s7_no_clause_objects', 's_a_round_trip', 's_evaluator_reads_store', 's_rules_are_subgraphs']);
  // and the model says WHY, naming the link that broke rather than only the gap
  assert.deepEqual(w.r.query('dangling[coverage](C, O)').rows.map((x) => x.bindings['O']).sort(),
    ['s7_no_clause_objects', 's_a_round_trip', 's_evaluator_reads_store', 's_rules_are_subgraphs']);
  assert.equal(w.r.query('unfounded[coverage](O)').rows.length, 0,
    'a removed TEST is not a broken citation of a DOCUMENT');
});

test('the uncovered set is exactly this, and it is not empty', () => {
  assert.deepEqual(col('uncovered[coverage](O)', 'O'), UNCOVERED);
  assert.equal(col('covered[coverage](O)', 'O').length, 98);
  // three of the uncovered are discharged by a document rather than a test;
  // the rest have nothing at all
  assert.deepEqual(col('prose_discharged[coverage](O)', 'O'),
    ['s_document_no_occurs_check', 's_done_limits', 's_done_readme']);
  assert.equal(col('unattended[coverage](O)', 'O').length, 25);
  // the sharp end: a prohibition nothing mechanical stands in front of
  assert.deepEqual(col('open_shortcut[coverage](O)', 'O'), ['s8_out_of_scope']);
});

test('coverage is reported by INSTRUMENT, so a gate is not confused with a test', () => {
  const kinds = new Map<string, Set<string>>();
  for (const row of R.query('guarded_by[coverage](O, K)').rows) {
    const o = row.bindings['O'];
    if (!kinds.has(o)) kinds.set(o, new Set());
    kinds.get(o)!.add(row.bindings['K']);
  }
  assert.deepEqual([...(kinds.get('s_semantics_as_data') ?? [])].sort(), ['gate', 'test']);
  assert.deepEqual([...(kinds.get('s_two_runtimes') ?? [])], ['ci'],
    'the two-runtime obligation is held by CI alone: no test can check it from inside one runtime');
});

test('what changed: eight amendments and ten qualifications, both ends cited', () => {
  const amends = R.query('amends[map](New, Old)').rows.map((x) => `${x.bindings['New']}>${x.bindings['Old']}`).sort();
  assert.equal(amends.length, 8);
  const quals = R.query('qualifies[map](New, Old)').rows;
  assert.equal(quals.length, 10);
  // An amendment retires its target; a qualification does not. The newest
  // amendment is the ten schedule rules leaving boot.rofl: `peelRounds` lives in
  // `src/`, so "the kernel does not contain a stratification checker" is
  // contradicted rather than narrowed. Everything else about that change is a
  // qualification — the kernel still rejects unstratifiable programs, still
  // reads `stratum/2` on the stock evaluator, still has the partial-strata
  // corner there — and this assertion is what caught the first draft, which
  // wrote the reject duty as an amendment and would have retired an obligation
  // three tests still hold.
  assert.deepEqual(col('superseded[coverage](O)', 'O'), [
    'l_frozen_never_collected', 's_a_kernel_grep', 's_appendix_dep_edges',
    's_appendix_leak', 's_grammar_temporal', 's_no_stratification_checker',
    's_vocabulary_closed',
  ]);
  const live = new Set(col('live_duty[coverage](O)', 'O'));
  for (const row of quals) assert.ok(live.has(row.bindings['Old']), `${row.bindings['Old']} still owed`);
});

test('the converse: what a test file guards is a partition, and one side is not empty', () => {
  const unwritten = col('unwritten[coverage](F)', 'F');
  const files = col('test_file[checks](F)', 'F');
  // `named_file` also carries the gate script and the CI workflow — a duty may
  // be guarded by something that is not a test — so the partition is over the
  // TEST files it names.
  const named = col('named_file[coverage](F)', 'F').filter((f) => files.includes(f));

  // THE INVARIANT, which survives the 58th file: every test file is either
  // cited by some duty or it is not, and the two sides partition the census.
  // The COUNT is a finding, not an invariant — it belongs in the report, and
  // `npm run speccheck` prints it.
  assert.deepEqual([...named, ...unwritten].sort(), files);
  assert.equal(named.filter((f) => unwritten.includes(f)).length, 0, 'no file on both sides');
  assert.ok(unwritten.length > 0, 'a converse that never fires is not a measurement');
  assert.ok(named.length > 0, '...and neither is one that always fires');

  // the finding, printed rather than pinned
  console.log(`      ${unwritten.length} of ${files.length} test files guard nothing any modelled document demands`);

  // Three of them are kernel mechanics rather than domain demos, which is the
  // half of the finding worth reading. Named individually because THAT is a
  // claim about this tree and not about its size.
  for (const f of ['test/arg-index.test.ts', 'test/key-bytes.test.ts', 'test/kernel-edge.test.ts']) {
    assert.ok(unwritten.includes(f), `${f} is expected to be cited by no duty`);
  }
  // ...and a file the model DOES cite is on the other side
  assert.ok(named.includes('test/phase3.test.ts'));
  // this file too: the model's own tests guard the MODEL, and no document in
  // the ledger demands a model
  assert.ok(unwritten.includes('test/spec-coverage.test.ts'));
});

test('the report renders, and its headline numbers are the model\'s own', () => {
  const text = report(W).join('\n');
  assert.match(text, /129 duties in 7 ledgers/);
  assert.match(text, /covered 98, uncovered 28, superseded 7/);
  assert.match(text, /s_report_loc_overrun\s+START\.md:107/);
});

// ---------------------------------------------------------------------------
// three findings, pinned. Each is a defect in the tree that the model found.

test('the collection requirement is askable, and answers with the declared ones', () => {
  // Was a FINDING: boot.rofl:145 asked for `? gathered[audit](A,B)`, and
  // `gathered/2` is written in [main] while the only [audit] relation of that
  // family is `collected/1` — so the required result was empty in EVERY
  // possible store. It could not fail, and nothing asked it. Repaired
  // 2026-08-31 to name `collected[audit](X)`; this test is what keeps it
  // askable, and it is the two-sided proof the old one could not give.
  assert.match(read('boot.rofl'), /\? collected\[audit\]\(X\)/);
  assert.doesNotMatch(read('boot.rofl'), /\? gathered\[audit\]/,
    'the unfalsifiable form must not come back');
  const r = new Rofl();
  assert.equal(r.load(read('boot.rofl')).ok, true);
  assert.equal(r.load(`
    collects(case).
    said[red](a).
    claim[case](P, X) :- said[P](X).
    digest[report](X) :- claim[case](_, X).
  `, { who: 'tester' }).ok, true);
  r.evaluate(1_000_000);
  // it SAYS YES on a declared collection...
  assert.equal(r.query('collected[audit](case)').rows.length, 1,
    'the declared collection is reported, so the requirement is non-vacuous');
  assert.equal(r.query('gathered(A, B)').rows.length, 2, 'the gather really happened');
  // ...and NO on a store that declares none, which the old form could not do
  const q = new Rofl();
  assert.equal(q.load(read('boot.rofl')).ok, true);
  assert.equal(q.load('said[red](a).\nkept[red](X) :- said[red](X).', { who: 'tester' }).ok, true);
  q.evaluate(1_000_000);
  assert.equal(q.query('collected[audit](X)').rows.length, 0,
    'nothing collects here, so the requirement reports nothing: it can say no');
});

test('FINDING: the kernel is past the size START.md called a stop signal', () => {
  // START.md:107 — "If it grows past ~2,500, stop: something that belongs in
  // boot.rofl as rules has leaked into the host. That signal is itself a
  // deliverable — report it rather than pushing through."
  const files = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.ts')).sort();
  let physical = 0, code = 0;
  for (const f of files) {
    const ls = read('src', f).split('\n');
    physical += ls.length;
    code += ls.filter((l) => !/^\s*$|^\s*(\/\/|\*|\/\*)/.test(l)).length;
  }
  assert.ok(code > 2500, `src/ is ${code} code lines (${physical} physical) — under the threshold now?`);
  // and the signal the spec asks for is nowhere: neither document mentions it
  assert.equal(/2,?500|leaked into the host/.test(read('README.md')), false);
  assert.equal(/2,?500|leaked into the host/.test(read('LIMITS.md')), false);
});

test('FINDING: LIMITS.md still forbids what `retainTicks` does', () => {
  // The amendment the model records: docs/time-and-continuity.md:160 landed a
  // retention window; LIMITS.md:121 says provenance is never collected and
  // "there is no compaction". Neither LIMITS.md nor README.md mentions the
  // window, so the only place the change is written down is a design doc.
  assert.match(read('LIMITS.md'), /Frozen provenance is never garbage-collected/);
  assert.equal(/retainTicks/.test(read('LIMITS.md')), false);
  assert.equal(/retainTicks/.test(read('README.md')), false);
  assert.match(read('docs', 'time-and-continuity.md'), /retainTicks/);
  assert.ok(col('superseded[coverage](O)', 'O').includes('l_frozen_never_collected'));
});
