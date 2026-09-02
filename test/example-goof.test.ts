// example-goof.test.ts — one rule set over nine foundations (examples/goof/).
//
// The properties that make this worth computing: the rules name no foundation
// and substituting one in derives exactly the same facts, the counting
// semiring answers "how many parallels" with 1, 0 and infinitely many from the
// same four rules, the provenance polynomial decides which theorems need the
// fifth postulate and an exhaustive enumeration of all 2^n axiom subsets
// confirms it, the angle sum comes out of the area law and out of the cut tree
// with the same number, a book that holds a contradiction explodes only if it
// holds ex_falso, and every one of those claims is checked against a complete
// oracle rather than against numbers a previous run happened to produce.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Evaluation } from '../src/engine.ts';
import { INFINITE } from '../runtime/semirings.ts';
import {
  MODEL, RULES_MARKER, world, expandedWorld, domainFacts, books, axiomsOf, theoremsOf,
  derivedIn, onlyIn, clauses, ledgerVars, expandRules, counting, parallelCount,
  unfoldingProbe, provenance, supportOf, necessaryAxioms, corpusOf, closure,
  subsetClosures, minimalSupports, oracleCheck, col, pairs,
} from '../examples/goof/demo.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// one full fixpoint, shared: every arm below only reads it
const r = world();
const BOOKS = books(r).map((b) => b.name);
const RULES = MODEL.slice(MODEL.indexOf(RULES_MARKER) + RULES_MARKER.length);

/** The headline demonstration, pinned line for line. Saccheri spent thirty
 *  years looking for this answer. The rule ids in it are content hashes of
 *  goof.rofl's clauses, so editing thm/1, holds_from/2 or the explosion rule
 *  forces this expectation — and the README and page that quote it — to be
 *  redone. */
const HEADLINE = [
  'whynot thm[saccheri](angle_sum_180):',
  '  rule rac159495: thm[?G](?P)@now :- axiom[?G](?P)@now',
  '    failed premise: axiom[saccheri](angle_sum_180)',
  '  rule r7cb3920d: thm[?G](?P)@now :- explodes[?G](?P)@now',
  '    failed premise: explodes[saccheri](angle_sum_180)',
  '  rule r9749238b: thm[?G](?P)@now :- step[main](?S,?P)@now, holds_from[?G](?S,1)@now',
  '    failed premise: holds_from[saccheri](s_playfair,1)',
];

test('the model loads clean, and every rule materialises bottom-up', () => {
  for (const audit of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'forged[audit](F)', 'unmoded[audit](R)', 'undefined_premise[audit](R, Rel)']) {
    assert.deepEqual(r.query(audit).rows, [], audit);
  }
  const ev = new Evaluation(r.store);
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), [],
    'every rule must be range-restricted');
  assert.equal(ev.demandRels.size, 0, 'no relation may be evaluated top-down');
  assert.equal(books(r).length, 9);
});

test('a rule uniform in the ledger is no leak, and the audit still bites', () => {
  // A rule that reads and writes the SAME perspective variable carries one
  // term at both ends of the reflection -- `$var("G")` -- so boot.rofl sees
  // no crossing. This example is what paid for that: while every variable
  // perspective collapsed to the single atom `$any`, the two ends were
  // indistinguishable, `leak[audit]($any, $any)` fired, and there was no way
  // to declare the bridge. That row was the ONE cost of the thesis and it is
  // now gone; the reflection records which variable it is.
  // Empty -- and empty because of a DECLARATION, which is checked here rather
  // than inferred from the zero. Three walks cross out of a ledger variable
  // in this file (`$var("G") -> audit`, `$var("H") -> audit`, and
  // `$var("H") -> $var("G")`, one foundation's content reaching another's),
  // and not one of them can be an `imports` fact: that relates two REGISTERED
  // perspectives and a ledger variable has no `authority` fact. `collects(main)`
  // is the sentence that can, said at the ledger that actually gathers --
  // `proposition[main](P) :- axiom[G](P)` pools all nine axiom sets into one
  // language, which is half the thesis.
  assert.deepEqual(pairs(r, 'leak[audit](A, B)', 'A', 'B'), []);
  assert.ok(r.holds('collected[audit](main)'),
    'the collection declaration was EXERCISED, not merely written');
  const reads = r.query('reads_from(R, A)').rows.map((x) => x.bindings['A']);
  assert.ok(reads.includes('$var("G")'), 'the ledger variable is recorded as itself');
  assert.ok(!reads.includes('$any'), 'no variable perspective collapses to a wildcard');
  // POSITIVE CONTROL. An audit that never fires is an assumption with an
  // audit's interface: plant a rule that really does read one book and write
  // somewhere else, and the row appears, named.
  const planted = world();
  assert.equal(planted.load('sneak(P) :- axiom[euclid](P).', { who: 'goof' }).ok, true);
  const planted_rows = pairs(planted, 'leak[audit](A, B)', 'A', 'B')
    .filter(([a]) => a === 'euclid');
  // the crossing itself, plus the two walks it opens now that the flow graph
  // is closed: [main] is read by boot.rofl's audit rules and by every
  // ledger-polymorphic rule in this file, so a book that reaches [main]
  // reaches [audit] and every book from there. AND THE COLLECTION DECLARATION
  // DOES NOT COVER IT: `collects(main)` licenses gathering from ledgers
  // [main] cannot name, and `euclid` is a registered ledger with an
  // `authority` fact, so the audit still says no about it. A declaration that
  // silenced this row would be an off switch.
  assert.deepEqual(planted_rows,
    [['euclid', '$var("G")'], ['euclid', 'audit'], ['euclid', 'main']]);
});

test('the rules name no foundation, and the ledger variable is the only one', () => {
  const cs = clauses(RULES);
  assert.ok(cs.length >= 20, `expected a rule set, got ${cs.length} clauses`);
  for (const c of cs) {
    assert.match(c, /:-/, `everything after ${RULES_MARKER} must be a rule: ${c}`);
    for (const b of BOOKS) {
      assert.ok(!c.includes(`[${b}]`), `rule names the book ${b}: ${c}`);
    }
    // The expansion substitutes a ledger variable WHOLE-WORD, because
    // `only_in` passes the books it compares as arguments. So G and H may
    // never be used as ordinary variables: a clause mentioning either must
    // also carry it in a perspective slot, or the substitution would rewrite
    // something that is not a ledger.
    for (const v of ['G', 'H']) {
      if (!new RegExp(`\\b${v}\\b`).test(c)) continue;
      assert.ok(ledgerVars(c).includes(v),
        `${v} is used as an ordinary variable in: ${c}`);
    }
  }
  assert.deepEqual([...new Set(cs.flatMap(ledgerVars))].sort(), ['G', 'H']);
});

test('substituting the ledger away derives the same facts, at nine times the rules', () => {
  const ex = expandedWorld();
  assert.deepEqual(domainFacts(ex), domainFacts(r),
    'the expanded program must derive exactly the same domain facts');
  // AND THE EXPANSION SHOWS WHAT THE ONE DECLARATION IS WORTH. With every
  // ledger variable substituted away there is not a `$var` left in the
  // program, so nothing here is an artefact of how a variable perspective is
  // reflected -- and the audit reports 81 rows: nine books, each reaching the
  // eight others and [audit]. Those are the same crossings `collects(main)`
  // declares over the polymorphic program, spelled out one pair at a time.
  // The route is `only_in[main](G, H, A)` reading book H, and `explodes[G](P)
  // :- ..., proposition[main](P)` writing book G; and it CARRIES: [frege]
  // explodes, and four axioms belonging to other books are theorems of
  // [frege] because `proposition[main]` pools all nine axiom sets into one
  // language.
  //
  // `collects` cannot help the expansion, and should not: every source there
  // is a NAMED ledger, so the honest declaration for the expanded program is
  // 72 `imports` facts. That is the trade this test measures, now in a second
  // currency -- the expansion multiplies rules by ten AND turns one true
  // sentence about [main] into 72 about pairs of books.
  const exLeaks = ex.query('leak[audit](A, B)').rows
    .map((x) => [x.bindings['A'], x.bindings['B']]);
  assert.equal(exLeaks.length, 81, 'nine books times eight others plus [audit]');
  assert.equal(exLeaks.filter(([, b]) => b === 'audit').length, 9);
  assert.equal(new Set(exLeaks.map(([a]) => a)).size, 9, 'every book is a source');
  assert.deepEqual(exLeaks.filter(([a, b]) => a.startsWith('$') || b.startsWith('$')), [],
    'nothing polymorphic survives the expansion, so nothing here is an artefact');
  assert.deepEqual(new Evaluation(ex.store).rules.filter((x) => !x.safe).map((x) => x.canon), []);
  const exp = expandRules(RULES, BOOKS);
  assert.equal(exp.before, 28);
  assert.equal(exp.after, 292, '24 polymorphic clauses over 9 books, one of them over pairs');
  assert.equal(Math.max(...exp.perClause.values()), 81, 'only_in ranges over pairs of books');
});

test('one axiom separates Euclid from Lobachevsky, and two separate him from Riemann', () => {
  assert.deepEqual(onlyIn(r, 'euclid', 'lobachevsky'), ['post5_unique']);
  assert.deepEqual(onlyIn(r, 'lobachevsky', 'euclid'), ['post5_many']);
  assert.deepEqual(onlyIn(r, 'euclid', 'riemann'), ['post2_extend', 'post5_unique']);
  assert.deepEqual(onlyIn(r, 'euclid', 'saccheri'), ['post5_unique']);
  assert.deepEqual(onlyIn(r, 'saccheri', 'euclid'), [], 'neutral geometry adds nothing');
  assert.deepEqual(onlyIn(r, 'euclid', 'brouwer'), ['excluded_middle']);
  assert.deepEqual(onlyIn(r, 'solid', 'schlafli'), ['dim_space']);
  assert.deepEqual(onlyIn(r, 'frege', 'dacosta'), ['ex_falso']);
});

test('how many parallels: one, none, infinitely many — from the same four rules', () => {
  assert.deepEqual(parallelCount(r, 'euclid'), { book: 'euclid', witnesses: ['sole'], total: 1n });
  assert.deepEqual(parallelCount(r, 'riemann'), { book: 'riemann', witnesses: [], total: 0n });
  const hyp = parallelCount(r, 'lobachevsky');
  assert.deepEqual(hyp.witnesses, ['interior', 'limit_a', 'limit_b']);
  assert.equal(hyp.total, INFINITE);
  assert.equal(counting(r).value.get('parallel[lobachevsky](limit_a)'), 1n,
    'a limiting parallel comes straight from the axiom: one derivation');
  assert.equal(counting(r).value.get('parallel[lobachevsky](interior)'), INFINITE,
    'the construction between two parallels feeds on its own output');
  // riemann loses parallels twice over: it denies them AND cannot prove I.31,
  // because that proof rests on I.16, which rests on postulate 2
  assert.equal(r.holds('thm[riemann](parallel_exists)'), false);
  assert.equal(r.holds('thm[saccheri](parallel_exists)'), true, 'existence is neutral');
  assert.deepEqual(col(r, 'parallel[saccheri](X)', 'X'), [],
    'neutral geometry proves a parallel exists and cannot say how many');
});

test('INFINITE is a divergence, not a fold that gave up', () => {
  // POSITIVE CONTROL for the CLOSED discipline: refuse to close the cycle and
  // count derivations of height at most n. A real divergence grows; a fact
  // with one derivation does not.
  const probe = unfoldingProbe(r, ['parallel[lobachevsky](interior)', 'parallel[euclid](sole)'],
    [10, 15, 20]);
  assert.deepEqual(probe.map((p) => p.counts[1]), ['1', '1', '1'], 'euclid is fixed by depth 10');
  const hyp = probe.map((p) => BigInt(p.counts[0]));
  assert.equal(hyp[0], 0n, 'the chain is deeper than ten support levels');
  assert.ok(hyp[2] > hyp[1] && hyp[1] > 0n, `expected growth, got ${hyp.join(' ')}`);
});

test('the polynomial decides which theorems need the fifth postulate', () => {
  const prov = provenance(r);
  const needs = (g: string, p: string) => necessaryAxioms(prov, `thm[${g}](${p})`, g);
  assert.deepEqual(needs('euclid', 'pons_asinorum'), ['post1_two_points', 'post4_right_angles']);
  assert.deepEqual(needs('euclid', 'angle_sum_180'),
    ['post1_two_points', 'post2_extend', 'post4_right_angles', 'post5_unique']);
  assert.ok(needs('euclid', 'pythagoras').includes('post5_unique'));
  assert.ok(!needs('euclid', 'parallel_exists').includes('post5_unique'),
    'I.31 proves a parallel exists without the fifth postulate');
  // the two non-euclidean books reach the same theorem through different axioms
  assert.deepEqual(needs('lobachevsky', 'aaa_congruence').filter((a) => a.startsWith('post')),
    ['post1_two_points', 'post2_extend', 'post4_right_angles', 'post5_many']);
  assert.deepEqual(needs('riemann', 'aaa_congruence').filter((a) => a.startsWith('post')),
    ['post1_two_points', 'post2_finite', 'post5_none']);
  const dependent = derivedIn(r, 'euclid')
    .filter((p) => needs('euclid', p).includes('post5_unique')).sort();
  assert.deepEqual(dependent, ['angle_sum_180', 'pythagoras', 'rectangle_exists',
    'similar_triangles_exist', 'thales_semicircle']);
});

test('excising the fifth postulate takes exactly its dependents with it', () => {
  const prov = provenance(r);
  const dependent = derivedIn(r, 'euclid')
    .filter((p) => necessaryAxioms(prov, `thm[euclid](${p})`, 'euclid').includes('post5_unique'));
  const ex = r.excise('axiom[euclid](post5_unique)');
  assert.equal(ex.ok, true, ex.error);
  const gone = ex.removed.filter((k) => k.startsWith('thm[euclid]('))
    .map((k) => k.slice('thm[euclid]('.length, -1)).sort();
  assert.deepEqual(gone, ['angle_sum_180', 'post5_unique', 'pythagoras', 'rectangle_exists',
    'similar_triangles_exist', 'thales_semicircle']);
  assert.deepEqual(gone.filter((p) => p !== 'post5_unique'), dependent.sort(),
    'the blast radius is exactly the set the polynomial attributes to the axiom');
  // and nothing about the other books moves — except that the relation which
  // compares two books now notices five of them holding an axiom Euclid lost
  assert.deepEqual(ex.removed.filter((k) => /^thm\[(lobachevsky|riemann|saccheri)\]/.test(k)), []);
  assert.deepEqual(ex.added.filter((k) => !k.startsWith('only_in[')), []);
  assert.deepEqual(ex.added.map((k) => k.slice('only_in[main]('.length).split(',')[0]).sort(),
    ['brouwer', 'dacosta', 'frege', 'schlafli', 'solid']);
  assert.equal(theoremsOf(r, 'euclid').length, 24, 'excise re-evaluates a scratch copy');
});

test('Riemann pays for postulate 2, and the neutral tower goes with it', () => {
  const prov = provenance(r);
  const lost = derivedIn(r, 'euclid').filter((p) => !r.holds(`thm[riemann](${p})`));
  assert.ok(lost.includes('exterior_angle'), 'Euclid I.16 is false on a sphere');
  const neutralLost = lost.filter((p) => {
    const need = necessaryAxioms(prov, `thm[euclid](${p})`, 'euclid');
    return need.includes('post2_extend') && !need.includes('post5_unique');
  }).sort();
  assert.deepEqual(neutralLost, ['all_or_none', 'alternate_angles_parallel',
    'angle_sum_at_most_180', 'exterior_angle', 'parallel_exists'],
    'five neutral theorems, lost to a change nobody counts as part of the parallel debate');
  // and the elliptic branch reaches its own angle-sum law without any of them
  assert.ok(r.holds('thm[riemann](excess_proportional_to_area)'));
  assert.ok(!r.holds('thm[riemann](angle_sum_at_most_180)'));
});

test('the angle sum is a function of area, derived twice and agreeing', () => {
  const sums = (g: string, t: string) =>
    col(r, `angle_sum[${g}](${t}, S)`, 'S').map(Number).sort((a, b) => a - b);
  assert.deepEqual(col(r, 'law[euclid](K)', 'K'), ['0']);
  assert.deepEqual(col(r, 'law[lobachevsky](K)', 'K'), ['1']);
  assert.deepEqual(col(r, 'law[riemann](K)', 'K'), ['-1']);
  assert.deepEqual(col(r, 'law[saccheri](K)', 'K'), [],
    'neutral geometry does not determine the angle sum');
  assert.deepEqual(sums('saccheri', 't_whole'), []);
  // defect and excess are exactly the area, in these units
  assert.deepEqual(sums('euclid', 't_whole'), [180]);
  assert.deepEqual(sums('lobachevsky', 't_whole'), [168]);
  assert.deepEqual(sums('riemann', 't_whole'), [192]);
  assert.deepEqual(['t_a', 't_b', 't_left', 't_right', 't_whole'].map((t) => sums('lobachevsky', t)[0]),
    [178, 177, 175, 173, 168]);
  // the compound triangle is derived once from its own area and once per way
  // of composing it out of the cut tree, by rules sharing nothing
  assert.equal(counting(r).value.get('angle_sum[euclid](t_whole,180)'), 3n);
  assert.equal(counting(r).value.get('angle_sum[lobachevsky](t_whole,168)'), 3n);
});

test('disagree is a gate that says no, and only where a book holds two laws', () => {
  for (const g of ['euclid', 'lobachevsky', 'riemann', 'saccheri', 'solid', 'schlafli', 'brouwer']) {
    assert.deepEqual(r.query(`disagree[${g}](T, S1, S2)`).rows, [], `${g} must be consistent`);
  }
  // ... and it is not empty because nothing can make it fire: the two books
  // that prove two contradictory angle-sum laws hold two sums at once
  assert.ok(r.query('disagree[dacosta](T, S1, S2)').rows.length > 0);
  assert.ok(r.query('disagree[frege](T, S1, S2)').rows.length > 0);
  assert.deepEqual(col(r, 'law[dacosta](K)', 'K').sort(), ['0', '1']);
  // similarity, derived: where the sum depends on the area, two triangles of
  // different size cannot share their angles
  assert.deepEqual(pairs(r, 'similar_possible[euclid](A, B)', 'A', 'B'), [['t_left', 't_whole']]);
  assert.deepEqual(pairs(r, 'similar_possible[lobachevsky](A, B)', 'A', 'B'), []);
  assert.deepEqual(col(r, 'size_shows[lobachevsky](A, B, D)', 'D'), ['7']);
  assert.equal(r.holds('thm[lobachevsky](aaa_congruence)'), true);
  assert.equal(r.holds('thm[euclid](aaa_congruence)'), false);
});

test('Saccheri: thirty years, and the answer is one axiom', () => {
  const w = r.whynot('thm[saccheri](angle_sum_180)', { depth: 1 });
  assert.equal(w.holds, false);
  assert.deepEqual(w.text.split('\n'), HEADLINE);
  const drill = r.whynot('holds_from[saccheri](s_playfair, 1)', { depth: 3, nodes: 24 });
  assert.match(drill.text, /failed premise: thm\[saccheri\]\(post5_unique\)/);
  assert.match(drill.text, /failed premise: axiom\[saccheri\]\(post5_unique\)/);
  assert.match(drill.text, /no rule concludes 'axiom' and no matching base fact exists/);
});

test('Brouwer loses exactly the theorems whose only proof is a reductio', () => {
  const lost = derivedIn(r, 'euclid').filter((p) => !r.holds(`thm[brouwer](${p})`)).sort();
  assert.deepEqual(lost, ['all_or_none', 'angle_sum_at_most_180']);
  assert.deepEqual(pairs(r, 'reductio_needed[main](P, S)', 'P', 'S').sort(),
    [['all_or_none', 's_legendre2'], ['angle_sum_at_most_180', 's_sacc_leg']]);
  // the geometry is untouched: Euclid's own route to the angle sum survives
  assert.ok(r.holds('thm[brouwer](angle_sum_180)'));
  assert.ok(r.holds('thm[brouwer](pythagoras)'));
  const w = r.whynot('holds_from[brouwer](s_sacc_leg, 1)', { depth: 4, nodes: 20 });
  assert.match(w.text, /failed premise: thm\[brouwer\]\(excluded_middle\)/);
  assert.match(w.text, /failed premise: axiom\[brouwer\]\(excluded_middle\)/);
});

test('Frege explodes and da Costa does not, and the difference is one axiom', () => {
  const props = col(r, 'proposition[main](P)', 'P');
  assert.equal(theoremsOf(r, 'frege').length, props.length, 'every sentence is a theorem');
  assert.ok(theoremsOf(r, 'dacosta').length < props.length);
  assert.ok(r.query('clash[dacosta](A, B)').rows.length > 0, 'the contradiction is there');
  assert.deepEqual(col(r, 'explodes[dacosta](P)', 'P'), [], 'and it stays local');
  assert.equal(col(r, 'explodes[frege](P)', 'P').length, props.length);
  // what da Costa's book still cannot prove is what needs axioms it does not hold
  const never = props.filter((p) => !r.holds(`thm[dacosta](${p})`)).sort();
  assert.deepEqual(never, ['dim_four', 'dim_space', 'every_knot_unties', 'ex_falso',
    'excess_positive', 'excess_proportional_to_area', 'knots_exist', 'post2_finite',
    'post5_none']);
  // the explosion is a rule in goof.rofl, not a property of the engine
  assert.ok(RULES.includes('explodes[G](P) :- clash[G](_, _), axiom[G](ex_falso)'));
});

test('the trefoil is knotted in three dimensions and unties in four', () => {
  assert.deepEqual(pairs(r, 'knot_state[euclid](K, S)', 'K', 'S'), [['trefoil', 'unknottable']]);
  assert.deepEqual(pairs(r, 'knot_state[solid](K, S)', 'K', 'S'), [['trefoil', 'knotted']]);
  assert.deepEqual(pairs(r, 'knot_state[schlafli](K, S)', 'K', 'S'), [['trefoil', 'unties']]);
  assert.deepEqual(onlyIn(r, 'schlafli', 'solid'), ['dim_four']);
});

test('an axiom written into another man\'s book is forged, mechanically', () => {
  assert.deepEqual(col(r, 'forged[audit](F)', 'F'), [], 'the library starts honest');
  const forger = world();
  assert.equal(forger.load('axiom[euclid](post5_many).', { who: 'lobachevsky' }).ok, true);
  const forged = col(forger, 'forged[audit](F)', 'F');
  assert.equal(forged.length, 1, 'exactly the impostor entry');
  assert.match(forged[0], /^\$fact\(axiom,euclid,/);
  // nothing in goof.rofl mentions forgery: it falls out of authority/2
  assert.ok(r.holds('authority(euclid, euclid)'));
  assert.ok(!r.holds('authority(euclid, lobachevsky)'));
  // and the forgery is not cosmetic — Euclid's book now contradicts itself,
  // and it holds ex_falso, so it proves everything
  assert.equal(theoremsOf(forger, 'euclid').length,
    col(r, 'proposition[main](P)', 'P').length);
});

test('the oracle: every claim decided a second time, by exhaustive enumeration', () => {
  const oc = oracleCheck(r);
  assert.equal(oc.books, 9);
  assert.equal(oc.verdicts, 333, 'sample size: 9 books x 37 propositions');
  assert.equal(oc.verdictMismatch, 0);
  assert.equal(oc.sufficiencyMismatch, 0, 'every axiom set the polynomial names really proves it');
  assert.equal(oc.sumMismatch, 0);
  assert.equal(oc.parallelMismatch, 0);
  assert.ok(oc.necessityChecks > 1900);
  // THE ONE GAP, pinned so it cannot grow silently. provenanceSemiring keeps
  // at most 32 monomials and applies that cap BEFORE pruning supersets, so in
  // a book where a short contradiction proves everything the long honest
  // derivation is crowded out. Every resulting disagreement is in the safe
  // direction — the polynomial calls an axiom necessary when a proof avoiding
  // it exists, never the reverse.
  assert.equal(oc.necessityMismatch, oc.necessityConservative,
    'no necessity disagreement may claim a proof that does not exist');
  assert.deepEqual([...new Set(oc.understatedTheorems.map((x) => x.split('/')[0]))], ['frege']);
  assert.equal(oc.supportsTotal - oc.supportsNamed, 6);
  assert.deepEqual(oc.disagreements, []);
});

test('the subset oracle is complete, and it agrees with the engine on Euclid', () => {
  // the oracle's own positive control: a closure that decides nothing would
  // agree with anything, so check it separates the cases by hand
  const c = corpusOf(r);
  const ax = [...c.axioms.get('euclid')!].sort();
  const closures = subsetClosures(ax, c);
  assert.equal(closures.length, 1 << ax.length, '2^9 subsets, all closed');
  assert.ok(closure(new Set(ax), c).has('pythagoras'));
  assert.ok(!closure(new Set(ax.filter((a) => a !== 'post5_unique')), c).has('pythagoras'));
  const mins = minimalSupports(ax, closures, 'pythagoras');
  assert.deepEqual(mins, [['post1_two_points', 'post2_extend', 'post4_right_angles', 'post5_unique']],
    'exactly one minimal axiom set proves Pythagoras');
  const named = supportOf(provenance(r), 'thm[euclid](pythagoras)', 'euclid');
  assert.deepEqual(named.map((s) => s.axioms), mins, 'and the polynomial names it');
});

test('the README and the page quote the demonstration verbatim', () => {
  const block = HEADLINE.join('\n');
  assert.ok(read('examples', 'goof', 'README.md').includes(block),
    'examples/goof/README.md must contain the real whynot output, unedited');
  assert.ok(read('examples', 'goof', 'page.html').includes(escapeHtml(block)),
    'examples/goof/page.html must contain the real whynot output, unedited');
});
