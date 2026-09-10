// scanners/mutant_files.ts — WHICH TEST FILES CARRY A PLANTED DEFECT.
//
// Prints one path per line so a shell can hand them to `node --test`. Derived
// from the dependency model — a file carries a mutant exactly when it imports
// `test/helpers/mutant.ts` — and never from a list written down here, for the
// reason `scanners/side_files.ts` gives about the same shape: a hand-kept list
// of test files is what this repository has recorded going stale four times.
//
// IT IS EXACT ABOUT FILES AND COARSE ABOUT TESTS, and that is stated rather
// than discovered: running one of these files runs its non-mutant siblings too.
// That is the honest direction — `npm run test:mutants` over-runs and never
// omits — and it is the opposite of the regex it replaced, which omitted 28.
//
// Run: node --experimental-strip-types scanners/mutant_files.ts

import * as path from 'node:path';
import { build } from './layering_report.ts';

const unq = (t: unknown): string => String(t).replace(/^"|"$/g, '');
const HELPER = 'test/helpers/mutant.ts';

export function filesWithMutants(): string[] {
  const r = build();
  return r.query(`edge[dep](F, "${HELPER}", ts_import)`).rows
    .map((x) => unq(x.bindings.F))
    .filter((p) => p.startsWith('test/') && p.endsWith('.test.ts'))
    .sort();
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'mutant_files.ts';
if (isMain) {
  const files = filesWithMutants();
  if (files.length === 0) { console.error('no test file imports ' + HELPER); process.exit(1); }
  console.log(files.join('\n'));
}
