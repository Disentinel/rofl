// js-directives.test.ts — THREE KINDS THAT ARE NOT STATEMENTS (w_directives,
// 2026-09-08), at the four layers, plus the era table that grades them.
//
//   'use strict'          Directive + DirectiveLiteral, in a `directives` ARRAY
//   #!/usr/bin/env node   InterpreterDirective, on the Program's `interpreter`
//
// THE ITEM EXPECTED THE SCANNER TO BE DROPPING THEM and it is not. babel hangs
// a directive prologue off a field of its own rather than putting it in `body`,
// and scanners/js_ast.ts walks every own property of every node, so all three
// arrive with their values intact. That is the first measurement in this file
// and it is the one that decided everything after it: the twelve cells are
// about what the MODEL does with facts it has, not about facts it lacks.
//
// FIVE THINGS MEASURED HERE THAT NO OTHER FILE ASKS:
//
//   1. `slot_atom` over the reified rule bodies: every js rule pack together names 52
//      node kinds and read 34 `ast_child` fields, and none of the three kinds
//      and neither of the two fields is among them. One negative over the whole
//      model, with a positive control on each half, standing in for twelve
//      empty membership queries that would each have proved nothing.
//
//   2. `abrupt_kind(directive)` — the most aggressive false claim the control
//      layer can make about it — moves NOTHING, because `abrupt_at` wants a
//      node at an index of a `stmt_seq_field` and a directive is not in one.
//      The model cannot put a directive in statement order at all.
//
//   3. ...while `guard_kind(directive, value)` moves `guarded` 428 -> 431. So
//      the layer is not blind to the node and the waiver is a decision.
//
//   4. `literal_kind(directive_literal)` DOES derive three `may_be_lit` rows —
//      the first draft of the fact pack said it derived none — and no answer
//      anywhere moves. A value with no consumer, not a value the model cannot
//      compute.
//
//   5. THE ERA TABLE IS WRONG ABOUT THE HASHBANG AND CANNOT BE RIGHT. `#!` is
//      the ES2023 Hashbang Grammar; `kind_baseline(js, interpreter_directive)`
//      says every environment down to es5 takes it, and stating the true year
//      instead makes the feature `feature_unreachable[audit]` because the scale
//      stops at ts5/2022. Both halves are asserted so the day an `es2023`
//      arrives, this goes red.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import { build, base, read, FILES, FACTS, RULES, unq, type Mut, type World } from './js-corpus-world.ts';

const DF = 'rules/js-dataflow.rofl';
const CF = 'rules/js-controlflow.rofl';
const KINDS = ['directive', 'directive_literal', 'interpreter_directive'] as const;

// ===========================================================================
// HELPERS

/** a query interface over a hand-built world, same shape as js-corpus-world's */
function asker(r: Rofl) {
  return (lit: string): string[][] => {
    const res = r.query(lit);
    assert.equal(res.error, undefined, `query ${lit}: ${res.error}`);
    assert.equal(res.partial, false, `query ${lit} hit a budget`);
    assert.equal(res.unpopulatable, false, `query ${lit}: nothing here can populate it`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return res.rows.map((row) => order.map((v) => unq(row.bindings[v] ?? '')));
  };
}

/** THE MATRIX WORLD — the fact packs and rules/js-model.rofl, with NO ast facts.
 *  `verdict[audit]` reads `node_kind`, `layer`, `handled` and `ignored` and
 *  nothing else, so a cell's verdict costs no fixpoint over the corpus. */
function matrix(mut?: [string, string, string]) {
  const r = new Rofl();
  const packs = ['boot.rofl', ...FACTS, 'facts/js-controlflow.rofl',
    'rules/js-structure.rofl', 'rules/js-model.rofl'].map((f) => {
    let t = read(f);
    if (mut && mut[0] === f) {
      assert.ok(t.includes(mut[1]), `mutation anchor absent in ${f}: ${mut[1]}`);
      t = t.replace(mut[1], mut[2]);
    }
    return t;
  });
  const res = r.load(packs.join('\n'));
  assert.ok(res.ok, `packs REJECTED:\n${res.diagnostics.slice(0, 4).join('\n')}`);
  r.evaluate(20_000_000);
  return asker(r);
}

/** THE MODULES WORLD, built by hand for the same reason w_labelled_control had
 *  to: test/js-corpus-world.ts does not load rules/js-modules.rofl, and the
 *  relations the modules waiver is measured against are not in that world at
 *  all — asking there would be an empty answer from a query that cannot speak. */
function modulesWorld() {
  const r = new Rofl();
  const packs = ['boot.rofl', ...FACTS, 'facts/js-controlflow.rofl', ...RULES,
    'rules/js-modules.rofl'].map(read);
  const res = r.load(packs.join('\n'));
  assert.ok(res.ok, `packs REJECTED:\n${res.diagnostics.slice(0, 4).join('\n')}`);
  for (const [logical, disk] of FILES) {
    const ar = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(ar.ok, `${logical} REJECTED:\n${ar.diagnostics.slice(0, 4).join('\n')}`);
  }
  r.evaluate(20_000_000);
  return asker(r);
}

/** THE REIFIED-RULES WORLD — every js rule pack plus rules/js-vocabulary.rofl,
 *  which is the file that reads the kernel's own reification of rule bodies.
 *  No ast facts: the question is what the RULES name, not what the corpus has. */
function ruleWorld() {
  const r = new Rofl();
  const packs = ['boot.rofl', ...FACTS, 'facts/js-controlflow.rofl', 'facts/js-env.rofl',
    ...RULES, 'rules/js-modules.rofl', 'rules/js-env.rofl', 'rules/js-vocabulary.rofl']
    .map(read);
  const res = r.load(packs.join('\n'));
  assert.ok(res.ok, `packs REJECTED:\n${res.diagnostics.slice(0, 4).join('\n')}`);
  r.evaluate(20_000_000);
  return asker(r);
}

/** THE ERA WORLD, the same construction test/js-env.test.ts uses — its own
 *  corpus, which is separate from test/fixtures/js-call on purpose — plus any
 *  extra source this file wants graded. */
const ERA: [string, string][] = [
  ['era.js', 'test/fixtures/js-env/era.js.txt'],
  ['era.ts', 'test/fixtures/js-env/era.ts.txt'],
  ['era-position.js', 'test/fixtures/js-env/era-position.js.txt'],
  ['era-fields.js', 'test/fixtures/js-env/era-fields.js.txt'],
];
function eraWorld(extra: [string, string][] = [], mut?: [string, string]) {
  const r = new Rofl();
  assert.ok(r.load(read('boot.rofl')).ok);
  for (const [logical, disk] of ERA) r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
  for (const [logical, src] of extra) {
    const sc = scan(src, { file: logical });
    assert.ok(!sc.facts.some((f) => f.startsWith('ast_parse_error')), `${logical} refused`);
    assert.ok(r.assert(sc.facts.join('\n')).ok);
  }
  for (const f of ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
                   'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-env.rofl']) {
    let t = read(f);
    if (mut && f === 'facts/js-env.rofl') {
      assert.ok(t.includes(mut[0]), `era mutation anchor absent: ${mut[0]}`);
      t = t.replace(mut[0], mut[1]);
    }
    assert.ok(r.load(t).ok, `${f} REJECTED`);
  }
  assert.ok(r.load([read('rules/js-structure.rofl'), read('rules/js-env.rofl')].join('\n')).ok);
  r.evaluate(20_000_000);
  return asker(r);
}

/** every directive node in the corpus, as `file kind` with its MULTIPLICITY —
 *  never a line, for the reason f_a_set_whose_elements_embed_a_coordinate_is_a_
 *  count_in_disguise gives: a branch appending a fixture earlier in a file
 *  would move every element of a line-keyed set at once. */
const directiveNodes = (w: World): string[] => {
  const tally = new Map<string, number>();
  for (const [, k, f] of w.q('ast_node[code](N, K, F, L)')
      .filter(([, k]) => (KINDS as readonly string[]).includes(k)))
    tally.set(`${f} ${k}`, (tally.get(`${f} ${k}`) ?? 0) + 1);
  return [...tally].map(([n, c]) => (c === 1 ? n : `${n} x${c}`)).sort();
};

const ids = (w: World): Set<string> => new Set(w.q('ast_node[code](N, K, F, L)')
  .filter(([, k]) => (KINDS as readonly string[]).includes(k)).map(([n]) => n));

const mut = (find: string, replace: string, file: string): Mut[] => [{ find, replace, file }];

// ===========================================================================
// 1. THE SCANNER — what babel emits and where it hangs it.

test('SCANNER: all three kinds arrive, off fields nothing else uses', () => {
  const src = "#!/usr/bin/env node\n'use strict';\nfunction f() {\n  'use strict';\n  return 1;\n}\n";
  const facts = scan(src, { file: 'p.mjs' }).facts;

  // THE NODES, by kind. Two directives — one on the Program, one on the
  // function body — one hashbang, and a `directive_literal` under each
  // directive. `return_statement` is the control: an ordinary statement is
  // emitted by the same walk in the same run.
  const kinds = facts.filter((f) => f.startsWith('ast_node'))
    .map((f) => f.replace(/^ast_node\[code\]\(\w+, (\w+),.*$/, '$1')).sort();
  assert.deepEqual(kinds.filter((k) => k.includes('directive')),
    ['directive', 'directive', 'directive_literal', 'directive_literal', 'interpreter_directive']);
  assert.equal(kinds.includes('return_statement'), true, 'positive control: the walk ran');

  // THE FIELDS, which are the whole reason these kinds are not statements. A
  // directive is at an index of `directives`; the hashbang is at `interpreter`.
  const fields = facts.filter((f) => f.startsWith('ast_child'))
    .map((f) => f.replace(/^ast_child\[code\]\(\w+, (\w+), (\d+), \w+\)\.$/, '$1[$2]'));
  assert.equal(fields.filter((f) => f.startsWith('directives[')).length, 2);
  assert.equal(fields.includes('interpreter[0]'), true);
  assert.equal(fields.includes('body[0]'), true, 'positive control: `body` is populated too');

  // AND THE VALUES ARE ON THE STORE. Nothing was dropped, which is what the
  // item was written to find out.
  const values = facts.filter((f) => /, value, /.test(f))
    .map((f) => f.replace(/^.*, value, (.*)\)\.$/, '$1')).sort();
  assert.deepEqual(values.filter((v) => v.includes('use') || v.includes('env')),
    ['"/usr/bin/env node"', '"use strict"', '"use strict"']);
});

test('SCANNER: a directive is a POSITION, not a string — four negatives and one positive', () => {
  const kindsOf = (src: string) => new Set(scan(src, { file: 'p.ts' }).kinds);
  // POSITIVE FIRST, so the four negatives below are not a broken query: the
  // head of a FUNCTION body is a directive.
  assert.equal(kindsOf("function f() { 'use strict'; return 1; }").has('directive'), true);
  // ...and any string there is one. The language gives `'use strict'` a
  // meaning; the GRAMMAR gives every leading string a Directive node, which is
  // why no rule in this model may key on the text.
  assert.equal(kindsOf("function f() { 'use rofl'; return 1; }").has('directive'), true);

  for (const [why, src] of [
    ['a bare block', "{ 'use strict'; }"],
    ['an if block', "if (1) { 'use strict'; }"],
    ['after any other statement', "function f() { const a = 1; 'use strict'; return a; }"],
    ['a string in expression position', "const s = 'use strict';"],
  ] as [string, string][]) {
    const k = kindsOf(src);
    assert.equal(k.has('directive'), false, `${why} must not make a directive`);
    assert.equal(k.has('string_literal') || k.has('expression_statement'), true,
      `${why}: positive control — the string is still in the tree`);
  }
});

test('SCANNER: a hashbang on line 2 does not fail to appear, it DELETES the file', () => {
  // THE SAME MECHANISM `with` HAS, and it is why the hashbang fixture had to go
  // at the top of a file rather than being appended to one: a refused file
  // leaves the corpus entirely — 2 432 nodes went that way once already
  // (f_a_stray_merge_marker_deleted_a_fixture_and_a_hundred_tests_lied).
  const late = scan("const a = 1;\n#!/usr/bin/env node\n", { file: 'p.mjs' });
  assert.equal(late.nodes, 0);
  assert.deepEqual(late.facts.map((f) => f.replace(/, ".*$/, '')),
    ['ast_parse_error[code]("p.mjs"']);
  const first = scan("#!/usr/bin/env node\nconst a = 1;\n", { file: 'p.mjs' });
  assert.equal(first.kinds.has('interpreter_directive'), true, 'positive control: line 1 is fine');
});

// ===========================================================================
// 2. NO RULE IN THE MODEL CAN REACH ONE — the negative all twelve cells rest on.

test('MODEL: the six rule packs name 52 kinds and 34 fields, and none of them is a directive', () => {
  const q = ruleWorld();
  // `slot_atom(Rel, I, A)` is rules/js-vocabulary.rofl's walk over the kernel's
  // reification of every rule body: the constants that appear at argument I of
  // a premise on relation Rel. Position 2 of `ast_node` is the KIND slot and
  // position 2 of `ast_child` is the FIELD slot.
  const kindsNamed = new Set(q('slot_atom(ast_node, 2, A)').flat());
  const fieldsRead = new Set(q('slot_atom(ast_child, 2, A)').flat());

  // POSITIVE CONTROLS ON BOTH HALVES, because an empty intersection is a fact
  // about the query until something proves the query can answer.
  assert.ok(kindsNamed.size > 40, `positive control: ${kindsNamed.size} kinds named`);
  assert.ok(fieldsRead.size > 25, `positive control: ${fieldsRead.size} fields read`);
  for (const k of ['string_literal', 'call_expression', 'labeled_statement'])
    assert.equal(kindsNamed.has(k), true, `positive control: a rule names ${k}`);
  for (const f of ['body', 'arguments', 'callee'])
    assert.equal(fieldsRead.has(f), true, `positive control: a rule reads ${f}`);

  // AND THE NEGATIVE. Both halves are needed: a rule could reach a directive by
  // naming its kind, or by walking the field it hangs off with the kind left
  // free. Neither happens.
  for (const k of KINDS) assert.equal(kindsNamed.has(k), false, `no rule may name ${k}`);
  for (const f of ['directives', 'interpreter'])
    assert.equal(fieldsRead.has(f), false, `no rule may read the ${f} field`);

  // ...and the model does not silently hold an opinion it has no cell for: the
  // audit rules/js-vocabulary.rofl exists for is empty here.
  assert.deepEqual(q('rule_opinion_unlisted[audit](L, K)'), []);
});

// ===========================================================================
// 3. THE CORPUS SITES, and the layer relations that exclude them.

test('CORPUS: seven directive nodes in two files, in none of the layers relations', () => {
  const b = base();
  // THE NAMED SET, file and kind with multiplicity. delta.mjs opens with the
  // hashbang and a program-level directive; shapes.ts ends with a two-string
  // prologue inside a function body. No line numbers anywhere.
  assert.deepEqual(directiveNodes(b), [
    'delta.mjs directive', 'delta.mjs directive_literal', 'delta.mjs interpreter_directive',
    'shapes.ts directive x2', 'shapes.ts directive_literal x2',
  ]);

  const seen = ids(b);
  assert.equal(seen.size, 7);
  // EVERY RELATION THE THREE LAYERS IN THIS WORLD ANSWER WITH, and each is
  // asked with a positive control on the same line: a relation with no rows is
  // not evidence about a kind.
  for (const [rel, floor] of [
    ['site[code](S)', 400], ['resolves[code](A, B)', 200],
    ['valued[flow](E)', 1500], ['may_be_lit[flow](E, V)', 500],
    ['may_be_node[flow](E, N)', 800], ['guarded[code](N)', 300],
    ['guard_arm[code](P, A)', 50], ['after_abrupt[code](N)', 10],
    ['reachable[code](N)', 100], ['transfer_site[code](S, M)', 10],
  ] as [string, number][]) {
    const rows = b.q(rel);
    assert.ok(rows.length >= floor, `positive control: ${rel} has ${rows.length} rows`);
    assert.deepEqual(rows.filter((r) => r.some((c) => seen.has(c))), [],
      `${rel} must not mention a directive node in any argument`);
  }

  // ...AND THE ONE RELATION THAT DOES HOLD THEM. Two of the three kinds carry a
  // value, so `a_a_statement_carries_no_value` — the atom every statement in
  // facts/js-statements.rofl takes — would have been FALSE about them. This is
  // the row that made the dataflow waiver need its own reason atom.
  assert.deepEqual(b.q('ast_value[code](N, V)').filter(([n]) => seen.has(n)).map(([, v]) => v).sort(),
    ['/usr/bin/env node', 'use rofl', 'use strict', 'use strict']);
});

test('CORPUS: the modules relations, in a world that actually has them', () => {
  const q = modulesWorld();
  const seen = new Set(q('ast_node[code](N, K, F, L)')
    .filter(([, k]) => (KINDS as readonly string[]).includes(k)).map(([n]) => n));
  assert.equal(seen.size, 7, 'the same seven nodes reach the modules world');
  for (const [rel, floor] of [
    ['import_site[code](S, K)', 5], ['export_site[code](E)', 20],
    ['binding[code](I, Sp, L, Im)', 5], ['export_binding[code](E, Sp, X, In)', 5],
    ['src_shape[code](S, Sh)', 10], ['site_kind[code](S, K)', 5],
  ] as [string, number][]) {
    const rows = q(rel);
    assert.ok(rows.length >= floor, `positive control: ${rel} has ${rows.length} rows`);
    assert.deepEqual(rows.filter((r) => r.some((c) => seen.has(c))), [],
      `${rel} must not mention a directive node`);
  }
  // AND THE HASHBANG'S OWN FILE IS STILL A MODULE LIKE ANY OTHER: delta.mjs is
  // reached through gamma's `export *`, and putting a `#!` on its first line
  // changed nothing about that. This is the positive half of the modules
  // waiver — the file with the hashbang in it still has its import site.
  const inDelta = new Set(q('ast_node[code](N, K, F, L)')
    .filter(([, , f]) => f === 'delta.mjs').map(([n]) => n));
  assert.ok(q('import_site[code](S, K)').some(([s]) => inDelta.has(s)),
    'delta.mjs still has an import site');
});

// ===========================================================================
// 4. THE VERDICTS — twelve cells, and the mutants that reopen them.

test('MATRIX: twelve cells, all waived, and a removed row reopens exactly one', () => {
  const m = matrix();
  const verdicts = (k: string): string[] =>
    m(`verdict[audit](js, ${k}, L, V)`).map(([l, v]) => `${l}=${v}`).sort();
  for (const k of KINDS)
    assert.deepEqual(verdicts(k),
      ['callgraph=waived', 'controlflow=waived', 'dataflow=waived', 'modules=waived'],
      `${k} is answered at all four layers`);

  // THE REASONS, by name — a waiver whose atom nobody can read is a silence.
  assert.deepEqual(m('ignored(js, directive_literal, L, R)').map(([l, r]) => `${l}=${r}`).sort(), [
    'callgraph=a_not_a_call_site',
    'controlflow=a_no_control_transfer',
    'dataflow=a_a_value_the_grammar_reads_and_no_expression_can',
    'modules=a_not_a_module_construct',
  ]);

  // MUTANT 1 — the dataflow row removed. The cell must reopen; a verdict
  // nothing reads is a row that cannot go red.
  const m1 = matrix(['facts/js-statements.rofl',
    'ignored(js, directive_literal,     dataflow, a_a_value_the_grammar_reads_and_no_expression_can).', '']);
  assert.deepEqual(m1('verdict[audit](js, directive_literal, dataflow, V)').flat(), ['not_modelled']);
  assert.deepEqual(m1('verdict[audit](js, directive_literal, callgraph, V)').flat(), ['waived'],
    'and only that one cell moves');

  // MUTANT 2 — the controlflow row for the hashbang, at the other end of the
  // block, so the two mutants are not the same edit twice.
  const m2 = matrix(['facts/js-statements.rofl',
    'ignored(js, interpreter_directive, controlflow, a_no_control_transfer).', '']);
  assert.deepEqual(m2('verdict[audit](js, interpreter_directive, controlflow, V)').flat(),
    ['not_modelled']);

  // ...and the matrix's own audits stay silent on all three kinds.
  for (const a of ['orphan_claim[audit](L, K, La)', 'double_claimed[audit](L, K, La)',
                   'bad_reason[audit](L, K, La, R)'])
    assert.deepEqual(m(a).filter((r) => r.some((c) => (KINDS as readonly string[]).includes(c))), []);
});

test('MATRIX: the three excuses are gone, and the audit is what takes them', () => {
  const b = base();
  // `kind_absent_ok` for these three had to go the run the fixtures landed —
  // an excuse cannot outlive its cause, and `kind_absent_stale[audit]` is the
  // relation that says so rather than a reader noticing.
  assert.equal(b.n('kind_absent_stale[audit](K)'), 0);
  assert.equal(b.n('kind_unexercised[audit](L, K)'), 0);
  assert.ok(b.n('kind_absent_ok(K, R)') > 0, 'positive control: excuses still reach this world');
  // MUTANT 3 — one excuse put back. The audit must name it by name.
  const m3 = build(mut('kind_absent_ok(with_statement, a_a_module_is_strict_and_with_is_a_syntax_error).',
    'kind_absent_ok(with_statement, a_a_module_is_strict_and_with_is_a_syntax_error).\n'
    + 'kind_absent_ok(directive, a_stale_excuse).', 'facts/js-kinds.rofl'));
  assert.deepEqual(m3.q('kind_absent_stale[audit](K)').flat(), ['directive']);
});

// ===========================================================================
// 5. THE STRUCTURAL MUTANTS — what each waiver would cost if it were wrong.

test('DATAFLOW: the value IS derivable and nothing reads it', () => {
  const b = base();
  const answers = (w: World) => ['calls_in[code](F, A, B)', 'resolves[code](A, B)',
    'may_not_run[code](F)', 'prototype_of[flow](E, P)', 'stdlib_member[audit](C, P, K)']
    .map((rel) => `${rel.split('[')[0]}=${w.n(rel)}`);

  // MUTANT 4 — `literal_kind(directive_literal)`. THIS IS THE MUTANT THAT
  // REFUTED THE FIRST DRAFT of the fact pack's comment, which said the row
  // would derive nothing: it derives exactly three, one per directive literal
  // in the corpus, because the rule asks only for a kind and an `ast_value`.
  const m4 = build(mut('literal_kind(string_literal).',
    'literal_kind(string_literal).\nliteral_kind(directive_literal).', DF));
  assert.equal(m4.n('may_be_lit[flow](E, V)'), b.n('may_be_lit[flow](E, V)') + 3);
  assert.equal(m4.n('valued[flow](E)'), b.n('valued[flow](E)') + 3);
  // ...AND NOT ONE ANSWER MOVES. That is the waiver: a value with no consumer.
  assert.deepEqual(answers(m4), answers(b));

  // MUTANT 5 — `node_value_kind(directive_literal)`, which says a directive
  // literal has OBJECT IDENTITY. Same shape on the other table, and the pair is
  // what says the two arms are independent.
  const m5 = build(mut('node_value_kind(object_expression).',
    'node_value_kind(object_expression).\nnode_value_kind(directive_literal).', DF));
  assert.equal(m5.n('may_be_node[flow](E, N)'), b.n('may_be_node[flow](E, N)') + 3);
  assert.deepEqual(answers(m5), answers(b));
});

test('CONTROLFLOW: the layer can see the node and cannot put it in statement order', () => {
  const b = base();

  // MUTANT 6 — `guard_kind(directive, value)`, a false claim that a directive's
  // literal is a conditional arm. IT DIES: `guarded` moves by exactly the three
  // literals. So the absence of a control-flow row for these kinds is a
  // DECISION about the language and not an incapacity of the layer, which is
  // what `a_no_control_transfer` has to mean to be worth writing.
  const m6 = build(mut('guard_kind(if_statement,               consequent).',
    'guard_kind(if_statement,               consequent).\nguard_kind(directive, value).', CF));
  assert.equal(m6.n('guarded[code](N)'), b.n('guarded[code](N)') + 3);

  // MUTANT 7 — `abrupt_kind(directive)`, which claims a directive kills every
  // statement after it. THE MOST AGGRESSIVE FALSE CLAIM AVAILABLE AT THIS LAYER,
  // AND IT SURVIVES: `after_abrupt` and `guarded` do not move a row. The reason
  // is the tree rather than a cautious rule — `abrupt_at` wants a node at an
  // INDEX of a `stmt_seq_field` (`body` or `consequent`) and a directive sits in
  // `directives`, so the model cannot place one in statement order at all.
  //
  // UNKILLABLE BY THE FACT VOCABULARY as it stands, and asserted rather than
  // described: the day `directives` becomes a statement sequence — which is a
  // defensible change, a prologue does run before the rest of the body — this
  // equality goes red and the waiver needs re-reading.
  const m7 = build(mut('abrupt_kind(return_statement).',
    'abrupt_kind(return_statement).\nabrupt_kind(directive).', CF));
  assert.equal(m7.n('after_abrupt[code](N)'), b.n('after_abrupt[code](N)'));
  assert.equal(m7.n('guarded[code](N)'), b.n('guarded[code](N)'));
  // ...AND THE REASON, stated as a membership rather than as a pin on another
  // item's table: `directives` is not a statement sequence. Asserting the whole
  // table here would go red for whoever legitimately adds a field to it.
  const seq = b.q('stmt_seq_field(F)').flat();
  assert.ok(seq.includes('body'), 'positive control: the table is populated');
  assert.equal(seq.includes('directives'), false,
    'a directive is in no statement sequence, so it cannot be abrupt in one');
});

// ===========================================================================
// 6. THE ONE CONSTRUCT WITH A REAL EFFECT, and why no layer feels it.

test("SEMANTICS: 'use strict' changes two things this model has neither of", async () => {
  // MEASURED BY RUNNING, not read off the spec. A module is strict WITHOUT any
  // directive, so every `'use strict'` this scanner can see is a no-op — the
  // scanner parses every file as `sourceType: 'module'`.
  let strict = 'assigned';
  // A DIRECT `eval` INHERITS THE STRICTNESS OF THE CODE AROUND IT, so this
  // measures THIS FILE's mode; there is no `'use strict'` anywhere in it, and
  // it is a module.
  try { eval('undeclaredFromTheDirectivesTest = 1'); }
  catch (e) { strict = (e as Error).constructor.name; }
  assert.equal(strict, 'ReferenceError', 'module code is strict with no directive in it');
  // THE POSITIVE CONTROL, and without it the line above says nothing: a
  // `new Function` body is sloppy by construction and the same assignment works.
  assert.equal(new Function('undeclaredSloppy = 1; return typeof undeclaredSloppy;')(), 'number');

  // AND THE TWO EFFECTS HAVE NOTHING TO CHANGE HERE. `may_throw` is seeded by
  // `throws_outright`, which reads a `throw_statement` and nothing else, so no
  // implicit throw of any kind — a ReferenceError included — is in this model;
  // and a plain function's `this`, which strict mode makes `undefined` instead
  // of the global object, has no value here either, because `may_be_node` gives
  // a `this` a value only through a CLASS.
  const b = base();
  // `may_throw` is `throws_outright` plus propagation along call edges, and
  // `throws_outright` reads a `throw_statement`. MEASURED, not read: every
  // function the model says throws outright CONTAINS an explicit `throw`.
  const outright = b.q('throws_outright[code](F)').map(([f]) => f);
  assert.ok(outright.length > 0, 'positive control: throws_outright is populated');
  const withThrow = new Set(b.q('ast_node[code](T, throw_statement, F, L)')
    .flatMap(([t]) => b.q(`ast_within[code](G, ${t})`).map(([g]) => g)));
  assert.deepEqual(outright.filter((f) => !withThrow.has(f)), [],
    'the whole seed of may_throw is the explicit throw statement');
  // ...and a plain function`s `this` — the other thing strict mode changes —
  // has no value here: every `this` the value layer resolves goes through a
  // class, and delta.mjs and shapes.ts contain no `this` outside one.
  const thisNodes = b.q('ast_node[code](T, this_expression, F, L)').map(([t]) => t);
  assert.ok(thisNodes.length > 0, 'positive control: the corpus has `this`');
  const receivers = new Set(b.q('obj_like[flow](CD)').map(([c]) => c));
  const kindOf = (n: string) => b.q(`ast_node[code](${n}, K, F, L)`)[0]?.[0];
  const reached = new Set(thisNodes.flatMap((t) =>
    b.q(`may_be_node[flow](${t}, N)`).map(([n]) => String(kindOf(n)))));
  // EVERY `this` IN THE CORPUS GETS A VALUE and every value is a class or an
  // object literal — a RECEIVER. There is no `the global object` and no
  // `undefined` in this layer's vocabulary, which is the whole of what strict
  // mode changes about a plain call's `this`.
  assert.ok(reached.size > 0, 'positive control: some `this` has a value');
  for (const k of reached)
    assert.ok(['class_declaration', 'class_expression', 'object_expression'].includes(k),
      `a \`this\` may only be an obj_like receiver, and this one is ${k}`);
  for (const t of thisNodes)
    assert.ok(b.q(`may_be_node[flow](${t}, N)`).every(([n]) => receivers.has(n)),
      'a `this` takes its value from an obj_like receiver and from nothing else');
});

// ===========================================================================
// 7. THE ERA TABLE, which is wrong about the hashbang and cannot be right.

const CLI = "#!/usr/bin/env node\n'use strict';\nexport const cliFlag = 1;\n";

test('ERA: the model says an es5 engine takes a hashbang, and it is ES2023', () => {
  const q = eraWorld([['cli.mjs', CLI]]);
  // THE SITE IS REAL and the era world can see it.
  assert.equal(q('ast_node[code](N, interpreter_directive, F, L)').length, 1);
  // ...AND THE ANSWER IS SILENCE IN EVERY ENVIRONMENT, es5 (2009) included.
  const hb = q('ast_node[code](N, interpreter_directive, F, L)')[0][0];
  assert.deepEqual(q('unsupported[audit](E, N, F)').filter(([, n]) => n === hb), []);
  assert.deepEqual(q('uses[audit](N, F)').filter(([n]) => n === hb), []);
  // POSITIVE CONTROLS: the world grades other things, and es5 is on the scale.
  assert.ok(q('unsupported[audit](E, N, F)').length > 50, 'the era world does say no');
  assert.deepEqual(q('env_rank(E, R)').map(([e, r]) => `${e}=${r}`).sort(),
    ['es2015=2015', 'es2016=2016', 'es2020=2020', 'es5=2009', 'ts5=2022']);

  // ...AND THE HONEST TREE IS OTHERWISE CLEAN, which is what makes the row
  // below a trade rather than a repair.
  assert.deepEqual(q('feature_unreachable[audit](F)'), []);
  assert.deepEqual(q('kind_unaccounted[audit](L, K)'), []);
});

test('ERA: stating the true year makes the feature unreachable — the scale stops at 2022', () => {
  // MUTANT 8 — `kind_baseline(js, interpreter_directive)` replaced by the gate
  // that says what the hashbang actually is. `feature_since(hashbang, 2023)` is
  // above every `env_rank` on the scale, so `env_has` is empty for it and the
  // hashbang reports unsupported in ts5 as well as in es5: a false NO
  // everywhere traded for the false YES everywhere the honest tree gives.
  const q = eraWorld([['cli.mjs', CLI]], ['kind_baseline(js, interpreter_directive).',
    'kind_needs(js, interpreter_directive, hashbang).\n'
    + 'feature(hashbang).\nfeature_since(hashbang, 2023).']);
  assert.deepEqual(q('feature_unreachable[audit](F)').flat(), ['hashbang']);
  assert.deepEqual(q('env_has[audit](E, hashbang)'), []);
  assert.deepEqual(q('unsupported[audit](E, N, F)').filter(([, , f]) => f === 'hashbang')
    .map(([e]) => e).sort(), ['es2015', 'es2016', 'es2020', 'es5', 'ts5']);

  // THE ONE THING THAT WOULD FIX IT is an environment above 2022, and that is
  // the owner's to add — `layer` and the era scale are both his. THIS IS THE
  // TRIPWIRE: the day an `es2023` arrives, `env_has` is no longer empty here
  // and this assertion goes red, which is the reminder to take the true gate.
  assert.equal(Math.max(...q('env_rank(E, R)').map(([, r]) => Number(r))), 2022,
    'no environment on this scale can reach a 2023 feature');
});
