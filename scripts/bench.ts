// The reference benchmark: one pinned corpus, the measures an owner's work turns on, the median of three runs, on the
// Rust engine (release), against the last version recorded in facts/bench.rofl.
//   npm run bench [-- --write]     --write appends this version's medians to facts/bench.rofl
// Corpus: microsoft/vscode at VSCODE, subset S of scripts/vscode_corpus.ts, cloned once into ~/.cache/rofl-bench.
// Question: examples/vscode/side-effects.rofl. Each measure is its own process, each under a minute.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const VSCODE = 'eef761e9628e777317a554114f0202a070e98f0b';
const SUBSET = ['src/vs/base', 'src/vs/platform', 'src/vs/code', 'src/vs/server', 'extensions'];
const RUNS = 3;
const ROOT = new URL('..', import.meta.url).pathname;
const BENCH = path.join(ROOT, 'facts/bench.rofl');
const CACHE = path.join(os.homedir(), '.cache/rofl-bench');
const SRC = path.join(CACHE, `vscode-${VSCODE.slice(0, 12)}`);
const FACTS = path.join(CACHE, `facts-${VSCODE.slice(0, 12)}`);

function run(cmd: string, args: string[], cwd = ROOT): string {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: exit ${r.status}\n${r.stderr.slice(-2000)}`);
  return r.stdout;
}
const node = (script: string, ...args: string[]) =>
  JSON.parse(run('node', ['--experimental-strip-types', `scripts/${script}`, ...args]).trim().split('\n').pop()!);

if (!fs.existsSync(path.join(SRC, '.git'))) {
  fs.mkdirSync(SRC, { recursive: true });
  run('git', ['init', '-q'], SRC);
  run('git', ['remote', 'add', 'origin', 'https://github.com/microsoft/vscode.git'], SRC);
  run('git', ['sparse-checkout', 'set', ...SUBSET], SRC);
  run('git', ['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', VSCODE], SRC);
  run('git', ['checkout', '-q', 'FETCH_HEAD'], SRC);
}
// the facts are the scanner's: made fresh each run, the last chunk (every other file) dropped
fs.rmSync(FACTS, { recursive: true, force: true });
run('node', ['--experimental-strip-types', 'scripts/vscode_corpus.ts', 'corpus', SRC, FACTS, '20', '250']);
for (const f of fs.readdirSync(FACTS)) if (/^facts-\d+\.rofl$/.test(f) && !['facts-20.rofl', 'facts-250.rofl'].includes(f)) fs.rmSync(path.join(FACTS, f));

const MEASURES: [string, () => Record<string, number>][] = [
  ['cone_250', () => { const r = node('vscode_curve.ts', FACTS, '250', 'cone'); return { load_ms: r.loadMs, eval_ms: r.evalMs, peak_mb: r.peakRssMb }; }],
  ['witnessed_250', () => { const r = node('vscode_curve.ts', FACTS, '250', 'witnessed'); return { load_ms: r.loadMs, eval_ms: r.evalMs, peak_mb: r.peakRssMb }; }],
  ['add_20', () => { const r = node('ingest_by_delta.ts', path.join(FACTS, 'facts-20.rofl'), '20'); return { whole_ms: r.whole.ms, file_median_ms: r.fileMedianMs, files_sum_ms: r.fileSumMs }; }],
  ['kept_20', () => { const r = node('stage_by_asks.ts', path.join(FACTS, 'facts-20.rofl'), '20', 'may_be_node', 'kept'); return { open_ms: r.kept.openMs, question_ms: r.upperMs }; }],
];

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const now: [string, number][] = [];
for (const [name, measure] of MEASURES) {
  const runs = Array.from({ length: RUNS }, measure);
  for (const k of Object.keys(runs[0])) now.push([`${name}_${k}`, median(runs.map((r) => r[k]))]);
}

const text = fs.readFileSync(BENCH, 'utf8');
const recorded = [...text.matchAll(/^bench\("([^"]+)", (\w+), (\d+)\)\./gm)];
const last = recorded.filter((m) => m[1] !== version).pop()?.[1];
const before = new Map(recorded.filter((m) => m[1] === last).map((m) => [m[2], Number(m[3])]));
console.log(`${version}${last ? ` against ${last}` : ''}, median of ${RUNS}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB`);
for (const [k, v] of now) {
  const b = before.get(k);
  console.log(`  ${k.padEnd(28)} ${String(v).padStart(7)}${b ? `  ${String(b).padStart(7)}  x${(b / v).toFixed(2)}` : ''}`);
}
if (process.argv.includes('--write')) {
  const date = new Date().toISOString().slice(0, 10);
  fs.appendFileSync(BENCH, `\n-- ${version}, ${date}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB\n` +
    now.map(([k, v]) => `bench("${version}", ${k}, ${v}).`).join('\n') + '\n');
}
