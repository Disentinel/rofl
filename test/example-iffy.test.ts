// example-iffy.test.ts — inference in a hypothetical branch, a diff of two
// fixpoints, and a deliberate deletion (examples/iffy/).
//
// What this suite is trying to break, and why each of these is the thing that
// would go wrong quietly:
//
//   * THE BRANCH IS NOT A COPY. The corpus is loaded once; nine arms read it
//     through one rule. Pinned as a fact count that does not move when arms are
//     added, not as a claim in a comment.
//   * THE BRANCH DOES NOT WRITE THE BASELINE. The baseline arm's verdicts are
//     identical whether it is alone in the store or sharing it with eight
//     hypotheses. This is the criterion the spec puts second and it is the one
//     an arm column could silently violate.
//   * THE BASELINE ARM IS THE CORPUS. It reproduces jopa.rofl's own
//     `indemnity_due`, `deliberate_loss` and `elements_met`, and nope.rofl's own
//     `access` and `route`, computed by rules that know nothing about arms. An
//     adapter that agrees with nothing is a claim about itself.
//   * THE FLIP COUNTS ARE PREDICTED, NOT RECORDED. The grid is enumerated, so
//     which cases must flip under each amendment is arithmetic. This suite does
//     that arithmetic in TypeScript and requires the engine to match it, rather
//     than pinning whatever the last run produced.
//   * EVERY GATE HAS SAID NO. A vacuous repeal, a vacuous enactment, an idle
//     arm, two notice periods at once, and a flip with no cause are each planted
//     and each required to fire. A check that has never rejected anything is a
//     check nobody has tested.
//   * THE CAUSE IS THE KERNEL'S. What the model attributes a flip to is the
//     link `whynot` names, on sampled cases, and the excise radius is the set
//     the kernel's own deep-copying `excise` computes.
//   * AND THE MODE TRANSFERS. The policy corpus produces `overridden` causes —
//     a conclusion lost with every premise it rested on still standing — which
//     the statute corpus cannot produce at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import {
  AMENDMENTS, ARMS, BILL_CLAUSES, GRID, POLICY_AMENDMENTS, POLICY_ARMS, STATUTE,
  STATUTE_AUDIT, AUDIT_QUERIES, caseOf, causeGroups, cheapestAmendment, cheapestByHand,
  col, corpusFacts, diff, exciseArm, exciseOracle, exciseRadius, forkByClone,
  fragileByHand, fragility, hygiene, interactions, latticeArms, n, policyControls,
  policyWorld, statuteControls, statuteWorld, BOOT, JOPA, JOPA_FACTS, JOPA_CALIB, IFFY,
} from '../examples/iffy/demo.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** One statute world and one policy world for the read-only tests; building
 *  either costs a fixpoint over a 144-case corpus, so they are shared. */
const W = statuteWorld();
const P = policyWorld();

// ---------------------------------------------------------------------------
// the ground the rest stands on

test('both worlds load clean: nothing unsafe, nothing unstratified, every audit empty', () => {
  const worlds: [string, Rofl, [string, string][]][] = [['statute', W, [STATUTE_AUDIT]], ['policy', P, []]];
  for (const [what, r, extra] of worlds) {
    const h = hygiene(r, extra);
    assert.deepEqual(h.unstratified, [], `${what}: unstratified`);
    assert.deepEqual(h.unsafe, [], `${what}: outside range restriction`);
    for (const [name, count] of Object.entries(h.audits)) {
      assert.equal(count, 0, `${what}: ${name} = ${count}`);
    }
    assert.ok(h.rules > 90, `${what}: only ${h.rules} rules — did an adapter fail to load?`);
  }
});

test('the baseline arm reproduces the corpus, computed by rules that know no arms', () => {
  for (const [what, rows] of [['statute', statuteControls(W)], ['policy', policyControls(P)]] as const) {
    for (const [name, fromCorpus, fromArm] of rows) {
      assert.ok(fromCorpus.length > 0, `${what}/${name}: the corpus answered nothing — no control`);
      assert.deepEqual(fromArm, fromCorpus, `${what}/${name}`);
    }
  }
});

// ---------------------------------------------------------------------------
// criterion 1 and 2: a fork that copies nothing and writes nothing

test('the corpus is loaded once however many arms read it', () => {
  const one = statuteWorld({ draft: AMENDMENTS + 'arm[draft](enacted).\nbaseline[draft](enacted).\n' });
  const evidenceQ = 'evidence[record](I, K, C, Wt)';
  const claimQ = 'claim[record](C, Pol)';
  assert.equal(n(W, evidenceQ), n(one, evidenceQ), 'evidence facts multiplied with the arms');
  assert.equal(n(W, claimQ), n(one, claimQ), 'case files multiplied with the arms');
  assert.equal(n(W, 'arm[draft](A)'), 9);
  assert.equal(n(one, 'arm[draft](A)'), 1);
  // and the amendable slice too: the norms are read, never restated
  assert.equal(n(W, 'enacted_elem(E)'), n(one, 'enacted_elem(E)'));
});

test('inference in a branch does not reach the baseline', () => {
  const alone = statuteWorld({ draft: AMENDMENTS + 'arm[draft](enacted).\nbaseline[draft](enacted).\n' });
  const a = col(alone, 'verdict(enacted, Q)', 'Q').sort();
  const b = col(W, 'verdict(enacted, Q)', 'Q').sort();
  assert.ok(a.length > 0, 'the baseline decided nothing — nothing to protect');
  assert.deepEqual(b, a);
  // the same, from the other direction: adding an arm that repeals half the Act
  const loud = statuteWorld({
    draft: AMENDMENTS + ARMS + `
arm[draft](wreck).
carries[draft](wreck, ed_no_brigade). carries[draft](wreck, ed_no_tip).
carries[draft](wreck, ed_notice21).
`});
  assert.deepEqual(col(loud, 'verdict(enacted, Q)', 'Q').sort(), a);
  assert.ok(n(loud, 'lost(wreck, Q)') > 20, 'the wrecking arm did nothing — bad probe');
});

// ---------------------------------------------------------------------------
// criterion 3 and 4: the diff, and the cause of each row
//
// THE ORACLE IS THE GRID. Which cases the Act decides for is arithmetic over
// the enumeration, not something read off a previous run: an insured peril, a
// piece of evidence the Act admits for causation, and notice inside the period.

const CAUSATION = new Set(['brig', 'brig_eng', 'brig_wit', 'met_acc', 'eng_tip']);
const INSURED = new Set(['fire', 'storm', 'escape_of_water']);
const AT_PROPERTY = new Set(['met_acc', 'eng_tip']);   // cctv_still / anonymous_tip
const ACCELERANT = new Set(['met_acc', 'eng_tip', 'acc_only']);

const dueUnder = (limit: number, causation: (b: string) => boolean, perils: Set<string>): Set<string> =>
  new Set(GRID.filter((g) => perils.has(g.peril) && causation(g.bundle) && g.delay <= limit)
    .map((g) => `q_due(${g.id})`));

test('the numbers the report prints are the numbers the grid predicts', () => {
  const enacted = new Set(col(W, 'verdict(enacted, q_due(C))', 'C').map((c) => `q_due(${c})`));
  const predicted = dueUnder(30, (b) => CAUSATION.has(b), INSURED);
  // the four hand-written cases are in the store too and are not in the grid
  const gridOnly = new Set([...enacted].filter((q) => q.includes('(g_')));
  assert.deepEqual([...gridOnly].sort(), [...predicted].sort());

  const exclusion = new Set(GRID.filter((g) => AT_PROPERTY.has(g.bundle) && ACCELERANT.has(g.bundle))
    .map((g) => `q_excl(${g.id})`));
  const gotExcl = new Set(col(W, 'verdict(enacted, q_excl(C))', 'C')
    .filter((c) => c.startsWith('g_')).map((c) => `q_excl(${c})`));
  assert.deepEqual([...gotExcl].sort(), [...exclusion].sort());
});

test('tightening s.5(e) loses exactly the cases the arithmetic says it loses', () => {
  const lost = new Set(col(W, 'lost(a_notice21, Q)', 'Q').filter((q) => q.includes('(g_')));
  const predicted = new Set([...dueUnder(30, (b) => CAUSATION.has(b), INSURED)]
    .filter((q) => !dueUnder(21, (b) => CAUSATION.has(b), INSURED).has(q)));
  assert.ok(predicted.size > 0, 'the amendment was predicted to lose nothing — bad probe');
  assert.deepEqual([...lost].sort(), [...predicted].sort());
  assert.equal(n(W, 'gained(a_notice21, Q)'), 0, 'a tightening gained something');
});

test('adding a peril gains exactly the subsidence cases, and nothing else', () => {
  const gained = new Set(col(W, 'gained(a_subsidence, Q)', 'Q').filter((q) => q.includes('(g_')));
  const predicted = dueUnder(30, (b) => CAUSATION.has(b), new Set(['subsidence']));
  assert.deepEqual([...gained].sort(), [...predicted].sort());
  assert.equal(n(W, 'lost(a_subsidence, Q)'), 0);
});

test('every flip is attributed to a clause, and the sole/multiple split adds up', () => {
  for (const arm of ['bill', 'relief', 'a_notice21', 'a_no_brigade']) {
    const flipped = n(W, `flipped(${arm}, Q)`);
    assert.ok(flipped > 0, `${arm} flipped nothing — bad probe`);
    assert.equal(n(W, `unexplained[audit](${arm}, Q)`), 0, `${arm}: a flip with no cause`);
    const sole = n(W, `sole_reason(${arm}, Q, Ed)`);
    const multi = n(W, `multi_reason(${arm}, Q)`);
    assert.equal(sole + multi, flipped, `${arm}: ${sole} + ${multi} != ${flipped}`);
    // the grouped report never claims more sole flips for a clause than flips
    for (const g of causeGroups(W, arm)) assert.ok(g.sole <= g.flips, `${arm}/${g.edit}`);
  }
});

test('the model names the same link the kernel does', () => {
  const only = caseOf('fire', 25, 'met_acc');   // fails on notice and nothing else
  assert.ok(W.holds(`verdict(enacted, q_due(${only}))`));
  assert.ok(!W.holds(`verdict(bill, q_due(${only}))`));
  assert.deepEqual(col(W, `because(bill, q_due(${only}), C)`, 'C'),
    ['withdrawn(notice_limit(30))']);
  const wn = W.whynot(`amet(bill, ${only}, notice_in_time)`, { depth: 2 });
  assert.equal(wn.holds, false);
  assert.match(wn.text, /25 <= 21 \[builtin fails\]/, wn.text);
  // and the kernel agrees the OTHER way on a case two clauses reach
  const both = caseOf('fire', 25, 'brig_eng');
  assert.deepEqual(col(W, `because(bill, q_due(${both}), C)`, 'C').sort(), [
    'withdrawn(admits(fire_brigade_report,peril_caused_loss))',
    'withdrawn(notice_limit(30))',
  ]);
  assert.ok(W.holds(`multi_reason(bill, q_due(${both}))`));
});

// ---------------------------------------------------------------------------
// criterion 4: interaction

test('joint_only is exactly the cases no single clause reaches', () => {
  const joint = col(W, 'joint_only(relief, Q)', 'Q').sort();
  const predicted = GRID.filter((g) => g.peril === 'subsidence' && g.delay === 41 && CAUSATION.has(g.bundle))
    .map((g) => `q_due(${g.id})`).sort();
  assert.ok(predicted.length > 0);
  assert.deepEqual(joint, predicted);
  for (const q of joint) {
    assert.ok(W.holds(`verdict(relief, ${q})`), `${q} does not hold jointly`);
    assert.ok(!W.holds(`verdict(enacted, ${q})`), `${q} already held`);
    for (const solo of ['a_notice45', 'a_subsidence']) {
      assert.ok(!W.holds(`verdict(${solo}, ${q})`), `${q} holds under ${solo} alone`);
      assert.ok(!W.holds(`flipped(${solo}, ${q})`), `${q} flips under ${solo} alone`);
    }
  }
});

test('masked names a flip a clause makes alone and the whole bill hides', () => {
  const masked = interactions(W, 'bill').masked;
  assert.ok(masked.length > 0, 'nothing masked — bad probe');
  for (const [q, ed] of masked) {
    const solo = { ed_no_brigade: 'a_no_brigade', ed_neighbour: 'a_neighbour' }[ed as string];
    assert.ok(solo, `no solo arm for ${ed}`);
    assert.ok(W.holds(`flipped(${solo}, ${q})`), `${q} does not flip under ${solo}`);
    assert.ok(!W.holds(`flipped(bill, ${q})`), `${q} flips under the bill after all`);
  }
});

// ---------------------------------------------------------------------------
// criterion 5: lost independent supports

test('fragility computed by rules and by set arithmetic outside the engine agree', () => {
  for (const [r, arms] of [[W, ['a_no_brigade', 'bill', 'a_neighbour']],
                           [P, ['a_narrow_admin', 'bill_open']]] as [Rofl, string[]][]) {
    for (const arm of arms) {
      assert.deepEqual(fragility(r, arm).fragile, fragileByHand(r, arm), arm);
    }
  }
  assert.ok(fragility(W, 'a_no_brigade').fragile.length > 0, 'nothing fragile — bad probe');
  assert.ok(fragility(P, 'a_narrow_admin').fragile.length > 0, 'nothing fragile — bad probe');
});

test('fragile is disjoint from flipped: it is the warning, not the regression', () => {
  for (const arm of ['a_no_brigade', 'bill']) {
    for (const q of fragility(W, arm).fragile) {
      assert.ok(!W.holds(`flipped(${arm}, ${q})`), `${q} both flipped and fragile`);
      assert.ok(W.holds(`steady(${arm}, ${q})`));
      assert.ok(n(W, `support(enacted, ${q}, S)`) >= 2, `${q} had no spare to lose`);
      assert.equal(n(W, `support(${arm}, ${q}, S)`), 1, `${q} is not down to one`);
    }
  }
});

// ---------------------------------------------------------------------------
// criterion 6: excise

test('the blast radius computed as an arm is the one the kernel computes by copying', () => {
  const sole = caseOf('fire', 8, 'brig');
  const spare = caseOf('fire', 8, 'brig_eng');
  const r = statuteWorld({ extra: exciseArm('cut_sole', `${sole}_e0`) + exciseArm('cut_spare', `${spare}_e0`) });
  const soleRadius = exciseRadius(r, 'cut_sole');
  assert.deepEqual(soleRadius, [`q_due(${sole})`]);
  assert.deepEqual(soleRadius, exciseOracle(r, `evidence[record](${sole}_e0, fire_brigade_report, ${sole}, 95)`));

  // and the deletion whose radius is empty and which is still not free
  assert.deepEqual(exciseRadius(r, 'cut_spare'), []);
  assert.ok(r.holds('radius_empty(cut_spare)'));
  assert.deepEqual(exciseOracle(r, `evidence[record](${spare}_e0, fire_brigade_report, ${spare}, 95)`), []);
  assert.equal(n(r, 'support_lost(cut_spare, Q, S)'), 1);

  // the radius was computed with the fact still in the store, and it still is
  assert.ok(r.holds(`evidence[record](${sole}_e0, fire_brigade_report, ${sole}, 95)`));
  assert.ok(r.holds(`verdict(enacted, q_due(${sole}))`));
});

// ---------------------------------------------------------------------------
// criterion 7: the tropical question

test('the cheapest amendment is found, and the fold never charges more than the arm', () => {
  const wanted = caseOf('subsidence', 41, 'brig');
  const r = statuteWorld({
    draft: AMENDMENTS + `arm[draft](enacted).\nbaseline[draft](enacted).\ntarget[draft](q_due(${wanted})).\n`
      + latticeArms(['ed_notice21', 'ed_notice45', 'ed_subsidence', 'ed_neighbour']),
  });
  assert.equal(n(r, 'arm[draft](A)'), 16, 'the lattice is not 2^4 arms');
  assert.ok(!r.holds(`verdict(enacted, q_due(${wanted}))`), 'the target already holds — bad probe');

  const fold = cheapestAmendment(r);
  const byHand = cheapestByHand(r);
  assert.ok(fold.length > 0, 'no arm reached the target — bad probe');
  assert.deepEqual(fold.map((m) => m.arm).sort(), byHand.map((m) => m.arm).sort());
  // the fold charges for the clauses the derivation used; the hand count
  // charges for every clause the arm carries. So the fold is never larger.
  for (const m of fold) {
    const h = byHand.find((x) => x.arm === m.arm)!;
    assert.ok(m.cost <= h.cost, `${m.arm}: fold ${m.cost} > declared ${h.cost}`);
  }
  assert.deepEqual(byHand[0].clauses, ['ed_notice45', 'ed_subsidence']);
  assert.equal(byHand[0].cost, 5);
  assert.equal(fold[0].cost, 5);
  // and a target that cannot be reached at all reports nothing rather than 0
  const impossible = statuteWorld({
    draft: AMENDMENTS + `arm[draft](enacted).\nbaseline[draft](enacted).\ntarget[draft](q_due(${caseOf('flood', 41, 'acc_only')})).\n`
      + latticeArms(['ed_notice21', 'ed_notice45', 'ed_subsidence', 'ed_neighbour']),
  });
  assert.equal(cheapestAmendment(impossible).length, 0);
});

// ---------------------------------------------------------------------------
// EVERY GATE HAS SAID NO

test('a repeal of a norm that is not in force is caught, not silently ignored', () => {
  const r = statuteWorld({
    draft: AMENDMENTS + ARMS + `
amendment[draft](ed_typo).
repeals[draft](ed_typo, admits(fire_brigade_report, peril_caused_los)).
arm[draft](a_typo). carries[draft](a_typo, ed_typo).
`});
  assert.equal(n(r, 'vacuous_repeal[audit](Ed, E)'), 1);
  assert.deepEqual(col(r, 'vacuous_repeal[audit](Ed, E)', 'Ed'), ['ed_typo']);
  assert.equal(n(r, 'flipped(a_typo, Q)'), 0, 'a misspelt repeal changed something');
});

test('an enactment of a norm already in force is caught', () => {
  const r = statuteWorld({
    draft: AMENDMENTS + ARMS + `
amendment[draft](ed_noop).
enacts[draft](ed_noop, peril(fire)).
arm[draft](a_noop). carries[draft](a_noop, ed_noop).
`});
  assert.deepEqual(col(r, 'vacuous_enact[audit](Ed, E)', 'Ed'), ['ed_noop']);
});

test('an arm that amends nothing and is not the baseline is caught', () => {
  const r = statuteWorld({ draft: AMENDMENTS + ARMS + '\narm[draft](a_empty).\n' });
  assert.deepEqual(col(r, 'idle_arm[audit](A)', 'A'), ['a_empty']);
});

test('two notice periods in force at once is caught by the adapter', () => {
  const r = statuteWorld({
    draft: AMENDMENTS + ARMS + `
arm[draft](a_both).
carries[draft](a_both, ed_notice21). carries[draft](a_both, ed_notice45).
`});
  const rows = r.query('double_limit[audit](A, L1, L2)').rows;
  assert.ok(rows.length > 0, 'two contradictory notice periods went unremarked');
  assert.ok(rows.every((x) => x.bindings.A === 'a_both'));
  // and this is not hypothetical: the arm decides cases the longer period admits
  assert.ok(n(r, 'gained(a_both, Q)') > 0);
});

test('a flip with no cause is caught: delete one `uses` rule and the audit fires', () => {
  const line = 'uses(A, q_due(C), notice_limit(L)) :- verdict(A, q_due(C)), in_force(A, notice_limit(L)).';
  assert.ok(STATUTE.includes(line), 'the rule this mutation removes is not there any more');
  const crippled = STATUTE.replace(line, '');
  const r = new Rofl();
  for (const [text, opts, what] of [
    [BOOT, {}, 'boot'], [JOPA, {}, 'jopa'],
    [JOPA_FACTS, { who: 'tribunal_of_fact' }, 'facts'],
    [JOPA_CALIB, { who: 'modeller' }, 'calib'],
    [corpusFacts(), { who: 'tribunal_of_fact' }, 'grid'],
    [IFFY, {}, 'iffy'], [crippled, {}, 'crippled statute'],
    [AMENDMENTS + ARMS, { who: 'drafter' }, 'draft'],
  ] as [string, { who?: string }, string][]) {
    const res = r.load(text, opts);
    assert.ok(res.ok, `${what}: ${res.diagnostics.join('; ')}`);
  }
  const unexplained = n(r, 'unexplained[audit](A, Q)');
  assert.ok(unexplained > 0, 'the mutation changed nothing — the mutant survived');
  assert.equal(n(W, 'unexplained[audit](A, Q)'), 0, 'the unmutated world is not clean');
});

// ---------------------------------------------------------------------------
// the mode transfers, and the second corpus answers a question the first cannot

test('the policy corpus produces a cause the statute corpus cannot', () => {
  assert.ok(n(P, 'because(a_deny_put, Q, overridden(E))') > 0, 'no overridden cause');
  for (const row of P.query('because(a_deny_put, Q, overridden(E))').rows) {
    const q = row.bindings.Q;
    assert.ok(P.holds(`lost(a_deny_put, ${q})`));
    // every premise the baseline leaned on is still in force: nothing withdrawn
    assert.equal(n(P, `because(a_deny_put, ${q}, withdrawn(E))`), 0, `${q} also lost a support`);
  }
  // and the statute, by construction, has no defeating norm at all
  assert.equal(n(W, 'because(A, Q, overridden(E))'), 0);
  assert.equal(n(W, 'blocks(A, Q, E)'), 0);
  // both kinds of gain appear on the policy corpus
  assert.ok(n(P, 'because(bill_open, Q, admitted(E))') > 0);
  assert.ok(n(P, 'because(bill_open, Q, unblocked(E))') > 0);
});

test('the policy corpus flips only jointly where the two clauses need each other', () => {
  const joint = interactions(P, 'bill_open').jointOnly;
  assert.equal(joint.length, 1);
  const q = joint[0];
  assert.match(q, /^q_access\(alice,/);
  assert.ok(P.holds(`verdict(bill_open, ${q})`));
  for (const a of ['enacted', 'a_scp_off', 'a_grant_reader']) {
    assert.ok(!P.holds(`verdict(${a}, ${q})`), `${q} already holds under ${a}`);
  }
  assert.ok(interactions(P, 'bill_guard').masked.length > 0);
});

// ---------------------------------------------------------------------------
// the measurement's premise

test('a fork by clone reaches the same fixpoint the arm does', () => {
  const plain = (): Rofl => {
    const r = new Rofl();
    for (const [text, opts] of [
      [BOOT, {}], [JOPA, {}], [JOPA_FACTS, { who: 'tribunal_of_fact' }],
      [JOPA_CALIB, { who: 'modeller' }], [corpusFacts(), { who: 'tribunal_of_fact' }],
    ] as [string, { who?: string }][]) {
      assert.ok(r.load(text, opts).ok);
    }
    return r;
  };
  const base = plain();
  base.evaluate();
  const before = col(base, 'indemnity_due(C)', 'C').sort();

  const forked = Rofl.fromSnapshot(base.save());
  forked.retract('notice_period(s5_e, 30).');
  assert.ok(forked.assert('notice_period(s5_e, 21).').ok);
  forked.store.dirty = true;
  forked.evaluate();
  const after = col(forked, 'indemnity_due(C)', 'C').sort();

  // the fork moved, the original did not
  assert.notDeepEqual(after, before);
  assert.deepEqual(col(base, 'indemnity_due(C)', 'C').sort(), before);
  // and the arm computed exactly the fork's answer
  assert.deepEqual(col(W, 'verdict(a_notice21, q_due(C))', 'C').sort(), after);

  // forkByClone reports a time and the right row count
  const fc = forkByClone(plain, (f) => {
    f.retract('notice_period(s5_e, 30).');
    assert.ok(f.assert('notice_period(s5_e, 21).').ok);
  }, 'indemnity_due(C)');
  assert.equal(fc.rows, after.length);
  assert.ok(fc.ms > 0);
});

// ---------------------------------------------------------------------------
// IFFY IS A MODE, AND THIS IS THE CLAIM AS A NUMBER
//
// What the kernel asks of an adapter must not grow with the corpus, or the
// "mode" claim is decoration. The policy corpus has three times the evaluation
// rules of the statute corpus; if the interface surface tracked that, a third
// corpus would cost proportionally more and IFFY would be a technique rather
// than a mode. README.md prints these numbers, so they are pinned here — a
// figure in prose that nothing checks goes stale silently.

const MODE_RELS = new Set(['enacted_elem', 'question', 'support', 'verdict', 'uses', 'blocks']);

/** Rule heads of a .rofl text, comments stripped. */
function ruleHeads(text: string): string[] {
  return text.replace(/--[^\n]*/g, '').split(/\.\s*\n/)
    .filter((c) => c.includes(':-'))
    .map((c) => c.split(':-')[0].trim().replace(/[([].*/s, ''));
}

test('the interface an adapter implements does not grow with its corpus', () => {
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const shape = (adapter: string, corpus: string) => {
    const heads = ruleHeads(read(adapter));
    return {
      total: heads.length,
      mode: heads.filter((h) => MODE_RELS.has(h)).length,
      corpusRules: ruleHeads(read(corpus)).length,
    };
  };
  const st = shape('examples/iffy/statute.rofl', 'examples/jopa/jopa.rofl');
  const po = shape('examples/iffy/policy.rofl', 'examples/nope/nope.rofl');

  // the corpora really are different sizes, or this test proves nothing
  assert.ok(po.corpusRules >= 2.5 * st.corpusRules,
    `the two corpora are too alike to test this: ${st.corpusRules} vs ${po.corpusRules}`);
  // and the mode surface barely moves
  assert.ok(po.mode <= st.mode + 4, `mode surface grew: ${st.mode} -> ${po.mode}`);
  // the numbers README.md prints
  assert.deepEqual(
    [st.corpusRules, st.mode, st.total - st.mode, po.corpusRules, po.mode, po.total - po.mode],
    [12, 14, 11, 36, 17, 22],
    'the adapter shape moved; README.md "Was the second corpus cheaper" needs the new numbers');

  // every relation iffy.rofl asks of an adapter is answered by BOTH of them
  for (const [what, text] of [['statute', read('examples/iffy/statute.rofl')],
                              ['policy', read('examples/iffy/policy.rofl')]] as [string, string][]) {
    const heads = new Set(ruleHeads(text));
    for (const rel of MODE_RELS) assert.ok(heads.has(rel), `${what} adapter never concludes ${rel}`);
  }
});

test('the second corpus reaches cause kinds the first cannot', () => {
  // this is why two corpora and not one, and it is measured rather than argued
  const kinds = (r: Rofl, arms: string[]) => new Set(
    ['withdrawn', 'overridden', 'admitted', 'unblocked']
      .filter((k) => arms.some((a) => n(r, `because(${a}, Q, ${k}(E))`) > 0)));
  const st = kinds(W, ['bill', 'relief', 'a_notice21', 'a_no_brigade', 'a_subsidence', 'a_neighbour']);
  const po = kinds(P, ['bill_open', 'bill_guard', 'a_deny_put', 'a_narrow_admin', 'a_scp_off']);
  assert.deepEqual([...st].sort(), ['admitted', 'withdrawn']);
  assert.deepEqual([...po].sort(), ['admitted', 'overridden', 'unblocked', 'withdrawn']);
  for (const k of st) assert.ok(po.has(k), `the policy corpus lost cause kind ${k}`);
});

// ---------------------------------------------------------------------------
// the shape of the report

test('the diff adds up and the denominator is the whole question set', () => {
  for (const [r, arms] of [[W, ['bill', 'relief']], [P, ['bill_guard', 'a_narrow_admin']]] as [Rofl, string[]][]) {
    for (const arm of arms) {
      const d = diff(r, arm);
      assert.equal(d.lost + d.gained, d.flipped, `${arm}: lost+gained != flipped`);
      assert.ok(d.flipped < d.decided, `${arm}: everything flipped`);
      assert.equal(d.decided, n(r, 'question(Q)'));
      assert.equal(n(r, `steady(${arm}, Q)`) + d.lost, n(r, 'verdict(enacted, Q)'));
    }
  }
});
