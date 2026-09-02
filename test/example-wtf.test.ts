// WTF (examples/wtf) -- the MTG layer system as a stratified fixpoint. The
// properties worth pinning: the seven layers are strata the meta-kernel
// computed and not a schedule; dependency (CR 613.8) overrides timestamp and
// the documented ruling comes out right; the counting sweep really does find
// the order-dependent sublayers; state-based actions are a second fixpoint;
// and an independent implementation of CR 613 agrees on every board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import {
  world, leanWorld, leanAgrees, MODEL, tuples, orderOf, runSweeps, sbaFixpoint,
  readBoard, simulate, oracleDigest, kernelDigest, counterfactual, wtfSteps,
  boundaries, boundaryProbe, stratumOf, reachesFrom,
  type Sweep, type OracleReport,
} from '../examples/wtf/demo.ts';

// One evaluation shared by every read-only test: loading and running the
// meta-kernel over 200-odd rules is the expensive part, and none of these
// mutate the store.
let shared: Rofl | null = null;
const model = (): Rofl => (shared ??= world());

let sweepCache: { sweeps: Sweep[]; oracle: OracleReport } | null = null;
const sweeps = () => (sweepCache ??= runSweeps());

const ptOf = (r: Rofl, o: string): string => {
  const x = r.query(`pt(${o}, P, T)`).rows[0];
  return x ? `${x.bindings.P}/${x.bindings.T}` : '(none)';
};

// ---------------------------------------------------------------------------
// the model itself

test('the model loads, boot audits it clean, and every rule materialises', () => {
  const r = model();
  for (const audit of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)',
    'undefined_premise[audit](R, Rel)']) {
    assert.equal(r.query(audit).rows.length, 0, `${audit} must be empty`);
  }
  // A rule that is not range-restricted is evaluated top-down instead of
  // materialised, silently -- and then the semiring fold reads a different
  // fact set from the one the verdicts describe.
  const ev = new Evaluation(r.store, {});
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), []);
  assert.equal(ev.demandRels.size, 0);
});

test('the audits wtf.rofl carries about its own encoding are empty', () => {
  const r = model();
  for (const audit of [
    'unordered4(A, B)',   // bef4 is a total order on layer 4 ...
    'cyclic4(A, B)',      // ... antisymmetric ...
    'intrans4(A, B, C)',  // ... and transitive, or "last one wins" means nothing
    'kill_chain4(B)',     // no killer is itself killed: dead4's depth-1 reading holds
    'unsound4(A)',        // no surviving effect's target set shifts inside the layer
    'p5_dep(A, B)',       // the timestamp-only sublayers have no dependency to miss
    'p6_dep(A, B)',
    'p72_dep(A, B)',
    'ts_tie(A, B)',       // no two effects in one sublayer share a timestamp
  ]) {
    assert.equal(r.query(audit).rows.length, 0, `${audit} must be empty`);
  }
});

test('boot.rofl is load-bearing here, not decoration — on the stock path', () => {
  // Without stratum/2 facts every negation rule runs in one final pass
  // (LIMITS.md), and this program's answers are simply wrong: the dependency
  // order never forms and Urborg's dead effect applies anyway. That is the
  // STOCK evaluator, which reads its phase order out of the store and has no
  // order to read when nothing derived one.
  const bare = new Rofl({ evaluator: 'strata' });
  assert.equal(bare.load(MODEL).ok, true);
  assert.equal(bare.holds('live4(e_urborg)'), true, 'unstratified: the dead effect lives');
  assert.equal(bare.holds('eta4(e_urborg, 300)'), true, 'unstratified: eta never rose');
  const r = model();
  assert.equal(r.holds('live4(e_urborg)'), false);
  assert.equal(r.holds('eta4(e_urborg, 700)'), true);
});

test('and on the default path it is NOT: fourteen strata, ordered with no boot', () => {
  // The same model, the same absence of boot.rofl, the default evaluator.
  // Rounds peel the order off the decoded rules, so the fourteen layers this
  // file is the canary for form without anything being derived about the
  // program first — and the two answers above invert.
  const bare = new Rofl();
  assert.equal(bare.load(MODEL).ok, true);
  assert.equal(bare.holds('live4(e_urborg)'), false, 'the dead effect is dead');
  assert.equal(bare.holds('eta4(e_urborg, 700)'), true, 'and eta rose');

  // POSITIVE CONTROL for the absence: there is genuinely no table here, so the
  // right answer was not obtained by quietly loading one.
  assert.equal(bare.query('stratum(Rel, N)').rows.length, 0, 'no stratum table');
  assert.equal(bare.query('dep(A, B)').rows.length, 0, 'no dependency graph either');

  // and it agrees with the world that HAS boot.rofl, relation for relation
  const r = model();
  assert.equal(bare.holds('live4(e_urborg)'), r.holds('live4(e_urborg)'));
  assert.equal(bare.holds('eta4(e_urborg, 700)'), r.holds('eta4(e_urborg, 700)'));
});

test('every layer boundary is one-way in the rule graph the peel is taken over', () => {
  // Reachability in the RELATION dependency graph — the closure boot.rofl used
  // to publish as `reach/2`, now computed off the decoded rules in the demo
  // that asks the question. One-way at every boundary means the evaluation
  // order is forced by the rules, whether or not a negation additionally makes
  // it a level.
  const bs = boundaries(model());
  assert.equal(bs.length, 17);
  assert.deepEqual(bs.filter((b) => !b.oneWay).map((b) => `${b.lo}->${b.hi}`), []);
});

test('the layer boundaries that are STRATA are the ones with a removal in them', () => {
  const r = model();
  const bs = boundaries(r);
  const by = new Map(bs.map((b) => [`${b.lo}->${b.hi}` as string, b] as const));

  // THE TEST IS THE REMOVAL, NOT THE NUMBER. This used to compare the two
  // levels boot.rofl derived and call a gap "negation-forced". A gap is not
  // that: under the stratum table `printed_type -> ty1` had one because `ty1`
  // negates `copied`, which is not about types at all, and under the peel every
  // derived relation wakes at least one round after its base inputs, which
  // moved `printed_ctrl -> ct1` from flat to forced without any negation
  // appearing. So the boundaries are classified by what the layer above
  // actually NEGATES, which is readable straight off the rules and is the
  // property the two-line shape in wtf.rofl exists to discharge.

  // (a) the removal RANGES OVER THE LAYER BELOW: the strong form, and the one
  // that makes the boundary a level for the reason the rulebook gives.
  const strong = bs.filter((b) => b.removalOverLo).map((b) => `${b.lo}->${b.hi}`).sort();
  assert.deepEqual(strong, ['ab1->ab3', 'ab3->ab4', 'ab4->ab6', 'bp1->pt7a', 'co3->co5',
    'ct1->ct2', 'pt7a->pt7b', 'pt7c->pt7d', 'ty3->ty4']);
  for (const k of strong) {
    const b = by.get(k)!;
    assert.ok(b.forced, `${k} removes over ${b.lo}, so it must also be a level (${b.loN} -> ${b.hiN})`);
  }

  // (b) the four COPY boundaries remove something, but what they remove is
  // about the OBJECT (`copied`), not about the layer below. They are levels,
  // and they are levels for the weaker reason -- exactly the shape
  // `boundaryProbe()` measures below. Reported, not folded into (a).
  const weak = bs.filter((b) => b.removals.length > 0 && !b.removalOverLo)
    .map((b) => `${b.lo}->${b.hi}`).sort();
  assert.deepEqual(weak, ['printed_ability->ab1', 'printed_color->co1',
    'printed_pt->bp1', 'printed_type->ty1']);
  for (const k of weak) {
    assert.deepEqual(by.get(k)!.removals, ['copied'], `${k} removes only the copy mark`);
    assert.ok(by.get(k)!.forced, `${k} is still a level`);
  }

  // (c) Flat: NO removal at all, and each for a reason that is a fact about the
  // DOMAIN, not a defect in the encoding. Pinned so that a later edit cannot
  // quietly add one. These are exactly the four boundaries carrying a `flatWhy`.
  const flat = bs.filter((b) => b.removals.length === 0).map((b) => `${b.lo}->${b.hi}`).sort();
  assert.deepEqual(flat, ['co1->co3', 'printed_ctrl->ct1', 'pt7b->pt7c', 'ty1->ty3']);
  assert.deepEqual(bs.filter((b) => b.flatWhy !== '').map((b) => `${b.lo}->${b.hi}`).sort(), flat,
    'the four the model explains are the four with nothing to negate');
  assert.equal(strong.length + weak.length + flat.length, bs.length,
    'positive control: the three classes partition all 17 boundaries');
  // a text change rewrites TEXT, so layers 1 and 3 agree on types and colours
  assert.equal(r.query('ty3(O, T)').rows.length, r.query('ty1(O, T)').rows.length);
  assert.equal(r.query('co3(O, C)').rows.length, r.query('co1(O, C)').rows.length);
  // layer 7c only ADDS, so there is no removal to negate on -- but the order
  // is still forced, positively
  assert.equal(reachesFrom(r, 'pt7c', 'pt7b'), true);
  assert.equal(reachesFrom(r, 'pt7b', 'pt7c'), false);
  for (const b of bs.filter((x) => x.removals.length === 0)) {
    assert.notEqual(b.flatWhy, '', `${b.lo}->${b.hi} must say why it is flat`);
  }
});

test('routing the negation off the layer below loses the stratum and nothing else', () => {
  // The measurement behind the claim. Same answers, different visibility.
  const p = boundaryProbe();
  assert.equal(p.sameAnswers, true, 'the two encodings compute the same board');
  assert.ok(p.strong > p.co3, `lost5-over-co3 lifts co5 above co3 (${p.co3} -> ${p.strong})`);
  assert.equal(p.weak, p.co3, `not anyset5(O) leaves co5 at co3's level (${p.weak})`);
});

test('the dependency system is COMPUTED below the layer it reorders', () => {
  // Note what this does and does not say. CR 613.8 is not stratification --
  // it is a conditional reordering derived from the effects' semantics. What
  // the strata show is that its relations are finished before layer 4 applies,
  // which is why nothing had to schedule them.
  const r = model();
  const max = (rel: string): number => stratumOf(r, rel);
  for (const [lo, hi] of [['dep_reason', 'edep4'], ['edep4', 'eta4'],
    ['eta4', 'live4'], ['live4', 'ty4']] as const) {
    assert.ok(max(hi) > max(lo), `${hi} must sit above ${lo}`);
  }
  assert.ok(max('bef4') >= max('eta4'));

  // Timestamps are mechanism (2) and are NOT strata: `bef_ts` reads no state
  // at all, so it sits at the bottom and orders things INSIDE a level, which
  // stratification cannot express.
  assert.ok(max('bef_ts') < max('ty4'));
  assert.equal(reachesFrom(r, 'bef_ts', 'ty3'), false, 'bef_ts reads no layer state');

  // the plan the engine actually ran agrees -- and it IS the peel, so this is
  // the schedule the evaluation used rather than a table it consulted
  const lv = (rel: string) => stratumOf(r, rel);
  assert.ok(lv('ty4') > lv('live4'));
  assert.ok(lv('ab6') > lv('ty4'), 'layer 6 reads what layer 4 left of the abilities');
  assert.ok(lv('pt7d') > lv('pt7b'));
});

// ---------------------------------------------------------------------------
// the documented disputed case

test('CR 613.8: dependency is derived, and it overrides timestamp', () => {
  const r = model();
  // both land effects depend on Blood Moon, by 613.8a's existence clause
  assert.deepEqual(
    r.query('dep_reason(A, B, R)').rows.map((x) =>
      `${x.bindings.A}<-${x.bindings.B}:${x.bindings.R}`).sort(),
    ['e_urborg<-e_bloodmoon:existence', 'e_yavimaya<-e_bloodmoon:existence']);
  // Blood Moon does NOT depend on them: no loop, so 613.8b's fallback is idle
  assert.equal(r.holds('depends4(e_bloodmoon, X)'), false);
  assert.equal(r.query('loop4(A, B)').rows.length, 0);

  // the timestamps say the opposite of the order
  assert.equal(r.holds('eff_ts(e_urborg, 300)'), true);
  assert.equal(r.holds('eff_ts(e_bloodmoon, 700)'), true);
  assert.deepEqual(orderOf(r, 40), ['e_bloodmoon', 'e_urborg', 'e_yavimaya']);

  // the documented outcome: Blood Moon wins whatever the timestamps are, so
  // Urborg's ability is gone and the basic Forest is NOT a Swamp
  assert.deepEqual(tuples(r, 'dead4', 1).map((t) => t[0]).sort(),
    ['e_urborg', 'e_yavimaya']);
  assert.equal(r.holds('ty4(forest1, swamp)'), false);
  assert.equal(r.holds('ty4(forest1, forest)'), true);
  assert.equal(r.holds('ty4(urborg, mountain)'), true);
  assert.equal(r.holds('ab4(urborg, rules_text_urborg)'), false, 'CR 305.7');

  // and the timestamp-only pipeline in section 12 disagrees, which is why
  // the ruling had to be written
  assert.equal(r.holds('ty4n(forest1, swamp)'), true);
  assert.equal(r.holds('swamps(p1, 1)'), true);
  assert.equal(r.holds('swamps_n(p1, 2)'), true);
});

test('the ruling holds under every timestamp assignment, not just this one', () => {
  const s = sweeps().sweeps.find((x) => x.layer === 40)!;
  assert.equal(s.effects.length, 3);
  assert.equal(s.orders, 6, 'all 3! timestamp assignments');
  assert.equal(s.outcomes, 1, 'dependency pins the answer: one outcome');
  assert.equal(s.verdict, 'stable');
  assert.ok(s.naiveOutcomes !== null && s.naiveOutcomes > 1,
    `timestamp order alone gives ${s.naiveOutcomes} different boards`);
});

test('why names the layer, the timestamp and the reason for the order', () => {
  const r = model();
  const why = r.why('bef4(e_bloodmoon, e_urborg)');
  assert.equal(why.ok, true);
  // the tree bottoms out on 613.8a's existence clause, via CR 305.7
  assert.match(why.text, /dep_reason\[main\]\(e_urborg,e_bloodmoon,existence\)/);
  assert.match(why.text, /kills_ability\[main\]\(e_bloodmoon,urborg\)/);
  assert.match(why.text, /does\[main\]\(e_bloodmoon,set_land_type\(mountain\)\)/);
  // and the ordering key really is built from the ancestor's timestamp
  const iEta = why.text.indexOf('eta4[main](e_urborg,700)');
  const iCts = why.text.indexOf('cts4[main](e_urborg,700)');
  const iAnc = why.text.indexOf('anc4[main](e_urborg,e_bloodmoon)');
  assert.ok(iEta >= 0 && iCts > iEta && iAnc > iCts,
    'eta4 <= cts4 <= anc4: the key is the ancestor timestamp, not the effect\'s own');

  // the derivation report names a LAYER and a TIMESTAMP on every step
  const steps = wtfSteps(r, 'grizzly');
  assert.ok(steps.length >= 3);
  for (const line of steps) {
    assert.match(line, /^ {2}\d[a-d]?\s/, `every step names its layer: ${line}`);
    assert.match(line, /T\d+/, `every step names its timestamp: ${line}`);
  }
});

// ---------------------------------------------------------------------------
// the characteristics themselves

test('the Comprehensive Rules own worked examples come out right', () => {
  const r = model();
  // CR 613.4d Example 1: a 1/3 given +0/+1, then switched, then given +5/+0
  assert.equal(ptOf(r, 'oracle'), '4/6');
  // CR 613.5 Example 2: Gray Ogre, +1/+1 counter, +4/+4, +0/+2, becomes 0/1
  assert.equal(ptOf(r, 'gray_ogre'), '5/8');
  // and the sublayers really are what produced them
  assert.equal(r.holds('pt7b(gray_ogre, 0, 1)'), true, 'layer 7b set it to 0/1');
  assert.equal(r.holds('pt7c(gray_ogre, 5, 8)'), true, 'layer 7c added the modifiers after');
  assert.equal(r.holds('switched(oracle)'), true, 'layer 7d switched');
  assert.equal(r.holds('pt7c(oracle, 6, 4)'), true, 'and 7c had made it 6/4');
});

test('a text change in layer 3 reaches layer 7c, and control in layer 2 cuts it', () => {
  const r = model();
  // the lord now names bear, so Grizzly Bears is 3/3 and not 2/2
  assert.equal(r.holds('ab1(archdruid, lord(elf, 1, 1))'), true);
  assert.equal(r.holds('ab3(archdruid, lord(bear, 1, 1))'), true);
  assert.equal(r.holds('ab3(archdruid, lord(elf, 1, 1))'), false);
  assert.equal(r.holds('mod73(grizzly, e_archdruid, 1, 1)'), true);
  assert.equal(ptOf(r, 'grizzly'), '3/3');

  // Wild Mongrel changed controller in layer 2, so the same lord misses it
  assert.equal(r.holds('ct2(mongrel, p2)'), true);
  assert.equal(r.holds('mod73(mongrel, e_honor, 1, 1)'), false);
  // layer 6: gain flying T200, lose flying T400, lose everything T950
  assert.equal(r.holds('ab6(mongrel, flying)'), false);
  assert.equal(r.holds('ab6(mongrel, haste)'), false);
  assert.equal(ptOf(r, 'mongrel'), '11/11', '1/1 from 7b, +10/+10 from 7c');

  // the Clone is the same card as Grizzly Bears and a different size, and the
  // whole difference is one layer 5 effect
  assert.equal(r.holds('copy_src(clone1, grizzly)'), true);
  assert.equal(ptOf(r, 'clone1'), '4/4');
  assert.equal(r.holds('co5(clone1, white)'), true);
  assert.equal(r.holds('co5(grizzly, white)'), false);
  assert.equal(r.holds('co5(grizzly, blue)'), true);
});

test('a characteristic-defining ability in layer 7a reads layer 4 answer', () => {
  const r = model();
  assert.equal(r.holds('cda_pt(nightmare, 1, 1)'), true, 'one Swamp survives Blood Moon');
  assert.equal(ptOf(r, 'nightmare'), '2/2', 'plus the anthem in 7c');
  // and under timestamp order there would have been two Swamps
  assert.equal(r.holds('swamps_n(p1, 2)'), true);
});

// ---------------------------------------------------------------------------
// whynot

test('whynot names the layer and the timestamp that overrode, and the fix works', () => {
  const r = model();
  assert.equal(ptOf(r, 'grizzly'), '3/3');
  const wn = r.whynot('pt(grizzly, 4, 4)', { depth: 2, nodes: 40 });
  assert.equal(wn.holds, false);

  // the missing +1/+1 is the anthem, and it is missing because of a colour
  const wn2 = r.whynot('mod73(grizzly, e_honor, 1, 1)', { depth: 2, nodes: 30 });
  assert.equal(wn2.holds, false);
  assert.match(wn2.text, /failed premise: co5\[main\]\(grizzly,white\)/);
  // and co5 fails because a later timestamp in layer 5 set the colour
  assert.equal(r.holds('addcol5(grizzly, white, e_painter)'), true);
  assert.equal(r.holds('clob5(grizzly, e_painter)'), true);
  assert.equal(r.holds('setcol5(grizzly, blue, e_wisps)'), true);
  assert.equal(r.holds('bef_ts(e_painter, e_wisps)'), true);

  // "what would have to differ" is not an assertion: make that change and
  // the creature is 4/4.
  const cf = counterfactual();
  assert.equal(cf.before, '3/3');
  assert.equal(cf.after, '4/4');
});

// ---------------------------------------------------------------------------
// counting

test('counting finds the order-dependent sublayers and only those', () => {
  const { sweeps: ss } = sweeps();
  const by = new Map(ss.map((s) => [`${s.layer}${s.scope ?? ''}`, s] as const));

  // layer 5: two effects, one adds a colour and one sets it -- the later wins
  const l5 = by.get('50')!;
  assert.equal(l5.orders, 2);
  assert.equal(l5.outcomes, 2, 'swap them and Grizzly Bears is a different size');
  // layer 6: four effects on one creature, a gain and a loss of the same
  // ability among them (CR 613.9 Example 1)
  const l6 = by.get('60')!;
  assert.equal(l6.effects.length, 4);
  assert.equal(l6.orders, 24);
  assert.ok(l6.outcomes > 1, 'gain/lose flying: order-dependent');
  // layer 7c: pure integer addition, hence commutative whatever the order
  const l7c = by.get('73gray_ogre')!;
  assert.equal(l7c.effects.length, 3);
  assert.equal(l7c.orders, 6);
  assert.equal(l7c.outcomes, 1, 'modifiers commute');
  assert.equal(l7c.verdict, 'stable');
  // layer 7b: two set-effects, but on different creatures, so no contest
  assert.equal(by.get('72')!.outcomes, 1);
  // layer 4 is the one the dependency rule rescues: one board under CR 613.8,
  // four under timestamp order (both land effects live, one, the other, or
  // neither, depending on where Blood Moon lands)
  assert.equal(by.get('40')!.outcomes, 1);
  assert.equal(by.get('40')!.naiveOutcomes, 4);
});

// ---------------------------------------------------------------------------
// state-based actions: the fixpoint above

test('state-based actions are a second fixpoint, and it takes more than one round', () => {
  const { rounds, final } = sbaFixpoint();
  assert.equal(rounds.length, 3, 'two deaths and a quiescent round');
  assert.deepEqual(rounds[0].died, ['archdruid'], 'Grasp of Darkness kills the lord');
  assert.deepEqual(rounds[1].died, ['grizzly'],
    'and losing the lord is what makes Grizzly Bears lethal');
  assert.deepEqual(rounds[2].died, []);
  // a single pass would have stopped after the first round with a live 1/1
  assert.ok(rounds[0].sizes.some((s) => s === 'grizzly 1/1'));
  assert.equal(final.holds('on_bf(grizzly)'), false);
  assert.equal(final.holds('on_bf(clone1)'), true, 'the Clone survives at 3/3');
  assert.equal(ptOf(final, 'clone1'), '3/3');
});

// ---------------------------------------------------------------------------
// the oracle

test('an independent implementation of CR 613 agrees on every board', () => {
  const { oracle } = sweeps();
  assert.deepEqual(oracle.mismatches, []);
  assert.deepEqual(oracle.orderMismatches, []);
  assert.ok(oracle.compared >= 40, `sample size: ${oracle.compared} boards`);
  assert.equal(oracle.orderChecks, oracle.compared - 1);
  for (const c of oracle.crExamples) {
    assert.equal(c.got, c.want, c.name);
  }
});

test('the oracle discriminates: it is not agreeing with everything', () => {
  // A differential oracle that agrees with every board proves nothing. Two
  // checks that it is actually sensitive.
  const r = leanWorld();
  const b = readBoard(r);
  assert.equal(oracleDigest(b), kernelDigest(r));

  // (1) it takes CR 613.8's side against the timestamp-only answer. The
  // kernel computes both; the oracle must match one and not the other.
  const swampsUnderTs = tuples(r, 'ty4n', 2)
    .filter((t) => t[1] === 'swamp').map((t) => t[0]).sort();
  const swampsUnderDep = tuples(r, 'ty4', 2)
    .filter((t) => t[1] === 'swamp').map((t) => t[0]).sort();
  assert.notDeepEqual(swampsUnderTs, swampsUnderDep, 'the two pipelines disagree');
  const swampsOracle = [...simulate(b).objs.values()]
    .filter((o) => o.types.has('swamp')).map((o) => o.id).sort();
  assert.deepEqual(swampsOracle, swampsUnderDep, 'the oracle sides with dependency');
  assert.notDeepEqual(swampsOracle, swampsUnderTs);

  // (2) change the board and the comparison notices: the OLD oracle answer
  // must stop matching the NEW kernel answer.
  const moved = Rofl.fromSnapshot(r.save());
  assert.equal(moved.retract('on_bf(blood_moon)').ok, true);
  moved.evaluate();
  assert.notEqual(oracleDigest(b), kernelDigest(moved), 'a stale answer is caught');
  assert.equal(oracleDigest(readBoard(moved)), kernelDigest(moved), 'and the new one matches');
  assert.equal(moved.holds('ty4(forest1, swamp)'), true,
    'with Blood Moon gone, Urborg does what it says');
});

test('the lean world used by the sweep agrees with the full world fact for fact', () => {
  assert.equal(leanAgrees(), true);
});
