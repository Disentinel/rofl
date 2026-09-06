// ablate.test.ts — the removal probe's apparatus, checked without paying for
// the corpus. The full matrix (`node --experimental-strip-types
// scanners/ablate.ts`, ~60 s) is a tool; what has to hold for its numbers to
// mean anything is here, and runs in about a second.
//
// Three things are worth a test and one of them is the finding itself:
//   1. the SWITCH: every anchor occurs exactly once before it is replaced, and
//      the unpatched kernel carries none of the hooks;
//   2. the THREE CELLS, including "did not finish" — the cell I would
//      otherwise have read as "nothing changed";
//   3. an END-TO-END control: one ablation, one program, a real difference.
//      Without it the first two only prove the plumbing is tidy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  HOOKS, patchSource, buildKernel, runConfig, classify, TRIPWIRES, corpus, type Rec,
} from '../scanners/ablate.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'engine.ts'), 'utf8');

test('the switch: every anchor occurs exactly once, and the kernel carries none', () => {
  const { text, counts } = patchSource(SRC);
  for (const h of HOOKS) {
    assert.equal(counts[h.id], 1, `${h.id} anchored ${counts[h.id]} times, not once`);
    assert.ok(text.includes(h.replace), `${h.id} did not land`);
  }
  // src/ is read-only to this probe, and must stay innocent of it
  assert.equal(/\bABLATE\b/.test(SRC), false, 'src/engine.ts carries an ablation hook');
  assert.equal(SRC.includes('HIT('), false, 'src/engine.ts carries a hit counter');
  assert.equal(HOOKS.length, 8, 'six blocks, one of them in two halves, plus the preamble');
});

test('an anchor that is not unique throws instead of patching a comment', () => {
  // THE FAILURE THIS EXISTS FOR: `String.replace` with a string argument
  // rewrites the FIRST occurrence. An anchor that also appears in a comment
  // patches the comment, leaves the kernel intact, and the whole matrix comes
  // back byte-identical — indistinguishable from "the block does not matter".
  const doubled = SRC.replace('const MAX_DEPTH = 512;',
    '// const MAX_DEPTH = 512;\nconst MAX_DEPTH = 512;');
  assert.throws(() => patchSource(doubled), /anchor does not occur exactly once/);
  const missing = SRC.replace('  readStrata(): Map<string, number> {', '  readStrataX(): Map<string, number> {');
  assert.throws(() => patchSource(missing), /b5=0/);
});

test('the three cells, and "did not finish" is C rather than A', () => {
  const base: Rec = { name: 'p', ablate: '', facts: 10, factsHash: 'f', stateHash: 's', diagCount: 0, diagText: '' };
  const same = { ...base, ablate: 'b1' };
  assert.equal(classify(base, same).cell, 'A');

  // only the diagnostics moved
  assert.equal(classify(base, { ...same, diagCount: 1, diagText: 'a note' }).cell, 'B');
  // the facts moved, and nothing was refused on either side
  assert.equal(classify(base, { ...same, facts: 12, factsHash: 'g', stateHash: 't' }).cell, 'C');
  // a program the baseline refused, that the ablation ran: the refusal moved
  const refused: Rec = { ...base, diagCount: 1, diagText: 'program rejected: unstratified' };
  assert.equal(classify(refused, { ...same, facts: 99, factsHash: 'z', stateHash: 'z' }).cell, 'B');
  // THE CELL THAT IS EASY TO LOSE: a configuration killed by the clock
  const dead = classify(base, undefined);
  assert.equal(dead.cell, 'C');
  assert.match(dead.why, /DID NOT FINISH/);
});

test('the corpus and the tripwires are both non-empty, and the tripwires are needed', () => {
  const c = corpus();
  assert.ok(c.length >= 25, `${c.length} corpus programs`);
  assert.ok(c.every((p) => p.files.length > 0));
  assert.equal(TRIPWIRES.length, 7);
  // every tripwire names the block it exists for, and no two share a name
  assert.equal(new Set(TRIPWIRES.map((t) => t.name)).size, TRIPWIRES.length);
});

test('END-TO-END: ablating the stratum table changes what one program derives', () => {
  const { dir } = buildKernel();
  try {
    const only = 'tw_two_negation_levels';
    // ON THE STOCK PATH, where the stratum table IS the schedule. This is the
    // original measurement and it is unchanged: withdraw the MAX over
    // `stratum/2` and the same program on the same kernel derives a different
    // answer, with no diagnostic to say so.
    const base = runConfig(dir, '', 60_000, only, 'strata').recs[0];
    const ab = runConfig(dir, 'b5', 60_000, only, 'strata').recs[0];
    assert.ok(base && ab, 'both configurations produced a record');
    // the switch really switches: same program, same kernel, different answer
    assert.equal(classify(base, ab).cell, 'C');
    assert.notEqual(base.facts, ab.facts);
    assert.equal(base.diagCount, ab.diagCount,
      'and it is SILENT: no diagnostic marks the difference');
    // ...and the reachability counter says the block had something to decide
    assert.ok((base.hits ?? {})['b5'] >= 1, 'b5 never fired, so the ablation proves nothing');

    // AND ON THE DEFAULT PATH THE SAME ABLATION DOES NOT MOVE THIS PROGRAM.
    // The outer schedule is peeled off the decoded rules before a rule fires,
    // so the table is not what orders the program's own negation phases.
    //
    // WHAT CHANGED ON 2026-09-06, and it is worth more than the assertion it
    // replaces. This used to read `b5 is never REACHED at all` — `readStrata`
    // was dead code on a two-valued program under rounds. It is not dead any
    // more, and not because anything about rounds changed: the kernel now
    // evaluates its OWN program in a store of its own, that inner evaluation
    // is the strata one, and safety.rofl declares its own `stratum` table for
    // it to read. So the table is live on every path now — it schedules the
    // kernel's questions rather than the program's answers.
    //
    // The cell is still A, and that is a claim about THIS TRIPWIRE and not
    // about the table's importance: measured over the corpus the same day,
    // withdrawing the kernel program's schedule moved `mono_rule` on 3 of 65
    // programs. This one does not expose it.
    const rBase = runConfig(dir, '', 60_000, only, 'rounds').recs[0];
    const rAb = runConfig(dir, 'b5', 60_000, only, 'rounds').recs[0];
    assert.ok(rBase && rAb, 'both round configurations produced a record');
    assert.equal(classify(rBase, rAb).cell, 'A', 'this program does not move');
    assert.equal(rBase.facts, rAb.facts);
    assert.ok(((rBase.hits ?? {})['b5'] ?? 0) >= 1,
      'b5 is reached under rounds now — the kernel reads a table for its own program');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
