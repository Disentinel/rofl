// demo.ts — BLAM: what a diff hits in a monorepo build graph, and WHY.
//
//   node --experimental-strip-types examples/blam/demo.ts
//
// Bazel, Nx and Turborepo compute the affected set correctly and fast. This
// computes the same set — and then answers the four questions none of them
// answer: why this target, why NOT that target, how many routes, and which
// single edge to cut.
//
// Everything printed is computed by the kernel from examples/blam/blam.rofl.
// Nothing in the transcript is composed by hand; README.md pastes this output.
// Every number is also computed a second time by an independent transitive
// closure written in plain TypeScript further down this file, which shares
// only the base facts, and the two are compared pair by pair.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, tropicalSemiring, unitFiringCost,
  provenanceSemiring, provenanceOf, renderCount, INFINITE,
  type Count, type Polynomial,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const BLAM = fs.readFileSync(path.join(HERE, 'blam.rofl'), 'utf8');

// ---------------------------------------------------------------------------
// the two scenarios the demo follows

/** A change in the kitchen-sink package: the everyday diff. */
export const DIFF_UTILS = 'packages/utils/src/str.ts';
/** A change in the global config: "why did the whole world rebuild". */
export const DIFF_CONFIG = 'config/build.config.json';
/** The target nobody expects to be spared, and is: the whynot subject. */
export const UNREACHED = 't(docs,build)';
/** The apex of the diamond — two routes from utils, so counting says 2. */
export const APEX = 't(web,build)';

// ---------------------------------------------------------------------------
// worlds

/** The build graph plus a diff. `changed/1` is not in blam.rofl: a build
 *  graph outlives any particular diff, so the diff is asserted per run. */
export function world(diff: string[]): Rofl {
  const r = new Rofl();
  const text = BLAM + '\n'
    + diff.map((f) => `changed(${JSON.stringify(f)}).`).join('\n') + '\n';
  const res = r.load(text);
  if (!res.ok) throw new Error('blam: load failed\n' + res.diagnostics.join('\n'));
  return r;
}

/** The same world with one dependency edge removed and the fixpoint recomputed
 *  from scratch — the graph as it would be after the refactor. */
export function withoutEdge(r: Rofl, from: string, to: string): Rofl {
  const scratch = Rofl.fromSnapshot(r.save());
  const res = scratch.retract(`pkg_dep(${from}, ${to})`);
  if (!res.ok) throw new Error('blam: retract failed\n' + res.diagnostics.join('\n'));
  scratch.evaluate();
  return scratch;
}

/** The same world with one FORBIDDEN edge added, closing a cycle in the
 *  package graph. Build tools reject such a graph at load; the point here is
 *  what the counting semiring does when nobody rejects it. */
export function withCycle(r: Rofl, from: string, to: string): Rofl {
  const scratch = Rofl.fromSnapshot(r.save());
  const res = scratch.load(`pkg_dep(${from}, ${to}).`);
  if (!res.ok) throw new Error('blam: cycle load failed\n' + res.diagnostics.join('\n'));
  return scratch;
}

// ---------------------------------------------------------------------------
// reading the world
//
// Query bindings come back in canonical term form: a target is the string
// `t(web,build)` and a file is the string `"packages/web/src/app.ts"`, quotes
// included. Fact keys are built from exactly those, so canonical form is what
// travels; `show` is only for the transcript.

export const show = (target: string): string =>
  target.replace(/^t\(/, '').replace(/\)$/, '').replace(',', ':');
export const unquote = (s: string): string => JSON.parse(s) as string;

/** A query column. `query` takes ONE literal — a conjunctive query is a parse
 *  error that arrives as `error` on the result, with zero rows, so a caller
 *  that only reads `.rows` prints an empty column and calls it data. Every
 *  read in this file goes through here, and here it throws. */
export function col(r: Rofl, q: string, v: string): string[] {
  const res = r.query(q);
  if (res.error) throw new Error(`blam: query ${q}: ${res.error}`);
  return res.rows.map((x) => x.bindings[v]);
}

export function rows(r: Rofl, q: string): Record<string, string>[] {
  const res = r.query(q);
  if (res.error) throw new Error(`blam: query ${q}: ${res.error}`);
  return res.rows.map((x) => x.bindings);
}

export const affectedOf = (r: Rofl): string[] => col(r, 'affected(T)', 'T').sort();

/** Every target of the repository, canonical form, in a stable order. */
export function allTargets(r: Rofl): string[] {
  const out: string[] = [];
  for (const p of col(r, 'package(P)', 'P').sort()) {
    out.push(`t(${p},build)`, `t(${p},test)`);
  }
  return out;
}

/** Every file the ownership map mentions. */
export const allFiles = (r: Rofl): string[] =>
  [...new Set(col(r, 'owns(T, F)', 'F'))].sort();

/** Declared CI cost per target, from the `minutes/3` table in blam.rofl. No
 *  rule reads it — v0 has no aggregation, so the money arithmetic is here. */
export function costTable(r: Rofl): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of rows(r, 'minutes(P, B, T)')) {
    out.set(`t(${b.P},build)`, Number(b.B));
    out.set(`t(${b.P},test)`, Number(b.T));
  }
  return out;
}

export const costOf = (cost: Map<string, number>, targets: string[]): number =>
  targets.reduce((s, t) => s + (cost.get(t) ?? 0), 0);

/** Word-wrap a list for the transcript, so no line of it needs a sideways
 *  scroll bar. Presentation only. */
export function wrap(items: string[], indent: string, width: number = 78): string[] {
  const out: string[] = [];
  let line = indent;
  for (const it of items) {
    if (line !== indent && line.length + 1 + it.length > width) { out.push(line); line = indent; }
    line += (line === indent ? '' : ' ') + it;
  }
  if (line !== indent) out.push(line);
  return out;
}

// ---------------------------------------------------------------------------
// the semiring folds

/** How many independent routes lead from the diff to each target. */
export function routeCounts(r: Rofl): { count: Map<string, Count>; cyclic: number } {
  const fold = evaluateSemiring(r.store, countingSemiring);
  const count = new Map<string, Count>();
  for (const [k, v] of fold.value) {
    const m = /^affected\[main\]\((.*)\)$/.exec(k);
    if (m) count.set(m[1], v);
  }
  return { count, cyclic: fold.cyclic };
}

/** Path count for every (file, target) pair, straight off `reaches`. */
export function pairCounts(r: Rofl): Map<string, Count> {
  const fold = evaluateSemiring(r.store, countingSemiring);
  const out = new Map<string, Count>();
  for (const [k, v] of fold.value) {
    const m = /^reaches\[main\]\((".*?"),(t\(.*\))\)$/.exec(k);
    if (m) out.set(`${m[1]}|${m[2]}`, v);
  }
  return out;
}

/** Depth in dependency edges from the diff to each affected target, from the
 *  tropical semiring. `unitFiringCost` charges 1 per rule firing; under these
 *  rules an affected target at H edges costs 2H + 2 firings exactly (one for
 *  `affected`, one for `reaches` at each hop, one for the `needs` edge under
 *  it, one for the base `reaches`). The identity is checked, not assumed. */
export function buildDepth(r: Rofl): Map<string, number> {
  const fold = evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost });
  const out = new Map<string, number>();
  for (const t of affectedOf(r)) {
    const cost = fold.value.get(`affected[main](${t})`);
    if (cost === undefined || cost === Infinity) continue;
    if ((cost - 2) % 2 !== 0) throw new Error(`cost ${cost} for ${t} is not 2H + 2`);
    out.set(t, (cost - 2) / 2);
  }
  return out;
}

/** Build waves: the targets at each depth, in order. Wave 0 can start the
 *  moment CI has the diff. */
export function waves(depth: Map<string, number>): string[][] {
  const max = Math.max(-1, ...depth.values());
  const out: string[][] = [];
  for (let d = 0; d <= max; d++) {
    out.push([...depth.entries()].filter(([, v]) => v === d).map(([t]) => t).sort());
  }
  return out;
}

// ---------------------------------------------------------------------------
// the fourth query: which single edge to cut
//
// The provenance semiring, with the base annotation carried ONLY by the
// `pkg_dep` facts, makes a monomial of `reaches(F, T)` the set of package
// edges one route uses. So:
//
//   * the routes from F to T are the monomials;
//   * an edge whose removal disconnects T from F is one that appears in
//     EVERY monomial — the intersection of the polynomial;
//   * an empty intersection means no single edge can do it, and the size of
//     the polynomial is the counting answer that said so.
//
// The `needs(t(P,test), t(P,build))` edge comes from `package/1`, which is
// not annotated, so it contributes the multiplicative identity: a test target
// inherits its build target's routes and no cut candidate of its own. That is
// correct — you cannot stop a test depending on its own build.

const EDGE_PREFIX = 'pkg_dep[main](';

export function edgeProvenance(r: Rofl): Map<string, Polynomial> {
  const fold = evaluateSemiring(r.store, provenanceSemiring, {
    base: (key) => (key.startsWith(EDGE_PREFIX) ? provenanceOf(key) : provenanceSemiring.one),
  });
  return fold.value;
}

export const edgeKey = (from: string, to: string): string => `${EDGE_PREFIX}${from},${to})`;
export const edgeName = (key: string): string =>
  key.slice(EDGE_PREFIX.length, -1).replace(',', ' -> ');

export const allEdges = (r: Rofl): string[] =>
  rows(r, 'pkg_dep(P, Q)').map((b) => edgeKey(b.P, b.Q)).sort();

/** The single-edge cuts for one (file, target) pair: the intersection of the
 *  polynomial. Empty when the target is unreachable, or when two routes share
 *  no edge — the diamond. */
export function cutsFor(prov: Map<string, Polynomial>, file: string, target: string): string[] {
  const poly = prov.get(`reaches[main](${file},${target})`);
  if (!poly || poly.length === 0) return [];
  let acc = poly[0].filter((k) => k.startsWith(EDGE_PREFIX));
  for (const m of poly.slice(1)) acc = acc.filter((k) => m.includes(k));
  return acc.sort();
}

export interface CutRow {
  edge: string;
  pairs: number;     // (changed file, target) couplings the cut removes
  minutes: number;   // CI minutes those couplings cost, summed over all files
}

/** Every cuttable edge, scored over EVERY single-file diff the repository
 *  admits. `minutes` is the total rebuild time that stops being triggered;
 *  divide by the number of files for the per-diff expectation. */
export function cutRanking(r: Rofl): CutRow[] {
  const prov = edgeProvenance(r);
  const cost = costTable(r);
  const files = allFiles(r);
  const targets = allTargets(r);
  const rows: CutRow[] = [];
  for (const edge of allEdges(r)) {
    let pairs = 0, minutes = 0;
    for (const f of files) {
      for (const t of targets) {
        if (cutsFor(prov, f, t).includes(edge)) { pairs++; minutes += cost.get(t) ?? 0; }
      }
    }
    rows.push({ edge, pairs, minutes });
  }
  return rows.sort((a, b) => b.minutes - a.minutes || b.pairs - a.pairs
    || (a.edge < b.edge ? -1 : 1));
}

/** For one diff: which targets each edge would decouple, and what that saves.
 *  Sorted by minutes saved. */
export function cutForDiff(r: Rofl, diff: string[]): { edge: string; frees: string[]; minutes: number }[] {
  const prov = edgeProvenance(r);
  const cost = costTable(r);
  const affected = affectedOf(r);
  const out: { edge: string; frees: string[]; minutes: number }[] = [];
  for (const edge of allEdges(r)) {
    const frees = affected.filter((t) =>
      diff.every((f) => cutsFor(prov, JSON.stringify(f), t).includes(edge)));
    if (frees.length > 0) out.push({ edge, frees, minutes: costOf(cost, frees) });
  }
  return out.sort((a, b) => b.minutes - a.minutes || (a.edge < b.edge ? -1 : 1));
}

// ---------------------------------------------------------------------------
// THE ORACLE — the same closure, computed a second time, without the engine
//
// Shares the base facts and nothing else: no rules, no derived relations, no
// semiring. Plain memoized depth-first counting over the target graph, which
// is what a build tool does. Disagreement is a finding, not a tuning knob.

export interface BaseGraph {
  packages: string[];
  pkgDeps: [string, string][];
  owns: [string, string][];     // [target, file], both canonical
}

export function baseGraph(r: Rofl): BaseGraph {
  return {
    packages: col(r, 'package(P)', 'P').sort(),
    pkgDeps: rows(r, 'pkg_dep(P, Q)').map((b) => [b.P, b.Q] as [string, string]),
    owns: rows(r, 'owns(T, F)').map((b) => [b.T, b.F] as [string, string]),
  };
}

/** target -> the targets it needs, built from the package graph the way the
 *  two graph rules do, but by hand. */
export function oracleEdges(g: BaseGraph): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of g.packages) {
    out.set(`t(${p},build)`, []);
    out.set(`t(${p},test)`, [`t(${p},build)`]);
  }
  for (const [p, q] of g.pkgDeps) out.get(`t(${p},build)`)!.push(`t(${q},build)`);
  return out;
}

/** Number of distinct dependency paths from `target` down to a target that
 *  owns `file`. Memoized; the recursion stack is the cycle guard, so a cyclic
 *  package graph throws here instead of returning a wrong finite number. */
export function oraclePaths(g: BaseGraph, file: string): Map<string, number> {
  const edges = oracleEdges(g);
  const ownedBy = new Set(g.owns.filter(([, f]) => f === file).map(([t]) => t));
  const memo = new Map<string, number>();
  const onStack = new Set<string>();
  const visit = (t: string): number => {
    const hit = memo.get(t);
    if (hit !== undefined) return hit;
    if (onStack.has(t)) throw new Error(`oracle: cycle in the package graph at ${t}`);
    onStack.add(t);
    let n = ownedBy.has(t) ? 1 : 0;
    for (const u of edges.get(t) ?? []) n += visit(u);
    onStack.delete(t);
    memo.set(t, n);
    return n;
  };
  for (const t of edges.keys()) visit(t);
  return memo;
}

export interface OracleReport {
  files: number;
  targets: number;
  pairs: number;              // sample size: (changed file, target) comparisons
  verdictMismatch: number;
  countMismatch: number;
  disagreements: string[];
}

/** Every file of the repository taken as a single-file diff, against every
 *  target: the engine's affected set and route count versus the oracle's. */
export function oracleCheck(): OracleReport {
  const probe = world([]);
  const g = baseGraph(probe);
  const files = allFiles(probe);
  const targets = allTargets(probe);
  const report: OracleReport = {
    files: files.length, targets: targets.length, pairs: 0,
    verdictMismatch: 0, countMismatch: 0, disagreements: [],
  };
  for (const qf of files) {
    const file = unquote(qf);
    const r = world([file]);
    const engineSet = new Set(affectedOf(r));
    const engineCount = routeCounts(r).count;
    const truth = oraclePaths(g, qf);
    for (const t of targets) {
      report.pairs++;
      const oracleN = truth.get(t) ?? 0;
      const engineIn = engineSet.has(t);
      if (engineIn !== (oracleN > 0)) {
        report.verdictMismatch++;
        report.disagreements.push(
          `${file} -> ${show(t)}: engine ${engineIn ? 'affected' : 'not affected'}, oracle ${oracleN} path(s)`);
      }
      const engineN = engineIn ? engineCount.get(t) : 0n;
      if (engineN !== BigInt(oracleN)) {
        report.countMismatch++;
        report.disagreements.push(
          `${file} -> ${show(t)}: engine ${renderCount(engineN as Count)} route(s), oracle ${oracleN}`);
      }
    }
  }
  return report;
}

// ---------------------------------------------------------------------------
// the transcript

const WIDTH = 78;

function main(): void {
  const t0 = Date.now();
  const say = (s: string = '') => { console.log(s); };
  const rule = (title: string) => { say(); say(('== ' + title + ' ').padEnd(WIDTH, '=')); };
  const verdicts: string[] = [];
  const check = (what: string, ok: boolean) => {
    verdicts.push(`${ok ? 'AGREE   ' : 'DISAGREE'}  ${what}`);
    say(`  oracle: ${ok ? 'AGREE' : 'DISAGREE'} — ${what}`);
  };

  const r = world([DIFF_UTILS]);
  const cost = costTable(r);
  const targets = allTargets(r);
  const files = allFiles(r);

  say('BLAM — what a diff hits, and why.');
  say('affected targets in a monorepo build graph, computed by the ROFL kernel');
  say();
  say(`graph   ${col(r, 'package(P)', 'P').length} packages, `
    + `${allEdges(r).length} dependency edges, `
    + `${targets.length} targets, ${files.length} files`);
  say(`rules   examples/blam/blam.rofl — 2 build the target graph, 3 are the inquiry`);
  say(`diff    ${DIFF_UTILS}`);

  // -- 0 -------------------------------------------------------------------
  rule('0. the repository');
  const edges = oracleEdges(baseGraph(r));
  for (const p of col(r, 'package(P)', 'P').sort()) {
    const deps = col(r, `pkg_dep(${p}, Q)`, 'Q').sort();
    const own = rows(r, `owns(t(${p}, K), F)`)
      .map((b) => `${unquote(b.F)}${b.K === 'test' ? ' [test]' : ''}`).sort();
    say(`  ${p.padEnd(7)} needs ${(deps.join(' ') || '—').padEnd(14)} `
      + `${String(cost.get(`t(${p},build)`)).padStart(3)}+${String(cost.get(`t(${p},test)`)).padStart(3)} min`);
    for (const l of wrap(own, '            ')) say(l);
  }
  say(`  ${edges.size} targets in all; every package has a build and a test target, and the`);
  say('  test target needs its own build. Files marked [test] belong to the test');
  say('  target, so nothing downstream depends on them.');
  say();
  const shared = allFiles(r).find((f) =>
    rows(r, `owns(T, ${f})`).length > 1);
  const owners = col(r, `owns(T, ${shared})`, 'T');
  say(`  ${unquote(shared!)} has ${owners.length} owners: ${owners.map(show).join(' and ')}.`);
  say('  Ownership is many-to-many (both code-generate from it), which is exactly');
  say('  what a package-per-directory model cannot say.');

  // -- 1 -------------------------------------------------------------------
  rule('1. what CI will rebuild');
  const affected = affectedOf(r);
  const spared = targets.filter((t) => !affected.includes(t));
  say(`one file changed. ${affected.length} of ${targets.length} targets are affected:`);
  for (const l of wrap(affected.map(show), '  ')) say(l);
  say(`spared: ${spared.map(show).join(' ')}`);
  say(`cost:   ${costOf(cost, affected)} minutes of the repository's ${costOf(cost, targets)}`);
  say();
  say('Bazel, Nx and Turborepo print this set too, and it is the same set.');
  say('Everything below is what they do not print.');

  // -- 2 -------------------------------------------------------------------
  rule(`2. why did CI rebuild ${show(APEX)}? I never touched it`);
  say(`$ why affected(${APEX})`);
  say(r.why(`affected(${APEX})`).text);
  say();
  say('every edge is named. Read the axioms upward and that is the sentence a');
  say('build tool cannot produce: the file is owned by utils:build, api needs');
  say('utils, web needs api.');

  // -- 3 -------------------------------------------------------------------
  rule(`3. why did CI NOT rebuild ${show(UNREACHED)}? I am sure I broke it`);
  say('the dangerous half. An empty result is not an answer — this is the front');
  say('where the reachability walk stopped, and it is what a missed regression');
  say('looks like before it becomes an incident.');
  say();
  say(`$ whynot affected(${UNREACHED})`);
  const wn = r.whynot(`affected(${UNREACHED})`, { depth: 8, nodes: 64 });
  say(wn.text);
  say();
  say(`${show(UNREACHED)} owns no changed file, and neither of the two targets it`);
  say('needs is reached; config:build has no dependencies at all, so the walk ends');
  say('there. If docs really does import utils, THAT is the bug: the edge is');
  say('missing from the build graph, and CI has been silently not testing it.');

  // -- 4 -------------------------------------------------------------------
  rule('4. how many independent routes? (counting)');
  const { count, cyclic } = routeCounts(r);
  for (const t of affected) say(`  ${show(t).padEnd(14)} ${renderCount(count.get(t)!)}`);
  say();
  say(`${show(APEX)} is reached TWICE: web needs api, api needs utils; and web needs`);
  say('ui, ui needs utils. That is the diamond, and the number is why no single');
  say('dependency removal will keep web out of this rebuild (section 6).');
  say();
  say(`the counting fold reports cyclic: ${cyclic} — no fact in this store lies on a`);
  say('cycle of the support hypergraph, because a build graph is acyclic by');
  say('construction. THAT is what makes the number finite and meaningful, not');
  say('anything about these rules. The same semiring instance on a cyclic graph:');
  const cyc = withCycle(r, 'utils', 'ui');
  const cycFold = routeCounts(cyc);
  say();
  say('  $ load pkg_dep(utils, ui).      -- one forbidden edge: utils <-> ui');
  say(`  cyclic: ${cycFold.cyclic}`);
  for (const t of affectedOf(cyc)) say(`  ${show(t).padEnd(14)} ${renderCount(cycFold.count.get(t)!)}`);
  say();
  say('the instance is CLOSED and carries a star, so it answers "infinitely many"');
  say('rather than growing forever. Correct, and useless — which is the reason to');
  say('state the acyclicity in the rule file instead of relying on it silently.');

  // -- 5 -------------------------------------------------------------------
  rule('5. in what order? (tropical)');
  const depth = buildDepth(r);
  const ws = waves(depth);
  ws.forEach((w, d) => {
    say(`  wave ${d}   ${w.map(show).join(' ').padEnd(40)} `
      + `${String(costOf(cost, w)).padStart(4)} min`);
  });
  say();
  say(`${ws.length} waves. Wave 0 can start the moment CI has the diff; everything else`);
  say('waits on the wave above it. Min-plus gives the EARLIEST wave a target can');
  say('be reached in — a lower bound on when it may start, not a schedule: a real');
  say('scheduler wants the longest path, and that is a different semiring.');

  // -- 6 -------------------------------------------------------------------
  rule('6. which single edge should we cut? (provenance + tropical)');
  say('the question that turns the report into a design decision. An edge whose');
  say('removal disconnects a target from a file is one that lies on EVERY route:');
  say('the intersection of the provenance polynomial, folded over `pkg_dep` alone.');
  say();
  say('over every single-file diff this repository admits:');
  say('  edge              pairs cut   minutes no longer triggered');
  const ranking = cutRanking(r);
  for (const row of ranking) {
    say(`  ${edgeName(row.edge).padEnd(18)}${String(row.pairs).padStart(6)}   `
      + `${String(row.minutes).padStart(9)}`);
  }
  const top = ranking[0];
  const mostPairs = [...ranking].sort((a, b) => b.pairs - a.pairs)[0];
  say();
  say(`cut ${edgeName(top.edge)} and ${top.minutes} minutes of rebuild stop being triggered`);
  say(`across the ${files.length} single-file diffs — more than any other single edge. It is`);
  say(`NOT the edge that decouples the most PAIRS: that is ${edgeName(mostPairs.edge)}, at ${mostPairs.pairs} pairs`);
  say(`and ${mostPairs.minutes} minutes. Counting couplings and counting money rank the graph`);
  say('differently, and only one of them is the question anybody actually has.');
  say(`Three edges score zero: cutting ${ranking.filter((x) => x.pairs === 0).map((x) => edgeName(x.edge)).join(', ')}`);
  say('decouples nothing at all, because every route they carry has an alternative.');
  say();
  say(`for the diff at hand (${DIFF_UTILS}):`);
  const perDiff = cutForDiff(r, [DIFF_UTILS]);
  for (const row of perDiff) {
    say(`  cut ${edgeName(row.edge).padEnd(16)} frees ${row.frees.map(show).join(' ').padEnd(34)} `
      + `${String(row.minutes).padStart(4)} min`);
  }
  const best = perDiff[0];
  const prov = edgeProvenance(r);
  say();
  say(`  ${show(APEX)} appears in no row: the intersection of its two routes is`);
  say(`  ${cutsFor(prov, JSON.stringify(DIFF_UTILS), APEX).length} edges wide. No single cut removes it — and the count of 2 in`);
  say('  section 4 and this empty intersection are the same fact seen twice.');
  say();
  const [bf, bt] = edgeName(best.edge).split(' -> ');
  say(`  $ retract pkg_dep(${bf}, ${bt})   -- and re-run the fixpoint`);
  const cutWorld = withoutEdge(r, bf, bt);
  const cutAffected = affectedOf(cutWorld);
  say(`  affected: ${affected.length} targets / ${costOf(cost, affected)} min  ->  `
    + `${cutAffected.length} targets / ${costOf(cost, cutAffected)} min`);
  for (const l of wrap(cutAffected.map(show), '  ')) say(l);
  const predicted = affected.filter((t) => !best.frees.includes(t));
  check(`the predicted blast radius of cutting ${edgeName(best.edge)}`,
    predicted.length === cutAffected.length && predicted.every((t, i) => t === cutAffected[i]));
  const cutWaves = waves(buildDepth(cutWorld));
  say(`  waves: ${ws.length} -> ${cutWaves.length}. The critical depth does not move, because`);
  say(`  ${show(APEX)} is still reached — through ui. To take web out of a utils diff you`);
  say('  must cut both branches of the diamond, which is what the 2 was telling you.');

  // -- 7 -------------------------------------------------------------------
  rule('7. the other diff: one line in the global config');
  const cfg = world([DIFF_CONFIG]);
  const cfgAffected = affectedOf(cfg);
  const cfgCount = routeCounts(cfg).count;
  say(`$ changed(${JSON.stringify(DIFF_CONFIG)})`);
  say(`affected: ${cfgAffected.length} of ${targets.length} targets — the whole repository, `
    + `${costOf(cost, cfgAffected)} minutes.`);
  say('routes from that one file to each target:');
  for (const t of cfgAffected) say(`  ${show(t).padEnd(14)} ${renderCount(cfgCount.get(t)!)}`);
  say();
  say(`${show(APEX)} is reached FIVE ways. "Delete one dependency and the config stops`);
  say('rebuilding web" is false, and the number says how false: you would have to');
  say('cut five routes. This is the commonest real pathology in a monorepo, and');
  say('it is the one an affected-set tool reports as a single word.');
  say();
  say(`$ why affected(t(config,test))`);
  say(cfg.why('affected(t(config,test))').text);

  // -- oracle --------------------------------------------------------------
  rule('the oracle');
  say('the same transitive closure computed a second time in plain TypeScript,');
  say('sharing only the base facts — no rules, no derived relations, no semiring.');
  say('Every file of the repository taken as a single-file diff, against every');
  say('target, on both the verdict and the route count.');
  say();
  const rep = oracleCheck();
  say(`  sample: ${rep.files} files x ${rep.targets} targets = ${rep.pairs} (changed file, target) pairs`);
  say(`  verdict mismatches: ${rep.verdictMismatch}`);
  say(`  route-count mismatches: ${rep.countMismatch}`);
  for (const d of rep.disagreements.slice(0, 20)) say(`    ${d}`);
  check(`${rep.pairs} (changed file, target) pairs, verdict and route count`,
    rep.disagreements.length === 0);

  rule('summary');
  say(`${verdicts.length} comparisons against an independent closure:`);
  for (const v of verdicts) say('  ' + v);
  const bad = verdicts.filter((v) => v.startsWith('DISAGREE')).length;
  say();
  say(bad === 0
    ? 'the engine and the hand-written closure compute the same sets and the same counts.'
    : `${bad} DISAGREEMENT(S) — that is the finding; the engine's answer stands as computed.`);
  say(`(${Date.now() - t0} ms)`);
  if (bad > 0) process.exitCode = 1;
}

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1]
  && real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) main();
