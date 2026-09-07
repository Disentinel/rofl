// query-unpopulatable.test.ts — THE TWO EMPTY ANSWERS, TOLD APART.
//
// WHY THIS FILE EXISTS. Nearly every gate above this kernel has the shape
// `assert.equal(n('some_audit[audit](X)'), 0)`. Until 2026-09-07 a query
// answered NO ROWS and NO SUCH RELATION with the same empty result and no
// error, so every one of those assertions was satisfied by a typo, by a rename
// that left the call site behind, by a literal written at the wrong arity, and
// by naming the wrong LEDGER. A gate that cannot go red is worse than one that
// is red, because it is quietly believed — the sentence CLAUDE.md already
// writes about a permanently-wrong check, arriving here through the host's
// queries rather than through a rule.
//
// boot.rofl ALREADY SAYS THIS ABOUT RULES. `undefined_premise[audit](R, Rel)`
// names a rule whose positive premise stands on a relation nothing concludes
// and no fact populates — "the rule is not wrong, it is unpopulatable: it fails
// silently and forever". A QUERY IS NOT A RULE, so nothing said it about a
// query, and the model's own machinery could not reach the place the model is
// measured from.
//
// WHAT IT FOUND ON THE DAY IT WAS WRITTEN, both live in this repository:
//   * test/worklist.test.ts asserted `stale_reason[audit](A, K, S, L, R)` empty
//     against a relation defined at arity FOUR — a green line that could never
//     go red, sitting directly beneath the identical assertion that works.
//   * test/js-callgraph.test.ts computed `param_bind[code](F, N, G)` in all
//     twenty-six mutant probes. `param_bind` had been absorbed into the value
//     layer and no longer exists at all.
//
// AND WHAT IT IS STILL UNABLE TO SEE, measured rather than assumed — the
// question that produced every surviving mutant in this repository's history:
//   * A CONSTANT that never occurs. `base(no_such_atom)` is empty and correct
//     and must stay unflagged; there is no way to tell a wrong constant from a
//     true absence, and that is the whole point of asking.
//   * A query issued OUTSIDE a guarded helper. This is a property of the call
//     site, not of the kernel: `unpopulatable` is a field, and a caller that
//     does not read it learns nothing. Five helpers read it today.
//   * A relation that is populatable but never populated FOR THE REASON THE
//     TEST MEANS. `derived[audit](X)` below is a rule head with no rows, which
//     is exactly the honest empty answer, and no check can distinguish "empty
//     because the model is clean" from "empty because the rule is dead".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

/** one world with every shape of relation the question has an answer for */
function world(): Rofl {
  const r = new Rofl();
  const res = r.load(`edb(base).
base(1).
base(2).
edb(empty_table).
derived[audit](X) :- base(X), X != 1, X != 2.
inled[code](X) :- base(X).
carried[P](X) :- inled[P](X).
`);
  assert.equal(res.ok, true, res.diagnostics.join('\n'));
  return r;
}

test('the eight answers, by name — what is flagged and what is not', () => {
  const r = world();
  const ask = (lit: string) => {
    const res = r.query(lit);
    assert.equal(res.error, undefined, `${lit}: ${res.error}`);
    return `${res.rows.length} rows, unpopulatable=${res.unpopulatable}`;
  };
  // THE LIST IS NAMED RATHER THAN COUNTED, because a count would tolerate any
  // three of these being wrong as long as three others compensated.
  assert.deepEqual([
    ['base(X)', ask('base(X)')],
    ['derived[audit](X)', ask('derived[audit](X)')],
    ['empty_table(X)', ask('empty_table(X)')],
    ['base(no_such_atom)', ask('base(no_such_atom)')],
    ['nosuch[audit](X)', ask('nosuch[audit](X)')],
    ['derived[audit](X, Y)', ask('derived[audit](X, Y)')],
    ['derived[code](X)', ask('derived[code](X)')],
    ['inled[audit](X)', ask('inled[audit](X)')],
  ], [
    // POPULATABLE — the four an over-eager check would break
    ['base(X)', '2 rows, unpopulatable=false'],
    ['derived[audit](X)', '0 rows, unpopulatable=false'],   // a rule head, empty
    ['empty_table(X)', '0 rows, unpopulatable=false'],      // a declared edb, empty
    ['base(no_such_atom)', '0 rows, unpopulatable=false'],  // a true absence
    // UNPOPULATABLE — the four that used to be indistinguishable from those
    ['nosuch[audit](X)', '0 rows, unpopulatable=true'],     // no such name
    ['derived[audit](X, Y)', '0 rows, unpopulatable=true'], // right name, wrong arity
    ['derived[code](X)', '0 rows, unpopulatable=true'],     // right name, wrong ledger
    ['inled[audit](X)', '0 rows, unpopulatable=true'],      // ...even when populated
  ]);
});

test('a ledger named by a VARIABLE makes every ledger possible, and is not flagged', () => {
  // THE ONE CASE THE PERSPECTIVE CHECK MUST BACK OFF FROM, and this repository
  // has such a rule for real: `one polymorphic carry rule carries ten separate
  // journals`. `carried[P](X) :- inled[P](X).` concludes into whatever ledger
  // its premise came from, so no finite set of ledgers describes it, and a
  // check that judged it would go red on an honest program.
  const r = world();
  for (const lit of ['carried[code](X)', 'carried[audit](X)', 'carried[flow](X)']) {
    assert.equal(r.query(lit).unpopulatable, false, `${lit} must not be judged`);
  }
  assert.equal(r.query('carried[code](X)').rows.length, 2, 'positive control: it derives');
});

test('MUTANT: a misspelled audit is caught, and the correct spelling is not', () => {
  // The planted defect this gate exists for, in the exact shape the repository
  // writes it: an audit asserted EMPTY, with one letter wrong.
  const r = world();
  const wrong = r.query('drived[audit](X)');
  const right = r.query('derived[audit](X)');
  assert.equal(wrong.rows.length, right.rows.length, 'both answer with nothing');
  assert.equal(wrong.error, right.error, 'and neither is an error');
  assert.notEqual(wrong.unpopulatable, right.unpopulatable,
    'and ONLY unpopulatable tells them apart — if this fails the gate is blind');
});

test('MUTANT: the check is not the store — a populated relation asked wrongly still fails', () => {
  // WHERE A CHEAPER CHECK WOULD HAVE STOPPED: "does the store hold any fact
  // under this name" is satisfied by `inled[code]` having rows, and says
  // nothing about the ledger the caller asked for. Measured, not argued.
  const r = world();
  assert.ok(r.query('inled[code](X)').rows.length > 0, 'the relation is populated');
  assert.equal(r.query('inled[audit](X)').unpopulatable, true,
    'and asking the wrong ledger of a populated relation is still unpopulatable');
});

test('the ARITY of a BASE relation is judged only while judging it is free', () => {
  // THE BOUND IS DECLARED AND MEASURED, not discovered later. Learning a base
  // relation's arity means enumerating it, and this runs on every query in a
  // world where `ast_node` carries a hundred thousand rows — so the scan stops
  // at 64 facts. A rule head carries its own arity and is judged whatever the
  // relation's size; a big EDB asked at the wrong arity is the case that gets
  // away, and here it is, by name.
  const small = new Rofl();
  small.load('edb(few).\n' + Array.from({ length: 60 }, (_, i) => `few(${i}).`).join('\n') + '\n');
  assert.equal(small.query('few(X, Y)').unpopulatable, true, 'small enough to read: caught');

  const big = new Rofl();
  big.load('edb(many).\n' + Array.from({ length: 200 }, (_, i) => `many(${i}).`).join('\n') + '\n');
  assert.equal(big.query('many(X)').rows.length, 200, 'positive control: the big one is populated');
  assert.equal(big.query('many(X, Y)').unpopulatable, false,
    'too big to read for free: the wrong arity gets away, and that is the price of the bound');

  // ...and the bound does NOT weaken the derived case, which is the one every
  // audit gate in this repository is.
  const derived = new Rofl();
  derived.load('edb(many).\n' + Array.from({ length: 200 }, (_, i) => `many(${i}).`).join('\n')
    + '\nbig_audit[audit](X) :- many(X).\n');
  assert.equal(derived.query('big_audit[audit](X)').rows.length, 200, 'positive control');
  assert.equal(derived.query('big_audit[audit](X, Y)').unpopulatable, true,
    'a rule head carries its arity, so size is irrelevant there');
});

test('a relation big enough to overflow a spread still answers', () => {
  // THE CRASH THIS CAUSED, kept as a test rather than as a memory. `relAll`
  // built its result with `out.push(...arr)`, which passes every element as an
  // ARGUMENT: adding a store read to `query` turned an honest program into
  // `RangeError: Maximum call stack size exceeded` raised from inside the
  // store. A spread over an unbounded array is a size limit nobody declared,
  // and it fires in the caller rather than where the array grew.
  const r = new Rofl();
  const n = 200_000;
  const lines: string[] = ['edb(wide).'];
  for (let i = 0; i < n; i++) lines.push(`wide(${i}).`);
  assert.equal(r.load(lines.join('\n')).ok, true);
  assert.equal(r.query('wide(X)').rows.length, n, 'the whole relation comes back');
  assert.equal(r.query('wide(X)').unpopulatable, false);
});

test('MUTANT: a hole in the LIST is a hole in the gate — every guarded helper reads it', () => {
  // THE GATE IS A FIELD AND A FIELD IS ONLY AS GOOD AS ITS READERS. This is
  // where the check is structurally unable to look, so it is asserted from the
  // outside: the helpers that build a model world must all consult it, and a
  // new test file that queries `r.query` directly inherits nothing.
  const files = ['test/js-callgraph.test.ts', 'test/js-controlflow.test.ts',
                 'test/js-model.test.ts', 'test/js-env.test.ts', 'test/worklist.test.ts'];
  const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(text.includes('unpopulatable'),
      `${f} builds a model world and does not read unpopulatable`);
  }
});
