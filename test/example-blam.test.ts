// BLAM (examples/blam) -- affected targets in a monorepo build graph, with the
// derivation. The four queries, the diamond, the stopping front, and the
// property the whole counting metric stands on here: the build graph is
// acyclic, so the count is a number rather than "infinitely many".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { evaluateSemiring } from '../src/semiring.ts';
import { countingSemiring, INFINITE } from '../runtime/semirings.ts';
import {
  world, withoutEdge, withCycle, affectedOf, allTargets, allFiles, costTable,
  costOf, routeCounts, buildDepth, waves, cutRanking, cutForDiff, edgeName,
  edgeProvenance, cutsFor, oracleCheck, baseGraph, oraclePaths, show, col,
  DIFF_UTILS, DIFF_CONFIG, UNREACHED, APEX,
} from '../examples/blam/demo.ts';

// One world per scenario, shared by every read-only test: loading is the
// expensive part and none of these mutate the store.
let sharedUtils: Rofl | null = null;
const utilsDiff = (): Rofl => (sharedUtils ??= world([DIFF_UTILS]));
let sharedConfig: Rofl | null = null;
const configDiff = (): Rofl => (sharedConfig ??= world([DIFF_CONFIG]));

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const QUOTED_DIFF = JSON.stringify(DIFF_UTILS);

// ---------------------------------------------------------------------------
// the model itself

test('the model loads, every rule is range-restricted, nothing is demand-evaluated', () => {
  const r = utilsDiff();
  // A rule that is not range-restricted is evaluated top-down instead of
  // materialised, silently: the Boolean answers stay correct and the semiring
  // then folds over a different fact set than the verdicts describe.
  const ev = new Evaluation(r.store, {});
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), []);
  assert.equal(ev.rules.every((x) => x.safe), true);
  assert.equal(ev.demandRels.size, 0);
  // five rules, and the carrier is named in none of them
  assert.equal(ev.rules.length, 5);
  for (const x of ev.rules) {
    assert.doesNotMatch(x.canon, /boolean|counting|tropical|provenance|semiring|count/i);
  }
  // the shape the spec asks for
  assert.equal(col(r, 'package(P)', 'P').length, 8);
  assert.equal(allTargets(r).length, 16);
  assert.equal(allFiles(r).length, 12);
  // one file owned by two targets
  const twoOwners = allFiles(r).filter((f) => col(r, `owns(T, ${f})`, 'T').length > 1);
  assert.deepEqual(twoOwners, ['"shared/schema/events.json"']);
  assert.deepEqual(col(r, 'owns(T, "shared/schema/events.json")', 'T').sort(),
    ['t(api,build)', 't(ui,build)']);
});

// ---------------------------------------------------------------------------
// query 1 -- why

test('why names every edge from the changed file to the rebuilt target', () => {
  const r = utilsDiff();
  const why = r.why(`affected(${APEX})`);
  assert.equal(why.ok, true);
  // the chain, in order: the diff, the two dependency edges with the package
  // fact under each, and the ownership axiom that started it
  const at = (s: string) => {
    const i = why.text.indexOf(s);
    assert.ok(i >= 0, `why must name ${s}`);
    return i;
  };
  const iChanged = at(`changed[main](${QUOTED_DIFF}) [axiom]`);
  const iWebApi = at('needs[main](t(web,build),t(api,build))');
  const iPkgWebApi = at('pkg_dep[main](web,api) [axiom]');
  const iApiUtils = at('needs[main](t(api,build),t(utils,build))');
  const iPkgApiUtils = at('pkg_dep[main](api,utils) [axiom]');
  const iOwns = at(`owns[main](t(utils,build),${QUOTED_DIFF}) [axiom]`);
  assert.ok(iChanged < iWebApi, 'the diff is the root of the tree');
  assert.ok(iPkgWebApi > iWebApi && iPkgWebApi < iApiUtils, 'edge web->api, then its axiom');
  assert.ok(iPkgApiUtils > iApiUtils, 'edge api->utils, then its axiom');
  assert.ok(iOwns > iPkgApiUtils, 'and it bottoms out on ownership of the changed file');
  // the tree really does reach axioms: no unexpanded leaf
  assert.doesNotMatch(why.text, /\[past tick\]/);
});

// ---------------------------------------------------------------------------
// query 2 -- whynot: the stopping front, not an empty result

test('whynot returns the stopping front for the unreached target', () => {
  const r = utilsDiff();
  // the answer a build tool gives: nothing
  assert.equal(r.query(`affected(${UNREACHED})`).rows.length, 0);
  assert.equal(r.holds(`affected(${UNREACHED})`), false);

  const wn = r.whynot(`affected(${UNREACHED})`, { depth: 8, nodes: 64 });
  assert.equal(wn.holds, false);
  const lines = wn.text.split('\n');
  assert.ok(lines.length > 12, `a front, not an empty result (got ${lines.length} lines)`);

  // 1. the target owns no changed file
  assert.match(wn.text, /failed premise: owns\[main\]\(t\(docs,build\),"packages\/utils\/src\/str\.ts"\)/);
  // 2. neither of the targets it needs is reached -- both named
  assert.match(wn.text, /failed premise: reaches\[main\]\("packages\/utils\/src\/str\.ts",t\(config,build\)\)/);
  assert.match(wn.text, /failed premise: reaches\[main\]\("packages\/utils\/src\/str\.ts",t\(core,build\)\)/);
  // 3. and the front itself: config:build has no dependencies at all
  assert.match(wn.text, /failed premise: pkg_dep\[main\]\(config,\?Q/);
  assert.match(wn.text, /no rule concludes 'pkg_dep' and no matching base fact exists/);
  // the walk terminated on its own, not on a bound
  assert.doesNotMatch(wn.text, /depth limit|node limit/);

  // every spared target gets a front, not just this one
  const spared = allTargets(r).filter((t) => !affectedOf(r).includes(t));
  assert.equal(spared.length, 6);
  for (const t of spared) {
    const w = r.whynot(`affected(${t})`, { depth: 8, nodes: 64 });
    assert.equal(w.holds, false, t);
    assert.match(w.text, /failed premise: owns\[main\]/, `${t} must name its ownership gap`);
  }
});

// ---------------------------------------------------------------------------
// query 3 -- counting, and the acyclicity it rests on

test('the diamond yields two independent routes, and the support graph is acyclic', () => {
  const r = utilsDiff();
  const { count, cyclic } = routeCounts(r);
  assert.equal(cyclic, 0, 'a build graph is acyclic: no fact lies on a support cycle');
  assert.equal(count.get(APEX), 2n, 'web is reached through api AND through ui');
  assert.equal(count.get('t(web,test)'), 2n, 'and so is its test target');
  for (const t of ['t(api,build)', 't(ui,build)', 't(cli,build)', 't(utils,build)']) {
    assert.equal(count.get(t), 1n, `${t} has one route`);
  }
  assert.equal(count.get(UNREACHED), undefined, 'and the unreached target has no value at all');

  // the two routes are genuinely edge-disjoint: cutting either branch leaves
  // web affected, with one route instead of two
  for (const [from, to] of [['web', 'api'], ['web', 'ui'], ['api', 'utils'], ['ui', 'utils']]) {
    const cut = withoutEdge(r, from, to);
    assert.equal(cut.holds(`affected(${APEX})`), true, `${from}->${to} alone must not spare web`);
    assert.equal(routeCounts(cut).count.get(APEX), 1n, `${from}->${to}: one route left`);
  }
});

test('a cycle in the package graph makes the SAME instance answer INFINITE', () => {
  const r = utilsDiff();
  const cyc = withCycle(r, 'utils', 'ui');     // utils <-> ui, which no build tool allows
  const fold = routeCounts(cyc);
  assert.ok(fold.cyclic > 0, 'the support hypergraph now has cycles');
  assert.equal(fold.count.get(APEX), INFINITE);
  assert.equal(fold.count.get('t(utils,build)'), INFINITE);
  // and the boolean verdict is unchanged -- only the metric died
  assert.deepEqual(affectedOf(cyc), affectedOf(r));
  // the oracle refuses to answer at all on a cyclic graph rather than
  // returning a wrong finite number
  assert.throws(() => oraclePaths(baseGraph(cyc), JSON.stringify(DIFF_UTILS)),
    /cycle in the package graph/);
});

// ---------------------------------------------------------------------------
// query 4 -- tropical: the build order

test('tropical gives the build order, in waves', () => {
  const r = utilsDiff();
  const depth = buildDepth(r);
  assert.equal(depth.get('t(utils,build)'), 0, 'the owner of the changed file starts at once');
  assert.equal(depth.get('t(api,build)'), 1);
  assert.equal(depth.get('t(ui,build)'), 1);
  assert.equal(depth.get(APEX), 2);
  assert.equal(depth.get('t(web,test)'), 3);
  const ws = waves(depth);
  assert.equal(ws.length, 4);
  assert.deepEqual(ws[0].map(show), ['utils:build']);
  assert.deepEqual(ws[1].map(show), ['api:build', 'ui:build', 'utils:test']);
  assert.deepEqual(ws[2].map(show), ['api:test', 'cli:build', 'ui:test', 'web:build']);
  assert.deepEqual(ws[3].map(show), ['cli:test', 'web:test']);
  // every affected target lands in exactly one wave
  assert.equal(ws.reduce((n, w) => n + w.length, 0), affectedOf(r).length);
});

// ---------------------------------------------------------------------------
// the fifth answer -- which single edge to cut

test('the edge to cut is found by provenance and confirmed by re-running the fixpoint', () => {
  const r = utilsDiff();
  const cost = costTable(r);

  // whole-repository ranking, over every single-file diff
  const ranking = cutRanking(r);
  assert.equal(ranking.length, 11, 'every pkg_dep edge is scored');
  assert.equal(edgeName(ranking[0].edge), 'ui -> utils');
  assert.equal(ranking[0].minutes, 575);
  assert.equal(ranking[0].pairs, 10);
  // the edge that decouples the most PAIRS is a different edge
  const mostPairs = [...ranking].sort((a, b) => b.pairs - a.pairs)[0];
  assert.equal(edgeName(mostPairs.edge), 'cli -> api');
  assert.equal(mostPairs.pairs, 14);
  assert.ok(mostPairs.minutes < ranking[0].minutes, 'and it saves less time');
  // three edges are redundant: cutting them decouples nothing
  assert.deepEqual(ranking.filter((x) => x.pairs === 0).map((x) => edgeName(x.edge)).sort(),
    ['api -> core', 'docs -> config', 'utils -> config']);

  // for the diff at hand
  const perDiff = cutForDiff(r, [DIFF_UTILS]);
  const best = perDiff[0];
  assert.equal(edgeName(best.edge), 'api -> utils');
  assert.deepEqual(best.frees.map(show), ['api:build', 'api:test', 'cli:build', 'cli:test']);
  assert.equal(best.minutes, 195);

  // no single edge takes web out: its two routes share none
  const prov = edgeProvenance(r);
  assert.deepEqual(cutsFor(prov, QUOTED_DIFF, APEX), []);
  assert.deepEqual(cutsFor(prov, QUOTED_DIFF, 't(api,build)').map(edgeName), ['api -> utils']);

  // and the prediction is confirmed by an actual re-evaluation
  const before = affectedOf(r);
  const after = affectedOf(withoutEdge(r, 'api', 'utils'));
  assert.deepEqual(after, before.filter((t) => !best.frees.includes(t)));
  assert.equal(costOf(cost, before), 915);
  assert.equal(costOf(cost, after), 720);
  assert.equal(costOf(cost, before) - costOf(cost, after), best.minutes);
});

// ---------------------------------------------------------------------------
// the global config: why the whole world rebuilds

test('one line in the global config rebuilds every target, web by five routes', () => {
  const r = configDiff();
  const targets = allTargets(r);
  assert.equal(affectedOf(r).length, targets.length, 'the whole repository');
  assert.deepEqual(affectedOf(r), [...targets].sort());
  const { count } = routeCounts(r);
  assert.equal(count.get(APEX), 5n);
  assert.equal(count.get('t(config,build)'), 1n);
  assert.equal(count.get('t(docs,build)'), 2n);
  assert.equal(costOf(costTable(r), affectedOf(r)), 1057);
  // no single edge can spare web from a config change either
  assert.deepEqual(cutsFor(edgeProvenance(r), JSON.stringify(DIFF_CONFIG), APEX), []);
});

// ---------------------------------------------------------------------------
// the oracle

test('the oracle: every (changed file, target) pair agrees on verdict and count', () => {
  const rep = oracleCheck();
  assert.equal(rep.files, 12);
  assert.equal(rep.targets, 16);
  assert.equal(rep.pairs, rep.files * rep.targets);
  assert.equal(rep.pairs, 192, 'the whole single-file diff space of this repository');
  assert.deepEqual(rep.disagreements, []);
  assert.equal(rep.verdictMismatch, 0);
  assert.equal(rep.countMismatch, 0);
});

// ---------------------------------------------------------------------------
// hygiene: the model next to boot.rofl

test('loaded beside boot.rofl the model keeps its own relations and the audits stay empty', () => {
  const r = new Rofl();
  assert.equal(r.load(fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8')).ok, true);
  assert.equal(r.load(fs.readFileSync(path.join(ROOT, 'examples/blam/blam.rofl'), 'utf8')
    + `\nchanged(${QUOTED_DIFF}).`).ok, true);
  for (const audit of ['malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)']) {
    assert.equal(r.query(audit).rows.length, 0, `${audit} must be empty`);
  }
  // the same verdicts as without boot
  assert.deepEqual(affectedOf(r), affectedOf(utilsDiff()));
  // ...and the model's own names still do not collide with boot's. The edge
  // relation is called `needs` because boot.rofl concluded into `dep/2` for its
  // rule-dependency graph; those ten rules are gone, so THAT collision cannot
  // happen any more and the name is now historical. The check that still bites
  // is the general one it was an instance of: every relation boot concludes
  // must be free of this model's target terms, or the two programs are writing
  // into each other. `flow`/`flows_to` is the closure boot still carries.
  const boot = ['flow', 'flows_to', 'sees', 'perspective', 'rule_known',
    'gathered', 'crossing', 'collects_from'];
  let seen = 0;
  for (const rel of boot) {
    for (const d of r.query(`${rel}(A, B)`).rows.concat(r.query(`${rel}(A)`).rows)) {
      seen++;
      assert.doesNotMatch(d.text, /t\(/, `a target term in boot's ${rel} means the names collided`);
    }
  }
  assert.ok(seen > 0, 'positive control: boot really does populate relations here');
});
