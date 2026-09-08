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
// takes `ambiguous_call` from 8 to 9. h1 deletes the `resolves` arm and
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
  assert.equal(m.n('ambiguous_call[audit](C, F, G)'), 8);
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
      assert.deepEqual(stdlib(b).filter((x) => !stdlib(m).includes(x)), ['string.concat']);
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
      assert.deepEqual(stdlib(b), ['array.join', 'array.join', 'string.concat'],
        'two arrays — one written in place and one reached through a binder');
      assert.deepEqual(stdlib(m), ['array.join', 'string.concat'],
        'and the bound one is the row this arm carries');
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
  assert.deepEqual(stdlib(m), ['array.join', 'array.join', 'string.concat']);
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
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['scoped -> fetched', 'useDestructured -> pulled'],
        'the runnable site and the scanned one');
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
        ['scoped -> fetched', 'useDestructured -> pulled']);
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
        ['scoped -> fetched', 'useDestructured -> pulled']);
      assert.deepEqual(bound(b), ['inner<-fetchIt', 'taken<-pulled']);
      assert.deepEqual(bound(m), ['fetchIt<-inner', 'pulled<-taken'], 'read backwards');
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
  assert.deepEqual(bound(m), ['inner<-fetchIt', 'taken<-pulled'],
    'local on the left, member key on the right');
  // ...AND THE KIND IS IN THE VOCABULARY NOW, which is what took the matrix
  // from reporting nothing about it to reporting four cells.
  assert.equal(m.n('vocabulary_gap[audit](L, K)'), 0);
  assert.ok(m.n('ast_node[code](P, object_pattern, F, L)') > 0, 'positive control: patterns exist');
});
