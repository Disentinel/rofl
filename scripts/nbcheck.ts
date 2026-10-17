// nbcheck.ts — a notebook run by the Rust binary (`rofl nb FILE`, rust/rofl/src/md/nb.rs) against the TypeScript kernel
// (`npm run nb -- FILE`, ROFL_NB_DAEMON=0), byte for byte: the text on stdout and the exit code. A notebook the Rust binary
// says it does not read yet (`draw`, code, `model: js`) is outside the slice and is counted, not compared.
//
//   npm run nbcheck [-- FILE.rofl.md ...]      every tracked .rofl.md, or those; pooled over ROFL_JOBS processes
import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { jobs as width } from './pool.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const BIN = `${ROOT}rust/target/${process.env.ROFL_PROFILE || 'release'}/rofl`;
if (!existsSync(BIN)) { console.error(`${BIN}: build it first (cargo build --release in rust/)`); process.exit(2); }
const jobs = width();
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : execFileSync('git', ['ls-files', '*.rofl.md'], { cwd: ROOT }).toString().split('\n').filter(Boolean);

type Run = { out: string; err: string; code: number; ms: number };
const run = (cmd: string, args: string[], env = {}): Promise<Run> => new Promise((done) => {
  const t0 = Date.now();
  execFile(cmd, args, { cwd: ROOT, maxBuffer: 1 << 28, timeout: 110_000, env: { ...process.env, ...env } }, (e, out, err) => done({ out, err, code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, ms: Date.now() - t0 }));
});
/** The first line two texts part at. */
const parted = (a: string, b: string): string => {
  const x = a.split('\n'), y = b.split('\n');
  let i = 0; while (x[i] === y[i]) i++;
  return `line ${i + 1}:\n      ts:   ${x[i] ?? '(end)'}\n      rust: ${y[i] ?? '(end)'}`;
};

const differ: string[] = [];
let outside = 0, alike = 0;
const slow = { ts: { ms: 0, f: '' }, rs: { ms: 0, f: '' } };
const one = async (f: string): Promise<void> => {
  const b = await run(BIN, ['nb', f]);
  if (b.code === 2 && /not native yet/.test(b.err)) { outside++; return; }
  const a = await run('node', ['--experimental-strip-types', 'notebook/cli.ts', f], { ROFL_NB_DAEMON: '0' });
  if (a.ms > slow.ts.ms) slow.ts = { ms: a.ms, f };
  if (b.ms > slow.rs.ms) slow.rs = { ms: b.ms, f };
  const why = [a.code !== b.code ? `exit: ts ${a.code}, rust ${b.code}` : null, a.out !== b.out ? `text differs at ${parted(a.out, b.out)}` : null].filter(Boolean);
  if (why.length) differ.push(`${f}\n    ${why.join('\n    ')}`); else alike++;
};

const t0 = Date.now();
const todo = [...files];
await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, async () => { for (let f = todo.shift(); f; f = todo.shift()) await one(f); }));
for (const d of differ) console.log(d);
console.log(`${alike} of ${files.length - outside} notebooks print alike under the TypeScript kernel and the Rust binary; ${outside} outside the slice (draw, code, model: js) (${jobs} jobs, ${((Date.now() - t0) / 1000).toFixed(1)} s; slowest: ts ${slow.ts.ms} ms ${slow.ts.f}, rust ${slow.rs.ms} ms ${slow.rs.f})`);
process.exit(differ.length ? 1 : 0);
