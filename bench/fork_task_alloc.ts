// fork_task_alloc.ts — the SECOND control, and the one that attributes the gap.
//
// `fork_task_spin.ts` is arithmetic with no allocation: it says what this box's
// eight vCPUs give a workload that touches no memory. A fork branch is the
// opposite — it parses a 2.5 MB snapshot, builds a store of several thousand
// objects and then runs a fixpoint that allocates throughout. If allocation is
// what does not scale here, this task will show it, because it does nothing
// else: parse the same base snapshot the real branches start from, and touch
// the result enough that nothing is optimised away.

export function setup(base: string): string { return base; }

export function run(ctx: string, b: { rounds: number }): number {
  let n = 0;
  for (let i = 0; i < b.rounds; i++) {
    const o = JSON.parse(ctx) as { facts?: unknown[] };
    n += Array.isArray(o.facts) ? o.facts.length : 0;
  }
  return n;
}
