// The escapes a string reads: the main reader (src/tokens.ts) and the dense reader (src/dense.ts) read the same ones,
// and \u is exactly four hex digits of a control character (the Rust readers are held to the same in their unit tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/tokens.ts';
import { denseFacts } from '../src/dense.ts';

const mainString = (src: string): string => (tokenize(src).find((t) => t.t === 'str') as { v: string }).v;
const denseString = (src: string): string => (denseFacts(`p(${src}).`)[0]!.args[0] as { v: string }).v;

test('both readers read \\b \\f and \\u0000..\\u001f', () => {
  const src = '"a\\b\\f\\u001f\\n"';
  assert.equal(mainString(src), 'a\b\f\u001f\n');
  assert.equal(denseString(src), "a\b\f\u001f\n");
});

test('both readers refuse a \\u that is not four hex digits of a control character', () => {
  for (const bad of ['"\\u+01f"', '"\\u-01f"', '"\\u01f"', '"\\u0041"', '"\\u001g"', '"\\x"']) {
    assert.throws(() => tokenize(bad), /escape/, bad);
    assert.throws(() => denseString(bad), /escape/, bad);
  }
});
