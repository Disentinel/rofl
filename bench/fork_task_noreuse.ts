// fork_task_noreuse.ts — a SECOND planted defect, aimed at what the gate is
// structurally unable to look at rather than at what it might miss.
//
// The gate compares ANSWERS. It therefore cannot tell that the worker built its
// world under a different engine configuration from the host's — here
// `{ reuse: false }`, which rebuilds the whole derived layer on every
// evaluation instead of reusing relations under an exact fingerprint. Nothing
// in `runtime/fork_pool.ts` carries the host's `EvalOpts` across the boundary;
// the task module constructs its own `Rofl`, and a task that constructs it
// differently is invisible to a differential on the result.
//
// Whether that is a HOLE or merely a fact depends on whether the two
// configurations are known to agree. `LIMITS.md` says they are and
// `test/derived-reuse.test.ts` pins it byte for byte, so this particular
// difference is safe. The point of running it is that the gate would say
// nothing either way.

import { Rofl } from '../src/api.ts';
import * as W from '../examples/wtf/demo.ts';
import type { Branch } from './fork_task_wtf.ts';

export interface Ctx { base: string; origTs: Map<string, number>; }

export function setup(base: string): Ctx {
  const r = Rofl.fromSnapshot(base, { reuse: false });
  const origTs = new Map<string, number>();
  for (const [layer, scope] of W.SWEEPS) {
    for (const e of W.sweepSet(r, layer, scope)) origTs.set(e, W.tsOf(r, e));
  }
  return { base, origTs };
}

export function run(ctx: Ctx, b: Branch): { steps: number; digest: string; canonical: string; facts: number } {
  const w = Rofl.fromSnapshot(ctx.base, { reuse: false });   // <- the difference
  for (const e of b.es) w.retract(`eff_ts(${e}, ${ctx.origTs.get(e)})`);
  const res = w.load(b.perm.map((e, i) => `eff_ts(${e}, ${b.stamps[i]}).`).join('\n'));
  if (!res.ok) throw new Error(`permute: ${res.diagnostics.join('; ')}`);
  return {
    steps: w.store.evalOf(w.store.tick)?.steps ?? -1,
    digest: W.digest(w),
    canonical: b.oracle === false ? '' : w.store.canonicalState(),
    facts: w.store.facts.size,
  };
}
