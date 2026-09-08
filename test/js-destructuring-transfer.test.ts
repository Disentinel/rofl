// js-destructuring-transfer.test.ts — A DESTRUCTURING FORM HIDES A CALL, and
// the four cells that said it does not (w_destructuring_hides_a_call).
//
// IT IS A FILE OF ITS OWN FOR THE REASON test/js-corpus-world.ts gives: a world
// costs a fixpoint, this item runs fifteen mutants, and `node --test` runs
// several files at once. The construction is shared; nothing here rebuilds it.
//
// THE ORACLE IS THE RUNTIME, and for this item that is not decoration. Every
// claim the layer makes here is a claim about what EXECUTES — a getter that runs
// when a key is bound, an iterator that runs when a pattern counts — so the
// execution oracle in test/js-callgraph.test.ts (V8's own stack, read by
// test/fixtures/js-call/trace.mjs, which reads no rule and no scanner fact) can
// contradict every one of them. It reports `missed` EMPTY over the whole corpus
// with these fourteen edges in it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, base, edges, read } from './js-corpus-world.ts';
import type { Mut, World } from './js-corpus-world.ts';

// ---------------------------------------------------------------------------
// THE TWO NAMED SETS EVERY MUTANT IS JUDGED AGAINST.
//
// NEITHER IS A COUNT AND NEITHER EMBEDS A COORDINATE. `hidden` names the
// enclosing FUNCTION, the node's KIND and the callee's NAME — three names — so a
// branch appending to alpha.mjs above these fixtures moves nothing in it, which
// a `file:line` element would not survive. `top` is a name too: it is what the
// model calls the module root and what the oracle calls the frame with no
// function on it.

/** the enclosing function of a node, by name, or `top` at module scope.
 *
 *  BY CONTAINMENT AND NOT BY `nearest_fn`, and the difference is the whole
 *  reason this helper is four lines instead of one. `nearest_fn` ranges over
 *  `site[code]`, so two of the mutants below — the ones that delete a `site`
 *  arm — would make every row of this set read `top` and the oracle would be
 *  measuring the plumbing it is supposed to hold fixed. An instrument that
 *  moves with the thing it measures reports agreement it did not observe. */
const where = (w: World, n: string): string => {
  const cands = w.q('fn_name[code](F, N)').filter(([f]) => w.n(`ast_within[code](${f}, ${n})`) === 1);
  const inner = cands.filter(([f]) => !cands.some(([g]) => g !== f && w.n(`ast_within[code](${f}, ${g})`) === 1));
  return inner.map(([, name]) => name).sort().join('+') || 'top';
};
const kindOf = (w: World, n: string) => w.q(`ast_node[code](${n}, K, F, L)`)[0]?.[0] ?? '?';
/** the callee's name. `ast_name` is the FALLBACK and not decoration: the
 *  mutants below make this relation reach things that are not functions —
 *  `member_value` names the NODE a key holds, which for `{ plain: latched }` is
 *  the identifier — and a row that read back as a node id would be unreadable
 *  in the one place a reader needs to see what the mutant claimed. */
const nameOf = (w: World, m: string) => w.q(`fn_name[code](${m}, N)`)[0]?.[0]
  ?? w.q(`ast_name[code](${m}, N)`)[0]?.[0] ?? m;

/** every hidden call a destructuring form makes: `<caller> / <kind> -> <callee>` */
const hidden = (w: World) => [
  ...w.q('pattern_accessor[code](N, M)'), ...w.q('pattern_iterates[code](N, M)'),
].map(([n, m]) => `${where(w, n)} / ${kindOf(w, n)} -> ${nameOf(w, m)}`).sort();

/** the CALL GRAPH's half of the same question, restricted to the functions this
 *  family can reach. `iterator` and `bump` are on the list on purpose: they are
 *  also `for-of`'s callees, so every mutant here doubles as a control that the
 *  loop's own edges — and shapes.ts's `onIterObject` — do not move. */
const CALLEES = ['notch', 'spare', 'reading', 'latched', 'joins', 'iterator', 'bump'];
const famEdges = (w: World) => [...edges(w)]
  .filter((e) => CALLEES.some((c) => e.endsWith(' -> ' + c))).sort();

const HIDDEN_BASE = [
  'top / object_pattern -> spare',
  'useArrayPatternIter / array_pattern -> iterator',
  'usePatternGetter / object_pattern -> notch',
  'usePatternOtherSource / object_pattern -> reading',
  'usePatternRest / object_pattern -> notch',
  'usePatternRest / rest_element -> spare',
  'useSpreadArgIter / spread_element -> iterator',
  'useSpreadGetter / spread_element -> notch',
  'useSpreadGetter / spread_element -> spare',
  'useSpreadIter / spread_element -> iterator',
];

const EDGES_BASE = [
  'onIterObject -> iterator',
  'top -> spare',
  'useArrayPatternIter -> bump',
  'useArrayPatternIter -> iterator',
  'useGauge -> reading',
  'useIterable -> bump',
  'useIterable -> iterator',
  'usePatternGetter -> notch',
  'usePatternOtherSource -> reading',
  'usePatternRest -> latched',
  'usePatternRest -> notch',
  'usePatternRest -> spare',
  'useSpreadArgIter -> bump',
  'useSpreadArgIter -> iterator',
  'useSpreadArgIter -> joins',
  'useSpreadGetter -> latched',
  'useSpreadGetter -> notch',
  'useSpreadGetter -> spare',
  'useSpreadIter -> bump',
  'useSpreadIter -> iterator',
];

// ===========================================================================
// 1. WHAT THE LAYER NOW SAYS, and it is the four cells the item owns.

test('four cells that said they transfer nothing are modelled, checked and named', () => {
  const m = base();

  assert.deepEqual(hidden(m), HIDDEN_BASE, 'every hidden call, by caller, kind and callee');
  assert.deepEqual(famEdges(m), EDGES_BASE, 'and the call graph carries every one of them');

  // THE VERDICTS. `none` is the shape column: these are kind-level cells.
  for (const k of ['object_pattern', 'array_pattern', 'rest_element', 'spread_element']) {
    assert.deepEqual(m.q(`verdict[audit](js, ${k}, S, controlflow, V)`), [['none', 'modelled']],
      `${k} at the control-flow layer`);
    // ...and each is CHECKED against the execution oracle, which is what
    // `verified` means and what no cell at this layer could say before.
    assert.ok(m.q('verified[audit](L, K, X, R)').some(([, kk, l]) => kk === k && l === 'controlflow'),
      `${k} has evidence, not just a claim`);
  }

  // THE ONE KIND IN THIS TABLE CARRYING TWO MECHANISMS, which is what the two
  // rules are for: in `properties` a spread copies keys and runs getters, in
  // `elements`/`arguments` it exhausts an iterator.
  assert.deepEqual(m.q('transfer_mechanism(spread_element, M)').flat().sort(),
    ['accessor_call', 'iterator_call']);
  assert.deepEqual(m.q('transfer_mechanism(K, iterator_call)').flat().sort(),
    ['array_pattern', 'for_of_statement', 'spread_element']);
  assert.deepEqual(m.q('transfer_mechanism(K, accessor_call)').flat().sort(),
    ['member_expression', 'object_pattern', 'rest_element', 'spread_element']);

  // and the layer's own gates stay shut
  assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), []);
  assert.deepEqual(m.q('mechanism_unanswered[audit](M)').flat(), []);
  assert.deepEqual(m.q('double_claimed[audit](L, K, X)'), []);
  assert.deepEqual(m.q('orphan_claim[audit](L, K, X)'), []);
  assert.deepEqual(m.q('stale_reason[audit](L, K, X, R)'), []);
  assert.deepEqual(m.q('vocabulary_gap[audit](L, K)'), []);
});

// ===========================================================================
// 2. WHAT THE STANDARD-LIBRARY SURFACE SAYS ABOUT `Symbol.iterator`, which is
//    the dependency this item was BLOCKED on and the reason it was the wrong
//    one. Measured with a positive control on the same query shape, because an
//    empty result is a fact about the query until shown otherwise.

test('the library surface is keyed by NAME, and a well-known symbol is not a name', async () => {
  const { Rofl } = await import('../src/api.ts');
  const r = new Rofl();
  const res = r.load([read('boot.rofl'), read('facts/js-lib-surface.rofl')].join('\n'));
  assert.ok(res.ok, res.diagnostics.slice(0, 3).join('\n'));
  r.evaluate(20_000_000);
  // `unpopulatable` IS READ HERE AND NOT AS BOILERPLATE. The whole point of this
  // test is a query that comes back EMPTY, and an empty answer is a fact about
  // the query until the world says the literal could have been populated at all
  // — which is exactly the field's job. test/query-unpopulatable.test.ts sweeps
  // the directory for a file that builds a model world, queries it, and never
  // asks; it named this file within one run of being written.
  const n = (lit: string) => {
    const q = r.query(lit);
    assert.equal(q.error, undefined, `${lit}: ${q.error}`);
    assert.equal(q.unpopulatable, false, `${lit}: nothing in this world can populate it`);
    assert.equal(q.partial, false, `${lit}: hit a budget`);
    return q.rows.length;
  };
  // POSITIVE CONTROL FIRST: the surface is loaded and answers.
  assert.ok(n('lib_member(P, K, R)') > 100, 'the surface carries a standard library');
  assert.equal(n('lib_member(array, "join", R)'), 1, 'and it answers a name it has');
  // ...AND IT HAS NOTHING FOR THE ITERATOR PROTOCOL, under any spelling.
  for (const key of ['"iterator"', '"Symbol.iterator"', '"[Symbol.iterator]"', '"next"'])
    assert.equal(n(`lib_member(P, ${key}, R)`), 0, `lib_member(P, ${key}, R)`);
  // WHICH IS WHY `w_env_api_surface` COULD NOT HAVE UNBLOCKED THIS ITEM. What
  // did was the observation that the receiver decides: a source owning a getter
  // or a `[Symbol.iterator]` is user code the model already names, and every
  // destructuring site in the corpus before this item read a plain one.
});

// ===========================================================================
// 3. THE MUTANTS. Fifteen, each with its OWN oracle, and three more that are
//    NAMED AND NOT RUN because each is unkillable for a stated reason.

const AP = `pattern_accessor[code](P, M) :- ast_node[code](P, object_pattern, _, _),
                                pattern_source[code](P, Init), may_be_node[flow](Init, Obj),
                                pattern_takes[code](P, Key), accessor_of[flow](Obj, Key, M).`;
const AR = `pattern_accessor[code](R, M) :- rest_in_pattern[code](D, R, _),
                                ast_child[code](D, id, 0, P),
                                ast_child[code](D, init, 0, Init), may_be_node[flow](Init, Obj),
                                accessor_of[flow](Obj, Key, M), not pattern_takes[code](P, Key).`;
const AS = `pattern_accessor[code](S, M) :- ast_node[code](O, object_expression, _, _),
                                ast_child[code](O, properties, _, S),
                                ast_node[code](S, spread_element, _, _),
                                ast_child[code](S, argument, 0, A), may_be_node[flow](A, Obj),
                                accessor_of[flow](Obj, Key, M).`;
const IP = `pattern_iterates[code](P, M) :- ast_node[code](P, array_pattern, _, _),
                                pattern_source[code](P, Init), may_be_node[flow](Init, Obj),
                                member_value[flow](Obj, "iterator", M), fn_node[code](M).`;
const NEXT = `calls[code](Caller, Next) :- pattern_iterates[code](X, M), nearest_fn[code](Caller, X),
                             returns[flow](M, E), may_be_node[flow](E, IterObj),
                             member_value[flow](IterObj, "next", V),
                             may_be_node[flow](V, Next), fn_node[code](Next).`;
const SRC = `pattern_source[code](P, Init) :- ast_node[code](D, variable_declarator, _, _),
                                 ast_child[code](D, id, 0, P),
                                 ast_child[code](D, init, 0, Init).`;

/** what the mutant GAINED and what it LOST, over a named set */
const gained = (m: World, b: World, f: (w: World) => string[]) => {
  const before = new Set(f(b));
  return f(m).filter((x) => !before.has(x));
};
const lost = (m: World, b: World, f: (w: World) => string[]) => {
  const after = new Set(f(m));
  return f(b).filter((x) => !after.has(x));
};

const MUT: { name: string; targets: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'd1 a destructured key is a hidden call whether or not it is an accessor',
    targets: 'the `accessor_of` premise of the object-pattern arm',
    mut: [{ find: 'pattern_takes[code](P, Key), accessor_of[flow](Obj, Key, M).',
            replace: 'pattern_takes[code](P, Key), member_value[flow](Obj, Key, M).' }],
    // `{ notch, plain: fromDial }` takes ONE getter and ONE plain key, which is
    // the whole reason the plain key is in the pattern: with getters alone this
    // mutant derives exactly what the rule does.
    expect: (m, b) => {
      assert.ok(gained(m, b, hidden).includes('usePatternGetter / object_pattern -> latched'),
        'a plain property is not a call');
      assert.deepEqual(lost(m, b, hidden), []);
    },
  },
  {
    name: 'd2 an object pattern runs every getter of its source, not the keys it names',
    targets: 'the `pattern_takes` premise of the object-pattern arm',
    mut: [{ find: 'pattern_takes[code](P, Key), accessor_of[flow](Obj, Key, M).',
            replace: 'accessor_of[flow](Obj, Key, M).' }],
    expect: (m, b) => assert.deepEqual(gained(m, b, hidden).sort(), [
      'top / object_pattern -> notch',
      'usePatternGetter / object_pattern -> spare',
      'usePatternOtherSource / object_pattern -> broken',
      'usePatternRest / object_pattern -> spare',
    ], 'a key the pattern never names'),
  },
  {
    name: 'd3 an object rest copies the keys the pattern already took',
    targets: 'the `not pattern_takes` exclusion of the rest arm',
    mut: [{ find: 'accessor_of[flow](Obj, Key, M), not pattern_takes[code](P, Key).',
            replace: 'accessor_of[flow](Obj, Key, M).' }],
    expect: (m, b) => assert.deepEqual(gained(m, b, hidden),
      ['usePatternRest / rest_element -> notch'], 'the exclusion is the content of the arm'),
  },
  {
    name: 'd4 an object spread copies keys without reading them',
    targets: 'the object-spread arm',
    mut: [{ find: AS, replace: '' }],
    expect: (m, b) => {
      assert.deepEqual(lost(m, b, hidden),
        ['useSpreadGetter / spread_element -> notch', 'useSpreadGetter / spread_element -> spare']);
      // ...and the VALUE half of the same spread is untouched: `copy.plain(n)`
      // still reaches `latched` through the dataflow arm, which is a different
      // rule in a different pack answering a different question.
      assert.deepEqual(lost(m, b, famEdges),
        ['useSpreadGetter -> notch', 'useSpreadGetter -> spare']);
      assert.ok(famEdges(m).includes('useSpreadGetter -> latched'));
    },
  },
  {
    name: 'd5 an object spread reads a getter without checking whose it is',
    targets: 'the receiver check of the object-spread arm',
    mut: [{ find: `ast_child[code](S, argument, 0, A), may_be_node[flow](A, Obj),
                                accessor_of[flow](Obj, Key, M).`,
            replace: `ast_child[code](S, argument, 0, A), may_be_node[flow](A, _),
                                accessor_of[flow](Obj, Key, M).` }],
    // `{ ...counter }` and `{ ...kit }` own no getter at all, and the oracle
    // says nothing runs at either.
    expect: (m, b) => assert.ok(
      gained(m, b, hidden).includes('useObjectSpreadOfIterable / spread_element -> notch'),
      'a spread of one object claiming another object\'s getter'),
  },
  {
    name: 'd6 an object pattern reads a getter without checking whose it is',
    targets: 'the receiver check of the object-pattern arm',
    mut: [{ find: `pattern_source[code](P, Init), may_be_node[flow](Init, Obj),
                                pattern_takes[code](P, Key), accessor_of[flow](Obj, Key, M).`,
            replace: `pattern_source[code](P, Init), may_be_node[flow](Init, _),
                                pattern_takes[code](P, Key), accessor_of[flow](Obj, Key, M).` }],
    // `shim` OWNS `broken` AS A PLAIN 3 and `gauge` owns it as a getter — the
    // same decoy `accessor_read`'s own receiver mutant needed, which SURVIVED
    // until `shim` existed. Without `usePatternPlainKey` this mutant survives
    // too, because every other key in the corpus has exactly one owner.
    expect: (m, b) => assert.ok(
      gained(m, b, hidden).includes('usePatternPlainKey / object_pattern -> broken'),
      'a pattern over a plain property claiming another object\'s getter'),
  },
  {
    name: 'd7 a spread ARGUMENT does not iterate',
    targets: 'spread_iterable_field(arguments)',
    mut: [{ find: 'spread_iterable_field(arguments).', replace: '' }],
    expect: (m, b) => {
      assert.deepEqual(lost(m, b, hidden), ['useSpreadArgIter / spread_element -> iterator']);
      assert.deepEqual(lost(m, b, famEdges),
        ['useSpreadArgIter -> bump', 'useSpreadArgIter -> iterator']);
      assert.ok(famEdges(m).includes('useSpreadArgIter -> joins'), 'the ordinary call stays');
    },
  },
  {
    name: 'd8 an array spread does not iterate',
    targets: 'spread_iterable_field(elements)',
    mut: [{ find: 'spread_iterable_field(elements).', replace: '' }],
    expect: (m, b) => {
      assert.deepEqual(lost(m, b, hidden), ['useSpreadIter / spread_element -> iterator']);
      assert.deepEqual(lost(m, b, famEdges), ['useSpreadIter -> bump', 'useSpreadIter -> iterator']);
    },
  },
  {
    name: 'd9 every spread iterates, wherever it sits',
    targets: 'the FIELD key of `spread_iterated` — the widening direction',
    mut: [{ find: 'spread_iterable_field(arguments).',
            replace: 'spread_iterable_field(arguments).\nspread_iterable_field(properties).' }],
    // MEASURED AT RUN TIME: `{ ...counter }` copies the symbol key and calls NO
    // iterator, so this is an edge no execution can produce. It is the whole
    // reason `useObjectSpreadOfIterable` is in the fixture.
    expect: (m, b) => {
      assert.deepEqual(gained(m, b, hidden),
        ['useObjectSpreadOfIterable / spread_element -> iterator']);
      assert.deepEqual(gained(m, b, famEdges),
        ['useObjectSpreadOfIterable -> bump', 'useObjectSpreadOfIterable -> iterator']);
    },
  },
  {
    name: 'd10 an array pattern does not iterate',
    targets: 'the array-pattern arm of `pattern_iterates`',
    mut: [{ find: IP, replace: '' }],
    expect: (m, b) => {
      assert.deepEqual(lost(m, b, hidden), ['useArrayPatternIter / array_pattern -> iterator']);
      assert.deepEqual(lost(m, b, famEdges),
        ['useArrayPatternIter -> bump', 'useArrayPatternIter -> iterator']);
      // ...AND THE CLOSED-VOCABULARY GATE CANNOT SEE IT. `guard_named` for this
      // side is derived from `transfer_mechanism(K, iterator_call)`, which the
      // mutant leaves standing, so the audit that exists to notice a mechanism
      // claimed as modelled by a rule nothing connects to the kind stays green.
      // The same structural hole CLAUDE.md records for `orphan_claim`, named
      // here rather than discovered later.
      assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), []);
    },
  },
  {
    name: 'd11 the iterable side resolves a callee and is not a site',
    targets: 'site[code](N) :- pattern_iterates[code](N, _)',
    mut: [{ find: 'site[code](N)          :- pattern_iterates[code](N, _).', replace: '' }],
    // THE DEFECT THIS MUTANT REPLAYS IS THE ONE THE ORACLE CAUGHT. The relation
    // stands at its full ten rows and the call graph is SILENT, because
    // `nearest_fn` and `top_call` both range over `site[code]`. A model that
    // names a transfer nothing consumes is half a model.
    expect: (m, b) => {
      assert.deepEqual(hidden(m), hidden(b), 'the relation is untouched');
      assert.deepEqual(lost(m, b, famEdges), [
        'useArrayPatternIter -> bump', 'useArrayPatternIter -> iterator',
        'useSpreadArgIter -> bump', 'useSpreadArgIter -> iterator',
        'useSpreadIter -> bump', 'useSpreadIter -> iterator',
      ]);
    },
  },
  {
    name: 'd12 the getter side is not a site either',
    targets: 'site[code](N) :- pattern_accessor[code](N, _)',
    mut: [{ find: 'site[code](N)          :- pattern_accessor[code](N, _).', replace: '' }],
    expect: (m, b) => {
      assert.deepEqual(hidden(m), hidden(b), 'the relation is untouched');
      assert.deepEqual(lost(m, b, famEdges), [
        'top -> spare', 'usePatternGetter -> notch', 'usePatternOtherSource -> reading',
        'usePatternRest -> notch', 'usePatternRest -> spare',
        'useSpreadGetter -> notch', 'useSpreadGetter -> spare',
      ]);
    },
  },
  {
    name: 'd13 a destructuring at module scope has nowhere to attribute its call',
    targets: 'the `top_call` arm of the getter side',
    mut: [{ find: 'calls[code](R, M)      :- pattern_accessor[code](N, M), top_call[code](N, R).',
            replace: '' }],
    // `const { spare: topSpare } = dial` is the site, and `nearest_fn`
    // structurally cannot reach it: nothing encloses a module-scope declarator.
    expect: (m, b) => assert.deepEqual(lost(m, b, famEdges), ['top -> spare']),
  },
  {
    name: 'd14 the iterator is called and its `next` is not',
    targets: 'the second hop of the iterator protocol',
    mut: [{ find: NEXT, replace: '' }],
    expect: (m, b) => {
      assert.deepEqual(lost(m, b, famEdges), [
        'useArrayPatternIter -> bump', 'useSpreadArgIter -> bump', 'useSpreadIter -> bump',
      ]);
      // ...and `for-of`'s own second hop is a DIFFERENT rule and stays.
      assert.ok(famEdges(m).includes('useIterable -> bump'));
    },
  },
  {
    name: 'd15 a pattern reads its own id instead of its init',
    targets: 'pattern_source',
    mut: [{ find: SRC, replace: `pattern_source[code](P, Init) :- ast_node[code](D, variable_declarator, _, _),
                                 ast_child[code](D, init, 0, P),
                                 ast_child[code](D, id, 0, Init).` }],
    // Every arm that goes through `pattern_source` dies and the three that do
    // not — the spread arms and the rest arm, which read the declarator
    // themselves — stand. That split is what says which rule the relation is in.
    expect: (m, b) => {
      assert.deepEqual(lost(m, b, hidden), [
        'top / object_pattern -> spare',
        'useArrayPatternIter / array_pattern -> iterator',
        'usePatternGetter / object_pattern -> notch',
        'usePatternOtherSource / object_pattern -> reading',
        'usePatternRest / object_pattern -> notch',
      ]);
      assert.deepEqual(gained(m, b, hidden), []);
      assert.ok(hidden(m).includes('usePatternRest / rest_element -> spare'), 'the rest arm stands');
    },
  },
  {
    name: 'd16 the mechanism is claimed by nobody',
    targets: 'mechanism_unanswered[audit]',
    mut: [{ find: 'mechanism_modelled(iterator_call).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('mechanism_unanswered[audit](M)').flat(), ['iterator_call']),
  },
  {
    name: 'd17 the mechanism is modelled and no rule reaches its kinds',
    targets: 'guard_unmodelled[audit] on the iterable side',
    mut: [{ find: 'guard_named[code](K)       :- transfer_mechanism(K, iterator_call).', replace: '' }],
    // TWO KINDS ARE NOT IN THE ANSWER AND EACH IS ABSENT FOR ITS OWN REASON,
    // which is what makes this a set rather than a count. `for_of_statement` is
    // `guard_named` through `guard_kind` for its BODY — a different mechanism
    // reaching the same kind — and `spread_element` has a hand-written row
    // because it carries the accessor mechanism too. So exactly one kind is left
    // with a modelled mechanism and no rule.
    expect: (m) => assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat().sort(),
      ['array_pattern']),
  },
  {
    name: 'd18 an object pattern carries a modelled mechanism and no rule',
    targets: 'guard_unmodelled[audit] on the getter side',
    mut: [{ find: 'guard_named[code](object_pattern).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), ['object_pattern']),
  },
  {
    name: 'd19 an object rest carries a modelled mechanism and no rule',
    targets: 'guard_unmodelled[audit] on the getter side',
    mut: [{ find: 'guard_named[code](rest_element).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), ['rest_element']),
  },
];

for (const g of MUT) test(`${g.name} — targets ${g.targets}`, () => g.expect(build(g.mut), base()));

// ---------------------------------------------------------------------------
// THREE MUTANTS ARE NAMED AND NOT RUN, because each is unkillable for a reason
// worth writing down rather than for want of trying. All three were reached by
// asking where the check is structurally UNABLE to look, which is the question
// CLAUDE.md records as the only one whose survivors are real.
//
// (a) `guard_named[code](spread_element).` IS REDUNDANT TODAY, provably.
//     `spread_element` is the one kind in `transfer_mechanism` carrying two
//     mechanisms, and the derived line `guard_named[code](K) :-
//     transfer_mechanism(K, iterator_call)` already names it. Deleting the
//     hand-written row therefore moves nothing. It stays, because the day
//     somebody removes the iterator mechanism from that kind the accessor side
//     would lose its guard silently — the row is insurance against a change,
//     which is exactly the class of line no mutant can defend. Asserted below
//     rather than claimed.
//
// (b) `transfer_mechanism(for_of_statement, iterator_call).` MOVES NOTHING.
//     The loop is already `guard_named` through `guard_kind`, `iterator_call` is
//     already `mechanism_modelled` by two other kinds, and no rule of this layer
//     reads a for-of BY MECHANISM. It is a correction to a table that had been
//     silent about a call `for_of_iterates` has modelled since 2026-09-07, and
//     the table is read by people rather than by rules — which is the honest
//     reason a documentation row cannot be killed.
//
// (c) `fn_node[code](M)` IN `pattern_iterates`. Nothing in this corpus puts a
//     non-function under the key `iterator`, so dropping the check derives the
//     same rows. The site that would kill it is an object with a DATA property
//     called `iterator`, and it is not written for the reason the fixture
//     discipline here gives: a construct nothing else in the item needs is a
//     second construct smuggled into a fixture for one. Named so the next reader
//     does not re-measure it.

test('the three unkillable mutants are unkillable for the reasons given', () => {
  const b = base();
  const redundant: Mut[] = [{ find: 'guard_named[code](spread_element).', replace: '' }];
  const forOfRow: Mut[] = [{ find: 'transfer_mechanism(for_of_statement,           iterator_call).',
                             replace: '' }];
  for (const [why, mut] of [['(a) the redundant guard row', redundant],
                            ['(b) the for-of mechanism row', forOfRow]] as [string, Mut[]][]) {
    const m = build(mut);
    assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), [], why);
    assert.deepEqual(m.q('mechanism_unanswered[audit](M)').flat(), [], why);
    assert.deepEqual(hidden(m), hidden(b), why);
    assert.deepEqual(famEdges(m), famEdges(b), why);
  }
  // ...and the POSITIVE CONTROL that the same instrument does kill a row of the
  // same shape, so "nothing moved" is a fact about these two rows rather than
  // about the way they were removed.
  const control = build([{ find: 'guard_named[code](rest_element).', replace: '' }]);
  assert.deepEqual(control.q('guard_unmodelled[audit](K)').flat(), ['rest_element']);
});
