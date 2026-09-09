// scanners/volume_locality.ts — IS A FILE A SUFFICIENT VOLUME?
//
//   node --experimental-strip-types scanners/volume_locality.ts [--corpus DIR]
//        [--files N] [--drop REL]
//
// The owner touches ten services out of seven hundred. That is only workable if
// the facts about one file can be CONCLUDED from that file alone — otherwise
// lifting one volume drags in the rest and there is nothing cold about it.
//
// This decides it by EXECUTION rather than by argument: build the world from
// every file, then build one world per file in isolation, and compare the facts
// each file concludes about ITSELF. Equal sets mean the volume is sufficient.
//
// IT COMPARES IN BOTH DIRECTIONS, and the second one is the reason the check
// exists. Missing facts mean the volume was too small — the obvious failure.
// INVENTED facts mean a negation fired because data that lives elsewhere was
// absent, and that is what partitioning a non-monotonic language actually risks:
// the program does not fall silent, it manufactures confident wrong answers.
// Measured with a planted defect on 8 real files of eslint/lib: withholding one
// relation lost 61 475 facts AND invented 622, and the invented ones were
// `unresolved_call`, `frontier_at(_, s_unclassified)` and `shape` — the model
// declaring that it could not resolve calls it resolves perfectly well when the
// data is there.
//
// MEASURED ON REAL SOURCE, 2026-09-09: all 64 files of eslint/lib are identical
// alone, 0 missing and 0 invented, while the planted defect turned 8 of 8 red.
// The always-hot remainder — facts naming no file at all — is 1.0 per cent of a
// 64-file world and grows sublinearly: the data grew 3.48x from 16 files to 64
// and it grew 1.31x, because it is the program and its reflection rather than
// the subject.
//
// AND IT HOLDS ONLY WHILE NOTHING RESOLVES ACROSS MODULES. Every one of the 193
// `resolves` facts in that world joins a call to a function in the SAME file.
// The fixture `test/fixtures/js-volume/gamma.js` requires `alpha.js` on purpose:
// when cross-module resolution lands, this is the first place the gate should go
// red, and that is a feature. The edge is then known by name and can be served
// by a materialised export surface instead of by keeping everything resident.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { Rofl } from '../src/api.ts';
import { scan } from './js_ast.ts';

const REPO = fs.realpathSync(new URL('..', import.meta.url).pathname);
const read = (p: string): string => fs.readFileSync(path.join(REPO, p), 'utf8');

/** Every pack of this tree that exists, in load order. */
export function packs(): string {
  const named = ['boot.rofl',
    'facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl', 'facts/js-modules.rofl',
    'facts/js-shapes.rofl', 'facts/js-statements.rofl', 'facts/js-controlflow.rofl',
    'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
    'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl'];
  return named.filter((p) => fs.existsSync(path.join(REPO, p))).map(read).join('\n');
}

const PREF = /\bn([0-9a-f]{8})_\d+/g;
const BUDGET = 4_000_000_000;

/** Facts naming exactly one file, grouped by that file's id prefix. */
function ownFacts(state: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of state.split('\n')) {
    if (line.startsWith('wit ') || line.startsWith('tick ') || line === '') continue;
    const set = new Set<string>();
    for (const m of line.matchAll(PREF)) set.add(m[1]!);
    if (set.size !== 1) continue;
    const p = [...set][0]!;
    if (!out.has(p)) out.set(p, []);
    out.get(p)!.push(line);
  }
  return out;
}
const digest = (xs: string[]): string => createHash('md5').update([...xs].sort().join('\n')).digest('hex');

export interface Verdict {
  file: string; prefix: string;
  together: number; alone: number;
  missing: number; invented: number;
  /** relations the isolated world INVENTED, which is the dangerous direction */
  inventedRels: Map<string, number>;
}

/** One world per file against one world of all of them. `drop` withholds a base
 *  relation from the isolated builds — the planted defect that proves the
 *  comparison can see a difference at all.
 *
 *  THE CORE IS BUILT ONCE AND FORKED. Rebuilding it per volume was measured at
 *  383 ms against 3 ms to fork, a hundred and twenty-eight times, and it is
 *  what made 64 volumes cost 5.87x one world of 64 files: the volumes together
 *  held 1.26 MILLION more facts than the single world, which is sixty-four
 *  copies of the same vocabulary, rules-as-data and reflection.
 *
 *  A fork must not change an answer, and that is asserted rather than assumed:
 *  `forkIsFree` re-runs a volume the slow way and compares. If forking ever
 *  moves a fact this is a kernel defect and matters more than the speed. */
export function compare(corpus: string, files: string[], drop = '', space = 40_000_000): Verdict[] {
  const P = packs();
  const all = new Rofl({ space });
  all.load(P, { budget: BUDGET });
  const label = (f: string): string => (f.endsWith('.txt') ? f.slice(0, -4) : f);
  for (const f of files) all.assert(scan(fs.readFileSync(path.join(corpus, f), 'utf8'), { file: label(f) }).facts.join('\n'));
  all.evaluate(BUDGET);
  const together = ownFacts(all.store.canonicalState());

  // The core, once. Everything below forks it instead of parsing and deriving
  // the same 20 630 facts again per volume.
  const core = new Rofl({ space });
  core.load(P, { budget: BUDGET });
  core.evaluate(BUDGET);

  const out: Verdict[] = [];
  for (const f of files) {
    let ast = scan(fs.readFileSync(path.join(corpus, f), 'utf8'), { file: label(f) }).facts;
    if (drop) ast = ast.filter((l) => !l.startsWith(`${drop}[`));
    const one = core.fork();
    one.assert(ast.join('\n'));
    one.evaluate(BUDGET);
    const mine = ownFacts(one.store.canonicalState());
    // this file's prefix is the one its OWN facts carry; with a relation
    // withheld the file may conclude nothing, and then there is no prefix
    let prefix = '';
    let best = -1;
    for (const [p, xs] of mine) if (xs.length > best) { best = xs.length; prefix = p; }
    const a = new Set(mine.get(prefix) ?? []);
    const t = new Set(together.get(prefix) ?? []);
    const invented = [...a].filter((x) => !t.has(x));
    const rels = new Map<string, number>();
    for (const x of invented) {
      const r = x.split('[', 1)[0]!;
      rels.set(r, (rels.get(r) ?? 0) + 1);
    }
    out.push({ file: f, prefix, together: t.size, alone: a.size,
               missing: [...t].filter((x) => !a.has(x)).length, invented: invented.length, inventedRels: rels });
  }
  return out;
}

/** Is a forked core the same world as a rebuilt one? Answers for ONE volume,
 *  which is enough: if the fork loses or invents a single fact the property is
 *  false and the speed is irrelevant. Returns the two fact counts and the size
 *  of their symmetric difference. */
export function forkIsFree(corpus: string, file: string, space = 40_000_000):
    { forked: number; rebuilt: number; differ: number } {
  const P = packs();
  const label = file.endsWith('.txt') ? file.slice(0, -4) : file;
  const ast = scan(fs.readFileSync(path.join(corpus, file), 'utf8'), { file: label }).facts.join('\n');

  const core = new Rofl({ space });
  core.load(P, { budget: BUDGET });
  core.evaluate(BUDGET);
  const f1 = core.fork();
  f1.assert(ast);
  f1.evaluate(BUDGET);

  const f2 = new Rofl({ space });
  f2.load(P, { budget: BUDGET });
  f2.assert(ast);
  f2.evaluate(BUDGET);

  const A = new Set(f1.store.canonicalState().split('\n'));
  const B = new Set(f2.store.canonicalState().split('\n'));
  let differ = 0;
  for (const x of A) if (!B.has(x)) differ++;
  for (const x of B) if (!A.has(x)) differ++;
  return { forked: A.size, rebuilt: B.size, differ };
}

function jsUnder(dir: string, limit: number): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      // Fixtures in this repository are stored as `<name>.js.txt` so that no
      // tool mistakes them for source of this project; a real corpus is plain
      // `.js`. Both are volumes and the label drops the guard suffix.
      else if (e.name.endsWith('.js') || e.name.endsWith('.js.txt')) out.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return out.slice(0, limit);
}

function main(): void {
  const argv = process.argv.slice(2);
  let corpus = path.join(REPO, 'test/fixtures/js-volume');
  let limit = 64, drop = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--corpus') corpus = argv[++i]!;
    else if (argv[i] === '--files') limit = Number(argv[++i]);
    else if (argv[i] === '--drop') drop = argv[++i]!;
    else { console.error('usage: volume_locality.ts [--corpus DIR] [--files N] [--drop REL]'); process.exit(2); }
  }
  const files = jsUnder(corpus, limit);
  if (!files.length) { console.error(`no .js under ${corpus}`); process.exit(2); }
  const vs = compare(corpus, files, drop);
  const bad = vs.filter((v) => v.missing || v.invented);
  console.log(`${files.length} volumes under ${corpus}${drop ? `, WITH ${drop} WITHHELD` : ''}\n`);
  console.log(`${'together'.padStart(9)}${'alone'.padStart(9)}${'missing'.padStart(9)}${'invented'.padStart(10)}  file`);
  for (const v of vs) {
    if (!drop && !v.missing && !v.invented && vs.length > 12) continue;   // only the interesting ones on a big run
    console.log(`${String(v.together).padStart(9)}${String(v.alone).padStart(9)}`
      + `${String(v.missing).padStart(9)}${String(v.invented).padStart(10)}  ${v.file}`);
  }
  console.log(`\n${vs.length - bad.length} of ${vs.length} volumes are SELF-SUFFICIENT`);
  if (bad.length) {
    const rels = new Map<string, number>();
    for (const v of bad) for (const [r, n] of v.inventedRels) rels.set(r, (rels.get(r) ?? 0) + n);
    if (rels.size) {
      console.log('\ninvented by an isolated volume — a negation with nothing to stop it:');
      for (const [r, n] of [...rels].sort((x, y) => y[1] - x[1]).slice(0, 8)) console.log(`  ${r.padEnd(24)}${n}`);
    }
  }
}

if (import.meta.filename === process.argv[1]) main();
