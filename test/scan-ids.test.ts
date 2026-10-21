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

const ids = (src: string): Set<string> => new Set(scan(src, { file: 'cart.js' }).facts.filter((f) => !f.startsWith('ast_line')));

test('an id is a place in the tree: code added above, a blank line or an edit of one statement moves that and the order of its siblings', () => {
  const base = 'const a = 1;\nfunction f(x) { return g(x, 2); }\nit("adds", () => { add(1); });\n';
  const moved = (src: string) => { const b = ids(base), e = ids(src); return [...b].filter((f) => !e.has(f)).length + [...e].filter((f) => !b.has(f)).length; };
  assert.equal(moved('\n\n' + base), 0);
  assert.ok(moved('function top() {}\n' + base) <= 15);
  assert.ok(moved('it("first", () => { one(); });\n' + base) <= 29);
  assert.ok(moved(base.replace('add(1)', 'add(2)')) <= 20);
});
