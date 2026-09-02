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

    // AND ON THE DEFAULT PATH THE SAME ABLATION IS INERT, which is the whole
    // of what rounds bought: the schedule is peeled off the decoded rules
    // before a rule fires, so there is no table for b5 to withdraw. Same
    // tripwire, same kernel, same ablation, opposite cell.
    //
    // MEASURED, and it is stronger than "the answer does not move": the
    // counter shows b5 is not REACHED at all. `readStrata` survives on two
    // paths only — the alternating fixpoint, and the `strataPlan()` test
    // accessor — so on a two-valued program under rounds it is dead code
    // rather than an input that happens not to matter. The stock arm above is
    // the positive control for that zero: the same counter, same kernel, same
    // tripwire, fires there.
    const rBase = runConfig(dir, '', 60_000, only, 'rounds').recs[0];
    const rAb = runConfig(dir, 'b5', 60_000, only, 'rounds').recs[0];
    assert.ok(rBase && rAb, 'both round configurations produced a record');
    assert.equal(classify(rBase, rAb).cell, 'A', 'rounds read no table, so nothing moves');
    assert.equal(rBase.facts, rAb.facts);
    assert.ok(((rBase.hits ?? {})['b5'] ?? 0) === 0,
      'b5 is never reached under rounds; the stock arm above proves the counter works');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
