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
      // the SITE is still declared here, only the resolution goes.
      assert.equal(m.n('transfer_site[code](X, K)'), 22, 'the transfer sites are untouched');
      // ...and one more call goes unresolved: `f()` in useTag has no value to
      // call once the tagged template stops evaluating to the tag's return.
      assert.equal(b.n('unresolved_call[code](C, S)'), 180);
      assert.equal(m.n('unresolved_call[code](C, S)'), 181);
    },
  },
  {
    name: 'g2 the kind stops being a transfer site',
    mut: [{ find: 'transfer_kind(tagged_template_expression).', replace: '',
            file: 'rules/js-callgraph.rofl' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['bTag -> mark', 'useTag -> mark', 'useTag -> stamped']);
      assert.deepEqual(b.q('transfer_site[code](X, K)')
        .reduce((acc: Record<string, number>, [, k]) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {}),
        { new_expression: 19, tagged_template_expression: 3 });
      assert.equal(m.n('transfer_site[code](X, K)'), 19,
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
      assert.equal(b.n('resolves[code](C, F)'), 201);
      assert.equal(m.n('resolves[code](C, F)'), 202, 'and the row is the only witness');
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
  assert.equal(m.n('ambiguous_call[audit](C, F, G)'), 8, 'and nothing new is ambiguous');
  assert.deepEqual(m.q('transfer_site[code](X, K)')
    .filter(([, k]) => k === 'tagged_template_expression')
    .map(([x]) => m.q(`ast_node[code](${x}, K, File, L)`)[0]?.[1]).sort(),
    ['alpha.mjs', 'beta.mjs', 'shapes.ts']);
});
