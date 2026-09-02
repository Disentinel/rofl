// round_eval.ts — the round evaluator's PUBLIC entry from outside the kernel.
//
// The evaluator itself moved to `src/rounds.ts` when it became the primary
// path: `src/api.ts` runs it by default, and `src/` may not depend on
// `runtime/`. Nothing about it changed in the move — this file re-exports it
// so callers and tests written against `runtime/round_eval.ts` keep working.
//
// What stays here is `roundify`, which needs `Rofl` and therefore cannot live
// in the kernel. It used to be the only way to reach the round evaluator; now
// it is a no-op on a default `Rofl` and the way to switch a `Rofl` that was
// built with `{ evaluator: 'strata' }` back over.

export { peelRounds, reachable, RoundEvaluation, type Peel } from '../src/rounds.ts';

import { RoundEvaluation } from '../src/rounds.ts';
import type { EvalOutcome } from '../src/engine.ts';
import type { Term } from '../src/unify.ts';
import type { Rofl } from '../src/api.ts';

/** Point a `Rofl` at the round evaluator. Everything that evaluates —
 *  `load`, `evaluate`, `query`, `why`, `tickAdvance`, `run` — goes through
 *  the one private entry point this replaces, so the whole surface switches
 *  at once. Call it BEFORE the first `load`.
 *
 *  A `Rofl` built with the default `evaluator` is already round-evaluated and
 *  this only reinstalls the same class. */
export function roundify(r: Rofl): Rofl {
  const R = r as unknown as {
    store: Rofl['store']; naive: boolean; reuse: boolean; diagnostics: string[];
    lastStaged: EvalOutcome['staged']; lastSteps: number; readsProvenance: boolean;
    lastEval?: RoundEvaluation;
    ensure(budget: number, holeId: Term): { partial: boolean };
  };
  R.ensure = function (budget: number, holeId: Term) {
    if (!this.store.dirty) return { partial: this.store.partialEval };
    const ev = new RoundEvaluation(this.store,
      { budget, naive: this.naive, reuse: this.reuse, holeId });
    const out = ev.run();
    this.lastStaged = out.staged;
    this.lastSteps = ev.steps;
    this.readsProvenance = ev.readsProvenance();
    this.lastEval = ev;
    this.store.noteEval(budget, ev.steps, out.partial);
    this.diagnostics.push(...out.diags);
    return { partial: out.partial };
  };
  return r;
}

/** The last round evaluation a roundified `Rofl` ran, or null. */
export function lastRoundEval(r: Rofl): RoundEvaluation | null {
  return (r as unknown as { lastEval?: RoundEvaluation }).lastEval ?? null;
}
