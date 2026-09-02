// example-ditto.test.ts — proving a refactoring preserved what it promised
// (examples/ditto/).
//
// The properties that make this worth computing, each pinned by the demo's own
// computation rather than by a number a previous run happened to produce:
//
//   * the program loads clean and every rule is materialised (a demand-backed
//     rule would leave the Boolean answers right and every semiring below
//     folded over a different fact set);
//   * the freeze is a FUNCTION OF THE TEXT — extracting the same tree twice
//     gives the same facts, or "the model moved" would mean nothing;
//   * the check can say YES: two identical revisions violate nothing. A gate
//     that has only ever said no is as uninformative as one that has only ever
//     said yes, and this suite exercises both directions;
//   * THE DECLARATION IS LOAD-BEARING — delete the declared rename and the
//     boundary check fails; delete the declared move and the dependency check
//     fails. Without those two lines the tool reports a refactoring as a
//     rewrite, which is exactly the failure it exists to prevent;
//   * the violation is found, it is the planted one, and it is found again by
//     two computations that do not share the first one's reasoning;
//   * counting distinguishes an invariant that BROKE from one that HELD AND
//     LOST ITS SPARE, and simple-path routes stay finite where the walk is
//     INFINITE over the recursive function in the fixture;
//   * the "why did it break" guess reaches NO verdict relation, checked
//     against the kernel's own rule dependency graph and not against a
//     comment;
//   * and a skewed extractor version refuses the whole comparison, including
//     refusing to say that anything held.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { evaluateSemiring } from '../src/semiring.ts';
import { countingSemiring, INFINITE, renderLogProb } from '../runtime/semirings.ts';
import {
  CLAIM, FROZEN, EXTRACTOR_VERSION, TIER_CONFIDENCE, world, freeze, col, pairs,
  bare, hygiene, classReport, verdicts, permittedChanges, slack, causes, rawDiff,
  repair, exciseOracle, modelOf, oracle, oracleDiff, cheapestProof, chainNodes, pretty,
} from '../examples/ditto/demo.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** One world for the read-only tests; building it costs a boot load. */
const W = world();

const ENTRY = 'fn("orders.ts","handleOrder")';
const SETTLE = 'fn("orders.ts","settle")';
const PERSIST = 'fn("storage/db.ts","persist")';

/** Delete one line from the declaration, and fail loudly if it was not there —
 *  a mutation that silently mutates nothing tests nothing. */
const withoutLine = (line: string): string => {
  assert.ok(CLAIM.includes(line + '\n'), `declaration line not found: ${line}`);
  return CLAIM.replace(line + '\n', '');
};

/** The demonstration the README and the page quote, pinned character for
 *  character. The rule ids in it are content hashes of ditto.rofl's clauses,
 *  so editing a rule forces the prose that quotes it to be redone. */
const MISSING_LINK = [
  'whynot edge[main](after,fn("orders.ts","settle"),fn("storage/db.ts","persist")):',
  '  rule r87550593: edge[main](?S,fn(?P,?F),fn(?Q,?N))@now :- calls[main](?S,?P,?F,?N)@now, func[main](?S,?P,?F)@now, target[main](?S,?P,?N,?Q)@now',
  '    failed premise: calls[main](after,"orders.ts","settle","persist")',
  '      rule rda797ee2: calls[main](?S,?P,?F,?C)@now :- src_call[?S](?P,?F,?C)@now, side[main](?S)@now',
  '        failed premise: src_call[after]("orders.ts","settle","persist")',
  '          no rule concludes \'src_call\' and no matching base fact exists',
];

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// the program itself

test('the program loads clean: stratified, no leak, no breach, no undefined premise', () => {
  const h = hygiene(W);
  assert.deepEqual(h.unstratified, []);
  assert.deepEqual(h.audits, {
    malformed: 0, breach: 0, leak: 0, forged: 0, undefined_premise: 0,
  });
  // Zero because two DIFFERENT declarations were written, not because the
  // audit stopped looking. The three named walks out of [before], [after] and
  // [claim] into [audit] are `imports` facts; the walk out of the side
  // VARIABLE is `collects(main)`, which is the only sentence that can say it
  // (`imports` needs a registered perspective at both ends and `$var("S")`
  // has no `authority` fact). The second one is checked below rather than
  // assumed from the zero.
  assert.ok(W.holds('collected[audit](main)'),
    'the collection declaration was EXERCISED, not merely written');
  assert.equal(h.holes, 0, 'no budget exhaustion');
});

test('every rule is range-restricted and nothing is demand-evaluated', () => {
  const h = hygiene(W);
  assert.deepEqual(h.unsafe, [], 'an unsafe rule folds every semiring over a different world');
  assert.equal(h.demandRels, 0);
  assert.ok(h.rules > 60, `expected the whole program to decode, got ${h.rules} rules`);
});

test('there are exactly TWO model ledgers, however often the extractor runs', () => {
  // the perspective-per-run anti-pattern, checked rather than promised: a
  // ledger here is a revision, not an execution.
  assert.deepEqual(col(W, 'side(S)', 'S'), ['after', 'before']);
  for (const s of ['before', 'after']) {
    assert.equal(col(W, `authority(${s}, Who)`, 'Who').length, 3,
      'the two kernel principals ($kernel, $anon) and one writer');
  }
});

test('the extractor cannot declare its own equivalence class', () => {
  assert.deepEqual(col(W, 'forged[audit](F)', 'F'), [], 'the shipped world forges nothing');
  // both writers, one world: the authorised one is silent and the other is not,
  // so this cannot pass by the audit being broken for everybody.
  const r = world();
  assert.equal(r.assert('renamed[claim]("persist", "store").', { who: 'frozen_extract' }).ok, true);
  assert.equal(r.assert('src_call[after]("orders.ts", "settle", "persist").', { who: 'live_extract' }).ok, true);
  r.evaluate();
  const forged = col(r, 'forged[audit](F)', 'F');
  assert.equal(forged.length, 1, `expected exactly one forgery, got ${forged.join(' ')}`);
  assert.match(forged[0], /renamed/);
});

// ---------------------------------------------------------------------------
// the freeze

test('the freeze is a function of the text: extract twice, get the same model', () => {
  for (const side of ['before', 'after'] as const) {
    const again = freeze(side, side);
    assert.deepEqual(again.facts, FROZEN[side].facts,
      `${side}: re-extraction moved, so "the model changed" would mean nothing`);
  }
  // and the two revisions really are different, or the comparison is vacuous
  assert.notDeepEqual(FROZEN.before.facts.length, 0);
  const d = rawDiff();
  assert.ok(d.onlyBefore > 15 && d.onlyAfter > 15,
    `a diff of ${d.onlyBefore}/${d.onlyAfter} facts is what makes this worth checking`);
  assert.equal(d.filesIdentical, 3, 'three of the seven files were not touched at all');
});

// ---------------------------------------------------------------------------
// the declared class

test('mixing edits weakens the claim, and the report names what it cost', () => {
  const c = classReport(W);
  assert.deepEqual(c.kinds, ['data_structure', 'dedupe', 'extract_method', 'module_move', 'rename']);
  assert.deepEqual(c.obliged, ['boundary', 'entry_effect', 'entry_reach', 'module_dep']);
  assert.deepEqual(c.waived, ['identifier', 'internal', 'layout']);
  // the rename on its own promises the call graph will not move; the extraction
  // in the same change takes that promise away, and the tool says which.
  const internal = c.weakened.find((w) => w.invariant === 'internal')!;
  assert.deepEqual(internal.promisedBy, ['module_move', 'rename']);
  assert.deepEqual(internal.waivedBy, ['data_structure', 'dedupe', 'extract_method']);
  // a rename ALONE obliges strictly more than the mixed change does
  const alone = world({ claim: 'edit[claim](e_rename_customer, rename).\n' + CLAIM.split('renamed[claim]')[1].replace(/^/, 'renamed[claim]') });
  assert.ok(col(alone, 'obliged(I)', 'I').length > c.obliged.length,
    'a single-kind change must be able to promise more than a mixed one');
});

// ---------------------------------------------------------------------------
// the verdict

test('the verdict is 36 of 38 declared tuples, and both losses are one dropped call', () => {
  const rows = verdicts(W);
  assert.deepEqual(rows.map((x) => [x.invariant, x.verdict]), [
    ['boundary', 'HELD'], ['entry_effect', 'VIOLATED'],
    ['entry_reach', 'VIOLATED'], ['module_dep', 'HELD'],
  ]);
  assert.equal(rows.reduce((n, x) => n + x.before, 0), 38);
  assert.equal(rows.reduce((n, x) => n + x.lost.length + x.gained.length, 0), 2);
  assert.deepEqual(col(W, 'violated(entry_effect, T, disappeared)', 'T'), [`pair(${ENTRY},db_write)`]);
  assert.deepEqual(col(W, 'violated(entry_reach, T, disappeared)', 'T'), [`pair(${ENTRY},${PERSIST})`]);
  assert.deepEqual(col(W, 'violated(I, T, appeared)', 'I'), [], 'nothing was gained here');
  // and the licensed changes are most of the edit: the check is not vacuous
  const permitted = permittedChanges(W);
  assert.ok(permitted.reduce((n, p) => n + p.removed + p.added, 0) >= 15,
    'a check that reported no legal change at all would be checking nothing');
});

test('the check can say YES: two identical revisions violate nothing', () => {
  // The positive control. Same tree on both sides, and a declaration with no
  // identifications in it, because there is nothing to identify.
  const claim = CLAIM.split('\n').filter((l) => !l.startsWith('renamed[claim]') && !l.startsWith('moved[claim]')).join('\n');
  const r = world({ claim, afterFacts: freeze('after', 'before').facts });
  assert.deepEqual(r.query('violated(I, T, D)').rows, []);
  assert.deepEqual(col(r, 'held(I)', 'I').sort(),
    ['boundary', 'entry_effect', 'entry_reach', 'module_dep']);
  assert.deepEqual(col(r, 'probable_cause(A, B)', 'A'), [], 'and there is nothing to guess about');
});

// ---------------------------------------------------------------------------
// the declaration is load-bearing, in both directions

test('DELETE THE DECLARED RENAME and the tool reports a refactoring as a rewrite', () => {
  const r = world({ claim: withoutLine('renamed[claim]("findCustomer", "loadCustomer").') });
  const broken = col(r, 'broken(I)', 'I').sort();
  assert.ok(broken.includes('boundary'),
    `without the identification the export surface must fail; broken = ${broken.join(' ')}`);
  assert.ok(broken.includes('entry_reach'));
  // the exact tuple: the old name is lost and the new one is an addition
  assert.ok(col(r, 'violated(boundary, T, disappeared)', 'T')
    .some((t) => t.includes('findCustomer')));
  assert.ok(col(r, 'violated(boundary, T, appeared)', 'T')
    .some((t) => t.includes('loadCustomer')));
});

test('DELETE THE DECLARED MOVE and the dependency graph fails the same way', () => {
  const r = world({ claim: withoutLine('moved[claim]("db.ts", "storage/db.ts").') });
  const broken = col(r, 'broken(I)', 'I').sort();
  assert.ok(broken.includes('module_dep'), `broken = ${broken.join(' ')}`);
  assert.ok(broken.includes('boundary'));
  assert.ok(col(r, 'violated(module_dep, T, disappeared)', 'T').length > 0);
  // and with BOTH declared, those same invariants hold — the maps are what
  // makes the comparison possible, not a way of hiding a change
  assert.ok(W.holds('held(module_dep)'));
  assert.ok(W.holds('held(boundary)'));
});

// ---------------------------------------------------------------------------
// the chain

test('whynot names the missing link, and the README and page quote it verbatim', () => {
  const wn = W.whynot(`edge(after, ${SETTLE}, ${PERSIST})`, { depth: 6, nodes: 40 }).text;
  assert.deepEqual(MISSING_LINK.filter((l) => !wn.includes(l)), [],
    `the pinned demonstration must appear verbatim in\n${wn}`);
  const block = MISSING_LINK.join('\n');
  assert.ok(read('examples', 'ditto', 'README.md').includes(block),
    'examples/ditto/README.md must contain the real whynot output, unedited');
  assert.ok(read('examples', 'ditto', 'page.html').includes(escapeHtml(block)),
    'examples/ditto/page.html must contain the real whynot output, unedited');
});

test('the frozen route is the chain the spec asks for, and it stops one link short', () => {
  const carrying = W.query(`route(before, ${ENTRY}, B, P)`).rows
    .filter((x) => W.holds(`does(before, ${x.bindings.B}, db_write)`));
  assert.equal(carrying.length, 1, 'exactly one route carried the write');
  assert.deepEqual(chainNodes(carrying[0].bindings.P),
    [ENTRY, SETTLE, 'fn("db.ts","persist")']);
  // after the edit the first two links survive and the third does not
  assert.ok(W.holds(`cedge(after, ${ENTRY}, ${SETTLE})`));
  assert.equal(W.holds(`cedge(after, ${SETTLE}, ${PERSIST})`), false);
  // the cheapest proof is the nearest place to look, and it is ordered
  const proofs = cheapestProof(W);
  assert.equal(proofs.length, 2);
  assert.ok(proofs[0].firings <= proofs[1].firings);
  assert.ok(Number.isFinite(proofs[0].firings));
});

// ---------------------------------------------------------------------------
// counting

test('counting separates a broken invariant from one that held and lost its spare', () => {
  const s = new Map(slack(W).map((x) => [x.effect, x]));
  assert.equal(s.get('db_write')!.before, 1n);
  assert.equal(s.get('db_write')!.after, 0n, 'no route left: that is the violation');
  assert.equal(s.get('audit_write')!.before, 2n);
  assert.equal(s.get('audit_write')!.after, 1n, 'still reachable, and by one route instead of two');
  assert.ok(W.holds(`obs(after, entry_effect, pair(${ENTRY},audit_write))`),
    'a lost route is NOT a violation and must not be reported as one');
  assert.deepEqual(col(W, 'violated(entry_effect, T, D)', 'T'), [`pair(${ENTRY},db_write)`]);
  for (const e of ['db_read', 'mail_send', 'net_call']) {
    assert.equal(s.get(e)!.before, s.get(e)!.after, `${e} moved and should not have`);
  }
});

test('the counting fold is exact because every helper has exactly one derivation', () => {
  // examples/drip paid for this lesson: a relation on the path to the counted
  // one with N derivations multiplies every count downstream by N.
  const fold = evaluateSemiring(W.store, countingSemiring);
  for (const rel of ['func', 'calls', 'node', 'edge', 'target', 'visible',
    'imports_edge', 'does', 'route', 'chain', 'fresh']) {
    for (const k of W.factKeys().filter((x) => x.startsWith(`${rel}[main](`))) {
      const v = fold.value.get(k)!;
      assert.equal(v, 1n, `${k} has ${String(v)} derivations; every route count multiplies by it`);
    }
  }
});

test('simple-path routes are finite exactly where the walk is INFINITE', () => {
  // flattenLines is recursive in both revisions, on purpose: the fixture
  // exercises the cycle rather than avoiding it.
  assert.ok(W.holds('edge(before, fn("pricing.ts","flattenLines"), fn("pricing.ts","flattenLines"))'));
  const fold = evaluateSemiring(W.store, countingSemiring);
  const walk = fold.value.get('creach[main](before,fn("pricing.ts","priceOf"),fn("pricing.ts","flattenLines"))');
  assert.equal(walk, INFINITE, 'walking a self-loop is infinitely many derivations');
  for (const k of W.factKeys().filter((x) => x.startsWith('route[main]('))) {
    assert.notEqual(fold.value.get(k), INFINITE, `${k} must be finite with the chain inside the fact`);
  }
  // and the Boolean answers agree: the chain changes the count, not the set
  const walked = new Set(pairs(W, 'creach(before, A, B)', 'A', 'B').map(([a, b]) => `${a} ${b}`));
  for (const x of W.query('route(before, A, B, P)').rows) {
    const { A, B } = x.bindings;
    if (A !== B) assert.ok(walked.has(`${A} ${B}`), `${A} -> ${B} routed but not reachable`);
  }
});

// ---------------------------------------------------------------------------
// the guess stays a guess

test('confidence is the best-supported evidence tier, not the product of all of them', () => {
  const cs = causes(W);
  const top = cs.find((c) => c.to === PERSIST)!;
  assert.deepEqual(top.tiers.map(([t]) => t), ['edge_gone', 'edge_gone_orphan', 'edge_gone_effect']);
  assert.equal(Number(renderLogProb(top.best)).toFixed(2), TIER_CONFIDENCE.edge_gone_effect.toFixed(2));
  // the product of the three would be ~0.25: a max, not a product
  assert.ok(Number(renderLogProb(top.best)) > 0.8);
  // the two legal deletions are offered too, and rank below it — the tool is
  // not told which of the three was the defect
  const others = cs.filter((c) => c.to !== PERSIST);
  assert.equal(others.length, 2);
  for (const o of others) {
    assert.ok(Number(renderLogProb(o.best)) < Number(renderLogProb(top.best)));
  }
});

test('NO verdict relation depends on the guess, by the kernel dependency graph', () => {
  const guessRels = ['probable_cause', 'hint', 'orphan', 'lost_edge', 'carries_effect'];
  const concluded = [...new Set(col(W, 'concludes(R, Rel)', 'Rel'))];
  assert.ok(concluded.length > 40);
  const leaks: string[] = [];
  for (const rel of concluded) {
    if (guessRels.includes(rel)) continue;
    for (const g of guessRels) if (W.holds(`reach(${rel}, ${g})`)) leaks.push(`${rel} -> ${g}`);
  }
  assert.deepEqual(leaks, [], 'a guess reached a verdict');
});

// ---------------------------------------------------------------------------
// the gate that can say no

test('a skewed extractor version refuses the comparison, including refusing to say YES', () => {
  const r = world({ afterVersion: 'a-different-parser' });
  assert.deepEqual(col(r, 'refused(R)', 'R'), ['version_skew']);
  assert.deepEqual(col(r, 'checked(I)', 'I'), []);
  assert.deepEqual(r.query('violated(I, T, D)').rows, []);
  assert.deepEqual(col(r, 'held(I)', 'I'), [],
    'a refused comparison must not be able to report success either');
  // a different tool entirely is refused on its own ground
  const t = world({ afterTool: 'some_other_scanner' });
  assert.deepEqual(col(t, 'refused(R)', 'R').sort(), ['tool_swap']);
  // and the shipped world, with one version on both sides, refuses nothing
  assert.deepEqual(col(W, 'refused(R)', 'R'), []);
  assert.equal(EXTRACTOR_VERSION.length, 12);
});

// ---------------------------------------------------------------------------
// the oracles

test('excise: deleting the one call from the FROZEN model loses exactly what the edit lost', () => {
  const ex = exciseOracle(world(), 'src_call[before]("orders.ts", "settle", "persist").');
  assert.equal(ex.agree, true,
    `derived ${JSON.stringify(ex.lost)} vs excised ${JSON.stringify(ex.removed)}`);
  assert.equal(ex.removed.length, 2);
});

test('the oracle re-resolves both revisions without the engine, and agrees', () => {
  const effectApi = new Map(pairs(W, 'effect_api(C, E)', 'C', 'E').map(([c, e]) => [bare(c), e] as [string, string]));
  const ren = new Map([['findCustomer', 'loadCustomer']]);
  const mov = new Map([['db.ts', 'storage/db.ts']]);
  const ob = oracle(modelOf(W, 'before'), effectApi, ['orders.ts', 'handleOrder'],
    (x) => ren.get(x) ?? x, (x) => mov.get(x) ?? x);
  const oa = oracle(modelOf(W, 'after'), effectApi, ['orders.ts', 'handleOrder'], (x) => x, (x) => x);
  assert.equal(ob.samples.nodes, 16);
  assert.equal(oa.samples.nodes, 19);
  assert.ok(ob.samples.edges > 15 && oa.samples.edges > 15);
  const od = oracleDiff(ob, oa);
  assert.deepEqual(od.entry_effect, ['db_write']);
  assert.deepEqual(od.entry_reach, ['storage/db.ts:persist']);
  assert.deepEqual(od.boundary, []);
  assert.deepEqual(od.module_dep, []);
  // and the two answers are COMPARED, not merely pinned side by side. Pinning
  // both to constants passes even when they have drifted apart; this fails.
  // (Checked by mutating cname's identity arm to drop `not renamed`: the
  // engine then loses findCustomer from the boundary and the oracle does not.)
  for (const row of verdicts(W)) {
    assert.deepEqual(row.lost.map((t) => pretty(t).replace(/^.* -> /, '')).sort(),
      (od[row.invariant] ?? []).sort(), `${row.invariant}: engine and oracle disagree`);
  }
});

test('the oracle is sensitive: break something else and it moves with the engine', () => {
  // An oracle that agrees on one fixture proves nothing; it has to agree on a
  // fixture it has not seen. Drop the mail.send from the after model.
  const facts = FROZEN.after.facts.filter((f) => !f.includes('"mail.send"'));
  assert.equal(facts.length, FROZEN.after.facts.length - 1, 'the mutation must mutate something');
  const r = world({ afterFacts: facts });
  assert.deepEqual(col(r, 'violated(entry_effect, T, disappeared)', 'T').sort(),
    [`pair(${ENTRY},db_write)`, `pair(${ENTRY},mail_send)`]);
  const effectApi = new Map(pairs(r, 'effect_api(C, E)', 'C', 'E').map(([c, e]) => [bare(c), e] as [string, string]));
  const ren = new Map([['findCustomer', 'loadCustomer']]);
  const mov = new Map([['db.ts', 'storage/db.ts']]);
  const od = oracleDiff(
    oracle(modelOf(r, 'before'), effectApi, ['orders.ts', 'handleOrder'], (x) => ren.get(x) ?? x, (x) => mov.get(x) ?? x),
    oracle(modelOf(r, 'after'), effectApi, ['orders.ts', 'handleOrder'], (x) => x, (x) => x));
  assert.deepEqual(od.entry_effect.sort(), ['db_write', 'mail_send']);
});

// ---------------------------------------------------------------------------
// the fork

test('the proposed repair is verified in a second fixpoint, not asserted', () => {
  const r = world();
  const rep = repair(r, 'src_call[after]("orders.ts", "settle", "persist").');
  assert.equal(rep.violationsBefore, 2);
  assert.equal(rep.violationsAfter, 0);
  assert.deepEqual(rep.held, ['boundary', 'entry_effect', 'entry_reach', 'module_dep']);
  // and the original world is untouched: a fork is a fork
  assert.equal(r.query('violated(I, T, D)').rows.length, 2);
  assert.ok(rep.reflection > rep.facts / 3, 'the store is mostly reflection, which is why it is slower to copy than a flat table');
});
