// rounds.ts — THE evaluator: wake-up rounds instead of a stratum table. It
// lives beside `src/engine.ts` and replaces exactly one thing in it, the
// phase order, by subclassing `Evaluation` and overriding `run()`.
//
// It is what `Rofl` runs by default (src/api.ts). The stock `Evaluation` is
// still reachable — `new Rofl({ evaluator: 'strata' })` — as the fallback and
// as the thing rounds are compared against. This file was `runtime/round_eval.ts`
// and moved here unchanged when it became primary: `src/` may not depend on
// `runtime/`, and `runtime/round_eval.ts` now re-exports from here.
//
// WHAT IT REMOVES. The stock evaluator reads `stratum/2` out of the store —
// a table boot.rofl COMPUTES, with `N is M + 1` climbing one number per
// round, which is why it diverges on a negative cycle and why phase A had to
// be split in two waves so `unstratified` could be consulted before the
// counting starts. Rounds compute no number. The environment wakes in rounds:
// round 0 is what is already base; round N settles every relation whose
// NEGATIVE dependencies all settled in earlier rounds (positive dependencies
// may sit in the same round — that is ordinary recursion, and the fixpoint
// takes it). The round number IS the stratum number. Peeling is bounded BY
// CONSTRUCTION: each round settles at least one relation or stops.
//
// Unstratifiability stops being a property of a graph that has to be
// DETECTED. It is "a round added nothing while work remained", and the stuck
// set is the answer — named without `dep`, `dep_neg`, `reach` or
// `unstratified`. The peel reads the decoded rules and nothing else.
//
// WHAT IT DOES NOT TOUCH: `semantics(well_founded)`. The alternating fixpoint
// orders no phases, so there is no phase order to replace; that path is
// delegated to the stock `run()` unchanged.

import {
  Evaluation, BudgetExhausted, StratificationError,
  type EvalOutcome, type ERule, type StagedFact,
} from './engine.ts';
import { V, KERNEL_PERSP, BUDGET_REASON } from './reflect.ts';
import { mka } from './unify.ts';

/** What one peel produced: the round each relation settles in, whether it
 *  stalled, and — when it did — the relations still standing. */
export interface Peel {
  round: Map<string, number>;
  rounds: number;
  stalled: boolean;
  stuck: string[];
  /** Per round, the relations that settled in it. For reports and tests. */
  layers: string[][];
  /** The one-hop relation dependency graph the peel was taken over, keyed on
   *  the head. This is the reading `boot.rofl` used to publish as `dep/2` and
   *  `dep_neg/2` — the same edges, off the same decoded rules, minus the
   *  round trip through the store. Nothing in the evaluator reads it back; it
   *  is here so that a report or a test can ask the question the deleted
   *  meta-rules used to answer (`examples/wtf` asks it of its layer system)
   *  without the program having to derive a description of itself first. */
  deps: { pos: Map<string, Set<string>>; neg: Map<string, Set<string>> };
}

/** `dep`'s transitive closure — what `reach/2` was, over a peel's `deps`.
 *  `reachable(peel).get(A)` holds every relation A depends on, at any number
 *  of hops, positively or negatively. */
export function reachable(peel: Peel): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const oneHop = (rel: string): string[] => [
    ...(peel.deps.pos.get(rel) ?? []), ...(peel.deps.neg.get(rel) ?? []),
  ];
  for (const rel of peel.round.keys()) {
    const seen = new Set<string>();
    const stack = oneHop(rel);
    while (stack.length > 0) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...oneHop(x));
    }
    out.set(rel, seen);
  }
  return out;
}

/** The dependency reading a round needs, straight off the decoded rules.
 *
 *  Keyed on the RELATION, not on the rule, and that is not a detail: two
 *  rules concluding the same relation must wake in the same round, or the
 *  relation is complete for one reader and not for another. It is the same
 *  reading `boot.rofl` gives `dep`/`dep_neg`, minus the counting:
 *
 *    - a '@next' head contributes NO edge and settles NO relation. The rule
 *      derives nothing in this tick; it stages, and the tick that reads the
 *      staged fact reads a base fact. A relation only ever concluded '@next'
 *      is therefore base here, which is what `stratum(Rel, 0) :-
 *      conclusion_tense(R, next)` says in boot.rofl.
 *    - every rule counts, safe or not, because `concludes` in boot.rofl
 *      reflects the program text and knows nothing about materializability.
 */
export function peelRounds(rules: ERule[]): Peel {
  const posDeps = new Map<string, Set<string>>();
  const negDeps = new Map<string, Set<string>>();
  const heads = new Set<string>();
  for (const r of rules) {
    if (r.clause.head.temporal === 'next') continue;
    const h = r.clause.head.rel;
    heads.add(h);
    let pos = posDeps.get(h); if (!pos) { pos = new Set(); posDeps.set(h, pos); }
    let neg = negDeps.get(h); if (!neg) { neg = new Set(); negDeps.set(h, neg); }
    for (const b of r.clause.body) {
      if (b.t === 'pos') pos.add(b.lit.rel);
      else if (b.t === 'neg') neg.add(b.lit.rel);
    }
  }
  const all = new Set<string>(heads);
  for (const s of posDeps.values()) for (const x of s) all.add(x);
  for (const s of negDeps.values()) for (const x of s) all.add(x);

  const round = new Map<string, number>();
  const settled = new Set<string>();
  // Round 0: everything no rule concludes in this tick. Asserted relations,
  // host tables, relations only staged '@next' — all base, all already there.
  for (const rel of all) if (!heads.has(rel)) { settled.add(rel); round.set(rel, 0); }
  const layers: string[][] = [[...settled].sort()];

  let n = 0;
  while (settled.size < all.size) {
    n++;
    // Waking condition: every NEGATIVE dependency already settled.
    let cand = new Set<string>([...all].filter((rel) => !settled.has(rel)
      && [...(negDeps.get(rel) ?? [])].every((q) => settled.has(q))));
    // A candidate whose POSITIVE dependency is neither settled nor itself a
    // candidate cannot finish this round either: it would still be growing
    // when the round closed, and a reader that negated it would be reading an
    // incomplete relation. Positive dependency INSIDE the candidate set is
    // fine — that is recursion, and the fixpoint closes it.
    for (;;) {
      const before = cand.size;
      cand = new Set([...cand].filter((rel) => [...(posDeps.get(rel) ?? [])]
        .every((q) => settled.has(q) || cand.has(q))));
      if (cand.size === before) break;
    }
    if (cand.size === 0) {
      return {
        round, rounds: n - 1, stalled: true, layers,
        stuck: [...all].filter((rel) => !settled.has(rel)).sort(),
        deps: { pos: posDeps, neg: negDeps },
      };
    }
    for (const rel of cand) { settled.add(rel); round.set(rel, n); }
    layers.push([...cand].sort());
  }
  return {
    round, rounds: n, stalled: false, stuck: [], layers,
    deps: { pos: posDeps, neg: negDeps },
  };
}

/** The round table as one string, in canonical order — the same shape the
 *  stock evaluator records for the stratum table, so the reuse bookkeeping
 *  can ask the same question ("is the schedule this layer was built under
 *  still the schedule?") of either evaluator. */
function roundToken(round: Map<string, number>): string {
  return [...round.keys()].sort().map((k) => k + ':' + round.get(k)).join('|');
}

export class RoundEvaluation extends Evaluation {
  /** The peel this evaluation ran under. Empty until `run()`. */
  peel: Peel = {
    round: new Map(), rounds: 0, stalled: false, stuck: [], layers: [],
    deps: { pos: new Map(), neg: new Map() },
  };
  /** Which round each negation-carrying rule was activated in, for tests. */
  roundPlan: { rule: string; rel: string; level: number | null }[] = [];
  private peelCache: Peel | null = null;

  /** The peel, computed once per evaluation. `planReuse` asks for the schedule
   *  BEFORE `run()` starts, and `run()` asks again; both must get the same
   *  answer off the same rules, and neither should pay for it twice. */
  private peelOnce(): Peel {
    if (this.peelCache === null) this.peelCache = peelRounds(this.rules);
    return this.peelCache;
  }

  /** The plan, for tests and reports. The stock evaluator answers this out of
   *  the stratum table; with the ten rules that derived it gone from boot.rofl
   *  that table is empty on the primary path, so the inherited version would
   *  answer `level: null` for every rule — a plan that cannot say anything,
   *  which is worse than no plan at all. The peel knows the answer: a rule's
   *  level is the round its HEAD RELATION settles in, and a '@next' head
   *  settles no relation and is ordered by nothing, which is the `null` the
   *  stock path uses for the final pass. Same filter as the stock plan, so the
   *  two are comparable rule for rule. */
  override strataPlan(): { rule: string; rel: string; level: number | null }[] {
    if (this.wellFounded) return super.strataPlan();
    const peel = this.peelOnce();
    return this.rules.filter((r) => r.safe && r.hasNeg).map((r) => ({
      rule: r.id,
      rel: r.clause.head.rel,
      level: r.clause.head.temporal === 'next'
        ? null
        : peel.round.get(r.clause.head.rel) ?? null,
    }));
  }

  /** DANGER 1, closed. The reuse gate asks the evaluation what schedule it
   *  orders its negation phases by, and compares that against the token the
   *  last evaluation recorded. The stock evaluator answers with the stratum
   *  table; this one orders by rounds and must answer with the rounds, or the
   *  token it writes at the end of `run()` can never match the token the gate
   *  reads at the start of the next one and reuse is dead — silently, since a
   *  reuse that never fires only costs time. */
  protected override scheduleToken(): string {
    if (this.wellFounded) return super.scheduleToken();
    return roundToken(this.peelOnce().round);
  }

  run(): EvalOutcome {
    // The alternating fixpoint orders no phases and reads no table, so there
    // is nothing here for rounds to replace. Delegating is the honest answer,
    // and it is also the measurement: this evaluator does not touch
    // `semantics(well_founded)` at all.
    if (this.wellFounded) return super.run();

    const E = this as unknown as {
      planReuse(): { hits: Set<string>; keys: Map<string, string> };
      reused(hits: Set<string>, rec: unknown): boolean;
      activate(rules: ERule[]): void;
      stratumCone(mono: ERule[]): Set<string>;
      active: ERule[];
      staged: Map<string, unknown>;
    };

    const plan = E.planReuse();
    this.store.clearDerived(plan.hits.size === 0
      ? undefined
      : (rec) => E.reused(plan.hits, rec));
    E.active = [];
    E.staged.clear();
    this.steps = 0;
    let partial = false;
    let sched = '';
    const safeRules = this.rules.filter((r) => r.safe && !plan.hits.has(r.clause.head.rel));
    const mono = safeRules.filter((r) => !r.hasNeg);
    const negRules = safeRules.filter((r) => r.hasNeg);

    try {
      try {
        // THE WHOLE SCHEDULER, and it runs before a single rule fires. The
        // stock evaluator cannot decide the order this early: its table is
        // derived by the program it is about to evaluate, so phase A has to
        // start, and on a negative cycle the table's own rule never stops —
        // which is why the stock path splits phase A in two waves and reads
        // `unstratified` between them. Here the answer is a peel over the
        // decoded rules, and a stall is the rejection.
        this.peel = this.peelOnce();
        if (this.peel.stalled) {
          throw new StratificationError(
            `program rejected: round ${this.peel.rounds + 1} settled nothing while `
            + `${this.peel.stuck.join(', ')} remained`,
            'each round settles every relation whose negated dependencies settled earlier.\n'
            + `rounds 0..${this.peel.rounds} settled ${this.peel.round.size} relation(s); the ones above\n`
            + 'negate something that never settles, so no round can ever contain them.');
        }
        sched = this.scheduleToken();

        // Phase A: the monotone rules, in the stock evaluator's two waves.
        // The split is no longer load-bearing — nothing is consulted between
        // the waves any more, the stall was decided above — but keeping it
        // keeps the firing order, and with it the canonical witness of every
        // fact, identical to the stock run. That is what the oracle compares.
        const late = E.stratumCone(mono);
        E.activate(mono.filter((r) => !late.has(r.id)));
        E.activate(mono.filter((r) => late.has(r.id)));

        // The negation rounds. A '@next' head is not derived in this tick at
        // all, so no round settles it and none can order it: it runs last,
        // exactly as it does under the table, where it is the `null` level.
        const levelOf = (r: ERule) => (r.clause.head.temporal === 'next'
          ? Infinity
          : this.peel.round.get(r.clause.head.rel) ?? Infinity);
        this.roundPlan = negRules.map((r) => ({
          rule: r.id,
          rel: r.clause.head.rel,
          level: r.clause.head.temporal === 'next'
            ? null
            : this.peel.round.get(r.clause.head.rel) ?? null,
        }));
        const levels = [...new Set(negRules.map(levelOf))].sort((a, b) => a - b);
        for (const lv of levels) {
          E.activate(negRules.filter((r) => levelOf(r) === lv));
        }
      } catch (e) {
        if (e instanceof BudgetExhausted) {
          partial = true;
          this.store.add(V.hole, KERNEL_PERSP, [this.holeId, mka(BUDGET_REASON)],
            { scope: 'timeless', base: true, frozen: true });
        } else throw e;
      }
    } catch (e) {
      this.store.derivedKeys = new Map();
      this.store.derivedSchedule = '';
      throw e;
    }
    this.store.dirty = false;
    this.store.partialEval = partial;
    this.store.derivedKeys = partial ? new Map() : plan.keys;
    this.store.derivedSchedule = partial ? '' : sched;
    const staged = E.staged as Map<string, StagedFact>;
    const stagedSorted = [...staged.keys()].sort().map((k) => staged.get(k)!);
    return { partial, staged: partial ? [] : stagedSorted, diags: this.diags };
  }
}
