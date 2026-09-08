// js-class-expression.test.ts — A CLASS THAT IS AN EXPRESSION, and one node
// kind that is two constructs.
//
//   const C = class { m() {} }        ClassExpression   (w_class_expression, 52)
//   new.target / import.meta          MetaProperty      (w_meta_property, 54)
//
// WHY THE TWO ARE IN ONE FILE: neither is a corpus of its own, both arrive with
// the same fixture block at the end of test/fixtures/js-call/shapes.ts.txt, and
// a world costs a fixpoint (see the header of js-corpus-world.ts). The two
// halves share no assertion.
//
// THE MEASUREMENT THIS FILE EXISTS FOR, taken BEFORE any rule was written
// because the item's brief allowed either answer:
//
//     the model ALREADY names `class_expression` in `obj_like[flow]` and in
//     `node_value_kind`. What does that opinion DERIVE?
//
// NOTHING, and the control is what says so. On a probe carrying each form
// beside its control in one file, `new Declared().hold()` resolved and
// `new (class {})().hold()` and `new (class Hoist {})().hold()` both came back
// as unresolved `s_member_on_ident`. `member_value[flow]` named the methods
// correctly the whole time and no receiver could reach them, because
// `class_named[flow]` — the relation every consumer joins on — reads the class's
// `id` CHILD, and a class expression's BINDING is not its `id`: an anonymous one
// has no `id` at all, and `const W = class Hoist {}` binds `W` outside while
// `Hoist` is in scope only inside the class's own body.
//
// So the item's premise held and its remedy was one relation, not a layer.
//
// AND THE SECOND RULE IS ABOUT A NAME. `const G = class { constructor(){} }`
// gave its constructor NO NAME, so `calls_in` — which joins `fn_name` on BOTH
// ends — dropped an edge `resolves` had derived. Measured on this engine rather
// than recalled, because the two forms disagree:
//
//     const A = class { constructor(){} }        A.name "A"      frame `A`
//     const W = class Hoist { constructor(){} }  W.name "Hoist"  frame `Hoist`
//     class D { constructor(){} }                D.name "D"      frame `D`
//
// Every oracle below is a NAMED SET or an identity. Not one is a count of the
// corpus (f_a_pin_that_moves_with_the_corpus_is_measuring_the_corpus).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, base, type Mut, type World } from './js-corpus-world.ts';

const DF = 'rules/js-dataflow.rofl';
const CG = 'rules/js-callgraph.rofl';

/** every `caller -> callee` edge the model derives OUT OF the six functions
 *  this item added to shapes.ts.txt. A named set, so two branches that both
 *  grow it merge as a union. */
const CALLERS = ['onAnonClassExpr', 'onNamedClassExpr', 'onClassExprStatic',
  'onClassExprCtor', 'onExtendsClassExpr'];
const classExprEdges = (w: World): Set<string> =>
  new Set(w.q('calls_in[code](File, A, B)')
    .filter(([, a]) => CALLERS.includes(a))
    .map(([, a, b]) => `${a} -> ${b}`));

/** the class expression nodes, by the name each is bound to */
const classExprNodes = (w: World): string[] =>
  w.q('ast_node[code](N, class_expression, F, L)').map(([n]) => n);

const metaNodes = (w: World): string[] =>
  w.q('ast_node[code](N, meta_property, F, L)').map(([n]) => n);

// ===========================================================================
// 1. WHAT THE MODEL DERIVES NOW — the five sites, by name.

test('a class expression answers a call at every face a class declaration does', () => {
  const w = base();
  assert.deepEqual([...classExprEdges(w)].sort(), [
    // the PROTOTYPE half, through an instance of an anonymous class
    'onAnonClassExpr -> turn',
    // the CONSTRUCTOR edge of a class with no `id`, named after its BINDING
    'onClassExprCtor -> Gantry',
    'onClassExprCtor -> bear',
    // the STATIC half, which is the one that needs `class_receiver` to fire
    'onClassExprStatic -> rated',
    // a class DECLARATION extending a class EXPRESSION, reached through
    // `super_of[flow]` — the same relation, a third consumer
    'onExtendsClassExpr -> twice',
    // and the constructor of a NAMED class expression, which V8 names after
    // the class's own `id` and NOT after the binding
    'onNamedClassExpr -> Hoist',
    'onNamedClassExpr -> lift',
  ], 'every face of a class expression that this corpus spells');
});

test('the static half and the instance half do not answer for each other', () => {
  const w = base();
  const edges = classExprEdges(w);
  // `Gantry.rated(n)` is a STATIC read on the class object and `new Gantry(n)
  // .bear(n)` is an instance read. Before the class-expression arm the receiver
  // `Gantry` was not a `class_receiver[flow]` at all, so the lookup took the
  // PROTOTYPE branch and would have answered a static read with an instance
  // method — a TypeError at run time, and the exact defect that relation exists
  // to stop. The absences are the assertion.
  assert.ok(edges.has('onClassExprStatic -> rated'));
  assert.ok(!edges.has('onClassExprStatic -> bear'), 'a static read must not find an instance method');
  assert.ok(edges.has('onClassExprCtor -> bear'));
  assert.ok(!edges.has('onClassExprCtor -> rated'), 'an instance read must not find a static');
});

test('the two constructor-naming rules disagree at a site, and V8 settles it', () => {
  const w = base();
  const edges = classExprEdges(w);
  // MEASURED ON THIS ENGINE: `const W = class Hoist { constructor(){} }` gives
  // `W.name === "Hoist"` and a `new W()` frame reads `Hoist`, while
  // `const G = class { constructor(){} }` gives `G.name === "G"`.
  assert.ok(edges.has('onNamedClassExpr -> Hoist'), 'a named class expression keeps its own id');
  assert.ok(!edges.has('onNamedClassExpr -> Winch'), 'and does NOT also answer to its binding');
  assert.ok(edges.has('onClassExprCtor -> Gantry'), 'an anonymous one takes the binding');
});

// ===========================================================================
// 2. THE CONTROL-FLOW HALF — the reason this kind is NOT waived the way its
//    declaration twin is.

test('a class expression on the export surface puts its methods on the ENTRY surface', () => {
  const w = base();
  const named = (rel: string) => new Set(w.q(rel)
    .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  const entries = named('entry_point[code](F)');
  // `export const Bracket = class { fasten(n) {...} }` — `exported_fn` walks
  // CONTAINMENT and asks `not in_fn`, and a method of an exported class
  // expression has no enclosing function.
  assert.ok(entries.has('fasten'), 'a method of an EXPORTED class expression is an entry point');
  // ...and the control: a method of a class expression bound to a module-local
  // `const` is NOT, which is what says the first line measures the export and
  // not merely the containment.
  assert.ok(!entries.has('turn'), 'a method of a module-local class expression is not');
  assert.ok(entries.size > 10, `positive control: ${entries.size} entry points in this corpus`);
});

test('a heritage clause RUNS, which is why a_no_control_transfer would be false here', () => {
  const w = base();
  // `export const Bracket = class extends mountOf() {}` calls `mountOf` when the
  // class expression is EVALUATED — at module top level, so the caller is `top`.
  const tops = new Set(w.q('calls_in[code](File, A, B)')
    .filter(([f, a]) => f === 'shapes.ts' && a === 'top').map(([, , b]) => b));
  assert.ok(tops.has('mountOf'), 'the call in the extends clause is attributed');
  // The DECLARATION twin has the identical exposure and still carries
  // `ignored(js, class_declaration, controlflow, a_no_control_transfer)`. That
  // row is not this item's to change and it is recorded as a finding; this
  // assertion is what a future reader will point at.
  assert.deepEqual(w.q('ignored(js, class_expression, controlflow, R)'), [],
    'class_expression is NOT waived at the control-flow layer');
  assert.deepEqual(w.q('handled(js, class_expression, controlflow, R)').flat(),
    ['r_reachability']);
});

// ===========================================================================
// 3. WHERE THIS MODEL CANNOT LOOK — pinned, because a written-down blind spot
//    is a frontier and one that is not is a lie.

test('FRONTIER: a named class expression`s own id leaks out of its body', () => {
  const w = base();
  // `class_named` is consumed through `ident_in[code]`, which is FILE-scoped,
  // while `sees_binder[code]` in the same pack is scoped properly. `Hoist` is in
  // scope only inside its own class body at run time; here it reaches the class
  // from anywhere in shapes.ts. The corpus has no site that USES the leak — this
  // asserts the mechanism that would carry it.
  const hoist = w.q('class_named[flow](CD, N, F)').filter(([, n]) => n === 'Hoist');
  assert.equal(hoist.length, 1, 'the id arm fires for a named class expression');
  const winch = w.q('class_named[flow](CD, N, F)').filter(([, n]) => n === 'Winch');
  assert.equal(winch.length, 1, 'and so does the binding arm, for the same class');
  assert.equal(hoist[0][0], winch[0][0], 'both name the SAME node — two names, one class');
});

test('FRONTIER: only a `const C = class {}` binding is seen', () => {
  const w = base();
  // The arm joins through a `variable_declarator`. A class expression bound by
  // ASSIGNMENT (`ns.C = class {}`), passed as an argument (`f(class {})`) or
  // returned directly (`return class {}`) reaches no name and therefore no
  // receiver. There is no site for any of those in this corpus, so the boundary
  // is asserted at the RULE rather than at an answer: every class expression
  // here is bound by a declarator, and the day one is not, this goes red.
  const nodes = classExprNodes(w);
  assert.ok(nodes.length >= 4, `positive control: ${nodes.length} class expressions`);
  const bound = nodes.filter((n) => w.q(`ast_child[code](D, init, 0, ${n})`).length > 0);
  assert.deepEqual(bound.sort(), nodes.sort(),
    'every class expression in this corpus is a declarator initialiser');
});

// ===========================================================================
// 4. META PROPERTY — one node kind, two constructs, and the scanner tells them
//    apart even though nothing above the scanner did.

test('the scanner distinguishes new.target from import.meta, and by a CHILD', () => {
  const w = base();
  const metas = metaNodes(w);
  assert.ok(metas.length >= 2, `positive control: ${metas.length} meta_property nodes`);
  const spellings = metas.map((n) => {
    const part = (field: string) => w.q(`ast_child[code](${n}, ${field}, 0, C)`)
      .flatMap(([c]) => w.q(`ast_name[code](${c}, X)`).flat())[0];
    return `${part('meta')}.${part('property')}`;
  }).sort();
  assert.deepEqual(spellings, ['import.meta', 'new.target']);
  // AND THERE IS NO ATTRIBUTE, which is what makes the era layer's second gate
  // table structurally unable to split this kind. Measured, not read off a rule.
  const attrs = w.q('ast_attr[code](N, K, V)');
  assert.ok(attrs.length > 100, `positive control: ${attrs.length} attributes in this corpus`);
  assert.deepEqual(attrs.filter(([n]) => metas.includes(n)), []);
});

test('a meta_property transfers no control, and that is measured rather than assumed', () => {
  const w = base();
  const metas = metaNodes(w);
  const sites = new Set(w.q('site[code](X)').map(([x]) => x));
  for (const mp of metas) {
    const inside = w.q(`ast_within[code](${mp}, X)`).map(([x]) => x);
    // two identifier children and nothing else
    assert.equal(inside.length, 2, `${mp} contains exactly its two identifiers`);
    assert.deepEqual(inside.filter((x) => sites.has(x)), [], 'and neither is a site');
  }
  // POSITIVE CONTROL on the instrument: `ast_within` DOES return sites for a
  // node that has one, so the empty set above is a fact about meta_property.
  const [aCall] = [...sites];
  const holders = w.q('ast_node[code](N, K, F, L)')
    .filter(([n]) => w.q(`ast_within[code](${n}, ${aCall})`).length > 0);
  assert.ok(holders.length > 0, 'the containment query can return something');
  assert.deepEqual(w.q('ignored(js, meta_property, controlflow, R)').flat(),
    ['a_no_control_transfer']);
});

test('FRONTIER: neither form of a meta_property has a VALUE here', () => {
  const w = base();
  const metas = metaNodes(w);
  const vals = w.q('may_be_node[flow](E, N)');
  assert.ok(vals.length > 100, `positive control: ${vals.length} valued expressions`);
  assert.deepEqual(vals.filter((r) => r.some((c) => metas.includes(c))), [],
    'import.meta is a HOST object with no node in any program, and new.target is '
    + 'the CONSTRUCTION MODE, which this model has no relation for at all');
  // ...and the cell says so rather than being waived: no verdict, an owner.
  assert.deepEqual(w.q('handled(js, meta_property, dataflow, R)'), []);
  assert.deepEqual(w.q('ignored(js, meta_property, dataflow, R)'), []);
});

// ===========================================================================
// 5. THE MUTANT SET. Each names the constraint it targets. Two of the six are
//    aimed at rules that EXISTED BEFORE this item, because the item's whole
//    content is that the model had an opinion nothing could use — so whether
//    that opinion is load-bearing is the first thing to measure.

const MUTANTS: { name: string; targets: string; mut: Mut[]; expect: (m: World) => void }[] = [
  {
    name: 'm1 the class-expression arm of class_named is deleted',
    targets: 'the arm is the whole fix: without it every face of the kind goes silent',
    mut: [{ file: DF, find: 'class_named[flow](CD, Name, File) :- ast_node[code](CD, class_expression, File, _),',
            replace: 'class_named[flow](CD, Name, File) :- ast_node[code](CD, no_such_kind, File, _),' }],
    expect: (m) => {
      // STRONGER THAN PREDICTED, and the prediction is left here because the
      // correction is the content. I expected the NAMED class expression to
      // survive on its `id` arm; it does not. `class_named` gives that class the
      // name `Hoist`, and the `new` rule joins on the CALLEE'S SPELLING, which
      // is `Winch` — so the name the id arm supplies is a name nothing in the
      // program calls. The `id` arm alone reaches a class expression only from
      // INSIDE its own body, which is the one place a class-expression call
      // site never is.
      assert.deepEqual([...classExprEdges(m)].sort(), ['onExtendsClassExpr -> twice'],
        'the only survivor is a call on a class DECLARATION`s own method');
    },
  },
  {
    name: 'm2 the arm reads the declarator`s id instead of its init',
    targets: 'the join is on the INITIALISER; reading the id binds a name to itself',
    mut: [{ file: DF, find: `ast_child[code](D, init, 0, CD),
                                     ast_child[code](D, id, 0, I), ast_name[code](I, Name).`,
            replace: `ast_child[code](D, id, 0, CD),
                                     ast_child[code](D, id, 0, I), ast_name[code](I, Name).` }],
    expect: (m) => {
      assert.deepEqual([...classExprEdges(m)].sort(), ['onExtendsClassExpr -> twice'],
        'a declarator whose id IS a class expression does not exist, so the arm is dead');
    },
  },
  {
    name: 'm3 the anonymous constructor loses its name',
    targets: 'THE EDGE IS DERIVED AND THEN DROPPED — resolves keeps it, calls_in does not',
    // an unsatisfiable conjunction built out of the file's OWN relations: a
    // class expression cannot both be anonymous and have an `id`.
    mut: [{ file: CG, find: `                       anon_class[code](CD),
                       ast_node[code](D, variable_declarator, _, _),`,
            replace: `                       anon_class[code](CD), class_has_id[code](CD),
                       ast_node[code](D, variable_declarator, _, _),` }],
    expect: (m) => {
      const edges = classExprEdges(m);
      assert.ok(!edges.has('onClassExprCtor -> Gantry'),
        'the constructor edge is gone from the graph');
      assert.ok(edges.has('onClassExprCtor -> bear'),
        '...while the instance method beside it is untouched');
      // and this is the whole point: `resolves` still HAS it. An edge present in
      // one relation and absent from the one an oracle is compared against is the
      // worse of the two failures, and the only thing that tells them apart is a
      // query at each level.
      const ctor = m.q('ast_node[code](F, class_method, "shapes.ts", L)')
        .filter(([f]) => m.q(`ast_attr[code](${f}, kind, "constructor")`).length > 0);
      const resolved = new Set(m.q('resolves[code](C, F)').map(([, f]) => f));
      assert.ok(ctor.some(([f]) => resolved.has(f)),
        'a constructor of a class expression is still RESOLVED to');
    },
  },
  {
    name: 'm4 the name inference forgets that a named class already has one',
    targets: 'the negation in anon_class: without it a class answers to two names',
    mut: [{ file: CG, find: `anon_class[code](CD)   :- ast_node[code](CD, class_expression, _, _),
                          not class_has_id[code](CD).`,
            replace: `anon_class[code](CD)   :- ast_node[code](CD, class_expression, _, _).` }],
    expect: (m) => {
      assert.ok(classExprEdges(m).has('onNamedClassExpr -> Winch'),
        'an edge to a frame name no execution produces: V8 says `Hoist`');
      assert.ok(classExprEdges(m).has('onNamedClassExpr -> Hoist'),
        '...beside the right one, which is what makes it an over-approximation');
    },
  },
  {
    name: 'm5 obj_like stops naming class_expression — the OPINION the item is named for',
    targets: 'the pre-existing arm is load-bearing: it is what makes the methods findable',
    mut: [{ file: DF, find: 'obj_like[flow](O) :- ast_node[code](O, class_expression, _, _).',
            replace: '' }],
    expect: (m) => {
      assert.deepEqual([...classExprEdges(m)].sort(), ['onExtendsClassExpr -> twice'],
        'every edge that touches a class expression goes, including the constructor '
        + 'ones; `twice` is Davit`s own method and Davit is a DECLARATION');
      // ...and the CONTROL: class declarations keep theirs, so this measures the
      // arm rather than the world.
      const edges = new Set(m.q('calls_in[code](File, A, B)').map(([, a, b]) => `${a} -> ${b}`));
      assert.ok(edges.has('onNew -> m'), 'a class DECLARATION still answers `new Base().m()`');
    },
  },
  {
    name: 'm6 node_value_kind stops naming class_expression — the SECOND pre-existing opinion',
    targets: 'is the value-kind row still load-bearing once class_named covers the kind?',
    mut: [{ file: DF, find: 'node_value_kind(class_expression).', replace: '' }],
    expect: (m) => {
      // MEASURED, and the answer is the interesting half of this item: the two
      // rows are not equivalent. Whatever survives here is what `class_named`
      // now carries on its own, and whatever dies is what only the value-kind
      // row could say. The set is written out so a future change to either row
      // has to say which it moved.
      assert.deepEqual([...classExprEdges(m)].sort(), [
        'onAnonClassExpr -> turn',
        'onClassExprCtor -> Gantry',
        'onClassExprCtor -> bear',
        'onClassExprStatic -> rated',
        'onExtendsClassExpr -> twice',
        'onNamedClassExpr -> Hoist',
        'onNamedClassExpr -> lift',
      ], 'SURVIVOR: class_named reaches every one of these without the value-kind row');
      // SO THIS MUTANT SURVIVES, and the category is `no site in this corpus`
      // rather than `unkillable`. `node_value_kind(class_expression)` earns its
      // keep exactly where `class_named` cannot reach — a class expression that
      // is not a declarator initialiser, `f(class {})` or `return class {}` —
      // which is the same boundary the FRONTIER test above pins from the other
      // side. Giving it a site needs a rule for that binding form and is filed
      // as residue on w_class_expression rather than done here.
    },
  },
];

for (const c of MUTANTS) {
  test(`${c.name} — ${c.targets}`, () => c.expect(build(c.mut)));
}
