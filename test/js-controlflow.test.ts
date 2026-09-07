// js-controlflow.test.ts — THE THIRD LAYER, and the claim it was added to test.
//
// The programme's central claim is that ADDING A LAYER COSTS ONE FACT: declare
// it, and the model enumerates every place it now needs describing rather than
// anybody remembering to. The first test here runs it — two worlds differing by
// one line — and the numbers are pinned so that a change which quietly breaks
// the enumeration goes red rather than looking tidier.
//
// SPLIT ACROSS THREE FILES 2026-09-07, and the split is not tidiness. A world
// costs 15.4 s and this file had sixty-six of them; `node --test` runs three
// files at once here, so one long file left two cores idle. The construction
// they share is test/js-corpus-world.ts. What lives HERE is the layer's own
// claim, its gates, and the two mutant sets about control leaving a function:
// reachability and a call that exits.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, base, edges, names, caught, read, FILES, FACTS, RULES } from './js-corpus-world.ts';
import type { Mut, World } from './js-corpus-world.ts';


// ---------------------------------------------------------------------------
// 1. THE CLAIM: adding a layer costs ONE fact.

test('one fact opens the layer, and the model enumerates what it now demands', () => {
  const without = build([], true);
  const withIt = base();

  assert.equal(without.n('layer(L)'), 3, 'positive control: three layers before');
  assert.equal(withIt.n('layer(L)'), 4, 'and four after');

  // THE ENUMERATION IS THE POINT, not the count: every kind in the vocabulary
  // gets a cell at the new layer without anybody listing them.
  const before = without.n('cell[audit](A, K, S, L)');
  const after = withIt.n('cell[audit](A, K, S, L)');
  // THE INVARIANT, not the constant: one layer fact adds exactly ONE CELL PER
  // DECLARED KIND. Pinning 50 was pinning the vocabulary of the day it was
  // first run — the control constructs were declared the next morning and the
  // delta became 64 without the claim changing at all. The identity is what the
  // programme actually asserts; the two numbers below are a positive control
  // that the worlds are the ones the identity was measured on.
  assert.equal(after - before, withIt.n('node_kind(A, K)'),
    'one fact, one cell per declared kind');
  // 221/285 -> 224/289 on 2026-09-06: ONE kind entered the vocabulary
  // (`export_default_declaration`, reported by `vocabulary_gap[audit]` the
  // moment a default export entered the corpus), and it costs one cell per
  // layer — three before the fact, four after. The identity above is what the
  // programme asserts; these two are the positive control that the worlds are
  // the ones it was measured on, and they move whenever the vocabulary does.
  // 224/289 -> 236/305 on 2026-09-06: FOUR kinds entered the vocabulary when the
  // frame was decided (binary_expression, unary_expression, class_body,
  // template_element), three more were declared NOT CONSTRUCTS and ten DEFERRED
  // — and neither of those two classes costs a cell, which is the whole point of
  // having three answers instead of one. Twelve before, sixteen after: the
  // identity above is what the programme asserts and it holds through all of it.
  // 236/305 -> 239/309: `null_literal` entered the vocabulary when
  // `catch { return null; }` arrived with the propagation fixtures, and
  // `vocabulary_gap[audit]` named it within one run — the SECOND time in two
  // iterations that gate caught a kind one of my own fixtures introduced.
  // 239 -> 269 on 2026-09-07: ten type-node kinds x three declared layers,
  // before the control-flow fact adds the fourth.
  assert.equal(before, 269, 'positive control: the matrix before the fact');
  assert.equal(after, 349, 'positive control: and after');

  // ...and the kinds are named, not counted. Every js and py kind the
  // vocabulary declares appears at the new layer exactly once.
  const kindsAtLayer = new Set(withIt.q('cell[audit](A, K, none, controlflow)').map(([, k]) => k));
  const allKinds = new Set(withIt.q('node_kind(A, K)').map(([, k]) => k));
  assert.deepEqual([...allKinds].filter((k) => !kindsAtLayer.has(k)), [],
    'every declared kind got a cell at the new layer');
});

test('the layer answers, waives and defers, and nothing falls through', () => {
  const m = base();
  // `q` returns one column per VARIABLE, so this pair is [K, V] and not the
  // five columns the literal has — a distinction that cost one red run.
  const verdicts = new Map(m.q('verdict[audit](js, K, none, controlflow, V)').map(([k, v]) => [k, v]));
  assert.equal(verdicts.get('if_statement'), 'modelled');
  assert.equal(verdicts.get('optional_call_expression'), 'modelled');
  assert.equal(verdicts.get('await_expression'), 'waived');
  // MOVED 2026-09-06 (w_cf_abrupt_transfer). This assertion used to read
  // not_modelled/not_yet and was the ledger half of the layer's declared gap.
  // It is kept as the same pair, flipped, so the closure is visible in the diff
  // rather than deleted out of the suite.
  assert.equal(verdicts.get('return_statement'), 'modelled');
  // ...and the rule id is named, not just the verdict. `reason[audit]` is
  // DEFINED ONLY FOR not_modelled cells — a modelled cell carries its answer in
  // `handled`, which is where the assertion had to move when the verdict
  // flipped. Both halves are pinned so a silent regression to `not_yet` cannot
  // pass by leaving one of them true.
  assert.deepEqual(m.q('handled(js, return_statement, controlflow, R)').flat(),
    ['r_abrupt']);
  assert.equal(m.n('reason[audit](js, return_statement, none, controlflow, R)'), 0);
  // ...and the deferral that is still typed and still open belongs to another
  // layer's question entirely — a positive control that `not_yet` did not go
  // extinct along with this item.
  // THE CONTROL MOVED TWICE. It named `throw_statement x dataflow`, then
  // `catch_clause x dataflow` — and w_exception_flow closed BOTH on 2026-09-06.
  // A positive control that keeps landing on cells this loop is about to answer
  // is a control chasing the work; `decorator` is in nobody's queue path.
  assert.deepEqual(m.q('reason[audit](js, decorator, none, dataflow, R)').flat(),
    ['not_yet']);
});

// ---------------------------------------------------------------------------
// 2. THE LAYER'S OWN GATES, all silent on the corpus.

test('every self-audit of the control-flow layer is empty', () => {
  const m = base();
  for (const lit of ['guard_unmodelled[audit](K)', 'guard_arm_unseen[audit](K, F)',
                     'mechanism_unanswered[audit](M)', 'leak[audit](A, B)',
                     'forged[audit](F)']) {
    assert.equal(m.n(lit), 0, `${lit}: ${JSON.stringify(m.q(lit))}`);
  }
  // `leak` in that list is not routine. This is the FIRST world in the suite to
  // load rules/js-dataflow.rofl and ask, and it found five undeclared crossings
  // that had stood since the value layer was written — the two other places
  // that assert leak at zero both build worlds without that file. The
  // declarations are now in the two packs that perform the crossings.
});

const GATES: { name: string; targets: string; mut: Mut[]; expect: (m: World) => void }[] = [
  {
    name: 'g1 a modelled mechanism loses its rule row',
    targets: 'guard_unmodelled[audit]',
    mut: [{ find: 'guard_kind(if_statement,               consequent).', replace: '' }],
    expect: (m) => {
      // the kind still carries a MODELLED mechanism and no rule reaches it
      assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), []);
      // ...because `alternate` still names it. Delete both and it fires:
    },
  },
  {
    name: 'g2 a kind carrying a modelled mechanism is reached by no rule',
    targets: 'guard_unmodelled[audit]',
    mut: [
      { find: 'guard_kind(if_statement,               consequent).', replace: '' },
      { find: 'guard_kind(if_statement,               alternate).', replace: '' },
    ],
    expect: (m) => assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), ['if_statement']),
  },
  {
    name: 'g3 an arm declared for a field the scanner never emits',
    targets: 'guard_arm_unseen[audit]',
    mut: [{ find: 'guard_kind(for_of_statement,           body).',
            replace: 'guard_kind(for_of_statement,           bdoy).' }],
    expect: (m) => assert.deepEqual(m.q('guard_arm_unseen[audit](K, F)'),
      [['for_of_statement', 'bdoy']]),
  },
  {
    name: 'g4 a mechanism with no opinion at all',
    targets: 'mechanism_unanswered[audit]',
    // RE-AIMED 2026-09-06: `abrupt` used to be the one `mechanism_open` row and
    // deleting it was the mutant. It is modelled now and `mechanism_open` is
    // empty, so the same hole is opened from the other side — a mechanism that
    // is answered nowhere at all.
    mut: [{ find: 'mechanism_modelled(abrupt).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('mechanism_unanswered[audit](M)').flat(), ['abrupt']),
  },
  {
    name: 'g5 a suspension filed as a guard',
    targets: 'may_not_run over-reports when control that COMES BACK is called a guard',
    mut: [{ find: 'guard_kind(logical_expression,         right).',
            replace: 'guard_kind(logical_expression,         right).\n'
                   + 'guard_kind(await_expression,           argument).' }],
    expect: (m) => {
      const base0 = base().n('guarded[code](N)');
      assert.ok(m.n('guarded[code](N)') > base0,
        'the guarded set grows when a suspension is filed as a skip');
    },
  },
  {
    name: 'g7 an export kind the scanner never emits',
    targets: 'export_kind_unseen[audit]',
    mut: [{ find: 'export_kind(export_default_declaration).',
            replace: 'export_kind(export_defualt_declaration).' }],
    expect: (m) => {
      assert.deepEqual(m.q('export_kind_unseen[audit](K)').flat(), ['export_defualt_declaration']);
      // ...and the typo COSTS the answer in the DANGEROUS direction: a smaller
      // entry surface reports LIVE functions as maybe-dead. `bdeep` is behind
      // the corpus's only default export and nothing else calls it.
      const dead = (w: World) => new Set(w.q('may_not_be_reached[code](F)')
        .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
      assert.equal(dead(m).has('bdeep'), true, 'a live function reported unreachable');
      assert.equal(dead(base()).has('bdeep'), false, 'positive control: it is live in the base');
    },
  },
  {
    name: 'g8 a file with functions and no entry point at all',
    targets: 'no_entry_point[audit]',
    // withdraw the whole entry surface: every file still has functions, so all
    // three report, and the relation says WHICH — a count could not.
    mut: [{ find: 'entry_point[code](F) :- exported_fn[code](F).', replace: '' }],
    expect: (m) => {
      assert.deepEqual(m.q('no_entry_point[audit](File)').flat().sort(),
        // ...and gamma.mjs is NOT here, which is the relation being exact rather
        // than a file being forgotten: `no_entry_point` quantifies over
        // `fn_node`, and gamma.mjs is two `export *` lines with no function in
        // it at all. It was added to this list by hand when the file joined the
        // corpus and the list is measured now — a file with no function cannot
        // be in a relation that ranges over functions.
        ['alpha.mjs', 'beta.mjs', 'delta.mjs', 'shapes.ts']);
      assert.equal(base().n('no_entry_point[audit](File)'), 0, 'positive control');
    },
  },
  {
    name: 'g6 a statement-sequence field the scanner never emits',
    targets: 'stmt_seq_unseen[audit]',
    mut: [{ find: 'stmt_seq_field(consequent).', replace: 'stmt_seq_field(conseqeunt).' }],
    expect: (m) => {
      assert.deepEqual(m.q('stmt_seq_unseen[audit](F)').flat(), ['conseqeunt']);
      // ...and the typo COSTS a real answer — but NOT one `may_not_run` can see,
      // which is the measurement this mutant was written to record. A switch
      // case's statements are already `guarded` as a skip-arm, so the may-set is
      // byte-identical either way; only `after_abrupt`, which says NEVER rather
      // than MAY, distinguishes the two worlds. The weaker consumer is
      // structurally unable to check the stronger relation's field vocabulary.
      // 2 -> 4 -> 5 on 2026-09-06: `abrupt_at` gained two more sources the same
      // day (a call that always throws, then an accessor read whose getter
      // does), so the field typo now costs one of five. The DELTA is the
      // assertion; the totals are the control and they move with the corpus.
      assert.equal(m.n('after_abrupt[code](S)'), 4, 'the switch-case answer is gone');
      assert.equal(base().n('after_abrupt[code](S)'), 5, 'positive control: it was there');
      const names = (w: World) => new Set(w.q('may_not_run[code](F)')
        .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
      assert.deepEqual([...names(m)].sort(), [...names(base())].sort(),
        'and may_not_run cannot tell — the arm already covered it');
    },
  },
];

for (const g of GATES) test(`${g.name} — ${g.targets}`, () => g.expect(build(g.mut)));

test('every gate this layer declares has a mutant aimed at it', () => {
  const heads = new Set([...read('rules/js-controlflow.rofl').matchAll(/^([a-z_]+)\[audit\]\(/gm)]
    .map((m) => m[1]));
  const named = new Set(GATES.flatMap((g) => [...g.targets.matchAll(/([a-z_]+)\[audit\]/g)]
    .map((m) => m[1])));
  assert.deepEqual([...heads].filter((h) => !named.has(h)).sort(), [],
    'a gate with no mutant aimed at it');
});

// ---------------------------------------------------------------------------
// 3. WHAT THE LAYER SAYS ABOUT THE RUN. This is why it earns its cells.

// ---------------------------------------------------------------------------
// 3b. THE TRANSITIVE WALK, and the four clauses it rests on.
//
// Six directed mutants were run and six died. Two are recorded here rather than
// kept, because they die on a WEAKER signal than the answer: dropping the
// top-level seed loses only `seed` (110 reachable instead of 111), and dropping
// `not in_fn` from the export surface takes entry points 27 -> 28 while the
// dead set does not move at all — a nested closure inside an exported function
// becomes an entry point and changes nothing, so that clause's precision is
// defended by a count and not by an answer. Saying so is cheaper than a mutant
// that asserts a count nobody reads.
const REACH: { name: string; mut: Mut[]; expect: (m: World, base: World) => void }[] = [
  {
    name: 'r1 the export surface stops being a seed',
    mut: [{ find: 'reachable[code](F) :- entry_point[code](F).', replace: '' }],
    expect: (m) => assert.equal(m.n('reachable[code](F)'), 1,
      'without the seed the walk has nowhere to start: one top-level call'),
  },
  {
    name: 'r2 the walk stops after one step',
    mut: [{ find: `reachable[code](F) :- reachable[code](G), nearest_v[flow](G, C), resolves[code](C, F),
                      not guarded[code](C).`, replace: '' }],
    expect: (m, b) => {
      assert.equal(m.n('reachable[code](F)'), m.n('entry_point[code](F)') + 1,
        'only the entry points and the top-level call remain');
      assert.ok(m.n('reachable[code](F)') < b.n('reachable[code](F)'));
    },
  },
  {
    name: 'r3 the walk crosses a guard',
    mut: [{ find: `reachable[code](G), nearest_v[flow](G, C), resolves[code](C, F),
                      not guarded[code](C).`,
            replace: 'reachable[code](G), nearest_v[flow](G, C), resolves[code](C, F).' }],
    // ONE NAME SURVIVES the guard being ignored, and it is the right one:
    // `lateThrow` is called only from `boom`, and `boom` is returned rather
    // than called. That is unreachability with no guard anywhere in it, so no
    // amount of ignoring guards can reach it — which makes it a better
    // statement than the zero this asserted before the propagation fixtures.
    expect: (m) => assert.deepEqual(m.q('may_not_be_reached[code](F)')
      .flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n)), ['lateThrow'],
      'the only thing left is unreachable for a reason that is not a guard'),
  },
  {
    name: 'r4 every function is an entry point',
    mut: [{ find: 'entry_point[code](F) :- exported_fn[code](F).',
            replace: 'entry_point[code](F) :- fn_node[code](F).' }],
    expect: (m) => assert.equal(m.n('may_not_be_reached[code](F)'), 0,
      'a seed that is everything answers nothing — the failure mode the item feared'),
  },
];

for (const g of REACH) test(`${g.name} — reachable[code]`, () => g.expect(build(g.mut), base()));

// ---------------------------------------------------------------------------
// 3c. A CALL IS AN EXIT (w_exception_flow), and the mutant set is the story.
//
// SEVEN MUTANTS, and the first run killed THREE. The four survivors all said the
// same thing — the corpus had no case that could tell the difference — so four
// fixtures were written and every one of them died on the second run. That is
// the sequence this repository asks for: a survivor is a missing witness before
// it is a missing rule.
//
// ONE SURVIVED FOR A DIFFERENT REASON AND IT IS THE ONE WORTH KEEPING IN MIND.
// `m6` (read the try's `handler` where the rule reads its `block`) died on the
// first run and then SURVIVED the second, because the `rethrown` fixture added
// a throw inside a handler and the two errors swapped places — one row lost,
// one row gained, the COUNT unmoved. The harness was comparing counts. Naming
// the rows killed it again: base is `caught<-559`, the mutant is `inner<-526`.
// A fixture can blind a mutant, and only a named row notices.
const EXIT: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'e1 a function with a return is called one that always throws',
    mut: [{ find: 'always_throws[code](F) :- top_throw[code](F), not has_return[code](F).',
            replace: 'always_throws[code](F) :- top_throw[code](F).' }],
    expect: (m, b) => {
      assert.equal(m.n('always_throws[code](F)'), b.n('always_throws[code](F)') + 1);
      assert.equal(names(m).has('alsoRuns'), true, 'a live function goes dead');
      assert.equal(names(b).has('alsoRuns'), false, 'positive control');
    },
  },
  {
    name: 'e2 a throw anywhere is read as a throw at the top level',
    mut: [{ find: `top_throw[code](F)     :- fn_node[code](F), ast_child[code](F, body, 0, B),
                          ast_child[code](B, body, _, S),
                          ast_node[code](S, throw_statement, _, _).`,
            replace: `top_throw[code](F)     :- fn_node[code](F), ast_within[code](F, S),
                          ast_node[code](S, throw_statement, _, _).` }],
    expect: (m, b) => {
      assert.equal(names(m).has('stillRuns'), true, 'a nested throw is read as unconditional');
      assert.equal(names(b).has('stillRuns'), false, 'positive control');
    },
  },
  {
    name: 'e3 a try no longer stops the exit',
    mut: [{ find: ',\n                            not try_stops[code](C, S).', replace: '.' }],
    expect: (m, b) => {
      assert.equal(names(m).has('afterTheTry'), true, 'code after a catching try goes dead');
      assert.equal(names(b).has('afterTheTry'), false, 'positive control');
    },
  },
  {
    name: 'e4 the exit escapes its own function',
    mut: [{ find: `abrupt_at[code](B, F, I) :- throwing_call[code](C), nearest_v[flow](G, C),
                            ast_within[code](G, S), ast_within[code](S, C),`,
            replace: 'abrupt_at[code](B, F, I) :- throwing_call[code](C), ast_within[code](S, C),' }],
    expect: (m, b) => {
      // the walk reaches the module's own statement list and kills the rest of it
      assert.ok(m.n('after_abrupt[code](S)') > b.n('after_abrupt[code](S)') * 5,
        `after_abrupt ${b.n('after_abrupt[code](S)')} -> ${m.n('after_abrupt[code](S)')}`);
      assert.equal(names(m).has('apply2'), true, 'a function nothing throws near goes dead');
    },
  },
  {
    name: 'e5 every call is an exit, whatever the callee does',
    mut: [{ find: 'resolves[code](C, F),\n                          always_throws[code](F).',
            replace: 'resolves[code](C, F).' }],
    expect: (m, b) => assert.ok(m.n('throwing_call[code](C)') > b.n('throwing_call[code](C)') * 20,
      `throwing_call ${b.n('throwing_call[code](C)')} -> ${m.n('throwing_call[code](C)')}`),
  },
  {
    name: 'e6 the handler is read as the block the try guards',
    mut: [{ find: 'ast_child[code](T, block, 0, B).', replace: 'ast_child[code](T, handler, 0, B).',
            file: 'rules/js-dataflow.rofl' }],
    // NAMED, not counted: this mutant survives a count. See the note above.
    expect: (m, b) => assert.notDeepEqual(caught(m), caught(b),
      'the pair changes identity while the count does not'),
  },
  {
    name: 'e7 a throw inside a handler is offered to its own clause',
    mut: [{ find: 'thrown_in[flow](T, V)    :- try_block[flow](T, B), ast_within[code](B, Th),',
            replace: 'thrown_in[flow](T, V)    :- ast_node[code](T, try_statement, _, _), ast_within[code](T, Th),',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.equal(caught(m).length, caught(b).length + 1, 'a rethrow becomes its own source');
      assert.equal(m.n('catch_from_call[flow](P)'), b.n('catch_from_call[flow](P)') - 1);
    },
  },
];


for (const g of EXIT) test(`${g.name} — a call is an exit`, () => g.expect(build(g.mut), base()));

// ---------------------------------------------------------------------------
