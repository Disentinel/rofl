// TASK 9 — THE HOST WITHOUT A PARSER. The store arrives already compiled, from
// a file this process did not produce, and the questions arrive as LITERALS
// rather than as text. Nothing of the language's surface syntax is read here.
//
// What this task enters of src/parser.ts is what a host with no parser would
// still have to carry. It was 201 lines of 262 when a question could only be
// text, and 102 once the kernel stopped parsing its own programs; the rest of
// it was the question.
//
// The fixture is built by a SEPARATE process. Building it here is what the
// first version did, and it reported that a parser-less host needs every line
// of the parser -- a measurement of the task, not of the kernel.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../../src/api.ts';
import { denseLit } from '../../src/dense.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const SNAP = path.join(process.env.TMPDIR ?? '/tmp', 'rofl-compiled-fixture.json');
if (!fs.existsSync(SNAP)) {
  execFileSync(process.execPath, ['--experimental-strip-types',
    path.join(ROOT, 'scanners', 'tasks', 'compile-fixture.ts'), SNAP], { stdio: 'ignore' });
}
const r = Rofl.fromSnapshot(fs.readFileSync(SNAP, 'utf8'));
r.evaluate();
// a question in the dense form: a fact whose arguments may be variables
console.log('rows', r.query(denseLit('close(v("A"), v("B")).')).rows.length);
console.log('holds', r.holds(denseLit('reading(s1, 20, 1).')));
