// demo.ts — A TICK WITHOUT A RESTART (S3h, C): `spat serve` answers verbs over
// stdio as JSON lines with the lower layers held in memory; every answer must
// be the CLI's, byte for byte, on the same volume state — a read, an edit
// that writes and the read after it, a refusal by code; the request may name
// a person and a clock, never the tenant. Twenty calls in one session against
// twenty processes, timed (31).
//
//   node --experimental-strip-types examples/spat_serve/demo.ts

import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { CLI, FROM, Group, ROOT, fresh, mask, spat } from '../spat/demolib.ts';

const NOW = '2026-08-31T21:30:00+03:00';
interface Answer { code: number; stdout: string; stderr: string; ms: number; }
/** A serve session over one volume: requests in, answers out, in order. */
class Session {
  answers: Answer[] = []; private buf = ''; private waiters: ((a: Answer) => void)[] = [];
  p: ReturnType<typeof spawn>;
  constructor(root: string, env: Record<string, string> = {}) {
    this.p = spawn(process.execPath, ['--single-threaded-gc', '--max-semi-space-size=64', '--disable-warning=ExperimentalWarning', '--experimental-strip-types', CLI, 'serve'],
      { env: { ...process.env, SPAT_ROOT: root, SPAT_TENANT: 'example', SPAT_AS: 'me', SPAT_TZ: 'Europe/Nicosia', SPAT_NOW: NOW, SPAT_WARM: '1', ...env } });
    this.p.stdout!.on('data', (d) => { this.buf += d; const parts = this.buf.split('\n'); this.buf = parts.pop()!; for (const l of parts) { const a = JSON.parse(l) as Answer; this.answers.push(a); this.waiters.shift()?.(a); } });
    this.p.stderr!.on('data', () => { /* the warm log, when asked for */ });
  }
  ask(line: string): Promise<Answer> { return new Promise((res) => { this.waiters.push(res); this.p.stdin!.write(`${line}\n`); }); }
  req(verb: string, args: string[] = [], env: Record<string, string> = {}): Promise<Answer> { return this.ask(JSON.stringify({ verb, args, env })); }
  async close(): Promise<void> { this.p.stdin!.end(); await new Promise((r) => this.p.on('close', r)); }
}

async function serve(): Promise<Group> {
  const g = new Group('31. spat serve — JSONL over stdio, the answer is the CLI\'s byte for byte; identity and clock per request, the tenant never; a write lands before its answer; refusals by code; 20 calls in one session against 20 processes');
  const a = fresh(); const b = fresh();   // the session's volume, and the CLI's — one call each, in the same order
  const s = new Session(a);
  const calls: [string, string[], Record<string, string>][] = [
    ['whoami', [], { SPAT_FROM_ID: FROM.robin }],
    ['show', ['thu', '--format', 'tg'], { SPAT_FROM_ID: FROM.robin }],
    ['edit', ['add errand thu 17:30-18:30 robin shop'], { SPAT_FROM_ID: FROM.robin, SPAT_VIA: 'telegram' }],
    ['show', ['thu'], { SPAT_FROM_ID: FROM.robin }],
    ['tomorrow', [], { SPAT_FROM_ID: FROM.alex, SPAT_NOW: '2026-09-06T21:30:00+03:00' }],
    ['need', ['list'], { SPAT_FROM_ID: FROM.robin }],
    ['warnings', [], { SPAT_FROM_ID: FROM.robin }],
    ['whoami', [], {}],
  ];
  const ping = await s.req('ping');
  g.check('ping → {"code":0}', ping.code === 0 && ping.stdout === '', JSON.stringify(ping));
  for (const [verb, args, env] of calls) {
    const got = await s.req(verb, args, env);
    const cli = await spat(b, env.SPAT_FROM_ID === FROM.robin ? 'robin' : env.SPAT_FROM_ID === FROM.alex ? 'alex' : 'me', [verb, ...args], { ...(env.SPAT_NOW ? { SPAT_NOW: env.SPAT_NOW } : {}), ...(env.SPAT_VIA ? { SPAT_VIA: env.SPAT_VIA } : {}) });
    // the volume's path is in whoami's lines: each side's root masks to the same word
    const S = got.stdout.split(a).join('$R').trimEnd(), C = cli.out.split(mask(b)).join('$R').trimEnd();
    const same = got.code === cli.code && S === C;
    g.check(`${verb} ${args.join(' ')} (${env.SPAT_FROM_ID ?? 'me'}): код ${cli.code}, stdout сессии = stdout процесса`, same, same ? '' : `session: ${S.split('\n').find((l, i) => l !== C.split('\n')[i])} | cli: ${C.split('\n').find((l, i) => l !== S.split('\n')[i])}`);
  }
  // the refusals: a key that is not a call's, a line that is not JSON, no verb, an unknown verb, a stranger
  const r1 = await s.req('whoami', [], { SPAT_ROOT: '/etc' });
  const r2 = await s.ask('{not json');
  const r3 = await s.ask('{"args": []}');
  const r4 = await s.req('nothing', [], { SPAT_FROM_ID: FROM.robin });
  const r5 = await s.req('whoami', [], { SPAT_FROM_ID: '424242' });
  g.check('SPAT_ROOT в env запроса → 2 «не ключ вызова»; не JSON → 2; без глагола → 2; неизвестный глагол → 2; чужой from_id → 5 «я вас не знаю»', r1.code === 2 && /не ключ вызова/.test(r1.stdout) && r2.code === 2 && r3.code === 2 && r4.code === 2 && r5.code === 5 && /я вас не знаю/.test(r5.stdout), [r1, r2, r3, r4, r5].map((x) => `${x.code}: ${x.stdout.split('\n')[0]}`).join(' | '));
  g.check('после отказов сессия жива: whoami robin → 0', (await s.req('whoami', [], { SPAT_FROM_ID: FROM.robin })).code === 0);
  // 20 reads in the session against 20 processes — the measure the tick was asked for (a timing line, masked by the golden)
  const reads: [string, string[]][] = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? ['whoami', []] : ['show', [['mon', 'tue', 'wed', 'thu', 'fri'][i % 5], '--format', 'tg']]));
  const t0 = Date.now();
  for (const [verb, args] of reads) await s.req(verb, args, { SPAT_FROM_ID: FROM.robin });
  const tSession = Date.now() - t0;
  const t1 = Date.now();
  for (const [verb, args] of reads) await spat(b, 'robin', [verb, ...args]);
  const tProcs = Date.now() - t1;
  const inner = s.answers.slice(-20).map((x) => x.ms);
  console.error(`20 calls: session ${tSession} ms (per call ${Math.round(tSession / 20)} ms, inside ${Math.min(...inner)}–${Math.max(...inner)} ms), 20 processes ${tProcs} ms (per call ${Math.round(tProcs / 20)} ms)`);
  g.check('20 вызовов в сессии быстрее 20 процессов', tSession < tProcs, `${tSession} vs ${tProcs}`);
  await s.close();
  g.check('EOF на stdin — процесс завершился, код 0', s.p.exitCode === 0, String(s.p.exitCode));
  return g;
}

const t0 = Date.now();
const g = await serve();
for (const l of g.lines) console.log(l);
console.log(`\n${g.n - g.fails}/${g.n} scenarios`);
console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(g.fails === 0 ? 0 : 1);
