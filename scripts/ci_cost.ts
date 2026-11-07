// scripts/ci_cost.ts — what CI costs and what a change does to it, as facts and the models over them.
//
//   node --experimental-strip-types scripts/ci_cost.ts [--check]
//
// The workflows (scanners/gh_actions.py) and the form of the gates (scanners/ci_cost.ts) are read from this tree; the
// prices from the ci-cost-worlds and ci-cost-breaks artifacts of the last run of ci.yml on main (gh, GH_TOKEN in CI);
// the last 30 runs (scanners/gh_runs.py) only for the report. models/process/ci/cost.rofl and gate.rofl are evaluated
// over them; the invariants broken are said, the accepted ones beside them. --check exits 1 on one not accepted.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.cache/ci');
const REPO = 'Disentinel/rofl';
const check = process.argv.includes('--check');
const run = (cmd: string, args: string[]): string => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'] });
const write = (f: string, text: string): string => { const p = path.join(OUT, f); fs.writeFileSync(p, text); return p; };
fs.mkdirSync(OUT, { recursive: true });

const files = [write('workflows.rofl', run('python3', ['scanners/gh_actions.py', '.']))];
if (!check) files.push(write('runs.rofl', run('python3', ['scanners/gh_runs.py', REPO, '--workflow', 'ci.yml', '--runs', '30'])));

// the prices: the newest run on main that left both artifacts
const prices = path.join(OUT, 'prices');
let from = '';
try {
  const runs = JSON.parse(run('gh', ['run', 'list', '-R', REPO, '-w', 'ci.yml', '-b', 'main', '-e', 'push', '-s', 'completed', '-L', '10', '--json', 'databaseId'])) as { databaseId: number }[];
  for (const { databaseId } of runs) {
    fs.rmSync(prices, { recursive: true, force: true });
    try {
      for (const n of ['ci-cost-worlds', 'ci-cost-breaks']) run('gh', ['run', 'download', String(databaseId), '-R', REPO, '-n', n, '-D', prices]);
      from = String(databaseId);
      break;
    } catch { /* that run left none: the one before */ }
  }
} catch (e) { console.error(`no prices from main: ${(e as Error).message.split('\n')[0]}`); }
const args = from ? ['--times', path.join(prices, 'world-times.tsv'), '--breaks-times', path.join(prices, 'agg-breaks-times.json')] : [];
files.push(write('cost.rofl', run('node', ['--experimental-strip-types', '--no-warnings', 'scanners/ci_cost.ts', ...args])));
files.push(...['cost.rofl', 'gate.rofl', 'accepted.rofl'].map((f) => path.join(ROOT, 'models/process/ci', f)));

const r = new Rofl();
r.load(fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8'));
for (const f of files) { const res = r.load(fs.readFileSync(f, 'utf8')); if (!res.ok) throw new Error(`${path.relative(ROOT, f)} does not load: ${res.diagnostics[0]}`); }
r.evaluate();
const rows = (q: string, ...vs: string[]): string[][] => r.query(q).rows.map((x) => vs.map((v) => { const s = String(x.bindings[v]); return s.startsWith('"') ? JSON.parse(s) as string : s; })).sort();
const one = (q: string, v: string): string => rows(q, v)[0]?.[0] ?? '?';

console.log(from ? `prices from run ${from} on main` : 'no prices from main: every proof is unknown');
console.log(`breaks: ${(+one('breaks_cpu_main(C)', 'C') / 1000).toFixed(0)} CPU s on main, ${(+one('breaks_cpu_now(C)', 'C') / 1000).toFixed(0)} with this tree, ${one('breaks_growth(S)', 'S')} s of wall more`);
if (!check) {
  console.log(`run twice: ${one('twice_count(N)', 'N')} commits of the last 30 runs, ${one('twice_total(S)', 'S')} s`);
  for (const [r, d] of rows('held_open(R, D)', 'R', 'D')) console.log(`held open ${d} s past its verdict: run ${r}`);
}
const red = rows('red(I, A, B)', 'I', 'A', 'B');
for (const [i, a, b] of rows('held_accepted(I, A, B)', 'I', 'A', 'B')) console.log(`accepted ${i}: ${[a, b].filter(Boolean).join(' / ')}`);
for (const [i, a, b] of rows('not_priced(I, A, B)', 'I', 'A', 'B')) console.log(`unknown  ${i}: ${[a, b].filter(Boolean).join(' / ')}`);
for (const [i, a, b] of red) console.log(`RED      ${i}: ${[a, b].filter(Boolean).join(' / ')}`);
console.log(red.length ? `${red.length} invariants of CI broken: fix them, or accept each in models/process/ci/accepted.rofl` : 'every invariant of CI holds');
process.exit(check && red.length ? 1 : 0);
