// parser_optional.ts — IS THE GRAMMAR DROPPABLE AS A FILE, and what is left
// when it goes?
//
// The census (`npm run necessity`) answers a weaker question: which LINES does
// a task enter. It said the dense host enters 8 lines of src/parser.ts and
// that all 8 are declarations executed when the module loads — true, and still
// compatible with the file being impossible to remove, because a build bundles
// what it imports whether or not a body ever runs.
//
// So this asks the question the way a PORT asks it: delete the file and see
// whether the kernel still stands. Two mutants, and they must answer
// DIFFERENTLY — that is the whole measurement, and the second is this gate's
// planted defect, the control that says the first result was not vacuous:
//
//   1. delete src/parser.ts, stub the two text doors in api.ts  -> must COMPILE
//   2. also delete src/tokens.ts                                -> must FAIL,
//      naming src/reflect.ts, because `atom_of` asks the tokenizer what a
//      writable name is and no rule can answer that for itself.
//
// A host that never reads ROFL source therefore ships the lexis and not the
// grammar. Run: npx tsx scripts/parser_optional.ts

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** The text door is the ONE place the kernel names the grammar; a build
 *  without it has a `Rofl` that takes clauses and literals and no text. */
const DOOR = "import { parseProgram, parseLiteral } from './parser.ts';";
const NO_DOOR = `const parseProgram = (_s: string): Clause[] => { throw new Error('no text door'); };
const parseLiteral = (_s: string): Lit => { throw new Error('no text door'); };`;

export interface Mutant { name: string; ok: boolean; out: string; }

/** Type-check a copy of src/ with `drop` removed. */
export function withoutFiles(drop: string[]): Mutant {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-noparse-'));
  try {
    fs.cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true });
    // package.json carries `"type": "module"`, without which tsc reports
    // import.meta in an unrelated file and the run says nothing about parsing.
    for (const f of ['tsconfig.json', 'package.json']) {
      fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    }
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
    const api = path.join(dir, 'src', 'api.ts');
    const src = fs.readFileSync(api, 'utf8');
    if (!src.includes(DOOR)) throw new Error(`src/api.ts no longer opens the text door as:\n${DOOR}`);
    fs.writeFileSync(api, src.replace(DOOR, NO_DOOR));
    for (const f of drop) fs.rmSync(path.join(dir, 'src', f));
    try {
      execFileSync('npx', ['tsc', '-p', 'tsconfig.json'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
      return { name: drop.join(' + '), ok: true, out: '' };
    } catch (e: any) {
      return { name: drop.join(' + '), ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).includes('parser_optional');
if (isMain) {
  const a = withoutFiles(['parser.ts']);
  const b = withoutFiles(['parser.ts', 'tokens.ts']);
  console.log(`without the grammar        : ${a.ok ? 'COMPILES' : 'FAILS'}`);
  if (!a.ok) console.log(a.out.trim().split('\n').slice(0, 5).map((l) => `    ${l}`).join('\n'));
  console.log(`without grammar AND lexis  : ${b.ok ? 'COMPILES' : 'FAILS'}`);
  if (!b.ok) console.log(b.out.trim().split('\n').slice(0, 5).map((l) => `    ${l}`).join('\n'));
  const good = a.ok && !b.ok && b.out.includes('src/reflect.ts');
  console.log();
  console.log(good
    ? 'A host that never reads ROFL source ships src/tokens.ts and drops src/parser.ts.'
    : 'THE MEASUREMENT DID NOT COME OUT AS RECORDED — read the output above.');
  process.exit(good ? 0 : 1);
}
