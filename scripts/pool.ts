// scripts/pool.ts — ONE CALL PER TASK, SPREAD OVER A FEW NODE PROCESSES.
//
// A task names a module and one of its exported functions; a worker imports
// the module once and calls the function with the task's arguments. Results
// come back in the order the tasks were given, whatever order they finish in,
// so a report built from them reads the same on every run and at any width.
//
// The width is ROFL_JOBS, or the machine's parallelism less two: every task
// here spends part of its time in a `rofl load` child it waits on, and the
// two left over keep a desktop usable while the loop runs.
import { fork, type ChildProcess } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';

export interface Task { mod: string; fn: string; args: unknown[] }

export const jobs = (): number => {
  const n = Number(process.env.ROFL_JOBS);
  return Number.isInteger(n) && n > 0 ? n : Math.max(1, os.availableParallelism() - 2);
};

const WORKER = path.join(import.meta.dirname, 'pool.ts');

/** Runs every task and resolves with their results in task order. A task
 *  that throws rejects the whole run, with the task named: a harness that
 *  swallowed one would report a check it never made. */
export async function runPool<R>(tasks: Task[], opts: { width?: number; env?: NodeJS.ProcessEnv } = {}): Promise<R[]> {
  const out = new Array<R>(tasks.length);
  if (tasks.length === 0) return out;
  const width = Math.min(opts.width ?? jobs(), tasks.length);
  let next = 0;
  const kids: ChildProcess[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      let live = width, failed = false;
      const feed = (kid: ChildProcess): void => {
        if (failed) return;
        if (next >= tasks.length) { kid.send({ stop: true }); return; }
        const i = next++;
        kid.send({ i, task: tasks[i] });
      };
      for (let k = 0; k < width; k++) {
        const kid = fork(WORKER, ['--pool-worker'], {
          execArgv: ['--experimental-strip-types', '--no-warnings'],
          env: { ...process.env, ...opts.env },
          serialization: 'advanced',
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        });
        kids.push(kid);
        kid.on('message', (m: { i: number; ok: boolean; value?: R; error?: string }) => {
          if (!m.ok) {
            failed = true;
            reject(new Error(`${tasks[m.i].fn}(${JSON.stringify(tasks[m.i].args).slice(0, 120)}): ${m.error}`));
            return;
          }
          out[m.i] = m.value as R;
          feed(kid);
        });
        kid.on('exit', (code) => {
          if (code !== 0 && !failed) { failed = true; reject(new Error(`a pool worker exited with ${code}`)); }
          if (--live === 0 && !failed) resolve();
        });
        feed(kid);
      }
    });
  } finally {
    for (const k of kids) if (k.exitCode === null) k.kill();
  }
  return out;
}

if (process.argv.includes('--pool-worker')) {
  const mods = new Map<string, Record<string, (...a: unknown[]) => unknown>>();
  process.on('message', async (m: { stop?: boolean; i: number; task: Task }) => {
    if (m.stop) { process.disconnect(); return; }
    try {
      if (!mods.has(m.task.mod)) mods.set(m.task.mod, await import(m.task.mod));
      const f = mods.get(m.task.mod)![m.task.fn];
      if (typeof f !== 'function') throw new Error(`${m.task.mod} exports no function ${m.task.fn}`);
      process.send!({ i: m.i, ok: true, value: await f(...m.task.args) });
    } catch (e) {
      process.send!({ i: m.i, ok: false, error: (e as Error).stack ?? String(e) });
    }
  });
}
