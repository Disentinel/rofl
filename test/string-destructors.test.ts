// string-destructors.test.ts -- the five operations that take a string apart,
// and the one property that decides whether they may exist at all.
//
// THE CLAIM THIS FILE IS ABOUT. A destructor returns a SUBSTRING of its input
// or a NUMBER about it, so the terms it can produce are drawn from a finite
// set (a string of length L has at most L(L+1)/2 + 1 substrings) and a
// fixpoint over a finite term universe stops by construction. A CONSTRUCTOR
// -- concatenation -- returns a string that was not there, feeds it back in,
// and the universe is infinite. `src/reflect.ts` states that as the reason the
// kernel gains destructors and no constructor.
//
// A criterion that cannot separate the two cases is decoration, so it is
// measured in BOTH directions, on ONE program:
//
//   destructors only     19 terms at budgets 5k, 10k, 20k, 200k; 89 steps;
//                        no hole. The answer is a property of the program.
//   plus one concat      2289 / 6952 / 16397 terms at 5k / 10k / 20k, steps
//                        always budget+1, `budget_exhausted` every time. The
//                        answer is a property of the budget.
//
// The concatenation exists ONLY inside this file, patched onto the evaluator
// for the length of one test and removed in a `finally`. That is deliberate:
// the negative side has to run the same rules through the same engine, and
// the kernel must not gain the operation that would make it true.
//
// The refusals are the second subject. An index off the end, a number where a
// string belongs, an empty separator: each is an INABILITY, and each says so
// as `hole($rule(Id), Reason)` -- the form the kernel already uses for
// `arith_type_error`. An empty answer would be a fact about the instrument.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { mks, walk } from '../src/unify.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

/** The `hole` rows as `id reason` pairs, sorted. */
const holes = (r: Rofl): string[] =>
  r.query('hole(H, Reason)').rows.map((x) => `${x.bindings.H} ${x.bindings.Reason}`).sort();

/** The id of the single rule concluding into `rel`. */
function ruleFor(r: Rofl, rel: string): string {
  const ids = r.query(`concludes(Id, ${rel})`).rows.map((x) => x.bindings.Id);
  assert.equal(ids.length, 1, `expected exactly one rule concluding into ${rel}`);
  return ids[0];
}

/** Two columns of a query as `a b` lines, sorted -- rows come back in the
 *  store's canonical order and a query prints its variables in its own, so a
 *  positional read of `row.text` would be pinning neither. */
const pairs = (r: Rofl, q: string, a: string, b: string): string[] =>
  r.query(q).rows.map((x) => `${x.bindings[a]} ${x.bindings[b]}`).sort();

/** One column of a query, sorted. */
const col = (r: Rofl, q: string, v: string): string[] =>
  r.query(q).rows.map((x) => x.bindings[v]).sort();

/** A store holding `s(Seed)` and the given rules. */
function world(seed: string, rules: string): Rofl {
  const r = new Rofl();
  assert.equal(r.assert(`s(${JSON.stringify(seed)}).`).ok, true);
  const ld = r.load(rules);
  assert.equal(ld.ok, true, ld.diagnostics.join('; '));
  return r;
}

// ---------------------------------------------------------------------------
// 1. what the five operations answer

test('the five destructors answer, and every answer is a substring or a number', () => {
  const seed = 'ab-cd.ef-gh';
  const r = world(seed, `
    idx(0). idx(1). idx(2). idx(3). k(0). k(1). k(2).
    len(N)     :- s(S), N is str_len(S).
    ch(I, C)   :- s(S), idx(I), C is str_char(S, I).
    segs(N)    :- s(S), N is str_segs(S, "-").
    seg(K, T)  :- s(S), k(K), T is str_seg(S, "-", K).
    pre(P)     :- s(S), P is str_pre(S, "-").
  `);
  assert.deepEqual(col(r, 'len(N)', 'N'), ['11']);
  assert.deepEqual(pairs(r, 'ch(I, C)', 'I', 'C'),
    ['0 "a"', '1 "b"', '2 "-"', '3 "c"']);
  assert.deepEqual(col(r, 'segs(N)', 'N'), ['3']);
  assert.deepEqual(pairs(r, 'seg(K, T)', 'K', 'T'),
    ['0 "ab"', '1 "cd.ef"', '2 "gh"']);
  assert.deepEqual(col(r, 'pre(P)', 'P'), ['"ab"']);
  // and nothing refused: the happy path is silent about inabilities
  assert.deepEqual(holes(r), []);

  // THE CRITERION, checked mechanically rather than read off the values: every
  // string this program derived is a substring of the string it started from.
  const derived = [...col(r, 'ch(I, C)', 'C'), ...col(r, 'seg(K, T)', 'T'), ...col(r, 'pre(P)', 'P')];
  assert.equal(derived.length, 8);
  for (const d of derived) {
    const v = JSON.parse(d) as string;
    assert.ok(seed.includes(v), `${d} is not a substring of the seed`);
  }
});

test('operands compose: an arithmetic index, and a destructor inside a destructor', () => {
  const r = world('ab-cd.ef-gh', `
    last(T)  :- s(S), N is str_segs(S, "-"), K is N - 1, T is str_seg(S, "-", K).
    first(T) :- s(S), T is str_seg(S, "-", 0).
    inner(N) :- s(S), N is str_len(str_seg(S, "-", 0)).
    deep(C)  :- s(S), C is str_char(str_seg(str_seg(S, "-", 1), ".", 0), 1).
  `);
  // the index is a VARIABLE bound by a preceding `is`: an expression cannot be
  // written inside the call itself, because the parser's argument list admits
  // terms and not expressions (`str_seg(S, "-", N - 1)` does not parse).
  assert.deepEqual(col(r, 'last(T)', 'T'), ['"gh"']);
  assert.deepEqual(col(r, 'first(T)', 'T'), ['"ab"']);
  assert.deepEqual(col(r, 'inner(N)', 'N'), ['2']);
  assert.deepEqual(col(r, 'deep(C)', 'C'), ['"d"']);
  assert.deepEqual(holes(r), []);
});

test('indices are CODE POINTS: a destructor never returns half a character', () => {
  // Under UTF-16 code units this string is 4 long and `str_char(S, 1)` is a
  // lone high surrogate -- a term that is a substring of nothing a reader
  // would recognise. The emoji is built here rather than typed, so the file
  // itself stays ASCII.
  const seed = `a${String.fromCodePoint(0x1f600)}b`;
  assert.equal(seed.length, 4, 'the host really does count this string as 4 code units');
  const r = world(seed, `
    idx(0). idx(1). idx(2).
    len(N)   :- s(S), N is str_len(S).
    ch(I, C) :- s(S), idx(I), C is str_char(S, I).
  `);
  assert.deepEqual(col(r, 'len(N)', 'N'), ['3']);
  assert.deepEqual(pairs(r, 'ch(I, C)', 'I', 'C'), [
    `0 ${JSON.stringify('a')}`,
    `1 ${JSON.stringify(String.fromCodePoint(0x1f600))}`,
    `2 ${JSON.stringify('b')}`,
  ]);
});

test('the degenerate inputs answer: empty string, absent separator, long separator', () => {
  const r = new Rofl();
  assert.equal(r.assert('e(""). no("abc"). wide("a::b::c").').ok, true);
  assert.equal(r.load(`
    elen(N)  :- e(S), N is str_len(S).
    esegs(N) :- e(S), N is str_segs(S, "-").
    eseg(T)  :- e(S), T is str_seg(S, "-", 0).
    epre(P)  :- e(S), P is str_pre(S, "-").
    nsegs(N) :- no(S), N is str_segs(S, "-").
    nseg(T)  :- no(S), T is str_seg(S, "-", 0).
    npre(P)  :- no(S), P is str_pre(S, "-").
    wsegs(N) :- wide(S), N is str_segs(S, "::").
    wseg(T)  :- wide(S), T is str_seg(S, "::", 1).
  `).ok, true);
  // an empty string has a length, one (empty) segment, and an empty prefix
  assert.deepEqual(col(r, 'elen(N)', 'N'), ['0']);
  assert.deepEqual(col(r, 'esegs(N)', 'N'), ['1']);
  assert.deepEqual(col(r, 'eseg(T)', 'T'), ['""']);
  assert.deepEqual(col(r, 'epre(P)', 'P'), ['""']);
  // A STRING WITH NO SEPARATOR IS ONE SEGMENT, not zero -- the boundary case
  // that turns up in every resolving rule ever written. And it is exactly
  // where `str_pre` and `str_seg(S, Sep, 0)` are allowed to differ: there is
  // no part BEFORE a separator that is not there.
  assert.deepEqual(col(r, 'nsegs(N)', 'N'), ['1']);
  assert.deepEqual(col(r, 'nseg(T)', 'T'), ['"abc"']);
  assert.deepEqual(col(r, 'npre(P)', 'P'), ['""']);
  // A SEPARATOR MAY BE LONGER THAN ONE CHARACTER, and this is the test that
  // says so: the capability is claimed, so it is exercised.
  assert.deepEqual(col(r, 'wsegs(N)', 'N'), ['3']);
  assert.deepEqual(col(r, 'wseg(T)', 'T'), ['"b"']);
  assert.deepEqual(holes(r), []);
});

// ---------------------------------------------------------------------------
// 2. the refusals

test('a refusal SAYS which refusal it is, and the rule it happened in', () => {
  const r = world('a-b', `
    over(C)  :- s(S), C is str_char(S, 9).
    under(C) :- s(S), C is str_char(S, -1).
    far(T)   :- s(S), T is str_seg(S, "-", 7).
  `);
  assert.deepEqual(r.query('over(C)').rows, []);
  assert.deepEqual(holes(r), [
    `$rule(${ruleFor(r, 'far')}) str_index_error`,
    `$rule(${ruleFor(r, 'over')}) str_index_error`,
    `$rule(${ruleFor(r, 'under')}) str_index_error`,
  ].sort());

  const t = new Rofl();
  assert.equal(t.assert('n(7). s("a-b").').ok, true);
  assert.equal(t.load(`
    num(N)  :- n(X), N is str_len(X).
    idxs(C) :- s(S), C is str_char(S, "one").
    sep(N)  :- s(S), N is str_segs(S, 4).
  `).ok, true);
  assert.deepEqual(holes(t), [
    `$rule(${ruleFor(t, 'idxs')}) str_type_error`,
    `$rule(${ruleFor(t, 'num')}) str_type_error`,
    `$rule(${ruleFor(t, 'sep')}) str_type_error`,
  ].sort());

  // A DESTRUCTOR AT THE WRONG WIDTH is a program error and not a different
  // operation: `str_seg` with two arguments is not `str_segs`, and the parser
  // cannot tell them apart because an argument list has no declared arity.
  const w = world('a-b', 'narrow(T) :- s(S), T is str_seg(S, "-").');
  assert.deepEqual(w.query('narrow(T)').rows, []);
  assert.deepEqual(holes(w), [`$rule(${ruleFor(w, 'narrow')}) str_type_error`]);

  // ALL THREE operations that take a separator refuse the empty one, not just
  // the one that happened to be written first.
  const e = new Rofl();
  assert.equal(e.assert('s("a-b").').ok, true);
  assert.equal(e.load(`
    empty(T)  :- s(S), T is str_seg(S, "", 0).
    ecount(N) :- s(S), N is str_segs(S, "").
    epre(P)   :- s(S), P is str_pre(S, "").
  `).ok, true);
  assert.deepEqual(e.query('empty(T)').rows, []);
  assert.deepEqual(holes(e), [
    `$rule(${ruleFor(e, 'ecount')}) str_empty_separator`,
    `$rule(${ruleFor(e, 'empty')}) str_empty_separator`,
    `$rule(${ruleFor(e, 'epre')}) str_empty_separator`,
  ].sort());

  // THE FAR BOUNDARY, one past the last index and not two: `i > len` instead
  // of `i >= len` reads one place off the end, and the host answers
  // `undefined` there, so the operation would return a term built out of
  // nothing at all. "9" and "7" above are comfortably outside and cannot see
  // it; these two sit exactly on the edge.
  const b = new Rofl();
  assert.equal(b.assert('s("a-b").').ok, true);
  assert.equal(b.load(`
    edge_char(C) :- s(S), C is str_char(S, 3).
    edge_seg(T)  :- s(S), T is str_seg(S, "-", 2).
  `).ok, true);
  assert.deepEqual(b.query('edge_char(C)').rows, []);
  assert.deepEqual(b.query('edge_seg(T)').rows, []);
  assert.deepEqual(holes(b), [
    `$rule(${ruleFor(b, 'edge_char')}) str_index_error`,
    `$rule(${ruleFor(b, 'edge_seg')}) str_index_error`,
  ].sort());

  // A rule may READ its own refusal, which is the whole difference between a
  // hole and a log line.
  assert.equal(e.load('why_empty(R) :- hole(_, R).').ok, true);
  assert.deepEqual(col(e, 'why_empty(R)', 'R'), ['str_empty_separator']);
});

test('an ordinary destructor emits NO hole, and the emitter is live in the same store', () => {
  const r = world('a-b-c', `
    idx(0). idx(1).
    fine(T) :- s(S), idx(K), T is str_seg(S, "-", K).
  `);
  assert.deepEqual(col(r, 'fine(T)', 'T'), ['"a"', '"b"']);
  // THE ASSERTION: silence.
  assert.deepEqual(holes(r), []);
  // POSITIVE CONTROL in this same store, because the assertion above is
  // satisfied equally well by an emitter that is switched off.
  assert.equal(r.load('boom(T) :- s(S), T is str_seg(S, "-", 5).').ok, true);
  assert.deepEqual(holes(r), [`$rule(${ruleFor(r, 'boom')}) str_index_error`]);
});

test('an UNBOUND operand is not a refusal, and an explanation walk writes nothing', () => {
  const r = new Rofl();
  assert.equal(r.assert('s("a-b"). k(0). k(1).').ok, true);
  // the builtin stands BEFORE its generator, so its operands are unbound when
  // it is first reached -- the ordinary state of a rule body, and not an error
  assert.equal(r.load('early(T) :- T is str_seg(S, "-", K), s(S), k(K).').ok, true);
  assert.deepEqual(holes(r), []);
  // and a question must not write the store's history either
  assert.equal(r.load('mid(T) :- s(S), T is str_seg(S, "-", 0).').ok, true);
  const before = holes(r);
  assert.deepEqual(before, []);
  assert.ok(r.whynot('mid("zz")').text.length > 0);
  assert.ok(r.why('mid("a")').ok);
  assert.deepEqual(holes(r), before);
});

// ---------------------------------------------------------------------------
// 3. the kernel's own audit

test('every destructor carries a mode, and boot.rofl\'s unmoded[audit] stays empty', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.assert('s("a-b").').ok, true);
  assert.equal(r.load(`
    a(N) :- s(S), N is str_len(S).
    b(C) :- s(S), C is str_char(S, 0).
    c(N) :- s(S), N is str_segs(S, "-").
    d(T) :- s(S), T is str_seg(S, "-", 0).
    e(P) :- s(S), P is str_pre(S, "-").
  `).ok, true);

  // THE ASSERTION
  assert.deepEqual(r.query('unmoded[audit](R)').rows, []);
  // ...and it is not empty for want of input: the audit joins `uses_builtin`
  // against `mode`, and both sides carry all five operations. An audit whose
  // left side were empty would be just as green and would mean nothing.
  assert.deepEqual(col(r, 'uses_builtin(R, B)', 'B').filter((b) => b.includes('str_')),
    ['"str_char"', '"str_len"', '"str_pre"', '"str_seg"', '"str_segs"']);
  assert.deepEqual(col(r, 'mode(B, M)', 'B').filter((b) => b.includes('str_')),
    ['"str_char"', '"str_len"', '"str_pre"', '"str_seg"', '"str_segs"']);
  // the mode is not decoration either: it states the direction the evaluator
  // actually enforces -- inputs bound where the premise stands, output bound
  // by it -- and `str_seg` takes three inputs
  // ALL FIVE mode lists, not one of them: the output position is what the
  // list is FOR, and a table that said `in` everywhere would still satisfy
  // the audit above while telling a reader the opposite of the truth.
  assert.deepEqual(col(r, 'mode(B, M)', 'M').filter((m) => m.startsWith('$cons(out')).sort(), [
    '$cons(out,$cons(in,$cons(in,$cons(in,$nil))))',            // str_seg
    '$cons(out,$cons(in,$cons(in,$nil)))',                      // str_char
    '$cons(out,$cons(in,$cons(in,$nil)))',                      // str_pre
    '$cons(out,$cons(in,$cons(in,$nil)))',                      // str_segs
    '$cons(out,$cons(in,$nil))',                                // str_len
    '$cons(out,$cons(in,$nil))',                                // `is` itself
  ].sort());
  // the reflection records the OPERATION, not only the `is` that carries it
  assert.equal(col(r, 'uses_builtin(R, B)', 'B').filter((b) => b === '"is"').length > 0, true);
  // ...on BOTH sides of the `is`, including the mode violation `str_len(S) is
  // 3`. That premise fails silently, exactly as `X + 1 is 5` has always
  // failed here, and the audit must still be able to see which operation the
  // rule reached for -- otherwise the one rule most likely to be wrong is the
  // one the reflection cannot describe.
  const back = new Rofl();
  assert.equal(back.assert('s("a-b").').ok, true);
  assert.equal(back.load('rev(S) :- s(S), str_len(S) is 3.').ok, true);
  assert.deepEqual(back.query('rev(S)').rows, []);
  assert.deepEqual(col(back, 'uses_builtin(R, B)', 'B'), ['"is"', '"str_len"']);
  // and no other audit of boot.rofl went red on the way
  for (const q of ['malformed[audit](R)', 'breach[audit](R)', 'forged[audit](F)',
                   'undefined_premise[audit](R, Rel)']) {
    assert.deepEqual(r.query(q).rows, [], q);
  }
});

test('the destructor written as a PREMISE is caught, not silently empty', () => {
  // The hazard the spelling creates, and the reason it is safe to live with.
  // `str_seg(S, "-", 0, T)` is not a syntax error: a bare call in a body is a
  // relational literal, so it reads as a premise over a relation nothing
  // populates and the rule is silently empty for ever -- the shape recorded
  // as `contains(S, "404") loads clean` in facts/findings.rofl. boot.rofl
  // already answers it, and this is the measurement that says so rather than
  // the assumption that it must.
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.assert('s("a-b").').ok, true);
  assert.equal(r.load('wrong(T) :- s(S), str_seg(S, "-", 0, T).').ok, true);
  assert.deepEqual(r.query('wrong(T)').rows, []);
  assert.deepEqual(r.query('undefined_premise[audit](R, Rel)').rows
    .map((x) => x.bindings.Rel), ['str_seg']);
  // CONTROL: the right spelling of the same intent is silent there
  const g = new Rofl();
  assert.equal(g.load(BOOT).ok, true);
  assert.equal(g.assert('s("a-b").').ok, true);
  assert.equal(g.load('right(T) :- s(S), T is str_seg(S, "-", 0).').ok, true);
  assert.deepEqual(col(g, 'right(T)', 'T'), ['"a"']);
  assert.deepEqual(g.query('undefined_premise[audit](R, Rel)').rows, []);
});

// ---------------------------------------------------------------------------
// 4. THE FINITENESS TEST, in both directions

/** The recursive splitter: it cuts every string it knows by two separators and
 *  by character, and feeds the pieces back in. Aggressive on purpose. */
const SPLITTER = `
idx(0). idx(1). idx(2). idx(3). idx(4). idx(5). idx(6). idx(7). idx(8). idx(9).
piece("ab-cd.ef-gh").
piece(T) :- piece(S), idx(K), N is str_segs(S, "-"), K < N, T is str_seg(S, "-", K).
piece(T) :- piece(S), idx(K), N is str_segs(S, "."), K < N, T is str_seg(S, ".", K).
piece(C) :- piece(S), idx(I), L is str_len(S), I < L, C is str_char(S, I).
`;
/** The same program with ONE constructor added. */
const CONCAT = 'piece(T) :- piece(S), piece(U), T is str_cat(S, U).\n';

function measured(program: string, budget: number) {
  const r = new Rofl();
  const ok = r.load(program, { budget }).ok;
  return {
    ok,
    terms: r.query('piece(X)').rows.length,
    // the store's own record of the evaluation, not a private field: how many
    // steps this tick actually took, next to the budget it was given
    steps: r.store.evalOf(r.store.tick)!.steps,
    reasons: col(r, 'hole(H, R)', 'R'),
  };
}

test('POSITIVE SIDE: destructors alone reach a fixpoint, and the term count plateaus', () => {
  // ROUND BY ROUND. The same rules staged `@next`, so one tick is one round
  // and the count can be read between them. It grows, then stops growing --
  // which is what "the universe is finite" looks like from inside.
  const r = new Rofl();
  assert.equal(r.load(`
    idx(0). idx(1). idx(2). idx(3). idx(4). idx(5). idx(6). idx(7). idx(8). idx(9).
    piece("ab-cd.ef-gh").
    idx(K)@next   :- idx(K).
    piece(S)@next :- piece(S).
    piece(T)@next :- piece(S), idx(K), N is str_segs(S, "-"), K < N, T is str_seg(S, "-", K).
    piece(T)@next :- piece(S), idx(K), N is str_segs(S, "."), K < N, T is str_seg(S, ".", K).
    piece(C)@next :- piece(S), idx(I), L is str_len(S), I < L, C is str_char(S, I).
  `).ok, true);
  const series: number[] = [];
  for (let t = 0; t < 6; t++) {
    series.push(r.query('piece(X)').rows.length);
    const res = r.tickAdvance({ budget: 500_000 });
    assert.equal(res.partial, false, `tick ${t} ran out of budget`);
  }
  assert.deepEqual(series, [1, 15, 19, 19, 19, 19]);
  assert.deepEqual(holes(r), []);

  // AND THE SAME PROGRAM AS ONE FIXPOINT: it terminates on its own, in 89
  // steps, and the answer does not move when the budget does. That is the
  // difference between "it finished" and "it was stopped".
  const at = [5_000, 10_000, 20_000, 200_000].map((b) => measured(SPLITTER, b));
  assert.deepEqual(at.map((m) => m.terms), [19, 19, 19, 19]);
  assert.deepEqual(at.map((m) => m.steps), [89, 89, 89, 89]);
  assert.deepEqual(at.map((m) => m.reasons), [[], [], [], []]);

  // and every one of the 19 is a substring of the string it started from
  const r2 = new Rofl();
  assert.equal(r2.load(SPLITTER, { budget: 200_000 }).ok, true);
  const seed = 'ab-cd.ef-gh';
  const terms = col(r2, 'piece(X)', 'X').map((x) => JSON.parse(x) as string);
  assert.equal(terms.length, 19);
  for (const t of terms) assert.ok(seed.includes(t), `${JSON.stringify(t)} is not a substring`);
});

test('NEGATIVE SIDE: one concatenation and the count is a property of the BUDGET', () => {
  // The constructor lives here and nowhere else. It is spelled as an ordinary
  // `is`, so the mutant program differs from the program above by one rule and
  // by nothing else -- the same engine, the same fixpoint, the same budget.
  const orig = Evaluation.prototype.evalBuiltin;
  Evaluation.prototype.evalBuiltin = function (
    this: Evaluation, b: { op: string; l: any; r: any }, s: any, ruleId: string | null = null,
  ) {
    if (b.op === 'is' && b.r.k === 'f' && b.r.name === 'str_cat' && b.r.args.length === 2) {
      const l = walk(b.r.args[0], s), rr = walk(b.r.args[1], s);
      if (l.k === 's' && rr.k === 's') return orig.call(this, { op: '=', l: b.l, r: mks(l.v + rr.v) }, s, ruleId);
      return null;
    }
    return orig.call(this, b, s, ruleId);
  } as typeof orig;
  try {
    // CONTROL FIRST: with the patch installed, the destructor-only program is
    // still 19 terms in 89 steps. So what changes below is the extra RULE and
    // not the patch, which would otherwise be an alternative explanation for
    // everything this test reports.
    assert.deepEqual(measured(SPLITTER, 20_000),
      { ok: true, terms: 19, steps: 89, reasons: [] });

    const at = [5_000, 10_000, 20_000].map((b) => measured(SPLITTER + CONCAT, b));
    // it never finishes: every run ends by hitting the wall, one step past it
    assert.deepEqual(at.map((m) => m.steps), [5_001, 10_001, 20_001]);
    assert.deepEqual(at.map((m) => m.reasons),
      [['budget_exhausted'], ['budget_exhausted'], ['budget_exhausted']]);
    // and it says so rather than stopping quietly at a plausible-looking answer
    assert.deepEqual(at.map((m) => m.terms), [2289, 6952, 16397]);
    assert.ok(at[0].terms < at[1].terms && at[1].terms < at[2].terms,
      'more budget, more terms: there is no plateau to reach');
    // the strings it makes are not substrings of anything it was given, which
    // is the property the destructors have and the constructor does not
    const g = new Rofl();
    g.load(SPLITTER + CONCAT, { budget: 5_000 });
    const seed = 'ab-cd.ef-gh';
    const outside = col(g, 'piece(X)', 'X').map((x) => JSON.parse(x) as string)
      .filter((t) => !seed.includes(t));
    assert.ok(outside.length > 0, 'the constructor really did leave the substring universe');
  } finally {
    Evaluation.prototype.evalBuiltin = orig;
  }
});
