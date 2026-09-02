// JOPA (examples/jopa) -- the standard of proof as a PARAMETER of the
// semiring rather than a constant in the rules, and the whynot that says
// which norm, which condition and which missing fact refused a claim.
//
// This example has no independent oracle: whether a legal translation is
// right is checkable only by a lawyer. So nothing here checks the LAW. What
// it checks is everything a machine can: that the rules are internally
// consistent, that no rule can see a standard of proof, that moving the
// standard moves no derived fact and no annotation, that a higher standard
// is never cleared where a lower one is refused, and that no conclusion is
// reachable without passing through a cited norm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { evaluateSemiring } from '../src/semiring.ts';
import {
  viterbiSemiring, logProbOf, clearsThreshold, IMPOSSIBLE, type LogProb,
  provenanceSemiring, provenanceOf,
} from '../runtime/semirings.ts';
import {
  world, viterbiValues, weightOf, standards, standardOf, decide, bestDerivation,
  nodesOf, breakFrontier, mechanicalChecks, regimeFlip, routeValues, refusal,
  ruleCount, plain, OPERATIVE, STANDARD_TABLES, ASH, REED, VALE, OKORO,
  kElements, kExclusion, kOffence,
} from '../examples/jopa/demo.ts';

// One evaluation shared by every read-only test; none of these mutate it.
let shared: Rofl | null = null;
const model = (): Rofl => (shared ??= world());

let sharedValues: Map<string, LogProb> | null = null;
const values = (): Map<string, LogProb> => (sharedValues ??= viterbiValues(model()));

/** The carrier is `number | typeof IMPOSSIBLE`; a test that expects a number
 *  says so once, here. */
function logUnits(v: LogProb | undefined): number {
  assert.notEqual(v, undefined, 'expected a value');
  assert.notEqual(v, IMPOSSIBLE, 'expected a derivation that is possible at all');
  return v as unknown as number;
}

const K_AT = `established[main](${ASH},at_property)`;
const K_ACC = `established[main](${ASH},accelerant_used)`;

// ---------------------------------------------------------------------------
// the model itself

test('the model loads, boot audits it clean, and every rule materialises', () => {
  const r = model();
  const chk = mechanicalChecks(r, values());
  for (const a of chk.audits) assert.equal(a.rows, 0, `${a.name} must be empty`);
  // an unsafe rule is evaluated top-down instead of materialised, silently,
  // and the semiring fold reads the support of MATERIALISED facts only
  assert.deepEqual(chk.unsafeRules, []);
  assert.equal(chk.demandRels, 0);
  // three ledgers, three writers, and `forged[audit]` above is what checks it
  assert.equal(r.holds('authority(record, tribunal_of_fact)'), true);
  assert.equal(r.holds('authority(calibration, modeller)'), true);
  assert.equal(r.holds('sees(main, record)'), true, 'the norms may read the case file');
  // small enough to audit by eye, which is the only defence this example has
  assert.ok(ruleCount(r) <= 15, `the whole translation is ${ruleCount(r)} rules`);
});

// ---------------------------------------------------------------------------
// THE CLAIM: the standard of proof is not in the rules

test('no rule can see a standard of proof -- checked through the kernel reflection', () => {
  const r = model();
  // not a grep over the file: the kernel reflects every rule as data, and
  // this asks the reflection which rules read or write the standard tables
  for (const t of STANDARD_TABLES) {
    assert.ok(r.holds(`edb(${t})`) || r.query(`concludes(R, ${t})`).rows.length > 0,
      `${t} must exist, or this test passes vacuously`);
    for (const rel of ['premise_pos', 'premise_neg', 'concludes']) {
      assert.deepEqual(r.query(`${rel}(R, ${t})`).rows, [],
        `${rel}: no rule may touch ${t}`);
    }
  }
  assert.deepEqual(mechanicalChecks(r, values()).standardReadByRules, []);
  // and the tables are populated, so the standards really are in the model
  assert.equal(standards(r).length, 3);
  assert.deepEqual(standards(r).map((s) => s.pct), [50, 75, 95]);
});

test('one set of facts, three standards, three different outcomes', () => {
  const r = model();
  const v = values();
  const excl = v.get(kExclusion(ASH))!;
  const offence = v.get(kOffence('k_ashby', ASH))!;

  // the offence adds no evidential step to the exclusion: literally the same
  // number, decided differently only because a different threshold applies
  assert.equal(excl, offence, 'the same number in both proceedings');

  // and the number is the hand calculation: 0.90 (the inference) x 0.92 (the
  // camera) x 0.85 (the laboratory), added in the log carrier
  assert.equal(logUnits(excl),
    logUnits(logProbOf(0.90)) + logUnits(logProbOf(0.92)) + logUnits(logProbOf(0.85)));

  assert.equal(clearsThreshold(excl, 0.50), true, 'balance of probabilities: made out');
  assert.equal(clearsThreshold(excl, 0.75), false, 'clear and convincing: not made out');
  assert.equal(clearsThreshold(offence, 0.95), false, 'beyond reasonable doubt: not made out');

  // the claimant's own case is strong enough for every standard in the Act
  const elements = v.get(kElements(ASH))!;
  assert.equal(logUnits(elements), logUnits(logProbOf(0.97)));
  for (const s of standards(r)) assert.equal(clearsThreshold(elements, s.pct / 100), true);

  const d = decide(r, v, ASH, 'k_ashby');
  assert.equal(d.elementsMade, true);
  assert.equal(d.exclusionMade, false);
  assert.equal(d.offenceMade, false);
  assert.equal(d.outcome, 'indemnity payable');
  // the two questions in ONE decision are decided to DIFFERENT standards,
  // which a threshold baked into the rules could not express at all
  assert.equal(d.elementsStd.pct, 50);
  assert.equal(d.exclusionStd.pct, 75);
});

test('the chain breaks at a different link at each standard', () => {
  const r = model();
  const tree = bestDerivation(r, values(), kExclusion(ASH));
  assert.deepEqual(nodesOf(tree).map((n) => n.key).sort(),
    [kExclusion(ASH), K_ACC, K_AT].sort());

  assert.deepEqual(breakFrontier(tree, 50), [], 'at the balance nothing breaks');

  // at 75 the two evidential findings still clear; the INFERENCE from them
  // to a deliberate act is the step that does not
  const cc = breakFrontier(tree, 75);
  assert.deepEqual(cc.map((n) => n.key), [kExclusion(ASH)]);
  assert.equal(cc[0].section, 's7', 'and it names the section it broke under');
  for (const c of cc[0].children) assert.equal(clearsThreshold(c.value, 0.75), true);

  // at 95 the break has moved DOWN: the laboratory report and the camera
  // still do not themselves reach the criminal standard
  const brd = breakFrontier(tree, 95).map((n) => n.key).sort();
  assert.deepEqual(brd, [K_ACC, K_AT].sort());
  assert.deepEqual(breakFrontier(tree, 95).map((n) => n.section).sort(), ['s6_2', 's6_3']);
});

test('moving the standard moves no derived fact and no annotation', () => {
  const r = model();
  const flip = regimeFlip(r, 'balance_of_probabilities');
  assert.equal(flip.before.exclusionStd.pct, 75);
  assert.equal(flip.after.exclusionStd.pct, 50);
  assert.equal(flip.before.outcome, 'indemnity payable');
  assert.equal(flip.after.outcome, 'indemnity refused: the s.7 exclusion is made out');
  // the whole claim of the example, as an assertion: the amendment is one
  // FACT, and the fixpoint and every annotation on it are untouched
  assert.equal(flip.derivedIdentical, true, 'the same derived facts');
  assert.equal(flip.annotationsIdentical, true, 'with the same values');
});

test('a higher standard is never cleared where a lower one is refused', () => {
  // over every annotated fact in the store, not only the operative ones:
  // a model in which some conclusion cleared 95 and failed 50 would be
  // incoherent whatever the law said
  assert.deepEqual(mechanicalChecks(model(), values()).monotonicityBreaks, []);
});

test('no conclusion is reachable without passing through a cited norm', () => {
  const chk = mechanicalChecks(model(), values());
  assert.ok(chk.operative >= 20, `${chk.operative} operative conclusions checked`);
  assert.deepEqual(chk.uncitedConclusions, []);
  // and the citation is genuinely load-bearing: every minimal source set of
  // the exclusion names the sections it passed through
  const prov = evaluateSemiring(model().store, provenanceSemiring, { base: provenanceOf }).value;
  const poly = prov.get(kExclusion(ASH))!;
  assert.equal(poly.length, 3, 'three independent routes to the exclusion');
  for (const mono of poly) {
    assert.ok(mono.includes('norm[main](s7)'), 'every route goes through s.7');
    assert.ok(mono.some((f) => f.startsWith('evidence[record](')), 'and rests on evidence');
  }
});

// ---------------------------------------------------------------------------
// the numbers live in the facts, not in the code

test('every weight comes out of a fact: change the finding, the value moves', () => {
  const r = world();
  const before = logUnits(viterbiValues(r).get(K_AT));
  assert.equal(before, logUnits(logProbOf(0.92)), 'the camera still, as found');

  // the tribunal revises its assessment of the camera still downward
  assert.equal(r.retract(`evidence[record](e_cam_07, cctv_still, ${ASH}, 92)`).ok, true);
  assert.equal(r.assert(`evidence[record](e_cam_07, cctv_still, ${ASH}, 55).`,
    { who: 'tribunal_of_fact' }).ok, true);
  r.evaluate();
  const after = viterbiValues(r);
  // 55 is now worse than the neighbour, so the neighbour wins the maximum
  assert.equal(logUnits(after.get(K_AT)), logUnits(logProbOf(0.60)),
    'the best remaining route, not the revised one');
  const excl = after.get(kExclusion(ASH))!;
  assert.equal(clearsThreshold(excl, 0.50), false,
    'and the exclusion no longer clears even the balance of probabilities');
  // the norms did not move: the claim itself is decided exactly as before
  assert.equal(logUnits(after.get(kElements(ASH))), logUnits(logProbOf(0.97)));
});

test('a route the tribunal weighed at nothing is derivable and proves nothing', () => {
  const r = model();
  // s.6(4): an anonymous communication is not evidence of any fact. The
  // Boolean fixpoint still derives at_property through it -- derivability is
  // not proof, and that gap is the whole reason a standard of proof exists.
  const routes = routeValues(r, values(), K_AT);
  assert.equal(routes.length, 3);
  assert.equal(routes[0].source, `evidence[record](e_cam_07,cctv_still,${ASH},92)`);
  assert.equal(routes[2].source, `evidence[record](e_tip_11,anonymous_tip,${ASH},0)`);
  assert.equal(routes[2].value, IMPOSSIBLE, 'weight 0 is the symbol, not a tiny float');
  assert.equal(routes[0].value, values().get(K_AT), 'and the maximum is the camera');
  // nothing derived from it can clear any standard above zero
  assert.equal(clearsThreshold(routes[2].value, 0.01), false);
  assert.equal(clearsThreshold(routes[2].value, 0), true, 'a standard of 0 is not a standard');
  // yet the fact is there, at the Boolean reading, and s.6(4) is cited
  assert.equal(r.holds(`established(${ASH}, at_property)`), true);
  assert.equal(r.holds('proves(anonymous_tip, at_property, s6_4)'), true);
});

// ---------------------------------------------------------------------------
// whynot: the refusal letter nobody ever gets

test('whynot names the norm, the condition and the fact -- a failed condition', () => {
  const r = model();
  assert.equal(r.holds(`indemnity_due(${REED})`), false);
  const wn = r.whynot(`indemnity_due(${REED})`, { depth: 5, nodes: 60 });
  assert.equal(wn.holds, false);
  // the norm
  assert.match(wn.text, /norm\[main\]\(s5_e\)/);
  // the condition, and the arithmetic that failed it
  assert.match(wn.text, /failed premise: 41 <= 30 \[builtin fails\]/);
  // and the chain from the conclusion down to it
  const iTop = wn.text.indexOf('failed premise: elements_met[main](c_reed)');
  const iElem = wn.text.indexOf('failed premise: element_met[main](c_reed,notice_in_time)');
  const iCut = wn.text.indexOf('41 <= 30');
  assert.ok(iTop > 0 && iElem > iTop && iCut > iElem, 'the demonstration is a chain');

  // and the rendered refusal is a sentence, built from the same model
  const text = refusal(r, REED).join('\n');
  assert.match(text, /the element that failed: notice_in_time/);
  assert.match(text, /s\.5\(e\)/);
  assert.match(text, /the loss was on 11 April 2026; notice was given on 22 May 2026/);
  assert.match(text, /that is 41 days, and s\.5\(e\) allows 30/);
});

test('whynot names an ABSENT FACT when that is the ground -- a missing predicate', () => {
  const r = model();
  assert.equal(r.holds(`indemnity_due(${VALE})`), false);
  const wn = r.whynot(`indemnity_due(${VALE})`, { depth: 5, nodes: 60 });
  assert.match(wn.text, /norm\[main\]\(s5_c\)/);
  assert.match(wn.text, /failed premise: insured_peril\[main\]\(subsidence\)/);
  assert.match(wn.text, /no rule concludes 'insured_peril' and no matching base fact exists/);
  const text = refusal(r, VALE).join('\n');
  assert.match(text, /the peril alleged is subsidence/);
  assert.match(text, /there is no fact anywhere in the model making subsidence one/);

  // the two refusals are of DIFFERENT shapes and the demonstration says so:
  // one is a condition that failed, one is a fact that does not exist
  assert.doesNotMatch(wn.text, /builtin fails/);
});

// ---------------------------------------------------------------------------
// the honest half: what the mechanism cannot do

test('the same norm written with `not` gives the same verdict and a false annotation', () => {
  const r = model();
  const v = values();
  // s.5 is in the model twice: as a conjunction of five elements, and as
  // "no element is missing" with the element list as data. Same verdict:
  for (const c of [ASH, REED, VALE, OKORO]) {
    assert.equal(r.holds(`elements_met(${c})`), r.holds(`elements_met_closed(${c})`), c);
  }
  assert.equal(r.holds(`elements_met(${ASH})`), true);

  // and NOT the same annotation. The closed form rests on a finite failure,
  // which carries no annotation, so the fold calls it certain -- when it
  // actually rests on a fire brigade report the tribunal put at 97%.
  assert.equal(logUnits(v.get(kElements(ASH))), logUnits(logProbOf(0.97)));
  assert.equal(v.get(`elements_met_closed[main](${ASH})`), viterbiSemiring.one,
    'the negated form reads CERTAIN, and that is a lie about the evidence');
  // so whether a norm can be put to a standard of proof at all depends on
  // how the norm was written down. Recorded, not worked around.
  assert.equal(clearsThreshold(v.get(`elements_met_closed[main](${ASH})`)!, 0.99), true);
  assert.equal(clearsThreshold(v.get(kElements(ASH))!, 0.99), false);
});

test('IMPOSSIBLE is not merely improbable: it fails EVERY standard, including 1%', () => {
  const r = model();
  const v = values();
  const weak = v.get(kExclusion(ASH))!;         // 0.7038 -- a real, weak derivation
  const impossible = v.get(kExclusion(OKORO))!; // no admissible route at all

  // BOTH ARE DERIVABLE. The Boolean reading cannot tell them apart, and this
  // is the whole reason the carrier keeps probability zero as a SYMBOL rather
  // than as a float that arithmetic produced.
  assert.equal(r.holds(`deliberate_loss(${ASH})`), true);
  assert.equal(r.holds(`deliberate_loss(${OKORO})`), true);
  assert.notEqual(weak, IMPOSSIBLE, 'the allegation against Ashby is weak, not impossible');
  assert.equal(impossible, IMPOSSIBLE, 'the allegation against Okoro rests on nothing admissible');

  // a weak fact fails only the HIGHER standards
  assert.equal(clearsThreshold(weak, 0.50), true);
  assert.equal(clearsThreshold(weak, 0.75), false);
  assert.equal(clearsThreshold(weak, 0.95), false);
  // and there is always some positive standard it clears -- lower the bar far
  // enough and a weak allegation is made out
  assert.equal(clearsThreshold(weak, 0.01), true);

  // an impossible fact fails EVERY standard, including the lowest imaginable.
  // No lowering of the bar rescues it: excluded evidence is not weak evidence.
  for (const t of [0.95, 0.75, 0.50, 0.01, 1e-9]) {
    assert.equal(clearsThreshold(impossible, t), false, `must fail a standard of ${t}`);
  }
  // the one place they agree, and it is the algebra saying so out loud:
  // a standard of 0 is not a standard, because p >= 0 always holds
  assert.equal(clearsThreshold(impossible, 0), true);
  assert.equal(clearsThreshold(weak, 0), true);

  // and zero ANNIHILATES rather than merely dragging down: the traces against
  // Okoro are perfectly good, and the conclusion above them is still nothing
  assert.equal(logUnits(v.get(`established[main](${OKORO},accelerant_used)`)), logUnits(logProbOf(0.80)));
  assert.equal(v.get(`established[main](${OKORO},at_property)`), IMPOSSIBLE);
  assert.equal(v.get(kOffence('n_okoro', OKORO)), IMPOSSIBLE, 'and so is the offence built on it');

  // the claim itself is untouched: an unprovable allegation is not a defence
  assert.equal(logUnits(v.get(kElements(OKORO))), logUnits(logProbOf(0.95)));
  const d = decide(r, v, OKORO, 'n_okoro');
  assert.equal(d.exclusionMade, false);
  assert.equal(d.outcome, 'indemnity payable');

  // no monotonicity break is introduced by an impossible value
  assert.deepEqual(mechanicalChecks(r, v).monotonicityBreaks, []);
});

test('corroboration does not accumulate: two witnesses are worth the better one', () => {
  const r = world();
  // add a second neighbour at exactly the weight of the first
  assert.equal(r.assert(`evidence[record](e_wit_09, neighbour_statement, ${ASH}, 60).`,
    { who: 'tribunal_of_fact' }).ok, true);
  assert.equal(r.retract(`evidence[record](e_cam_07, cctv_still, ${ASH}, 92)`).ok, true);
  r.evaluate();
  const v = viterbiValues(r);
  assert.equal(logUnits(v.get(K_AT)), logUnits(logProbOf(0.60)),
    'two independent 60% witnesses are worth 60%, not more');
  // This is a REAL limitation of the algebra and not of the model: plus is
  // max. Law thinks corroboration matters; Viterbi cannot say so.
});

test('the whole check is fast enough that nobody will switch it off', () => {
  const t0 = Date.now();
  const r = world();
  const v = viterbiValues(r);
  mechanicalChecks(r, v);
  bestDerivation(r, v, kExclusion(ASH));
  refusal(r, REED);
  const ms = Date.now() - t0;
  assert.ok(ms < 10_000, `a full load, fold and audit took ${ms} ms`);
});

// ---------------------------------------------------------------------------
// a sanity net over the export surface the README and the page quote

test('the transcript the README quotes is what the code produces', () => {
  const r = model();
  const v = values();
  const d = decide(r, v, ASH, 'k_ashby');
  assert.equal(plain(kExclusion(ASH)), 'deliberate_loss(c_ash)');
  assert.equal(d.exclusionStd.section, 's8_2');
  assert.equal(standardOf(r, 'offence_s9').name, 'beyond_reasonable_doubt');
  assert.deepEqual(OPERATIVE.filter((rel) => r.query(`concludes(R, ${rel})`).rows.length === 0), [],
    'every operative relation is concluded by a rule');
  const ev = new Evaluation(r.store);
  assert.ok(ev.rules.length > 0);
  // the weight hook is total over every firing in the store: an unparsable
  // weighted premise throws rather than silently reading as certain
  for (const key of r.factKeys()) {
    for (const w of r.store.witnessesOf(key)) weightOf(key, w);
  }
});

// ---------------------------------------------------------------------------
// the checks above are only worth their runtime if they can FAIL. Each of
// these takes the standing green model and violates it by hand.

test('MUTATION: a threshold smuggled into a rule is caught', () => {
  const r = world();
  assert.equal(r.assert(
    'refuse_hardcoded(C) :- deliberate_loss(C), standard(clear_and_convincing, N), N >= 75.',
    { who: 'legislature' }).ok, true);
  r.evaluate();
  const chk = mechanicalChecks(r, viterbiValues(r));
  assert.deepEqual(chk.standardReadByRules.map((s) => s.replace(/\(r[0-9a-f]+,/, '(RULE,')),
    ['premise_pos(RULE, standard)'],
    'the reflection sees the rule reading the standard table');
});

test('MUTATION: a conclusion that cites no norm is caught', () => {
  const r = world();
  assert.equal(r.assert('deliberate_loss(C) :- claim[record](C, _).', { who: 'legislature' }).ok, true);
  r.evaluate();
  const chk = mechanicalChecks(r, viterbiValues(r));
  assert.ok(chk.uncitedConclusions.length > 0, 'provenance shows a route through no norm');
  assert.match(chk.uncitedConclusions.join('\n'), /deliberate_loss\[main\]\(c_reed\) <= claim\[record\]/);
});

test('MUTATION: a weight the hook cannot read throws instead of reading as certain', () => {
  const r = world();
  assert.equal(r.assert('proves(sworn_note, at_property, s6_3).', { who: 'legislature' }).ok, true);
  assert.equal(r.assert(`evidence[record](e_z9, sworn_note, ${ASH}, high).`,
    { who: 'tribunal_of_fact' }).ok, true);
  r.evaluate();
  assert.throws(() => viterbiValues(r), /weighted premise with no percentage/);
});
