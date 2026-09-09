// THE HAND-WRITTEN TOKENIZER, HELD TO ring1.
//
// Decided 2026-09-09 by the owner: write the tokenizer imperatively and keep
// ring1 as the specification and the oracle. The generated alternative is
// committed and correct and was measured at 8.3 ms per KiB; this one costs
// 0.032 ms per KiB marginal — 260 times less — because a table walker is an
// interpreter moved into Rust rather than a compiler.
//
// THAT TRADE ONLY WORKS IF THE ORACLE IS REAL, which is the whole point of
// keeping ring1. A syntax change is still a change to the RULES first; this
// file is then rewritten against them, and the oracle is what makes that safe
// instead of frightening. So the assertion is the same one the generated
// tokenizer had to pass: SET EQUALITY of token spans, never a count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../src/api.ts';

const REPO = fs.realpathSync(new URL('..', import.meta.url).pathname);
const read = (p: string): string => fs.readFileSync(path.join(REPO, p), 'utf8');
const BIN = path.join(REPO, 'rust/target/release/rofl-lex');
const BUDGET = 4_000_000_000;

// Chosen for SHAPE, not size: a tiny program, one that is almost all comment,
// one dense with strings and escapes, and the character table itself.
//
// THE ORACLE IS EXPENSIVE AND THAT BOUNDS THE GATE. Interpreting ring1 costs
// about 112 ms per KiB, so a 12 KiB grammar file takes the better part of a
// minute and the first draft of this test — which included ring1.rofl and a JS
// rule pack — took 42 seconds and then fell over. The files here are the ones
// the oracle can afford. That is a real limit on what this gate can see and it
// is written down rather than left to be rediscovered.
const FILES = [
  'examples/counter.rofl',
  'rules/policies/authority.rofl',
  'examples/tm.rofl',
  'examples/ring1/charclass.rofl',
];

function fromRules(src: string): Set<string> {
  const w = new Rofl({ space: 20_000_000 });
  for (const p of ['boot.rofl', 'examples/ring1/charclass.rofl', 'examples/ring1/ring1.rofl']) {
    w.load(read(p), { budget: BUDGET });
  }
  w.assert(`src(${JSON.stringify(src)}).`);
  w.evaluate(BUDGET);
  const out = new Set<string>();
  for (const row of w.query('tok(I, J)').rows) out.add(`${row.bindings.I},${row.bindings.J}`);
  return out;
}

for (const f of FILES) {
  test(`the hand-written tokenizer equals ring1: ${f}`, () => {
    if (!fs.existsSync(BIN)) return;                    // built by cargo; skipped when absent
    const truth = fromRules(read(f));
    const raw = execFileSync(BIN, [path.join(REPO, f)], { encoding: 'utf8' });
    const mine = new Set(raw.split('\n').filter(Boolean));
    assert.ok(truth.size > 15, `${f}: only ${truth.size} tokens, too few to prove anything`);
    const missing = [...truth].filter((x) => !mine.has(x));
    const invented = [...mine].filter((x) => !truth.has(x));
    assert.deepEqual([missing.slice(0, 5), invented.slice(0, 5)], [[], []],
      `${f}: ${missing.length} tokens the rules have and the tokenizer does not, `
      + `${invented.length} the other way`);
    assert.equal(mine.size, truth.size);
  });
}

test('a planted defect in the source moves the token set', () => {
  // A gate that has never been red proves nothing about what it can see.
  if (!fs.existsSync(BIN)) return;
  const tmp = path.join(os.tmpdir(), `rofl-lex-${process.pid}.rofl`);
  fs.writeFileSync(tmp, 'p(a).\n');
  const a = execFileSync(BIN, [tmp], { encoding: 'utf8' });
  fs.writeFileSync(tmp, 'p(a) -- and a comment\n');
  const b = execFileSync(BIN, [tmp], { encoding: 'utf8' });
  fs.rmSync(tmp, { force: true });
  assert.notEqual(a, b, 'the tokenizer returns the same spans for different sources');
  assert.ok(!b.split('\n').filter(Boolean).some((x) => x === '5,5'),
    'the first dash of a comment must not become a minus token — the rules exclude it twice');
});
