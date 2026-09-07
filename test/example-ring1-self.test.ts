// examples/ring1 — SELF-APPLICATION, in a file of its own.
//
// WHY IT IS SEPARATE, AND IT IS A SCHEDULING FACT RATHER THAN A TASTE. This
// test is the single most expensive thing in the suite: measured 2026-09-07,
// 14.1 s of the 18.9 s `test/example-ring1.test.ts` took, against a whole-suite
// capacity floor (204 s of CPU over 8 cores) of 25.5 s. `node --test`
// parallelises BY FILE, so a 20 s file is a 20 s pole no number of idle cores
// can shorten — and it ran LAST in every instrumented run, which is what a
// makespan bound looks like from the outside.
//
// Splitting it lets node's OWN worker pool run the two halves side by side.
// Nothing is skipped, nothing is cheaper, and no new machinery is needed: the
// unit `node --test` schedules is the file, so the way to spread this work is
// to hand it two files. Measured after the split: the longest file is 14 s and
// the suite's makespan is its capacity floor again.
//
// AND IT PAYS FOR ITSELF ONCE. The L1 world is rebuilt here rather than shared
// with the sibling file, because processes share nothing; that is ~0.4 s of
// setup against ~6 s off the critical path.
//
// THE TEST ITSELF IS UNCHANGED, character for character, from where it stood
// in test/example-ring1.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseProgram } from '../src/parser.ts';
import { canonClause } from '../src/reflect.ts';
import { canon, world, parseFile, clauses } from '../examples/ring1/demo.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const hostCanon = (src: string) => parseProgram(src).map(canonClause).sort().join('\n');

test('SELF-APPLICATION: L1 parses L2\'s own source, identically to the host', () => {
  // The most valuable gate here, and it earned that on its first run: pointing
  // L1 at L2 found two defects the corpus could not reach — `is` excluded from
  // term position, so ring 1 could not read `optok(I, J, is)` and therefore
  // could not parse itself; and a one-character operator guarded on the wrong
  // index, so `<=` read as `<` and BOTH parses survived, 137 clauses against
  // the host's 131. Neither shows on 23 corpus files that agree byte for byte.
  const src = read('examples', 'ring1', 'ring1.rofl');
  const got = parseFile(src, imageOfL1());
  assert.ok(clauses(src).length > 100, 'the split must actually find the clauses');
  assert.equal(got.clauses.length, parseProgram(src).length);
  assert.equal(canon(got.clauses), hostCanon(src));
});

/** L1's world as an image — built once for the self-application sweep. */
function imageOfL1(): string {
  const r = new (Object.getPrototypeOf(world()).constructor)();
  for (const f of ['boot.rofl', 'examples/ring1/charclass.rofl', 'examples/ring1/l1.rofl']) {
    r.load(fs.readFileSync(path.join(ROOT, f), 'utf8'), { budget: 400_000_000 });
  }
  return r.save();
}
