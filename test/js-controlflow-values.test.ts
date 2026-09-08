// js-controlflow-values.test.ts — THE SECOND THIRD of the control-flow layer's
// mutants: an accessor that is a call wearing a read's syntax, the vocabulary
// FRAME, and what an exception PROPAGATES along a call edge.
//
// It is a separate file for a measured reason rather than a taxonomic one — see
// test/js-corpus-world.ts, which carries the construction all three share. The
// sections keep their original numbering (3d, 3e, 3f) so that a reader following
// a commit message finds them where it says they are.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, base, edges, names, caught, read, FILES, FACTS, RULES } from './js-corpus-world.ts';
import type { Mut, World } from './js-corpus-world.ts';

// 3d. AN ACCESSOR IS A CALL WEARING A READ'S SYNTAX (w_cf_accessor).
//
// SIX MUTANTS, FIVE KILLED ON THE FIRST RUN, and the survivor is the shape this
// loop has now met twice: `a4` drops the RECEIVER check — `o` may be the object
// that owns the accessor — and it changed nothing, because only one object in
// the corpus owned a property called `broken`, so any read of that key was the
// accessor whether the check was there or not. A clause defended by reasoning
// rather than by measurement, exactly like the `super` arm removed one item
// earlier — except that one was dead and this one is load-bearing. `shim`, a
// second object with a PLAIN property of the same name, is what tells them
// apart, and the mutant dies on a named function: `alsoReads`.
const ACC: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'c1 the accessor vocabulary loses `get`',
    mut: [{ find: 'accessor_kind("get").', replace: '' }],
    expect: (m, b) => {
      assert.equal(m.n('accessor_read[code](N, M)'), 0);
      assert.equal(names(m).has('unreadable'), false, 'the read stops being an exit');
      assert.equal(names(b).has('unreadable'), true, 'positive control');
    },
  },
  {
    name: 'c2 every member is read as an accessor',
    mut: [{ find: 'accessor_kind(K), ast_attr[code](M, kind, K).',
            replace: 'ast_attr[code](M, kind, _).' }],
    expect: (m, b) => assert.ok(m.n('accessor_of[flow](O, K, M)') > b.n('accessor_of[flow](O, K, M)') * 10,
      `accessor_of ${b.n('accessor_of[flow](O, K, M)')} -> ${m.n('accessor_of[flow](O, K, M)')}`),
  },
  {
    name: 'c3 the arm that makes a throwing getter an exit is deleted',
    mut: [{ find: 'throwing_call[code](N) :- accessor_read[code](N, M), always_throws[code](M).',
            replace: '' }],
    // PLANTED BEFORE THE ARM SHIPPED, which is the rule this loop adopted one
    // item ago: an arm nothing exercises cannot go red, so the mutant that
    // deletes it is what says whether it is coverage or decoration.
    expect: (m, b) => {
      assert.equal(names(m).has('unreadable'), false);
      assert.equal(names(b).has('unreadable'), true, 'positive control');
    },
  },
  {
    name: 'c4 the receiver is not checked',
    mut: [{ find: `accessor_read[code](N, M) :- accessor_of[flow](Obj, Key, M), member_node_v[flow](N),
                             selects[flow](N, Key), ast_child[code](N, object, 0, O),
                             may_be_node[flow](O, Obj).`,
            replace: `accessor_read[code](N, M) :- accessor_of[flow](Obj, Key, M), member_node_v[flow](N),
                             selects[flow](N, Key).` }],
    expect: (m, b) => {
      assert.equal(names(m).has('alsoReads'), true, 'a plain property of the same name reads as an accessor');
      assert.equal(names(b).has('alsoReads'), false, 'positive control');
    },
  },
  {
    name: 'c5 the mechanism is unanswered',
    mut: [{ find: 'mechanism_modelled(accessor_call).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('mechanism_unanswered[audit](M)').flat(), ['accessor_call']),
  },
  {
    name: 'c6 the kind is not named as reached',
    mut: [{ find: 'guard_named[code](member_expression).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), ['member_expression']),
  },
];

for (const g of ACC) test(`${g.name} — an accessor is a call`, () => g.expect(build(g.mut), base()));

// ---------------------------------------------------------------------------
// 3e. THE FRAME (w_vocabulary_frame): three ways a kind can be accounted for.
//
// SIX MUTANTS, SIX KILLED, and the harness needed two repairs before any of that
// was true — both the same shape, both caught by implausibility rather than by
// the harness itself. The first run reported six kills that were ANCHOR ERRORS,
// because the probe mutated only rule files and every anchor here is in
// `facts/js-kinds.rofl`. The second reported one survivor, because its oracle
// read `unqueued[audit]` — defined in `rules/worklist.rofl`, which that world
// does not load. THIS test lives here rather than in test/worklist.test.ts for
// the third instance of the same lesson: the plan world has NO CORPUS, so
// `vocabulary_gap` is empty in it no matter what the vocabulary says.
const FRAME: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'f1 an excluded kind is misspelled',
    mut: [{ find: 'not_a_construct(comment_line).', replace: 'not_a_construct(coment_line).',
            file: 'facts/js-kinds.rofl' }],
    expect: (m) => {
      assert.deepEqual(m.q('vocabulary_gap[audit](L, K)').map(([, k]) => k), ['comment_line'],
        'the kind is readmitted to nothing');
      assert.deepEqual(m.q('not_a_construct_unseen[audit](K)').flat(), ['coment_line'],
        '...and the typo is named, so the report is not just a number');
    },
  },
  {
    name: 'f2 a deferred kind is misspelled',
    // RE-AIMED 2026-09-07 AND THE RE-AIMING IS THE POINT. This used to MUTATE a
    // `frame_deferred` row, and every one of them was retired the day the ten
    // type nodes were declared — so the mutant expired with its anchor, exactly
    // as w_mutant_anchor_decay says a mutant anchored to a row somebody may
    // legitimately delete always will. It PLANTS its own deferral now: the
    // machinery is exercised whether or not the ledger currently defers
    // anything, and today it defers nothing.
    mut: [{ find: 'not_a_construct(file).',
            replace: 'not_a_construct(file).\nframe_deferred(tsunoin_type, w_type_surface).',
            file: 'facts/js-kinds.rofl' }],
    expect: (m) => {
      assert.deepEqual(m.q('frame_deferred_unseen[audit](K)').flat(), ['tsunoin_type'],
        'a deferral for a spelling the scanner never emits is named');
      assert.equal(m.n('vocabulary_gap[audit](L, K)'), 0,
        'and the real kind is declared, so the gap audit stays silent');
    },
  },
  {
    name: 'f3 a kind is declared AND excluded',
    mut: [{ find: 'not_a_construct(file).',
            replace: 'not_a_construct(file).\nnot_a_construct(class_body).',
            file: 'facts/js-kinds.rofl' }],
    // THE GAP AUDIT CANNOT SEE THIS, and that is the point of the pair: either
    // row silences it, so a contradiction reads as an answer.
    expect: (m) => {
      assert.deepEqual(m.q('declared_and_excluded[audit](K)').flat(), ['class_body']);
      assert.equal(m.n('vocabulary_gap[audit](L, K)'), 0, 'and the gap audit stays silent');
    },
  },
  {
    name: 'f4 a kind is declared AND deferred',
    // Planted rather than appended to an existing row, for the same reason f2 is.
    mut: [{ find: 'not_a_construct(file).',
            replace: 'not_a_construct(file).\nframe_deferred(unary_expression, w_type_surface).',
            file: 'facts/js-kinds.rofl' }],
    expect: (m) => {
      assert.deepEqual(m.q('declared_and_deferred[audit](K)').flat(), ['unary_expression']);
      assert.equal(m.n('vocabulary_gap[audit](L, K)'), 0);
    },
  },
  {
    name: 'f5 a declared kind loses one of its four verdicts',
    // THE ANCHOR MOVED WITHIN THE SAME ITERATION, and the move is the lesson:
    // all sixteen verdicts were first written into facts/js-kinds.rofl, and
    // `orphan_claim[audit]` reported eight of them — a claim about a cell that
    // does not exist, because that file is loaded in worlds that declare only
    // some of the layers. A verdict belongs in the pack that DECLARES ITS LAYER.
    mut: [{ find: 'ignored(js, class_body, callgraph, a_a_statement_is_not_a_callee).',
            replace: '', file: 'facts/js-callgraph.rofl' }],
    expect: (m, b) => {
      assert.deepEqual(m.q('verdict[audit](js, class_body, none, callgraph, V)').flat(),
        ['not_modelled']);
      assert.deepEqual(b.q('verdict[audit](js, class_body, none, callgraph, V)').flat(),
        ['waived'], 'positive control');
    },
  },
  {
    name: 'f6 the two exclusions stop being read',
    mut: [{ find: ',\n                                  not not_a_construct(K), not frame_deferred(K, _).',
            replace: '.', file: 'rules/js-model.rofl' }],
    // 13 -> 3 on 2026-09-07: the ten deferred type nodes are DECLARED now, so
    // only the three not-constructs are held out by an exclusion at all. The
    // deferral list is empty and its machinery is exercised by f2 and f4, which
    // plant a row instead of mutating one.
    expect: (m) => assert.equal(m.n('vocabulary_gap[audit](L, K)'), 3,
      'the three not-constructs come back'),
  },
];

for (const g of FRAME) test(`${g.name} — the frame`, () => g.expect(build(g.mut), base()));

// ---------------------------------------------------------------------------
// 3f. WHAT PROPAGATES (w_exn_propagation), and the seven clauses it rests on.
//
// SEVEN MUTANTS. Five died on the first run and the two survivors said the same
// thing they have said all session — the corpus had no case that could tell the
// difference. `makeThrower`/`boom` and the `midThrow` chain were written for
// exactly those two, and all seven die now, every one on a NAMED row.
const PROP: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'x1 the closure step is deleted',
    mut: [{ find: `may_throw[code](F) :- may_throw[code](G), resolves[code](C, G), nearest_v[flow](F, C),
                      not caught_here[code](C).`, replace: '' }],
    expect: (m, b) => assert.deepEqual(
      thrower(b).filter((f) => !thrower(m).includes(f)),
      ['Lit', 'boom', 'main', 'midThrow', 'useNested', 'useWithReturn'],
      'six names exist only because a throw travels an edge'),
  },
  {
    name: 'x2 a try no longer stops propagation',
    mut: [{ find: ', nearest_v[flow](F, C),\n                      not caught_here[code](C).',
            replace: ', nearest_v[flow](F, C).' }],
    expect: (m, b) => assert.deepEqual(
      thrower(m).filter((f) => !thrower(b).includes(f)),
      ['useCaught', 'useFuse', 'useGauge', 'useTry', 'useTwoHops'],
      'every function that CATCHES is reported as throwing'),
  },
  {
    name: 'x3 a try catches what a nested function calls',
    mut: [{ find: `caught_here[code](N)       :- in_try_block[code](TS, N), try_of[code](TS, F),
                              nearest_v[flow](F, N).`,
            replace: 'caught_here[code](N)       :- in_try_block[code](TS, N).' }],
    // `boom` is written inside a try block and RUNS ELSEWHERE. Without the
    // enclosing-function equality the model calls its throw caught.
    expect: (m, b) => assert.deepEqual(
      thrower(b).filter((f) => !thrower(m).includes(f)), ['boom']),
  },
  {
    name: 'x4 the handler is read as the block the try guards',
    mut: [{ find: 'ast_child[code](TS, block, 0, B), ast_within[code](B, N).',
            replace: 'ast_child[code](TS, handler, 0, B), ast_within[code](B, N).' }],
    expect: (m, b) => {
      assert.deepEqual(thrower(b).filter((f) => !thrower(m).includes(f)), ['rethrown'],
        'a throw in a handler stops being reported');
      assert.ok(thrower(m).length > thrower(b).length - 1, 'and five catchers start being');
    },
  },
  {
    name: 'x5 the value no longer travels the call edge',
    mut: [{ find: `caught_value[flow](P, V) :- catch_of[flow](T, H), catch_param[flow](H, P),
                            try_block[flow](T, B), ast_within[code](B, C),
                            resolves[code](C, G), thrown_by[flow](G, V).`, replace: '' }],
    expect: (m, b) => {
      assert.equal(caught(m).length, 1, 'only the lexically-thrown value is left');
      assert.equal(caught(b).length, 3, 'positive control');
      assert.equal(m.n('catch_from_host[flow](P)'), 3,
        'and all three catches read as host-sourced, which is the frontier reopening');
    },
  },
  {
    name: 'x6 the value closure step is deleted',
    mut: [{ find: `thrown_by[flow](F, V) :- thrown_by[flow](G, V), resolves[code](C, G),
                         nearest_v[flow](F, C), not caught_here[code](C).`, replace: '' }],
    // `midThrow` has no throw of its own, so only the transitive arm reaches it.
    expect: (m, b) => assert.deepEqual(
      caught(b).filter((c) => !caught(m).includes(c)).map((c) => c.split('<-')[0]),
      ['twoHop']),
  },
  {
    name: 'x7 the host class collapses into the call class',
    mut: [{ find: 'catch_from_host[flow](P) :- catch_from_call[flow](P), not caught_value[flow](P, _).',
            replace: 'catch_from_host[flow](P) :- catch_from_call[flow](P).',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.equal(m.n('catch_from_host[flow](P)'), b.n('catch_from_call[flow](P)'));
      assert.ok(b.n('catch_from_host[flow](P)') < b.n('catch_from_call[flow](P)'),
        'positive control: the two classes really are different sizes');
    },
  },
];

const thrower = (w: World) => w.q('may_throw[code](F)')
  .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)).sort();

for (const g of PROP) test(`${g.name} — what propagates`, () => g.expect(build(g.mut), base()));

test('the exception path is now sourced, and what is left has an owner', () => {
  const m = base();
  // THREE CLASSES, and the third did not exist until the second was answered.
  // `catch_from_call` was declared a FRONTIER with w_exn_propagation as owner
  // one item ago; the owner landed and `caught_value` names the value. What the
  // call edge still cannot source is `rethrown`'s handler, whose block calls
  // only `risky` — nothing there can throw, so only the HOST can deliver a
  // value, and that is w_env_api_surface's question.
  assert.deepEqual(caught(m).map((c) => c.split('<-')[0]).sort(),
    ['caught', 'e', 'twoHop']);
  assert.equal(m.n('catch_unsourced[audit](P)'), 0, 'no handler is sourceless');
  const host = m.q('catch_from_host[flow](P)')
    .flatMap(([p]) => m.q(`ast_name[code](${p}, N)`).map(([n]) => n));
  assert.deepEqual(host, ['rethrowCaught'],
    'one handler left, and the reason is named rather than counted');
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3l. A CALL WITH NO CALL SITE (w_cg_invisible_calls): a tagged template.
//
// `call_kind` is the closed pair {call_expression, optional_call_expression},
// so `` tag`x` `` — which calls `tag` — was outside every totality audit the
// call-graph file owns: `unshaped[audit]` reads 0 because it cannot see past
// `call_site`. The precedent was already in that file, written for `new C()`
// and applied once: a TRANSFER SITE does not resolve the call, it makes the
// miss attributable, and the difference between a gap and a silence is the
// whole point of the frontier.
//
// FOUR FORMS WERE CLAIMED BY THAT ITEM AND THE INSTRUMENT DECIDES WHICH CAN BE
// CLOSED, which is why the runtime was asked BEFORE any rule was written.
// Measured on a throwaway three-form fixture:
//
//   tag`x`            V8 reports `useTag -> tag`      — the enclosing function
//   for (x of it)     `useForOf -> [Symbol.iterator]` and `useForOf -> next`
//   await thenable    `<top> -> then`                 — the PROMISE MACHINERY
//
// so a model deriving `useAwait -> then` would be CONTRADICTED by the oracle
// rather than confirmed by it: the caller frame is not in the fixture at all.
// That is a property of the form, not of the model, and it is the reason the
// item splits rather than closing whole.
//
// THE VALUE HALF COMES FREE AND IS EXERCISED RATHER THAN CLAIMED. `may_be_node`
// already carries a call's value through `resolves[code]`, so `mark` returning
// a function and `const f = mark`a`; f()` gives that half a site — g1 takes
// `useTag -> stamped` away with the other two edges, which is what says the
// second cell is earned.
const TAG: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'g1 the tag arm is deleted',
    mut: [{ find: `resolves[code](X, F) :- transfer_site[code](X, tagged_template_expression),
                        ast_child[code](X, tag, 0, T),
                        may_be_node[flow](T, F), fn_node[code](F).`,
            replace: '', file: 'rules/js-callgraph.rofl' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['bTag -> mark', 'useTag -> mark', 'useTag -> stamped'],
        'both tags, and the function the tag RETURNS');
      // THE CONJUNCT THAT KEEPS THIS APART FROM g2, which loses the same three:
      // the SITE is still declared here, only the resolution goes. WRITTEN AS
      // AN EQUALITY BETWEEN THE TWO WORLDS rather than as the number 22, which
      // moved every time any transfer kind gained a site anywhere.
      assert.equal(m.n('transfer_site[code](X, K)'), b.n('transfer_site[code](X, K)'),
        'the transfer sites are untouched');
      // ...and one more call goes unresolved: `f()` in useTag has no value to
      // call once the tagged template stops evaluating to the tag's return.
      // NAMED RATHER THAN COUNTED: the pair 180/181 said `one more` in a way
      // that had to be re-derived every time the corpus grew a call.
      const unresolved = (w: World) => new Set(w.q('unresolved_call[code](C, S)').map(([c]) => c));
      const gainedSites = [...unresolved(m)].filter((c) => !unresolved(b).has(c))
        .map((c) => { const n = m.q(`ast_node[code](${c}, K, File, L)`)[0]; return `${n?.[0]}@${n?.[1]}`; });
      assert.deepEqual(gainedSites, ['call_expression@alpha.mjs'],
        'one site stops resolving: `f()` in useTag, whose value was the tag\'s return');
      assert.deepEqual([...unresolved(b)].filter((c) => !unresolved(m).has(c)), [],
        'and none starts');
    },
  },
  {
    name: 'g2 the kind stops being a transfer site',
    mut: [{ find: 'transfer_kind(tagged_template_expression).', replace: '',
            file: 'rules/js-callgraph.rofl' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['bTag -> mark', 'useTag -> mark', 'useTag -> stamped']);
      // THE CENSUS AS A DIFFERENCE, 2026-09-07. It used to be the baseline's
      // whole table written out — `{ new_expression: 19, tagged_template: 3 }` —
      // so declaring a THIRD transfer kind reddened it for a reason that had
      // nothing to do with tags. What g2 claims is that one kind leaves the
      // census entirely and the others are untouched.
      const byKind = (w: World) => w.q('transfer_site[code](X, K)')
        .reduce((acc: Record<string, number>, [, k]) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {});
      const bk = byKind(b);
      const { tagged_template_expression: tags, ...rest } = bk;
      assert.ok(tags > 0, 'positive control: the baseline has tagged templates');
      assert.deepEqual(byKind(m), rest,
        'the sites themselves are gone, which is what tells this from g1');
    },
  },
  {
    name: 'g4 the tag stops having to be a function',
    mut: [{ find: '                        may_be_node[flow](T, F), fn_node[code](F).',
            replace: '                        may_be_node[flow](T, F).',
            file: 'rules/js-callgraph.rofl' }],
    // WHERE THE EDGE SET CANNOT LOOK, and the fixture that fixed it. This
    // mutant moved NOTHING at all on the first measurement: every tag in a
    // RUNNABLE file denotes a function, because a tagged template with any
    // other tag throws. The guard had no site to bite on, and shapes.ts —
    // scanned, never run — is where a site like that can live. `stampObj` is a
    // real value rather than an ambient declaration, which is the care that
    // file's own header demands.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)), [],
        'no edge moves: an object has no name, so no edge can carry it');
      assert.equal(m.n('resolves[code](C, F)') - b.n('resolves[code](C, F)'), 1,
        'exactly one row appears, and the row is the only witness');
      const extra = new Set(m.q('resolves[code](C, F)').map(([c, f]) => `${c}|${f}`));
      for (const [c, f] of b.q('resolves[code](C, F)')) extra.delete(`${c}|${f}`);
      const kindOf = (id: string) => m.q(`ast_node[code](${id}, K, File, L)`)[0];
      assert.deepEqual([...extra].map((x) => {
        const [c, f] = x.split('|');
        return `${kindOf(c)?.[0]}@${kindOf(c)?.[1]} -> ${kindOf(f)?.[0]}@${kindOf(f)?.[1]}`;
      }), ['tagged_template_expression@shapes.ts -> object_expression@shapes.ts']);
    },
  },
];

// g3 — READING THE `quasi` WHERE THE `tag` BELONGS — WAS MEASURED AND DROPPED,
// and the reason is worth more than the mutant. It loses exactly the three
// edges g1 loses, leaves `transfer_site` at 22 exactly as g1 does, and takes
// `resolves` from 201 to 198 exactly as g1 does: the two are one mutant. It is
// not a gap in the corpus this time but a property of the grammar — a tagged
// template has exactly two children and only one of them can denote a function,
// so "read the wrong child" and "delete the arm" are the same statement. A
// third mutant with no oracle of its own would have looked like coverage.

for (const g of TAG) test(`${g.name} — a call with no call site`, () => g.expect(build(g.mut), base()));

// EVERY AMBIGUOUS SITE, BY NAME. This was `n('ambiguous_call[audit](C, F, G)')
// === 8` in two places until 2026-09-08, and `w_destructuring_rest_and_spread`
// moved it to 10 without either assertion being able to say WHICH sites — the
// exact failure `f_a_pin_that_moves_with_the_corpus_is_measuring_the_corpus`
// names. The pair is unordered in the relation (both directions are rows) and
// the caller is named rather than located, because a LINE moves when a fixture
// grows and a function name does not.
const ambiguous = (w: World) => [...new Set(w.q('ambiguous_call[audit](C, F, G)').map(([c, f, g]) => {
  const nm = (n: string) => w.q(`fn_name[code](${n}, N)`)[0]?.[0] ?? '?';
  const caller = w.q(`nearest_v[flow](H, ${c})`).map(([h]) => nm(h))[0] ?? '<top>';
  return `${caller}: ${[nm(f), nm(g)].sort().join(' | ')}`;
}))].sort();
const AMBIGUOUS = ['shaped: cubed | squared', 'useCond: pick | pick',
                   'useForOfArray: alef | bet', 'useForOfGen: alef | bet',
                   'useOr: pick | pick',
                   // ...and two DECORATED MEMBERS since 2026-09-08
                   // (w_decorator_replaces_its_target): each answers both the
                   // method the class declares and the replacement its
                   // decorator returned.
                   'usesThimble: bitted | tightened', 'usesThimble: crimped | seized'];

test('the tag is called, and what it returns is called too', () => {
  const m = base();
  // THE POSITIVE HALF, and both cells are in it. `useTag -> mark` is the call
  // the grammar hides; `useTag -> stamped` is the value it evaluates to.
  for (const e of ['useTag -> mark', 'bTag -> mark', 'useTag -> stamped', 'bmain -> bTag']) {
    assert.ok(edges(m).has(e), `the tagged template did not reach: ${e}`);
  }
  // AND THE COLLISION RESOLVES PER FILE. Two functions named `mark`, one in
  // each of the two files that use a tag, and neither answers for the other —
  // which is the only thing that makes the value join's file column observable.
  assert.deepEqual(ambiguous(m), AMBIGUOUS, 'and nothing new is ambiguous');
  assert.deepEqual(m.q('transfer_site[code](X, K)')
    .filter(([, k]) => k === 'tagged_template_expression')
    .map(([x]) => m.q(`ast_node[code](${x}, K, File, L)`)[0]?.[1]).sort(),
    ['alpha.mjs', 'beta.mjs', 'shapes.ts']);
});


// ---------------------------------------------------------------------------
// 3m. THE SAME ITEM, THE OTHER HALF (w_cg_invisible_calls): the FOR-OF.
//
// `for (const x of E)` calls `E[Symbol.iterator]()` and then `next()` on
// whatever that returned. TWO calls, ONE node, and the grammar shows neither —
// so it is the tagged template's shape and then one step further.
//
// THE RUNTIME WAS ASKED FIRST, as it was for the tag: V8 attributes BOTH calls
// to the enclosing function, which is what makes this half of the item
// checkable where the `await`'s `.then` is not. It also reports the first
// callee as `[Symbol.iterator]`, a shape the oracle's own last-dot rule had
// never seen and was corrupting to `iterator]`.
//
// THE DESIGN FORK IS WHAT h1 MEASURES, and it is the non-obvious part.
// `ambiguous_call[audit]` reads a site with two answers as an
// over-approximation that must be VISIBLE — right for a callee POSITION,
// wrong here, because a for-of makes two calls and both are true. So only the
// `[Symbol.iterator]` hop goes through `resolves`; the `next` hop goes
// straight into `calls`. Routed both ways and measured: through `resolves` it
// adds `useIterable: bump | iterator` to the set `ambiguous` names below
// (measured as 8 -> 9 rows when that was still a count). h1 deletes the `resolves` arm and
// `useIterable -> bump` SURVIVES — which is the fork stated as a row rather
// than as a paragraph.
//
// TWO OF THE SIX MUTANTS ARE GUARDS WITH NOTHING TO BITE ON IN A RUNNABLE
// FILE, and both got a site in shapes.ts rather than a comment — the same
// remedy `stampObj` was written for one item earlier, and the reason that
// question is worth asking of every guard: the first measurement of h5 and h6
// derived a byte-identical world.
const ITER: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'h1 the resolves arm for the first hop is deleted',
    mut: [{ find: 'resolves[code](X, M) :- for_of_iterates[code](X, M).', replace: '',
            file: 'rules/js-callgraph.rofl' }],
    expect: (m, b) => {
      // BOTH first hops go and the SECOND HOP STAYS. `useIterable -> bump` is
      // derived from `for_of_iterates` directly, so it does not depend on the
      // arm that publishes the first hop as a callee — which is the whole
      // content of the fork above.
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['onIterObject -> iterator', 'useIterable -> iterator']);
      assert.ok(edges(m).has('useIterable -> bump'), 'the `next` hop does not go through `resolves`');
      assert.equal(m.n('transfer_site[code](X, K)'), b.n('transfer_site[code](X, K)'),
        'the sites are untouched, which is the column h2 owns');
      assert.equal(b.n('resolves[code](C, F)') - m.n('resolves[code](C, F)'), 2,
        'one row per for-of whose iterable this program declares');
    },
  },
  {
    name: 'h2 the kind stops being a transfer site',
    mut: [{ find: 'transfer_kind(for_of_statement).', replace: '',
            file: 'rules/js-callgraph.rofl' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['onIterObject -> iterator', 'useIterable -> bump', 'useIterable -> iterator'],
        'no site, so neither hop');
      // ...and the SITES are what tells this from h4, which loses the same
      // three edges by taking the NAME away instead.
      const kinds = (w: World) => w.q('transfer_site[code](X, K)')
        .reduce((acc: Record<string, number>, [, k]) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {});
      const { for_of_statement: loops, ...others } = kinds(b);
      assert.ok(loops > 0, 'positive control: the baseline declares for-of sites');
      assert.deepEqual(kinds(m), others, 'the kind leaves the census and the others do not');
      assert.equal(m.n('for_of_iterates[code](X, M)'), 0);
    },
  },
  {
    name: 'h3 the calls arm for `next` is deleted',
    mut: [{ find: `calls[code](Caller, Next) :- for_of_iterates[code](X, M), nearest_fn[code](Caller, X),
                             returns[flow](M, E), may_be_node[flow](E, IterObj),
                             member_value[flow](IterObj, "next", V),
                             may_be_node[flow](V, Next), fn_node[code](Next).`,
            replace: '', file: 'rules/js-callgraph.rofl' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['useIterable -> bump'], 'the second hop, and only the second');
      // the mirror of h1's column: the first hop is a `resolves` and this one
      // is not, so deleting it moves `calls` and leaves `resolves` alone.
      assert.equal(m.n('resolves[code](C, F)'), b.n('resolves[code](C, F)'),
        'and `resolves` does not move');
      assert.equal(b.n('calls[code](A, B)') - m.n('calls[code](A, B)'), 1);
    },
  },
  {
    name: 'h4 a computed well-known symbol stops being a name',
    mut: [{ find: `key_name[code](K, N)   :- ast_node[code](K, member_expression, _, _),
                          ast_child[code](K, object, 0, O), ast_name[code](O, "Symbol"),
                          ast_child[code](K, property, 0, P), ast_name[code](P, N).`,
            replace: '', file: 'rules/js-structure.rofl' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['onIterObject -> iterator', 'useIterable -> bump', 'useIterable -> iterator']);
      // THE SAME THREE EDGES AS h2, AND A DIFFERENT ORACLE, which is what
      // earns it a place beside h2 rather than duplicating it: the sites are
      // all still there and it is the NAME that went. Four relations read a
      // key and all four were blind to a computed one; this is the row that
      // says so.
      assert.equal(m.n('transfer_site[code](X, K)'), b.n('transfer_site[code](X, K)'),
        'every site survives');
      assert.ok(b.n('fn_name[code](F, "iterator")') > 0, 'positive control');
      assert.equal(m.n('fn_name[code](F, "iterator")'), 0, 'the method has no name at all');
      assert.equal(b.n('member_value[flow](O, K, V)') - m.n('member_value[flow](O, K, V)'),
        b.n('fn_name[code](F, "iterator")'), '...and no key either, one per protocol method');
    },
  },
  {
    name: 'h5 the `Symbol` guard on a computed key is dropped',
    mut: [{ find: 'ast_child[code](K, object, 0, O), ast_name[code](O, "Symbol"),',
            replace: '', file: 'rules/js-structure.rofl' }],
    // A GUARD WITH NOTHING TO BITE ON, MEASURED BEFORE IT WAS GIVEN ONE. The
    // corpus contained exactly ONE computed key — the protocol's own — so
    // dropping the guard moved no answer anywhere. `aliasedKey` in shapes.ts
    // is a computed key whose object is NOT `Symbol`, and it is in the scanned
    // file rather than a runnable one because a method the model must not name
    // is a method the oracle would see run under a name nobody derived.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)), [],
        'no edge moves: nothing calls it, and that is not what the guard is about');
      assert.equal(b.n('fn_name[code](F, "spot")'), 0, 'the model does not know that name');
      assert.equal(m.n('fn_name[code](F, "spot")'), 1, '...and the mutant invents it');
      assert.equal(m.n('member_value[flow](O, K, V)') - b.n('member_value[flow](O, K, V)'), 1,
        'one member appears, under a name that is the variable and not the property');
      // AND THE SHAPE OF THE COST IS THE SECOND THING IT SAYS, which a total
      // could not: without the `Symbol` test the arm matches every member
      // expression in the corpus, and all but ONE of the rows it adds are not
      // in key position at all.
      const rows = (w: World) => new Set(w.q('key_name[code](K, N)').map((r) => r.join('|')));
      const inKeyPosition = new Set(b.q('ast_child[code](P, key, 0, K)').map(([, k]) => k));
      const added = [...rows(m)].filter((r) => !rows(b).has(r)).map((r) => r.split('|')[0]);
      assert.equal(added.filter((k) => inKeyPosition.has(k)).length, 1,
        'exactly one of the new rows is a key at all — the site in shapes.ts');
      assert.ok(added.length > 10,
        `and the arm reaches ${added.length} member expressions that are not keys`);
    },
  },
  {
    name: 'h6 the `next` value stops having to be a function',
    mut: [{ find: '                             may_be_node[flow](V, Next), fn_node[code](Next).',
            replace: '                             may_be_node[flow](V, Next).',
            file: 'rules/js-callgraph.rofl' }],
    // THE OTHER GUARD WITH NO SITE, and the same remedy as `stampObj`: an
    // iterable whose `next` is an OBJECT throws at run time, so no executable
    // fixture can hold it. `{ next: 1 }` would have looked like the same site
    // and measured nothing — a numeric literal is not a `node_value_kind`, so
    // `may_be_node` never reaches it and the premise BEFORE the guard is what
    // would have failed.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)), [],
        'no EDGE moves: the callee is an object, and an object has no name');
      assert.equal(m.n('calls[code](A, B)') - b.n('calls[code](A, B)'), 1,
        'and the raw edge is the only witness');
    },
  },
];

// TWO MUTANTS WERE MEASURED AND DROPPED, and the measurements are worth more
// than the mutants would have been.
//
//   READING `left` WHERE `right` BELONGS loses exactly the three edges h4
//   loses and moves `resolves`, `calls` and `for_of_iterates` by exactly as
//   much — and unlike h4 it moves nothing else, so its signature is h4's with
//   the naming rows taken out. A for-of has two children and only one of them
//   can denote the iterable; "read the wrong child" and "take the name away"
//   are the same statement about this grammar. Same finding as `g3` above, one
//   construct later.
//
//   DEREFERENCING THE MEMBER'S VALUE — replacing the final `may_be_node` with
//   the member's own value — loses `useIterable -> bump` and moves `calls`
//   203 -> 202, which is h3 exactly. `{ next: bump }` holds an IDENTIFIER and
//   there is one hop between it and the function, so "delete the arm" and
//   "stop taking the hop" cannot be told apart here. A third mutant with no
//   oracle of its own would have looked like coverage.

for (const g of ITER) test(`${g.name} — the iterator protocol`, () => g.expect(build(g.mut), base()));

test('both hops of the for-of are called, and the four sites are not four answers', () => {
  const m = base();
  for (const e of ['useIterable -> iterator', 'useIterable -> bump', 'onIterObject -> iterator']) {
    assert.ok(edges(m).has(e), `the iterator protocol did not reach: ${e}`);
  }
  // NOTHING NEW IS AMBIGUOUS, which is the fork holding: two callees from one
  // statement are two `calls` rows and one `resolves` row.
  assert.deepEqual(ambiguous(m), AMBIGUOUS);
  // FOUR SITES, TWO ANSWERS, and the two that stay silent are not residue of
  // the same class as anything else on the frontier: iterating an array
  // literal or a generator calls a BUILT-IN `[Symbol.iterator]`, a function
  // that is not in this program, so there is no node for a rule to name.
  const loops = m.q('transfer_site[code](X, K)').filter(([, k]) => k === 'for_of_statement')
    .map(([x]) => ({ x, fn: m.q(`nearest_fn[code](F, ${x})`).flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n))[0] }));
  const answered = new Set(m.q('for_of_iterates[code](X, M)').map(([x]) => x));
  assert.deepEqual(loops.map((l) => `${l.fn}${answered.has(l.x) ? '' : ' (built-in)'}`).sort(),
    ['onIterObject', 'useForOfArray (built-in)', 'useForOfGen (built-in)', 'useIterable'],
    'by the function that holds the loop, and whether its iterable is in the program');
});


// ---------------------------------------------------------------------------
// 3n. A TEMPLATE AS A COMPUTED KEY (w_scanner_nested_values, done).
//
// FOUR CELLS SAT BLOCKED FOR THREE SESSIONS BEHIND A SENTENCE THAT WAS TRUE.
// `cell_blocked(..., scanner_contract)` said a template literal's text lives in
// `TemplateElement.value`, a nested object, and the scanner emits scalar own
// properties only — so ``o[`k`]()`` is knowable at parse time and not derivable
// from any fact we have. Every clause of that was correct, the note even ended
// `it moves when the scanner's contract moves`, and nobody had measured how far
// it was from moving.
//
// MEASURED: 223 files, 422 482 nodes, every own property that is neither a
// node nor an array of nodes nor a scalar. With babel's `extra` scratch
// declared out, the scalars-only contract excluded EXACTLY ONE property in the
// whole of JavaScript as babel presents it, and it was this one. The scanner
// flattens a nested object of scalars now — a general rule, not a case for
// templates — and NO RULE WAS NEEDED AT THE CALL GRAPH: `selects[flow]` already
// reads a computed key through `may_be_lit`.
const TMPL_ARM = `interpolated[code](T)  :- ast_child[code](T, expressions, _, _).
may_be_lit[flow](T, V) :- ast_node[code](T, template_literal, _, _),
                          not interpolated[code](T),
                          ast_child[code](T, quasis, 0, Q),
                          ast_attr[code](Q, value_cooked, V).`;
/** the residue that is the standard library, as `prototype.method` */
const stdlib = (w: World) => w.q('stdlib_member[audit](C, P, K)').map(([, p, k]) => `${p}.${k}`).sort();

const lits = (w: World) => w.q('ast_node[code](T, template_literal, F, L)')
  .flatMap(([t]) => w.q(`may_be_lit[flow](${t}, V)`).map(([v]) => v)).sort();

const TMPL: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'j1 the template arm is deleted',
    mut: [{ find: TMPL_ARM, replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['tmplKey -> pick', 'useTmplKey -> pickTmpl'],
        'the runnable site and the scanned one, and nothing else');
      // ...and the SHAPE goes back to carrying a residue, which is the ledger
      // half of the same fact: `shape_stale[audit]` named the old excuse the
      // moment every site resolved.
      assert.deepEqual(b.q('shape_verdict[audit](s_computed_template_key, V)'), [['fully_resolved']]);
      assert.deepEqual(m.q('shape_verdict[audit](s_computed_template_key, V)'), [['has_residue']]);
      assert.equal(b.n('selects[flow](N, K)') - m.n('selects[flow](N, K)'), 2);
    },
  },
  {
    name: 'j2 the raw text is read where the cooked text belongs',
    mut: [{ find: 'ast_attr[code](Q, value_cooked, V).',
            replace: 'ast_attr[code](Q, value_raw, V).', file: 'rules/js-dataflow.rofl' }],
    // A GUARD WITH NOWHERE TO BITE, MEASURED BEFORE IT WAS GIVEN A SITE. `raw`
    // and `cooked` differ EXACTLY where an escape appears, and every template
    // in the corpus was escape-free — so this mutant derived a byte-identical
    // world. `escaped` in alpha.mjs is one template with one escape in it, and
    // it runs, so it goes in the runnable fixture rather than in shapes.ts.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)), [], 'no edge moves');
      assert.deepEqual(lits(b), ['abc', 'pick', 'pickTmpl'], '`\\u0062` is a `b`');
      assert.deepEqual(lits(m), ['a\\\\u0062c', 'pick', 'pickTmpl'],
        'and raw is the six characters as written');
    },
  },
  {
    name: 'j3 an interpolated template claims its first chunk',
    mut: [{ find: '                          not interpolated[code](T),\n', replace: '',
            file: 'rules/js-dataflow.rofl' }],
    // THE MUTANT THAT GAINS RATHER THAN LOSES, and it is the direction this
    // layer cares about: `` `a${n}b` `` evaluates to a string this model cannot
    // name, and a value layer that answers `a ` is worse than one that stays
    // silent. NO EDGE MOVES — nothing in the corpus selects a member by an
    // interpolated key — so the edge set is structurally unable to see it, and
    // the oracle is the value rows by name.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)), []);
      assert.deepEqual(lits(m).filter((v) => !lits(b).includes(v)).sort(),
        ['a ', 'k', 'k', 'x '], 'four chunks of interpolated templates, each a wrong answer');
    },
  },
];

// ONE MUTANT WAS MEASURED AND DOCUMENTED RATHER THAN KEPT. Reading `quasis, _`
// where the rule reads `quasis, 0` — so any chunk could answer, not the first —
// derives a byte-identical world, and it is unkillable BY CONSTRUCTION rather
// than for want of a corpus: a template has exactly one more quasi than it has
// expressions, so a template with no expressions has exactly ONE quasi and the
// index cannot select anything else. Same shape as the sequence-field mutant
// against `after_abrupt`, which survives for the same kind of reason, and it is
// named here so the next reader does not re-measure it.

for (const g of TMPL) test(`${g.name} — a template as a computed key`, () => g.expect(build(g.mut), base()));

test('a template with no interpolation is a string written the other way', () => {
  const m = base();
  // THE POSITIVE HALF, and both sites are in it: one that RUNS, so the oracle
  // judges it, and one in the scanned-only file, so the classifier does.
  assert.ok(edges(m).has('useTmplKey -> pickTmpl'), 'the runnable site resolves');
  assert.ok(edges(m).has('tmplKey -> pick'), 'and the scanned one does too');
  // ...AND THE SHAPE HAS NO RESIDUE LEFT, which is what took its excuse away.
  assert.deepEqual(m.q('shape_verdict[audit](s_computed_template_key, V)'), [['fully_resolved']]);
  assert.deepEqual(m.q('shape_stale[audit](S)'), [], 'and no excuse outlived it');
  // AN INTERPOLATED TEMPLATE STILL EVALUATES TO NOTHING THIS LAYER CAN NAME,
  // asserted rather than assumed: the corpus has four of them and not one
  // carries a value.
  const interp = m.q('ast_node[code](T, template_literal, F, L)')
    .filter(([t]) => m.n(`ast_child[code](${t}, expressions, _, _)`) > 0);
  assert.ok(interp.length >= 3, `positive control: ${interp.length} interpolated templates`);
  for (const [t] of interp) assert.equal(m.n(`may_be_lit[flow](${t}, V)`), 0);
});


// ---------------------------------------------------------------------------
// 3o. WHICH PROTOTYPE A VALUE HAS (w_prototype_of_a_value, 49).
//
// THE ITEM SAID THERE WAS NO SITE AND THE MODEL SAYS THERE ARE TWELVE. Its note
// read `NO SITE IN THE CORPUS, measured 2026-09-07: 13 member calls unresolved,
// zero with a literal receiver`, and it asked `may_be_lit` — does the model
// carry this receiver as a VALUE. A prototype is not a value question:
// `[1, 2, 3].join(",")` needs nothing carried, because the receiver is an
// `array_expression` and the KIND is the answer.
//
// Re-measured 2026-09-08, every unresolved member call with its receiver named:
// one template with `.concat` (the String prototype), one array literal with
// `.join` (the Array prototype), SIX `.next` on a generator object whose
// `may_be_node` is empty in all six (the value half of the generator protocol,
// a different item), and two on a class that is IN this program (not a
// prototype question at all).
const PROTO: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'q1 the KIND arm is deleted',
    mut: [{ find: 'prototype_of[flow](E, P) :- kind_prototype(K, P), ast_node[code](E, K, _, _).\n',
            replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      // A TEMPLATE LITERAL IS IN NEITHER `literal_kind` NOR `node_value_kind`,
      // so the value layer never carries one and only the kind arm reaches it.
      // That is the whole reason the two arms are two.
      // ...AND `255n.toString(16)` JOINED IT 2026-09-08 (w_update_and_literals),
      // for the same reason and from the other end of the value space: a bigint
      // literal is a receiver whose kind is the answer. `regexp.test` is NOT on
      // this difference — `MATCHER.test(s)` reaches `regexp` through the value
      // arm, which this mutant leaves standing, and `includes` on a multiset
      // then hides its inline twin. A named set grown by a second item, which
      // is the merge shape this ledger is built for.
      // ...AND `string.replaceAll` JOINED 2026-09-08 (w_env_api_surface) for the
      // same reason as `bigint.toString`: `'aaa'.replaceAll(...)` is a receiver
      // written in place, so the KIND arm is the only thing that answers it.
      assert.deepEqual(stdlib(b).filter((x) => !stdlib(m).includes(x)),
        ['bigint.toString', 'string.concat', 'string.replaceAll']);
      assert.ok(b.n('prototype_of[flow](E, P)') > m.n('prototype_of[flow](E, P)') * 2);
    },
  },
  {
    name: 'q2 the VALUE arm is deleted',
    mut: [{ find: `prototype_of[flow](E, P) :- may_be_node[flow](E, N), kind_prototype(K, P),
                            ast_node[code](N, K, _, _).`,
            replace: '', file: 'rules/js-dataflow.rofl' }],
    // AND THIS MUTANT HAD NO SITE UNTIL THE FIXTURE GAINED ONE. Measured first:
    // `useArr` calls `.join` on an array written IN PLACE, which the kind arm
    // answers alone, so deleting the value arm moved `prototype_of` 327 -> 226
    // and lost no answer whatever — 101 rows nothing read. `useBoundArr` binds
    // the array to a name, so its receiver's kind is reachable only through
    // `may_be_node`, and the arm becomes load-bearing rather than decoration.
    expect: (m, b) => {
      // THE UNION, 2026-09-08: w_update_and_literals added a bigint receiver
      // and two regexp ones, and `MATCHER.test(s)` is the SECOND row this arm
      // carries alone — the first being the bound array.
      // TWO MORE ON 2026-09-08 (w_env_api_surface): `[1,2,3].at(0)` and
      // `'aaa'.replaceAll(...)`, both receivers written IN PLACE, so both are
      // answered by the kind arm and both survive this mutant — which is why
      // they appear on each side of the pair below.
      assert.deepEqual(stdlib(b), ['array.at', 'array.join', 'array.join', 'bigint.toString',
        'regexp.test', 'regexp.test', 'string.concat', 'string.replaceAll'],
        'two arrays, two regexps and a bigint — some written in place, some reached through a binder');
      assert.deepEqual(stdlib(m), ['array.at', 'array.join', 'bigint.toString', 'regexp.test',
        'string.concat', 'string.replaceAll'],
        'and the bound array and the bound regexp are the rows this arm carries');
      assert.ok(b.n('prototype_of[flow](E, P)') > m.n('prototype_of[flow](E, P)'));
    },
  },
];

// THREE MUTANTS WERE MEASURED AND SURVIVE, and naming them is the point of a
// SET — silence about a blind spot is the defect a set exists to prevent.
//
//   DROPPING `builtin_prototype(P)` from the audit, and ADDING `object` to that
//   list, are the same statement twice and both derive a byte-identical world.
//   They would need an unresolved member call whose receiver's prototype is
//   `object` or `function`, and there is none: a member on an object literal is
//   answered by `member_value`, so it resolves and never reaches this audit.
//
//   DROPPING `unresolved_call[code](C, _)` is UNKILLABLE BY CONSTRUCTION rather
//   than for want of a corpus, and it is the interesting one. It would need a
//   member call that RESOLVES and whose receiver has a builtin prototype — and
//   in a model with no standard library, a call on an array or a string cannot
//   resolve. The guard becomes falsifiable exactly when `w_env_api_surface`
//   lands, which makes this audit a forward marker for that item rather than a
//   check with a dead premise.

for (const g of PROTO) test(`${g.name} — which prototype a value has`, () => g.expect(build(g.mut), base()));

test('the residue that is the standard library is a row, not a comment', () => {
  const m = base();
  // rules/js-callgraph.rofl has carried `the String prototype, which is the
  // standard library and a different programme` as PROSE since the shape split.
  // A sentence in a comment cannot go red and cannot be counted.
  assert.deepEqual(stdlib(m), [
    // TWO MORE ON 2026-09-08 with w_env_api_surface, and they are what that item
    // ATTRIBUTED: `array.at` is ES2022 and `string.replaceAll` ES2021, so this
    // list is no longer only a residue — every row now carries a method name and
    // the year it landed, from TypeScript's own lib.es*.d.ts.
    'array.at', 'array.join', 'array.join', 'bigint.toString',
    'regexp.test', 'regexp.test', 'string.concat', 'string.replaceAll',
  ]);
  // ...AND IT RESOLVES NOTHING, which is asserted rather than assumed: every
  // site it names is still on the frontier, and the audit moved no edge.
  for (const [c] of m.q('stdlib_member[audit](C, P, K)')) {
    assert.equal(m.n(`unresolved_call[code](${c}, S)`), 1, 'named, and still residue');
  }
  // THE SIX `.next` CALLS ARE NOT ON THIS LIST, and that is the boundary
  // between this item and the generator protocol: `may_be_node` is empty for
  // all six receivers, so there is no kind to read a prototype from.
  const nextCalls = m.q('unresolved_call[code](C, S)')
    .filter(([c]) => m.q(`callee_of[code](${c}, N)`)
      .some(([n]) => m.q(`ast_child[code](${n}, property, 0, P)`)
        .some(([p]) => m.n(`ast_name[code](${p}, "next")`) === 1)));
  assert.equal(nextCalls.length, 6, 'positive control: the generator cluster is still there');
  assert.deepEqual(nextCalls.filter(([c]) => m.n(`stdlib_member[audit](${c}, P, K)`) > 0), [],
    'and none of them has a prototype this relation can name');
});


// ---------------------------------------------------------------------------
// 3p. A NAME BOUND BY DESTRUCTURING.
//
// `const { pulled: taken } = drawer` binds `taken` to the MEMBER `pulled` of
// whatever `drawer` is, and `binder[code]` cannot say that: its third argument
// is the node the name evaluates to, and a destructured name evaluates to a
// member of that node. A declarator whose `id` is a pattern has no `ast_name`
// at all, so it produced no binder row and every name introduced this way was
// invisible to the value layer.
//
// MEASURED ON A PROBE FIRST: with `const { pick } = holder` beside a direct
// `holder.pick(n)`, the model derived the direct edge and lost the destructured
// one entirely — and `vocabulary_gap[audit]` named `object_pattern` the same
// run, so the hole was DECLARED rather than silent. It was waiting for a
// fixture, which is what that audit is for.
//
// THE REFACTOR SHIPPED BEFORE THE FEATURE. `binder_region`, `binder_at_top` and
// the top-level arm of `sees_binder` all read `binder` because it was the only
// way to bind; they read `scoped_binder` now. With the indirection in and no
// second arm, fifteen relations of this layer were compared row for row against
// the previous form and came back IDENTICAL.
const DESTR_ARM = `may_be_node[flow](E, N) :- destructures[code](D, Local, Key, File),
                           ast_child[code](D, init, 0, Init), may_be_node[flow](Init, Obj),
                           member_value[flow](Obj, Key, V), may_be_node[flow](V, N),
                           ident_in[code](E, Local, File), sees_binder[code](E, D).`;
const bound = (w: World) => w.q('destructures[code](D, L, K, F)')
  .map(([, l, k]) => `${l}<-${k}`).sort();

const DESTR: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'e1 the value arm is deleted',
    mut: [{ find: DESTR_ARM, replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      // FOUR SINCE 2026-09-08 and it is the same rule deriving them: the rest
      // fixtures of `w_destructuring_rest_and_spread` each take a key BY NAME
      // beside their `...rest`, and a named key in a pattern is what
      // `destructures` answers whatever else the pattern holds.
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['pullsTaken -> bolted', 'scoped -> fetched',
         'useDestructured -> pulled', 'useTakenFromRest -> caliper'],
        'the runnable sites and the scanned ones');
      // THE COLUMN THAT TELLS THIS FROM e2 AND e6: the names are still bound
      // and the declarator is still a scoped binder — only nothing reads them.
      assert.deepEqual(bound(m), bound(b));
      assert.equal(m.n('scoped_binder[code](D, F)'), b.n('scoped_binder[code](D, F)'));
    },
  },
  {
    name: 'e2 a pattern stops being a pattern',
    mut: [{ find: 'ast_node[code](P, object_pattern, _, _),',
            replace: 'ast_node[code](P, no_such_kind, _, _),', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['pullsTaken -> bolted', 'scoped -> fetched',
         'useDestructured -> pulled', 'useTakenFromRest -> caliper']);
      assert.deepEqual(bound(m), [], 'nothing is bound from a pattern any more');
      assert.equal(b.n('scoped_binder[code](D, F)') - m.n('scoped_binder[code](D, F)'), 2);
    },
  },
  {
    name: 'e4 the key and the value are swapped',
    mut: [{ find: `ast_child[code](Prop, key, 0, K), key_name[code](K, Key),
                                           ast_child[code](Prop, value, 0, L), ast_name[code](L, Local).`,
            replace: `ast_child[code](Prop, value, 0, K), key_name[code](K, Key),
                                           ast_child[code](Prop, key, 0, L), ast_name[code](L, Local).`,
            file: 'rules/js-dataflow.rofl' }],
    // AND THIS IS WHY BOTH FIXTURES USE THE RENAME FORM. `{ pulled }` gives an
    // `object_property` whose key and value are two identifiers of the SAME
    // name, so reading them the wrong way round would derive the same rows and
    // this mutant would survive on a shorthand corpus. The rename makes the
    // direction observable, and it is the whole reason the rule needs no
    // `shorthand` test: key for the member, value for the local, both forms.
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['pullsTaken -> bolted', 'scoped -> fetched',
         'useDestructured -> pulled', 'useTakenFromRest -> caliper']);
      assert.deepEqual(bound(b),
        ['inner<-fetchIt', 'taken<-pulled', 'takenCaliper<-caliper', 'usedBolted<-bolted']);
      assert.deepEqual(bound(m),
        ['bolted<-usedBolted', 'caliper<-takenCaliper', 'fetchIt<-inner', 'pulled<-taken'],
        'read backwards');
    },
  },
  {
    name: 'e5 the scoping join is dropped',
    mut: [{ find: 'ident_in[code](E, Local, File), sees_binder[code](E, D).',
            replace: 'ident_in[code](E, Local, File).', file: 'rules/js-dataflow.rofl' }],
    // A GUARD WITH NOWHERE TO BITE, measured before it was given a site: the
    // runnable fixture binds `taken` at module scope and uses it once, so a
    // binder visible everywhere and a binder visible in its region are the same
    // binder. `scoped`/`outside` in shapes.ts are a name bound INSIDE a
    // function and a free identifier of that name outside it — which throws at
    // run time, so no executable fixture can hold it. THE MUTANT GAINS rather
    // than loses, which is the direction an over-approximation moves.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)), ['outside -> fetched'],
        'a name resolved to a binder in a function it is not in');
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)), [], 'and loses nothing');
    },
  },
  {
    name: 'e6 a destructuring declarator is not a scoped binder',
    mut: [{ find: 'scoped_binder[code](D, File) :- destructures[code](D, _, _, File).',
            replace: '', file: 'rules/js-dataflow.rofl' }],
    // THE HALF THE REFACTOR BOUGHT, and the column that tells it from e2: the
    // names are still bound, and they are visible to nobody.
    expect: (m, b) => {
      // TWO AND NOT FOUR, which is the discrimination this mutant buys for
      // free: the two declarators the rest fixtures added are ALSO
      // `scoped_binder` through `rest_binds`, so deleting the `destructures`
      // arm alone leaves them visible. e2, which stops the pattern being a
      // pattern at all, loses all four.
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['scoped -> fetched', 'useDestructured -> pulled']);
      assert.deepEqual(bound(m), bound(b), 'the names are bound and unreachable');
      assert.equal(b.n('scoped_binder[code](D, F)') - m.n('scoped_binder[code](D, F)'), 2);
    },
  },
];

// ONE MUTANT SURVIVES AND IT IS WAITING ON ANOTHER ITEM. Reading `ast_name` on
// the key where the rule reads `key_name` derives a byte-identical world,
// because every key in a pattern in this corpus is a plain identifier and
// `key_name`'s first arm IS `ast_name`. It would bite on a COMPUTED key in a
// pattern — `const { [k]: v } = o` — which is exactly the shape
// `w_computed_key_names` owns, and which cannot be written honestly until that
// item settles what a computed key is named. Third category of survivor, after
// "no site in this corpus" and "unkillable by the grammar": waiting on an item.

for (const g of DESTR) test(`${g.name} — a name bound by destructuring`, () => g.expect(build(g.mut), base()));

test('destructuring binds through the member, and only inside its region', () => {
  const m = base();
  assert.ok(edges(m).has('useDestructured -> pulled'), 'the runnable site resolves');
  assert.ok(edges(m).has('scoped -> fetched'), 'and the scanned one, bound inside a function');
  assert.ok(!edges(m).has('outside -> fetched'), 'and a free name of the same spelling does not');
  // FOUR SINCE 2026-09-08, not two: `w_destructuring_rest_and_spread` added an
  // object pattern in each file to carry a REST beside a taken key, and the
  // same rule binds their named halves. The set is written out rather than
  // counted for exactly this reason — a length would have absorbed them.
  assert.deepEqual(bound(m),
    ['inner<-fetchIt', 'taken<-pulled', 'takenCaliper<-caliper', 'usedBolted<-bolted'],
    'local on the left, member key on the right');
  // ...AND THE KIND IS IN THE VOCABULARY NOW, which is what took the matrix
  // from reporting nothing about it to reporting four cells.
  assert.equal(m.n('vocabulary_gap[audit](L, K)'), 0);
  assert.ok(m.n('ast_node[code](P, object_pattern, F, L)') > 0, 'positive control: patterns exist');
});

// ---------------------------------------------------------------------------
// 3q. THE OTHER FOUR FORMS OF THE DESTRUCTURING FAMILY
//     (w_destructuring_rest_and_spread).
//
// `object_pattern` landed in 3p; `array_pattern`, `assignment_pattern`,
// `rest_element` and `spread_element` had no site in the corpus at all.
//
// MEASURED WITH THE FIXTURES IN AND NO RULE WRITTEN, which is the run that
// decided the shape of this whole section: the value layer answered NOTHING at
// seven of the eight new sites — and answered the eighth WRONGLY.
// `pair(...bench, cubed)` with `bench = [chiselled, planed]` derived
// `pair -> cubed`, while the same file RUN under node returns
// `chiselled(1) + planed(1)`. A spread contributes as many arguments as its
// iterable has elements, so every argument after it lands somewhere the TREE
// index does not name, and `arg_at`/`param_of` had been pairing the two.
//
// A may-set is allowed to be SILENT and is not allowed to be WRONG. Seven
// silences cost edges; the eighth was a claim the oracle contradicts, and it
// is the only defect of that kind this family produced.
const DF = 'rules/js-dataflow.rofl';
const CF = 'rules/js-controlflow.rofl';

/** every name bound by an ARRAY pattern, as `local<-index` */
const boundAt = (w: World) => w.q('destructures_at[code](D, L, I, F)')
  .map(([, l, i]) => `${l}<-${i}`).sort();
/** what a REST object carries, as `key` — the exclusion is the whole content */
const restKeys = (w: World) => w.q('rest_in_pattern[code](D, R, F)')
  .flatMap(([, r]) => w.q(`member_value[flow](${r}, K, V)`).map(([k]) => k)).sort();
/** how many identifiers the model gives a rest object's identity to */
const restReads = (w: World) => w.q('rest_binds[code](D, R, L, F)')
  .flatMap(([, r]) => w.q(`may_be_node[flow](E, ${r})`).map(([e]) => e)).length;

const FAMILY: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'h1 the array-pattern value arm is deleted',
    mut: [{ file: DF, find: `may_be_node[flow](E, N) :- destructures_at[code](D, Local, Index, File),
                           ast_child[code](D, init, 0, Init), elem_at[flow](Init, Index, V),
                           may_be_node[flow](V, N),
                           ident_in[code](E, Local, File), sees_binder[code](E, D).`, replace: '' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['useFirstSlot -> chiselled', 'useSecondSlot -> planed']);
      // THE COLUMN THAT TELLS THIS FROM h2: the names are still bound by
      // position and nothing reads them. Same discrimination 3p needed.
      assert.deepEqual(boundAt(m), boundAt(b));
    },
  },
  {
    name: 'h2 an array pattern stops being an array pattern',
    mut: [{ file: DF, find: 'ast_node[code](P, array_pattern, _, _),', replace: 'ast_node[code](P, no_such_kind, _, _),' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['useFirstSlot -> chiselled', 'useSecondSlot -> planed']);
      assert.deepEqual(boundAt(m), [], 'and nothing is bound by position any more');
      assert.deepEqual(boundAt(b), ['exportedTool<-0', 'firstTool<-0', 'secondTool<-1']);
    },
  },
  {
    name: 'h3 the array pattern reads any element instead of its own',
    mut: [{ file: DF, find: 'ast_child[code](D, init, 0, Init), elem_at[flow](Init, Index, V),',
            replace: 'ast_child[code](D, init, 0, Init), elem_at[flow](Init, _, V),' }],
    // AND THIS IS WHY THE TWO LOCALS ARE READ IN TWO DIFFERENT FUNCTIONS.
    // Read in one function, `[firstTool, secondTool]` derives the SAME EDGE SET
    // whether the rule matches the index or ranges over every element, and this
    // mutant would survive on a corpus that looks like it tests the index. The
    // mutant GAINS, which is the direction an over-approximation moves.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)).sort(),
        ['useFirstSlot -> planed', 'useSecondSlot -> chiselled']);
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)), [], 'and loses nothing');
    },
  },
  {
    name: 'h4 a defaulted parameter has no name again',
    mut: [{ file: DF, find: `param_of[flow](F, I, Name) :- fn_node_v[flow](F), ast_child[code](F, params, I, P),
                              ast_node[code](P, assignment_pattern, _, _),
                              ast_child[code](P, left, 0, L), ast_name[code](L, Name).`, replace: '' }],
    // BOTH HALVES GO, and that is the point of the mutant rather than a defect
    // in it: without an index the parameter has no identity at all, so neither
    // the default nor an argument passed at that position can reach the body.
    expect: (m, b) => assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
      ['shaped -> cubed', 'shaped -> squared']),
  },
  {
    name: 'h5 the default value never reaches the body',
    mut: [{ file: DF, find: `may_be_node[flow](U, N) :- param_default[flow](F, Name, Init), may_be_node[flow](Init, N),
                           param_use[flow](F, Name, U).`, replace: '' }],
    // ...AND HALF OF IT GOES, which is what tells this from h4: the parameter
    // still has an index, so `usePassedParam`'s argument still arrives.
    expect: (m, b) => assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
      ['shaped -> squared']),
  },
  {
    name: 'h6 the rest object copies the keys the pattern took',
    mut: [{ file: DF, find: `                                 member_value[flow](Obj, Key, V),
                                 not pattern_takes[code](P, Key).`,
            replace: `                                 member_value[flow](Obj, Key, V).` }],
    // THE ONLY MUTANT IN THIS SET THAT NEEDS shapes.ts, and it is why the site
    // is there: `leftovers.bolted(n)` is `undefined(n)` and throws, so no
    // executable fixture can hold it — and the exclusion is the whole content
    // of the relation, unobservable on a runnable corpus.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)).sort(),
        ['pullsExcluded -> bolted']);
      assert.deepEqual(restKeys(b), ['riveted', 'spanner']);
      assert.deepEqual(restKeys(m), ['bolted', 'caliper', 'riveted', 'spanner']);
    },
  },
  {
    name: 'h7 a rest object is not a plain object',
    mut: [{ file: DF, find: 'member_plain[flow](R, Key, V) :- rest_in_pattern[code](_, R, _), member_value[flow](R, Key, V).', replace: '' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['pullsRest -> riveted', 'useObjectRest -> spanner']);
      // THE COLUMN THAT TELLS THIS FROM h8: the rest object still HAS its keys
      // and the locals still denote it — the member lookup simply cannot see a
      // receiver that passes none of its three guards. That is the same defect
      // the module namespace had, and it is why the row exists at all.
      assert.deepEqual(restKeys(m), restKeys(b));
      assert.equal(restReads(m), restReads(b));
    },
  },
  {
    name: 'h8 the rest local denotes nothing',
    mut: [{ file: DF, find: `may_be_node[flow](E, R) :- rest_binds[code](D, R, Local, File),
                           ident_in[code](E, Local, File), sees_binder[code](E, D).`, replace: '' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['pullsRest -> riveted', 'useObjectRest -> spanner']);
      assert.deepEqual(restKeys(m), restKeys(b), 'the object still carries its keys');
      assert.equal(restReads(m), 0, 'and no identifier reaches it');
      assert.ok(restReads(b) > 0, 'positive control');
    },
  },
  {
    name: 'h9 an object spread copies nothing',
    mut: [{ file: DF, find: `member_value[flow](O, Key, V) :- ast_node[code](O, object_expression, _, _),
                                 ast_child[code](O, properties, _, S),
                                 ast_node[code](S, spread_element, _, _),
                                 ast_child[code](S, argument, 0, A), may_be_node[flow](A, Src),
                                 member_value[flow](Src, Key, V).`, replace: '' }],
    expect: (m, b) => assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
      ['useObjectSpread -> spanner']),
  },
  {
    name: 'h10 an argument after a spread keeps its tree index',
    mut: [{ file: DF, find: `                              not ast_node[code](A, spread_element, _, _),
                              not after_spread[code](C, I).`,
            replace: `                              not ast_node[code](A, spread_element, _, _).` }],
    // THE MUTANT IS THE MODEL AS IT STOOD BEFORE THIS ITEM, and the edge it
    // gains is the one the running fixture contradicts: `useSpreadThenArg`
    // returns 5 = chiselled(1) + planed(1), so `pair` calls `cubed` never.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)).sort(),
        ['pair -> cubed'], 'the false edge is back');
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)), [], 'and nothing else moves');
    },
  },
  {
    name: 'h11 a spread argument expands to nothing',
    mut: [{ file: DF, find: `arg_at[flow](C, I, E)      :- spread_arg[code](C, J), not after_spread[code](C, J),
                              ast_child[code](C, arguments, J, S),
                              ast_child[code](S, argument, 0, A), elem_at[flow](A, K, E),
                              I is J + K.`, replace: '' }],
    expect: (m, b) => assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
      ['duo -> chiselled', 'pair -> chiselled', 'pair -> planed']),
  },
  {
    name: 'h12 a spread expands from index zero wherever it sits',
    mut: [{ file: DF, find: '                              I is J + K.', replace: '                              I = K.' }],
    // `duo(cubed, ...bench)` binds `x` to `cubed` and `y` to `chiselled` at run
    // time. Expanding from zero says `y` may be `planed`, which is false — and
    // it is why the fixture has a spread that is NOT first: with only
    // `pair(...bench)` in the corpus, J is 0 at every site and this mutant is
    // byte-identical to the rule.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)).sort(), ['duo -> planed']);
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)), []);
    },
  },
  {
    name: 'h13 a default value is not a guarded arm',
    mut: [{ file: CF, find: 'guard_kind(assignment_pattern,         right).', replace: '' }],
    // TWO CONSEQUENCES OF ONE DELETION, and the second is the closed-vocabulary
    // gate doing its job: the kind still carries `skip_arm` in
    // `transfer_mechanism`, so a mechanism claimed as modelled by a rule
    // nothing connects to the kind is exactly what `guard_unmodelled` reports.
    expect: (m, b) => {
      assert.equal(names(m).has('fallbackMaker'), false, 'a call only reachable through a default');
      assert.equal(names(b).has('fallbackMaker'), true, 'positive control');
      assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), ['assignment_pattern']);
      assert.deepEqual(b.q('guard_unmodelled[audit](K)').flat(), []);
    },
  },
];

// TWO MUTANTS ARE NAMED AND NOT RUN, because each is unkillable for a reason
// worth writing down rather than for want of trying.
//
// (b) UNKILLABLE BY THE INSTRUMENT — deleting
// `transfer_mechanism(assignment_pattern, skip_arm)` moves NOTHING. Every
// consumer reads that row as a PREMISE: `guard_named` derives from
// `guard_kind`, and `guard_unmodelled[audit]` is
// `transfer_mechanism ∧ mechanism_modelled ∧ ¬guard_named`, so removing the
// premise silences the audit that exists to notice. A closed-vocabulary gate
// is structurally unable to see a kind removed FROM the vocabulary it ranges
// over, and that is the same hole CLAUDE.md records for `orphan_claim`.
//
// (a) NO SITE IN THIS CORPUS — dropping `not after_spread[code](C, J)` from the
// expansion arm. It guards a spread that has itself been shifted by an earlier
// spread, and `f(...a, ...b)` is in no fixture here. The site that would kill
// it is a call with TWO spreads whose first array has a length other than one;
// it is not written because a second spread is a second construct and the
// fixture discipline this file keeps forbids smuggling one in.

for (const g of FAMILY) test(`${g.name} — array, assignment, rest and spread`, () => g.expect(build(g.mut), base()));

test('the four remaining destructuring forms, answered and measured', () => {
  const m = base();
  // EVERY EDGE THE FAMILY ADDS, BY NAME. Each is confirmed by running
  // alpha.mjs: useArgThenSpread() is 3 = cubed(1) + chiselled(1) and
  // useSpreadOnly() is 5 = chiselled(1) + planed(1).
  const family = ['chiselled', 'planed', 'squared', 'cubed', 'spanner', 'caliper',
                  'fallbackMaker', 'riveted', 'bolted'];
  assert.deepEqual([...edges(m)].filter((e) => family.some((f) => e.endsWith(' -> ' + f))).sort(), [
    'duo -> chiselled', 'duo -> cubed',
    'pair -> chiselled', 'pair -> planed',
    'pullsRest -> riveted', 'pullsTaken -> bolted',
    'shaped -> cubed', 'shaped -> squared',
    'useFirstSlot -> chiselled', 'useObjectRest -> spanner',
    'useObjectSpread -> spanner', 'useSecondSlot -> planed',
    'useTakenFromRest -> caliper', 'withMade -> fallbackMaker',
  ]);
  // ...AND THE ONE THAT MUST NOT BE THERE, stated separately because an
  // absence inside a set assertion is invisible to a reader.
  assert.equal(edges(m).has('pair -> cubed'), false, 'an argument after a spread claims nothing');
  assert.equal(edges(m).has('pullsExcluded -> bolted'), false, 'a rest excludes what the pattern took');

  assert.deepEqual(boundAt(m), ['exportedTool<-0', 'firstTool<-0', 'secondTool<-1']);
  assert.deepEqual(restKeys(m), ['riveted', 'spanner']);
  assert.equal(names(m).has('fallbackMaker'), true, 'a default expression may not run');

  // THE KINDS ARE IN THE CORPUS NOW, which is what took `kind_absent_ok` from
  // four rows to none — the excuse cannot outlive its cause.
  assert.equal(m.n('vocabulary_gap[audit](L, K)'), 0);
  assert.equal(m.n('kind_absent_stale[audit](K)'), 0);
  for (const k of ['array_pattern', 'assignment_pattern', 'rest_element', 'spread_element']) {
    assert.ok(m.n(`ast_node[code](N, ${k}, F, L)`) > 0, `positive control: ${k} is in the corpus`);
  }
});

test('the modules layer has no opinion about a destructuring form, measured', () => {
  const m = base();
  // A TEXTUAL CENSUS AND ITS LIMIT, STATED. `rules/js-modules.rofl` is not in
  // this world`s RULES — every relation of that layer is unpopulatable here —
  // so the measurement is over the rule TEXT rather than over derived rows,
  // and a textual census has a ceiling and not a floor.
  //
  // WHAT IT MEASURES IS STILL THE RIGHT QUESTION. That pack reaches the tree
  // through `ast_node[code]` and nowhere else, so the set of kinds it names is
  // the set of kinds it can possibly have an opinion about.
  const named = new Set([...read('rules/js-modules.rofl')
    .matchAll(/ast_node\[code\]\([^,]+,\s*([a-z_]+)\s*,/g)].map((x) => x[1]));
  // TEN SINCE 2026-09-08, AND THREE OF THEM ARRIVED FROM ANOTHER BRANCH. This
  // assertion enumerates the contents of `rules/js-modules.rofl`, which is not
  // this test's file and not this item's layer: `w_export_specifier_forms`
  // landed `export_named_declaration`, `export_specifier` and
  // `export_namespace_specifier` there in parallel and the list went red.
  //
  // A NAMED SET IS SAFE AGAINST A COUNT AND NOT AGAINST A SCOPE. Nothing about
  // the CLAIM moved — the claim is the loop below, that no pattern is among
  // them, and it holds — but the enumeration pins somebody else's file, so it
  // moves whenever they work. The loop is the part that measures; this list is
  // the part that has to be re-read.
  // ELEVEN SINCE 2026-09-08: `export_all_declaration` arrived from
  // w_mod_beyond_the_import, which made a re-export a module site. Fourth
  // element added from another branch, and the note above still holds — the
  // CLAIM is the loop below and it is untouched; the enumeration pins somebody
  // else's file and has to be re-read whenever they work.
  assert.deepEqual([...named].sort(), [
    '_', 'export_all_declaration', 'export_named_declaration',
    'export_namespace_specifier', 'export_specifier', 'import_declaration',
    'import_default_specifier', 'import_expression',
    'import_namespace_specifier', 'import_specifier', 'string_literal',
  ], 'every kind the modules pack names, and not one of them is a pattern');
  // THE WILDCARD IS NOT A HOLE, and it was read rather than assumed: both `_`
  // occurrences are `site_file` and `site_line`, and each carries
  // `module_site[code](I, _)` on the SAME node in the same body, so neither
  // ranges over anything a module site is not. (`import_site` until
  // 2026-09-08; the premise is the union of the import and re-export halves
  // now and the argument is word for word the same.)
  for (const k of ['array_pattern', 'assignment_pattern', 'rest_element', 'spread_element',
                   'object_pattern']) assert.equal(named.has(k), false);

  // ...AND THE SITE THAT MAKES THE VERDICT EXERCISED RATHER THAN DEFINITIONAL:
  // `export const [exportedTool] = bench` is a destructuring form DIRECTLY
  // under an export declaration. Without it `a_not_a_module_construct` would be
  // untestable by construction — a kind that never met an `export` cannot show
  // that meeting one changes nothing.
  const underExport = m.q('ast_node[code](P, array_pattern, F, L)')
    .filter(([p]) => m.q('ast_node[code](E, export_named_declaration, F2, L2)')
      .some(([e]) => m.n(`ast_within[code](${e}, ${p})`) === 1));
  assert.equal(underExport.length, 1, 'exactly one pattern under an export');
  assert.ok(m.n('ast_node[code](P, array_pattern, F, L)') > 1,
    'positive control: patterns that are NOT under an export exist too');
});

// ---------------------------------------------------------------------------
// 3r. WHAT THESE FORMS DO AT RUN TIME, which is where the CONTROL-FLOW verdict
//     for three of the four came from (w_destructuring_hides_a_call).
//
// `ignored(js, K, controlflow, a_no_control_transfer)` is a claim about the
// LANGUAGE, and this repository`s rule is that such a claim is the output of
// running something. So it runs: seven cases, each recording which functions
// actually executed, and the answer decided three cells and reopened a fourth.
//
// IT COSTS NO WORLD, which is why it is a test rather than a scratch file.
// Every other test in this file pays for a fixpoint; this one pays for a
// getter and an iterator, and it is the only instrument that can see the
// difference between `this kind transfers nothing` and `this kind transfers
// into a function whose name the model cannot say`.
test('a destructuring form hides a call, measured by running one', () => {
  const ran: string[] = [];
  const mark = (w: string) => { ran.push(w); return 1; };

  const iterable = { *[Symbol.iterator]() { mark('array_pattern:iterator'); yield 1; yield 2; } };
  const [, second] = iterable;                       // 1. an array pattern
  const withGetter = { get taken() { return mark('object_pattern:getter'); } };
  const { taken } = withGetter;                      // 2. an object pattern
  const spreadCopy = { ...withGetter };               // 3. an object spread
  const arrCopy = [...iterable];                      // 4. an array spread
  const sink = (...xs: number[]) => xs.length;
  sink(...iterable);                                  // 5. a spread argument
  const restSrc = { a: 1, get b() { return mark('rest_element:getter'); } };
  const { a, ...rest } = restSrc;                     // 6. an object rest
  const withDefault = (x = mark('assignment_pattern:default')) => x;
  withDefault();                                      // 7. a default, omitted
  withDefault(9);                                     //    and supplied

  // SIX TRANSFERS OUT OF SEVEN CASES, named rather than counted.
  assert.deepEqual(ran, [
    'array_pattern:iterator',       // [, second] = iterable
    'object_pattern:getter',        // { taken } = withGetter
    'object_pattern:getter',        // { ...withGetter }
    'array_pattern:iterator',       // [...iterable]
    'array_pattern:iterator',       // sink(...iterable)
    'rest_element:getter',          // { a, ...rest } = restSrc
    'assignment_pattern:default',   // withDefault() and NOT withDefault(9)
  ]);
  // THE DEFAULT IS THE DISCRIMINATING CASE: two calls, one execution. That is
  // an arm skipped by a condition, which `guard_kind` already models — and it
  // is why `assignment_pattern` is the one of the four this layer could close.
  assert.equal(ran.filter((w) => w === 'assignment_pattern:default').length, 1);
  // ...and the other three transfer into a function the model cannot NAME,
  // because naming it needs the receiver's iterator or its getter — a standard
  // library this model does not have. Same shape as `accessor_call`, which the
  // layer does model, and structurally out of `accessor_read`'s reach because
  // none of these is a `member_expression`.
  assert.deepEqual([...new Set(ran)].sort(), [
    'array_pattern:iterator', 'assignment_pattern:default',
    'object_pattern:getter', 'rest_element:getter',
  ]);
  // the bindings are read so that no engine can elide the constructs above
  assert.deepEqual([second, taken, spreadCopy.taken, arrCopy.length, a, (rest as any).b],
    [2, 1, 1, 2, 1, 1]);
});

// ---------------------------------------------------------------------------
// 3s. ES2022 CLASS SYNTAX (w_class_fields), and the item's own question decided
//     the shape of every rule below: IS A PRIVATE NAME A KEY?
//
// It is not. `this.#edge` does not ask the receiver what `#edge` is — a private
// name is bound by the class body that DECLARES it, at parse time, and cannot be
// inherited, deleted, computed or reached from outside. So `key_name[code]` has
// no arm for `private_name`, `selects[flow]` stays EMPTY on a private member
// read, and the private half is a separate relation from `private_key` down to
// `may_be_node`. Two sites in the fixture say why rather than a paragraph, and
// mutant p1 below is the one that turns the second into a red.

/** every private reference in the corpus as `<class it is written in> reads
 *  <class that declares it>.#<name>` — a NAMED SET, so two branches growing the
 *  fixture merge as a union rather than as two right numbers. */
const innerClass = (w: World, n: string): string => {
  const cands = w.q('class_named[flow](CD, Name, File)')
    .filter(([cd]) => w.n(`ast_within[code](${cd}, ${n})`) === 1);
  return cands.filter(([cd]) => !cands.some(([o]) => o !== cd && w.n(`ast_within[code](${cd}, ${o})`) === 1))
    .map(([, name]) => name).sort().join('+') || '<none>';
};
const privBinds = (w: World) => w.q('private_binds[code](N, M)').map(([n, mm]) => {
  const row = w.q(`private_member[code](CD, Name, ${mm})`)[0];
  const owner = row ? (w.q(`class_named[flow](${row[0]}, N, F)`)[0]?.[0] ?? '?') : '?';
  return `${innerClass(w, n)} reads ${owner}.#${row ? row[1] : '?'}`;
}).sort();

/** the callees of class-field initialisers, by name. `sealed` is the STATIC
 *  one and it must never be in the may-not-run half. */
const FIELD_CALLEES = ['burnished', 'hammered', 'inked', 'minted', 'notched',
                       'pressed', 'punched', 'scored', 'sealed', 'stamped', 'struck'];
const fieldMayNotRun = (w: World) => [...names(w)].filter((n) => FIELD_CALLEES.includes(n)).sort();

/** the class-fields half of the call graph, as named edges */
const COIN = ['forge', 'strike', 'value', 'rim', 'usesCoin'];
const coinEdges = (w: World) => [...edges(w)]
  .filter((e) => FIELD_CALLEES.some((f) => e.endsWith(' -> ' + f)) || COIN.some((c) => e.endsWith(' -> ' + c)))
  .filter((e) => !e.startsWith('main ') && !e.startsWith('useTag ') && !e.startsWith('make '))
  .sort();

/** the private CALL sites that resolve, named by the private member they read —
 *  `#rim` is the method itself and `#mark` is the arrow a private field holds,
 *  so the two arms of `may_be_node` are told apart by NAME rather than by a
 *  count that both would move. */
const privateCallsResolved = (w: World) => w.q('private_binds[code](N, M)')
  .map(([n, mm]) => [w.q(`ast_child[code](C, callee, 0, ${n})`)[0]?.[0], mm])
  .filter(([c]) => c !== undefined && w.n(`resolved_site[code](${c})`) === 1)
  .map(([, mm]) => '#' + (w.q(`private_member[code](CD, Name, ${mm})`)[0]?.[1] ?? '?'))
  .sort();

/** the SHAPES of unresolved call sites inside the class-fields region, found by
 *  CONTAINMENT rather than by a line range - the fixture file is shared and a
 *  line number moves whenever anybody else appends to it. Empty on the baseline,
 *  and the seven unresolved sites elsewhere in that file stay put. */
const FIELD_ROOTS = ['Coin', 'Doubloon', 'Outer'];
const FIELD_FNS = ['usesCoin', 'usesDoubloon', 'usesPicked', 'usesPickedSub'];
const unresolvedInFields = (w: World) => {
  const roots = [
    ...w.q('class_named[flow](CD, Name, File)').filter(([, n]) => FIELD_ROOTS.includes(n)).map(([cd]) => cd),
    ...w.q('fn_name[code](F, N)').filter(([, n]) => FIELD_FNS.includes(n)).map(([f]) => f),
  ];
  const inside = new Set<string>();
  for (const r of roots) for (const [d] of w.q(`ast_within[code](${r}, D)`)) inside.add(d);
  return w.q('unresolved_call[code](C, S)').filter(([c]) => inside.has(c)).map(([, sh]) => sh).sort();
};

test('class fields, private names and static blocks, answered and measured', () => {
  const m = base();

  // THE FIVE KINDS ARE IN THE CORPUS, which is what took `kind_absent_ok` from
  // five rows to none — an excuse cannot outlive its cause.
  for (const k of ['class_property', 'class_private_property', 'class_private_method',
                   'private_name', 'static_block']) {
    assert.ok(m.n(`ast_node[code](N, ${k}, F, L)`) > 0, `positive control: ${k} is in the corpus`);
  }
  assert.equal(m.n('vocabulary_gap[audit](L, K)'), 0);
  assert.equal(m.n('kind_absent_stale[audit](K)'), 0);

  // A PRIVATE NAME IS NOT A KEY, stated as an absence with its positive control
  // beside it: every private member read has a `private_binds` row and NOT ONE
  // has a `selects` row, while the public reads in the same class do.
  const privRefs = m.q('private_ref[code](N, Name)');
  assert.ok(privRefs.length >= 7, `positive control: ${privRefs.length} private references`);
  assert.deepEqual(privRefs.filter(([n]) => m.n(`selects[flow](${n}, K)`) > 0), [],
    'no private member read has a string key');
  assert.ok(m.n('selects[flow](N, K)') > 0, 'positive control: public reads do');

  // ...AND IT BINDS LEXICALLY, WITH SHADOWING. `Inner` inside `Outer.make`
  // declares its own `#tag`; running the shape answers `inner/outer`.
  assert.deepEqual(privBinds(m), [
    'Coin reads Coin.#edge', 'Coin reads Coin.#face', 'Coin reads Coin.#mark',
    'Coin reads Coin.#rim', 'Coin reads Coin.#tally',
    'Inner reads Inner.#tag', 'Outer reads Outer.#tag',
    // ...and one more since 2026-09-08 (w_decorator_replaces_its_target):
    // `#tucked` is a DECORATED private method, and it is in this fixture as the
    // negative control for `decorated_member` — a private member must never
    // reach `member_value` under its bare name.
    'Thimble reads Thimble.#tucked',
  ]);

  // THE CALL GRAPH. `Coin.forge` is a STATIC field read through the class name,
  // `this.strike` an instance field through `this`, and `top -> forge` a call
  // inside a STATIC BLOCK — attributed to the file root, which is when a static
  // block runs, measured by running the shape.
  assert.deepEqual(coinEdges(m), [
    'forge -> hammered', 'rim -> notched', 'strike -> struck',
    'top -> forge', 'top -> inked', 'top -> minted', 'top -> punched', 'top -> sealed',
    'top -> stamped',
    'usesCoin -> forge', 'usesCoin -> value',
    'usesDoubloon -> forge', 'usesDoubloon -> strike',
    'usesPicked -> rim', 'usesPickedSub -> value',
    'value -> strike',
  ]);
  // TWO OF THOSE ARE THE SAME EXPRESSION ON TWO CLASSES. `usesPicked -> rim`
  // and `usesPickedSub -> value` are both `new C()[C.pick](n)`, and they differ
  // because `Doubloon` declares its own `pick` and shadows the inherited one -
  // which is what makes `own_key[flow] :- field_of[flow]` load-bearing.
  // ...and the other two are INHERITED fields: `strike` and `forge` are declared
  // on `Coin` alone and reached through a `Doubloon`.
  // ...AND THE EDGE THAT MUST NOT BE THERE, said separately because an absence
  // inside a set assertion is invisible to a reader.
  assert.equal(edges(m).has('value -> rim'), false,
    'a private call does not reach the public twin of its name');
  assert.ok(m.n('unresolved_call[code](C, S)') > 0, 'positive control: the corpus has unresolved sites');
  assert.deepEqual(unresolvedInFields(m), [], 'every call site in the class-fields region resolves');

  // CONTROL FLOW, and the split is the whole of it: a NON-STATIC field
  // initialiser is an arm skipped by the absence of a `new`, a static one is
  // not. Measured by running the shape — `class Never { unused = mark(); static
  // tag = mark(); }`, defined and never constructed, ran only the static one.
  assert.deepEqual(fieldMayNotRun(m),
    ['burnished', 'inked', 'minted', 'punched', 'scored', 'stamped', 'struck']);
  assert.equal(names(m).has('sealed'), false, 'the static field initialiser always runs');
  assert.equal(names(m).has('hammered'), false, 'and so does what it holds, when it is called');

  // ...and every arm it derives is a non-static one, with the positive control
  // that static fields exist to be excluded.
  assert.deepEqual(m.q('field_init[code](P, V)')
    .filter(([p]) => m.n(`ast_attr[code](${p}, static, false)`) !== 1), [],
    'every guarded field initialiser is a non-static one');
  assert.ok(m.q('field_of[flow](CD, Key, P, V)')
    .some(([, , p]) => m.n(`ast_attr[code](${p}, static, true)`) === 1),
    'positive control: static fields exist and are NOT in field_init');

  // A PRIVATE ACCESSOR IS A CALL WEARING A READ'S SYNTAX, like a public one and
  // through none of the same machinery.
  const privAcc = m.q('accessor_read[code](N, M)')
    .filter(([, mm]) => m.q(`ast_node[code](${mm}, K, F, L)`)[0]?.[0] === 'class_private_method');
  assert.equal(privAcc.length, 1, 'the private getter is read as a transfer');
  assert.equal(m.n(`may_not_run[code](${privAcc[0][1]})`), 1,
    'and behind a conditional it may not run');

  // THE VERDICTS, and the audits that would contradict them.
  for (const [k, l, v] of [
    ['class_property', 'callgraph', 'r_field_value'], ['class_property', 'dataflow', 'r_field_value'],
    ['class_property', 'controlflow', 'r_field_guard'],
    ['class_private_property', 'callgraph', 'r_private_binding'],
    ['class_private_property', 'dataflow', 'r_private_binding'],
    ['class_private_property', 'controlflow', 'r_field_guard'],
    ['class_private_method', 'callgraph', 'r_call_edge'],
    ['class_private_method', 'dataflow', 'r_call_flow'],
    ['class_private_method', 'controlflow', 'r_reachability'],
    ['private_name', 'callgraph', 'r_private_binding'],
    ['private_name', 'dataflow', 'r_private_binding'],
    ['private_name', 'controlflow', 'r_accessor'],
    ['static_block', 'dataflow', 'r_static_block_this'],
  ]) assert.deepEqual(m.q(`handled(js, ${k}, ${l}, R)`).flat(), [v], `${k} x ${l}`);
  assert.deepEqual(m.q('ignored(js, static_block, callgraph, R)').flat(), ['a_a_statement_is_not_a_callee']);
  assert.deepEqual(m.q('ignored(js, static_block, controlflow, R)').flat(),
    ['a_a_static_block_runs_when_the_class_is_defined']);
  assert.equal(m.n('orphan_claim[audit](L, K, X)'), 0);
  assert.equal(m.n('guard_unmodelled[audit](K)'), 0);
  assert.equal(m.n('mechanism_unanswered[audit](M)'), 0);
});

// THE MUTANT SET. Eighteen, each with its OWN oracle, and the question asked of
// each rule before it was written was "where is this structurally unable to
// look" rather than "what else could I break" — which is why p1 (the namespace
// conflation) and c3 (the mechanism split) are here at all.
const FIELDS: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'f1 a field is not a member at all',
    mut: [{ find: 'member_value[flow](CD, Key, V) :- field_of[flow](CD, Key, _, V).', replace: '',
            file: 'rules/js-dataflow.rofl' }],
    // IT SURVIVED THE FIRST RUN AND THE SURVIVAL WAS THE FINDING: everything
    // downstream reads `field_of` directly, so before the subclass and the two
    // computed-key sites went into the fixture this arm was decoration. What
    // reads it now is `may_be_lit` through a member - the literal a field holds.
    expect: (m, b) => {
      assert.deepEqual(coinEdges(b).filter((e) => !coinEdges(m).includes(e)),
        ['usesPicked -> rim', 'usesPickedSub -> value'],
        'a field holding a literal stops being readable as one');
      assert.equal(m.n('own_key[flow](CD, K)'), b.n('own_key[flow](CD, K)'),
        'own_key has its own arm and does not move');
    },
  },
  {
    name: 'f2 an instance field is visible through no receiver',
    mut: [{ find: `class_member_proto[flow](CD, Key, V)  :- field_of[flow](CD, Key, P, V),
                                         ast_attr[code](P, static, false).`, replace: '',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.deepEqual(coinEdges(b).filter((e) => !coinEdges(m).includes(e)),
        ['value -> strike'],
        'the OWN instance field goes and the static one stays — and so does the '
        + 'INHERITED one, because `inherited_field` reads `field_of` rather than '
        + 'this arm, which is what f5 is for');
      assert.equal(m.n('member_value[flow](O, K, V)'), b.n('member_value[flow](O, K, V)'),
        'the member still EXISTS — only the receiver half is gone');
    },
  },
  {
    name: 'f3 a static field is visible through no receiver',
    mut: [{ find: `class_member_static[flow](CD, Key, V) :- field_of[flow](CD, Key, P, V),
                                         ast_attr[code](P, static, true).`, replace: '',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.deepEqual(coinEdges(b).filter((e) => !coinEdges(m).includes(e)),
      ['top -> forge', 'usesCoin -> forge'],
      'the OWN static field goes and the instance one stays'),
  },
  {
    name: 'f4 the `static` split is dropped and every field is an instance field',
    mut: [{ find: `class_member_proto[flow](CD, Key, V)  :- field_of[flow](CD, Key, P, V),
                                         ast_attr[code](P, static, false).`,
            replace: `class_member_proto[flow](CD, Key, V)  :- field_of[flow](CD, Key, P, V),
                                         ast_attr[code](P, static, _).`,
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.ok(m.n('class_member_proto[flow](CD, K, V)') > b.n('class_member_proto[flow](CD, K, V)'),
      'a static field becomes visible on an instance'),
  },
  {
    name: 'f5 an inherited INSTANCE field is visible through no receiver',
    mut: [{ find: `class_member_proto[flow](CD, Key, V)  :- inherited_field[flow](CD, Key, P, V),
                                         ast_attr[code](P, static, false).`, replace: '',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.deepEqual(coinEdges(b).filter((e) => !coinEdges(m).includes(e)),
      ['usesDoubloon -> strike'], 'a field the base class declares stops answering on a subclass instance'),
  },
  {
    name: 'f6 an inherited STATIC field is visible through no receiver',
    mut: [{ find: `class_member_static[flow](CD, Key, V) :- inherited_field[flow](CD, Key, P, V),
                                         ast_attr[code](P, static, true).`, replace: '',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.deepEqual(coinEdges(b).filter((e) => !coinEdges(m).includes(e)),
      ['usesDoubloon -> forge'], 'and the static half is a separate arm with a separate site'),
  },
  {
    name: 'f7 a field does not shadow the one it overrides',
    mut: [{ find: 'own_key[flow](CD, Key)         :- field_of[flow](CD, Key, _, _).', replace: '',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.deepEqual(coinEdges(m).filter((e) => !coinEdges(b).includes(e)),
      ['usesPickedSub -> rim'],
      'the subclass answers with the parent`s `pick` as well as its own'),
  },
  {
    name: 'p1 a private name is read as an ordinary key',
    // THE MUTANT THE WHOLE DESIGN EXISTS TO KILL, and it is an ADDITION rather
    // than a deletion: give `key_name` the arm that spells a private name by the
    // bare identifier under it, and `#rim` and the public `rim` become one
    // member of one class.
    // THE MUTANT IS ON `selects` AND NOT ON `key_name`, and finding that out was
    // itself a measurement: the first version added the private arm to
    // `key_name` and CHANGED NOTHING, because `selects[flow]` reads
    // `ast_name[code]` on the property directly and a `private_name` carries no
    // `name` attribute. So the arm that would make a private read an ordinary
    // key read is this one, and this is where the whole design is falsifiable.
    mut: [{ find: `selects[flow](N, Key)       :- member_node_v[flow](N), ast_attr[code](N, computed, false),
                               ast_child[code](N, property, 0, P), ast_name[code](P, Key).`,
            replace: `selects[flow](N, Key)       :- member_node_v[flow](N), ast_attr[code](N, computed, false),
                               ast_child[code](N, property, 0, P), ast_name[code](P, Key).
selects[flow](N, Key)       :- member_node_v[flow](N),
                               ast_child[code](N, property, 0, P), private_key[code](P, Key).`,
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.equal(edges(m).has('value -> rim'), true,
        'a private call reaches the public twin of its name');
      assert.equal(edges(b).has('value -> rim'), false, 'positive control');
    },
  },
  {
    name: 'p2 a private name binds in any enclosing class, not the nearest',
    mut: [{ find: 'ast_within[code](CD, N), not private_inner[code](N, CD).',
            replace: 'ast_within[code](CD, N).', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.deepEqual(privBinds(m).filter((x) => !privBinds(b).includes(x)),
      ['Inner reads Outer.#tag'], 'the shadowed declaration answers too'),
  },
  {
    name: 'p3 a private name binds without being inside the declaring class',
    mut: [{ find: `private_binds[code](N, M)  :- private_ref[code](N, Name), private_member[code](CD, Name, M),
                              ast_within[code](CD, N), not private_inner[code](N, CD).`,
            replace: `private_binds[code](N, M)  :- private_ref[code](N, Name), private_member[code](CD, Name, M),
                              not private_inner[code](N, CD).`,
            file: 'rules/js-dataflow.rofl' }],
    // ...AND IT LEAKS IN ONE DIRECTION ONLY, which is the measurement rather
    // than the guess: `private_inner` is still in the body, so the reference in
    // `Inner` still has `Outer` shadowed away, and only the OUTER reference —
    // which no closer class declares `#tag` for — reaches into the nested class.
    // The two literals are therefore not redundant with one another.
    expect: (m, b) => assert.deepEqual(privBinds(m).filter((x) => !privBinds(b).includes(x)).sort(),
      ['Outer reads Inner.#tag'],
      'a private name reaches into a class it is not written in'),
  },
  {
    name: 'p4 the value a private field holds is not carried',
    mut: [{ find: `may_be_node[flow](N, V2) :- private_binds[code](N, M),
                            ast_node[code](M, class_private_property, _, _),
                            ast_child[code](M, value, 0, V), may_be_node[flow](V, V2).`,
            replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.deepEqual(unresolvedInFields(m), ['s_member_on_this'], 'one site stops resolving');
      // `#tucked` JOINED BOTH LISTS on 2026-09-08 and it is on neither side of
      // this mutant's question: it is a private METHOD, so it resolves through
      // `private_binds` directly and the field arm this mutation deletes never
      // touched it. What the mutant still says is exactly what it said —
      // `#mark` leaves and `#rim` stays.
      assert.deepEqual(privateCallsResolved(m), ['#rim', '#tucked'], 'and it is `this.#mark(n)`');
      assert.deepEqual(privateCallsResolved(b), ['#mark', '#rim', '#tucked'], 'positive control');
    },
  },
  {
    name: 'p5 a private method is not its own value',
    mut: [{ find: `may_be_node[flow](N, M)  :- private_binds[code](N, M),
                            ast_node[code](M, class_private_method, _, _).`,
            replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.deepEqual(unresolvedInFields(m), ['s_member_on_this'], 'one site stops resolving');
      assert.deepEqual(privateCallsResolved(m), ['#mark'], 'and it is `this.#rim(n)`');
      assert.deepEqual(coinEdges(b).filter((e) => !coinEdges(m).includes(e)), [],
        'and no NAMED edge moves, because a private method has no name to lose');
    },
  },
  {
    name: 'p6 `this` inside a private method reaches no class',
    mut: [{ find: `class_method_of[flow](CD, M) :- obj_like[flow](CD), ast_child[code](CD, body, 0, B),
                                ast_child[code](B, body, _, M),
                                ast_node[code](M, class_private_method, _, _).`,
            replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.deepEqual(unresolvedInFields(m), ['s_member_on_this'],
        '`this.strike(n)` inside `#rim` loses its receiver');
      assert.deepEqual(unresolvedInFields(b), [], 'positive control');
    },
  },
  {
    name: 'c1 a field initialiser is not a guarded arm',
    mut: [{ find: 'guard_arm[code](P, V)  :- field_init[code](P, V).', replace: '' }],
    expect: (m, b) => assert.deepEqual(fieldMayNotRun(b).filter((n) => !fieldMayNotRun(m).includes(n)),
      ['burnished', 'inked', 'minted', 'punched', 'scored', 'stamped', 'struck']),
  },
  {
    name: 'c2 a STATIC field initialiser is guarded too',
    mut: [{ find: 'ast_node[code](P, K, _, _), ast_attr[code](P, static, false),',
            replace: 'ast_node[code](P, K, _, _), ast_attr[code](P, static, _),' }],
    // TWO NAMES, NOT ONE, and the second is what the mutant teaches: guarding a
    // static field guards everything INSIDE its initialiser too, so `hammered` —
    // reached only through the arrow that `static forge` holds — is reported as
    // maybe-dead as well. One wrong attribute costs a subtree, not a row.
    expect: (m, b) => assert.deepEqual(fieldMayNotRun(m).filter((n) => !fieldMayNotRun(b).includes(n)),
      ['hammered', 'sealed'], 'a call that always runs is reported as one that may not'),
  },
  {
    name: 'c3 only PUBLIC fields carry the mechanism',
    mut: [{ find: 'transfer_mechanism(class_private_property,     per_construction).', replace: '' }],
    expect: (m, b) => assert.deepEqual(fieldMayNotRun(b).filter((n) => !fieldMayNotRun(m).includes(n)),
      ['burnished', 'inked', 'minted', 'scored'],
      'the private initialisers stop being guarded and the public ones do not'),
  },
  {
    name: 'c4 the private accessor is not a transfer',
    mut: [{ find: `accessor_read[code](N, M) :- private_binds[code](N, M),
                             accessor_kind(K), ast_attr[code](M, kind, K).`, replace: '' }],
    expect: (m, b) => {
      const priv = (w: World) => w.q('accessor_read[code](N, M)')
        .filter(([, mm]) => w.q(`ast_node[code](${mm}, K, F, L)`)[0]?.[0] === 'class_private_method').length;
      assert.equal(priv(m), 0);
      assert.equal(priv(b), 1, 'positive control');
    },
  },
  {
    name: 'c5 the mechanism is unanswered',
    mut: [{ find: 'mechanism_modelled(per_construction).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('mechanism_unanswered[audit](M)').flat(), ['per_construction']),
  },
  {
    name: 'c6 the two field kinds are not named as reached',
    mut: [{ find: 'guard_named[code](K)       :- transfer_mechanism(K, per_construction).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat().sort(),
      ['class_private_property', 'class_property']),
  },
  {
    name: 's1 `this` in a static block is an instance, not the class',
    mut: [{ find: 'class_receiver[flow](T)       :- static_block_of[flow](_, SB), this_host[flow](SB, T).',
            replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.deepEqual(coinEdges(b).filter((e) => !coinEdges(m).includes(e)),
      ['top -> forge'], 'a static member read through `this` in a static block'),
  },
  {
    name: 's2 a static block binds no `this` at all',
    mut: [{ find: 'this_binds_kind(static_block).', replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.deepEqual(coinEdges(b).filter((e) => !coinEdges(m).includes(e)), ['top -> forge']);
      assert.equal(m.n('static_block_of[flow](CD, SB)'), b.n('static_block_of[flow](CD, SB)'),
        'the block is still found — it is the `this` inside it that is lost');
    },
  },
  {
    name: 'n1 a class field does not name the function it holds',
    mut: [{ find: `fn_name[code](F, N) :- fn_node[code](F), class_field_kind(K), ast_node[code](P, K, _, _),
                       ast_child[code](P, value, 0, F),
                       ast_child[code](P, key, 0, KN), key_name[code](KN, N).`,
            replace: '', file: 'rules/js-callgraph.rofl' }],
    expect: (m, b) => {
      assert.deepEqual(coinEdges(b).filter((e) => !coinEdges(m).includes(e)),
        ['forge -> hammered', 'strike -> struck', 'top -> forge', 'usesCoin -> forge',
         'usesDoubloon -> forge', 'usesDoubloon -> strike', 'value -> strike']);
      assert.equal(m.n('resolves[code](C, F)'), b.n('resolves[code](C, F)'),
        'every site still RESOLVES — this mutant takes the NAME and not the edge, '
        + 'which is exactly the state a private method is permanently in');
    },
  },
];

for (const g of FIELDS) test(`${g.name} — class fields`, () => g.expect(build(g.mut), base()));
