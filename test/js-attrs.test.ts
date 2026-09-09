// js-attrs.test.ts — AN ATTRIBUTE THE SCANNER EMITS AND NO RULE READS
// (w_unconsumed_attribute).
//
// The item's note is a list of four times a design note claimed a fact was
// missing that was already on the store — `ast_attr(M, kind, "get")` was the
// fourth, and the same key was consumed for `"constructor"` and nothing else.
// The shape is always the same: the note was written while looking at the
// RULES, and the store is a different artifact made by a scanner nobody is
// reading at that moment.
//
// SO ASK THE RULES. Third audit in this repository built on the kernel's own
// reification, after rules/js-vocabulary.rofl and the census beside it: clauses
// are stored as facts after parsing, so `which attribute keys does any rule
// name` is a query rather than a grep.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const FIX = 'test/fixtures/js-call/';
const FILES: [string, string][] = [
  ['alpha.mjs', FIX + 'alpha.mjs'], ['beta.mjs', FIX + 'beta.mjs'],
  ['gamma.mjs', FIX + 'gamma.mjs'], ['delta.mjs', FIX + 'delta.mjs'],
  ['shapes.ts', FIX + 'shapes.ts.txt'],
  // THE ONLY SITE IN THE TREE FOR THE FIVE OPERATOR VALUES THE ERA TABLE READS.
  // Its own header says why it has to exist for the bridge to be falsifiable.
  ['eras.mjs', 'test/fixtures/js-attrs/eras.mjs.txt'],
];
const ATTRS = 'facts/js-attrs.rofl';
const RULES = 'rules/js-attrs.rofl';

// EVERY JS PACK IN THE TREE IS LOADED, and that is the correction this file
// needed rather than a preference. An audit whose subject is `what do the rules
// read` answers about the rules IN ITS WORLD, and this world held six of the
// thirteen JS packs: `rules/js-env.rofl` was outside it, so its reads were
// invisible and `attr_deferred(async, ...)` — a row asserting nobody reads
// `async` — was green beside a layer that reads it 398 times.
// `f_an_instruments_world_is_part_of_its_claim` is already the reason
// test/js-layer-cost.test.ts asserts the same closure over the same list; this
// file is the one where a missing pack changes the ANSWER and not the cost.
const PACKS = [
  'boot.rofl', 'facts/js-kinds.rofl', 'facts/js-callgraph.rofl',
  'facts/js-dataflow.rofl', 'facts/js-modules.rofl', 'facts/js-shapes.rofl',
  'facts/js-statements.rofl', 'facts/js-controlflow.rofl',
  'facts/js-env.rofl', 'facts/js-lib-surface.rofl', 'facts/js-resolve.rofl', ATTRS,
  'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
  'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl', 'rules/js-modules.rofl',
  'rules/js-env.rofl', 'rules/js-env-api.rofl', 'rules/js-resolve.rofl',
  'rules/js-vocabulary.rofl',
  // ADDED 2026-09-09 BY THE CLOSURE, not by a decision of this file:
  // `rules/js-pack-home.rofl` arrived from w_vocabulary_home in a branch that
  // could not see this one, and the assertion below went red within one run.
  // It is LOADED rather than refused because the comment on that assertion is
  // right — an audit over the rules themselves has no defensible reason to
  // refuse a pack of rules. Third time in one morning that a new pack reddened
  // another branch's closure; that is the closure working, and it is also the
  // merge cost of having three of them.
  'rules/js-pack-home.rofl',
  // AND ONE FROM THE wip/curve MERGE, 2026-09-09. `facts/js-cost.rofl` is the
  // other session's per-rule cost table — instrumentation over the rules, the
  // same class as the two above — and this world loads rather than refuses,
  // because an audit over the rules themselves has no defensible reason to
  // refuse a pack of facts about them. Fourth time in one morning that a pack
  // added on one branch reddened another's closure, and every one was caught in
  // a single run.
  'facts/js-cost.rofl',
  // AND THE FIFTH LAYER, 2026-09-09 (w_effect_layer). `layer(effect)` and its
  // hundred verdicts live in `facts/js-effects.rofl` and the lattice in
  // `rules/js-effects.rofl`. Both are LOADED rather than refused, and for this
  // world the reason is not a preference: this file's subject is which
  // attributes the JS layers READ, and the effect rules read `operator` — via
  // `plain_assign` — and `handler`, so refusing them would make
  // `attr_deferred` claim nobody reads an attribute a layer reads. Fifth pack
  // in one week to redden this closure, and the fifth caught in a single run.
  'facts/js-effects.rofl', 'rules/js-effects.rofl', RULES,
];
/** every JS pack in the tree, by name — the same closure
 *  test/js-layer-cost.test.ts takes, restated here because this world's ANSWER
 *  depends on it. `boot.rofl` is the kernel's own and outside the closure. */
function jsPacksOnDisk(extra: string[] = []): string[] {
  const out: string[] = [];
  for (const dir of ['facts', 'rules'])
    for (const f of fs.readdirSync(path.join(ROOT, dir)))
      if (/^js-.*\.rofl$/.test(f)) out.push(`${dir}/${f}`);
  return [...out, ...extra].sort();
}
const BUDGET = { budget: 900_000_000 };
const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

type Mut = { file: string; find: string; replace: string };
interface World { q: (l: string) => string[][]; n: (l: string) => number }

function build(muts: Mut[] = []): World {
  const r = new Rofl();
  const texts = PACKS.map((f) => {
    let t = read(f);
    for (const m of muts) if (m.file === f) {
      assert.ok(t.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
      t = t.replace(m.find, m.replace);
    }
    return t;
  });
  const res = r.load(texts.join('\n'));
  assert.ok(res.ok, `world REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  for (const [logical, disk] of FILES) {
    const a = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(a.ok, `${logical} facts REJECTED:\n${a.diagnostics.slice(0, 3).join('\n')}`);
  }
  r.evaluate(40_000_000);
  assert.deepEqual(r.query('hole(Q, R)').rows.map((x) => `${x.bindings.Q}/${x.bindings.R}`), [],
                   'this world must reach its fixpoint, not stop at a budget');
  const q = (lit: string): string[][] => {
    const out = r.query(lit, BUDGET);
    assert.equal(out.error, undefined, `query ${lit}: ${out.error}`);
    assert.equal(out.partial, false, `query ${lit} hit a budget`);
    assert.equal(out.unpopulatable, false, `query ${lit}: nothing here can populate it`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return out.rows.map((row) => order.map((v) => unq(String(row.bindings[v] ?? ''))));
  };
  return { q, n: (l) => q(l).length };
}

let BASE: World | undefined;
const base = () => (BASE ??= build());

const AUDITS = [
  'unconsumed_attr[audit](K)', 'unconsumed_value[audit](K, V)',
  'attr_unread_ok_unseen[audit](K)', 'attr_unread_ok_read[audit](K)',
  'attr_deferred_unseen[audit](K)', 'attr_deferred_read[audit](K)',
  'attr_double_excused[audit](K)', 'attr_value_ok_unseen[audit](K, V)',
  // added 2026-09-09 with the three derivations below them
  'attr_table_unbridged[audit](Rel, I, J)', 'attr_table_bridged_unread[audit](Rel)',
  'attr_blind_guard[audit](K, F, Kind)', 'attr_slot_gap_ok_unseen[audit](K, F, Kind)',
  'attr_kind_split[audit](K, Kind)', 'attr_split_ok_unseen[audit](K, Kind)',
];

// ---------------------------------------------------------------------------
// 1. THE HONEST TREE

test('every attribute the scanner emits is read, excused or deferred by name', () => {
  const m = base();
  for (const a of AUDITS) assert.equal(m.n(a), 0, `${a} is not empty: ${JSON.stringify(m.q(a))}`);

  // POSITIVE CONTROL ON THE DENOMINATOR, because eight empty audits over an
  // empty corpus would also be zero. Thirteen keys are deferred and six excused
  // — measured the day this was written, and the ten that ARE read are named so
  // a key silently leaving the read set cannot pass as an excuse arriving.
  assert.deepEqual(m.q('attr_key_read(K)').flat().sort(), [
    'async', 'computed', 'delegate', 'export_kind', 'import_kind', 'kind',
    'name', 'operator', 'static', 'value', 'value_cooked',
  ]);
  // `async` IS ELEVENTH AND IT ARRIVED THROUGH A TABLE. No rule names it; it is
  // read as `outside_attr_needs(_, _, Key, V, _), ast_attr[code](A, Key, V)`
  // with both arguments variables, and it sat in `attr_deferred` under the note
  // `nobody has read it yet` until this world grew the pack that reads it.
  // ...AND THE FOUR READ WITH THE VALUE LEFT FREE, which is the exclusion that
  // keeps `unconsumed_value` from reporting four hundred and fifty-five names.
  assert.deepEqual(m.q('attr_key_read_free(K)').flat().sort(),
    ['kind', 'name', 'value', 'value_cooked']);
});

// ---------------------------------------------------------------------------
// 2. SIX MUTANTS, SIX ORACLES

test('MUTANT 1 — an excuse is withdrawn', () => {
  const m = build([{ file: ATTRS, find: 'attr_unread_ok(optional,   a_the_kind_carries_it).', replace: '' }]);
  assert.deepEqual(m.q('unconsumed_attr[audit](K)').flat(), ['optional']);
});

test('MUTANT 2 — a deferral is withdrawn', () => {
  const m = build([{ file: ATTRS, find: 'attr_deferred(pattern,     w_unconsumed_attribute).', replace: '' }]);
  assert.deepEqual(m.q('unconsumed_attr[audit](K)').flat(), ['pattern']);
});

test('MUTANT 3 — an excuse names a key the scanner never emits', () => {
  const m = build([{ file: ATTRS, find: 'attr_unread_ok(tail,       a_the_child_index_carries_it).',
    replace: 'attr_unread_ok(tale,       a_the_child_index_carries_it).' }]);
  // BOTH HALVES, because a misspelling does two things at once: the key it
  // meant to excuse is reported, and the row itself is reported as naming
  // nothing. Without the second, a typo reads as a key that needs work.
  assert.deepEqual(m.q('attr_unread_ok_unseen[audit](K)').flat(), ['tale']);
  assert.deepEqual(m.q('unconsumed_attr[audit](K)').flat(), ['tail']);
});

test('MUTANT 4 — a key that IS read is excused anyway', () => {
  const m = build([{ file: ATTRS, find: 'attr_unread_ok(optional,   a_the_kind_carries_it).',
    replace: 'attr_unread_ok(optional,   a_the_kind_carries_it).\nattr_unread_ok(computed, a_pretending).' }]);
  assert.deepEqual(m.q('attr_unread_ok_read[audit](K)').flat(), ['computed'],
    'an excuse for a key some rule already reads is a row about nothing');
});

test('MUTANT 5 — the free-value exclusion is dropped', () => {
  const m = build([{ file: RULES,
    find: 'not attr_key_read_free(K), not attr_pair_read(K, V),',
    replace: 'not attr_pair_read(K, V),' }]);
  // THE SIGNATURE IS SCALE. `name` and `value` are read with the value left
  // free, so without the exclusion every identifier and every literal in the
  // corpus becomes an unconsumed value.
  const rows = m.q('unconsumed_value[audit](K, V)');
  assert.ok(rows.length > 400, `expected hundreds, got ${rows.length}`);
  assert.ok(rows.some(([k]) => k === 'name'), 'and `name` is the bulk of them');
});

test('MUTANT 6 — a reified variable counts as a key', () => {
  const m = build([{ file: RULES,
    find: 'attr_key_read(K)       :- attr_lit(L, K, _), not attr_lit_kvar(L, K).',
    replace: 'attr_key_read(K)       :- attr_lit(L, K, _).' }]);
  // THE LEAK IS REAL AND ITS CONSEQUENCE IS NOT, measured rather than assumed:
  // `$var("Key")` joins `attr_key_read`, and `unconsumed_attr` does not move by
  // a single row. `attr_key_read` is a union, so the real keys stay read; and
  // nothing named `$var("Key")` is ever emitted by the scanner, so the extra
  // member matches no `ast_attr` row.
  //
  // A SURVIVOR OF CATEGORY (a), NO SITE — and the site it lacks is a rule
  // reading `ast_attr` with the KEY free and the VALUE bound, which no rule in
  // this model does. The mirror guard on the value position IS load-bearing and
  // mutant 5 above is what says so, which is why the two are written separately
  // rather than as one predicate over both arguments.
  assert.ok(m.q('attr_key_read(K)').flat().some((k) => k.startsWith('$var(')),
    'the reified variable leaks in as a key');
  assert.equal(m.n('unconsumed_attr[audit](K)'), base().n('unconsumed_attr[audit](K)'),
    'and nothing downstream moves, which is the honest half of this mutant');
});

// ---------------------------------------------------------------------------
// 3. WHAT THE AUDIT SAID THE DAY IT WAS WRITTEN
//
// Not an assertion about the rules — an assertion about the ANSWER, kept
// because the answer is the point of the item.

test('the deferred list is the queue, and it names what nobody has read', () => {
  const m = base();
  assert.deepEqual(m.q('attr_deferred(K, W)').map(([k]) => k).sort(),
    ['await', 'flags', 'generator', 'pattern', 'prefix', 'source_type']);
  // EVERY ONE OF THEM HAS AN OWNER, which is what makes this a queue rather
  // than a list of shrugs.
  assert.deepEqual([...new Set(m.q('attr_deferred(K, W)').map(([, w]) => w))],
    ['w_unconsumed_attribute']);
});

// ---------------------------------------------------------------------------
// 4. THE WORLD IS PART OF THE CLAIM
//
// This audit's whole subject is `which keys do the rules read`, so a rule pack
// outside the world is a rule that reads nothing — and the answer is then wrong
// in the direction that produces a QUEUE ENTRY FOR WORK ALREADY DONE. It did:
// `attr_deferred(async, w_unconsumed_attribute)` was written on 2026-09-09 and
// `rules/js-env.rofl` had been reading `async` since 2026-09-05.

test('every JS pack in the tree is loaded, or refused here by name', () => {
  // NOTHING IS REFUSED, and that is the only defensible closure for an audit
  // over the rules themselves. The list is written out rather than filtered so
  // that a new pack forces a decision here instead of quietly shrinking the
  // denominator.
  const REFUSED: string[] = [];
  const loaded = PACKS.filter((p) => p !== 'boot.rofl');
  assert.deepEqual(loaded.filter((p) => REFUSED.includes(p)), [],
    'a pack is both loaded and refused');
  assert.deepEqual([...loaded, ...REFUSED].sort(), jsPacksOnDisk(),
    'this world neither loads nor refuses some JS pack in the tree. A pack this '
    + 'audit cannot see is a pack whose reads it reports as absent, which is a '
    + 'queue entry for work already done.');
  // POSITIVE CONTROL ON THE CLOSURE ITSELF, on the pattern
  // test/js-layer-cost.test.ts uses: a pack that does not exist must break it.
  assert.notDeepEqual([...loaded, ...REFUSED].sort(), jsPacksOnDisk(['rules/js-nowhere.rofl']),
    'the closure would not notice a new pack');
});

// ---------------------------------------------------------------------------
// 5. A KEY READ THROUGH A TABLE

test('the tables that supply a key are derived, and each one has a bridge', () => {
  const m = base();
  // DERIVED FROM THE CLAUSES, not listed: exactly two relations join a
  // two-variable `ast_attr` literal, both at (Key = 3, Value = 4).
  assert.deepEqual(m.q('attr_table_read(Rel, I, J)').map((r) => r.join('/')).sort(),
    ['attr_needs/3/4', 'outside_attr_needs/3/4']);
  // ...and what the bridge then makes readable: the era layer's top-level-await
  // marker and the five operators `attr_needs` gates three features on.
  assert.deepEqual(m.q('attr_pair_read(K, V)')
    .filter(([k]) => k === 'async' || k === 'operator').map((r) => r.join('=')).sort(),
    ['async=true', 'operator=&&=', 'operator=**', 'operator==', 'operator=??',
      'operator=??=', 'operator=||='].sort());
});

test('MUTANT 7 — the bridge to the era table is cut', () => {
  const m = build([{ file: RULES, find: 'attr_pair_read(K, V) :- attr_needs(_, _, K, V, _).',
    replace: '' }]);
  // THE FIVE VALUES test/fixtures/js-attrs/eras.mjs.txt EXISTS FOR. Without a
  // site in the corpus this mutant kills nothing at all: `unconsumed_value`
  // reads `ast_attr[code](_, K, V)` first, and the js-call fixtures carry
  // thirteen operator values of which not one is among these five.
  assert.deepEqual(m.q('unconsumed_value[audit](K, V)').map((r) => r.join('=')).sort(),
    ['operator=&&=', 'operator=**', 'operator=??', 'operator=??=', 'operator=||='].sort());
});

test('MUTANT 8 — a table loses its declaration', () => {
  const m = build([{ file: ATTRS, find: 'attr_table_bridged(outside_attr_needs).', replace: '' }]);
  assert.deepEqual(m.q('attr_table_unbridged[audit](Rel, I, J)').map((r) => r.join('/')),
    ['outside_attr_needs/3/4'],
    'a table the rules read with no bridge rule is a key nobody can see read');
});

// ---------------------------------------------------------------------------
// 6. WHICH KINDS IN THIS POSITION CARRY NO SUCH ATTRIBUTE

test('the guards, their positions, and the kinds those positions hold with no such key', () => {
  const m = base();
  // FOUR GUARDS, derived from the clauses: a constant-valued `ast_attr` premise
  // whose subject is also the parent of an `ast_child` premise in the same rule.
  assert.deepEqual([...new Set(m.q('attr_guard_slot(R, K, S, F)')
    .map(([, k, , f]) => `${k}/${f}`))].sort(),
    ['computed/key', 'computed/property', 'delegate/argument', 'static/value']);
  // ...AND THE ANSWER TO THE QUESTION NOBODY RUNS. Five rows, and the split
  // between them is the point: three are guards whose population is narrower
  // than their slot, which this audit cannot narrow; two are real and are what
  // `key_name`'s negation is written for.
  assert.deepEqual(m.q('attr_slot_gap(K, F, Kind)').map((r) => r.join('/')).sort(), [
    'computed/key/class_private_method', 'computed/key/class_private_property',
    'computed/property/meta_property',
    'static/value/directive', 'static/value/object_property',
  ]);
  // THE TWO REAL ONES ARE EXACTLY THE ONES NO GUARD READS POSITIVELY, which is
  // the whole content of the gate: `attr_blind_guard[audit]` is empty because
  // `key_name` uses a negation, and MUTANT 9 is what that sentence means.
  const pos = new Set(m.q('attr_pos_slot_gap(K, F, Kind)').map((r) => r.join('/')));
  assert.deepEqual(m.q('attr_slot_gap(K, F, Kind)').map((r) => r.join('/'))
    .filter((r) => !pos.has(r)).sort(),
    ['computed/key/class_private_method', 'computed/key/class_private_property']);
});

test('MUTANT 9 — the negation in key_name becomes a positive test', () => {
  // THE SURVIVOR f_a_positive_attribute_test_is_blind_to_a_kind_that_has_no_such_attribute
  // RECORDED WITH NO ORACLE, killed here. Its own note says the swap moves no
  // row today because `key_name` has no arm for a private key, so nothing the
  // model DERIVES can tell the two spellings apart. This audit is not about what
  // the model derives; it is about what the guard can REACH.
  const m = build([{ file: 'rules/js-structure.rofl',
    find: 'not ast_attr[code](P, computed, true),',
    replace: 'ast_attr[code](P, computed, false),' }]);
  assert.deepEqual(m.q('attr_blind_guard[audit](K, F, Kind)').map((r) => r.join('/')).sort(),
    ['computed/key/class_private_method', 'computed/key/class_private_property']);
});

test('MUTANT 10 — a population excuse is withdrawn', () => {
  const m = build([{ file: ATTRS,
    find: 'attr_slot_gap_ok(static, value, directive,        a_the_rules_population_is_a_mechanism_table).',
    replace: '' }]);
  assert.deepEqual(m.q('attr_blind_guard[audit](K, F, Kind)').map((r) => r.join('/')),
    ['static/value/directive']);
});

// ---------------------------------------------------------------------------
// 7. AN ATTRIBUTE PRESENT ON SOME NODES OF A KIND AND ABSENT FROM OTHERS
//
// The half no kind-level reading can state, and the smallest answer in the file.

test('one kind in this corpus carries an attribute on some of its nodes only', () => {
  const m = base();
  assert.deepEqual(m.q('attr_kind_lacks(Kind, K)').map((r) => r.join('/')).sort(),
    ['class_private_method/computed', 'variable_declaration/declare']);
  // TWO SPLITS IN THE CORPUS AND ONLY ONE REACHES THE GATE, which is the two
  // relations doing their separate jobs rather than an omission. `declare` is on
  // `attr_unread_ok` — TypeScript's ambient modifier, which no layer models — so
  // `attr_kind_split[audit]` never asks about it; the day some rule reads it,
  // the same row becomes a gate row with no edit here.
  // AND IT CORRECTS THE EXPLANATION THE FINDING GAVE. `babel gives a private
  // name no such field` is an assertion about a KIND; measured over the three
  // `class_private_method` nodes in shapes.ts, the accessor `get #face` carries
  // `computed, false` and the two plain methods carry no `computed` at all. So
  // the presence of one attribute depends on the VALUE of another on the same
  // node — `kind` is `get` on the one that has it.
  const attrs = (n: string) => m.q(`ast_attr[code](${n}, K, V)`).map((r) => r.join('='));
  const nodes = m.q('ast_node[code](P, class_private_method, F, L)');
  assert.equal(nodes.length, 3);
  const withComputed = nodes.filter(([n]) => attrs(n).some((a) => a.startsWith('computed=')));
  assert.equal(withComputed.length, 1);
  assert.ok(attrs(withComputed[0][0]).includes('kind=get'),
    'the one that carries `computed` is the accessor form');
});

test('MUTANT 11 — the split excuse is withdrawn', () => {
  const m = build([{ file: ATTRS,
    find: 'attr_split_ok(computed, class_private_method, a_babel_emits_it_for_the_accessor_forms_only).',
    replace: '' }]);
  assert.deepEqual(m.q('attr_kind_split[audit](K, Kind)').map((r) => r.join('/')),
    ['computed/class_private_method']);
});

test('MUTANT 12 — the population narrowing is dropped', () => {
  const m = build([{ file: RULES,
    find: 'attr_pos_slot_gap(K, F, Kind) :- attr_guard_slot_pos(R, K, S, F), not attr_guard_pinned(R, K, S),',
    replace: 'attr_pos_slot_gap(K, F, Kind) :- attr_guard_slot_pos(R, K, S, F),' }]);
  // `delegates[flow]` pins Y to `yield_expression` with an `ast_node` premise in
  // its own body, and every `yield_expression` carries `delegate`. Without the
  // narrowing the slot is every kind with an `argument` child.
  assert.deepEqual(m.q('attr_blind_guard[audit](K, F, Kind)').map((r) => r.join('/')).sort(), [
    'delegate/argument/await_expression', 'delegate/argument/rest_element',
    'delegate/argument/return_statement', 'delegate/argument/spread_element',
    'delegate/argument/throw_statement', 'delegate/argument/unary_expression',
    'delegate/argument/update_expression',
  ]);
});

test('MUTANT 13 — a NEGATED co-literal counts as a table', () => {
  const m = build([{ file: RULES,
    find: `attr_table_read(Rel, I, J) :- pos_prem(R, L), attr_lit_kvvar(L), attr_lit(L, K, V),
                              pos_prem(R, L2), lit_rel(L2, Rel), Rel != ast_attr,`,
    replace: `attr_table_read(Rel, I, J) :- pos_prem(R, L), attr_lit_kvvar(L), attr_lit(L, K, V),
                              rule_prem(R, L2), lit_rel(L2, Rel), Rel != ast_attr,` }]);
  // THE AUDIT REPORTS ITSELF. `unconsumed_value` is `ast_attr[code](_, K, V)`
  // joined to `attr_pair_read(K, V)` and `attr_value_unread_ok(K, V, _)` — the
  // same shape as the era layer's read with the co-literal NEGATED, which
  // filters the pairs rather than supplying them.
  assert.deepEqual(m.q('attr_table_unbridged[audit](Rel, I, J)').map((r) => r.join('/')).sort(),
    ['attr_pair_read/1/2', 'attr_value_unread_ok/1/2']);
});
