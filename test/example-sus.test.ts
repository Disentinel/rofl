// example-sus.test.ts — social deduction as perspectives (examples/sus/).
//
// The properties that make this worth computing: contradicting claims coexist
// without a special case, a forged entry surfaces mechanically, the suspicion
// is a model count that an exhaustive enumeration confirms on all 168
// world-round decisions, the accusation crosses a declared standard of proof
// in round 3 and falls back under it in round 5, the annulment names WHICH
// link broke, and the same counts come out of a ticked store and an as-of one
// — which is a claim this file used to make in the opposite direction, and the
// place to look if the fold's tick semantics ever move again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { INFINITE } from '../runtime/semirings.ts';
import {
  asOf, world, simulate, counting, suspicion, shareOf, priceOf, ranking,
  claims, oracleCheck, allWorlds, domainFacts, col, pairs, PLAYERS, STANDARD,
  LAST_ROUND,
} from '../examples/sus/demo.ts';

const ROUNDS = [1, 2, 3, 4, 5, 6];
const worldsOf = (r: Rofl): string[] => col(r, 'consistent[worlds](W)', 'W');

test('the model loads clean, and every rule materialises bottom-up', () => {
  const r = asOf(3);
  for (const audit of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)',
    'undefined_premise[audit](R, Rel)']) {
    assert.deepEqual(r.query(audit).rows, [], audit);
  }
  // `leak` is empty because `collects(case)` is declared, not because nothing
  // crosses: the testimony rules read a speaker's book under the perspective
  // VARIABLE [P] and write [case], and the walk [P] -> [case] -> [worlds] has
  // no `imports` fact available to it -- `$var("P")` is not a registered
  // perspective. Checked positively, so the empty row above is a result.
  assert.ok(r.holds('collected[audit](case)'),
    'the collection declaration was EXERCISED, not merely written');
  const ev = new Evaluation(r.store);
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), [],
    'every rule must be range-restricted');
  assert.equal(ev.demandRels.size, 0, 'no relation may be evaluated top-down');
});

test('contradicting claims coexist, and the contradiction is the signal', () => {
  const r = asOf(LAST_ROUND);
  // the same relation, the same content shape, incompatible facts about the
  // world — and both hold, because their perspectives differ
  assert.ok(r.holds('said[pink](k5, saw(green, electrical), 2, 2)'));
  assert.ok(r.holds('said[green](k7, saw(green, cafeteria), 2, 2)'));
  // nothing was resolved away: both keys are in the store
  const keys = r.factKeys().filter((k) => k.startsWith('said['));
  assert.ok(keys.includes('said[pink](k5,saw(green,electrical),2,2)'));
  assert.ok(keys.includes('said[green](k7,saw(green,cafeteria),2,2)'));
  // and the engine derives the pair as a first-class fact rather than an error
  assert.ok(r.holds('clash[case](k5, k7)'));
  assert.deepEqual(pairs(r, 'clash[case](K1, K2)', 'K1', 'K2').sort(),
    [['k14', 'k15'], ['k5', 'k7'], ['k6', 'k7'], ['k7', 'k10']].sort());
  // the program is still a program: queries answer, no audit fires
  assert.deepEqual(r.query('unstratified(X)').rows, []);
  assert.equal(worldsOf(r).length, 1);
});

test('a claim written into somebody else\'s ledger is forged, mechanically', () => {
  const clean = world();
  assert.deepEqual(col(clean, 'forged[audit](F)', 'F'), [], 'the table starts honest');
  const r = world();
  const res = r.load('said[green](k99, saw(pink, reactor), 2, 6) @init.', { who: 'pink' });
  assert.equal(res.ok, true, res.diagnostics.join('; '));
  const forged = col(r, 'forged[audit](F)', 'F');
  assert.equal(forged.length, 1, 'exactly the impostor entry');
  assert.match(forged[0], /^\$fact\(said,green,/);
  // nothing in the rules mentions forgery: it falls out of authority/2
  assert.ok(r.holds('authority(green, green)'));
  assert.ok(!r.holds('authority(green, pink)'));
});

test('the world space is 28, and the counting semiring counts worlds', () => {
  assert.equal(allWorlds(PLAYERS).length, 28);
  for (const n of ROUNDS) {
    const r = asOf(n);
    assert.equal(col(r, 'world[worlds](W)', 'W').length, 28, `round ${n}: the space`);
    const rows = worldsOf(r).length;
    const value = counting(r).value;
    // one derivation of outcome(any, P) per consistent world, for every P
    for (const p of PLAYERS) {
      assert.equal(value.get(`outcome[case](any,${p})`), BigInt(rows),
        `round ${n}: outcome(any, ${p}) counts the consistent worlds`);
      const guilty = col(r, `guilty_in[worlds](${p}, W)`, 'W').length;
      assert.equal(value.get(`outcome[case](guilty,${p})`) ?? 0n, BigInt(guilty),
        `round ${n}: outcome(guilty, ${p}) counts the guilty worlds`);
    }
  }
});

test('the oracle: 28 worlds x 6 rounds, decided twice, agreeing everywhere', () => {
  const oc = oracleCheck(ROUNDS);
  assert.equal(oc.decisions, 168, 'sample size');
  assert.deepEqual(oc.disagreements, []);
  assert.equal(oc.verdictMismatch, 0);
  assert.equal(oc.countMismatch, 0);
  assert.deepEqual(oc.perRound.map((x) => x.consistent), [22, 9, 5, 5, 2, 1]);
});

test('the arc: accuse in round 3, still accusing in 4, withdrawn in 5', () => {
  const share = ROUNDS.map((n) => shareOf(asOf(n), 'green'));
  assert.deepEqual(share.map((s) => `${s.guilty}/${s.total}`),
    ['6/22', '5/9', '5/5', '4/5', '1/2', '0/1']);
  const accuses = share.map((s) => s.share >= STANDARD);
  assert.deepEqual(accuses, [false, false, true, true, false, false],
    'the standard of proof is crossed in round 3 and lost in round 5');
  // and the withdrawal is not the engine changing its mind about the same
  // evidence: the evidence changed under it
  assert.ok(asOf(5).holds('exposed[public](pink, traitor, 5)'));
  assert.ok(!asOf(4).holds('annulled[case](k9, unmasked)'));
  assert.ok(asOf(5).holds('annulled[case](k9, unmasked)'));
});

test('which link broke: each accuser\'s case fails separately', () => {
  const r3 = asOf(3);
  const r4 = asOf(4);
  const r5 = asOf(5);
  // three separate cases against green, one per accuser
  assert.deepEqual(col(r3, 'case_against[case](green, P)', 'P').sort(),
    ['cyan', 'pink', 'red']);
  // round 3: nothing is annulled yet
  assert.deepEqual(col(r3, 'at_risk[case](X)', 'X'), []);
  assert.deepEqual(col(r3, 'shaken[case](X)', 'X'), []);
  // round 4: red takes back k10, and red's case — and only red's — collapses
  assert.deepEqual(col(r4, 'at_risk[case](X)', 'X'), ['case_against(green,red)']);
  assert.ok(r4.holds('annulled[case](k10, withdrawn)'));
  // round 5: pink is unmasked, and pink's case collapses too
  assert.deepEqual(col(r5, 'at_risk[case](X)', 'X').sort(),
    ['case_against(green,pink)', 'case_against(green,red)']);
  assert.deepEqual(col(r5, `leaf[case](case_against(green, pink), K)`, 'K').sort(),
    ['k5', 'k9']);
  // cyan's case is untouched, which is why the finding is shaken, not dead
  assert.ok(!r5.holds('at_risk[case](case_against(green, cyan))'));
  assert.ok(r5.holds('shaken[case](finding(green))'));
  // and the mark reaches the DECISION the table took, transitively
  assert.ok(r5.holds('rests_on[case](ejection(green), finding(green))'));
  assert.ok(r5.holds('rests_on[case](ejection(green), k9)'), 'transitive closure');
  assert.ok(r5.holds('shaken[case](ejection(green))'),
    'the round-3 ejection is marked, not silently rewritten');
});

test('unmasking a liar changes no count: the model had already priced it', () => {
  // Every world that pink's claims refuted is a world in which pink is CREW.
  // So when the reveal says pink is a traitor, those refutations were never
  // load-bearing in any surviving world, and annulling them is narration.
  const r4 = asOf(4);
  const pinks = claims(r4).filter((c) => c.by === 'pink').map((c) => c.id);
  assert.deepEqual(pinks, ['k5', 'k9']);
  // a sighting never refutes on its own; it refutes as half of a clash
  const reasons = [...new Set(col(r4, 'refuted_by[worlds](W, R)', 'R'))]
    .filter((x) => pinks.some((k) => x === k || x.startsWith(`clash(${k},`) || x.endsWith(`,${k})`)));
  assert.deepEqual(reasons.sort(), ['clash(k5,k7)', 'k9']);
  for (const reason of reasons) {
    const refuted = col(r4, `refuted_by[worlds](W, ${reason})`, 'W');
    assert.ok(refuted.length > 0, `${reason} refutes something at round 4`);
    for (const w of refuted) {
      assert.ok(r4.holds(`crew_in[worlds](${w}, pink)`),
        `${reason} refutes ${w} only because pink is crew there`);
    }
  }
  // The withdrawal is the opposite: it restores worlds, including the true one.
  const before = new Set(worldsOf(asOf(3)));
  assert.ok(!before.has('w(pink,cyan)'), 'k10 ruled the true world out');
  assert.ok(worldsOf(r4).includes('w(pink,cyan)'), 'taking k10 back lets it back in');
});

test('whynot green, and the price of the accusation', () => {
  const r = asOf(LAST_ROUND);
  assert.equal(shareOf(r, 'green').guilty, 0n, 'green cannot be a traitor');
  const price = priceOf(r, 'green');
  assert.equal(price.length, 7, 'seven worlds would make green a traitor');
  for (const p of price) {
    assert.ok(p.blockers.length > 0, `${p.world} must be blocked by something`);
    assert.ok(!r.holds(`consistent[worlds](${p.world})`));
  }
  // the cheapest route is one retraction, and it is the game log itself
  assert.deepEqual(price[0], { world: 'w(green,cyan)', blockers: ['reveal(pink)'] });
  // if the log stands, the price is two players' words
  const claimOnly = price.filter((p) => p.blockers.every((b) => !b.startsWith('reveal')
    && !b.startsWith('victim')));
  assert.deepEqual(claimOnly[0], { world: 'w(green,pink)', blockers: ['clash(k14,k15)', 'k16'] });
  // and the kernel's own whynot bottoms out on the same blocked premise
  const w = r.whynot('guilty_in[worlds](green, w(green, lime))', { depth: 4 });
  assert.equal(w.holds, false);
  assert.match(w.text, /blocked: impossible\[worlds\]\(w\(green,lime\)\) holds/);
});

test('an unfalsifiable claim is visible as one: it refutes nothing', () => {
  const r = asOf(LAST_ROUND);
  const alone = claims(r).filter((c) => c.content === 'alone').map((c) => c.id);
  assert.deepEqual(alone, ['k2', 'k8', 'k13'], 'three self-alibis');
  for (const k of alone) {
    assert.ok(r.holds(`claim[case](${k}, P, A, T)`), `${k} is on the record`);
    assert.deepEqual(col(r, `refuted_by[worlds](W, ${k})`, 'W'), [],
      `${k} rules out no world`);
    assert.deepEqual(col(r, `points_at[case](Q, ${k})`, 'Q'), [],
      `${k} puts nobody in the frame`);
  }
  // excising one changes nothing about who could be a traitor
  const ex = r.excise('said[red](k2, alone, 1, 1)');
  assert.equal(ex.ok, true, ex.error);
  const load = /^(refuted_by|impossible|consistent|guilty_in|outcome|price|incriminates)\[/;
  assert.deepEqual(ex.removed.filter((k) => load.test(k)), []);
  assert.deepEqual(ex.added.filter((k) => load.test(k)), []);
});

test('excising a claim restores exactly the worlds the rules attribute to it', () => {
  // green's own denial is the sole thing standing between four worlds and
  // consistency — the worlds in which pink is a traitor. Take it away and the
  // engine must let exactly those four back, no more and no fewer.
  const r = asOf(3);
  const mine = (reason: string) =>
    reason === 'k7' || reason.startsWith('clash(k7,') || reason.endsWith(',k7)');
  const soleBlocker = col(r, 'world[worlds](W)', 'W').filter((w) =>
    r.holds(`impossible[worlds](${w})`)
    && col(r, `refuted_by[worlds](${w}, R)`, 'R').every(mine)).sort();
  assert.deepEqual(soleBlocker,
    ['w(blue,pink)', 'w(pink,black)', 'w(pink,cyan)', 'w(pink,lime)']);
  const ex = r.excise('said[green](k7, saw(green, cafeteria), 2, 2)');
  assert.equal(ex.ok, true, ex.error);
  const names = ex.added.filter((k) => k.startsWith('consistent[worlds]('))
    .map((k) => k.slice('consistent[worlds]('.length, -1)).sort();
  assert.deepEqual(names, soleBlocker,
    'the blast radius is the set the rules attribute to k7');
  // the original store is untouched: excise re-evaluates a scratch copy
  assert.equal(col(r, 'consistent[worlds](W)', 'W').length, 5);
});

test('the ticked store and the as-of store agree, on the facts and on the counts', () => {
  // counts at EVERY round, not only the one the transcript prints: the claim
  // is that the fold is indifferent to how the round was reached, and one
  // round cannot carry that. Memoised, so the later simulate() calls reuse it.
  const trace = simulate([...ROUNDS]);
  for (const n of ROUNDS) {
    // the Boolean world is the same either way
    assert.deepEqual(domainFacts(asOf(n)), trace.facts.get(n)!,
      `round ${n}: ticked and as-of hold the same domain facts`);
    // ... and so is the count. It was not: `fact @next :- fact` makes every
    // carried fact its own support one tick back, and the CLOSED counting
    // semiring read that self-loop as "infinitely many" for everything past
    // tick 0. The fold is about one tick now, so a carried fact is a given.
    const ticked = trace.counts.get(n)!;
    const asof = counting(asOf(n));
    const keys = domainFacts(asOf(n));
    const differ = keys.filter((k) => ticked.value.get(k) !== asof.value.get(k));
    assert.deepEqual(differ, [], `round ${n}: every domain fact counts the same either way`);
    assert.equal(ticked.cyclic, asof.cyclic,
      `round ${n}: the ticks add no support cycles the as-of store does not have`);
    // the control, per round: the agreement is not "everything is one", and it
    // is not "everything is INFINITE" either — a fold that walked nothing, or
    // one that closed every cycle, would also make the two stores agree
    const shape = new Set(keys.map((k) => String(ticked.value.get(k))));
    assert.ok(shape.size >= 3, `round ${n}: the counts have shape (${[...shape].join(',')})`);
    assert.equal(keys.some((k) => ticked.value.get(k) === INFINITE), false,
      `round ${n}: nothing in the domain is uncountable`);
  }
  // and the numbers the README quotes, at the round the transcript prints
  const asof3 = counting(asOf(3)).value;
  assert.equal(asof3.get('outcome[case](any,green)'), 5n);
  assert.equal(asof3.get('outcome[case](guilty,green)'), 5n);
  assert.equal(asof3.get('consistent[worlds](w(blue,green))'), 1n);
});

test('a past tick answers what WAS derived, not what could have been asked', () => {
  const sim = simulate().final;
  assert.equal(sim.store.tick, LAST_ROUND - 1);
  const at = (t: number) => sim.query(`derived_by(F, R, ${t})`).rows
    .map((x) => x.bindings.F).filter((f) => f.startsWith('$fact(refuted_by,'));
  assert.ok(at(2).length > 0, 'tick 2 froze its refutations');
  assert.ok(at(4).length > 0, 'so did tick 4');
  assert.notEqual(at(2).length, at(4).length, 'and they are different sets');
  // the tick-scoped facts themselves are gone: only the current round is live
  assert.deepEqual(col(sim, 'now[public](T)', 'T'), [String(LAST_ROUND)]);
  assert.deepEqual(worldsOf(sim), ['w(pink,cyan)']);
});

test('Viterbi ranks the worlds the Boolean answer already admits, and no others', () => {
  for (const n of [3, 5]) {
    const r = asOf(n);
    const ranked = ranking(r);
    assert.deepEqual(ranked.map((x) => x.world).sort(), worldsOf(r).sort(),
      `round ${n}: the ranking is over exactly the consistent worlds`);
    const mass = ranked.reduce((a, x) => a + x.probability, 0);
    assert.ok(Math.abs(mass - 1) < 1e-9, 'the shares are normalised');
    for (let i = 1; i < ranked.length; i++) {
      assert.ok(ranked[i - 1].probability >= ranked[i].probability, 'sorted');
    }
  }
  assert.equal(ranking(asOf(5))[0].world, 'w(pink,cyan)', 'and it is the true world');
  // the prior never moves a Boolean verdict
  const r5 = asOf(5);
  assert.equal(worldsOf(r5).length, 2);
  assert.ok(r5.holds('consistent[worlds](w(green,pink))'),
    'the world Viterbi ranks second is still possible');
});

test('suspicion is a share, and every share is a ratio of counted worlds', () => {
  const r = asOf(3);
  const s = suspicion(r);
  assert.equal(s.length, 8);
  const total = worldsOf(r).length;
  for (const x of s) {
    assert.equal(Number(x.total), total);
    assert.equal(x.share, Number(x.guilty) / total);
  }
  // the two dead players and the vouched-for red are impossible; green is certain
  assert.deepEqual(s.filter((x) => x.guilty === 0n).map((x) => x.player).sort(),
    ['red', 'white']);
  assert.equal(s.find((x) => x.player === 'green')!.share, 1);
});
