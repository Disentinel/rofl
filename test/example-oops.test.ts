// example-oops.test.ts — the retraction cascade (examples/oops/).
//
// The properties that make this worth computing: at_risk is transitive, it
// STOPS at a node with an independent support, a mention carries nothing,
// excise's blast radius is the same set the rules derive, the knowledge state
// is a function of the tick, and un-retraction restores what was poisoned.
// Plus two guards on the claims the README makes: that the mutually-recursive
// formulation really is rejected, and that the two cascades stay disjoint (the
// excise oracle is only exact while they are).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { evaluateSemiring } from '../src/semiring.ts';
import { countingSemiring, INFINITE } from '../runtime/semirings.ts';
import { asOf, world, simulateTo, col, pairs, domainFacts, NOW } from '../examples/oops/demo.ts';

/** Years are re-used across tests; building one world costs a boot load. */
const cache = new Map<number, Rofl>();
const at = (year: number): Rofl => {
  let r = cache.get(year);
  if (!r) { r = asOf(year); cache.set(year, r); }
  return r;
};
const risk = (r: Rofl): string[] => col(r, 'at_risk(P)', 'P');
const names = (keys: string[], rel: string): string[] =>
  keys.filter((k) => k.startsWith(`${rel}[main](`)).map((k) => k.slice(rel.length + 7, -1)).sort();

test('the program loads clean: stratified, no leak, no breach', () => {
  const r = world();
  for (const audit of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)']) {
    assert.deepEqual(r.query(audit).rows, [], audit);
  }
});

test('the formulation the README rejects really is rejected', () => {
  // the natural "at risk unless a pillar is clean, clean unless at risk" shape
  const r = world();
  // budget: rejection is budget-mediated (boot's own stratum rule diverges on an
  // unstratifiable program), so the default 100k budget costs 30 s here. 2k is
  // enough to reach the same verdict with the same trace, in half a second.
  const res = r.load(`
    at_risk_naive(A)  :- depends_on(A, B), compromised(B), not clean_pillar(A).
    clean_pillar(A)   :- depends_on(A, C), not compromised(C).
    compromised(X)    :- retracted(X).
    compromised(X)    :- at_risk_naive(X).
  `, { budget: 2000 });
  assert.equal(res.ok, false, 'a negative cycle must not load');
  assert.match(res.diagnostics.join('\n'), /settled nothing while .*at_risk_naive/);
  assert.deepEqual(r.query('at_risk_naive(P)').rows, [], 'the load rolled back');
  assert.ok(r.holds('depends_on(yield_2020, helix_2019)'), 'and left the good program intact');
});

test('at_risk is transitive: a paper that never cites the retraction is caught', () => {
  const r = at(NOW);
  assert.ok(!r.holds('direct_citation(scaleup_2021, helix_2019)'), 'no direct edge');
  assert.ok(r.holds('at_risk(scaleup_2021)'), 'two hops out, still at risk');
  assert.ok(!r.holds('direct_citation(guideline_2019, assay_2017)'));
  assert.ok(r.holds('at_risk(guideline_2019)'), 'the other cascade, same shape');
  assert.deepEqual(risk(r),
    ['guideline_2019', 'panel_2018', 'replication_2025', 'scaleup_2021', 'yield_2020']);
});

test('a node with an independent support is NOT at risk, and stops the cascade', () => {
  const r = at(NOW);
  // meta_2022 depends on the poisoned scaleup_2021 AND on clean thermo_2016
  assert.ok(r.holds('depends_on(meta_2022, scaleup_2021)'));
  assert.ok(r.holds('tainted(meta_2022)'), 'the poison reaches it');
  assert.ok(r.holds('robust(meta_2022)'), 'and stops: it is independently supported');
  assert.ok(!r.holds('at_risk(meta_2022)'));
  const w = r.whynot('at_risk[main](meta_2022)');
  assert.equal(w.holds, false);
  assert.match(w.text, /blocked: grounded\[main\]\(meta_2022\) holds/);
  // and the stop propagates: everything below meta_2022 is grounded through it
  assert.ok(r.holds('tainted(policy_2023)'));
  assert.ok(!r.holds('at_risk(policy_2023)'), 'downstream of a robust node is not at risk');
  assert.ok(r.holds('at_risk(scaleup_2021)'), 'upstream of it still is');
});

test('a mention is not a dependency', () => {
  const r = at(NOW);
  assert.ok(r.holds('direct_citation(review_2021, helix_2019)'));
  assert.ok(!r.holds('depends_on(review_2021, helix_2019)'));
  assert.ok(!r.holds('tainted(review_2021)'), 'a mention carries no poison');
  assert.ok(!r.holds('at_risk(review_2021)'));
});

test("excise's blast radius equals the set the rules derive, for each root", () => {
  const r = at(NOW);
  const roots: [string, string][] = [['helix_2019', '2024'], ['assay_2017', '2022']];
  // the comparison below is only exact while the two cascades are disjoint —
  // a doubly-tainted paper would survive excising either root alone. Enforced,
  // not assumed, so a later edit to the graph fails here instead of silently
  // weakening the oracle.
  const byRoot = roots.map(([root]) =>
    new Set(pairs(r, `tainted_by(P, ${root})`, 'P', 'R').map(([p]) => p)));
  assert.deepEqual([...byRoot[0]].filter((p) => byRoot[1].has(p)), [],
    'no paper is tainted by both retracted roots');
  for (const [root, year] of roots) {
    const ex = r.excise(`retraction(${root}, ${year})`);
    assert.equal(ex.ok, true, ex.error);
    assert.deepEqual(names(ex.removed, 'at_risk'), col(r, `at_risk_from(P, ${root})`, 'P').sort(),
      `at_risk blast radius of ${root}`);
    assert.deepEqual(names(ex.removed, 'tainted'),
      pairs(r, `tainted_by(P, ${root})`, 'P', 'R').map(([p]) => p).sort(),
      `tainted blast radius of ${root}`);
    // and the OTHER root's cascade is untouched — the diff is not "everything"
    const other = roots.find(([o]) => o !== root)![0];
    for (const p of col(r, `at_risk_from(P, ${other})`, 'P')) {
      assert.ok(!names(ex.removed, 'at_risk').includes(p), `${p} survives excising ${root}`);
    }
    // excising a retraction restores grounding rather than only deleting
    assert.ok(names(ex.added, 'grounded').includes(root));
  }
});

test('un-retraction restores what was poisoned', () => {
  const poisoned = col(at(2025), 'at_risk_from(P, helix_2019)', 'P');
  assert.deepEqual(poisoned, ['replication_2025', 'scaleup_2021', 'yield_2020']);
  const after = at(2026);          // the un-retraction is dated 2026
  assert.ok(!after.holds('retracted(helix_2019)'));
  for (const p of poisoned) {
    assert.ok(!after.holds(`at_risk(${p})`), `${p} restored`);
    assert.ok(after.holds(`grounded(${p})`), `${p} stands on evidence again`);
  }
  assert.deepEqual(risk(after), ['guideline_2019', 'panel_2018'],
    'the other retraction still stands: restoration is not amnesia');
});

test('un-retraction restores through real ticks too, not only as-of queries', () => {
  const r = simulateTo(2025);
  assert.deepEqual(risk(r).length, 5);
  assert.equal(r.tickAdvance().advanced, true);
  r.evaluate();
  assert.deepEqual(col(r, 'clock(Y)', 'Y'), ['2026']);
  assert.deepEqual(risk(r), ['guideline_2019', 'panel_2018']);
});

test('the knowledge state is a function of the tick', () => {
  assert.deepEqual(risk(at(2021)), [], 'nothing retracted yet');
  assert.deepEqual(risk(at(2023)), ['guideline_2019', 'panel_2018']);
  assert.equal(risk(at(2024)).length, 4, 'the second retraction lands');
  assert.equal(risk(at(2025)).length, 5, 'a paper published after it, citing it anyway');
  // citing before a retraction and citing after it are different categories
  assert.deepEqual(pairs(at(NOW), 'cited_after_retraction(A, B)', 'A', 'B'),
    [['replication_2025', 'helix_2019']]);
  assert.ok(at(NOW).holds('cited_before_retraction(yield_2020, helix_2019)'));
  assert.ok(!at(NOW).holds('cited_after_retraction(yield_2020, helix_2019)'));
});

test('simulating the ticks and evaluating at the clock give the same world', () => {
  assert.deepEqual(domainFacts(simulateTo(NOW)), domainFacts(at(NOW)));
});

test('counting is the robustness metric, and says INFINITE on a citation cycle', () => {
  const r = at(NOW);
  const fold = evaluateSemiring(r.store, countingSemiring);
  const chains = (p: string) => fold.value.get(`grounded[main](${p})`) ?? 0n;
  assert.equal(chains('synthesis_2023'), 3n, 'three independent chains survive the retraction');
  assert.equal(chains('meta_2022'), 1n, 'one chain, and that is what makes it robust');
  assert.equal(chains('yield_2020'), 0n, 'at risk: no chain at all');
  assert.equal(chains('preprint_a'), INFINITE, 'preprint_a and preprint_b cite each other');
  assert.equal(fold.converged, true);
  assert.equal(fold.disciplineHeld, true);
});

test('the ticked store and the as-of store agree on the COUNTS, not only the facts', () => {
  // §8 proved the two stores hold the same 142 domain facts. The counting
  // fold used to disagree about them wholesale — a carry rule made every
  // ledger fact its own support one tick back, and the CLOSED instance read
  // that self-loop as INFINITE, so the ticked store answered "infinitely
  // many" for 134 of the 142. The fold is about one tick now, and a carried
  // fact is a given in it, so the two agree fact for fact.
  const ticked = simulateTo(NOW);
  const asof = at(NOW);
  const keys = domainFacts(asof);
  assert.deepEqual(domainFacts(ticked), keys, 'the same 142 facts, or this compares two worlds');
  const a = evaluateSemiring(asof.store, countingSemiring).value;
  const b = evaluateSemiring(ticked.store, countingSemiring).value;
  const differ = keys.filter((k) => a.get(k) !== b.get(k));
  assert.deepEqual(differ, [], 'every domain fact counts the same through ticks as at the clock');
  // and the agreement is not "everything is one": the distribution has shape,
  // including the citation cycle, which is a cycle INSIDE one tick and stays
  const tally = new Map<string, number>();
  for (const k of keys) {
    const v = b.get(k);
    const label = v === INFINITE ? 'INFINITE' : String(v);
    tally.set(label, (tally.get(label) ?? 0) + 1);
  }
  assert.deepEqual([...tally].sort(),
    [['1', 127], ['2', 4], ['3', 2], ['4', 1], ['INFINITE', 8]]);
  assert.equal(b.get('grounded[main](preprint_a)'), INFINITE, 'the citation cycle is untouched');
  assert.equal(b.get('grounded[main](synthesis_2023)'), 3n, 'three chains, through the ticks too');
});
