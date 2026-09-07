// scanners/necessity.ts — WHAT MUST A REIMPLEMENTER WRITE?
//
// `scanners/engine_split.ts` asks whether a line of the evaluator is a decision
// or a mechanism. That is the right question for "what could become rules" and
// the wrong one for "how big is this kernel": a mechanism you never run is not
// small, it is absent, and a decision you always run is not overhead.
//
// This asks the size question, and it asks it by RUNNING rather than by
// reading. A task is a program that uses the language for something; V8's own
// coverage says which functions of src/ that task entered. A function no task
// enters is not part of the kernel those tasks need. Nothing here is a
// judgement about what is essential -- the tasks are the definition, they are
// listed below, and adding one changes the answer.
//
// Node's --experimental-strip-types replaces types with whitespace, so byte
// offsets in the coverage report are offsets in the ORIGINAL file. That is why
// this can report source lines without a source map.
//
//   node --experimental-strip-types scanners/necessity.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TASKS_DIR = path.join(ROOT, 'scanners', 'tasks');

export interface Fn { file: string; name: string; from: number; to: number; hit: boolean; }

interface V8Range { startOffset: number; endOffset: number; count: number; }
interface V8Fn { functionName: string; ranges: V8Range[]; isBlockCoverage: boolean; }
interface V8Script { url: string; functions: V8Fn[]; }

const lineOf = (src: string, off: number) => src.slice(0, off).split('\n').length;

/** Run one task under V8 coverage and return, per src file, the functions it
 *  entered. A function is ENTERED when its own outermost range has count > 0. */
export function coverTask(taskFile: string): Map<string, Set<string>> {
  const dir = fs.mkdtempSync(path.join('/tmp', 'rofl-cov-'));
  try {
    execFileSync(process.execPath, ['--experimental-strip-types', taskFile],
      { env: { ...process.env, NODE_V8_COVERAGE: dir }, stdio: 'ignore' });
    const out = new Map<string, Set<string>>();
    for (const f of fs.readdirSync(dir)) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { result: V8Script[] };
      for (const s of data.result) {
        if (!s.url.startsWith('file://')) continue;
        const p = decodeURIComponent(s.url.slice('file://'.length));
        if (!p.startsWith(path.join(ROOT, 'src') + path.sep)) continue;
        const rel = path.relative(ROOT, p);
        let set = out.get(rel);
        if (!set) { set = new Set(); out.set(rel, set); }
        for (const fn of s.functions) {
          if (fn.ranges.length === 0) continue;
          const own = fn.ranges[0];
          if (own.count > 0) set.add(`${own.startOffset}:${fn.functionName}`);
        }
      }
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Every function V8 knows about in src/, hit or not, from one run's report. */
export function allFunctions(taskFile: string): Fn[] {
  const dir = fs.mkdtempSync(path.join('/tmp', 'rofl-cov-'));
  try {
    execFileSync(process.execPath, ['--experimental-strip-types', taskFile],
      { env: { ...process.env, NODE_V8_COVERAGE: dir }, stdio: 'ignore' });
    const out: Fn[] = [];
    for (const f of fs.readdirSync(dir)) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { result: V8Script[] };
      for (const s of data.result) {
        if (!s.url.startsWith('file://')) continue;
        const p = decodeURIComponent(s.url.slice('file://'.length));
        if (!p.startsWith(path.join(ROOT, 'src') + path.sep)) continue;
        const src = fs.readFileSync(p, 'utf8');
        const rel = path.relative(ROOT, p);
        for (const fn of s.functions) {
          if (fn.ranges.length === 0) continue;
          const own = fn.ranges[0];
          out.push({
            file: rel, name: `${own.startOffset}:${fn.functionName}`,
            from: lineOf(src, own.startOffset), to: lineOf(src, own.endOffset),
            hit: own.count > 0,
          });
        }
      }
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}


/** THE COVERED LINE SET. V8 reports a function's whole span as one range and
 *  then SUBTRACTS the blocks inside it that never ran, so a line is covered
 *  when some range of count > 0 touches it and no tighter range of count 0
 *  does. Ranges are sorted widest-first, which is the order they nest in. */
export function coveredLines(taskFile: string): Map<string, Set<number>> {
  const dir = fs.mkdtempSync(path.join('/tmp', 'rofl-cov-'));
  try {
    execFileSync(process.execPath, ['--experimental-strip-types', taskFile],
      { env: { ...process.env, NODE_V8_COVERAGE: dir }, stdio: 'ignore' });
    const out = new Map<string, Set<number>>();
    for (const f of fs.readdirSync(dir)) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { result: V8Script[] };
      for (const s of data.result) {
        if (!s.url.startsWith('file://')) continue;
        const p = decodeURIComponent(s.url.slice('file://'.length));
        if (!p.startsWith(path.join(ROOT, 'src') + path.sep)) continue;
        const src = fs.readFileSync(p, 'utf8');
        const rel = path.relative(ROOT, p);
        // per byte: covered or not, resolved widest-range-first
        const flags = new Uint8Array(src.length);
        const ranges: V8Range[] = [];
        for (const fn of s.functions) for (const r of fn.ranges) ranges.push(r);
        ranges.sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset));
        for (const r of ranges) {
          const v = r.count > 0 ? 1 : 0;
          for (let i = r.startOffset; i < r.endOffset && i < flags.length; i++) flags[i] = v;
        }
        let set = out.get(rel);
        if (!set) { set = new Set(); out.set(rel, set); }
        let line = 1;
        for (let i = 0; i < src.length; i++) {
          if (src[i] === '\n') { line++; continue; }
          if (flags[i] && !/\s/.test(src[i])) set.add(line);
        }
      }
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Code lines of a file, comments and blanks stripped, the same counter the
 *  rest of this repository's censuses use. */
export function codeLines(file: string): Set<number> {
  const out = new Set<number>();
  let blk = false;
  fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((raw, i) => {
    const l = raw.trim();
    if (blk) { if (l.includes('*/')) blk = false; return; }
    if (l.startsWith('/*')) { if (!l.includes('*/')) blk = true; return; }
    if (l === '' || l.startsWith('//') || l.startsWith('*')) return;
    out.add(i + 1);
  });
  return out;
}

export const TASKS = fs.existsSync(TASKS_DIR)
  ? fs.readdirSync(TASKS_DIR).filter((f) => /^t\d+-/.test(f)).sort()
  : [];

const isMain = process.argv[1] && path.resolve(process.argv[1]).includes('necessity');
if (isMain) {
  const files = ['src/api.ts', 'src/engine.ts', 'src/parser.ts', 'src/reflect.ts',
    'src/rounds.ts', 'src/store.ts', 'src/unify.ts', 'src/semiring.ts', 'src/repl.ts'];
  const code = new Map(files.map((f) => [f, codeLines(f)]));
  const cov = new Map<string, Map<string, Set<number>>>();
  for (const t of TASKS) cov.set(t, coveredLines(path.join(TASKS_DIR, t)));

  const hit = (t: string, f: string) => {
    const c = cov.get(t)!.get(f) ?? new Set<number>();
    return [...code.get(f)!].filter((l) => c.has(l)).length;
  };
  const union = (ts: string[], f: string) => {
    const u = new Set<number>();
    for (const t of ts) for (const l of cov.get(t)!.get(f) ?? []) u.add(l);
    return [...code.get(f)!].filter((l) => u.has(l)).length;
  };
  const T = TASKS.map((t) => t.replace(/^t\d+-|\.ts$/g, ''));
  console.log('CODE LINES OF src/ REACHED, by task. `all` is their union.');
  console.log();
  console.log(`${'file'.padEnd(15)} ${'code'.padStart(5)} ${T.map((t) => t.slice(0, 8).padStart(9)).join('')} ${'all'.padStart(6)} ${'never'.padStart(6)}`);
  let tc = 0; let ta = 0; const per = TASKS.map(() => 0);
  for (const f of files) {
    const c = code.get(f)!.size;
    const cols = TASKS.map((t, i) => { const n = hit(t, f); per[i] += n; return String(n).padStart(9); }).join('');
    const a = union(TASKS, f);
    tc += c; ta += a;
    console.log(`${f.padEnd(15)} ${String(c).padStart(5)} ${cols} ${String(a).padStart(6)} ${String(c - a).padStart(6)}`);
  }
  console.log(`${'TOTAL'.padEnd(15)} ${String(tc).padStart(5)} ${per.map((n) => String(n).padStart(9)).join('')} ${String(ta).padStart(6)} ${String(tc - ta).padStart(6)}`);
  console.log();
  const t1 = TASKS[0];
  console.log(`THE MINIMAL TASK, ${t1.replace(/\.ts$/, '')} — load a program, evaluate it, ask it a question —`);
  console.log(`reaches ${per[0]} of ${tc} code lines: ${(100 * per[0] / tc).toFixed(0)}% of src/.`);
  console.log(`Everything the other ${TASKS.length - 1} tasks add on top of it: ${ta - per[0]} lines.`);
  console.log(`Reached by nothing: ${tc - ta} lines.`);
  console.log();
  console.log('WHAT EACH TASK ADDS THAT NO EARLIER TASK REACHED:');
  for (let i = 1; i < TASKS.length; i++) {
    let add = 0;
    for (const f of files) add += union(TASKS.slice(0, i + 1), f) - union(TASKS.slice(0, i), f);
    console.log(`  ${TASKS[i].replace(/\.ts$/, '').padEnd(16)} +${add}`);
  }
}
