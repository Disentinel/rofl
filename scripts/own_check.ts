// own_check.ts — A KILLED RUN LEAVES NOTHING BEHIND (scripts/own.ts). A run that opened headless Chrome, and one whose
// pool worker waits on a child, is killed mid-run; then no process of it may be left, nor the browser's profile.
// Each case runs honest, and again with a fault planted (`none`: nothing stopped; `direct`: only the children), which
// must leave something. A run killed by SIGKILL can stop nothing itself: what it leaves is reaped on the next start.
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { chrome, opened } from './workbench_browser.ts';
import { runPool } from './pool.ts';
import { broken, reap } from './own.ts';

const SELF = new URL(import.meta.url).pathname;
const MARK = `wait-${process.pid}`;

/** A pool task: a child that outlives any run. */
export function waits(mark: string): void { spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 300_000)', mark]); }

const [, , role, what, plant] = process.argv;
if (role === '--run') {
  if (plant) broken.add(plant);
  if (what === 'pool') { console.log(`ready ${MARK}`); await runPool([{ mod: SELF, fn: 'waits', args: [MARK] }], { width: 1 }); }
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
    if (what !== 'throw') p.kill(signal);
    await new Promise((r) => p.once('exit', r));
    await sleep(500);
    return { mark: mk, left: left(mk), dir: what !== 'pool' && fs.existsSync(mark) };
  };
  const bad: string[] = [];
  const clean = (r: { mark: string }) => { for (const p of left(r.mark)) try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } };
  const honest = async (what: string, signal: NodeJS.Signals) => {
    const r = await run(what, signal);
    if (r.left.length || r.dir) bad.push(`BROKEN ${what}, ${signal}: ${r.left.length} processes left${r.dir ? ' and the profile' : ''}`);
    else console.log(`  ok    ${what}, ${signal === 'SIGTERM' && what === 'throw' ? 'an uncaught error' : signal}: nothing left`);
    clean(r);
  };
  const planted = async (what: string, plant: string) => {
    const r = await run(what, 'SIGTERM', plant);
    if (!r.left.length) bad.push(`BROKEN ${what} with '${plant}' planted left nothing, so the check sees nothing`);
    else console.log(`  red   ${what} with '${plant}' planted: ${r.left.length} processes left`);
    clean(r); reap();
  };
  const browser = !!chrome() && process.env.ROFL_NO_BROWSER !== '1';
  await honest('pool', 'SIGTERM');
  await honest('pool', 'SIGINT');
  await planted('pool', 'direct');
  await planted('pool', 'none');
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
