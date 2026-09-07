// fork_task_spin.ts — the control workload: arithmetic and nothing else.
export function setup(_base: string): null { return null; }
export function run(_ctx: null, b: { iters: number }): number { return spin(b.iters); }
export function spin(iters: number): number {
  let x = 1;
  for (let i = 0; i < iters; i++) x = (x * 1103515245 + 12345) % 2147483647;
  return x;
}
