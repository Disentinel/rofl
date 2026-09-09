// js-computed-key-names.test.ts — A COMPUTED KEY THAT IS A BARE IDENTIFIER IS
// NOT NAMED BY THE VARIABLE'S SPELLING (w_computed_key_names, 40).
//
// THE DEFECT AND WHY IT NEEDED A SITE FIRST. `key_name` in rules/js-structure.rofl
// carried a comment saying `obj[someVar]` has no static name and this must not
// invent one — and the guard implementing that sentence sat on the SECOND arm,
// the one that reads a computed key written as a MEMBER expression. The FIRST
// arm was `key_name(K, N) :- ast_name(K, N)`, unguarded and over K in ANY
// position, so for `{ [haspSpelling]() {} }` — where the key node IS the
// identifier — the model named the property after the VARIABLE. The guard was
// structurally unable to look at the case its own justification names.
// (f_the_guard_in_the_comment_is_not_the_guard_in_the_rule.)
//
// THE SITE IS SCANNED AND NEVER RUN, at the end of test/fixtures/js-call/
// shapes.ts.txt, and that is the item's own reason rather than convenience: a
// method the model must NOT name is a method the execution oracle would see run
// under a name nobody derived. `jamb.latch(1)` runs and `jamb.haspSpelling` is
// `undefined`, so the shape belongs where the CLASSIFIER is measured against the
// grammar and the oracle is not consulted.
//
// WHERE THE FIX COULD NOT LOOK, WHICH IS THE HALF THAT PAID. Narrowing
// `key_name` fixes `key_name`, and FOUR readers never called it: they read
// `ast_name` on the key directly and were untouched by any guard written there.
// Measured on the site before they were converted — the model still said
// `haspSpelling` in `obj_member_fn` (twice), `own_key` (once) and `fn_name`
// (once). The RESOLUTION half is the worse of the two: a naming rule that
// over-approximates gives a wrong label, a resolution that over-approximates
// gives a call edge no execution produces.
//
// THE ORACLE IS A SWEEP OVER THE WHOLE STORE, not a list of relations somebody
// remembered to check. `derived_by` reflects every derived fact, so the claim is
// stated once over all 152 000 of them, and the answer is a NAMED SET of
// relation names rather than a count.
//
// COST, measured 2026-09-09 in the world test/js-fixpoint-cost.test.ts builds,
// and reported here rather than pinned there (that file is the integrator's):
//
//                       rows handed out   firings   facts
//     HEAD                    2 107 604   140 644   348 819
//     key_name narrowed       2 116 888   138 600   344 739   (+9 284 rows!)
//     + the four readers      2 094 572   138 604   344 747   (-13 032 net)
//
// The middle row is the surprise and it is why the third exists: narrowing a
// relation by 95 per cent made the fixpoint hand out MORE rows, because
// `key_name` stopped being an EDB copy and its readers re-ran their leading
// kind scans in every round it grew. Leading those bodies with `key_name`
// instead — the repository's own rule, the engine has no join planner — is what
// turns the item's cost claim from an argument into a measurement.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, base, type Mut, type World } from './js-corpus-world.ts';

const ST = 'rules/js-structure.rofl';
const CG = 'rules/js-callgraph.rofl';
const DF = 'rules/js-dataflow.rofl';

/** THE HANDLE. `haspSpelling` is the variable a computed key in shapes.ts.txt is
 *  spelt with, and it occurs nowhere else in the corpus — so every claim below
 *  is about this item's own site and no other branch's fixture can move it. */
const HANDLE = 'haspSpelling';

/** every DERIVED relation in which the handle appears, by name.
 *
 *  COMMENT NODES ARE DROPPED, and that is not a convenience: babel hands the
 *  scanner `leadingComments` as nodes with a scalar `value`, so the prose of the
 *  fixture block that explains this item is itself in the store as `ast_value`.
 *  A sweep that kept it would be asserting the wording of a comment. */
const namesTheHandle = (w: World): string[] => {
  const comments = w.q('ast_node[code](N, comment_line, F, L)').map(([n]) => n);
  const rel = (f: string) => f.slice('$fact('.length, f.indexOf(','));
  const hits = w.q('derived_by[$kernel](F, R, T)').filter(([f]) => f.includes(HANDLE));
  const kept = hits.filter(([f]) => !comments.some((c) => f.includes(c)));
  return [...new Set(kept.map(([f]) => rel(f)))].sort();
};

/** the key nodes of the corpus — one premise, and the one `key_name`'s first arm
 *  was missing */
const keyNodes = (w: World): Set<string> =>
  new Set(w.q('ast_child[code](P, key, 0, K)').map(([, k]) => k));

/** the names a relation gives the members of the object bound to `name` */
const membersOf = (w: World, name: string, rel: string): string[] => {
  const ids = w.q(`ast_name[code](I, "${name}")`).map(([i]) => i);
  const targets: string[] = [];
  for (const i of ids) {
    for (const [d] of w.q(`ast_child[code](D, id, 0, ${i})`)) {
      const kind = w.q(`ast_node[code](${d}, Kind, F, L)`)[0]?.[0];
      if (kind === 'class_declaration') targets.push(d);
      else if (kind === 'variable_declarator') {
        const init = w.q(`ast_child[code](${d}, init, 0, O)`)[0];
        if (init) targets.push(init[0]);
      }
    }
  }
  assert.equal(targets.length, 1, `${name} names exactly one object in this corpus`);
  return [...new Set(w.q(rel.replace('#', targets[0])).map(([k]) => k))].sort();
};

// ===========================================================================
// 1. WHAT THE MODEL SAYS NOW.

test('no relation above the scanner names anything after the variable a key is spelt with', () => {
  const w = base();
  // THE FIVE THAT REMAIN ARE ALL ABOUT THE IDENTIFIER ITSELF, which is correct:
  // `haspSpelling` really is an identifier, really is a `const` binding, and
  // really occurs in this file. What none of them is, is a KEY, a MEMBER or a
  // FUNCTION NAME. Before this item the same sweep also returned `key_name`,
  // `fn_name`, `member_value`, `member_plain`, `class_member_proto`, `own_key`
  // and `obj_member_fn` — seven relations naming a property after a variable.
  assert.deepEqual(namesTheHandle(w), [
    'ast_name',    // the identifier's own spelling, from the scanner
    'binder',      // ...and the `const` that binds it
    'decl_binds',
    'ident',       // the identifier nodes, as identifiers
    'ident_in',
  ]);
});

test('key_name ranges over keys, and over nothing else', () => {
  const w = base();
  const keys = keyNodes(w);
  const rows = w.q('key_name[code](K, N)');
  assert.ok(keys.size > 100, `positive control: ${keys.size} key positions in this corpus`);
  assert.ok(rows.length > 50, `positive control: ${rows.length} key names`);
  // THE IDENTITY, not the count: every row of a relation called `key_name` is
  // about a node in key position. It used to derive one row per NAMED NODE —
  // about twenty times as many, and the cost half of this item.
  assert.deepEqual(rows.filter(([k]) => !keys.has(k)), [],
    'a relation called key_name holds nothing that is not a key');
});

test('the site`s members are named by the property and not by the variable', () => {
  const w = base();
  // `jamb` and `sill` are object literals and `Clasp` is a class; between them
  // they reach all six arms that name a key — object method, object property
  // holding a function, and class method — through four different relations.
  assert.deepEqual(membersOf(w, 'jamb', 'member_value[flow](#, K, V)'), ['staple']);
  assert.deepEqual(membersOf(w, 'sill', 'member_value[flow](#, K, V)'), ['bolt']);
  assert.deepEqual(membersOf(w, 'Clasp', 'member_value[flow](#, K, V)'), ['hinge']);
  // ...and the RESOLUTION relation agrees with the value relation, which is the
  // half four readers were getting wrong on their own.
  assert.deepEqual(membersOf(w, 'jamb', 'obj_member_fn[code](#, K, M)'), ['staple']);
  assert.deepEqual(membersOf(w, 'sill', 'obj_member_fn[code](#, K, M)'), ['bolt']);
  assert.deepEqual(membersOf(w, 'Clasp', 'own_key[flow](#, K)'), ['hinge']);
});

test('a computed WELL-KNOWN SYMBOL is still a name, and now resolution agrees', () => {
  const w = base();
  // The second arm is why `key_name` exists at all: `{ [Symbol.iterator]() {} }`
  // is the one computed key whose text the LANGUAGE fixes rather than a value.
  const iter = w.q('key_name[code](K, N)').filter(([, n]) => n === 'iterator');
  assert.equal(iter.length, 2, 'both iterator protocols in this corpus are named');
  // AND THE GAIN THIS ITEM DID NOT SET OUT TO MAKE. `obj_member_fn` read
  // `ast_name` on the key, so it could not see the Symbol arm either: the model
  // said the member EXISTED (`member_value`) and could not RESOLVE it. Two rows
  // where there were none, and they are the same two objects.
  const res = w.q('obj_member_fn[code](O, K, M)').filter(([, k]) => k === 'iterator');
  assert.equal(res.length, 2, 'a well-known symbol method is resolvable by the name the model gives it');
  assert.deepEqual(res.map(([, , m]) => m).sort(),
    iter.map(([k]) => w.q(`ast_child[code](P, key, 0, ${k})`)[0][0]).sort(),
    'and they are the very methods key_name named');
});

// ===========================================================================
// 2. WHERE THIS GUARD CANNOT LOOK — written down, because a frontier that is
//    not written down is a lie.

test('FRONTIER: seven key positions have no `computed` attribute at all', () => {
  const w = base();
  // MEASURED, and it is why the guard is `not ast_attr(P, computed, true)` and
  // not `ast_attr(P, computed, false)`. babel gives a private name no `computed`
  // field, so a positive test would have nothing to match on these and would
  // drop them the day `key_name` learns a private key — which the note beside
  // `private_key[code]` in rules/js-dataflow.rofl says is a thing it may.
  const noComputed = [...w.q('ast_child[code](P, key, 0, K)')]
    .filter(([p]) => w.q(`ast_attr[code](${p}, computed, C)`).length === 0)
    .map(([p]) => w.q(`ast_node[code](${p}, Kind, F, L)`)[0][0]);
  assert.deepEqual([...new Set(noComputed)].sort(),
    ['class_private_method', 'class_private_property'],
    'the kinds a positive `computed, false` test would be blind to');
  assert.ok(noComputed.length > 0, `positive control: ${noComputed.length} such key positions`);
});

test('FRONTIER: a key whose name the language DOES fix is still refused', () => {
  const w = base();
  // `{ "#edge": ... }` in shapes.ts.txt is a `string_literal` key: not computed,
  // and its name is fixed at parse time. `key_name` gives it nothing, because
  // `ast_name` has nothing on a string literal — a `value` is not a `name`. This
  // is an UNDER-approximation that predates this item and that this item does
  // not change; it is asserted so the next reader argues with a row.
  const strKeys = w.q('ast_child[code](P, key, 0, K)')
    .filter(([, k]) => w.q(`ast_node[code](${k}, string_literal, F, L)`).length > 0);
  assert.ok(strKeys.length > 0, `positive control: ${strKeys.length} string-literal keys`);
  for (const [, k] of strKeys) {
    assert.ok(w.q(`ast_value[code](${k}, V)`).length > 0, 'the scanner carries its text');
    assert.deepEqual(w.q(`key_name[code](${k}, N)`), [], 'and the model refuses to use it');
  }
});

test('FRONTIER: the model will resolve `o.iterator()` on a Symbol-keyed method', () => {
  const w = base();
  // The residue of the consistency gain above, named rather than left implicit.
  // `oneShot[Symbol.iterator]` is a SYMBOL-keyed property; `oneShot.iterator` is
  // `undefined` at run time. This model has decided — in rules/js-structure.rofl,
  // before this item — that a well-known symbol key is named by its property,
  // and `obj_member_fn` now inherits that decision, so a call spelt
  // `o.iterator()` would resolve to a method no execution reaches that way.
  // NO SITE IN THIS CORPUS, and one cannot be written honestly: the site would
  // have to be a call the runnable oracle sees fail.
  //
  // THE CLAIM IS ABOUT THE SOURCE AND NOT ABOUT `calls_named`, which was the
  // first spelling and was wrong: the for-of rule synthesises a `-> iterator`
  // edge for every iteration in the corpus (f_one_node_two_calls_is_not_an_
  // ambiguous_site), so that relation is full of the name for a reason that has
  // nothing to do with this. What must be absent is a STATIC member spelt
  // `.iterator`, which is the only spelling the over-approximation answers.
  // ...and the key positions come OUT of it, which took a second run to see:
  // `Symbol.iterator` is itself a member expression with a static property
  // named `iterator`, so the two key nodes the whole item is about answered
  // the first version of this query. What is being asked is whether anything
  // READS `.iterator` off a value.
  const keys = keyNodes(w);
  const staticMembersNamed = (name: string) =>
    w.q('ast_node[code](N, member_expression, F, L)')
      .filter(([n]) => !keys.has(n))
      .filter(([n]) => w.q(`ast_attr[code](${n}, computed, false)`).length > 0)
      .filter(([n]) => w.q(`ast_child[code](${n}, property, 0, P)`)
        .some(([p]) => w.q(`ast_name[code](${p}, "${name}")`).length > 0));
  assert.ok(staticMembersNamed('next').length > 0,
    'positive control: the corpus does spell static members this way');
  assert.deepEqual(staticMembersNamed('iterator'), [],
    'nothing in this corpus reaches a symbol-keyed method by the string the model gives it');
});

// ===========================================================================
// 3. THE MUTANT SET. Eight, each aimed at a NAMED constraint, and three of them
//    are expected to SURVIVE for reasons given by name — the taxonomy in
//    f_a_third_kind_of_surviving_mutant_waits_on_an_item: no site in this
//    corpus, unkillable by the grammar, or waiting on another instrument.

const GUARD = `                          not ast_attr[code](P, computed, true),\n`;
const ARM1 = `key_name[code](K, N)   :- ast_child[code](P, key, 0, K),
                          not ast_attr[code](P, computed, true),
                          ast_name[code](K, N).`;
const ARM2_KEY = `key_name[code](K, N)   :- ast_child[code](_, key, 0, K),
                          ast_node[code](K, member_expression, _, _),`;

const MUTANTS: { name: string; targets: string; mut: Mut[]; expect: (m: World) => void }[] = [
  {
    name: 'm1 the computed guard is deleted',
    targets: 'THE GUARD ITSELF — a computed identifier key must not be named by its spelling',
    mut: [{ file: ST, find: GUARD, replace: '' }],
    expect: (m) => {
      assert.deepEqual(namesTheHandle(m).filter((r) => r === 'key_name'), ['key_name'],
        'the relation names the property after the variable again');
      assert.deepEqual(membersOf(m, 'jamb', 'member_value[flow](#, K, V)'),
        ['haspSpelling', 'staple']);
      assert.deepEqual(membersOf(m, 'Clasp', 'own_key[flow](#, K)'),
        ['haspSpelling', 'hinge']);
    },
  },
  {
    name: 'm2 the first arm ranges over every named node again',
    targets: 'THE KEY PREMISE — a relation called key_name must hold only keys',
    mut: [{ file: ST, find: ARM1, replace: 'key_name[code](K, N)   :- ast_name[code](K, N).' }],
    expect: (m) => {
      const keys = keyNodes(m);
      const stray = m.q('key_name[code](K, N)').filter(([k]) => !keys.has(k));
      assert.ok(stray.length > 1000,
        `${stray.length} rows of key_name that are not about a key`);
    },
  },
  {
    name: 'm3 obj_member_fn reads ast_name on the key',
    targets: 'THE RESOLUTION BYPASS — `ns[someVar]()` must not resolve by the variable`s spelling',
    mut: [{ file: CG, find: `obj_member_fn[code](O, Key, M) :- key_name[code](K, Key),`,
            replace: `obj_member_fn[code](O, Key, M) :- ast_name[code](K, Key),` }],
    expect: (m) => {
      assert.deepEqual(membersOf(m, 'jamb', 'obj_member_fn[code](#, K, M)'),
        ['haspSpelling', 'staple'], 'a method the model must not name is resolvable again');
      assert.deepEqual(m.q('obj_member_fn[code](O, K, M)').filter(([, k]) => k === 'iterator'), [],
        '...and the well-known symbol stops resolving, which is the same bypass');
    },
  },
  {
    name: 'm4 own_key reads ast_name on the key',
    targets: 'THE SHADOWING BYPASS — own_key is the negated half of member_value and must agree with it',
    mut: [{ file: DF, find: `own_key[flow](CD, Key)         :- key_name[code](K, Key),`,
            replace: `own_key[flow](CD, Key)         :- ast_name[code](K, Key),` }],
    expect: (m) => {
      const own = membersOf(m, 'Clasp', 'own_key[flow](#, K)');
      const val = membersOf(m, 'Clasp', 'member_value[flow](#, K, V)');
      assert.deepEqual(own, ['haspSpelling', 'hinge']);
      assert.deepEqual(val, ['hinge']);
      // THE SHAPE OF THE BUG, and it is worse than a wrong label: `own_key`
      // stands under a negation in `member_value`'s inheritance arm, so a key
      // the lookup does not offer can still HIDE one it would have.
      assert.ok(own.length > val.length,
        'a member is its own only in the relation that shadows, not in the one that answers');
    },
  },
  {
    name: 'm5 the object-property arm of fn_name reads ast_name on the key',
    targets: 'THE NAMING BYPASS for a property whose VALUE is a function',
    mut: [{ file: CG, find: `fn_name[code](F, N) :- key_name[code](K, N), ast_child[code](P, key, 0, K),`,
            replace: `fn_name[code](F, N) :- ast_name[code](K, N), ast_child[code](P, key, 0, K),` }],
    expect: (m) => {
      assert.ok(namesTheHandle(m).includes('fn_name'),
        '`{ [haspSpelling]: (n) => n }` names its function after the variable again');
    },
  },
  // --------------------------------------------------------------- survivors
  {
    name: 'm6 SURVIVOR — the guard becomes a positive `computed, false` test',
    targets: 'THE CHOICE OF NEGATION over a positive attribute test',
    mut: [{ file: ST, find: `                          not ast_attr[code](P, computed, true),`,
            replace: `                          ast_attr[code](P, computed, false),` }],
    expect: (m) => {
      // WAITING ON ANOTHER ITEM, and the item is named. The seven key positions
      // with no `computed` attribute are all private, and `key_name` has no arm
      // for a `private_name` — so the two forms of the guard agree on every row
      // this corpus has. They stop agreeing the day `key_name` learns a private
      // key, which rules/js-dataflow.rofl already contemplates in prose. Somebody
      // should come back and kill this then.
      assert.deepEqual(namesTheHandle(m), namesTheHandle(base()),
        'no row moves: every key parent this guard would drop is private, and no '
        + 'private key is named by key_name today');
    },
  },
  {
    name: 'm7 SURVIVOR — the Symbol arm stops ranging over keys',
    targets: 'BOTH arms range over keys, not only the first',
    mut: [{ file: ST, find: ARM2_KEY,
            replace: `key_name[code](K, N)   :- ast_node[code](K, member_expression, _, _),` }],
    expect: (m) => {
      // NO SITE IN THIS CORPUS. Every `Symbol.<prop>` here stands in key
      // position, so the premise removes nothing; it would bite on a program
      // that mentions `Symbol.iterator` anywhere else, and none does.
      assert.equal(m.n('key_name[code](K, N)'), base().n('key_name[code](K, N)'),
        'no row moves: the corpus spells Symbol only as a key');
      const sym = m.q('ast_name[code](O, "Symbol")');
      assert.ok(sym.length > 0, `positive control: ${sym.length} mentions of Symbol`);
    },
  },
  {
    name: 'm8 SURVIVOR — obj_member_fn is put back in its old body order',
    targets: 'THE BODY ORDER, which is a COST constraint and not an answer',
    mut: [{ file: CG, find: `obj_member_fn[code](O, Key, M) :- key_name[code](K, Key),
                                  ast_child[code](M, key, 0, K),
                                  ast_node[code](M, object_method, _, _),
                                  ast_child[code](O, properties, _, M),
                                  ast_node[code](O, object_expression, _, _).`,
            replace: `obj_member_fn[code](O, Key, M) :- ast_node[code](O, object_expression, _, _),
                                  ast_child[code](O, properties, _, M),
                                  ast_node[code](M, object_method, _, _),
                                  ast_child[code](M, key, 0, K), key_name[code](K, Key).` }],
    expect: (m) => {
      // UNKILLABLE BY THIS FILE, BY CONSTRUCTION. Reordering a conjunction of
      // positive literals cannot move an answer; it moved 10 680 rows handed out
      // by the store, which only test/js-fixpoint-cost.test.ts can see. Named
      // here so the next reader knows which instrument owns it.
      assert.deepEqual(membersOf(m, 'jamb', 'obj_member_fn[code](#, K, M)'), ['staple'],
        'the same answer, and the cost gate is the only witness to the difference');
    },
  },
  {
    name: 'm9 destructures reads ast_name on the pattern`s key',
    targets: 'A DATED SURVIVOR, discharged: the mutant test/js-controlflow-values.test.ts '
      + 'recorded as WAITING ON THIS ITEM',
    mut: [{ file: DF,
            find: `                                           ast_child[code](Prop, key, 0, K), key_name[code](K, Key),
                                           ast_child[code](Prop, value, 0, L), ast_name[code](L, Local).`,
            replace: `                                           ast_child[code](Prop, key, 0, K), ast_name[code](K, Key),
                                           ast_child[code](Prop, value, 0, L), ast_name[code](L, Local).` }],
    expect: (m) => {
      // It derived a BYTE-IDENTICAL WORLD until 2026-09-09, because every key in
      // a pattern in this corpus was a plain identifier and `key_name`'s first
      // arm WAS `ast_name`. `const { [haspSpelling]: pried } = jamb` is the
      // shape that shape could not be written for, and it could not be written
      // honestly until this item settled what a computed key is named. Nothing.
      const bound = (w: World) => w.q('destructures[code](D, L, K, F)')
        .map(([, l, k]) => `${l}<-${k}`).sort();
      const gained = bound(m).filter((r) => !bound(base()).includes(r));
      assert.deepEqual(gained, ['pried<-haspSpelling'],
        'the mutant binds a local to a key that is the variable`s spelling');
      assert.ok(bound(base()).length > 5, `positive control: ${bound(base()).length} bindings`);
      // ...AND THE PRICE OF THE HONEST ANSWER, asserted rather than implied.
      // `destructures` links a LOCAL to a KEY, so a pattern whose key cannot be
      // named binds no local: `pried` is a name this program certainly binds and
      // the model attributes to nothing. That is the opposite failure from the
      // one this item removed, and it is the one to have.
      assert.deepEqual(bound(base()).filter((r) => r.startsWith('pried<-')), []);
    },
  },
];

for (const { name, targets, mut, expect } of MUTANTS) {
  test(`MUTANT ${name}`, () => {
    console.log(`  targets: ${targets}`);
    expect(build(mut));
  });
}
