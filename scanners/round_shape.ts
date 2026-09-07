// round_shape.ts — HOW MUCH WIDTH IS THERE TO PARALLELISE, per round.
//
// I4 in docs/performance-invariants.md says strata are sequential and
// parallelism lives only inside one. That is a statement about the SHAPE of
// the schedule, and a shape can be measured: a stratum with two rules and
// forty rounds cannot be parallelised in any language, and no measurement of
// a host's core count will say so.
//
// What the evaluator's schedule actually is, on the primary path:
//
//   peelRounds        (src/rounds.ts:94)   relations -> negation round.
//   RoundEvaluation.run                    one `activate()` per phase-A wave
//                                          and one per negation round.
//   activate          (src/engine.ts:1167) seeds a BATCH, then `propagate`.
//   propagate         (src/engine.ts:1178) semi-naive ROUNDS: while the front
//                                          is non-empty, every active rule
//                                          whose trigger relation is in the
//                                          front fires again.
//
// A `propagate` round is a BARRIER: round N+1's front is exactly what round N
// derived, so no rule of round N+1 may start before every rule of round N has
// finished. Inside one round the rules are independent — that, and only that,
// is the width a parallel host could use.
//
// The instrument is `scanners/eval_cost.ts`'s: four `Evaluation` methods are
// wrapped on the prototype for one run and restored, so src/ carries no
// counter and no flag. Rounds are recovered without reaching inside
// `propagate` by watching `curFront` — the evaluator installs a NEW FrontInfo
// object at every round boundary (engine.ts:1182), so object identity is the
// round number.
//
// Work is counted the way eval_cost counts it: one `matchPremise` or
// `negHolds` call is one accumulated solution reaching one body position, so
// the call count IS the join accumulator's width and the sum over a firing is
// the firing's work. Two ceilings come out of it, and they are the answer to
// "what would eight cores buy":
//
//   ideal    sum(work) / sum over rounds of MAX rule work in that round
//            — unbounded cores, zero synchronisation, perfect balance.
//   at 8     sum(work) / sum over rounds of max(max rule work, work/8)
//            — the same barriers with eight workers.
//
// Both are upper bounds on an upper bound: they charge nothing for the barrier
// itself, nothing for contention on the store, and they assume a rule's work
// is divisible only at rule granularity, which is what firing a rule
// concurrently means.

import { Evaluation, type ERule } from '../src/engine.ts';
import { peelRounds, RoundEvaluation } from '../src/rounds.ts';
import type { Lit } from '../src/unify.ts';
import { image, fromImage, parse } from '../examples/ring1/demo.ts';

interface Round { work: Map<string, number>; concl: number; }

const rounds: Round[] = [];
let cur: { id: string; round: Round } | null = null;
let lastFront: unknown = Symbol('none');

function roundFor(front: unknown): Round {
  if (front !== lastFront) { lastFront = front; rounds.push({ work: new Map(), concl: 0 }); }
  return rounds[rounds.length - 1];
}

function charge(n: number): void {
  if (!cur) return;
  cur.round.work.set(cur.id, (cur.round.work.get(cur.id) ?? 0) + n);
}

export function measure(src: string): void {
  // The world is built and warmed OUTSIDE the measured window, for the reason
  // recorded over scanners/eval_cost.ts: `parse(src, fromImage(image()))`
  // evaluates its own argument, so measuring it measures the BUILD.
  const img = image();
  parse(src, fromImage(img));
  const world = fromImage(img);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = Evaluation.prototype as unknown as Record<string, any>;
  const orig = {
    fireRule: proto.fireRule, matchPremise: proto.matchPremise,
    negHolds: proto.negHolds, conclude: proto.conclude,
  };

  proto.fireRule = function (this: { curFront: unknown }, r: ERule, ...rest: unknown[]) {
    const outer = cur;
    cur = { id: r.id, round: roundFor(this.curFront) };
    try { return orig.fireRule.call(this, r, ...rest); } finally { cur = outer; }
  };
  proto.matchPremise = function (this: unknown, lit: Lit, ...rest: unknown[]) {
    charge(1);
    return orig.matchPremise.call(this, lit, ...rest);
  };
  proto.negHolds = function (this: unknown, lit: Lit, ...rest: unknown[]) {
    charge(1);
    return orig.negHolds.call(this, lit, ...rest);
  };
  proto.conclude = function (this: unknown, r: ERule, ...rest: unknown[]) {
    if (cur) cur.round.concl++;
    return orig.conclude.call(this, r, ...rest);
  };

  try { parse(src, world); } finally { Object.assign(proto, orig); }
}

function report(): void {
  const live = rounds.filter((r) => r.work.size > 0);
  let W = 0, ideal = 0, at8 = 0, at4 = 0;
  const wide: { i: number; rules: number; work: number; max: number; concl: number }[] = [];
  live.forEach((r, i) => {
    let w = 0, mx = 0;
    for (const v of r.work.values()) { w += v; if (v > mx) mx = v; }
    W += w;
    ideal += mx;
    at8 += Math.max(mx, w / 8);
    at4 += Math.max(mx, w / 4);
    wide.push({ i, rules: r.work.size, work: w, max: mx, concl: r.concl });
  });

  console.log('== ROUND SHAPE, one ring 1 clause, steady state ==');
  console.log(`rounds that fired anything : ${live.length}`);
  console.log(`total join work (accumulator elements) : ${W}`);
  const rules = wide.map((r) => r.rules).sort((a, b) => a - b);
  const q = (p: number) => rules[Math.min(rules.length - 1, Math.floor(p * rules.length))];
  console.log(`rules active per round: min ${rules[0]} · median ${q(0.5)} · p90 ${q(0.9)} · max ${rules[rules.length - 1]}`);
  console.log(`rounds carrying ONE active rule : ${rules.filter((n) => n === 1).length}`
    + ` (${(100 * rules.filter((n) => n === 1).length / rules.length).toFixed(0)}%)`);
  console.log(`rounds carrying <= 2 rules      : ${rules.filter((n) => n <= 2).length}`
    + ` (${(100 * rules.filter((n) => n <= 2).length / rules.length).toFixed(0)}%)`);
  console.log('');
  console.log(`critical path (sum of per-round MAX rule work) : ${ideal.toFixed(0)}`);
  console.log(`ceiling, unbounded cores : ${(W / ideal).toFixed(2)}x`);
  console.log(`ceiling, 4 workers       : ${(W / at4).toFixed(2)}x`);
  console.log(`ceiling, 8 workers       : ${(W / at8).toFixed(2)}x`);
  console.log('');
  console.log('the ten widest rounds (by work), and what one core would still carry:');
  console.log('  round  rules      work   max-rule   concl   round-speedup');
  for (const r of [...wide].sort((a, b) => b.work - a.work).slice(0, 10)) {
    console.log(`  ${String(r.i).padStart(5)}  ${String(r.rules).padStart(5)}`
      + `  ${String(r.work).padStart(8)}  ${String(r.max).padStart(9)}`
      + `  ${String(r.concl).padStart(6)}   ${(r.work / r.max).toFixed(2)}x`);
  }
}

export function peelOf(rules: ERule[]): void {
  const p = peelRounds(rules);
  console.log('== NEGATION STRATA (peelRounds over the decoded rules) ==');
  console.log(`rounds: ${p.rounds}  stalled: ${p.stalled}  relations: ${p.round.size}`);
  const sizes = p.layers.map((l) => l.length);
  console.log(`relations settled per round: ${sizes.join(' ')}`);
  const byRound = new Map<number, number>();
  for (const r of rules) {
    if (r.clause.head.temporal === 'next') continue;
    const n = p.round.get(r.clause.head.rel) ?? -1;
    byRound.set(n, (byRound.get(n) ?? 0) + 1);
  }
  const ks = [...byRound.keys()].sort((a, b) => a - b);
  console.log(`RULES per negation round   : ${ks.map((k) => `${k}:${byRound.get(k)}`).join(' ')}`);
  const neg = rules.filter((r) => r.hasNeg && r.safe);
  const negBy = new Map<number, number>();
  for (const r of neg) {
    const n = r.clause.head.temporal === 'next' ? -1 : (p.round.get(r.clause.head.rel) ?? -1);
    negBy.set(n, (negBy.get(n) ?? 0) + 1);
  }
  const nk = [...negBy.keys()].sort((a, b) => a - b);
  console.log(`negation rules per round   : ${nk.map((k) => `${k}:${negBy.get(k)}`).join(' ')}`);
  console.log(`=> activate() batches this evaluation runs: 2 monotone waves + `
    + `${nk.length} negation round(s), each a hard barrier`);
}

/** The stage split of ONE clause parse, on THIS machine, so the round shape
 *  above can be turned into an end-to-end ceiling instead of a fixpoint-only
 *  one. Re-measured rather than quoted: HANDOFF's split was taken on a 4-core
 *  Xeon and every absolute there is a property of that machine.
 *
 *  The four stages are `examples/ring1/demo.ts:315`'s own steps. Only `load`
 *  contains a fixpoint; `restore`, `holes` and the term walk are sequential
 *  whatever the host, so they are Amdahl's serial fraction for this workload. */
function stages(src: string, n: number): void {
  const img = image();
  parse(src, fromImage(img));               // warm: safetyMemo, JIT
  let restore = 0, load = 0, evaluate = 0, holes = 0, readback = 0;
  const t = () => Number(process.hrtime.bigint()) / 1e6;
  for (let i = 0; i < n; i++) {
    let a = t(); const r = fromImage(img); restore += t() - a;
    a = t(); r.load(`src(${JSON.stringify(src)}).`, { budget: 4_000_000 }); load += t() - a;
    a = t(); r.evaluate(4_000_000); evaluate += t() - a;
    a = t(); r.query('hole(R, Reason)', { budget: 4_000_000 }); holes += t() - a;
    a = t(); r.store.relAll('parsed'); r.store.relAll('subparse'); readback += t() - a;
  }
  const all = [['restore', restore], ['load (THE FIXPOINT)', load],
               ['evaluate', evaluate], ['holes', holes], ['readback', readback]] as const;
  const tot = all.reduce((x, [, v]) => x + v, 0) / n;
  console.log('');
  console.log(`== STAGE SPLIT of one clause parse, ${n} iterations, this machine ==`);
  for (const [name, v] of all) {
    console.log(`  ${name.padEnd(20)} ${(v / n).toFixed(2).padStart(7)} ms  `
      + `${(100 * v / n / tot).toFixed(0).padStart(3)}%`);
  }
  console.log(`  ${'TOTAL'.padEnd(20)} ${tot.toFixed(2).padStart(7)} ms`);
  return;
}

function main(): void {
  // The rule set the parse actually runs under, read off a warm world through
  // the same constructor the evaluation uses — `prepare()` decodes the rules
  // from the reflected store, so this is the evaluator's own reading and not
  // the parser's.
  const ev = new RoundEvaluation(fromImage(image()).store, {});
  peelOf(ev.rules);
  measure('greeting(hello).');
  report();
  stages('greeting(hello).', 20);
}

main();
