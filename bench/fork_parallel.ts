// fork_parallel.ts — does putting independent forks on worker threads pay, and
// is the answer still the same answer?
//
// Two arms over the SAME task module (`bench/fork_task_wtf.ts`), interleaved
// ABABAB in one sitting, because absolutes on this box move with the load and
// ratios from interleaved arms do not:
//
//   A  sequential : setup(base) once, then run(ctx, branch) for every branch
//   B  parallel   : runtime/fork_pool.ts, P workers, same setup, same run
//
// and then the gate, which is the point of the exercise rather than a check on
// it: every branch's `canonicalState()` from arm B must equal arm A's BYTE FOR
// BYTE, and the aggregate the demo actually reports must be identical too.
//
//   node --experimental-strip-types bench/fork_parallel.ts
//   node --experimental-strip-types bench/fork_parallel.ts --mutants
//   node --experimental-strip-types bench/fork_parallel.ts --reps 5 --workers 8

import * as path from 'node:path';
import { availableParallelism, loadavg } from 'node:os';
import { runForks } from '../runtime/fork_pool.ts';
import * as W from '../examples/wtf/demo.ts';
import * as T from './fork_task_wtf.ts';

const TASK = path.resolve(import.meta.dirname, 'fork_task_wtf.ts');
const ms = (): number => Number(process.hrtime.bigint()) / 1e6;
const arg = (n: string, d: number): number => {
  const i = process.argv.indexOf(n);
  return i < 0 ? d : Number(process.argv[i + 1]);
};

const REPS = arg('--reps', 3);
const P = arg('--workers', availableParallelism());
const MUTANTS = process.argv.includes('--mutants');
/** Return only the digest, not the 762 KB canonical world. The oracle is the
 *  GATE's payload; a production search does not pay it, and separating the two
 *  is the difference between measuring the workload and measuring the check. */
const NO_ORACLE = process.argv.includes('--no-oracle');
/** Sweep the worker count instead of running the gate: 1, 2, 4, 8, ... */
const SWEEP = process.argv.includes('--sweep');

// ---------------------------------------------------------------------------

function sequential(base: string, branches: T.Branch[]): T.Answer[] {
  const ctx = T.setup(base);
  return branches.map((b) => T.run(ctx, b));
}

/** The aggregate `runSweeps` actually reports: how many DISTINCT answers each
 *  sublayer has over all orders of its effects. This is what a user would see
 *  move if the parallel arm were wrong in a way the per-branch bytes hid. */
function aggregate(branches: T.Branch[], answers: T.Answer[]): string {
  const bySweep = new Map<string, Set<string>>();
  branches.forEach((b, i) => {
    const k = `${b.layer}${b.scope ? '/' + b.scope : ''}`;
    if (!bySweep.has(k)) bySweep.set(k, new Set());
    bySweep.get(k)!.add(answers[i]?.digest ?? '(missing)');
  });
  return [...bySweep.entries()].map(([k, s]) => `${k}: ${s.size}`).join('  ');
}

/** The gate. Returns the first difference, or null. */
function gate(a: T.Answer[], b: T.Answer[], branches: T.Branch[]): string | null {
  if (a.length !== b.length) return `branch count: ${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    const nm = `branch ${i} (layer ${branches[i].layer}, ${branches[i].perm.join(',')})`;
    if (b[i] === undefined) return `${nm}: no answer came back`;
    if (a[i].canonical !== b[i].canonical) {
      return `${nm}: canonicalState differs (${a[i].canonical.length} vs ${b[i].canonical.length} bytes)`;
    }
    if (a[i].digest !== b[i].digest) return `${nm}: digest differs`;
  }
  const agA = aggregate(branches, a), agB = aggregate(branches, b);
  if (agA !== agB) return `aggregate differs: ${agA} vs ${agB}`;
  return null;
}

// ---------------------------------------------------------------------------

const t0 = ms();
const base = W.leanWorld().save();
/** Replicate the branch list, to separate LOAD IMBALANCE from everything else:
 *  41 branches over 8 workers is 5.1 each and the tail is one whole branch, so
 *  a speedup measured at 41 carries an 18% imbalance ceiling that has nothing
 *  to do with the boundary. Every replica is the same branch, so the gate is
 *  unaffected and the answer is unchanged. */
const REPEAT = arg('--repeat', 1);
const one = T.branches(base, !NO_ORACLE);
const branches = REPEAT === 1 ? one
  : Array.from({ length: REPEAT }, () => one).flat();
const buildMs = ms() - t0;

console.log(`# fork parallelism, examples/wtf order sweep`);
console.log(`  base world      : ${W.leanWorld().store.facts.size} facts, snapshot ${(base.length / 1024).toFixed(0)} KB (built in ${buildMs.toFixed(0)} ms)`);
console.log(`  branches        : ${branches.length}`);
console.log(`  cores / workers : ${availableParallelism()} / ${P}`);
console.log(`  load average    : ${loadavg().map((x) => x.toFixed(1)).join(' ')}   <- absolutes here are inflated by exactly this`);
console.log();

/** THE PAIRED STATISTIC, which is what a loaded box permits.
 *
 *  Three other agents work on this machine continuously and a quiet box is not
 *  a state one can wait for. Two means taken minutes apart are two statements
 *  about the load. A PAIR — one sequential arm immediately followed by one
 *  parallel arm — is immune to a load level that drifts slowly relative to the
 *  pair spacing, because the drift lands in both halves. So what is reported is
 *  how many of N pairs B beat A, and the DISTRIBUTION of the per-pair ratios,
 *  not the ratio of the medians. */
function paired(name: string, rs: { sq: number; pr: number }[]): string {
  const ratios = rs.map((x) => x.sq / x.pr).sort((a, b) => a - b);
  const wins = ratios.filter((x) => x > 1).length;
  return `${name}: B beat A in ${wins}/${ratios.length} pairs, ratios `
    + `${ratios[0].toFixed(2)}-${ratios[ratios.length - 1].toFixed(2)} `
    + `(median ${ratios[Math.floor(ratios.length / 2)].toFixed(2)}x)`;
}

if (SWEEP) {
  // The scaling curve, and the honest form of "speedup against core count".
  // ABABAB per worker count: one sequential arm immediately before every
  // parallel arm, so a burst of load from another process on this box lands in
  // BOTH columns of a pair instead of in the ratio between them. The pairs are
  // then reduced by MEDIAN over the reps, and the per-pair ratios are printed
  // so a reader can see the spread rather than take the median on trust.
  const PS = [1, 2, 4, 6, 8];
  // Warm up properly: the whole sequential arm once and a whole pool once,
  // both discarded. Measured before this was here, the first sequential arm
  // came out 1.8x slower than the fourth and the P=1 pool consequently looked
  // FASTER than sequential, which is not a measurement of anything.
  sequential(base, branches);
  await runForks<T.Branch, T.Answer>({ taskModule: TASK, base, workers: 8 }, branches);

  const pairs = new Map<number, { sq: number; pr: number; run: number; setup: number }[]>();
  for (const p of PS) pairs.set(p, []);
  for (let rep = 0; rep < REPS; rep++) {
    for (const p of PS) {
      let t = ms(); sequential(base, branches); const sq = ms() - t;
      t = ms();
      const { report } = await runForks<T.Branch, T.Answer>({ taskModule: TASK, base, workers: p }, branches);
      const pr = ms() - t;
      pairs.get(p)!.push({ sq, pr, run: report.runMs, setup: report.setupMs });
    }
    console.log(`  rep ${rep} done, load now ${loadavg().map((x) => x.toFixed(1)).join(' ')}`);
  }
  const med = (xs: number[]): number => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
  console.log();
  console.log('  THE PAIRED STATISTIC — one A immediately before every B, ratios per pair');
  for (const p of PS) {
    const r = pairs.get(p)!;
    console.log(`  ${paired(`P=${String(p).padStart(2)}`, r)}`);
    console.log(`         run-only (persistent pool): `
      + `${r.map((x) => (x.sq / x.run).toFixed(2)).sort().join(' ')}`
      + `   setup ${med(r.map((x) => x.setup)).toFixed(0)} ms = `
      + `${(med(r.map((x) => x.setup)) / (med(r.map((x) => x.sq)) / branches.length)).toFixed(1)} branch-equivalents`);
  }
  console.log(`\n  SETUP IN BRANCH-EQUIVALENTS is the load-independent crossover: it is a`);
  console.log(`  RATIO of two times taken in the same sitting, so it does not move with the`);
  console.log(`  box. Break-even needs N > setup_in_branches x P/(P-1) branches.`);
  console.log('\n  run-only speedup is what a PERSISTENT pool gets: pool setup is paid once');
  console.log('  per process, not once per search, and 41 branches is a small search.');
  process.exit(0);
}

// A discarded warm-up of BOTH arms, so neither pays for the JIT compiling the
// evaluator on behalf of the other.
{
  const two = branches.slice(0, 2);
  sequential(base, two);
  await runForks<T.Branch, T.Answer>({ taskModule: TASK, base, workers: 2 }, two);
}

const seqMs: number[] = [], parMs: number[] = [], setupMs: number[] = [];
let lastSeq: T.Answer[] = [], lastPar: T.Answer[] = [], lastReport: unknown = null;
let gateFails = 0;

for (let rep = 0; rep < REPS; rep++) {
  let t = ms();
  const a = sequential(base, branches);
  seqMs.push(ms() - t);

  t = ms();
  const { results: b, report } = await runForks<T.Branch, T.Answer>(
    { taskModule: TASK, base, workers: P }, branches);
  parMs.push(ms() - t);
  setupMs.push(report.setupMs);
  lastSeq = a; lastPar = b; lastReport = report;

  const g = gate(a, b, branches);
  if (g !== null) { gateFails++; console.log(`  rep ${rep}: GATE RED — ${g}`); }
  console.log(`  rep ${rep}: A ${seqMs[rep].toFixed(0)} ms   B ${parMs[rep].toFixed(0)} ms `
    + `(setup ${report.setupMs.toFixed(0)}, run ${report.runMs.toFixed(0)}, split ${report.perWorker.join('/')})`
    + `   speedup ${(seqMs[rep] / parMs[rep]).toFixed(2)}x   gate ${g === null ? 'GREEN' : 'RED'}`);
}

const med = (xs: number[]): number => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
console.log();
console.log(`  A (sequential) samples: ${seqMs.map((x) => x.toFixed(0)).join('  ')} ms`);
console.log(`  B (parallel)   samples: ${parMs.map((x) => x.toFixed(0)).join('  ')} ms`);
console.log(`  ${paired(`PAIRED on ${P} workers`, seqMs.map((x, i) => ({ sq: x, pr: parMs[i] })))}`);
console.log();
console.log('  --- what does NOT move with the load: counts and bytes ---');
console.log(`  work in one branch     : ${lastSeq[0].steps} distinct rule firings, `
  + `${lastSeq[0].facts} facts in the finished world`);
console.log(`  crossing IN per branch : ${JSON.stringify(branches[0]).length} B (the branch descriptor)`);
console.log(`  crossing OUT per branch: ${lastSeq[0].digest.length} B digest`
  + (lastSeq[0].canonical.length > 0 ? ` + ${lastSeq[0].canonical.length} B canonicalState (the GATE's payload, not the workload's)` : ''));
console.log(`  crossing per WORKER    : ${base.length} B, once — every branch of a fork`);
console.log(`                           search starts from the same world`);
console.log(`  pool setup in branch-equivalents: `
  + `${(med(setupMs) / (med(seqMs) / branches.length)).toFixed(1)}  -> break-even at `
  + `N > ${(med(setupMs) / (med(seqMs) / branches.length) * P / (P - 1)).toFixed(0)} branches`);
console.log();
console.log(`  pool setup median      : ${med(setupMs).toFixed(0)} ms (load avg `
  + `${loadavg()[0].toFixed(1)}) = ${(100 * med(setupMs) / med(parMs)).toFixed(0)}% of arm B`);
console.log(`  per-branch, arm A      : ${(med(seqMs) / branches.length).toFixed(1)} ms (load avg `
  + `${loadavg()[0].toFixed(1)}; this absolute is inflated by exactly that)`);
console.log(`  aggregate (distinct answers per sublayer): ${aggregate(branches, lastSeq)}`);
console.log(`  gate over ${REPS} reps: ${gateFails === 0 ? 'GREEN' : `${gateFails} RED`}`);
void lastReport;

// ---------------------------------------------------------------------------
// THE MUTANTS. One break shows the gate is alive; a SET says what it covers.
// Each names the constraint it targets, and the two that SURVIVE are reported
// as holes rather than left out.

if (MUTANTS) {
  console.log(`\n# mutants — what the gate covers, and where it cannot look\n`);
  const rows: [string, string, boolean][] = [];
  const bad = (name: string, target: string, mutate: (b: T.Answer[]) => T.Answer[]) => {
    const g = gate(lastSeq, mutate(lastPar.map((x) => ({ ...x }))), branches);
    rows.push([name, target, g !== null]);
    console.log(`  ${g !== null ? 'KILLED ' : 'SURVIVED'}  ${name}\n            targets: ${target}\n            gate said: ${g ?? '(nothing)'}`);
  };

  // M1 — reassembly by arrival instead of by index.
  bad('M1 results reassembled in completion order', 'deterministic reassembly regardless of which worker finishes first',
    (b) => { const c = b.slice(); [c[0], c[1]] = [c[1], c[0]]; return c; });

  // M2 — one branch silently dropped.
  bad('M2 one branch never comes back', 'every branch is answered; a lost message is not a smaller search',
    (b) => { const c = b.slice(); c[7] = undefined as unknown as T.Answer; return c; });

  // M3 — two workers handed the same index, so one answer is written twice.
  bad('M3 a branch descriptor dispatched twice', 'each branch is dispatched exactly once',
    (b) => { const c = b.slice(); c[3] = c[4]; return c; });

  // M4 — a branch's world differs by ONE fact. Tests that the oracle is the
  // whole world and not the demo's seven answer relations.
  bad('M4 one fact different in one branch\'s world', 'the oracle is the whole canonical world, not the demo\'s digest',
    (b) => { const c = b.slice(); c[5] = { ...c[5], canonical: c[5].canonical + 'x(1).\n' }; return c; });

  // M5 — the same answer everywhere: a pool that evaluated branch 0 P times.
  bad('M5 every branch answered with branch 0\'s world', 'the branch DESCRIPTOR reached the worker, not just the base',
    (b) => b.map(() => b[0]));

  // M6 — a real defect the gate must catch that no injection can fake: a task
  // that SHARES MUTABLE STATE between branches. It is the one rule the pool
  // rests on and the one thing a worker cannot check about itself, because a
  // worker cannot know it is one of eight. Run through BOTH arms for real.
  {
    const leaky = path.resolve(import.meta.dirname, 'fork_task_leaky.ts');
    const L = await import('./fork_task_leaky.ts');
    const lctx = L.setup(base);
    const la = branches.map((b) => L.run(lctx, b)) as unknown as T.Answer[];
    const { results: lb } = await runForks<T.Branch, T.Answer>(
      { taskModule: leaky, base, workers: P }, branches);
    const g = gate(la, lb, branches);
    rows.push(['M6 the task shares mutable state across branches', 'the fork contract itself: branch i+1 must not see branch i', g !== null]);
    console.log(`  ${g !== null ? 'KILLED ' : 'SURVIVED'}  M6 the task shares mutable state across branches`);
    console.log(`            targets: the fork contract itself: branch i+1 must not see branch i`);
    console.log(`            gate said: ${g ?? '(nothing)'}`);
  }

  // M8 — the second question asked of the INSTRUMENT: the gate compares
  // ANSWERS, so it cannot certify that the worker ran the same ENGINE. Nothing
  // in the pool carries the host's `EvalOpts` across the boundary; a task that
  // constructs its `Rofl` with `{ reuse: false }` builds every derived layer
  // from scratch and the gate has no way to notice. Run for real.
  {
    const nr = path.resolve(import.meta.dirname, 'fork_task_noreuse.ts');
    const { results: nb } = await runForks<T.Branch, T.Answer>(
      { taskModule: nr, base, workers: P }, branches);
    const g = gate(lastSeq, nb, branches);
    rows.push(['M8 the worker runs a different engine configuration', 'nothing — the gate compares answers, not configurations', g !== null]);
    console.log(`  ${g !== null ? 'KILLED ' : 'SURVIVED'}  M8 the worker builds its worlds with { reuse: false }`);
    console.log(`            targets: nothing — the gate compares ANSWERS, not engine configuration`);
    console.log(`            steps per branch: arm A ${lastSeq[0].steps}, this arm ${nb[0]?.steps}`);
    console.log(`            gate said: ${g ?? '(nothing)'}`);
  }

  // M7 — WHERE THE GATE CANNOT LOOK, asked of the instrument rather than of
  // the code, which is the question that produces survivors. `canonicalState()`
  // sorts BY CONSTRUCTION, so two worlds holding the same facts in a different
  // ARRIVAL order are byte-identical to it. Arrival order is not decoration:
  // `assumptionOf` reads it, and commit 3cff6f4 turned `clone` around
  // specifically to preserve it. Measured here rather than argued.
  {
    const { Rofl } = await import('../src/api.ts');
    const fwd = new Rofl(); fwd.load('p(1).\np(2).\np(3).\nq(X) :- p(X).');
    const rev = new Rofl(); rev.load('p(3).\np(2).\np(1).\nq(X) :- p(X).');
    const same = fwd.store.canonicalState() === rev.store.canonicalState();
    // ARRIVAL order is the Map's own iteration order — `allFacts()`, not
    // `allFactKeys()`, which sorts. That distinction is the whole mutant.
    const arrivalFwd = fwd.store.allFacts().filter((f) => f.rel === 'p').map((f) => f.key).join(',');
    const arrivalRev = rev.store.allFacts().filter((f) => f.rel === 'p').map((f) => f.key).join(',');
    const differs = arrivalFwd !== arrivalRev;
    rows.push(['M7 same facts, different ARRIVAL order', 'nothing — canonicalState sorts, so arrival order is invisible to it', !same]);
    console.log(`  ${!same ? 'KILLED ' : 'SURVIVED'}  M7 same facts, different ARRIVAL order in the world`);
    console.log(`            targets: nothing — canonicalState sorts, so this is invisible BY CONSTRUCTION`);
    console.log(`            arrival order actually differs: ${differs}  (${arrivalFwd}  vs  ${arrivalRev})`);
    console.log(`            canonicalState identical: ${same}  -> gate said: ${same ? '(nothing)' : 'differs'}`);
  }

  // M9 — the differential's own blind spot, and the reason a gate like this
  // is never the whole story: a fault in the SHARED task module moves BOTH
  // arms identically, so the comparison stays green while every branch is
  // wrong. Demonstrated rather than asserted: run arm A through the leaky
  // task and arm B through the leaky task, and compare THOSE.
  {
    const leaky = path.resolve(import.meta.dirname, 'fork_task_leaky.ts');
    const L = await import('./fork_task_leaky.ts');
    // Both arms take the same wrong path, one branch each, so the leak's
    // counter is 1 on both sides and the two agree while disagreeing with the
    // truth arm A computed above.
    const oneB = branches.slice(0, 1);
    const a1 = [L.run(L.setup(base), oneB[0])] as unknown as T.Answer[];
    const { results: b1 } = await runForks<T.Branch, T.Answer>(
      { taskModule: leaky, base, workers: 1 }, oneB);
    const g = gate(a1, b1, oneB);
    const wrong = a1[0].canonical !== lastSeq[0].canonical;
    rows.push(['M9 a fault in the SHARED task module', 'nothing — a differential cannot see a common-mode fault', g !== null]);
    console.log(`  ${g !== null ? 'KILLED ' : 'SURVIVED'}  M9 the same fault in BOTH arms (shared task module)`);
    console.log(`            targets: nothing — a differential cannot see a common-mode fault`);
    console.log(`            the answer IS wrong (differs from the honest arm A): ${wrong}`);
    console.log(`            gate said: ${g ?? '(nothing)'}`);
  }

  const killed = rows.filter((r) => r[2]).length;
  console.log(`\n  ${killed} of ${rows.length} killed.`);
  console.log(`  WHAT THE GATE COVERS: reassembly order, a lost branch, a duplicated`);
  console.log(`  dispatch, one byte of one branch's world, a branch descriptor that never`);
  console.log(`  arrived, and shared mutable state across branches — which is the fork`);
  console.log(`  contract itself and the only one a worker cannot check about itself.`);
  console.log(`  WHAT IT DOES NOT COVER: M7. The gate is exact on WHAT a branch derived`);
  console.log(`  and blind to the ORDER its facts arrived in, because canonicalState`);
  console.log(`  sorts. Nothing in this pool can reorder arrivals — each branch is one`);
  console.log(`  unchanged \`fromSnapshot\` plus one \`load\` — so the hole is not reached`);
  console.log(`  today. It WOULD be reached by a pool that split one world's work, which`);
  console.log(`  is the shared-memory design this measurement is deliberately not about.`);
  console.log(`  M8: the gate certifies the ANSWER, not the CONFIGURATION. A worker running`);
  console.log(`  a different evaluator or a different reuse policy is invisible to it, and`);
  console.log(`  that is safe exactly as far as those configurations are known to agree —`);
  console.log(`  which for reuse is pinned by test/derived-reuse.test.ts and for the two`);
  console.log(`  evaluators is not pinned everywhere (LIMITS.md, stock-path corner).`);
  console.log(`  M9: a differential cannot see a COMMON-MODE fault. Both arms share one`);
  console.log(`  task module by construction — that is what makes the A/B honest about the`);
  console.log(`  thread and blind about the task. An oracle outside both arms is the only`);
  console.log(`  thing that closes it, and examples/wtf already has one (\`simulate\`).`);
}
