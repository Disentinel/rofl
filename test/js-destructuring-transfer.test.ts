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
// RE-AIMED 2026-09-09 AND NOT DELETED. The four-premise join this used to
// anchor on was LIFTED into `pattern_next[code]` so section 5d of
// rules/js-effects.rofl could name the callee without copying it — a reorder
// that changed no answer and expired a mutant, which is the failure mode
// HANDOFF.md names in its own words ("if you reorder a body, grep the test
// suite for its text"). Two mutants stand where one did: the EDGE arm and the
// RELATION, and they report different losses.
const NEXT = 'calls[code](Caller, Next) :- pattern_next[code](X, Next), nearest_fn[code](Caller, X).';
const PNEXT = `pattern_next[code](X, Next) :- pattern_iterates[code](X, M),
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
    targets: 'the EDGE arm of the second hop of the iterator protocol',
    mut: [{ find: NEXT, replace: '' }],
    expect: (m, b) => {
      assert.deepEqual(lost(m, b, famEdges), [
        'useArrayPatternIter -> bump', 'useSpreadArgIter -> bump', 'useSpreadIter -> bump',
      ]);
      // ...and `for-of`'s own second hop is a DIFFERENT rule and stays.
      assert.ok(famEdges(m).includes('useIterable -> bump'));
      // THE RELATION SURVIVES THE EDGE, which is what the lift bought and what
      // tells this mutant apart from the one below it: the model still NAMES
      // the callee, it has simply stopped drawing the edge to it.
      assert.deepEqual(m.q('pattern_next[code](X, N)').length, b.q('pattern_next[code](X, N)').length);
    },
  },
  {
    name: 'd14b the second hop has no callee at all',
    targets: '`pattern_next[code]`, the relation the effect layer reads',
    mut: [{ find: PNEXT, replace: '' }],
    expect: (m, b) => {
      assert.deepEqual(m.q('pattern_next[code](X, N)'), [], 'the callee is unnamed');
      // ...and the SAME three edges go, which is why the pair is two mutants and
      // not one run twice: d14 loses the edge and keeps the name, this loses
      // both, and the second is what section 5d of rules/js-effects.rofl reads.
      assert.deepEqual(lost(m, b, famEdges), [
        'useArrayPatternIter -> bump', 'useSpreadArgIter -> bump', 'useSpreadIter -> bump',
      ]);
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

// ===========================================================================
// 4. THE DENOMINATOR — w_destructuring_hides_a_call, second pass 2026-09-09.
//
// WHAT SECTION 1 CANNOT SAY. `hidden` and `famEdges` are the edges the model
// DRAWS, and the oracle above reports `missed` empty — so both instruments look
// at the positions where something was derived, and neither can see a position
// where nothing was. There are more of the second kind: the rule fires at NINE
// of the corpus's twenty-four destructuring positions, and until `hidden_call_*`
// existed the other fifteen and a source the value layer never traced were the
// same silence.
//
// EVERY ASSERTION HERE IS AN IDENTITY OR A NAMED SET, and the reason is the
// merge rather than taste: 24, 9 and 15 are numbers that move the moment
// anybody adds a fixture with a pattern in it, and two branches moving one of
// them is right on each branch and wrong in the merge. So the denominator is
// re-derived HERE from `ast_node`/`ast_child` — a second instrument that reads
// no rule of the section it measures — and the classes are asserted to
// PARTITION it.

/** the positions, re-derived from the grammar rather than read off the rule */
const positions = (w: World): string[] => {
  const spreadField = (n: string) => w.q(`ast_child[code](P, F, I, ${n})`).map((r) => r[1]);
  const out: string[] = [];
  for (const [n] of w.q('ast_node[code](N, object_pattern, F, L)')) out.push(n);
  for (const [n] of w.q('ast_node[code](N, array_pattern, F, L)')) out.push(n);
  for (const [n] of w.q('ast_node[code](N, for_of_statement, F, L)')) out.push(n);
  for (const [n] of w.q('ast_node[code](N, rest_element, F, L)'))
    if (spreadField(n).includes('properties')) out.push(n);
  for (const [n] of w.q('ast_node[code](N, spread_element, F, L)')) {
    const f = spreadField(n);
    if (f.includes('properties') || f.includes('elements') || f.includes('arguments')) out.push(n);
  }
  return out.sort();
};
const cls = (w: World, rel: string) => [...new Set(w.q(rel).map((r) => r[0]))].sort();
/** a position by CALLER and KIND — no file, no line, no index */
const say = (w: World, n: string) => `${where(w, n)} / ${kindOf(w, n)}`;

test('every position a destructuring form runs a protocol at is answered one of five ways', () => {
  const m = base();

  // (a) THE DENOMINATOR IS THE GRAMMAR'S, not the rule's.
  assert.deepEqual(cls(m, 'hidden_call_pos[code](N, M)'), positions(m),
    '`hidden_call_pos` is exactly the positions the grammar puts a protocol at');

  // (b) THE FIVE CLASSES PARTITION IT. Totality is the rule's own audit; what
  // this adds is DISJOINTNESS, which no audit in the pack asserts.
  assert.deepEqual(m.q('hidden_call_unaccounted[audit](N)'), [], 'every position is answered');
  assert.deepEqual(m.q('hidden_call_off_table[audit](K, M)'), [],
    'and no arm files a kind under a mechanism `transfer_mechanism` does not give it');
  const CLASSES = ['hidden_call_fires[code](N)', 'hidden_call_builtin[flow](N, O)',
    'hidden_call_primitive[flow](N, V)', 'hidden_call_untraced[flow](N, S)',
    'hidden_call_unsourced[flow](N, K)'].map((r) => cls(m, r));
  for (const c of CLASSES) for (const other of CLASSES) if (c !== other)
    assert.deepEqual(c.filter((x) => other.includes(x)), [], 'the classes are disjoint');
  assert.deepEqual([...new Set(CLASSES.flat())].sort(), positions(m), 'and they cover it');

  // (c) THE FIRING CLASS IS THE RULE'S OWN OUTPUT, stated as an identity so the
  // census cannot drift from the thing it is a census of.
  assert.deepEqual(cls(m, 'hidden_call_fires[code](N)'), [...new Set([
    ...m.q('pattern_accessor[code](N, M)').map((r) => r[0]),
    ...m.q('pattern_iterates[code](N, M)').map((r) => r[0]),
    ...m.q('for_of_iterates[code](N, M)').map((r) => r[0]),
  ])].sort());

  // (d) THE RESIDUE, AS A NAMED SET, and it is the whole reason the four cells
  // may stay closed. NOTHING in the destructuring family is untraced; the ONE
  // untraced position in the census belongs to the fifth door, `for-of`, and it
  // is a GENERATOR object — whose `next` runs the generator body, which IS a
  // node in this program. Its neighbour `for (const chosen of [alef, bet])` is
  // `builtin` in the same run, and facts/js-callgraph.rofl used to call both of
  // them the same thing.
  assert.deepEqual(m.q('hidden_call_untraced[flow](N, S)').map(([n]) => say(m, n)).sort(),
    ['useForOfGen / for_of_statement']);
  assert.deepEqual(m.q('hidden_call_primitive[flow](N, V)'), [], 'no primitive source in the corpus');
  assert.deepEqual(m.q('hidden_call_unsourced[flow](N, K)'), [],
    'and no pattern in a parameter position, which is the form `pattern_source` does not cover');
  // ...so, restricted to the four kinds this item owns, the residue is EMPTY —
  // which is the sentence the cell rests on, written as a query.
  assert.deepEqual(m.q('hidden_call_untraced[flow](N, S)')
    .filter(([n]) => kindOf(m, n) !== 'for_of_statement'), []);
});

const CENSUS: { name: string; targets: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'c1 a position can be user code and builtin at once',
    targets: 'the `not hidden_call_fires` guard — the whole content of the builtin class',
    mut: [{ find: `hidden_call_builtin[flow](N, O) :- hidden_call_src[code](N, Src),
                                   may_be_node[flow](Src, O),
                                   not hidden_call_fires[code](N).`,
            replace: `hidden_call_builtin[flow](N, O) :- hidden_call_src[code](N, Src),
                                   may_be_node[flow](Src, O).` }],
    // the classes stop partitioning and the TOTALITY AUDIT STAYS GREEN, which
    // is why disjointness is asserted in the test and not left to the pack.
    //
    // THE ORACLE IS AN IDENTITY AND NOT A LIST OF NAMES: every firing position
    // has a traced source BY CONSTRUCTION — it fires because the value layer
    // reached an owner — so without the guard the overlap is the WHOLE firing
    // set, and that is a sentence about the rule rather than about this corpus.
    expect: (m, b) => {
      assert.deepEqual(m.q('hidden_call_unaccounted[audit](N)'), [], 'the audit cannot see this');
      const overlap = (w: World) => cls(w, 'hidden_call_fires[code](N)')
        .filter((x) => cls(w, 'hidden_call_builtin[flow](N, O)').includes(x));
      assert.deepEqual(overlap(b), [], 'the classes are disjoint on the honest tree');
      assert.deepEqual(overlap(m), cls(m, 'hidden_call_fires[code](N)'),
        'and with the guard gone every firing position is builtin as well');
      assert.ok(overlap(m).length > 0, 'positive control: there is something to overlap');
    },
  },
  {
    name: 'c2 a source that is merely untraced is reported as running no user code',
    targets: 'the `not may_be_node` premise of the untraced class',
    mut: [{ find: `hidden_call_untraced[flow](N, Src) :- hidden_call_src[code](N, Src),
                                      not may_be_lit[flow](Src, _),
                                      not may_be_node[flow](Src, _).`,
            replace: '' }],
    // the generator site falls off the residue and into NOTHING — and again the
    // totality audit goes red, which is the arm of the pack that catches it.
    // THE MUTANT WORLD IS NEVER ASKED FOR THE DELETED RELATION, and that is a
    // constraint of the instrument rather than a style: with its only rule gone
    // `hidden_call_untraced` is `unpopulatable`, and `q` refuses an empty answer
    // to a question the world cannot answer — correctly, since an empty result
    // and an unanswerable one are the confusion this whole section is about.
    expect: (m, b) => {
      assert.deepEqual(b.q('hidden_call_unaccounted[audit](N)'), []);
      // AS AN IDENTITY: exactly what was frontier becomes unanswered, which is
      // a sentence about the arm and not about which site the corpus happens to
      // have. The audit is what notices — nothing else in the pack would.
      assert.deepEqual(cls(m, 'hidden_call_unaccounted[audit](N)'),
        cls(b, 'hidden_call_untraced[flow](N, S)'), 'the identity is what notices');
      assert.ok(cls(b, 'hidden_call_untraced[flow](N, S)').length > 0, 'positive control');
    },
  },
  {
    name: 'c3 a rest reads its own pattern instead of the declarator it sits in',
    targets: 'the rest arm of `hidden_call_src`',
    mut: [{ find: `hidden_call_src[code](R, Init) :- rest_in_pattern[code](D, R, _),
                                  ast_child[code](D, init, 0, Init).`,
            replace: `hidden_call_src[code](R, Init) :- rest_in_pattern[code](D, R, _),
                                  ast_child[code](D, id, 0, Init).` }],
    // WHERE THE REST POSITIONS LAND IS THE INTERESTING HALF, and it is UNTRACED
    // rather than unsourced: the mutant still gives each rest a source, and the
    // source it gives is the PATTERN NODE, which is not a `node_value_kind` —
    // so the value layer has nothing to say about it and the position becomes
    // frontier. A source pointed at the wrong node does not look like a missing
    // source; it looks like a source nobody can trace, which is exactly the
    // confusion this whole section exists to make visible.
    expect: (m, b) => {
      const rests = (w: World) => positions(w).filter((n) => kindOf(w, n) === 'rest_element');
      const frontier = (w: World) => cls(w, 'hidden_call_untraced[flow](N, S)')
        .filter((n) => rests(w).includes(n));
      assert.ok(rests(b).length > 0, 'positive control: the corpus has object rests');
      assert.deepEqual(frontier(b), [], 'none of them is frontier on the honest tree');
      assert.deepEqual(frontier(m), rests(m), 'and every one of them is under the mutant');
    },
  },
  {
    name: 'c4 an object pattern is filed under the iterator mechanism',
    targets: 'hidden_call_off_table[audit] — the mechanism column against its own table',
    mut: [{ find: 'hidden_call_pos[code](N, accessor_call) :- ast_node[code](N, object_pattern, _, _).',
            replace: 'hidden_call_pos[code](N, iterator_call) :- ast_node[code](N, object_pattern, _, _).' }],
    expect: (m) => assert.deepEqual(m.q('hidden_call_off_table[audit](K, M)'),
      [['object_pattern', 'iterator_call']]),
  },
  {
    name: 'c5 the fifth door is not in the census',
    targets: 'the for-of arm of `hidden_call_pos` — the residue is entirely its',
    mut: [{ find: 'hidden_call_pos[code](X, iterator_call) :- ast_node[code](X, for_of_statement, _, _).',
            replace: '' }],
    // WHAT THIS MUTANT SAYS is the shape of the whole section, and it took two
    // attempts to state: with the loop out of the DENOMINATOR every audit in the
    // pack is still green — `hidden_call_unaccounted` quantifies over
    // `hidden_call_pos`, so a position it no longer asks about cannot be
    // unaccounted — and the model has simply stopped asking about a door it
    // answers wrongly. The identity in the test above is the only thing that
    // notices, which is why the denominator is re-derived from the grammar.
    //
    // AND THE FRONTIER ROW SURVIVES, which was a surprise worth keeping:
    // `hidden_call_untraced` reads `hidden_call_src`, a SEPARATE arm, so the
    // generator's loop is still named as residue while no longer being counted.
    // Naming and accounting are two jobs and this mutant separates them.
    expect: (m, b) => {
      assert.deepEqual(m.q('hidden_call_unaccounted[audit](N)'), [],
        'the totality audit cannot see this');
      assert.deepEqual(cls(m, 'hidden_call_untraced[flow](N, S)'),
        cls(b, 'hidden_call_untraced[flow](N, S)'), 'nor can the residue');
      // AS AN IDENTITY: what the denominator loses is exactly the loops, which
      // is a sentence about the arm rather than a list of the corpus's function
      // names — the same reason `positions` is re-derived from the grammar.
      const loops = (w: World) => positions(w).filter((n) => kindOf(w, n) === 'for_of_statement');
      assert.ok(loops(b).length > 0, 'positive control: the corpus has for-of loops');
      // ...and the DENOMINATOR is what shrinks, not the grammar: `positions` is
      // re-derived from `ast_node` and is identical in both worlds, so the only
      // thing that moved is what the census agrees to ask about.
      assert.deepEqual(positions(m), positions(b), 'the grammar is untouched');
      assert.notDeepEqual(cls(m, 'hidden_call_pos[code](N, M)'), positions(m),
        'KILLED by the denominator identity, and by nothing else in the pack');
      assert.deepEqual(lost(m, b, (w) => cls(w, 'hidden_call_pos[code](N, M)')).sort(),
        loops(b).sort(), 'exactly the loops leave the denominator');
    },
  },
];

for (const g of CENSUS)
  test(`${g.name} — targets ${g.targets}`, () => g.expect(build(g.mut), base()));

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
