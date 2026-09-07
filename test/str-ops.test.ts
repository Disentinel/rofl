// str_sub and atom_of: the two operations self-application needed, and the
// test the decision on destructors named in advance.
//
// The criterion recorded on 2026-09-01 is a PROOF, not a preference: the
// substrings of a program's strings are finite, so a destructor keeps the
// Herbrand universe finite and the fixpoint terminates BY CONSTRUCTION, while
// a constructor yields a string that was not there and can be fed back. The
// test that decision demanded was named at the same time and is here:
//
//   a program using only destructors must reach a fixpoint where the term set
//   STOPS GROWING, and a program that constructs must be shown to grow without
//   bound -- BOTH DIRECTIONS, or the criterion is decoration.
//
// The growing side uses `N is M + 1` rather than a concatenation, because
// arithmetic successor is the one place this kernel is already not finite by
// construction and it is the same defect wearing different clothes. A
// concatenation cannot be used: it does not exist, which is the point.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { tokenize } from '../src/parser.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

const world = (program: string, budget: number) => {
  const r = new Rofl();
  r.load(BOOT, { budget });
  r.load(program, { budget });
  r.evaluate(budget);
  return r;
};
const rows = (r: Rofl, q: string, budget: number) => r.query(q, { budget }).rows.length;

/** Every substring of the seed, derived by shrinking from both ends. */
const SHRINK = `
edb(seed).
seed("abcdefgh").
s(X) :- seed(X).
s(Y) :- s(X), N is str_len(X), 1 < N, M is N - 1, Y is str_sub(X, 0, M).
s(Y) :- s(X), N is str_len(X), 1 < N, M is N - 1, Y is str_sub(X, 1, M).
a(A) :- s(X), A is atom_of(X).
`;

/** The same shape, constructing instead of destructing. */
const GROW = `
edb(seed).
seed(0).
s(X) :- seed(X).
s(Y) :- s(X), Y is X + 1.
`;

test('destructors reach a fixpoint: the term set stops growing', () => {
  const counts = [20_000, 100_000, 500_000].map((b) => rows(world(SHRINK, b), 's(X)', b));
  // THE POSITIVE CONTROL COMES FIRST. A rule that never fires would also give
  // a constant count, and a check that cannot tell those apart is measuring
  // nothing: an 8-character seed has 36 substrings, and 1 would mean the seed
  // alone.
  assert.equal(counts[0], 36, `expected every substring of an 8-char seed, got ${counts[0]}`);
  assert.deepEqual(counts, [counts[0], counts[0], counts[0]],
    `the count must be a property of the PROGRAM, not of the budget: ${counts.join(', ')}`);
});

test('atom_of adds finitely many atoms, one per derived string', () => {
  const b = 500_000;
  const r = world(SHRINK, b);
  assert.equal(rows(r, 'a(A)', b), rows(r, 's(X)', b));
  // and no hole: the fixpoint closed rather than being cut off
  assert.equal(rows(r, 'hole(R, Reason)', b), 0);
});

test('a constructor grows without bound: the count is a property of the BUDGET', () => {
  const counts = [20_000, 60_000, 150_000].map((b) => rows(world(GROW, b), 's(X)', b));
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2],
    `a constructor must grow with the budget, got ${counts.join(', ')}`);
  // and it says so: the wall is reported rather than passed off as an answer
  assert.ok(rows(world(GROW, 20_000), 'hole(R, Reason)', 20_000) > 0);
});

test('the substrings are the RIGHT ones, not merely the right number', () => {
  // The fixpoint test counts. A str_sub returning garbage of the correct
  // cardinality would pass it, so the values are checked too.
  const b = 500_000;
  const r = world('edb(w).\nw("abc").\np(S) :- w(T), S is str_sub(T, 1, 2).\n', b);
  assert.deepEqual(r.query('p(S)', { budget: b }).rows.map((x) => x.text), ['S = "bc"']);
});

test('the str_sub boundary is SWEPT, and the allowed set is named', () => {
  // Not sampled. Every (I, L) around a three-character string, with the
  // accepted pairs asserted BY NAME so a future widening has to change this
  // line rather than slip through.
  const b = 200_000;
  const ok: string[] = [];
  for (let i = -1; i <= 4; i++) {
    for (let L = 0; L <= 4; L++) {
      const r = world(`edb(w).\nw("abc").\np(S) :- w(T), S is str_sub(T, ${i}, ${L}).\n`, b);
      const rows = r.query('p(S)', { budget: b }).rows;
      const holes = r.query('hole(R, Reason)', { budget: b }).rows.map((x) => x.text);
      if (rows.length) { ok.push(`${i},${L}`); assert.equal(holes.length, 0); }
      else assert.ok(holes.some((h) => h.includes('str_index_error')),
        `I=${i} L=${L} must be a NAMED refusal, not a silent empty`);
    }
  }
  // 0 <= I <= len and I + L <= len, and nothing else. The empty substring at
  // the very end (I = len, L = 0) is legal; one character past it is not.
  assert.deepEqual(ok, ['0,0', '0,1', '0,2', '0,3', '1,0', '1,1', '1,2',
                        '2,0', '2,1', '3,0']);
});

test('atom_of makes exactly the atoms a program could have written', () => {
  // The oracle is the TOKENIZER, not a regex beside it — a hand-written twin
  // of a rule that already exists is the defect this repository has paid for
  // twice. The sweep found four kinds of atom the language could hold and
  // never state: empty, spaced, leading-capital (which reads back as a
  // VARIABLE) and integer-spelled. `$kernel` stays allowed because it is
  // writable in source today, so nothing that was shut is opened.
  const b = 200_000;
  for (const [str, allowed] of [['abc', true], ['a_1', true], ['$kernel', true],
                                ['', false], [' ', false], ['A', false],
                                ['a b', false], ['123', false]] as [string, boolean][]) {
    const r = world(`edb(w).\nw(${JSON.stringify(str)}).\np(S) :- w(T), S is atom_of(T).\n`, b);
    const rows = r.query('p(S)', { budget: b }).rows;
    const holes = r.query('hole(R, Reason)', { budget: b }).rows.map((x) => x.text);
    if (allowed) {
      assert.equal(rows.length, 1, `${JSON.stringify(str)} is writable and must produce an atom`);
    } else {
      assert.equal(rows.length, 0, `${JSON.stringify(str)} is not writable in source`);
      assert.ok(holes.some((h) => h.includes('atom_unwritable')),
        `${JSON.stringify(str)} must be refused BY NAME, got ${holes.join(' | ') || 'silence'}`);
    }
    // and the oracle agrees with the tokenizer, checked rather than assumed
    let single = false;
    try {
      const t = tokenize(str);
      single = t.length === 2 && t[0].t === 'ident' && t[0].v === str;
    } catch { single = false; }
    assert.equal(single, allowed, `the tokenizer and this table disagree on ${JSON.stringify(str)}`);
  }
});

test('str_sub past the end is a LOUD index error, not a short answer', () => {
  const b = 200_000;
  const r = world('edb(w).\nw("abc").\np(S) :- w(T), S is str_sub(T, 1, 99).\n', b);
  assert.equal(rows(r, 'p(S)', b), 0);
  const holes = r.query('hole(R, Reason)', { budget: b }).rows.map((x) => x.text);
  assert.ok(holes.some((h) => h.includes('str_index_error')), holes.join(' | '));
});

test('atom_of produces an ATOM, and an atom is not the string it came from', () => {
  const b = 200_000;
  const r = world('edb(w).\nw("cat").\nmade(A) :- w(S), A is atom_of(S).\n'
    + 'hit(A) :- made(A), A = cat.\nmiss(A) :- made(A), A = "cat".\n', b);
  assert.equal(rows(r, 'hit(A)', b), 1);
  assert.equal(rows(r, 'miss(A)', b), 0, 'an atom must not unify with its own spelling');
});

test('a computed atom cannot become an executable relation name', () => {
  // atom_of is the one new operation that produces something a RELATION could
  // be named with, so the door it might open is checked rather than assumed.
  // A rule head needs an identifier, and the reflection rows are
  // write-protected, so a computed atom stays data.
  const r = new Rofl();
  r.load(BOOT, { budget: 200_000 });
  const res = r.load('edb(w).\nw("evil").\n'
    + 'conclusion_lit(r_x, 1, $lit(evil, main, $nil, $now)) :- w(S), A is atom_of(S).\n');
  assert.equal(res.ok, false);
  assert.match(res.diagnostics.join(' '), /write-protected/);
});
