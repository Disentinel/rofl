// demolib.ts — WHAT THE TWO SPAT DEMOS SHARE: a fresh tenant from the shipped
// fixture, the database asked directly, one `spat` call as a child process,
// one verb run in this process, and the group that collects verdicts. The
// demos are two files because a demo has 120 s in scripts/goldens.ts and one
// `spat` call is 1.45 s of fixpoint — measured 2026-09-15, 165 scenarios in
// one file were 289 CPU-seconds and 132 s of wall on a shared four-core
// machine, and the hosts bless recorded a killed run.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { SpatError, env, openStore, type Store } from './store.ts';
import { load, openVolume } from './volume.ts';

export const HERE = path.dirname(new URL(import.meta.url).pathname);
export const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'spat-demo-'));
export const CLI = path.join(HERE, 'spat.ts');
export const NOW = '2026-08-31T21:30:00+03:00';
export const WEEK = path.join(HERE, 'week.example.rofl');
export const FIX = path.join(HERE, 'store.example');
export const mask = (s: string): string => s.split(ROOT).join('$ROOT');
export const TRAIL = { at: NOW, via: 'cli', edit: 'load store.example' };

/** One group's lines and verdicts, printed together when every group is done. */
export class Group {
  lines: string[] = []; fails = 0; n = 0;
  constructor(title: string) { this.lines.push(`\n${title}`); }
  check(name: string, ok: boolean, detail = ''): void {
    this.n++;
    this.lines.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n       ${mask(detail)}`}`);
    if (!ok) this.fails++;
  }
  code(name: string, r: Res, want: number): void {
    this.check(`${name} → код ${want}`, r.code === want, `got ${r.code}: ${r.out.split('\n')[0]}`);
  }
}

/** A fresh tenant under its own root: the shipped fixture imported into a
 *  volume the way the stand migrates — one `volume load` per book. */
export function fresh(): string {
  const root = fs.mkdtempSync(path.join(ROOT, 'r-'));
  const v = openVolume(root, 'example', true);
  load(v, path.join(FIX, 'users.rofl'), TRAIL);
  load(v, WEEK, TRAIL, 'world');
  for (const f of fs.readdirSync(path.join(FIX, 'ledgers')).sort()) load(v, path.join(FIX, 'ledgers', f), TRAIL);
  load(v, path.join(FIX, 'me.rofl'), TRAIL);
  v.db.close();
  return root;
}
/** The database, asked directly — what a demo may do and the tool may not. */
export function sql<T>(root: string, q: string, ...args: (string | number)[]): T {
  const v = openVolume(root, 'example');
  try { return v.db.prepare(q).all(...args) as unknown as T; } finally { v.db.close(); }
}
export const count = (root: string, ledger: string): number =>
  sql<{ n: number }[]>(root, 'SELECT count(*) n FROM facts WHERE ledger = ?', ledger)[0].n;
export const top = (root: string, ledger: string): number =>
  sql<{ s: number }[]>(root, 'SELECT coalesce(max(seq), 0) s FROM facts WHERE ledger = ?', ledger)[0].s;

export interface Res { code: number; out: string; }
/** The people call as Telegram senders — SPAT_FROM_ID, and the users book says
 *  who and which family; `me` calls by name, as the scheduler does. */
export const FROM: Record<string, string> = { alex: '100001', robin: '100002', nanny: '100003', mallory: '100004', uncle: '100005' };
export function spat(root: string, as: string, args: string[], extra: Record<string, string | undefined> = {}): Promise<Res> {
  const who = FROM[as] ? { SPAT_FROM_ID: FROM[as] } : { SPAT_AS: as, SPAT_TENANT: 'example' };
  const e: Record<string, string | undefined> = { ...process.env, SPAT_ROOT: root, SPAT_TZ: 'Europe/Nicosia', SPAT_NOW: NOW, ...who, ...extra };
  for (const k of ['SPAT_AS', 'SPAT_FROM_ID', 'SPAT_TENANT']) if (!(k in who) && !(k in extra)) delete e[k];
  for (const k of Object.keys(extra)) if (extra[k] === undefined) delete e[k];
  return new Promise((resolve) => {
    // node:sqlite still warns `ExperimentalWarning` on 22.x, with the pid in the line; the stand silences it the same way
    const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--experimental-strip-types', CLI, ...args], { env: e });
    let out = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('error', (e) => { out += `spawn: ${e.message}`; });
    p.on('close', (code, signal) => resolve({ code: code ?? -1, out: mask(out + (signal ? ` [${signal}]` : '')) }));
  });
}
export const withEnv = <T,>(vars: Record<string, string>, f: () => T): T => {
  const saved = { ...process.env };
  for (const k of ['SPAT_AS', 'SPAT_FROM_ID', 'SPAT_TENANT']) delete process.env[k];
  Object.assign(process.env, { SPAT_NOW: NOW, ...vars });
  try { return f(); } finally {
    for (const k of ['SPAT_ROOT', 'SPAT_TENANT', 'SPAT_AS', 'SPAT_FROM_ID', 'SPAT_NOW']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
};
export const codeOf = (f: () => unknown): string => { try { f(); return 'no throw'; } catch (e) { return e instanceof SpatError ? `code ${e.code}: ${e.message}` : String(e); } };
/** A verb run IN THIS PROCESS over an opened store — the same code path as
 *  the CLI minus the process: one world can answer several refusals, where
 *  a spawn per refusal is one evaluation each (measured: 1.2 s of a spawn's
 *  1.45 s is the fixpoint, and the demo is CPU-bound on four cores). */
export function inproc(vars: Record<string, string>, f: (s: Store) => number): Res {
  const lines: string[] = []; const log = console.log;
  console.log = (...xs: unknown[]): void => { lines.push(xs.map(String).join(' ')); };
  try { return withEnv(vars, () => { try { return { code: f(openStore(env())), out: mask(lines.join('\n')) }; } catch (e) { return { code: e instanceof SpatError ? e.code : -1, out: mask(lines.concat(String((e as Error).message)).join('\n')) }; } }); }
  finally { console.log = log; }
}
export const asRobin = (root: string): Record<string, string> => ({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.robin });

