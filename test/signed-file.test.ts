// A FILE OF SCANNED FACTS IS SIGNED, in the hosts of the TypeScript engine (src/signed.ts): the notebook's Node host
// (notebook/cli.ts `inputs`, which the command line and the kept kernel read through) holds a file a notebook reads
// to its scanner's code and its sources as the Rust engine does; a host that has not the code (a browser: the
// workbench, the playground) loads it and says once that its signature was not checked. Each refusal is shown to
// lapse when its planted fault is switched on (src/signed.ts `planted`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { inputs } from '../notebook/cli.ts';
import { assemble } from '../notebook/world.ts';
import { notChecked, planted, sum, codeSign } from '../src/signed.ts';

const NB = '---\nreads:\n  - facts.rofl\n---\n\n# A notebook over scanned facts\n';

/** A notebook beside `facts.rofl`, signed by `scan.sh` (its code) with the source lines given; what `inputs` says. */
function dir(): { d: string; write(source: string, tail?: string): void; read(): { errors: string[]; checked: Record<string, string> } } {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-signed-'));
  fs.writeFileSync(path.join(d, 'scan.sh'), 'echo "-- source: api://thing $(cat token)"\n');
  fs.writeFileSync(path.join(d, 'token'), 'v1');
  fs.writeFileSync(path.join(d, 'nb.rofl.md'), NB);
  return {
    d,
    write(source, tail = '') {
      const s = sum(fs.readFileSync(path.join(d, 'scan.sh')));
      fs.writeFileSync(path.join(d, 'facts.rofl'), `-- scanner: t ${codeSign([s])}\n-- code: scan.sh ${s}\n-- again: cd ${d} && sh scan.sh\n${source}${tail}thing(1).\n`);
    },
    read() {
      const r = inputs(path.join(d, 'nb.rofl.md'), NB);
      return { errors: r.errors, checked: r.input.checked ?? {} };
    },
  };
}

const refused = (errors: string[], what: RegExp): boolean => errors.some((e) => what.test(e));

test('the Node host holds a file to its code', () => {
  const t = dir();
  t.write('');
  assert.deepEqual(t.read().errors, []);
  assert.equal(t.read().checked['facts.rofl'], '');
  fs.appendFileSync(path.join(t.d, 'scan.sh'), '# a comment\n');
  assert.ok(refused(t.read().errors, /changed since: scan\.sh.*scan again: cd /), t.read().errors.join('\n'));
  planted.add('code');
  try { assert.deepEqual(t.read().errors, [], 'planted: the code not held'); } finally { planted.delete('code'); }
  fs.writeFileSync(path.join(t.d, 'facts.rofl'), '-- code: scan.sh\nthing(1).\n');
  assert.ok(refused(t.read().errors, /not signed by its code/));
});

test('the Node host holds a file to its sources', () => {
  const t = dir();
  t.write('-- source: api://thing v1\n');
  assert.deepEqual(t.read().errors, []);
  fs.writeFileSync(path.join(t.d, 'token'), 'v2');
  assert.ok(refused(t.read().errors, /api:\/\/thing moved: v1 then, v2 now/), t.read().errors.join('\n'));
  t.write('-- source: api://snap @2020-01-01T00:00:00Z\n', '-- ttl: 3600\n');
  assert.ok(refused(t.read().errors, /past its TTL of 3600 s/));
  planted.add('sources');
  try { assert.deepEqual(t.read().errors, [], 'planted: the sources not held'); } finally { planted.delete('sources'); }
  t.write('-- source: api://snap @2099-01-01T00:00:00Z\n', '-- ttl: 3600\n');
  assert.match(t.read().checked['facts.rofl'], /as of 2099-01-01T00:00:00Z/);
  planted.add('asof');
  try { assert.equal(t.read().checked['facts.rofl'], '', 'planted: as of dropped'); } finally { planted.delete('asof'); }
});

test('a notebook says as of, and a host without the code says it did not check', () => {
  const facts = '-- scanner: t 0123456789abcdef\n-- code: scan.sh 0123456789abcdef\nthing(1).\n';
  const browser = assemble('nb.rofl.md', NB, { lib: {}, reads: { 'facts.rofl': facts }, code: {} });
  assert.deepEqual(browser.notes, [notChecked('facts.rofl')]);
  const node = assemble('nb.rofl.md', NB, { lib: {}, reads: { 'facts.rofl': facts }, code: {}, checked: { 'facts.rofl': 'the facts of facts.rofl are as of 2099' } });
  assert.deepEqual(node.notes, ['the facts of facts.rofl are as of 2099']);
  const plain = assemble('nb.rofl.md', NB, { lib: {}, reads: { 'facts.rofl': 'thing(1).\n' }, code: {} });
  assert.deepEqual(plain.notes, []);
});

test('the sum is the engine\'s', () => {
  // rust/rofl/tests/sources.rs `the_sum_is_one_in_three_languages` holds the same value for rust/rofl/src/arena.rs
  // Sum::of and scanners/own_code.py sum_of
  assert.equal(sum(new TextEncoder().encode('a scan names its code')), '4cd791393f0d9793');
});
