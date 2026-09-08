// scanners/js_cost.ts — WHERE THE JS MODEL'S FIXPOINT SPENDS ITSELF.
//
//   node --experimental-strip-types scanners/js_cost.ts [files]
//
// The curve says the cost is superlinear: over grafema/packages/util, 8 to 64
// files is 7.5x the facts and 23.5x the time, so time grows about as facts to
// the 1.55. That number decides whether L3 and L4 of docs/the-target.md are
// reachable at all, and it says nothing about WHERE the time goes.
//
// This points `scanners/eval_cost.ts`'s wrappers at the JS model instead of at
// a ring 1 parse. The wrappers are THEIRS and not a copy: the quantity they
// recover is the accumulator width at each body position, which is the only
// thing that can explode, and two folds computing it would be two answers.
//
// WHAT THE WORLD IS. boot.rofl plus the seven js fact packs plus the five js
// rule packs, then the AST facts of N real files — built and warmed OUTSIDE the
// measured window, because this file's parent records that measuring the build
// is how a third of a parse once came out as the kernel checking itself.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from './js_ast.ts';
import { measureWith, emitFacts, resetCost } from './eval_cost.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8');

const FACTS = ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
  'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
  'facts/js-controlflow.rofl'];
const RULES = ['rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
  'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl'];

const SUBJECT = '/tmp/eslint-corpus/lib';
const BUDGET = 4_000_000_000;
const SPACE = 20_000_000;

function sources(dir: string, n: number): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) out.push(full);
    }
  };
  walk(dir);
  return out.slice(0, n);
}

function main(): void {
  const n = Number(process.argv[2] ?? 16);
  const files = sources(SUBJECT, n);
  const ast = files
    .map((f) => scan(read(f), { file: path.relative(SUBJECT, f) }).facts.join('\n'))
    .join('\n');

  // WARM: one whole world built and evaluated before the wrappers go on, so
  // that `safetyMemo` and every one-time check are already paid for. The
  // measured run is then a second, identical world — steady state, which is
  // what a front end actually runs in.
  const packs = ['boot.rofl', ...FACTS, ...RULES].map(read).join('\n');
  const warm = new Rofl({ space: SPACE });
  warm.load(packs, { budget: BUDGET });
  warm.assert(ast);
  warm.evaluate(BUDGET);

  resetCost();
  const subject = new Rofl({ space: SPACE });
  subject.load(packs, { budget: BUDGET });
  subject.assert(ast);
  const t0 = Date.now();
  measureWith(() => { subject.evaluate(BUDGET); });
  const ms = Date.now() - t0;

  fs.writeFileSync(path.join(ROOT, 'facts/js-cost.rofl'), emitFacts(`the JS model over ${files.length} files of eslint/lib`));
  console.log(`${files.length} files, ${subject.store.factCount()} facts, ${(ms / 1e3).toFixed(1)} s `
    + `-> facts/js-cost.rofl`);
}

main();
