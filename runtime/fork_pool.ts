// fork_pool.ts — evaluate N independent forks on a pool of worker threads.
//
// WHY THIS IS A HOST FILE. `src/` is the generic kernel: zero dependencies,
// closed vocabulary, host-agnostic. `worker_threads` is a node facility and a
// pool is a scheduling policy, so both belong out here with `runtime/pair.ts`
// and `runtime/report.ts`. Nothing in `src/` changes to make this work, and
// that is the point of the design rather than an accident of it: a FORK is
// already an independent world, so the parallel arm needs no new kernel
// primitive, no lock and no shared structure.
//
// WHAT CROSSES, AND HOW OFTEN. A worker shares no JS object graph, so the base
// world crosses as the snapshot STRING `Rofl.save()` already produces —
// **once per worker**, not once per branch. Per branch what crosses is the
// branch descriptor in and the task's answer out, both of which the host sizes.
// The measured arithmetic is in `bench/fork_parallel.ts`; the shape of it is
// that the boundary is amortised over the branches and the per-branch message
// is small, so the ratio that decides is (branch work) vs (message), not
// (branch work) vs (snapshot).
//
// WHAT THIS DOES NOT DO. It does not prune, it does not share a bound, and it
// does not let branch i+1 read branch i. If a search needs any of those it is
// not embarrassingly parallel and this pool is the wrong instrument for it —
// see `docs/dogfood/2026-09-07-fork-parallelism.md`.

import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

export interface PoolOpts {
  /** Absolute path (or file: URL) of a module exporting `setup` and `run`. */
  taskModule: string;
  /** The world every branch starts from, as `Rofl.save()`. */
  base: string;
  /** How many workers. Defaults to `os.availableParallelism()` capped at the
   *  branch count — spawning more workers than branches is pure setup cost. */
  workers?: number;
}

export interface PoolReport {
  /** Wall clock from the first spawn to the last worker reporting `based`. */
  setupMs: number;
  /** Wall clock for the dispatch loop alone. */
  runMs: number;
  workers: number;
  /** Branches each worker took. Deterministic order does NOT require an even
   *  split, and this is where a speedup below the core count goes. */
  perWorker: number[];
}

/** Run every branch on the pool and return the answers **in branch order**.
 *
 *  DETERMINISM. Results are placed by index, so which worker finishes first
 *  cannot reach the caller. That is the only ordering promise this file makes
 *  and it is the only one it needs: order WITHIN a world is the kernel's, and
 *  a fork does not change it. */
export async function runForks<B, R>(opts: PoolOpts, branches: B[]):
    Promise<{ results: R[]; report: PoolReport }> {
  const n = branches.length;
  const want = opts.workers ?? defaultWorkers();
  const P = Math.max(1, Math.min(want, n));
  const results = new Array<R>(n);
  const perWorker = new Array<number>(P).fill(0);
  if (n === 0) return { results, report: { setupMs: 0, runMs: 0, workers: 0, perWorker: [] } };

  const t0 = ms();
  const ws: Worker[] = [];
  for (let i = 0; i < P; i++) {
    ws.push(new Worker(new URL('./fork_worker.ts', import.meta.url),
                       { workerData: { taskModule: opts.taskModule } }));
  }
  try {
    // Spawn, then hand each worker the base ONCE. Both legs are awaited across
    // all workers at once, so the setup cost of a pool is one worker's setup
    // plus contention, not P of them.
    await Promise.all(ws.map((w) => once(w, 'ready')));
    await Promise.all(ws.map((w) => { w.postMessage({ t: 'base', base: opts.base }); return once(w, 'based'); }));
    const setupMs = ms() - t0;

    const t1 = ms();
    let next = 0;
    await new Promise<void>((resolve, reject) => {
      let done = 0;
      const feed = (w: Worker, k: number) => {
        if (next >= n) return;
        const i = next++;
        perWorker[k]++;
        w.postMessage({ t: 'run', i, branch: branches[i] });
      };
      ws.forEach((w, k) => {
        w.on('message', (m: { t: string; i: number; result?: R; message?: string; stack?: string }) => {
          if (m.t === 'error') { reject(new Error(`branch ${m.i}: ${m.message}\n${m.stack ?? ''}`)); return; }
          if (m.t !== 'done') return;
          results[m.i] = m.result as R;
          done++;
          if (done === n) { resolve(); return; }
          feed(w, k);
        });
        w.on('error', reject);
      });
      // WORK STEALING BY DEPLETION, not by a fixed split. A static split makes
      // the pool as slow as its slowest slice whenever branches differ in cost,
      // and branches here differ by construction — a permutation that changes
      // an answer does more fixpoint work than one that does not.
      ws.forEach((w, k) => feed(w, k));
      if (next === 0) resolve();
    });
    return { results, report: { setupMs, runMs: ms() - t1, workers: P, perWorker } };
  } finally {
    for (const w of ws) await w.terminate();
  }
}

function once(w: Worker, t: string): Promise<void> {
  return new Promise((res, rej) => {
    const h = (m: { t: string }) => { if (m.t === t) { w.off('message', h); res(); } };
    w.on('message', h);
    w.once('error', rej);
  });
}

const ms = (): number => Number(process.hrtime.bigint()) / 1e6;

function defaultWorkers(): number {
  // `os.availableParallelism()` is what node itself recommends over
  // `cpus().length`: it respects cgroup limits, which matters on a box
  // carrying other agents.
  return Math.max(1, availableParallelism());
}
