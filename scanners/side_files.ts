// scanners/side_files.ts — WHICH TEST FILES BELONG TO WHICH SIDE.
//
// Prints one path per line so a shell can hand them to `node --test`. The list
// is DERIVED from `rules/layering.rofl`, never written down: a hand-kept list
// of test files is the shape this repository has recorded going stale four
// times, and the whole point of the boundary model is that a second library
// costs four facts and no edits anywhere else.
//
// Run: node --experimental-strip-types scanners/side_files.ts engine
//      node --experimental-strip-types scanners/side_files.ts library

import * as path from 'node:path';
import { build } from './layering_report.ts';

const unq = (t: unknown): string => String(t).replace(/^"|"$/g, '');

export function testFilesOn(side: string): string[] {
  const r = build();
  const all = r.query('artifact[dep](P, ts)').rows.map((x) => unq(x.bindings.P))
    .filter((p) => p.startsWith('test/') && p.endsWith('.test.ts'));
  const lib = new Set(r.query('side(P, library)').rows.map((x) => unq(x.bindings.P)));
  // A test file is on the LIBRARY side when the boundary model says so, and on
  // the ENGINE side otherwise. `harness` collapses into engine here on purpose:
  // a gate about the ledger, the docs or the kernel's own vocabulary is part of
  // what an engine developer must not break, and it is cheap.
  return (side === 'library' ? all.filter((p) => lib.has(p)) : all.filter((p) => !lib.has(p))).sort();
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'side_files.ts';
if (isMain) {
  const side = process.argv[2] ?? 'engine';
  const files = testFilesOn(side);
  if (files.length === 0) { console.error(`no test files on side '${side}'`); process.exit(1); }
  console.log(files.join('\n'));
}
