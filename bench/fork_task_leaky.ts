// fork_task_leaky.ts — a PLANTED DEFECT, and the one that matters most.
//
// This task looks like `fork_task_wtf.ts` and breaks the one rule the pool
// rests on: it MUTATES the context between branches, so branch i+1 sees what
// branch i did. Sequentially that is one accumulating world; on P workers it is
// P accumulating worlds, each a fraction as long. Nothing in the pool can
// detect that — a worker cannot know it is one of eight — so it is the gate's
// job, and this file is how we find out whether the gate does it.
//
// It is deliberately a SMALL leak: one counter in the answer, not a corrupted
// world. A leak large enough to change the fixpoint would be caught by
// anything.

import { Rofl } from '../src/api.ts';
import * as W from '../examples/wtf/demo.ts';
import type { Branch } from './fork_task_wtf.ts';

export interface LeakyCtx { base: string; origTs: Map<string, number>; seen: number; }

export function setup(base: string): LeakyCtx {
  const r = Rofl.fromSnapshot(base);
  const origTs = new Map<string, number>();
  for (const [layer, scope] of W.SWEEPS) {
    for (const e of W.sweepSet(r, layer, scope)) origTs.set(e, W.tsOf(r, e));
  }
  return { base, origTs, seen: 0 };
}

export function run(ctx: LeakyCtx, b: Branch): { digest: string; canonical: string; facts: number } {
  const w = Rofl.fromSnapshot(ctx.base);
  for (const e of b.es) w.retract(`eff_ts(${e}, ${ctx.origTs.get(e)})`);
  const res = w.load(b.perm.map((e, i) => `eff_ts(${e}, ${b.stamps[i]}).`).join('\n'));
  if (!res.ok) throw new Error(`permute: ${res.diagnostics.join('; ')}`);
  // THE LEAK: a fact about how many branches this context has already run,
  // asserted into the branch's own world. Every branch is still a legal ROFL
  // world; the number in it is a property of the SCHEDULE.
  //
  // AND THE PLANTED DEFECT IS ITSELF CHECKED. The first version of this line
  // was `w.assert(\`seen_before(${ctx.seen})\`)` with no terminating dot, so
  // the assert was REFUSED — `line 1: expected ':-', got 'eof'` — and returned
  // its refusal in a value nobody read. The mutant therefore leaked nothing and
  // reported as SURVIVED, which reads as "the gate is blind to a schedule leak"
  // and is the exact opposite of the truth. A mutant that never fires is
  // indistinguishable, in the output, from a gate that cannot see it.
  ctx.seen++;
  const a = w.assert(`seen_before(${ctx.seen}).`);
  if (!a.ok) throw new Error(`the planted leak did not fire: ${a.diagnostics.join('; ')}`);
  w.evaluate();
  if (!w.holds(`seen_before(${ctx.seen})`)) throw new Error('the planted leak is not in the world');
  return { digest: W.digest(w), canonical: w.store.canonicalState(), facts: w.store.facts.size };
}
