// mdcheck.ts — the Rust reader of `.rofl.md` worlds (`rofl render --out DIR X.rofl.md`, rust/rofl/src/md/) against
// the TypeScript one (`scripts/read.ts X.rofl.md --out F`), byte for byte: the report, the rules, the sentences learned.
//
//   npm run mdcheck [-- FILE.rofl.md ...]      every tracked .rofl.md, or those; pooled over ROFL_JOBS processes
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { jobs as width } from './pool.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const BIN = `${ROOT}rust/target/${process.env.ROFL_PROFILE || 'release'}/rofl`;
if (!existsSync(BIN)) { console.error(`${BIN}: build it first (cargo build --release in rust/)`); process.exit(2); }
const jobs = width();
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : execFileSync('git', ['ls-files', '*.rofl.md'], { cwd: ROOT }).toString().split('\n').filter(Boolean);
const tmp = path.join(os.tmpdir(), `rofl-mdcheck-${process.pid}`);

const run = (cmd: string, args: string[]): Promise<{ out: string; code: number; ms: number }> => new Promise((done) => {
  const t0 = Date.now();
  execFile(cmd, args, { cwd: ROOT, maxBuffer: 1 << 28, timeout: 110_000 }, (e, out) => done({ out, code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, ms: Date.now() - t0 }));
});
const read = (f: string) => existsSync(f) ? readFileSync(f, 'utf8') : null;
/** The first line two texts part at, or null. */
const parted = (a: string | null, b: string | null): string | null => {
  if (a === b) return null;
  if (a === null || b === null) return a === null ? 'only Rust wrote it' : 'only TypeScript wrote it';
  const x = a.split('\n'), y = b.split('\n');
  let i = 0; while (x[i] === y[i]) i++;
  return `line ${i + 1}:\n      ts:   ${x[i] ?? '(end)'}\n      rust: ${y[i] ?? '(end)'}`;
};

const differ: string[] = [];
const slow = { ts: { ms: 0, f: '' }, rs: { ms: 0, f: '' } };
const one = async (f: string): Promise<void> => {
  const flat = f.replace(/[/\\.]+/g, '_'), stem = path.basename(f).replace(/\.rofl\.md$/, '');
  const ts = path.join(tmp, 'ts', flat), rs = path.join(tmp, 'rs', flat);
  mkdirSync(ts, { recursive: true }); mkdirSync(rs, { recursive: true });
  const [a, b] = await Promise.all([
    run('node', ['--experimental-strip-types', 'scripts/read.ts', f, '--out', path.join(ts, `${stem}.rofl`)]),
    run(BIN, ['render', '--out', rs, f]),
  ]);
  if (a.ms > slow.ts.ms) slow.ts = { ms: a.ms, f };
  if (b.ms > slow.rs.ms) slow.rs = { ms: b.ms, f };
  const why = [
    a.code !== b.code ? `exit: ts ${a.code}, rust ${b.code}` : null,
    ...[['report', a.out, b.out], ['rules', read(path.join(ts, `${stem}.rofl`)), read(path.join(rs, `${stem}.rofl`))],
      ['sentences', read(path.join(ts, `${stem}.phrases.rofl`)), read(path.join(rs, `${stem}.phrases.rofl`))]]
      .map(([what, x, y]) => { const p = parted(x, y); return p && `${what} differ at ${p}`; }),
  ].filter(Boolean);
  if (why.length) differ.push(`${f}\n    ${why.join('\n    ')}`);
};

const t0 = Date.now();
const todo = [...files];
await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, async () => { for (let f = todo.shift(); f; f = todo.shift()) await one(f); }));
rmSync(tmp, { recursive: true, force: true });
for (const d of differ) console.log(d);
console.log(`${files.length - differ.length} of ${files.length} .rofl.md files read alike by the TypeScript and the Rust reader (${jobs} jobs, ${((Date.now() - t0) / 1000).toFixed(1)} s; slowest: ts ${slow.ts.ms} ms ${slow.ts.f}, rust ${slow.rs.ms} ms ${slow.rs.f})`);
process.exit(differ.length ? 1 : 0);
