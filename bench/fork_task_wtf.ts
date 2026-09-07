// fork_task_wtf.ts — the branch of `examples/wtf`'s order sweep, as a task the
// fork pool can run, and which the sequential arm runs by calling the same two
// functions on the main thread.
//
// WHY THIS WORKLOAD. It is the only many-branch fork search in this repository
// that is genuinely a search of INDEPENDENT worlds. `runSweeps` re-runs the
// whole layer computation under every permutation of one sublayer's
// timestamps and counts the DISTINCT answers; no permutation reads another,
// nothing is pruned, and there is no best-so-far. IFFY does not fork at all
// (its arms are a column in one world) and DITTO forks once. See
// `docs/dogfood/2026-09-07-fork-parallelism.md`.
//
// The A/B arms share this file so that the only difference between them is the
// thread the `run` calls happen on.

import { Rofl } from '../src/api.ts';
import * as W from '../examples/wtf/demo.ts';

export interface Ctx {
  base: string;
  /** The original timestamp of every effect, read once out of the base world. */
  origTs: Map<string, number>;
}

export interface Branch {
  layer: number;
  scope: string | null;
  /** The effects of this sublayer, in the permuted order. */
  perm: string[];
  /** The sublayer's effects in canonical order, and the sorted stamps to
   *  redistribute. Carried rather than recomputed so the branch is a closed
   *  description of the world it wants. */
  es: string[];
  stamps: number[];
  /** Whether to compute the acceptance oracle. The oracle is 762 KB a branch
   *  and it is the GATE's payload, not the workload's — a production search
   *  returns the digest. Carried on the branch so the same task file measures
   *  both, and so the answer-size half of the boundary arithmetic is a
   *  measurement rather than an estimate. */
  oracle?: boolean;
}

export function setup(base: string): Ctx {
  const r = Rofl.fromSnapshot(base);
  const origTs = new Map<string, number>();
  for (const [layer, scope] of W.SWEEPS) {
    for (const e of W.sweepSet(r, layer, scope)) origTs.set(e, W.tsOf(r, e));
  }
  return { base, origTs };
}

export interface Answer {
  /** Distinct rule firings this branch's fixpoint performed. A count, so it
   *  does not move with the box's load — the load-independent measure of how
   *  much work is in one branch. */
  steps: number;
  /** The demo's own answer: the permanents' characteristics after all layers. */
  digest: string;
  /** The ACCEPTANCE ORACLE: the whole world, canonically. Byte-for-byte
   *  equality of this against the sequential arm's is the determinism gate. */
  canonical: string;
  facts: number;
}

export function run(ctx: Ctx, b: Branch): Answer {
  const w = Rofl.fromSnapshot(ctx.base);
  for (const e of b.es) w.retract(`eff_ts(${e}, ${ctx.origTs.get(e)})`);
  const res = w.load(b.perm.map((e, i) => `eff_ts(${e}, ${b.stamps[i]}).`).join('\n'));
  if (!res.ok) throw new Error(`permute ${b.perm.join(',')}: ${res.diagnostics.join('; ')}`);
  return {
    steps: w.store.evalOf(w.store.tick)?.steps ?? -1,
    digest: W.digest(w),
    canonical: b.oracle === false ? '' : w.store.canonicalState(),
    facts: w.store.facts.size,
  };
}

/** Every branch of the sweep, in the order `runSweeps` visits them. Enumerated
 *  on the main thread because it needs the base world once, and it is the
 *  cheap half. */
export function branches(base: string, oracle = true): Branch[] {
  const r = Rofl.fromSnapshot(base);
  const out: Branch[] = [];
  for (const [layer, scope] of W.SWEEPS) {
    const es = W.sweepSet(r, layer, scope);
    const stamps = es.map((e) => W.tsOf(r, e)).sort((a, b) => a - b);
    for (const perm of permutations(es)) out.push({ layer, scope, perm, es, stamps, oracle });
  }
  return out;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i++) {
    const rest = xs.slice(0, i).concat(xs.slice(i + 1));
    for (const p of permutations(rest)) out.push([xs[i], ...p]);
  }
  return out;
}
