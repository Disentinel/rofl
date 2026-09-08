// js-update-and-literals.test.ts — THREE VALUE FORMS THE VOCABULARY NEVER
// NAMED (w_update_and_literals, 2026-09-08), at the four layers that have an
// opinion about them.
//
//   i++  --i     UpdateExpression   a read AND a write of one binding
//   1n           BigIntLiteral      a literal whose value the scanner DROPPED
//   /re/g        RegExpLiteral      the one literal whose value is an OBJECT
//
// THE THREE MEASUREMENTS THIS FILE EXISTS FOR, all taken BEFORE a rule was
// written, on a probe world holding the corpus plus one extra file:
//
//   1. `const b = 1n` reached the store as an `ast_node` fact with ZERO
//      `ast_attr` rows. `BigIntLiteral.value` is a native `bigint`, which
//      matched none of the four branches in scanners/js_ast.ts — not a node,
//      not an array, not a string/number/boolean, not a nested object — so it
//      fell through all of them and emitted nothing at all. It is the only
//      literal in JavaScript whose value that file dropped, while its own
//      contract line says `every scalar own property`.
//
//   2. `/x[0-9]/.test(s)`, `MATCHER.test(s)` and `255n.toString(16)` were all
//      `unresolved_call` with `prototype_of[flow]` EMPTY, so
//      `stdlib_member[audit]` — the relation whose whole job is to collect
//      exactly this residue — could not see them. It stood at three rows,
//      naming a template and two arrays.
//
//   3. On the ONE C-style `for` the corpus already contained
//      (alpha.mjs:845, `for (let j = 0; j < 2; j += 1)`) `guard_arm[code]`
//      named the BODY and nothing else, and `guarded[code]` was empty for the
//      `j += 1`. The model positively asserted that a for-update runs, and
//      `for (i = 0; i < 0; i++)` runs it zero times.
//
// EVERY ORACLE BELOW IS A NAMED SET OR AN IDENTITY, and where a set spans a
// table other items also write to, the assertion is filtered to the rows this
// item owns — a subset that is exact, rather than a whole that another branch
// can legitimately grow (f_a_ledger_keyed_by_name_merges_and_a_pin_keyed_by_
// nothing_does_not).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import { build, base, read, FILES, FACTS, RULES, unq, type Mut, type World } from './js-corpus-world.ts';

// ===========================================================================
// HELPERS

/** `stdlib_member[audit]` restricted to the two prototypes this item added,
 *  as `prototype.key@file:line` — a named set, and one no other item writes. */
const residue = (w: World): string[] => {
  // MULTIPLICITY RATHER THAN LINE NUMBERS, for the reason given at `byName`
  // below: `regexp.test` is TWO rows because two arms reach the same site, and
  // that is what the pair used to say by repeating a line number.
  const tally = new Map<string, number>();
  for (const [, p, k] of w.q('stdlib_member[audit](C, P, Key)')
      .filter(([, p]) => p === 'regexp' || p === 'bigint'))
    tally.set(`${p}.${k}`, (tally.get(`${p}.${k}`) ?? 0) + 1);
  return [...tally].map(([n, c]) => (c === 1 ? n : `${n} x${c}`)).sort();
};

/** every expression the value layer says may be the fixture's bigint, named by
 *  the identifier it is written as (or by its own kind when it is the literal) */
/** A NAME WITH ITS MULTIPLICITY, NOT A NAME WITH ITS LINE. These sets keyed on
 *  `name@file:line` until 2026-09-08, and the line is the part that broke: a
 *  parallel branch appended a fixture EARLIER in shapes.ts.txt and every one of
 *  them moved by 38, all at once, while every claim they make stayed true.
 *
 *  A THIRD WAY A PIN CAN FAIL TO SURVIVE A MERGE, beside a count and a scope. A
 *  named set is safe because the names are stable; a set whose ELEMENTS embed a
 *  coordinate is a count in disguise, and the coordinate belongs to the whole
 *  file rather than to the thing named. What the line was carrying here is
 *  `BIG_TOTAL appears twice` — the declaration and the use — and multiplicity
 *  says that without borrowing anybody else's line numbering. */
const byName = (w: World, rows: string[][]): string[] => {
  const tally = new Map<string, number>();
  for (const [e] of rows) {
    const name = w.q(`ast_name[code](${e}, N)`)[0]?.[0];
    const k = w.q(`ast_node[code](${e}, K, F, L)`)[0]?.[0];
    const key = String(name ?? k);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return [...tally].map(([n, c]) => (c === 1 ? n : `${n} x${c}`)).sort();
};

const bigCarriers = (w: World): string[] =>
  byName(w, w.q('may_be_lit[flow](E, "9007199254740993")'));

/** every expression the value layer gives the `regexp` prototype, named the
 *  same way — the two arms of `prototype_of[flow]` reach different ones */
const regexpReceivers = (w: World): string[] =>
  byName(w, w.q('prototype_of[flow](E, regexp)'));

/** the `update` child of every C-style `for` in the corpus, and whether the
 *  control-flow layer says it may be skipped */
const forUpdates = (w: World): string[] =>
  w.q('ast_node[code](P, for_statement, F, L)')
    .flatMap(([p, f]) => w.q(`ast_child[code](${p}, update, 0, U)`)
      .map(([u]) => {
        // BY THE VARIABLE IT BUMPS, NOT BY THE LINE IT SITS ON. This read
        // `${f}:${l}` until 2026-09-08, when a parallel branch appended a
        // fixture EARLIER in shapes.ts.txt and moved all three by 38 while every
        // claim they make stayed true. See `byName` for the general form.
        // TWO SHAPES, because a `for`-update is `i++` OR `i += 1`: an
        // `update_expression` keeps its operand under `argument` and an
        // `assignment_expression` under `left`. The first draft read only
        // `argument` and two of the four came back `?`.
        const v = ['argument', 'left']
          .flatMap((field) => w.q(`ast_child[code](${u}, ${field}, 0, A)`))
          .flatMap(([a]) => w.q(`ast_name[code](${a}, N)`).map(([n]) => n))[0];
        return `${f} ${v ?? '?'} ${w.n(`guarded[code](${u})`) > 0 ? 'guarded' : 'RUNS'}`;
      }))
    .sort();

/** the functions `may_not_run` names, by name (js-corpus-world's `names`
 *  rebuilt here so the filter below can be applied to a mutant world too) */
const dead = (w: World): Set<string> => new Set(w.q('may_not_run[code](F)')
  .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));

const mut = (find: string, replace: string, file: string): Mut[] => [{ find, replace, file }];
const DF = 'rules/js-dataflow.rofl';
const CF = 'rules/js-controlflow.rofl';

// ===========================================================================
// 1. THE SCANNER — the fourth scalar, and the hole nothing could have reported.

test('SCANNER: a bigint is a scalar own property, and it was the one the four branches missed', () => {
  const facts = scan('const b = 1n; const big = 9007199254740993n;', { file: 'bi.mjs' }).facts;
  const attrs = facts.filter((f) => f.startsWith('ast_attr') && f.includes(', value, '));
  assert.deepEqual(attrs.map((f) => f.replace(/^.*, value, /, '').replace(/\)\.$/, '')),
    ['"1"', '"9007199254740993"'],
    'both bigint literals carry their decimal value, quoted like any other number the grammar cannot spell');

  // WHERE THIS CHECK COULD NOT LOOK, asked of the assertion rather than of the
  // fix: a DROPPED attribute and a node that never had one are the same
  // picture, so no audit in this repository could have reported the defect.
  // The only instrument that can is a scan whose expected output is written
  // down. `numeric_literal` is the control — its value was never dropped, so
  // an assertion that passes on both says nothing.
  const num = scan('const n = 1;', { file: 'n.mjs' }).facts;
  assert.ok(num.some((f) => /, value, 1\)\.$/.test(f)), 'positive control: a number is bare');

  // ...and the SHAPE of the term is the choice, stated: `1n` and the string
  // `"1"` are the same term here. The alternative collides with the NUMBER 1,
  // and `1n !== 1` is the distinction JavaScript enforces.
  const str = scan('const s = "1";', { file: 's.mjs' }).facts;
  assert.ok(str.some((f) => /, value, "1"\)\.$/.test(f)), 'the declared collision, exercised');
});

// ===========================================================================
// 2. DATAFLOW — a bigint is a literal, a regexp is a node.

test('DATAFLOW: the bigint travels through the binder, and dropping either half empties it', () => {
  const b = base();
  // THE NAMED SET: the literal itself and both identifier occurrences of the
  // name it is bound to. Three rows, and the two identifiers are what says the
  // value crossed `binder[code]` rather than sitting on the literal.
  assert.deepEqual(bigCarriers(b), [
    'BIG_TOTAL x2', 'big_int_literal',
  ]);

  // MUTANT 1 — the rule half. `literal_kind(big_int_literal)` removed: the
  // scanner still records the value and nothing reads it.
  const m1 = build(mut('literal_kind(big_int_literal).', '', DF), false);
  assert.deepEqual(bigCarriers(m1), [], 'no literal kind, no value');

  // MUTANT 2 — the SCANNER half, and it needs a world the pack mutation cannot
  // build: the rule stays and the facts lose the attribute, which is exactly
  // the store as it stood before scanners/js_ast.ts learned the fourth scalar.
  assert.deepEqual(bigCarriers(withoutBigintValues()), [],
    'the rule alone derives nothing — the two halves are independent and both are load-bearing');
});

test('DATAFLOW: a regexp literal is a NODE value, and the two prototype arms reach different receivers', () => {
  const b = base();
  // BOTH ARMS, NAMED. `MATCHER` is reached only through `may_be_node` (binder
  // -> the literal node -> its kind); the inline `/x[0-9]/` is reached by the
  // KIND arm alone. The two regexp literals themselves are in the set through
  // the kind arm as well, which is why there are four rows and not two.
  assert.deepEqual(regexpReceivers(b), [
    'MATCHER x2', 'reg_exp_literal x2',
  ]);

  // MUTANT 3 — `node_value_kind(reg_exp_literal)` removed. The KIND arm still
  // answers, so the literals stay and the NAME goes: this is the mutant that
  // separates the value arm from the kind arm, and a count would have called
  // it the same defect as mutant 4.
  const m3 = build(mut('node_value_kind(reg_exp_literal).', '', DF), false);
  assert.deepEqual(regexpReceivers(m3), [
    'reg_exp_literal x2',
  ], 'the two identifier occurrences of MATCHER are the only rows lost');

  // MUTANT 4 — `kind_prototype(reg_exp_literal, regexp)` removed. Both arms
  // read that table, so everything goes.
  const m4 = build(mut('kind_prototype(reg_exp_literal,           regexp).', '', DF), false);
  assert.deepEqual(regexpReceivers(m4), []);
});

// ===========================================================================
// 3. CALLGRAPH — the residue, named rather than resolved.

test('CALLGRAPH: three member calls on a literal are named by stdlib_member, and four mutants take them', () => {
  const b = base();
  // THE ANSWER TO THE QUESTION THE ITEM ASKED. A regexp literal resolves
  // NOTHING — every one of these is still an `unresolved_call`, because the
  // method is not a node in this program. What changed is that the model can
  // now SAY SO, at the one place it collects the standard library.
  assert.deepEqual(residue(b), [
    'bigint.toString', 'regexp.test x2',
  ]);
  for (const [c] of b.q('stdlib_member[audit](C, P, Key)'))
    assert.equal(b.n(`resolved_site[code](${c})`), 0, 'residue is residue: none of them resolves');

  // MUTANT 5 — the regexp prototype row. Both regexp rows go, the bigint stays.
  const m5 = build(mut('kind_prototype(reg_exp_literal,           regexp).', '', DF), false);
  assert.deepEqual(residue(m5), ['bigint.toString']);

  // MUTANT 6 — the bigint prototype row, the other way round.
  const m6 = build(mut('kind_prototype(big_int_literal,           bigint).', '', DF), false);
  assert.deepEqual(residue(m6), ['regexp.test x2']);

  // MUTANT 7 — `builtin_prototype(regexp)`. The SAME rows disappear as in
  // mutant 5 and for a different reason, so the two are told apart by what
  // SURVIVES: `prototype_of` still names all four receivers here and names
  // none of them there. Without this second oracle the two mutants are one.
  const m7 = build(mut('builtin_prototype(regexp).', '', DF), false);
  assert.deepEqual(residue(m7), ['bigint.toString']);
  assert.deepEqual(regexpReceivers(m7), ['MATCHER x2', 'reg_exp_literal x2'],
    'the prototype is still derived; only the audit stops reading it');

  // MUTANT 8 — `builtin_prototype(bigint)`, the same shape on the other row.
  const m8 = build(mut('builtin_prototype(bigint).', '', DF), false);
  assert.deepEqual(residue(m8), ['regexp.test x2']);
});

// ===========================================================================
// 4. CONTROLFLOW — the arm that was never on the table.

test('CONTROLFLOW: a for-update may be skipped, and the model said it runs', () => {
  const b = base();
  // BOTH C-STYLE `for`s IN THE CORPUS, NAMED. alpha.mjs:845 predates this item
  // entirely — it is the site the defect was measured on, and it is the
  // positive control that the row is not a fixture answering itself.
  assert.deepEqual(forUpdates(b), ['alpha.mjs j guarded', 'shapes.ts k guarded',
    'shapes.ts m guarded', 'shapes.ts p guarded']);

  // AND THE CONSEQUENCE, which is why the row is worth writing: a call in the
  // update slot was `reached_unguarded` and therefore kept OUT of
  // `may_not_run`. `bumpedInUpdate` is called from a for-update and nowhere
  // else; `seenUpdate` is called from a for-BODY and nowhere else, and it is
  // the control — the body arm has always been on the table, so its membership
  // must not move.
  assert.equal(dead(b).has('bumpedInUpdate'), true);
  assert.equal(dead(b).has('seenUpdate'), true, 'control: the body arm already worked');

  // MUTANT 9 — the row deleted. The update slots go back to `RUNS` and the
  // function called from one leaves the may-set, while the body control stays.
  const m9 = build(mut('guard_kind(for_statement,              update).', '', CF), false);
  assert.deepEqual(forUpdates(m9), ['alpha.mjs j RUNS', 'shapes.ts k RUNS', 'shapes.ts m RUNS',
     'shapes.ts p RUNS']);
  assert.equal(dead(m9).has('bumpedInUpdate'), false, 'the defect, reproduced');
  assert.equal(dead(m9).has('seenUpdate'), true, 'and the control is untouched by it');

  // MUTANT 10 — the row AIMED AT THE WRONG FIELD. `init` always runs, so
  // guarding it is a false claim in the direction this layer calls dangerous;
  // deleting the row and mis-aiming it are different defects and a count of
  // `guarded` would not tell them apart, so the oracle reads the FIELD.
  const m10 = build(mut('guard_kind(for_statement,              update).',
    'guard_kind(for_statement,              init).', CF), false);
  assert.deepEqual(forUpdates(m10), ['alpha.mjs j RUNS', 'shapes.ts k RUNS', 'shapes.ts m RUNS',
     'shapes.ts p RUNS']);
  const inits = m10.q('ast_node[code](P, for_statement, F, L)')
    .flatMap(([p]) => m10.q(`ast_child[code](${p}, init, 0, I)`).map(([i]) => m10.n(`guarded[code](${i})`)));
  assert.deepEqual(inits, [1, 1, 1, 1], 'the mis-aimed row guards the one child that always runs');
});

// ===========================================================================
// 5. THE VERDICTS — every cell this item closed, and what closing it costs.

test('MATRIX: ten cells answered, two handed on, and the waivers are the ones the measurement earned', () => {
  const b = base();
  const verdicts = (k: string): string[] =>
    b.q(`verdict[audit](js, ${k}, L, V)`).map(([l, v]) => `${l}=${v}`).sort();

  // THE CALLGRAPH CELLS ARE NOT WAIVED. `big_int_literal` and `reg_exp_literal`
  // read `not_modelled` there on purpose: naming the residue is not resolving
  // it, and facts/worklist.rofl re-points those two claims at
  // `w_env_api_surface`. An `ignored` would have been a blocker wearing a
  // waiver's face — see f_a_guard_becomes_falsifiable_when_another_item_lands.
  assert.deepEqual(verdicts('update_expression'),
    ['callgraph=waived', 'controlflow=waived', 'dataflow=waived', 'modules=waived']);
  assert.deepEqual(verdicts('big_int_literal'),
    ['callgraph=not_modelled', 'controlflow=waived', 'dataflow=modelled', 'modules=waived']);
  assert.deepEqual(verdicts('reg_exp_literal'),
    ['callgraph=not_modelled', 'controlflow=waived', 'dataflow=modelled', 'modules=waived']);

  // MUTANT 11 — a verdict removed. The cell must reopen; a verdict nothing
  // reads is a row that cannot go red.
  const m11 = build(mut('ignored(js, update_expression, dataflow, a_a_computed_primitive_and_a_write_with_no_value).',
    '', 'facts/js-dataflow.rofl'), false);
  assert.deepEqual(m11.q('verdict[audit](js, update_expression, dataflow, V)').flat(), ['not_modelled']);

  // ...AND THE WAIVERS ARE MEASURED RATHER THAN ASSERTED. `a_no_control_transfer`
  // says the FORM transfers nothing, and the three tables that decide what this
  // layer thinks does transfer control name none of the three kinds — with a
  // positive control on each, because an empty answer is a fact about the query.
  for (const rel of ['transfer_mechanism(K, M)', 'guard_kind(K, F)', 'abrupt_kind(K)']) {
    const kinds = new Set(b.q(rel).map(([k]) => k));
    assert.ok(kinds.size > 3, `positive control: ${rel} is populated`);
    for (const k of ['update_expression', 'big_int_literal', 'reg_exp_literal'])
      assert.equal(kinds.has(k), false, `${rel} must not name ${k}`);
  }

  // ...and `a_not_a_module_construct` the same way: a module specifier is a
  // STRING literal and nothing else, so a bigint in that position is a syntax
  // error rather than a module nobody resolved.
  const srcKinds = new Set(b.q('ast_child[code](P, source, 0, S)')
    .flatMap(([, s]) => b.q(`ast_node[code](${s}, K, F, L)`).map(([k]) => k)));
  // TWO KINDS AND THE SECOND IS THE MODEL'S ONE IRREDUCIBLE CELL:
  // `import(pathVar)` at shapes.ts:180 carries an IDENTIFIER source, which
  // `unknown_because(js, import_expression, modules, runtime_dependent)` has
  // named since the vocabulary was written. Neither is a number of any width.
  assert.deepEqual([...srcKinds].sort(), ['identifier', 'string_literal']);
});

// ===========================================================================
// 6. WHERE THESE CHECKS ARE STRUCTURALLY UNABLE TO LOOK.
//
// The eleven mutants above all die, which is a statement about the mutant set
// and not about the gates. These three were built by asking the other question
// — where can the check not look — and two of them survive. Both survivors are
// asserted rather than described, so a future change that makes one of them
// bite goes red here instead of passing quietly.

test('SURVIVORS: two mis-classifications this model cannot feel, and one that needed a site', () => {
  const b = base();

  // SURVIVOR A — `reg_exp_literal` added to `literal_kind` as WELL as to
  // `node_value_kind`. That is a false claim: a regexp evaluates to an object,
  // not to a text. `may_be_lit` does not move by a single row, and the reason
  // is the SCANNER rather than the rule — a `RegExpLiteral` carries `pattern`
  // and `flags` and no `value` attribute at all, so `ast_value[code]` cannot
  // fire for it whatever the kind table says. UNKILLABLE BY THE FACT
  // VOCABULARY: the guard is a premise that cannot be populated. It becomes
  // killable the day the scanner records a regexp's text, which is exactly the
  // shape f_the_contract_excluded_one_property_in_the_whole_language warns
  // about, so the equality below is a tripwire and not a decoration.
  const sA = build(mut('literal_kind(big_int_literal).',
    'literal_kind(big_int_literal).\nliteral_kind(reg_exp_literal).', DF), false);
  assert.equal(sA.n('may_be_lit[flow](E, V)'), b.n('may_be_lit[flow](E, V)'),
    'a regexp in literal_kind derives nothing, because it has no value attribute');
  assert.equal(b.n('ast_attr[code](N, pattern, P)') > 0, true, 'positive control: it has OTHER attributes');

  // SURVIVOR B — `big_int_literal` added to `node_value_kind`, which says a
  // bigint has OBJECT IDENTITY. It does not. The mutation is visible in the
  // raw relation and changes NO ANSWER: `may_be_node` grows by exactly the
  // bigint literals and `calls_in`, `resolves` and `stdlib_member` are
  // byte-identical, because nothing downstream asks a primitive for a member.
  // PARTIALLY SURVIVING, and the half that survives is the half that matters —
  // a wrong row in this table is only felt where a member is looked up.
  const sB = build(mut('node_value_kind(reg_exp_literal).',
    'node_value_kind(reg_exp_literal).\nnode_value_kind(big_int_literal).', DF), false);
  assert.equal(sB.n('may_be_node[flow](E, N)'), b.n('may_be_node[flow](E, N)') + 4,
    'the four bigint literals arrive as object identities');
  assert.equal(sB.n('calls_in[code](F, A, B)'), b.n('calls_in[code](F, A, B)'));
  assert.deepEqual(residue(sB), residue(b), 'and not one answer moves');

  // MUTANT 12 — `guard_kind(for_statement, test)`, the row somebody would
  // plausibly add beside the right one. It is FALSE: a `for`'s test runs at
  // least once whenever its init completes. IT SURVIVED THE FIRST TIME for
  // want of a site — measured, `guarded` went 385 -> 394 and `may_not_run` and
  // `guarded_call` did not move, because no `for` in the corpus called
  // anything in its test — so the fixture gained `readLimit`, and it dies now.
  assert.equal(dead(b).has('readLimit'), false,
    'the correct row does not over-guard: a for-test always runs');
  const m12 = build(mut('guard_kind(for_statement,              update).',
    'guard_kind(for_statement,              update).\nguard_kind(for_statement,              test).', CF), false);
  assert.equal(dead(m12).has('readLimit'), true, 'the false row makes a live function maybe-dead');
});

// ===========================================================================
// THE WORLD MUTANT 2 NEEDS. `build()` mutates PACK TEXT, and the defect this
// one reproduces is in the FACTS: the store as it stood while the scanner
// dropped a bigint's value. Everything else is js-corpus-world's construction,
// one load with the facts last.

function withoutBigintValues(): World {
  const r = new Rofl();
  const packs = ['boot.rofl', ...FACTS, 'facts/js-controlflow.rofl', ...RULES].map(read);
  const res = r.load(packs.join('\n'));
  assert.ok(res.ok, `packs REJECTED:\n${res.diagnostics.slice(0, 4).join('\n')}`);
  let dropped = 0;
  for (const [logical, disk] of FILES) {
    const sc = scan(read(disk), { file: logical });
    // the bigint nodes, by id, then their `value` attribute and nothing else
    const bigIds = new Set(sc.facts
      .filter((f) => f.startsWith('ast_node[code](') && f.includes(', big_int_literal,'))
      .map((f) => f.slice(f.indexOf('(') + 1, f.indexOf(','))));
    const facts = sc.facts.filter((f) => {
      const m = /^ast_attr\[code\]\((\w+), value, /.exec(f);
      if (m && bigIds.has(m[1])) { dropped++; return false; }
      return true;
    });
    const ar = r.assert(facts.join('\n'));
    assert.ok(ar.ok, `${logical} facts REJECTED:\n${ar.diagnostics.slice(0, 4).join('\n')}`);
  }
  assert.equal(dropped, 2, 'the mutation applied: both bigint values withheld');
  r.evaluate(20_000_000);
  const q = (lit: string): string[][] => {
    const qr = r.query(lit);
    assert.equal(qr.error, undefined, `query ${lit}: ${qr.error}`);
    assert.equal(qr.partial, false, `query ${lit} hit a budget`);
    // ...AND THE THIRD FIELD, added 2026-09-08 when the derived gate in
    // test/query-unpopulatable.test.ts named this file. It matters MORE here
    // than in a shared world, not less: this construction exists to WITHHOLD
    // facts, so the answer it is asked for is expected to be empty, and an
    // empty answer from a misspelt relation is the same picture. `unpopulatable`
    // is the kernel separating `nothing derived` from `nothing here could`.
    assert.equal(qr.unpopulatable, false,
      `query ${lit}: nothing in this world can populate it`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((mm) => mm[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return qr.rows.map((row) => order.map((v) => unq(row.bindings[v] ?? '')));
  };
  return { q, n: (l) => q(l).length };
}
