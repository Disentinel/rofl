// TASK 9 — THE HOST WITHOUT A LOADER. The store arrives already compiled, from
// a file this process did not produce; nothing here loads program text. What
// of src/parser.ts this task still enters is what a host with no loader would
// STILL have to carry -- and the answer, 201 lines of 262, is why the parser
// cannot simply be deleted in favour of shipping compiled programs. A QUERY IS
// TEXT TOO.
//
// The fixture is built by a SEPARATE process on demand. Building it here is
// what the first version of this task did, and it reported that a parser-less
// host needs every line of the parser -- a measurement of the task, not of the
// kernel.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../../src/api.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const SNAP = path.join(process.env.TMPDIR ?? '/tmp', 'rofl-compiled-fixture.json');
if (!fs.existsSync(SNAP)) {
  execFileSync(process.execPath, ['--experimental-strip-types',
    path.join(ROOT, 'scanners', 'tasks', 'compile-fixture.ts'), SNAP], { stdio: 'ignore' });
}
const r = Rofl.fromSnapshot(fs.readFileSync(SNAP, 'utf8'));
r.evaluate();
console.log('rows', r.query('close(A, B)').rows.length);
