// demo.ts — OOPS: the retraction cascade, end to end.
//
//   node --experimental-strip-types examples/oops/demo.ts
//
// Everything printed here is computed by the kernel from examples/oops/oops.rofl.
// Nothing in the transcript is composed by hand; README.md pastes this output.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, tropicalSemiring, unitFiringCost,
  provenanceSemiring, provenanceOf, renderProvenance, renderCount, INFINITE,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
export const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
export const OOPS = fs.readFileSync(path.join(HERE, 'oops.rofl'), 'utf8');

/** The seed year written into oops.rofl; `asOf` swaps it out. */
export const SEED_YEAR = 2020;
export const NOW = 2025;

/** A world at tick 0, clock at the seed year, ready to be run forward. */
export function world(): Rofl {
  const r = new Rofl();
  ok(r.load(BOOT), 'boot.rofl');
  ok(r.load(OOPS), 'oops.rofl');
  return r;
}

/** The same world evaluated directly AT a year, with no ticks run: the
 *  ledger is identical, only the clock differs. "What was reliable on date
 *  T" as one query rather than a simulation. */
export function asOf(year: number): Rofl {
  const r = world();
  if (!r.retract(`clock(${SEED_YEAR})`).ok) throw new Error('clock seed not found');
  ok(r.assert(`clock(${year}).`), `clock(${year})`);
  r.evaluate();
  return r;
}

/** The world run forward from the seed year to `year`, one tick per year. */
export function simulateTo(year: number, onYear?: (r: Rofl) => void): Rofl {
  const r = world();
  r.run({ maxTicks: year - SEED_YEAR, onBoundary: onYear });
  r.evaluate();
  return r;
}

function ok(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what}: ${res.diagnostics.join('; ')}`);
}

export const col = (r: Rofl, q: string, v: string): string[] =>
  r.query(q).rows.map((x) => x.bindings[v]);
export const pairs = (r: Rofl, q: string, a: string, b: string): [string, string][] =>
  r.query(q).rows.map((x) => [x.bindings[a], x.bindings[b]] as [string, string]);
const clockOf = (r: Rofl): string => col(r, 'clock(Y)', 'Y')[0];
const list = (xs: string[]): string => (xs.length === 0 ? '-' : xs.join(', '));

/** Domain facts only: what an observer of this world can see. Kernel
 *  reflection, boot's audits and provenance are excluded. */
const DOMAIN = /^(paper|depends_on|mentions|direct_citation|retracted|unretracted|tainted|tainted_by|grounded|at_risk|at_risk_from|robust|own_evidence|has_pillar|cited_before_retraction|cited_after_retraction)\[/;
export const domainFacts = (r: Rofl): string[] => r.factKeys().filter((k) => DOMAIN.test(k)).sort();

/** Citation distance to the nearest retracted foundation, from the tropical
 *  semiring. `unitFiringCost` charges 1 per rule firing; under these rules a
 *  taint costs 1 firing for the edge, 1 for the retraction and 1 per further
 *  hop, so cost = 2*hops + 1 exactly. The demo checks that identity rather
 *  than assuming it. */
export function citationDistance(r: Rofl): Map<string, number> {
  const fold = evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost });
  const out = new Map<string, number>();
  for (const p of col(r, 'tainted(P)', 'P')) {
    const cost = fold.value.get(`tainted[main](${p})`);
    if (cost === undefined || cost === Infinity) continue;
    if ((cost - 1) % 2 !== 0) throw new Error(`cost ${cost} for ${p} is not 2*hops+1`);
    out.set(p, (cost - 1) / 2);
  }
  return out;
}

/** Robustness: how many independent support chains reach un-retracted
 *  original evidence. INFINITE means the citation graph has a cycle through
 *  this paper — an honest answer to "how many derivations", and a refusal to
 *  pretend it is a strength score. */
export function robustness(r: Rofl): { count: Map<string, bigint | typeof INFINITE>; cyclic: number } {
  const fold = evaluateSemiring(r.store, countingSemiring);
  const count = new Map<string, bigint | typeof INFINITE>();
  for (const p of col(r, 'paper(P)', 'P')) {
    count.set(p, fold.value.get(`grounded[main](${p})`) ?? 0n);
  }
  return { count, cyclic: fold.cyclic };
}

// ---------------------------------------------------------------------------

const rule = (t: string) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 68 - t.length))}`);

function main(): void {
  const t0 = Date.now();
  console.log('OOPS — the retraction cascade.  A paper is retracted; what is now in doubt?');

  // -- the world ------------------------------------------------------------
  const full = asOf(2026);
  const papers = col(full, 'paper(P)', 'P');
  const cites = full.query('citation(A, B, K, Y)').rows.length;
  const lb = full.query('citation(A, B, load_bearing, Y)').rows.length;
  rule('the world');
  console.log(`${papers.length} papers, ${cites} citation edges (${lb} load-bearing, ${cites - lb} mention),`);
  console.log(`${col(full, 'retraction(P, Y)', 'P').length} retractions, `
    + `${col(full, 'unretraction(P, Y)', 'P').length} un-retraction. Synthetic; see README.md.`);

  // -- 1. the retraction ----------------------------------------------------
  const now = simulateTo(NOW);
  const dist = citationDistance(now);
  rule(`1. the retraction  (clock ${clockOf(now)}, ${now.store.tick} ticks run)`);
  const retractions = pairs(now, 'retraction(P, Y)', 'P', 'Y')
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  for (const [p, y] of retractions) {
    const direct = pairs(now, 'direct_citation(A, P2)', 'A', 'P2').filter(([, b]) => b === p);
    const bearing = pairs(now, 'depends_on(A, P2)', 'A', 'P2').filter(([, b]) => b === p);
    const risk = col(now, `at_risk_from(P, ${p})`, 'P');
    const rob = col(now, 'robust(P)', 'P').filter((x) => now.holds(`tainted_by(${x}, ${p})`));
    console.log(`\n$ oops ${p}`);
    console.log(`retracted ${y}.`);
    console.log('');
    console.log(`  direct citations:  ${String(direct.length).padStart(3)}   `
      + `(${bearing.length} load-bearing, ${direct.length - bearing.length} mention)`);
    console.log(`  at risk:           ${String(risk.length).padStart(3)}   `
      + '(every argument chain runs through the retraction)');
    console.log(`  robust:            ${String(rob.length).padStart(3)}   `
      + '(touched, but independently supported)');
    console.log('');
    for (const x of risk.sort((a, b) => (dist.get(a)! - dist.get(b)!) || (a < b ? -1 : 1))) {
      const via = col(now, `depends_on(${x}, B)`, 'B');
      const h = dist.get(x)!;
      console.log(`    ${'  '.repeat(h - 1)}${x}  ← ${h} hop${h === 1 ? '' : 's'}, `
        + `${via.length === 1 ? 'sole support' : 'all support tainted'}: ${list(via)}`);
    }
  }

  // -- 2. citation is not dependency ----------------------------------------
  rule('2. a citation is not a dependency');
  console.log('  everyone who cites the retracted helix_2019, and what became of them:');
  for (const a of col(now, 'direct_citation(A, helix_2019)', 'A')) {
    const bearing = now.holds(`depends_on(${a}, helix_2019)`);
    const verdict = bearing
      ? (now.holds(`at_risk(${a})`) ? 'AT RISK — every chain runs through it'
        : 'robust — it has another pillar')
      : (now.holds('tainted_by(' + a + ', helix_2019)')
        ? 'this edge carries nothing; poisoned anyway, through its own chain'
        : 'untouched — this edge carries nothing');
    console.log(`    ${a.padEnd(18)} ${(bearing ? 'load-bearing' : 'mention     ')}  ->  ${verdict}`);
  }
  console.log('\n  review_2021 and yield_2020 both cite the retracted paper. Every retraction');
  console.log('  tool available today calls them the same thing.');

  // -- 3. the stop ----------------------------------------------------------
  rule('3. where the cascade stops');
  console.log(`  at risk: ${list(col(now, 'at_risk(P)', 'P'))}`);
  console.log(`  robust:  ${list(col(now, 'robust(P)', 'P'))}`);
  console.log('\n  $ whynot at_risk(meta_2022)');
  for (const l of now.whynot('at_risk[main](meta_2022)').text.split('\n')) console.log(`  ${l}`);
  console.log('\n  policy_2023 depends only on meta_2022, and meta_2022 stands:');
  console.log(`    tainted(policy_2023)  = ${now.holds('tainted(policy_2023)')}`
    + `   at_risk(policy_2023) = ${now.holds('at_risk(policy_2023)')}`);

  // -- 4. why ---------------------------------------------------------------
  rule('4. why  (the chain from a conclusion down to the retraction)');
  console.log('  $ why at_risk(scaleup_2021)');
  for (const l of now.why('at_risk[main](scaleup_2021)').text.split('\n')) console.log(`  ${l}`);

  // -- 5. excise ------------------------------------------------------------
  rule('5. excise  (the blast radius as a diff, and the oracle)');
  for (const root of ['helix_2019', 'assay_2017']) {
    const [, year] = pairs(now, `retraction(${root}, Y)`, 'P', 'Y')[0]
      ?? ['', col(now, `retraction(${root}, Y)`, 'Y')[0]];
    const ex = now.excise(`retraction(${root}, ${year})`);
    if (!ex.ok) throw new Error(ex.error);
    const pick = (ks: string[], rel: string) =>
      ks.filter((k) => k.startsWith(`${rel}[main](`))
        .map((k) => k.slice(rel.length + 7, -1)).sort();
    const removedRisk = pick(ex.removed, 'at_risk');
    const derivedRisk = col(now, `at_risk_from(P, ${root})`, 'P').sort();
    const removedTaint = pick(ex.removed, 'tainted');
    const derivedTaint = pairs(now, `tainted_by(P, ${root})`, 'P', 'R').map(([p]) => p).sort();
    const agree = JSON.stringify(removedRisk) === JSON.stringify(derivedRisk)
      && JSON.stringify(removedTaint) === JSON.stringify(derivedTaint);
    console.log(`\n  $ excise retraction(${root}, ${year})`);
    console.log(`    ${ex.removed.length} facts removed, ${ex.added.length} added`);
    console.log(`    at_risk removed by excise : ${list(removedRisk)}`);
    console.log(`    at_risk_from(P, ${root}) : ${list(derivedRisk)}`);
    console.log(`    tainted removed by excise : ${list(removedTaint)}`);
    console.log(`    ORACLE (two independent computations): ${agree ? 'AGREE' : 'DISAGREE'}`);
    console.log(`    restored by the excision  : ${list(pick(ex.added, 'grounded'))}`);
    console.log(`    still at risk (other root): `
      + `${list(col(now, 'at_risk(P)', 'P').filter((p) => !removedRisk.includes(p)))}`);
  }

  // -- 6. semirings ---------------------------------------------------------
  rule('6. counting is the robustness metric');
  const still = asOf(NOW);
  const { count, cyclic } = robustness(still);
  const ticked = robustness(now);
  console.log('  independent support chains reaching un-retracted original evidence:');
  for (const p of col(still, 'paper(P)', 'P')) {
    const c = count.get(p)!;
    const tag = still.holds(`at_risk(${p})`) ? 'AT RISK'
      : still.holds(`robust(${p})`) ? 'robust'
      : still.holds(`retracted(${p})`) ? 'RETRACTED' : 'untouched';
    console.log(`    ${p.padEnd(18)} ${renderCount(c).padStart(16)}  ${tag}`);
  }
  console.log(`\n  INFINITE is not an error: preprint_a and preprint_b cite each other, so`);
  console.log('  each trip round that cycle is another derivation. Real citation graphs');
  console.log('  contain cycles; the engine says so instead of picking a number.');
  const agree = col(still, 'paper(P)', 'P').filter((p) => count.get(p) === ticked.count.get(p));
  console.log(`\n  Folded over the store evaluated at clock ${NOW} with no ticks run:`);
  console.log(`    ${cyclic} facts lie on a cycle of the support graph.`);
  console.log('  Folded over the tick-simulated store instead:');
  console.log(`    ${ticked.cyclic} facts do, and calib_2014 — a paper that cites nothing —`);
  console.log(`    scores ${renderCount(ticked.count.get('calib_2014')!)}.`);
  console.log(`  The two stores agree on ${agree.length} of ${count.size} papers.`);
  console.log('  An @next carry rule makes every ledger fact its own support one tick');
  console.log('  back; that self-loop used to be walked, and past tick 0 the count was');
  console.log('  about time travel rather than citations. The fold is about ONE tick now,');
  console.log('  so a carried fact is a given in it. Same Boolean world (section 8), and');
  console.log('  the same numbers about it. See README.md.');

  rule('7. tropical: distance, provenance: which retraction');
  const d2 = citationDistance(still);
  console.log('  citation distance to the nearest retracted foundation:');
  for (const p of [...d2.keys()].sort((a, b) => (d2.get(a)! - d2.get(b)!) || (a < b ? -1 : 1))) {
    console.log(`    ${String(d2.get(p)).padStart(2)}  ${p}`);
  }
  const prov = evaluateSemiring(still.store, provenanceSemiring, { base: provenanceOf });
  console.log('\n  which base facts an at-risk verdict rests on:');
  for (const p of ['scaleup_2021', 'panel_2018']) {
    console.log(`    at_risk(${p})`);
    for (const t of renderProvenance(prov.value.get(`at_risk[main](${p})`) ?? []).split(' | ')) {
      for (const s of t.split(' + ')) console.log(`      ${s}`);
    }
  }

  // -- 8. time --------------------------------------------------------------
  rule('8. the knowledge state is a function of the tick');
  const timeline: string[] = [];
  const sim = world();
  const snap = (r: Rofl) => timeline.push(`  ${clockOf(r)}  `
    + `retracted: ${list(col(r, 'retracted(P)', 'P')).padEnd(26)}`
    + `at risk: ${list(col(r, 'at_risk(P)', 'P'))}`);
  sim.run({ maxTicks: 6, onBoundary: snap });
  sim.evaluate();
  snap(sim);
  for (const l of timeline) console.log(l);
  console.log('\n  2022 the older retraction lands. 2024 the loud one lands. 2025 a new paper');
  console.log('  cites it anyway. 2026 the retraction is itself retracted, and cascade A is');
  console.log('  restored — not patched: the facts are simply derived again.');

  console.log('\n  citing before a retraction is an honest mistake; citing after is not:');
  for (const [a, b] of pairs(now, 'cited_after_retraction(A, B)', 'A', 'B')) {
    console.log(`    AFTER  ${a} -> ${b}  (cited `
      + `${col(now, `citation(${a}, ${b}, K, Y)`, 'Y')[0]}, retracted `
      + `${col(now, `retraction(${b}, Y)`, 'Y')[0]})`);
  }
  for (const [a, b] of pairs(now, 'cited_before_retraction(A, B)', 'A', 'B')) {
    console.log(`    before ${a} -> ${b}  (cited `
      + `${col(now, `citation(${a}, ${b}, K, Y)`, 'Y')[0]}, retracted `
      + `${col(now, `retraction(${b}, Y)`, 'Y')[0]})`);
  }

  console.log('\n  the past is still queryable at the current tick — frozen provenance:');
  const past = now.query('derived_by(F, R, 4)').rows
    .map((x) => x.bindings.F).filter((f) => f.startsWith('$fact(at_risk,'));
  console.log(`    tick 4 (year 2024) derived ${past.length} at_risk facts, still on record now:`);
  for (const f of past) console.log(`      ${f}`);
  console.log(`    at tick ${now.store.tick} (year ${clockOf(now)}) the set is: `
    + `${list(col(now, 'at_risk(P)', 'P'))}`);

  console.log('\n  the same state without simulating: one query at a chosen clock.');
  for (const y of [2021, 2023, 2024, 2026]) {
    const s = asOf(y);
    console.log(`    as of ${y}:  at risk: ${list(col(s, 'at_risk(P)', 'P'))}`);
  }
  const a = domainFacts(asOf(NOW));
  const b = domainFacts(now);
  console.log(`\n  simulated-through-ticks vs evaluated-at-${NOW}: `
    + `${a.length} vs ${b.length} domain facts, `
    + `${JSON.stringify(a) === JSON.stringify(b) ? 'IDENTICAL' : 'DIFFERENT'}.`);

  console.log(`\n(${Date.now() - t0} ms)`);
}

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1]
  && real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) main();
