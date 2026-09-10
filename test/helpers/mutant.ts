// test/helpers/mutant.ts — THE MARKER THAT REPLACED A REGEX ON A TEST'S TITLE.
//
// `npm run loop` used to skip the mutant set with
//
//     --test-skip-pattern="^(MUTANT|mutant|[a-z][0-9]+[a-z]?'?[ :]|M[0-9]+)"
//
// and `npm run test:mutants` selected the same set with `--test-name-pattern`.
// MEASURED 2026-09-10 over 1 535 tests: 235 selected, ZERO false positives, and
// TWENTY-EIGHT MISSED — every test that spelled itself `SURVIVOR:`, `SHAPE
// MUTANT 1:`, `CORPUS MUTANT C7`, `ERA: MUTANT 8`, `PROBE (survivor)` or
// `POSITIVE CONTROL: one rule broken on purpose`. For the loop that is an error
// in the safe direction — the tests still ran. For `test:mutants`, the command
// whose whole contract is "run the mutant set", it is an error in the DANGEROUS
// direction: it silently omitted 28 of them, five of which were written the
// same afternoon.
//
// It is the shape CLAUDE.md already names twice — a gate inherits the scope of
// its incident, and a hand-written list goes stale on a refactor — and the
// remedy is not a wider regex. A wider regex is the same defect with a later
// expiry date, because THE CLASSIFICATION IS NOT DERIVABLE FROM THE SPELLING.
// `POSITIVE CONTROL: one rule broken on purpose` plants a defect and
// `POSITIVE CONTROL: a proposition wearing a dummy argument is named` does not,
// and no pattern over those two strings can tell them apart.
//
// So the decision is recorded AT THE CALL SITE by whoever knows what the test
// does, and the runner reads a flag rather than a name:
//
//     mutant('a builtin joins two premises', () => { ... })
//
// WHAT COUNTS AS A MUTANT HERE: a test that PLANTS something — a broken rule, a
// deleted row, a widened whitelist, a forged fact — in order to measure what a
// gate can and cannot see. A `SURVIVOR` is one whose planted defect the gate
// fails to catch, which is the most valuable kind and the one the old regex was
// worst at finding. A control that merely asserts live behaviour on honest
// input is NOT a mutant: it is cheap, it is load-bearing, and the fast loop
// should keep running it.

import { test, type TestContext } from 'node:test';

/** `all` (the default, and what `npm test` runs), or `loop` — the fast
 *  development loop, which is the whole suite minus the planted defects. */
const MODE = process.env.ROFL_TESTS ?? 'all';

/** Node's own test body: written out rather than taken from
 *  `Parameters<typeof test>`, which resolves to the OPTIONS overload and typed
 *  every caller's arrow function as `undefined`. A caller passing `() => {}`
 *  is assignable to this, since fewer parameters always are. */
type MutantFn = (t: TestContext, done: (result?: unknown) => void) => void | Promise<void>;

/** A test that plants a defect to measure a gate's coverage. Identical to
 *  `test()` except that `npm run loop` skips it — by reading this flag, never
 *  by matching the name you give it. */
export function mutant(name: string, fn: MutantFn): void {
  test(name, { skip: MODE === 'loop' ? 'planted defect — npm run loop skips these' : false }, fn);
}
