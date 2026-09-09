// scanners/js_seed.ts — BUILD A CONFORMANCE SEED FROM REAL SOURCE.
//
//   node --max-old-space-size=14000 --expose-gc --experimental-strip-types \
//        scanners/js_seed.ts <files> [--out DIR] [--dir SRC] [--space N]
//
// The same recipe scripts/port_corpus.ts uses on the demo corpus, pointed at a
// real tree: load the packs, assert the AST facts, drop the derived layer,
// snapshot. Two products per size — `<n>.seed.json` for a second engine to
// evaluate and `<n>.expected.txt` for it to be judged against.
//
// THE REFERENCE MUST ROUND-TRIP ITS OWN SEED or the case is not a case, and
// this refuses to write one that does not. A world the host cannot reproduce
// from its own snapshot is a defect here, not a target for anyone else.
//
// AND BOTH SIDES OF THAT CHECK RUN UNDER THE SAME WALL, which cost an iteration
// to learn: the direct world was built with `space` raised and the replay with
// a bare `fromSnapshot`, taking the 500 000 default, so the replay stopped
// inside the answer and the difference — 602 701 rows, with `hole` twice in the
// replay's own output — was read as a conformance failure. It was two
// instruments, not two answers.
//
// IT LIVES HERE AND NOT IN /tmp. A reboot on 2026-09-09 emptied /tmp and took
// the corpus and four built seeds with it. An instrument a loop re-runs across
// days belongs in the tree.
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

const BUDGET = 4_000_000_000;

function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function heap(): number {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) { gc(); gc(); gc(); }
  return process.memoryUsage().heapUsed;
}

function main(): void {
  const argv = process.argv.slice(2);
  let out = path.join(os.homedir(), 'rofl-seeds');
  let dir = path.join(os.homedir(), 'eslint-corpus', 'lib');
  let space = 40_000_000;
  let oracle = true;
  const sizes: number[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out = argv[++i]!;
    else if (a === '--dir') dir = argv[++i]!;
    else if (a === '--space') space = Number(argv[++i]);
    // WITHOUT A JUDGE, AND SAYING SO. `canonicalState` returns one string and
    // the reference throws `RangeError: Invalid string length` above about 3M
    // facts — V8's maximum string, which no heap flag moves. So beyond 64 files
    // of eslint/lib a seed can still be BUILT and the port can still be
    // measured on it, and neither can be judged. The flag exists so that the
    // difference is a deliberate argument rather than a silently skipped check,
    // and the seed it writes is named `.unjudged.seed.json` so nothing can
    // mistake one for the other later.
    else if (a === '--no-oracle') oracle = false;
    else if (!a.startsWith('--')) sizes.push(Number(a));
    else { console.error('usage: js_seed.ts <files...> [--out DIR] [--dir SRC] [--space N]'); process.exit(2); }
  }
  if (sizes.length === 0) sizes.push(16);
  fs.mkdirSync(out, { recursive: true });

  const files = sources(dir);
  const packs = ['boot.rofl', ...FACTS, ...RULES].map(read).join('\n');
  console.log(`${files.length} files under ${dir}, space ${space}, load ${os.loadavg()[0].toFixed(2)}`);

  for (const n of sizes) {
    if (n > files.length) { console.log(`  skip ${n}: only ${files.length} files`); continue; }
    const ast = files.slice(0, n)
      .map((f) => scan(read(f), { file: path.relative(dir, f) }).facts.join('\n'))
      .join('\n');

    const direct = new Rofl({ space });
    direct.load(packs, { budget: BUDGET });
    direct.assert(ast);
    const h0 = heap();
    const t0 = Date.now();
    direct.evaluate(BUDGET);
    const ms = Date.now() - t0;
    const mb = (heap() - h0) / 1e6;
    const facts = direct.store.factCount();
    const want = oracle ? direct.store.canonicalState() : null;

    const s = new Rofl({ space });
    s.load(packs, { budget: BUDGET });
    s.assert(ast);
    s.store.clearDerived();
    const seed = s.store.snapshot();

    if (want !== null) {
      // THE SAME WALL ON BOTH SIDES. See the header.
      const replay = Rofl.fromSnapshot(seed, { space });
      replay.evaluate(BUDGET);
      if (replay.store.canonicalState() !== want) {
        console.error(`  ${n}: REFUSED — the reference does not round-trip its own seed`);
        process.exitCode = 1;
        continue;
      }
      fs.writeFileSync(path.join(out, `${n}.expected.txt`), want);
    }
    const name = want === null ? `${n}.unjudged.seed.json` : `${n}.seed.json`;
    fs.writeFileSync(path.join(out, name), seed);
    console.log(`  ${String(n).padStart(4)} files  ${String(facts).padStart(9)} facts  `
      + `${(ms / 1e3).toFixed(2).padStart(7)} s  ${mb.toFixed(0).padStart(6)} MB  `
      + `${(mb * 1e6 / facts).toFixed(1).padStart(6)} B/fact  seed ${(seed.length / 1e6).toFixed(1)} MB`
      + (want === null ? '   UNJUDGED' : ''));
  }
}

main();
