// A sentence with an `a/b` in it is read twice, once with each side (scripts/read_md.ts `halves`). When neither reads, what the reader says
// of it is said once and quotes the sentence as written: no second copy, no path cut to `a.py` or `b`. Both readers, and the notebook's book.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readMd } from '../scripts/read_md.ts';
import { readBook } from '../notebook/book.ts';

// bare paths as a README writes them; the capital in `Acme/widgets` is what a notebook would learn a sentence from, a variable in its place
const PARAS = [
  'Facts about the builds of acme/* and corp/*, gathered by the scanners\n(tools/scan_jobs.py, tools/scan_runs.py, branch dev/topic-branch-abc123 of\nacme/widgets, = upstream/main 1234abcd + 1). Two repos are closed\n(acme/widgets-pro, corp/billing): nothing here goes to acme/widgets, which is open.',
  'Skipped: corp/docs-site and acme/demo-service (no access), corp/date-picker (empty).',
  '`a.rofl` and `b.rofl` copy `examples/ci/` from Acme/widgets, and `tools/scan_jobs.py` reads them.',
];
const MD = PARAS.join('\n\n') + '\n';
const WANT = PARAS.map((p) => `HEAD ${p.replace(/\n/g, ' ').replace(/\.$/, '')}`);

const once = (said: string[]) => {
  assert.equal(said.length, WANT.length, `one report for each sentence:\n${said.join('\n')}`);
  for (const w of WANT) assert.equal(said.filter((s) => s === w).length, 1, `said once, as written: ${w}\n${said.join('\n')}`);
};

test('the TypeScript reader says each unread sentence once, as written', () => once(readMd(MD, { vocab: '' }).problems.unparsed));

test('a notebook reads it alike, and learns no sentence from a head with an a/b in it', () => {
  const b = readBook([{ id: 'c0', text: MD, form: 'md', prose: true }], '', {}, true);
  once(b.read[0]!.problems.unparsed);
  assert.deepEqual(b.learned, []);
});

const BIN = path.join(import.meta.dirname, '..', 'rust', 'target', process.env.ROFL_PROFILE || 'release', 'rofl');
test('the Rust reader says the same', { skip: !existsSync(BIN) && `${BIN}: not built` }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rofl-twin-')), f = path.join(dir, 'twin.rofl.md');
  writeFileSync(f, MD);
  const report = execFileSync(BIN, ['render', '--out', dir, f], { encoding: 'utf8' });
  once(report.split('\n').filter((l) => l.startsWith('  HEAD ')).map((l) => l.slice(2)));
});
