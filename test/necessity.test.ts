// necessity.test.ts — the instrument that answers "how big is this kernel",
// and the only assertions it makes are ones that survive the kernel moving.
//
// `scanners/engine_split.ts` asks whether a LINE is a decision or a mechanism,
// and every one of its answers is a hand judgement pinned as a literal: this
// session spent a measurable share of every iteration updating ~28 of them.
// This asks a different question — WHICH LINES DOES THE LANGUAGE ACTUALLY RUN
// — by running eight programs under V8's own coverage. There is nothing to
// update when the kernel moves, because nothing here is typed from reading it.
//
// So the assertions below are deliberately coarse. A number pinned here would
// reintroduce exactly the maintenance the instrument exists to avoid.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TASKS, coveredLines, codeLines } from '../scanners/necessity.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TASKS_DIR = path.join(ROOT, 'scanners', 'tasks');
// Enumerated rather than listed, for the reason given in the scanner: a
// hand-written list freezes the census at the day it was written, and it had
// already missed two files that shipped after it.
const FILES = fs.readdirSync(path.join(ROOT, 'src'))
  .filter((f) => f.endsWith('.ts')).map((f) => `src/${f}`).sort();

test('every task runs, and each one reaches the kernel', () => {
  assert.ok(TASKS.length >= 8, `${TASKS.length} tasks — the set has shrunk`);
  for (const t of TASKS) {
    const cov = coveredLines(path.join(TASKS_DIR, t));
    const engine = cov.get('src/engine.ts') ?? new Set();
    // a task that does not enter the evaluator is measuring nothing
    assert.ok(engine.size > 100, `${t} reaches only ${engine.size} lines of the evaluator`);
  }
});

test('the minimal task is most of the kernel, and that is the finding', () => {
  // THE SHAPE OF THE ANSWER, not the number. Loading a program, evaluating it
  // and asking one question reaches the majority of src/ — so "the minimal
  // kernel" is not a small corner of this code, and the runtime cannot be made
  // smaller by deleting what the simple case does not use. Pinned as a
  // fraction because the exact line count moves with every comment.
  const cov = coveredLines(path.join(TASKS_DIR, TASKS[0]));
  let code = 0; let reached = 0;
  for (const f of FILES) {
    const c = codeLines(f);
    const r = cov.get(f) ?? new Set<number>();
    code += c.size;
    reached += [...c].filter((l) => r.has(l)).length;
  }
  assert.ok(reached / code > 0.5, `the minimal task reaches ${(100 * reached / code).toFixed(0)}% of src/`);
  assert.ok(reached / code < 0.9, `it reaches ${(100 * reached / code).toFixed(0)}% — the task set has stopped discriminating`);
});
