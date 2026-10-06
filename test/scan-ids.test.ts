// Node ids of scanners/js_ast.ts: 64 bits of the path, one prefix per file, and a refusal in words when two labels
// share a prefix or one label is scanned twice into one world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan, idPrefix, claim, ScanSet } from '../scanners/js_ast.ts';

test('a prefix is sixteen hex digits of the path, and every id of a file carries it', () => {
  assert.match(idPrefix('a.js'), /^n[0-9a-f]{16}_$/);
  assert.notEqual(idPrefix('a.js'), idPrefix('b.js'));
  const r = scan('x;', { file: 'a.js' });
  assert.equal(r.prefix, idPrefix('a.js'));
  assert.ok(r.root.startsWith(r.prefix));
});

test('the same label scanned twice into one world is refused by the scanner, in words', () => {
  const set = new ScanSet();
  set.scan('x;', { file: 'a.js' });
  assert.throws(() => set.scan('y;', { file: 'a.js' }), /"a\.js" is scanned twice into one world; retract its first scan/);
  set.forget('a.js');
  set.scan('y;', { file: 'a.js' });
});

test('a label under the prefix of another is refused with both names', () => {
  claim('ntest_collide_', 'one.js');
  claim('ntest_collide_', 'one.js');
  assert.throws(() => claim('ntest_collide_', 'two.js'), /"one\.js" and "two\.js" share the node id prefix ntest_collide_/);
});
