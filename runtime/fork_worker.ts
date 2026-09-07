// fork_worker.ts — the worker end of `runtime/fork_pool.ts`.
//
// A worker shares NO JS object graph with the main thread, so a world cannot
// be handed across: what crosses is the snapshot STRING the host already had
// (`Rofl.save()`), and it crosses ONCE per worker rather than once per branch.
// Everything after that is ordinary single-threaded ROFL inside the worker.
//
// The worker knows nothing about the domain. It imports a TASK MODULE named
// by the host and calls two functions on it:
//
//    setup(base: string) -> ctx        once, when the base snapshot arrives
//    run(ctx, branch)    -> result     once per branch, and MUST NOT mutate ctx
//
// The "must not mutate" is the whole contract. A FORK is an independent world;
// if `run` writes into `ctx` then branch i+1 sees branch i and the arithmetic
// this file rests on is void. Nothing here can check that, and the acceptance
// gate that CAN — a byte-for-byte `canonicalState()` against the sequential
// arm, per branch — is in `bench/fork_parallel.ts`.

import { parentPort, workerData } from 'node:worker_threads';

interface Task {
  setup(base: string): unknown;
  run(ctx: unknown, branch: unknown): unknown;
}

const port = parentPort;
if (port === null) throw new Error('fork_worker: not a worker thread');

const task = await import((workerData as { taskModule: string }).taskModule) as unknown as Task;
if (typeof task.setup !== 'function' || typeof task.run !== 'function') {
  throw new Error('fork_worker: the task module must export setup(base) and run(ctx, branch)');
}

let ctx: unknown = null;

port.on('message', (m: { t: string; base?: string; i?: number; branch?: unknown }) => {
  try {
    if (m.t === 'base') {
      ctx = task.setup(m.base!);
      port.postMessage({ t: 'based' });
    } else if (m.t === 'run') {
      const result = task.run(ctx, m.branch);
      // The INDEX rides back with the answer. Reassembly is by index, never by
      // arrival: which worker finishes first is a property of the machine's
      // load and must not reach the result.
      port.postMessage({ t: 'done', i: m.i, result });
    } else if (m.t === 'stop') {
      process.exit(0);
    }
  } catch (e) {
    port.postMessage({ t: 'error', i: m.i ?? -1, message: (e as Error).message, stack: (e as Error).stack });
  }
});

port.postMessage({ t: 'ready' });
