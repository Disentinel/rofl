// serve.ts — A TICK WITHOUT A RESTART (S3h, C): one process per tenant answers
// verbs over stdio as JSON lines — a request `{"verb", "args", "env"}` and an
// answer `{"code", "stdout", "stderr"}` — with the warm lower layers held in
// memory and forked per call (warm.ts), so a call costs the books and the
// fixpoint over them, not a parse of the programme and a restore of 12 MB.
// The shim that speaks to it is S1m's; here is the server and its measure.
//
//   SPAT_ROOT=… SPAT_TENANT=… SPAT_AS=me spat serve < requests.jsonl
//
// The request's `env` may carry SPAT_* keys of ONE CALL — the identity
// (SPAT_AS / SPAT_FROM_ID), SPAT_NOW, SPAT_VIA, SPAT_TZ — never the root or the
// tenant: the process is the tenant. Every call is an ordinary `main(argv)`
// with the volume re-read, so a write lands in SQLite before its answer is
// sent and the next call reads it; a call that raises answers with the code
// the CLI would exit with. `{"verb":"ping"}` answers `{"code":0}`; EOF ends.

import * as readline from 'node:readline';
import { main } from './spat.ts';
import { type Env } from './store.ts';

const CALL_KEYS = new Set(['SPAT_AS', 'SPAT_FROM_ID', 'SPAT_NOW', 'SPAT_VIA', 'SPAT_TZ', 'SPAT_WARM', 'SPAT_WARM_LOG']);
interface Request { verb?: string; args?: string[]; env?: Record<string, string>; }
interface Answer { code: number; stdout: string; stderr: string; ms: number; }

/** One request, run as the CLI would run it, its streams captured. */
export async function answer(req: Request, base: Record<string, string | undefined>): Promise<Answer> {
  const t = Date.now();
  const out: string[] = []; const err: string[] = [];
  const log = console.log; const error = console.error;
  console.log = (...xs: unknown[]) => { out.push(xs.map(String).join(' ')); };
  console.error = (...xs: unknown[]) => { err.push(xs.map(String).join(' ')); };
  const saved = { ...process.env };
  let code = 0;
  try {
    for (const k of Object.keys(process.env)) if (k.startsWith('SPAT_')) delete process.env[k];
    for (const [k, v] of Object.entries(base)) if (v !== undefined) process.env[k] = v;
    for (const [k, v] of Object.entries(req.env ?? {})) {
      if (!CALL_KEYS.has(k)) throw Object.assign(new Error(`${k}: не ключ вызова — процесс и есть арендатор (SPAT_ROOT/SPAT_TENANT его)`), { code: 2 });
      process.env[k] = v;
    }
    // exactly one identity per call: the request's replaces the server's
    if (req.env?.SPAT_FROM_ID !== undefined) delete process.env.SPAT_AS;
    if (req.env?.SPAT_AS !== undefined) delete process.env.SPAT_FROM_ID;
    if (req.verb === 'ping') return { code: 0, stdout: '', stderr: '', ms: Date.now() - t };
    if (req.verb === undefined) throw Object.assign(new Error('нет глагола'), { code: 2 });
    process.exitCode = 0;
    await main([req.verb, ...(req.args ?? [])]);
    code = Number(process.exitCode ?? 0);
  } catch (e) {
    const c = (e as { code?: number }).code;
    if (typeof c === 'number') { out.push((e as Error).message); code = c; } else { err.push((e as Error).message); code = 1; }
  } finally {
    process.exitCode = 0;
    console.log = log; console.error = error;
    for (const k of Object.keys(process.env)) if (k.startsWith('SPAT_')) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (k.startsWith('SPAT_') && v !== undefined) process.env[k] = v;
  }
  return { code, stdout: out.join('\n'), stderr: err.join('\n'), ms: Date.now() - t };
}

/** The loop: a line in, a line out, in order; a line that is not JSON answers code 2. */
export async function serve(e: Env): Promise<void> {
  const base: Record<string, string | undefined> = { SPAT_ROOT: e.root, SPAT_TENANT: e.tenant, SPAT_TZ: e.tz, SPAT_VIA: e.via, SPAT_NOW: process.env.SPAT_NOW, SPAT_WARM: process.env.SPAT_WARM ?? '1', SPAT_WARM_LOG: process.env.SPAT_WARM_LOG, SPAT_AS: process.env.SPAT_AS, SPAT_FROM_ID: process.env.SPAT_FROM_ID };
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim() === '') continue;
    let req: Request;
    try { req = JSON.parse(line); } catch { process.stdout.write(`${JSON.stringify({ code: 2, stdout: 'не разобрал: строка запроса не JSON', stderr: '', ms: 0 })}\n`); continue; }
    process.stdout.write(`${JSON.stringify(await answer(req, base))}\n`);
  }
}
