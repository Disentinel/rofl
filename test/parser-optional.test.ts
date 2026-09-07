// parser-optional.test.ts — the grammar is droppable AS A FILE, the lexis is
// not, and the difference between those two answers is the measurement.
//
// A line census can only say which lines a task ENTERS; it cannot say whether
// a build could ship without the file, because a module is bundled for being
// imported and not for being run. This deletes the file. The second case is
// the control: if BOTH mutants compiled, the first would be telling us nothing
// about the parser — only that tsc had stopped looking.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withoutFiles } from '../scripts/parser_optional.ts';

test('the kernel type-checks with src/parser.ts deleted', () => {
  const m = withoutFiles(['parser.ts']);
  assert.ok(m.ok, `dropping the grammar broke the build:\n${m.out}`);
});

test('and does NOT with src/tokens.ts deleted — atom_of asks the tokenizer', () => {
  const m = withoutFiles(['parser.ts', 'tokens.ts']);
  assert.ok(!m.ok, 'the lexis went unmissed, so the previous test proved nothing');
  assert.match(m.out, /src\/reflect\.ts/,
    `the lexis was missed somewhere other than reflection:\n${m.out}`);
});
