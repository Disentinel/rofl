// own.ts — WHAT A RUN STARTS, IT STOPS. On exit, on SIGTERM, SIGINT and SIGHUP and on an uncaught error, every process
// below this one is killed (a pool worker, the `rofl` it waits on, a browser and its helpers) and the directories it
// was given are removed. Measured 2026-10-21: `timeout 115` killed node and not the headless Chrome it had started in a
// group of its own, and 16 of them, 130 processes, ran on for a day at a load average of 272.
//
// A run killed by SIGKILL runs nothing: its browsers are left to their parent, init, and `reap` kills them on the next
// start; a pool worker finishes the task it is in and exits when it finds its parent gone.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Faults scripts/own_check.ts plants to see its check go red: `none`, nothing stopped; `direct`, only the children. */
export const broken = new Set<string>();

const dirs = new Set<string>();
let armed = false;

const table = (): [number, number, string][] =>
  spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).stdout.split('\n').flatMap((l) => {
    const m = /^\s*(\d+)\s+(\d+)\s(.*)$/.exec(l);
    return m ? [[Number(m[1]), Number(m[2]), m[3]] as [number, number, string]] : [];
  });

/** Every process below `pid`, by parent, children first. */
export function below(pid = process.pid): number[] {
  const kids = new Map<number, number[]>();
  for (const [p, pp] of table()) kids.set(pp, [...kids.get(pp) ?? [], p]);
  const out: number[] = [], todo = [pid];
  while (todo.length) for (const k of kids.get(todo.pop()!) ?? []) { out.push(k); todo.push(k); }
  return out;
}

function stop(): void {
  if (broken.has('none')) return;
  const kids = broken.has('direct') ? table().filter(([, pp]) => pp === process.pid).map(([p]) => p) : below();
  for (const p of kids) try { process.kill(p, 'SIGKILL'); } catch { /* gone already */ }
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  dirs.clear();
}

/** This process owns what it starts; `dir`, removed with it. Returns the release of `dir`, for a run that removed it itself. */
export function own(dir?: string): () => void {
  if (dir) dirs.add(dir);
  if (!armed) {
    armed = true;
    process.on('exit', stop);
    process.on('uncaughtExceptionMonitor', stop);
    for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(s, () => { stop(); process.exit(128 + os.constants.signals[s]); });
  }
  return () => { if (dir) dirs.delete(dir); };
}

/** A browser of an earlier run whose owner is gone (killed by SIGKILL, so its parent is now init) is killed with its
 *  helpers, and a profile directory no browser uses and a minute old is removed. */
export function reap(): void {
  const ps = table(), used = new Set<string>();
  for (const [p, pp, cmd] of ps) {
    const d = /--user-data-dir=(\S*wb-chrome-\S*)/.exec(cmd)?.[1];
    if (!d) continue;
    used.add(path.basename(d));
    if (pp === 1) try { process.kill(-p, 'SIGKILL'); } catch { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  }
  for (const e of fs.readdirSync(os.tmpdir()).filter((e) => e.startsWith('wb-chrome-') && !used.has(e))) {
    const d = path.join(os.tmpdir(), e);
    try { if (Date.now() - fs.statSync(d).mtimeMs > 60_000) fs.rmSync(d, { recursive: true, force: true }); } catch { /* another run's */ }
  }
}
