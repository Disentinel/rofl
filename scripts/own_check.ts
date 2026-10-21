// own_check.ts — A KILLED RUN LEAVES NOTHING BEHIND (scripts/own.ts). A run that opened headless Chrome, and one whose
// pool worker waits on a child, is killed mid-run; then no process of it may be left, nor the browser's profile.
// Each case runs honest, and again with a fault planted (`none`: nothing stopped; `direct`: only the children;
// `orphan`: a worker unwatched), which must leave something. A run killed by SIGKILL can stop nothing itself: its pool
// workers are killed by their watchers, its browser is reaped on the next start. And an uncaught error under npm is
// said, with exit 1 (`mute` planted: not said; `killed`: ended by a signal).
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { chrome, opened } from './workbench_browser.ts';
import { runPool } from './pool.ts';
import { broken, reap, watchers } from './own.ts';

const SELF = new URL(import.meta.url).pathname;
const MARK = `wait-${process.pid}`;

/** A pool task: a child that holds `ms`, longer than any case waits; under `orphan` the worker's watcher is gone. */
export function waits(mark: string, ms: number, plant: string): void {
  if (plant.includes('orphan')) for (const w of watchers) w.kill('SIGKILL');
  spawnSync(process.execPath, ['-e', `setTimeout(() => {}, ${ms})`, mark]);
}
export function throws(): void { throw new Error('a task that threw'); }

const [, , role, what, plant] = process.argv;
if (role === '--run') {
  for (const p of (plant ?? '').split(',').filter(Boolean)) broken.add(p);
  if (what === 'pool') { console.log(`ready ${MARK}`); await runPool([{ mod: SELF, fn: 'waits', args: [MARK, 60_000, plant ?? ''] }], { width: 1 }); }
  else if (what === 'poolthrow') await runPool([{ mod: SELF, fn: 'throws', args: [] }], { width: 1 });
  else await opened(os.tmpdir(), '', async () => {
    const mine = spawnSync('ps', ['-axo', 'ppid=,command='], { encoding: 'utf8' }).stdout.split('\n').find((l) => Number(l.trim().split(' ')[0]) === process.pid && l.includes('--user-data-dir='))!;
    const profile = /--user-data-dir=(\S+)/.exec(mine)![1];
    console.log(`ready ${profile}`);
    if (what === 'throw') setTimeout(() => { throw new Error('an error nobody caught'); }, 100);
    await new Promise(() => {});
  }, chrome()!, true);
} else if (path.basename(process.argv[1]) === 'own_check.ts') {   // not in a pool worker, which imports this file for `waits`
  const left = (mark: string): number[] => spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).stdout.split('\n')
    .filter((l) => l.includes(mark) && !l.includes('own_check.ts')).map((l) => Number(l.trim().split(/\s+/)[0]));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** A run started, killed by `signal` once it says it is ready; what it leaves behind, by its mark. */
  const run = async (what: string, signal: NodeJS.Signals, plant = ''): Promise<{ mark: string; left: number[]; dir: boolean }> => {
    const p = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', SELF, '--run', what, plant], { stdio: ['ignore', 'pipe', what === 'throw' ? 'ignore' : 'inherit'] });
    const mark = await new Promise<string>((ok, no) => {
      p.stdout.on('data', (d) => { const m = /ready (\S+)/.exec(String(d)); if (m) ok(m[1]); });
      p.on('exit', (c) => no(new Error(`the run of ${what} exited ${c} before it was ready`)));
      setTimeout(() => no(new Error(`the run of ${what} was not ready in 30 s`)), 30_000);
    });
    const mk = what === 'pool' ? mark : path.basename(mark);
    for (let i = 0; i < 100 && !left(mk).length; i++) await sleep(100);
    // the pool's worker, the parent of the child that holds the mark
    const workers = what === 'pool' ? spawnSync('ps', ['-axo', 'ppid=,command='], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.includes(mk)).map((l) => Number(l.trim().split(/\s+/)[0])) : [];
    const alive = () => [...left(mk), ...workers.filter((w) => { try { process.kill(w, 0); return true; } catch { return false; } })];
    if (what !== 'throw') p.kill(signal);
    await new Promise((r) => p.once('exit', r));
    // a watcher looks every half second
    for (let i = 0; i < (signal === 'SIGKILL' ? 30 : 5) && alive().length; i++) await sleep(100);
    return { mark: mk, left: alive(), dir: what !== 'pool' && fs.existsSync(mark) };
  };
  const bad: string[] = [];
  const clean = (r: { mark: string }) => { for (const p of left(r.mark)) try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } };
  const honest = async (what: string, signal: NodeJS.Signals) => {
    const r = await run(what, signal);
    if (r.left.length || r.dir) bad.push(`BROKEN ${what}, ${signal}: ${r.left.length} processes left${r.dir ? ' and the profile' : ''}`);
    else console.log(`  ok    ${what}, ${signal === 'SIGTERM' && what === 'throw' ? 'an uncaught error' : signal}: nothing left`);
    clean(r);
  };
  const planted = async (what: string, plant: string, signal: NodeJS.Signals = 'SIGTERM') => {
    const r = await run(what, signal, plant);
    if (!r.left.length) bad.push(`BROKEN ${what}, ${signal}, with '${plant}' planted left nothing, so the check sees nothing`);
    else console.log(`  red   ${what}, ${signal}, with '${plant}' planted: ${r.left.length} processes left`);
    for (const p of r.left) try { process.kill(p, 'SIGKILL'); } catch { /* gone */ }
    clean(r); reap();
  };
  /** A run whose pool task throws, under npm as `npm test` runs: what it said and how it ended. */
  const thrown = (plant = '') => {
    const r = spawnSync('npm', ['exec', '--offline', '-c', `node --experimental-strip-types --no-warnings ${SELF} --run poolthrow ${plant}`], { encoding: 'utf8', timeout: 30_000, cwd: path.join(path.dirname(SELF), '..') });
    return { said: /a task that threw/.test(r.stderr + r.stdout), status: r.status, signal: r.signal };
  };
  const browser = !!chrome() && process.env.ROFL_NO_BROWSER !== '1';
  await honest('pool', 'SIGTERM');
  await honest('pool', 'SIGINT');
  await planted('pool', 'direct,orphan');
  await planted('pool', 'none,orphan');
  await honest('pool', 'SIGKILL');
  await planted('pool', 'orphan', 'SIGKILL');
  {
    const h = thrown(), ok = (x: typeof h) => x.said && x.status === 1 && x.signal === null;
    if (!ok(h)) bad.push(`BROKEN an uncaught error under npm: ${h.said ? 'said' : 'not said'}, exit ${h.status ?? h.signal}`);
    else console.log('  ok    an uncaught error under npm: said, exit 1');
    for (const plant of ['mute', 'killed']) {
      const m = thrown(plant);
      if (ok(m)) bad.push(`BROKEN an uncaught error under npm with '${plant}' planted still passes, so the check sees nothing`);
      else console.log(`  red   an uncaught error under npm with '${plant}' planted: ${m.said ? 'said' : 'not said'}, exit ${m.status ?? m.signal}`);
    }
  }
  if (browser) {
    await honest('chrome', 'SIGTERM');
    await honest('chrome', 'SIGHUP');
    await honest('throw', 'SIGTERM');
    await planted('chrome', 'none');
    // SIGKILL: the run can do nothing; its browser is orphaned until the next start reaps it
    const r = await run('chrome', 'SIGKILL');
    if (!r.left.length) bad.push('BROKEN chrome, SIGKILL left nothing to reap, so the reaper is not seen to work');
    reap(); await sleep(500);
    if (left(r.mark).length) bad.push(`BROKEN chrome, SIGKILL: ${left(r.mark).length} processes left after the reaper`);
    else console.log(`  ok    chrome, SIGKILL: ${r.left.length} processes left, none after the reaper`);
    clean(r);
  } else if (process.env.ROFL_NO_BROWSER !== '1') bad.push('BROKEN no Chrome here (CHROME names one; ROFL_NO_BROWSER=1 to go without): the browser cases were not run');
  for (const b of bad) console.log(b);
  process.exit(bad.length ? 1 : 0);
}
