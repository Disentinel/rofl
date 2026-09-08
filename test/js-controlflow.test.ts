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
import { parse } from '@babel/parser';
import { scan, PARSER_PLUGINS } from '../scanners/js_ast.ts';
import { build, base, edges, names, caught, read, FILES, FACTS, RULES } from './js-corpus-world.ts';
import type { Mut, World } from './js-corpus-world.ts';

/** the functions NAMED by a call sitting in a statement `after_abrupt` reports.
 *
 *  A STATEMENT HAS NO NAME, so every assertion about statement order in this
 *  file used to be a count — and a count of statements is a measurement of the
 *  corpus, which took `after_abrupt` from 5 to 19 the day a labelled-control
 *  fixture landed without a single one of those assertions having anything to
 *  say. The pattern alpha.mjs already established for the fixtures themselves is
 *  the remedy: put a distinctly named call in the position under study and read
 *  the CALLEE's name back through `resolves`. */
const afterAbrupt = (w: World): string[] => {
  const out: string[] = [];
  for (const [s] of w.q('after_abrupt[code](S)'))
    for (const c of [s, ...w.q(`ast_within[code](${s}, C)`).map((r) => r[0])])
      for (const [f] of w.q(`resolves[code](${c}, F)`))
        for (const [n] of w.q(`fn_name[code](${f}, N)`)) out.push(n);
  return [...new Set(out)].sort();
};


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
  // 269 -> 272 on 2026-09-08: `object_pattern` entered the vocabulary with
  // destructuring, and this world declares three layers plus the one the fact
  // opens.
  // 341 -> 344 on 2026-09-08: `class_accessor_property` entered the vocabulary
  // with the decorator plugin, and this world declares three layers before the
  // fact opens the fourth.
  // 344 -> 348 and 449 -> 453 on 2026-09-08 (w_meta_property): `meta_property`
  // is REFINED at three layers now, and a refined kind trades its one `none`
  // cell for one per shape, so a fine count moves without any kind entering the
  // vocabulary at all.
  //
  // AND THE TWO LITERALS ARE GONE, which is the conversion this comment block
  // has been arguing for six times over. They were "a positive control that the
  // worlds are the ones the identity was measured on", and a number that four
  // separate items have had to re-derive is not controlling anything — it is
  // f_a_pin_that_moves_with_the_corpus_is_measuring_the_corpus, and with agents
  // in parallel it is also a merge that is wrong on every branch. The COARSE
  // matrix is `node_kind x layer` by its own rule and cannot move except with
  // the vocabulary, so it says the same thing and stays true.
  assert.equal(without.n('cell[audit](A, K, L)'), without.n('node_kind(A, K)') * 3,
    'positive control: the coarse matrix before the fact is kinds x three layers');
  assert.equal(withIt.n('cell[audit](A, K, L)'), withIt.n('node_kind(A, K)') * 4,
    'positive control: and kinds x four layers after');
  assert.ok(before > 0 && after > before, `the fine matrix grew: ${before} -> ${after}`);

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
  // MOVED 2026-09-07 (w_cf_suspension): `waived` -> `modelled`, and the pair is
  // flipped rather than deleted so the closure is visible in the diff. The
  // waiver's reason — `a_control_returns_so_the_site_still_runs` — asserted that
  // the awaited thing settles, which this layer cannot decide and never
  // checked, and a fixture that suspends forever reddened the acceptance gate
  // within one run.
  assert.equal(verdicts.get('await_expression'), 'modelled');
  assert.equal(verdicts.get('yield_expression'), 'modelled', 'both kinds, one rule');
  assert.deepEqual(m.q('handled(js, await_expression, controlflow, R)').flat(), ['r_suspension']);
  assert.equal(m.n('reason[audit](js, await_expression, none, controlflow, R)'), 0);
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
  // THE CONTROL MOVED THREE TIMES AND IS NOT A CELL ANY MORE. It named
  // `throw_statement x dataflow`, then `catch_clause x dataflow` — both closed
  // by w_exception_flow on 2026-09-06 — and then `decorator x dataflow`, with
  // the sentence "`decorator` is in nobody's queue path". THAT WAS FALSE WHEN IT
  // WAS WRITTEN: facts/worklist.rofl already carried
  // `claim(queued, js, decorator, none, dataflow,
  // w_decorator_replaces_its_target)`, and that item closed the cell on
  // 2026-09-08. Every open cell in this model is claimed by name — `unqueued`
  // is empty and the queue's own audits say so — so there is NO cell that is in
  // nobody's queue path, and a control aimed at one is aimed at the work.
  //
  // WHAT THE CONTROL IS ACTUALLY FOR is that `not_yet` has not gone extinct
  // along with this item, and that is a FLOOR over the whole matrix rather than
  // a name. It cannot chase the work, because the work would have to close
  // every unknown in the language to move it.
  assert.ok(m.n('reason[audit](js, K, S, L, not_yet)') > 0,
    'not_yet went extinct — every unknown is explained, or the default broke');
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
      // does), so the field typo now costs one of five.
      // CONVERTED TO A NAME 2026-09-08, and the conversion is the rule this
      // repository already wrote down: a pair of totals moves whenever ANY
      // fixture lands — the labelled-control work took them 5 -> 19 without
      // touching a switch — so what they were standing in for is written out
      // instead. `neverCased` is the corpus's one callee behind a return inside
      // a switch case, and it is exactly what the field typo costs.
      assert.deepEqual(afterAbrupt(base()).filter((n) => !afterAbrupt(m).includes(n)),
        ['neverCased'], 'the switch-case answer, and only it, is gone');
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
    // NAMED RATHER THAN COUNTED, AND THE NAMES CAME FROM THREE BRANCHES AT ONCE.
    // This read `=== 1, one top-level call` and every branch that landed on
    // 2026-09-08 added a start the grammar forces: `decoOnce` from a CLASS-LEVEL
    // decorator (un-enclosed by construction, and only visible once `top_call`
    // was corrected to key on `site` rather than `call_site`); `mountOf` from a
    // heritage clause, `class extends mountOf()`, which calls when the module is
    // evaluated; `forge` and `sealed` from a static block and a STATIC field
    // initialiser, neither of which sits in a function; and `hammered` one hop
    // on from `forge` through the recursive arm this mutant leaves alone.
    //
    // A COUNT WOULD HAVE SAID `6` AND NOTHING ELSE. The set says which, and its
    // merge from three branches was a union anyone could compute.
    expect: (m) => assert.deepEqual(m.q('reachable[code](F)')
      .flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n)).sort(),
      ['decoFerrule', 'decoOnce', 'forge', 'hammered', 'mountOf', 'sealed', 'seed'],
      'without the seed the walk starts only where the grammar forces it to'),
  },
  {
    name: 'r2 the walk stops after one step',
    mut: [{ find: `reachable[code](F) :- reachable[code](G), nearest_v[flow](G, C), resolves[code](C, F),
                      not guarded[code](C).`, replace: '' }],
    expect: (m, b) => {
      // NAMED RATHER THAN OFFSET, from the same three branches as r1 — and this
      // one is ONE HOP SHORTER, which is what tells the two mutants apart:
      // `hammered` is reached from `forge` and is NOT here, because this is the
      // arm that takes the hop.
      assert.deepEqual(m.q('reachable[code](F)')
        .filter(([f]) => m.n(`entry_point[code](${f})`) === 0)
        .flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n)).sort(),
        ['decoFerrule', 'mountOf', 'sealed', 'seed'],
        'only the entry points and the TOP-LEVEL calls remain');
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
    // FOUR MORE ON 2026-09-08 (w_class_fields), and they sharpen the statement
    // rather than blunt it: `inked`, `minted`, `punched` and `stamped` are called
    // from NON-STATIC field initialisers, whose only path into the walk is the
    // top-level seed arm — and that arm carries its OWN `not guarded`, which this
    // mutant does not touch. So they are unreachable here for the same kind of
    // reason `lateThrow` is: nothing this mutation relaxes can reach them.
    expect: (m) => assert.deepEqual(m.q('may_not_be_reached[code](F)')
      .flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n)).sort(),
      ['inked', 'lateThrow', 'minted', 'punched', 'stamped'],
      'what is left is unreachable for reasons the relaxed arm cannot touch'),
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


// ---------------------------------------------------------------------------
// A SUSPENSION IS A POINT AFTER WHICH THE REST MAY NOT RUN.
//
// This layer WAIVED `suspend` until 2026-09-07, with the reason
// `a_control_returns_so_the_site_still_runs`. That is a claim about the
// PROGRAM: control comes back only if the awaited thing settles and only if a
// consumer asks a generator for another value, and neither is decidable here.
// Every await in the corpus settled, so the reason had never been exercised.
//
// THE SITE CAME FIRST AND THE GATE WENT RED BEFORE A RULE EXISTED. `useStall`
// awaits a promise nothing resolves and then calls `afterStall`; the acceptance
// in test/js-controlflow-scope.test.ts reported `a function the model calls,
// the runtime never entered, and nothing explains`. Measured before that: the
// runtime enters `useStall`, never enters `afterStall`, and the process still
// exits — an async function suspended forever holds nothing open, which is what
// makes the fixture safe to put in a suite.
/** `may_not_run` by name, sorted — `names` returns a Set and every
 *  comparison below is a set difference. */
const mnr = (w: World) => [...names(w)].sort();
const SUSPEND_AT = `suspend_at[code](B, F, I) :- transfer_mechanism(K, suspend), ast_node[code](X, K, _, _),
                             nearest_v[flow](G, X), ast_within[code](G, S),
                             ast_within[code](S, X),
                             stmt_seq_field(F), ast_child[code](B, F, I, S).`;
const SUSPEND: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 's1 the guarded arms for a suspension are deleted',
    mut: [{ find: `guarded[code](S) :- after_suspend[code](S).
guarded[code](N) :- after_suspend[code](S), ast_within[code](S, N).` , replace: '' }],
    expect: (m, b) => {
      assert.deepEqual(mnr(b).filter((n) => !mnr(m).includes(n)),
        ['afterStall', 'alef', 'pickedB'], 'the answer and its two safe over-covers');
      // THE COLUMN THAT KEEPS THIS APART FROM DELETING `suspend_at` ITSELF: the
      // rows are still derived here, only nothing reads them.
      assert.equal(m.n('suspend_at[code](B, F, I)'), b.n('suspend_at[code](B, F, I)'));
      assert.equal(m.n('after_suspend[code](S)'), b.n('after_suspend[code](S)'));
      assert.ok(b.n('guarded[code](S)') > m.n('guarded[code](S)'));
    },
  },
  {
    name: 's3 the order test is reversed',
    mut: [{ find: 'ast_child[code](B, F, J, S), I < J.',
            replace: 'ast_child[code](B, F, J, S), J < I.' }],
    // EVERYTHING BEFORE THE SUSPENSION INSTEAD OF AFTER IT, which is not a
    // smaller answer but a different and much larger one: a function body's
    // first statements are guarded by an await further down.
    expect: (m, b) => {
      // TWO NAMES JOINED 2026-09-08 with the inert-statement fixture, and they
      // are the same claim as the four that were here: `pastEmpty` and
      // `pastDebugger` sit after a `return` in their own statement lists, so
      // reversing the order test loses them along with the rest. What makes them
      // worth having is the position of the statements BETWEEN — a bare `;` and
      // a `debugger` — which is the only site in the corpus proving an inert
      // statement consumes an index like any other.
      assert.deepEqual(mnr(b).filter((n) => !mnr(m).includes(n)).sort(),
        ['after', 'neverReached', 'pastDebugger', 'pastEmpty', 'unlit', 'unreadable']);
      // ...AND THE OTHER DIRECTION IS THE POINT, WRITTEN AS NAMES. The reversal
      // is not a smaller answer, it is a different and much larger one: every
      // one of these always runs, and is reported may-not because a suspension
      // FURTHER DOWN its own statement list now guards what comes before it.
      // `thrower` and `mkAlef` are the plainest — both are called from the first
      // statement of a body whose await is on a later line.
      // WAS A COUNT (`> 8`) AND A RATIO (`guarded x 4`) UNTIL 2026-09-08, and
      // both were measuring the corpus: the labelled-control fixture took
      // `guarded` 320 -> 345 in the base while the mutant world grew by less, so
      // a ratio chosen when the corpus was smaller went red without the mutant's
      // behaviour changing at all.
      // ...AND `readLimit` JOINED IT 2026-09-08 (w_update_and_literals), a
      // fifteenth name and the same claim: it is called from a `for`'s TEST,
      // which always runs, and the reversed order test makes the statements
      // before a later suspension guard it. A named set grown by a second item.
      assert.deepEqual([...new Set(mnr(m).filter((n) => !mnr(b).includes(n)))],
        ['broken', 'callsSent', 'chooser', 'iterator', 'mark', 'mkAlef',
         'nestedThrow', 'outerGen', 'pick', 'read', 'readLimit', 'seenEmpty', 'tag',
         'thrower', 'topThrowWithReturn']);
      assert.ok(m.n('guarded[code](S)') > b.n('guarded[code](S)'),
        `guarded ${b.n('guarded[code](S)')} -> ${m.n('guarded[code](S)')}`);
    },
  },
  {
    name: 's4 the suspension is not confined to its own function',
    mut: [{ find: `nearest_v[flow](G, X), ast_within[code](G, S),
                             ast_within[code](S, X),`,
            replace: `ast_within[code](S, X),` }],
    // WHERE THE RULE COULD NOT LOOK, asked of it before it was believed. Without
    // the confinement an `await` INSIDE a function guards every statement after
    // that function's own declaration at module level — a suspension of the
    // MODULE, which is not what happened. The throwing-call arm of `abrupt_at`
    // carries the same literal for the same reason.
    expect: (m, b) => {
      assert.deepEqual(mnr(b).filter((n) => !mnr(m).includes(n)), [], 'nothing is lost');
      assert.ok(mnr(m).filter((n) => !mnr(b).includes(n)).length > 50,
        'the whole module after the first async function goes may-not-run');
      assert.ok(m.n('after_suspend[code](S)') > b.n('after_suspend[code](S)') * 20,
        `after_suspend ${b.n('after_suspend[code](S)')} -> ${m.n('after_suspend[code](S)')}`);
    },
  },
  {
    name: 's5 only `await` suspends and `yield` is forgotten',
    mut: [{ find: 'suspend_at[code](B, F, I) :- transfer_mechanism(K, suspend), ast_node[code](X, K, _, _),',
            replace: 'suspend_at[code](B, F, I) :- ast_node[code](X, await_expression, _, _),' }],
    // THE MUTANT THAT SAYS THE DERIVATION EARNS ITS KEEP. The rule reads
    // `transfer_mechanism(K, suspend)` rather than naming a kind, so the
    // vocabulary decides which kinds suspend and the next kind filed under
    // `suspend` is covered without anybody remembering. Hard-coding `await`
    // loses the generator half and exactly one name with it.
    expect: (m, b) => {
      assert.deepEqual(mnr(b).filter((n) => !mnr(m).includes(n)), ['pickedB'],
        'the name behind a `yield` rather than behind an `await`');
      assert.ok(b.n('suspend_at[code](B, F, I)') > m.n('suspend_at[code](B, F, I)') * 2);
    },
  },
];

// TWO MUTANTS WERE MEASURED AND NOT KEPT, and both measurements say something.
//
//   DELETING `suspend_at` ITSELF loses exactly the three names s1 loses. It is
//   the producer where s1 is the consumer, and no query over this corpus can
//   tell them apart — the difference is that the RELATION stops existing, which
//   the kernel reports as `unpopulatable` rather than as a missing row. That is
//   a fact about the kernel and not about the model, so it belongs in the note
//   rather than in a second mutant with a borrowed oracle.
//
//   NOT CARRYING THE SEQUENCE FIELD — `suspend_at[code](B, _, I)` against
//   `ast_child[code](B, _, J, S)`, so a suspension in one field could reach a
//   statement in another — SURVIVES, byte for byte. The same mutant against
//   `after_abrupt` survived for the same structural reason and it is recorded
//   there: no node kind in this grammar carries two statement-sequence fields
//   whose contents could reach each other, so the literal is load-bearing
//   against a language that does not exist. Kept in the rule for the reason it
//   is kept there, and named here so the next reader does not re-measure it.

for (const g of SUSPEND) test(`${g.name} — a suspension may not resume`, () => g.expect(build(g.mut), base()));

test('the suspension is answered, and the layer waives nothing it cannot decide', () => {
  const m = base();
  // THE POSITIVE HALF. `afterStall` is called after an await on a promise
  // nothing resolves; the runtime never enters it and the model now says so.
  assert.ok(mnr(m).includes('afterStall'), 'the code after a suspension may not run');
  // ...and BOTH kinds carry it, which is what the vocabulary buys: the rule
  // names no kind at all.
  assert.deepEqual(m.q('transfer_mechanism(K, suspend)').map(([k]) => k).sort(),
    ['await_expression', 'yield_expression']);
  assert.equal(m.n('mechanism_unanswered[audit](M)'), 0);
  assert.equal(m.n('guard_unmodelled[audit](K)'), 0,
    'declaring the mechanism modelled without wiring its kinds is what this audit caught');
});

// ---------------------------------------------------------------------------
// 5. A LABEL IS A BOUNDARY AN ORDINARY BREAK CANNOT CROSS — queue item
//    w_labelled_control, 2026-09-08.
//
// THE CORPUS HELD ZERO LABELS UNTIL THIS ITEM, so what the layer did with
// `break outer` was a guess, and the fixture came before the rule for the sixth
// item running. What the guess would have been is recorded here as the FIRST
// assertion rather than in a comment: the ordinary sibling arm covers a
// labelled break exactly as it covers a plain one, and everything a label is
// FOR was invisible.

const LABEL_ARM = `abrupt_at[code](B, F, I)  :- label_target[code](X, LS), ast_within[code](LS, S),
                             ast_within[code](S, X), stmt_seq_field(F),
                             ast_child[code](B, F, I, S).`;
const LABEL_REF = `label_ref[code](X, N)     :- abrupt_kind(K), ast_node[code](X, K, _, _),
                             ast_child[code](X, label, 0, I), ast_attr[code](I, name, N).`;
const LABEL_TGT = `label_target[code](X, LS) :- label_ref[code](X, N), label_name[code](LS, N),
                             ast_within[code](LS, X).`;

test('a labelled transfer leaves the statement the label names, and nothing further', () => {
  const m = base();
  // WHAT ONLY A LABEL REACHES. Each of these three is a call whose statement is
  // a SIBLING OF THE LOOP the break leaves, one statement list further out than
  // the reference's own — the position an unlabelled break cannot affect.
  for (const n of ['pastLabelledBreak', 'pastLabelledContinue', 'pastLabelledBlock'])
    assert.ok(afterAbrupt(m).includes(n), `${n}: a labelled transfer left its list`);
  // ...AND THE WALK STOPS AT THE LABEL. `beyondLabel` and `afterBlock` follow
  // the labelled statement itself and run; a walk that did not stop would take
  // them, which is exactly what mutant l2 below does.
  for (const n of ['beyondLabel', 'afterBlock'])
    assert.equal(afterAbrupt(m).includes(n), false, `${n}: after the label, and it runs`);
  // ...AND AN UNLABELLED BREAK STILL LEAVES ONE LOOP. `plainBreak` carries an
  // unreferenced `unused:` label directly above it, so the only thing keeping
  // `beyondPlainBreak` out is the `label` CHILD the reference does not have.
  assert.equal(afterAbrupt(m).includes('beyondPlainBreak'), false,
    'an unlabelled break leaves the inner loop and nothing else');
  assert.ok(afterAbrupt(m).includes('pastPlainBreak'),
    'positive control: its own statement list is still killed');
  // ...AND THE TARGET IS THE LABEL NAMED, NOT THE NEAREST. `twoLabels` breaks to
  // the INNER of two differently named labels, so `pastInnerLabel` runs.
  assert.equal(afterAbrupt(m).includes('pastInnerLabel'), false,
    '`break linner` leaves the inner loop, so the outer body continues');
  assert.ok(afterAbrupt(m).includes('pastInnerBreak'), 'positive control');

  // THE VERDICT AND ITS RULE, both pinned, so a silent regression to `not_yet`
  // cannot pass by leaving one of them true.
  const verdicts = new Map(m.q('verdict[audit](js, K, none, controlflow, V)').map(([k, v]) => [k, v]));
  assert.equal(verdicts.get('labeled_statement'), 'modelled');
  assert.deepEqual(m.q('handled(js, labeled_statement, controlflow, R)').flat(),
    ['r_labelled_boundary']);
  assert.equal(m.n('reason[audit](js, labeled_statement, none, controlflow, R)'), 0);
  // ...and the mechanism is a SIXTH one rather than `labeled_statement` filed
  // under `abrupt`: a label receives a transfer instead of performing one.
  assert.deepEqual(m.q('transfer_mechanism(labeled_statement, M)').flat(), ['label_boundary']);
  assert.deepEqual(m.q('transfer_mechanism(K, label_boundary)').flat(), ['labeled_statement']);
});

test('a labelled BLOCK is where the may-set was too narrow, not merely imprecise', () => {
  const m = base();
  // THE SHARPEST ROW OF THE ITEM. A labelled loop body is a `guard_kind` arm, so
  // `pastLabelledBreak` was in `guarded` on other grounds and the may-set was
  // already hedging — the label bought precision. A labelled BLOCK is not a
  // loop, not an arm and not a switch, so before this rule the model said
  // `pastLabelledBlock` RUNS, and the only path through its own block skips it.
  // A may-set too wide is a hedge; too narrow is a claim.
  assert.ok(mnr(m).includes('pastLabelledBlock'));
  const without = build([{ find: LABEL_ARM, replace: '' }]);
  assert.equal(mnr(without).includes('pastLabelledBlock'), false,
    'positive control: without the arm the model asserts it runs');
  assert.ok(mnr(without).includes('pastLabelledBreak'),
    '...while the loop case was covered by the guard arm either way');
});

// SEVEN MUTANTS, EACH WITH ITS OWN ORACLE. Two of them needed sites that did
// not exist and were built for them, because with one label per function a rule
// that joins on the NAME and a rule that takes any enclosing label are the same
// rule: `twoLabels` breaks to the inner of two differently named labels, and
// `plainBreak` carries an unreferenced label over an unlabelled break.
const LABELS: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'l1 the labelled arm is gone',
    mut: [{ find: LABEL_ARM, replace: '' }],
    expect: (m, b) => assert.deepEqual(afterAbrupt(b).filter((n) => !afterAbrupt(m).includes(n)),
      ['pastConditionalLabelledBreak', 'pastLabelledBlock', 'pastLabelledBreak',
       'pastLabelledContinue'],
      'the four positions only a label reaches, and nothing else'),
  },
  {
    name: 'l2 the walk does not stop at the label',
    mut: [{ find: LABEL_ARM, replace: LABEL_ARM.replace('ast_within[code](LS, S),\n', '') }],
    // WITHOUT `ast_within(LS, S)` the walk runs to the module: `beyondLabel` and
    // `afterBlock` follow the labelled statement, `pastInnerLabel` follows the
    // inner label inside the outer loop, `beyondPlainBreak` is reached from a
    // break that names nothing there, and `seenEmpty` is in a different function
    // entirely — which is the tell that the boundary is not merely imprecise
    // without this literal, it is absent.
    // A LOWER BOUND AND NOT AN ENUMERATION, converted 2026-09-08: this mutant
    // deliberately walks to the MODULE, so its difference set contains every
    // top-level callee after the label in the file — which grows whenever anybody
    // appends a fixture to shapes.ts.txt, and did. The five names below are the
    // claim; the rest are the corpus.
    expect: (m, b) => {
      const extra = afterAbrupt(m).filter((n) => !afterAbrupt(b).includes(n));
      for (const n of ['afterBlock', 'beyondLabel', 'beyondPlainBreak', 'pastInnerLabel', 'seenEmpty'])
        assert.ok(extra.includes(n), `${n} is reached without the containment literal`);
      assert.deepEqual(afterAbrupt(b).filter((n) => !afterAbrupt(m).includes(n)), [],
        'and nothing is lost — the boundary is absent, not merely moved');
    },
  },
  {
    name: 'l3 the name join is dropped',
    mut: [{ find: LABEL_TGT,
            replace: LABEL_TGT.replace('label_name[code](LS, N)', 'label_name[code](LS, _)') }],
    expect: (m, b) => assert.deepEqual(afterAbrupt(m).filter((n) => !afterAbrupt(b).includes(n)),
      ['pastInnerLabel'], 'any enclosing label becomes the target, so the outer body dies too'),
  },
  {
    name: 'l4 the label child is not required',
    mut: [{ find: LABEL_REF,
            replace: `label_ref[code](X, N)     :- abrupt_kind(K), ast_node[code](X, K, _, _),
                             label_name[code](_, N).` }],
    // ...and this is the one `plainBreak`'s unreferenced `unused:` label exists
    // for: an unlabelled break now names every label there is, so it leaves a
    // statement it cannot leave. `pastInnerLabel` comes along because the same
    // mutation loses the name join too — the pair is what tells l3 and l4 apart.
    expect: (m, b) => assert.deepEqual(afterAbrupt(m).filter((n) => !afterAbrupt(b).includes(n)),
      ['beyondPlainBreak', 'pastInnerLabel']),
  },
  {
    name: 'l5 only break carries a label',
    mut: [{ find: LABEL_REF,
            replace: LABEL_REF.replace('abrupt_kind(K), ast_node[code](X, K, _, _)',
                                       'ast_node[code](X, break_statement, _, _)') }],
    // DERIVING FROM `abrupt_kind` RATHER THAN LISTING THE TWO KINDS is what this
    // measures: hard-code `break_statement` and `continue outer` stops being a
    // transfer, which is the defect `orphan_claim` paid for arriving one relation
    // over.
    expect: (m, b) => assert.deepEqual(afterAbrupt(b).filter((n) => !afterAbrupt(m).includes(n)),
      ['pastLabelledContinue']),
  },
  {
    name: 'l6 the mechanism loses the rule row that reaches its kind',
    mut: [{ find: 'guard_named[code](K)       :- transfer_mechanism(K, label_boundary).',
            replace: '' }],
    expect: (m) => assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), ['labeled_statement']),
  },
  {
    name: 'l7 the mechanism is answered nowhere at all',
    mut: [{ find: 'mechanism_modelled(label_boundary).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('mechanism_unanswered[audit](M)').flat(), ['label_boundary']),
  },
];

for (const g of LABELS) test(`${g.name} — a label bounds a transfer`, () => g.expect(build(g.mut), base()));

test('WHERE THE LABELLED ARM CANNOT LOOK: it walks up, and a walk crosses guards', () => {
  const m = base();
  // ASKED OF THE RULE BEFORE IT WAS BELIEVED, and answered with a row rather
  // than a sentence. `conditionalLabelledBreak` puts `break cond` under an `if`,
  // so `pastConditionalLabelledBreak` runs on every iteration whose test is
  // false — and `after_abrupt`, whose own comment says NEVER, names it anyway.
  //
  // THE ROW IS ATTRIBUTABLE TO THIS ARM: the reference is inside the `if`'s
  // consequent, a singular field with nothing after it, so the direct-sibling
  // arm derives nothing there and only the walking arm can produce it.
  assert.ok(afterAbrupt(m).includes('pastConditionalLabelledBreak'));
  const without = build([{ find: LABEL_ARM, replace: '' }]);
  assert.equal(afterAbrupt(without).includes('pastConditionalLabelledBreak'), false,
    'positive control: no other arm reaches that statement');
  // NOTHING DOWNSTREAM IS WRONG TODAY, which is why this is a recorded finding
  // and not a fix: both consumers of `after_abrupt` reach it through `guarded`,
  // a MAY-set that over-covers on purpose.
  assert.ok(m.q('guarded[code](N)').length > 0);
  // ...and the throwing-call arm has had the same walk since 2026-09-06.
  // f_after_abrupt_says_never_and_the_walking_arms_say_may owns the decision.
});

// ---------------------------------------------------------------------------
// 6. THE INERT STATEMENTS — queue item w_inert_statements, 2026-09-08.

test('an inert statement OCCUPIES a conditional position and CREATES none', () => {
  const m = base();
  const ids = (k: string) => m.q(`ast_node[code](N, ${k}, F, L)`).map(([n]) => n);
  const guarded = new Set(m.q('guarded[code](N)').map(([n]) => n));
  const arms = new Set(m.q('guard_arm[code](P, A)').map(([, a]) => a));
  const abrupt = new Set(m.q('after_abrupt[code](S)').map(([s]) => s));

  // THE ITEM'S NOTE SAID "no layer is LIKELY to have an opinion", and the
  // control-flow layer has one. `;` is a guard ARM twice over in the fixture —
  // the body of `for (const cell of xs) ;` and the consequent of an `if` — and
  // both an empty statement and a `debugger` sit after a `return`, where an
  // inert statement still consumes an index.
  const empties = ids('empty_statement');
  assert.ok(empties.length >= 4, 'positive control: the fixture put them in the corpus');
  assert.ok(empties.some((n) => arms.has(n)), 'a `;` can BE a guarded arm');
  assert.ok(empties.some((n) => abrupt.has(n)), '...and can sit after an abrupt transfer');
  assert.ok(empties.some((n) => guarded.has(n)));
  const dbg = ids('debugger_statement');
  assert.ok(dbg.length >= 2, 'positive control');
  assert.ok(dbg.some((n) => abrupt.has(n)));

  // WHAT NEITHER DOES IS TRANSFER. Not in the mechanism table, so no arm of this
  // layer can reach one, and `;` is the only statement the scanner emits with
  // ZERO children — nothing inside it for a guard to skip.
  for (const k of ['empty_statement', 'debugger_statement']) {
    assert.deepEqual(m.q(`transfer_mechanism(${k}, M)`).flat(), [],
      `${k} transfers nothing`);
    assert.equal(m.n(`verdict[audit](js, ${k}, none, controlflow, waived)`), 1);
  }
  for (const n of empties)
    assert.deepEqual(m.q(`ast_child[code](${n}, F, I, C)`), [],
      'an empty statement has no children at all');
  // ...with a positive control on the same query shape, so the emptiness is a
  // fact about `;` and not about the way it was asked.
  const block = m.q('ast_node[code](N, block_statement, F, L)')[0][0];
  assert.ok(m.q(`ast_child[code](${block}, F, I, C)`).length > 0);
});

test('the four layers were ASKED about the inert kinds, not assumed', () => {
  const m = base();
  const ids = (k: string) => m.q(`ast_node[code](N, ${k}, F, L)`).map(([n]) => n);
  const sites = new Set(m.q('site[code](X)').map(([x]) => x));
  const resolvesC = new Set(m.q('resolves[code](C, F)').map(([c]) => c));
  const valued = new Set(m.q('valued[flow](E)').map(([e]) => e));

  // THE POSITIVE CONTROLS FIRST, because an empty intersection is a fact about
  // the query until something proves the query can return rows at all.
  assert.ok(ids('call_expression').every((n) => sites.has(n)),
    'every call expression is a site');
  assert.ok(ids('identifier').some((n) => valued.has(n)), 'identifiers carry values');

  for (const k of ['labeled_statement', 'empty_statement', 'debugger_statement']) {
    const ns = ids(k);
    assert.ok(ns.length > 0, `positive control: ${k} is in the corpus`);
    assert.deepEqual(ns.filter((n) => sites.has(n)), [], `${k} is not a call or transfer site`);
    assert.deepEqual(ns.filter((n) => resolvesC.has(n)), [], `${k} resolves to nothing`);
    assert.deepEqual(ns.filter((n) => valued.has(n)), [], `${k} carries no value`);
  }
});

test('`with` has no site in this corpus, and the reason is a SETTING that was measured', () => {
  const m = base();
  // THE SCAN IS THE MEASUREMENT, not a sentence about strict mode. Under this
  // scanner's one configuration the file is LOST rather than incomplete, which
  // is why no fixture can hold a `with`.
  const refused = scan(`with (o) { p(); }`, { file: 'with.js' });
  assert.equal(refused.nodes, 0);
  assert.deepEqual([...refused.kinds], []);
  assert.match(refused.facts[0], /^ast_parse_error\[code\]\("with\.js", "'with' in strict mode/);
  // ...AND THE SAME SOURCE PARSES UNDER `script`, so the blocker is this
  // scanner's setting and not the parser's capability. That distinction is the
  // whole reason the four cells are left OPEN with an owner instead of waived:
  // `no possible site` would have been the defect
  // f_the_contract_excluded_one_property_in_the_whole_language paid for.
  const ok: any = parse(`with (o) { p(); }`, { sourceType: 'script', plugins: [...PARSER_PLUGINS] });
  assert.equal(ok.program.body[0].type, 'WithStatement');
  // ...and `unambiguous` would leave the present corpus untouched: every fixture
  // in it is chosen as a module, measured file by file.
  for (const [, disk] of FILES)
    assert.equal((parse(read(disk), { sourceType: 'unambiguous', plugins: [...PARSER_PLUGINS] }) as any)
      .program.sourceType, 'module', `${disk} is unambiguously a module`);
  // SO THE CELLS STAY OPEN AND OWNED. Four of them, one per layer, and the
  // model says so rather than a comment.
  assert.equal(m.n('ast_node[code](N, with_statement, F, L)'), 0);
  assert.deepEqual(m.q('verdict[audit](js, with_statement, none, L, not_modelled)')
    .map(([l]) => l).sort(), ['callgraph', 'controlflow', 'dataflow', 'modules']);
});
