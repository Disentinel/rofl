// scanners/js_volume.ts — WHAT DOES A REAL TREE ACTUALLY COST?
//
// The number the whole storage line of work rests on and that nobody has ever
// taken. `docs/medium-and-large.md` sizes ROFL Medium from "9.9 facts per line"
// over a 73-file sample and a 1.96-3.85 stored-per-base multiplier from the
// demo corpus, and multiplies them out to 56-110M facts and 15.5-30.4 GB. Both
// inputs are extrapolations, their product is a 2x uncertainty, and the TIME
// half was never estimated at all — the largest world this repository has ever
// evaluated is 11 591 facts.
//
// This walks a real source tree in slices and reports, per slice: files, lines,
// AST facts, the facts the rules then derive, wall time split into scan /
// assert / fixpoint, and heap. Slices rather than one run, because the question
// is not "what does 300 files cost" but "how does the cost GROW" — a fixpoint
// that is quadratic in the tree is a different engineering problem from one
// that is linear, and one point cannot tell them apart.
//
//   node --expose-gc --experimental-strip-types scanners/js_volume.ts <dir> \
//        [--slices 8,16,32,64,128] [--no-rules] [--budget N]
//
// `--no-rules` loads the fact packs and skips rules/, which separates what the
// SCAN costs from what the MODEL costs. Both are wanted: the first is Medium's
// storage question, the second is whether Medium can run at all.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Rofl } from '../src/api.ts';
import { scan } from './js_ast.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8');

const FACTS = ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
  'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
  'facts/js-controlflow.rofl'];
const RULES = ['rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
  'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl'];

const EXTS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts']);
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', 'test', 'tests', '__tests__']);

function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(full); }
      else if (EXTS.has(path.extname(e.name)) && !e.name.endsWith('.d.ts')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** Heap after three collections, the instrument bench/mem_census.ts uses. */
function heap(): number {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) { gc(); gc(); gc(); }
  return process.memoryUsage().heapUsed;
}

function main(): void {
  const argv = process.argv.slice(2);
  let dir: string | null = null;
  let slices = [8, 16, 32, 64, 128, 256];
  let withRules = true;
  let budget = 4_000_000_000;
  let space = 20_000_000;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--slices') slices = (argv[++i] ?? '').split(',').map(Number);
    else if (a === '--no-rules') withRules = false;
    else if (a === '--budget') budget = Number(argv[++i]);
    else if (a === '--space') space = Number(argv[++i]);
    else if (!a.startsWith('--') && dir === null) dir = a;
    else { console.error('usage: js_volume.ts <dir> [--slices a,b,c] [--no-rules] [--budget N]'); process.exit(2); }
  }
  if (!dir) { console.error('usage: js_volume.ts <dir> [--slices a,b,c] [--no-rules] [--budget N]'); process.exit(2); }

  const files = sources(path.resolve(dir));
  // A MEASUREMENT MUST CERTIFY ITS OWN CONDITIONS (CLAUDE.md). The first
  // version of this curve was taken with fifteen stray node processes alive and
  // a load average of 36, which is not a condition any timing survives.
  const load = () => Number(os.loadavg()[0].toFixed(2));
  const loadStart = load();
  console.log(`${files.length} source files under ${dir}, rules ${withRules ? 'ON' : 'OFF'}, `
    + `space ${space}, load at start ${loadStart}\n`);
  console.log(
    `${'files'.padStart(6)}${'lines'.padStart(9)}${'ast facts'.padStart(11)}${'derived'.padStart(10)}` +
    `${'f/line'.padStart(8)}${'mult'.padStart(7)}${'scan s'.padStart(9)}${'assert s'.padStart(10)}` +
    `${'fixpoint s'.padStart(12)}${'MB'.padStart(8)}${'B/fact'.padStart(9)}`,
  );

  for (const k of slices) {
    if (k > files.length) break;
    const take = files.slice(0, k);
    const lines = take.reduce((s, f) => s + read(f).split('\n').length, 0);

    const t0 = Date.now();
    const scanned: string[] = [];
    let astFacts = 0;
    let failed = 0;
    for (const f of take) {
      try {
        const got = scan(read(f), { file: path.relative(path.resolve(dir), f) });
        astFacts += got.facts.length;
        scanned.push(got.facts.join('\n'));
      } catch { failed++; }
    }
    const scanS = (Date.now() - t0) / 1e3;

    const h0 = heap();
    const r = new Rofl({ space });
    const packs = ['boot.rofl', ...FACTS, ...(withRules ? RULES : [])].map(read);
    if (!r.load(packs.join('\n')).ok) { console.error('packs REJECTED'); process.exit(1); }

    const t1 = Date.now();
    for (const text of scanned) r.assert(text);
    const assertS = (Date.now() - t1) / 1e3;

    const t2 = Date.now();
    const res = r.evaluate(budget);
    const fixS = (Date.now() - t2) / 1e3;

    const total = r.store.factCount();
    const mb = (heap() - h0) / 1e6;
    const derived = Math.max(0, total - astFacts);
    console.log(
      `${String(k).padStart(6)}${String(lines).padStart(9)}${String(astFacts).padStart(11)}` +
      `${String(derived).padStart(10)}${(astFacts / lines).toFixed(2).padStart(8)}` +
      `${(total / Math.max(1, astFacts)).toFixed(2).padStart(7)}${scanS.toFixed(2).padStart(9)}` +
      `${assertS.toFixed(2).padStart(10)}${fixS.toFixed(2).padStart(12)}${mb.toFixed(0).padStart(8)}` +
      `${(mb * 1e6 / Math.max(1, total)).toFixed(0).padStart(9)}` +
      (res.partial ? '  PARTIAL' : '') + (failed ? `  ${failed} unparsed` : ''),
    );
  }
  console.log(`\nload at end ${load()} (started ${loadStart}) — a curve taken while the`
    + ` machine changed under it is not a curve`);
}

main();
