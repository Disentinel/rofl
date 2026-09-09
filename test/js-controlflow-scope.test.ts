// js-controlflow-scope.test.ts — THE LAST THIRD: everything about which NAME
// means what. Scope (which binder a use sees, and which function binds `this`),
// the alias store (a member written is a member read), and the module boundary
// (an imported name is the function another module exports).
//
// Split out 2026-09-07 for the reason test/js-corpus-world.ts records: a world
// costs 15.4 s, this suite had sixty-six of them in one file, and the machine
// runs three files at once. Section numbers are the original ones.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import { build, base, edges, read, unq, FILES, FACTS, RULES } from './js-corpus-world.ts';
import type { Mut, World } from './js-corpus-world.ts';

// 3g. SCOPE (w_scope_binding): a use sees a binder its region contains.
//
// THE BLINDNESS HAD BEEN MANAGED BY AVOIDING IT, which is why every gate was
// green. `binder` is file-scoped: `const c = new Crate()` in `useCrate` and
// `const c = new Cask(n)` in `useSuper` were ONE name, and the collision
// derived nothing wrong only because the two classes shared no method name.
// Five fixture renames over the preceding week were made specifically to dodge
// this limitation — the corpus had been bent around the defect until the defect
// could not be seen. Giving `Crate` a `hold` to match `Barrel`'s took
// `ambiguous_call[audit]` from 8 to 12 in one method, and the region rule took
// it back to 8 with the collision still there.
const SCOPE: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 't1 the visibility check is dropped from may_be_node',
    mut: [{ find: `may_be_node[flow](E, N) :- binder[code](D, Name, Init, File), may_be_node[flow](Init, N),
                           ident_in[code](E, Name, File), sees_binder[code](E, D).`,
            replace: `may_be_node[flow](E, N) :- binder[code](D, Name, Init, File), may_be_node[flow](Init, N),
                           ident_in[code](E, Name, File).`, file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      // +4 -> +10 on 2026-09-07, and the six new ones are a SECOND collision the
      // tagged-template fixture brought with it: `const f = mark`a`` in `useTag`
      // and the parameter `f` in `apply2`, `applyFirst` and `useCb`. Named
      // rather than counted, because a count that grew for a reason nobody
      // looked at is the thing this file exists to prevent.
      assert.equal(m.n('ambiguous_call[audit](C, F, G)'),
        b.n('ambiguous_call[audit](C, F, G)') + 10,
        'the two `const c` become one name again and both `hold`s answer both sites');
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)).sort(),
        ['apply2 -> stamped', 'applyFirst -> stamped', 'useCb -> stamped'],
        'and a module-scope `const f` answers every parameter named `f`');
    },
  },
  {
    name: 't2 a top-level binder is invisible inside a function',
    mut: [{ find: `sees_binder[code](E, D)      :- binder_at_top[code](D), scoped_binder[code](D, File),
                                ident_in[code](E, _, File).`, replace: '',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      const lost = [...edges(b)].filter((e) => !edges(m).has(e));
      assert.ok(lost.includes('useArrow -> dbl'),
        `a module-scope const stops reaching the functions below it: ${lost.slice(0, 4)}`);
      assert.ok(lost.length > 15, `${lost.length} edges lost`);
    },
  },
  {
    name: 't3 every binder is treated as top-level',
    mut: [{ find: 'binder_at_top[code](D)       :- scoped_binder[code](D, _), not binder_region[code](D, _).',
            replace: 'binder_at_top[code](D)       :- binder[code](D, _, _, _).',
            file: 'rules/js-dataflow.rofl' }],
    // MEASURED IN THIS WORLD, not in a probe's. A scratch harness without
    // rules/js-controlflow.rofl reported `calls_in` EMPTY here — the fixpoint
    // not finishing inside the budget — and the assertion was almost written
    // that way. In the world this file builds it finishes and invents edges
    // instead, which is the fourth time this session an instrument's world
    // turned out to be part of its claim.
    // AND THE ROWS ARE NAMED, not counted. Written first as `extra.length > 5`
    // from a number measured in a probe world; the real world invents exactly
    // TWO edges, and a bound that happened to sit above them would have been
    // green while saying nothing. `keyPick` is bound to "keyOne" in one
    // function and to "keyTwo" in another, so a top-level binder lets each
    // computed site reach the other's key.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)).sort(),
        ['apply2 -> stamped', 'applyFirst -> stamped', 'useCb -> stamped',
         'useKeyA -> keyTwo', 'useKeyB -> keyOne'],
        'every binder visible everywhere: each computed key reaches the other site');
      assert.equal(m.n('ambiguous_call[audit](C, F, G)'),
        b.n('ambiguous_call[audit](C, F, G)') + 14,
        'and the collisions the region rule closed come back, fourteen of them');
    },
  },
  {
    name: 't4 the visibility check is dropped from may_be_lit',
    mut: [{ find: `may_be_lit[flow](E, V)  :- binder[code](D, Name, Init, File), may_be_lit[flow](Init, V),
                           ident_in[code](E, Name, File), sees_binder[code](E, D).`,
            replace: `may_be_lit[flow](E, V)  :- binder[code](D, Name, Init, File), may_be_lit[flow](Init, V),
                           ident_in[code](E, Name, File).`, file: 'rules/js-dataflow.rofl' }],
    // the LITERAL half needed its own witness: every colliding binder in the
    // corpus carried a node, not a string, until `keyPick` was written.
    expect: (m, b) => assert.equal(m.n('ambiguous_call[audit](C, F, G)'),
      b.n('ambiguous_call[audit](C, F, G)') + 4,
      'two computed keys named `keyPick` become one and each site reaches both methods'),
  },
  {
    name: 't5 a region sees only itself, not what it contains',
    mut: [{ find: `sees_binder[code](E, D)      :- binder_region[code](D, R), ast_within[code](R, E),
                                ident_in[code](E, _, _).`,
            replace: `sees_binder[code](E, D)      :- binder_region[code](D, R), nearest_v[flow](R, E),
                                ident_in[code](E, _, _).`,
            file: 'rules/js-dataflow.rofl' }],
    // A CLOSURE is what tells `contains` from `is`: `inner2` is a different
    // region from `closureRead`, and asking for the NEAREST enclosing function
    // loses the outer `const` entirely.
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)), ['inner2 -> leaf']),
  },
  // THE `this` HALF, and it is the same question in a form that is not lexical
  // BINDING but is still lexical SCOPE: which construct binds `this`. The rule
  // it replaced read `anywhere under the class method` and said so in a comment
  // that called its own over-approximation harmless because no corpus site
  // exercised it — the exact shape this loop keeps finding, a defect that
  // cannot go red because nothing exercises it.
  {
    name: 't6 drop `not this_nearer`: every enclosing this-binder answers',
    mut: [{ find: 'this_host[flow](F, T)   :- this_over[flow](F, T), not this_nearer[flow](F, T).',
            replace: 'this_host[flow](F, T)   :- this_over[flow](F, T).',
            file: 'rules/js-dataflow.rofl' }],
    // KILLED BY THE AUDIT AND NOT BY THE EDGE LIST, and that is measured rather
    // than arranged: `knob.read` and `Panel.read` are two functions with one
    // name, so `relay -> read` is the same string whichever one is meant. The
    // site resolving TWO ways is what `ambiguous_call[audit]` counts.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)), []);
      assert.equal(m.n('ambiguous_call[audit](C, F, G)'),
        b.n('ambiguous_call[audit](C, F, G)') + 2,
        'the `this` in `relay` answers with the object AND the class');
    },
  },
  {
    name: 't7 an object method does not bind `this`',
    mut: [{ find: 'this_binds_kind(object_method).\n', replace: '',
            file: 'rules/js-dataflow.rofl' }],
    // `tag` is on `knob` and not on `Panel`, which is the only reason this one
    // is visible at all: with `read` alone the wrong host silently swaps which
    // function the edge means and the name does not move.
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)), ['relay -> tag'],
      "`this` in an object method walks out to the class method around it"),
  },
  {
    name: 't8 an arrow binds `this`',
    mut: [{ find: 'this_binds_kind(class_private_method).',
            replace: 'this_binds_kind(class_private_method).\nthis_binds_kind(arrow_function_expression).',
            file: 'rules/js-dataflow.rofl' }],
    // the ABSENCE of one row in an edb list is the whole rule, so the mutant
    // that adds it back is the one that says the absence is load-bearing.
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)), ['via -> read'],
      'an arrow that inherits `this` stops reaching the class it inherited it from'),
  },
];


// ---------------------------------------------------------------------------
// 3i. THE MODULE BOUNDARY (w_cg_module_boundary): an imported name.
//
// MEASURED BEFORE ANY RULE, and three things came back that the note did not
// say. The corpus had exactly TWO import declarations, both `./trace.mjs`, and
// that module is deliberately not scanned — it is the instrument — so 152 of
// the 167 unresolved sites were ONE imported name used once per instrumented
// function, and the boundary had no site where crossing it was possible.
// `rules/js-modules.rofl` loaded into this world derives NOTHING: it resolves
// against host facts about the disk that this corpus does not supply. And the
// scanner already carried every part of the binding.
const IMPORTS: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'i1 the imported-name arm is deleted',
    mut: [{ find: `may_be_node[flow](E, F) :- imports_name[code](Local, Name, Src, File),
                           import_target[code](Src, Target),
                           exports_name[code](F, Name, Target),
                           ident_in[code](E, Local, File).`,
            replace: '', file: 'rules/js-dataflow.rofl' }],
    // TWO EDGES SINCE 2026-09-07, and the second one is the arm's reach rather
    // than a second arm: `bviaStar` binds through a RE-EXPORT, and a re-export
    // changes which module `exports_name` answers for — the binding is still
    // this rule. Deleting it takes the direct import and the re-exported one
    // together, which is what says the two paths share a binder.
    // FOUR SINCE 2026-09-08 (w_export_specifier_forms), and the two new ones say
    // the same thing about two more export FORMS: `bviaRename -> renamed` comes
    // through `export { renamed as exposed }`, where the name the importer asks
    // for is not the name the function has, and `bviaNsReexport -> leaf` through
    // `export * as alphaAll from`, where what the importer binds is a whole
    // module. Both reach `may_be_node` by this one arm and go with it.
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)).sort(),
      ['bcross -> crossed', 'bviaNsReexport -> leaf', 'bviaRename -> renamed', 'bviaStar -> crossed'],
      'every cross-file call edge this model derives goes through this one arm'),
  },
  {
    name: 'i2 the LOCAL name is read where the IMPORTED name belongs',
    mut: [{ find: 'exports_name[code](F, Name, Target),',
            replace: 'exports_name[code](F, Local, Target),',
            file: 'rules/js-dataflow.rofl' }],
    // `import { crossed as leaf }` is aliased FOR THIS MUTANT: with
    // `{ crossed }` the two names are one string and the confusion is invisible.
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['bcross -> crossed', 'bviaStar -> crossed'],
        'no module exports the local name, so both cross-file edges go');
      // ...AND ONE ARRIVES, which is the sharper half and was not asserted until
      // 2026-09-07: alpha.mjs really does export a `leaf`, so reading the local
      // name where the imported one belongs does not merely fail — it binds
      // beta's `leaf` to the WRONG function, silently and in the same file.
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)), ['bcross -> leaf'],
        'the alias collides with a real export of the module it points at');
    },
  },
  {
    name: 'i3 the IMPORTED name is read where the LOCAL name belongs',
    mut: [{ find: '                           ident_in[code](E, Local, File).',
            replace: '                           ident_in[code](E, Name, File).',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['bcross -> crossed', 'bviaStar -> crossed'],
        'beta.mjs contains no identifier `crossed`, so both edges go');
      // AND IT BINDS SOMETHING ELSE WRONG, which the corpus could not say until
      // `twin` existed twice: beta.mjs DOES contain an identifier `twin` — its
      // own declaration — so reading the imported name where the local one
      // belongs makes beta's own call to its own `twin` mean delta's as well.
      assert.equal(m.n('ambiguous_call[audit](C, F, G)'),
        b.n('ambiguous_call[audit](C, F, G)') + 2, 'the collision resolves both ways');
    },
  },
  {
    name: 'i4 an import binds in every file, not the one it is written in',
    mut: [{ find: '                           ident_in[code](E, Local, File).',
            replace: '                           ident_in[code](E, Local, _).',
            file: 'rules/js-dataflow.rofl' }],
    // WHERE THIS MUTANT COULD NOT LOOK UNTIL THE FIXTURE SAID SO: with one
    // importer the file column is unconstrained by anything, so the mutation is
    // invisible. alpha.mjs declares `crossed` and does not import it, which is
    // what makes the dropped column produce a row that should not exist.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)).sort(), [
        'apply2 -> crossed', 'applyFirst -> crossed', 'hello -> crossed',
        'inner -> crossed', 'inner2 -> crossed', 'mid -> crossed',
      ], "every alpha.mjs call to its own `leaf` reaches beta's import as well");
      assert.equal(m.n('ambiguous_call[audit](C, F, G)'),
        b.n('ambiguous_call[audit](C, F, G)') + 14, 'and each site resolves two ways');
    },
  },
];

for (const g of IMPORTS) test(`${g.name} — module boundary`, () => g.expect(build(g.mut), base()));

// 3j. THE OTHER TWO SPECIFIERS (w_cg_module_boundary, continued). A NAMESPACE
// import binds the whole module, and the module object is a node the store
// already had: the other file's `program`. A DEFAULT import binds the one
// unnamed export, whose syntactic name is NOT the name the importer uses.
const SPECIFIERS: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'n1 the namespace binding is deleted',
    mut: [{ find: `may_be_node[flow](E, P) :- imports_ns[code](Local, Src, File), import_target[code](Src, Target),
                           module_object[flow](P, Target), ident_in[code](E, Local, File).`,
            replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)), ['bviaNs -> crossed']),
  },
  {
    name: 'n2 a module namespace is not a plain object',
    mut: [{ find: `member_plain[flow](P, Key, V) :- module_object[flow](P, _),
                                 member_value[flow](P, Key, V).`,
            replace: '', file: 'rules/js-dataflow.rofl' }],
    // THE SAME EDGE AS n1 AND A DIFFERENT ROW, which is what keeps them two
    // mutants: `member_value` still names the export, and all three member
    // lookups guard their receiver, so a `program` node passes none of them.
    expect: (m, b) => {
      // TWO EDGES SINCE 2026-09-08: `alphaAll.leaf` is a member lookup on a
      // module object that arrived through `export * as` rather than through
      // `import * as`, and the receiver is the same kind of node either way —
      // which is the point of deriving the namespace re-export as a value.
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)).sort(),
        ['bviaNs -> crossed', 'bviaNsReexport -> leaf']);
      // WAS TWO COUNTS (82 and 30) AND IS NOW THE EQUATION THEY WERE STANDING
      // IN FOR, 2026-09-07. Both moved every time the corpus grew an object or
      // a module, and neither said which rows had gone: the deleted arm reads
      // `module_object(P, _), member_value(P, Key, V)`, so what it removes is
      // exactly the member_plain rows whose receiver is a module object. That
      // is checkable as a set, and a set does not need re-stating when a
      // fixture gains a method.
      const plain = (w: World) => new Set(w.q('member_plain[flow](O, K, V)')
        .map(([o, k, v]) => `${o}|${k}|${v}`));
      const modules = new Set(b.q('module_object[flow](P, F)').map(([p]) => p));
      const lost = [...plain(b)].filter((r) => !plain(m).has(r));
      assert.ok(lost.length > 0, 'positive control: the arm derives something');
      assert.deepEqual(lost.filter((r) => !modules.has(r.split('|')[0])), [],
        'every row the mutant loses has a module object as its receiver');
      assert.deepEqual([...plain(m)].filter((r) => !plain(b).has(r)), [],
        'and it gains none');
      // ...and the OTHER direction, which a count could not express at all:
      // every module-object member the baseline knows about is one of the rows
      // that went. A row surviving here would mean a second arm derives it, and
      // that is worth being told about rather than absorbed into a number.
      const viaModule = [...modules].flatMap((p) => b.q(`member_value[flow](${p}, K, V)`)
        .map(([k, v]) => `${p}|${k}|${v}`)).sort();
      assert.deepEqual(viaModule.filter((r) => !lost.includes(r)), [],
        'no module member survives the deletion by another route');
    },
  },
  {
    name: 'n3 the default binding is deleted',
    mut: [{ find: `may_be_node[flow](E, F) :- imports_default[code](Local, Src, File),
                           import_target[code](Src, Target),
                           exports_default[code](F, Target),
                           ident_in[code](E, Local, File).`,
            replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)), ['bviaNs -> adefault']),
  },
  {
    name: 'n4 a default export is read as a NAMED one',
    mut: [{ find: 'exports_default[code](F, File) :- ast_node[code](E, export_default_declaration, File, _),',
            replace: 'exports_default[code](F, File) :- ast_node[code](E, export_named_declaration, File, _),',
            file: 'rules/js-dataflow.rofl' }],
    // THE LOUDEST OF THE FIVE, and it is loud for a reason worth naming: there
    // is exactly ONE default export per module and TWENTY-NINE named ones, so
    // confusing the two turns one binding into every export alpha.mjs has.
    expect: (m, b) => {
      // WAS A LIST OF TWELVE NAMES TYPED OUT, AND IS NOW THE CLAIM ITSELF:
      // the site gains an edge to every function alpha.mjs exports BY NAME and
      // did not already reach. Written out, the list went red for every
      // function the fixture ever gained — which is a fact about alpha.mjs and
      // not about this mutant.
      // ...AND `EVERY NAMED EXPORT` STOPPED BEING THE RIGHT SET ON 2026-09-08,
      // which is a measurement rather than a repair. Two things separated that
      // the corpus had kept equal: an export's NAME is not its function's name
      // once `export { renamed as exposed }` exists, and an export written as a
      // SPECIFIER has no `declaration` child — which is the child the mutated
      // rule reads. So this mutant reaches every export alpha.mjs writes INLINE
      // and not the one it writes as a specifier, and the expectation says
      // which instead of saying `every named export` and being wrong by one.
      const named = b.q('exports_name[code](F, N, "alpha.mjs")')
        .filter(([f]) => b.n(`ast_child[code](E, declaration, 0, ${f})`) > 0)
        .flatMap(([f]) => b.q(`fn_name[code](${f}, N)`).map(([n]) => `bviaNs -> ${n}`));
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)).sort(),
        [...new Set(named.filter((e) => !edges(b).has(e)))].sort(),
        'one binding becomes every named export alpha.mjs has');
      assert.ok(named.length > 1, 'positive control: alpha.mjs exports more than one name');
      // AND THE AMBIGUITY IS AN IDENTITY RATHER THAN A NUMBER. 164 was
      // k*(k-1) for whatever k the corpus happened to make the site resolve to,
      // so it moved with every export added anywhere. What the mutant does is
      // make ONE site resolve every way at once, and that is exactly what the
      // identity says.
      const before = new Set(b.q('ambiguous_call[audit](C, F, G)').map((r) => r.join('|')));
      const gained = m.q('ambiguous_call[audit](C, F, G)').filter((r) => !before.has(r.join('|')));
      const sites = new Set(gained.map(([c]) => c));
      assert.equal(sites.size, 1, 'a single call site accounts for all of it');
      const site = [...sites][0];
      const k = m.n(`resolves[code](${site}, F)`);
      assert.ok(k > 2, `positive control: the site resolves ${k} ways`);
      assert.equal(gained.length, k * (k - 1),
        'every ordered pair of resolutions at that one site, and nothing else');
    },
  },
  {
    name: 'n5 the two specifier KINDS are confused',
    mut: [{ find: '    ast_node[code](Sp, import_namespace_specifier, _, _),',
            replace: '    ast_node[code](Sp, import_default_specifier, _, _),',
            file: 'rules/js-dataflow.rofl' }],
    // n1 LOSES THE SAME EDGE, so the edge cannot be what tells them apart: this
    // one binds the wrong NAME to the module object, and the row says so.
    expect: (m, b) => {
      assert.deepEqual(b.q('imports_ns[code](L, S, F)'), [['alphaNs', './alpha.mjs', 'beta.mjs']]);
      assert.deepEqual(m.q('imports_ns[code](L, S, F)'), [['adefault', './alpha.mjs', 'beta.mjs']],
        'the namespace rule binds the DEFAULT import\'s name');
    },
  },
];

for (const g of SPECIFIERS) test(`${g.name} — specifiers`, () => g.expect(build(g.mut), base()));

test('a namespace, a default, and the export that finally has a consumer', () => {
  const m = base();
  for (const e of ['bviaNs -> crossed', 'bviaNs -> adefault']) {
    assert.ok(edges(m).has(e), `the specifier did not bind: ${e}`);
  }
  // `export default` HAD A NODE AND NO CONSUMER since beta.mjs was written:
  // `bdefault` is called by the harness, which is not an edge the model can be
  // checked against. alpha.mjs has one now that beta imports, so the binding
  // rule has a site — and BOTH defaults are still named by the relation.
  assert.deepEqual(m.q('exports_default[code](F, File)').map(([, f]) => f).sort(),
    ['alpha.mjs', 'beta.mjs']);
  assert.deepEqual(m.q('imports_default[code](L, S, F)'), [['adefault', './alpha.mjs', 'beta.mjs']]);
});


test('an imported name, and the module the corpus does not have', () => {
  const m = base();
  // THE POSITIVE HALF: the first cross-file call edge this model has derived.
  assert.ok(edges(m).has('bcross -> crossed'), 'beta.mjs reaches into alpha.mjs');
  // ...AND THE FRONTIER IS NAMED RATHER THAN SILENT. `trace` is imported by
  // every instrumented file from a module the corpus deliberately does not scan
  // — it is the instrument — so it can never resolve, and saying so once per
  // MODULE beats saying nothing 152 times per USE.
  assert.deepEqual(m.q('import_outside_corpus[audit](S, F)').map(([s, f]) => `${f}: ${s}`).sort(),
    ['alpha.mjs: ./trace.mjs', 'beta.mjs: ./trace.mjs', 'delta.mjs: ./trace.mjs']);
  // THREE SPECIFIERS NAME A FILE THE CORPUS HAS, and one of the three is named
  // by no import at all: `./delta.mjs` appears only in gamma's `export *`. That
  // is what makes the export-all arm of `module_source` load-bearing, and it is
  // the row mutant r4 takes away.
  assert.deepEqual(m.q('import_target[code](S, F)'),
    [['./alpha.mjs', 'alpha.mjs'], ['./delta.mjs', 'delta.mjs'], ['./gamma.mjs', 'gamma.mjs']]);
});

// ---------------------------------------------------------------------------
// 3k. A RE-EXPORT (w_cg_module_boundary, last form): `export * from './x'`.
//
// THE ONE IMPORT/EXPORT FORM THAT NEEDS A WHOLE FILE rather than a line —
// checking it takes a module that re-exports and a second module that imports
// FROM the re-exporting one — and then a SECOND file, for a reason the first
// round of mutants measured rather than predicted. gamma.mjs re-exporting
// alpha.mjs derives the right edge and kills exactly one of the four mutants
// below, because beta.mjs imports alpha.mjs DIRECTLY: `./alpha.mjs` is already
// a module the resolver has seen, so a rule that never learned an `export *`
// names a source loses nothing, and a rule that re-exports every module's names
// produces twenty wrong facts and not one wrong answer.
//
// TWO PROPERTIES OF THE CORPUS FIXED BOTH, and they are the same property twice:
// delta.mjs is reachable ONLY through the re-export (nothing imports it), and
// the name it exports COLLIDES with one beta.mjs declares itself. That is the
// third time in this loop that a surviving mutant was repaired by a name
// collision rather than by a sharper assertion.
const fileOf = (w: World, id: string) => w.q(`ast_node[code](${id}, K, F, L)`)[0]?.[1] ?? '?';
/** every named export of one module, tagged with the module the function lives
 *  in. ONE HELPER RATHER THAN TWO LITERAL LISTS, 2026-09-07: the expectations
 *  below used to enumerate alpha.mjs's exports by hand, so adding one function
 *  to a fixture reddened four assertions that had nothing to say about it. What
 *  each of them actually claims is a set EQUATION between one module's exports
 *  and another's, and an equation moves on both sides at once. */
const exportsOf = (w: World, file: string) => w.q(`exports_name[code](F, N, "${file}")`)
  .map(([f, n]) => `${n}@${fileOf(w, f)}`).sort();
/** the modules a file's `import`/`export *` specifiers resolve to */
const targetsOf = (w: World, file: string) => [...new Set(
  w.q(`module_source[code](E, S, "${file}")`)
    .flatMap(([, src]) => w.q(`import_target[code]("${src}", T)`).map(([t]) => t)))].sort();
/** every name gamma re-exports, tagged with the module the function lives in */
const reexports = (w: World) => exportsOf(w, 'gamma.mjs');
/** every export of beta.mjs, the file that RE-EXPORTS NOTHING and imports four times */
const betaExports = (w: World) => exportsOf(w, 'beta.mjs');
/** each ambiguous call site as `caller-file: name@file | name@file` */
const ambRows = (w: World) => w.q('ambiguous_call[audit](C, F, G)').map(([c, f, g]) =>
  `${fileOf(w, c)}: ${w.q(`fn_name[code](${f}, N)`)[0]?.[0]}@${fileOf(w, f)}`
  + ` | ${w.q(`fn_name[code](${g}, N)`)[0]?.[0]}@${fileOf(w, g)}`).sort();

const AMBIGUOUS_ROWS = ['alpha.mjs: alef@alpha.mjs | bet@alpha.mjs',
   'alpha.mjs: alef@alpha.mjs | bet@alpha.mjs',
   'alpha.mjs: bet@alpha.mjs | alef@alpha.mjs',
   'alpha.mjs: bet@alpha.mjs | alef@alpha.mjs',
   'alpha.mjs: cubed@alpha.mjs | squared@alpha.mjs',
   'alpha.mjs: pick@alpha.mjs | pick@alpha.mjs',
   'alpha.mjs: pick@alpha.mjs | pick@alpha.mjs',
   'alpha.mjs: pick@alpha.mjs | pick@alpha.mjs',
   'alpha.mjs: pick@alpha.mjs | pick@alpha.mjs',
   'alpha.mjs: squared@alpha.mjs | cubed@alpha.mjs',
   // FOUR MORE ON 2026-09-08 (w_decorator_replaces_its_target): a DECORATED
   // MEMBER answers both the method the class declares and the replacement its
   // decorator returned, which is the may-set behaving as declared - a
   // decorator MAY return its argument unchanged, and `@decoOnce` does.
   'shapes.ts: bitted@shapes.ts | tightened@shapes.ts',
   'shapes.ts: crimped@shapes.ts | seized@shapes.ts',
   'shapes.ts: seized@shapes.ts | crimped@shapes.ts',
   'shapes.ts: tightened@shapes.ts | bitted@shapes.ts'];

const REEXPORT: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'r1 the re-export arm is deleted',
    mut: [{ find: `exports_name[code](F, Name, File) :- ast_node[code](E, export_all_declaration, File, _),
                                     module_source[code](E, Src, File),
                                     import_target[code](Src, Target),
                                     exports_name[code](F, Name, Target).`,
            replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)), ['bviaStar -> crossed'],
        'the name imported only through gamma.mjs stops resolving');
      // ...AND WHAT SURVIVES IS THE OTHER RE-EXPORT ARM, not a leak: gamma also
      // carries `export * as alphaAll from './alpha.mjs'`, whose specifier is an
      // ExportNamespaceSpecifier and whose rule is a different one. Deleting the
      // export-all arm must not take it, and this row is what says so.
      assert.deepEqual(reexports(m), ['alphaAll@alpha.mjs'],
        'gamma exports nothing of its own but the namespace it re-exports by name');
      // THE CONJUNCT THAT KEEPS THIS APART FROM r4, which loses the same edge:
      // the SPECIFIER still names a module here, only the names do not travel.
      assert.equal(m.q('import_target[code](S, T)').length, 3,
        'every specifier still resolves — this mutant is about names, not modules');
    },
  },
  {
    name: 'r2 the re-export takes names from EVERY module, not the one it names',
    mut: [{ find: `                                     import_target[code](Src, Target),
                                     exports_name[code](F, Name, Target).`,
            replace: `                                     import_target[code](Src, _),
                                     exports_name[code](F, Name, _).`,
            file: 'rules/js-dataflow.rofl' }],
    // WHERE THE EDGE SET CANNOT LOOK, measured before this assertion existed:
    // this mutant loses NO edge and gains none. `twin` is declared in delta.mjs
    // and in beta.mjs, so both candidates carry the same NAME and `calls_in` —
    // which is keyed by name — reports one string either way. Only the pair of
    // functions the site resolves to says the module was ignored.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)), [], 'no edge moves');
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)), [], 'in either direction');
      assert.deepEqual(ambRows(m).filter((r) => !ambRows(b).includes(r)),
        ['beta.mjs: twin@beta.mjs | twin@delta.mjs',
         'beta.mjs: twin@delta.mjs | twin@beta.mjs'],
        'the imported `twin` now means both the re-exported one and beta\'s own');
      // WAS TWO LENGTHS (14 and 38) AND IS NOW THE SENTENCE IN THE MUTANT'S
      // OWN NAME: `from EVERY module, not the one it names`. Both lengths moved
      // whenever any fixture gained an export, and neither said WHICH module a
      // name had come from — which is the only thing this mutant changes.
      const carriedFrom = (w: World) => [...new Set(reexports(w).map((x) => x.split('@')[1]))].sort();
      assert.deepEqual(carriedFrom(b), targetsOf(b, 'gamma.mjs'),
        'the baseline carries names from exactly the modules gamma names');
      // ...and `every module` is read off the corpus rather than listed: any
      // file that declares a name somebody exports. shapes.ts is on it, which
      // the hand-written version of this expectation got wrong on the first
      // try — the length 38 had been hiding a fourth module for as long as it
      // was a length.
      const anywhere = [...new Set(FILES.map(([logical]) => logical)
        .flatMap((f) => exportsOf(b, f)).map((x) => x.split('@')[1]))].sort();
      assert.deepEqual(carriedFrom(m), anywhere,
        'and the mutant from every module in the corpus that exports anything');
      assert.ok(reexports(m).length > reexports(b).length, 'positive control: it really is more');
    },
  },
  {
    name: 'r3 an IMPORT is read as a re-export',
    mut: [{ find: `exports_name[code](F, Name, File) :- ast_node[code](E, export_all_declaration, File, _),
                                     module_source[code](E, Src, File),`,
            replace: `exports_name[code](F, Name, File) :- module_source[code](E, Src, File),`,
            file: 'rules/js-dataflow.rofl' }],
    // THE COST OF SHARING `module_source` BETWEEN THE TWO FORMS, made visible.
    // It holds of an import and of an export-all alike, so the kind literal
    // beside it is the only thing that stops every importing file from
    // re-exporting what it imports.
    //
    // AND THE CORPUS CANNOT TURN THIS INTO A WRONG ANSWER, which is said here
    // rather than hidden behind a green line: nothing imports from beta.mjs, so
    // thirteen facts that should not exist reach no call site. The oracle is
    // the fact, by name, and the day something imports from beta this mutant
    // starts costing an edge as well.
    expect: (m, b) => {
      assert.deepEqual(betaExports(b), ['bTag@beta.mjs', 'bcross@beta.mjs', 'bmain@beta.mjs',
        'bviaNs@beta.mjs', 'bviaNsReexport@beta.mjs', 'bviaRename@beta.mjs',
        'bviaStar@beta.mjs', 'bviaTwin@beta.mjs', 'run@beta.mjs', 'twin@beta.mjs'],
        'beta.mjs exports what beta.mjs declares');
      // WAS FOURTEEN NAMES TYPED OUT AND IS NOW `everything it imports`, read
      // off the BASELINE — which is what keeps it from being circular: the
      // sources' own export sets are derived in the unmutated world, and only
      // beta's is read from the mutated one.
      const imported = [...new Set(targetsOf(b, 'beta.mjs').flatMap((t) => exportsOf(b, t)))]
        .filter((x) => !betaExports(b).includes(x)).sort();
      assert.ok(imported.length > 0, 'positive control: beta imports from modules that export');
      assert.deepEqual(betaExports(m).filter((x) => !betaExports(b).includes(x)), imported,
        'beta.mjs re-exports everything it imports, through both of its sources');
    },
  },
  {
    name: 'r4 the SPECIFIER of an export-all is not a module source',
    mut: [{ find: `module_source[code](N, Src, File) :- ast_node[code](N, export_all_declaration, File, _),
                                     ast_child[code](N, source, 0, S), ast_value[code](S, Src).`,
            replace: '', file: 'rules/js-dataflow.rofl' }],
    // THE MUTANT THAT SURVIVED THE FIRST CORPUS, and the reason is worth more
    // than the kill: with gamma re-exporting only alpha.mjs, every specifier an
    // `export *` names was ALSO named by an ordinary import somewhere, so the
    // resolver reached the same set of modules without this arm. delta.mjs is
    // imported by nothing, so `./delta.mjs` is a specifier that exists here and
    // in no other declaration in the corpus.
    expect: (m, b) => {
      assert.deepEqual(b.q('import_target[code](S, T)'),
        [['./alpha.mjs', 'alpha.mjs'], ['./delta.mjs', 'delta.mjs'], ['./gamma.mjs', 'gamma.mjs']]);
      assert.deepEqual(m.q('import_target[code](S, T)'),
        [['./alpha.mjs', 'alpha.mjs'], ['./gamma.mjs', 'gamma.mjs']],
        'the module only a re-export names stops being resolvable');
      // ...and the namespace re-export goes with it, for a different reason and
      // through the same relation: `export * as alphaAll from` puts its source
      // on the DECLARATION, so it reads `module_source` too — but its own arm,
      // which this mutant does not delete. What it loses is the resolution of
      // the specifier that only an export-all names.
      assert.deepEqual(reexports(m), ['alphaAll@alpha.mjs'],
        'so gamma re-exports no NAME at all, and keeps the namespace it binds');
      assert.deepEqual([...edges(b)].filter((e) => !edges(m).has(e)), ['bviaStar -> crossed']);
    },
  },
];

for (const g of REEXPORT) test(`${g.name} — re-export`, () => g.expect(build(g.mut), base()));

test('a re-export carries names and not the default, and the receiver keeps its own', () => {
  const m = base();
  // THE POSITIVE HALF. `crossed` is imported TWICE under two names — `leaf`
  // straight from alpha.mjs and `viaStar` only through gamma's `export *` — so
  // the two paths are told apart by which local name resolves.
  assert.ok(edges(m).has('bviaStar -> crossed'), 'the re-exported name reaches its function');
  // `AND NOTHING ELSE` IS THE WHOLE CLAIM, so it is written as an equation
  // against the sources rather than as the fourteen names the corpus happens to
  // make it today. The two sides read DIFFERENT arms of `exports_name` — the
  // sources' rows come from their own `export` declarations and gamma's from
  // the re-export arm — so this is a composition check and not a tautology, and
  // r1 through r4 each still break it.
  const sources = targetsOf(m, 'gamma.mjs');
  assert.deepEqual(sources, ['alpha.mjs', 'delta.mjs'], 'the two modules gamma names');
  // ...PLUS THE NAMESPACES IT BINDS ITSELF, added 2026-09-08. `export * as
  // alphaAll from './alpha.mjs'` is not a re-export of alpha's NAMES — it
  // offers ONE name, `alphaAll`, standing for the whole module — so it belongs
  // on the right-hand side of this equation as its own term rather than being
  // absorbed into the union. Read off `export_ns_name`, which is the relation
  // that derives it, so the term is a query and not a typed-out name.
  const boundNs = m.q('export_ns_name[code](N, S, "gamma.mjs")')
    .flatMap(([n, src]) => m.q(`import_target[code]("${src}", T)`).map(([t]) => `${n}@${t}`));
  assert.deepEqual(boundNs, ['alphaAll@alpha.mjs'], 'gamma binds exactly one module by name');
  assert.deepEqual(reexports(m),
    [...new Set([...sources.flatMap((t) => exportsOf(m, t)), ...boundNs])].sort(),
    'gamma re-exports the NAMED exports of both its sources, plus the one module it binds, and nothing else');
  // ...AND NOT THE DEFAULT, which `export *` deliberately leaves behind. This is
  // asserted rather than assumed because `exports_default[code]` is a separate
  // relation with no re-export arm at all, and its absence is the rule.
  assert.deepEqual(m.q('exports_default[code](F, File)').map(([, f]) => f).sort(),
    ['alpha.mjs', 'beta.mjs'], 'gamma re-exports alpha, and alpha\'s default stays alpha\'s');
  // THE COLLISION RESOLVES THE RIGHT WAY ROUND: two functions named `twin`, one
  // reached through gamma and one declared in the calling file, and neither
  // answers for the other.
  // BY NAME AND NOT BY COUNT. This was `=== 8` until 2026-09-08 and
  // `w_destructuring_rest_and_spread` moved it to 10 without the assertion
  // being able to say WHICH sites — the failure
  // `f_a_pin_that_moves_with_the_corpus_is_measuring_the_corpus` names. The
  // two new rows are one site, `shaped`'s `shape(n)`, which is a defaulted
  // parameter reached once through its default and once through an argument.
  assert.deepEqual(ambRows(m), AMBIGUOUS_ROWS, 'and nothing new is ambiguous');
  // SIX SINCE 2026-09-08. `exposed` is alpha's `renamed` under the external name
  // an ExportSpecifier gives it, and `alphaAll` is the module gamma binds with
  // `export * as` — both are ordinary named imports HERE, which is the point:
  // the two new export forms need nothing new on the import side at all.
  assert.deepEqual(m.q('imports_name[code](L, N, S, "beta.mjs")')
    .map(([l, n, s]) => `${l}=${n}@${s}`).sort(),
    ['alphaAll=alphaAll@./gamma.mjs', 'exposed=exposed@./alpha.mjs',
     'leaf=crossed@./alpha.mjs', 'trace=trace@./trace.mjs', 'viaStar=crossed@./gamma.mjs',
     'viaTwin=twin@./gamma.mjs']);
});


test('the kernel refuses, and somebody reads the refusal', () => {
  // THE GATE THIS ITERATION EARNED. `str_pre(S, Sep)` is the part before the
  // first separator, not the first N characters, and the first draft of
  // `module_basename` passed `2` where a separator belongs. The kernel refused
  // it EXACTLY — `hole($rule(...), str_type_error)`, naming the rule — and the
  // rule stayed silently empty for as long as it took to probe it by hand,
  // because no world the model is measured in read `hole`. `unpopulatable`
  // cannot see this: the relation exists, the arity is right, the ledger is
  // right, and the ANSWER is empty for a reason only the hole records.
  assert.deepEqual(base().q('hole(H, R)'), [], 'no rule in this model was refused');
});


// ---------------------------------------------------------------------------
// 3h. THE ALIAS STORE (w_alias_store): a member WRITTEN is a member read.
//
// THE ITEM'S NOTE SAID A STORE WAS NEEDED — "there is no store, so a property
// written is not a property read" — and the store was never the missing thing.
// Entry 4 of rules/js-dataflow.rofl has read an assignment to an IDENTIFIER
// flow-insensitively since the value layer was written; this is that same
// reading one step over. Measured before a rule existed: `selects[flow]`
// ALREADY fires on the member on the left, `may_be_node` ALREADY answers the
// object half, and the right-hand side is already valued. SIXTH design note in
// this loop to lose to one probe.
const ALIAS: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'a1 the write arm is deleted',
    mut: [{ find: `member_value[flow](O, Key, V) :- plain_assign[flow](A), ast_child[code](A, left, 0, L),
                                 selects[flow](L, Key),
                                 ast_child[code](L, object, 0, Obj),
                                 may_be_node[flow](Obj, O),
                                 ast_child[code](A, right, 0, V).`,
            replace: '', file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)).sort(),
      ['useBin -> stocked', 'useRack -> slotted', 'useShelf -> shelved']),
  },
  {
    name: 'a2 a COMPOUND assignment counts as a write',
    mut: [{ find: 'member_value[flow](O, Key, V) :- plain_assign[flow](A), ast_child[code](A, left, 0, L),',
            replace: 'member_value[flow](O, Key, V) :- ast_node[code](A, assignment_expression, _, _), ast_child[code](A, left, 0, L),',
            file: 'rules/js-dataflow.rofl' }],
    // KILLED ON A VALUE, NOT ON AN EDGE, and it is the only one in this set that
    // is: `rack.tally = 4; rack.tally += 5;` is 9 at runtime and the model must
    // claim neither 9 nor 5 — `+=` evaluates to a SUM and this layer knows
    // nothing about sums. Dropping the guard makes it claim 5.
    expect: (m, b) => {
      assert.deepEqual(tallyValues(b), ['4'], 'the plain write, and only it');
      assert.deepEqual(tallyValues(m), ['4', '5'], 'the sum is read as the value written');
    },
  },
  {
    name: 'a3 the RECEIVER stops deciding',
    mut: [{ find: `                                 ast_child[code](L, object, 0, Obj),
                                 may_be_node[flow](Obj, O),
                                 ast_child[code](A, right, 0, V).`,
            replace: `                                 obj_like[flow](O),
                                 ast_child[code](A, right, 0, V).`,
            file: 'rules/js-dataflow.rofl' }],
    // `rack` and `shelf` are two objects with the same WRITTEN key, which is
    // what makes this visible at all: with one object the mutant is a no-op.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)).sort(),
        ['useRack -> shelved', 'useShelf -> slotted']);
      assert.equal(m.n('ambiguous_call[audit](C, F, G)'),
        b.n('ambiguous_call[audit](C, F, G)') + 4, 'and each site resolves two ways');
    },
  },
  {
    name: 'a4 the LEFT is read as the value written',
    mut: [{ find: '                                 ast_child[code](A, right, 0, V).',
            replace: '                                 ast_child[code](A, left, 0, V).',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)).sort(),
      ['useBin -> stocked', 'useRack -> slotted', 'useShelf -> shelved']),
  },
  {
    name: 'a5 the key is read as a raw property name',
    mut: [{ find: '                                 selects[flow](L, Key),',
            replace: '                                 ast_child[code](L, property, 0, PK), ast_name[code](PK, Key),',
            file: 'rules/js-dataflow.rofl' }],
    // `selects[flow]` is what carries a COMPUTED key whose expression has a
    // literal value, and `bin.nest[slotKey] = stocked` is the one site that
    // needs it. A raw property name reads `slotKey` and writes the wrong key.
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)), ['useBin -> stocked']),
  },
];

/** the values the model says `tally` may hold, wherever it is selected */
const tallyValues = (w: World) => [...new Set(w.q('selects[flow](N, "tally")')
  .flatMap(([n]) => w.q(`may_be_lit[flow](${n}, V)`).map(([v]) => v)))].sort();

for (const g of ALIAS) test(`${g.name} — alias store`, () => g.expect(build(g.mut), base()));

test('a member WRITTEN is a member read, and the receiver decides', () => {
  // THE POSITIVE HALF. Three edges the model could not derive before, each
  // reaching a different way: a plain write of a function declaration, the same
  // key written on a SECOND object, and — the case the rule was ASKED about
  // rather than told — a COMPUTED write through a CHAINED receiver, which needs
  // no extra arm because `selects` already reads a computed key with a literal
  // value and `may_be_node` already resolves `bin.nest`.
  const m = base();
  for (const e of ['useRack -> slotted', 'useShelf -> shelved', 'useBin -> stocked']) {
    assert.ok(edges(m).has(e), `the write did not reach the read: ${e}`);
  }
  // AND THE RECEIVER REALLY DECIDES, across files: `bag['fixed']` in shapes.ts
  // and `rack.fixed` in alpha.mjs are one key on two objects, and neither
  // answers for the other.
  assert.ok(!edges(m).has('useRack -> shelved') && !edges(m).has('useShelf -> slotted'),
    'one key on two objects is two answers');
  // BY NAME AND NOT BY COUNT. This was `=== 8` until 2026-09-08 and
  // `w_destructuring_rest_and_spread` moved it to 10 without the assertion
  // being able to say WHICH sites — the failure
  // `f_a_pin_that_moves_with_the_corpus_is_measuring_the_corpus` names. The
  // two new rows are one site, `shaped`'s `shape(n)`, which is a defaulted
  // parameter reached once through its default and once through an argument.
  assert.deepEqual(ambRows(m), AMBIGUOUS_ROWS, 'and nothing new is ambiguous');
});


for (const g of SCOPE) test(`${g.name} — scope`, () => g.expect(build(g.mut), base()));

test('which function binds `this`, named row by row', () => {
  // THE POSITIVE HALF, because a set of mutants says what a check can catch and
  // says nothing about what it currently reports. Ten `this` nodes, ten hosts,
  // and the three interesting ones are the last three: `relay` twice (an object
  // method binds its own `this`, inside a class method), `show` once (the class
  // method's own), and `drift` for a `this` written inside an ARROW — the arrow
  // is not the host, which is the one row that would be wrong under any rule
  // that treated every function form alike.
  const m = base();
  // THE FALLBACK IS THE NODE'S KIND AND NOT ITS ID, 2026-09-08 (w_class_fields):
  // three `this` binders in the language are not functions and have no name — a
  // class field's initialiser, a private field's, and a static block — and a
  // node id is a content hash, so an id in this list would move every time
  // anybody edited the fixture ABOVE the row it names.
  const name = (id: string) => {
    const n = m.q(`fn_name[code](${id}, N)`).map(([x]) => x);
    return n.length ? n.sort().join('/') : (m.q(`ast_node[code](${id}, K, F, L)`)[0]?.[0] ?? id);
  };
  // THREE JOINED 2026-09-08 (w_class_expression) and every one is a CLASS
  // EXPRESSION's method or constructor: `Gantry` and `Hoist` are the two
  // constructors and `twice` is a `this.turn(n)` in a class that extends a class
  // expression. A class expression binds `this` exactly as a declaration does,
  // which is what makes them ordinary rows rather than a new question.
  // TWO MORE ON 2026-09-08 (w_decorator_replaces_its_target), both ordinary:
  // `hauls` reads `this.sling` — an auto-accessor — and `tucked` reads
  // `this.#tucked`. Neither is a new way of binding `this`; they are two more
  // methods in a class, which is what makes them a union and not a question.
  assert.deepEqual(m.q('this_host[flow](F, T)').map(([f]) => name(f)).sort(),
    ['Barrel', 'Box', 'Gantry', 'Hoist', 'both', 'both',
    'class_private_method', 'class_private_method', 'drift', 'get', 'hauls', 'hold',
    'make', 'read', 'relay', 'relay', 'show', 'static_block',
    'static_block', 'tucked', 'twice', 'value', 'value', 'value', 'value', 'value']);
  // AND THE DENOMINATOR. Written as a bound and not a number on 2026-09-08: it
  // was `this_over === 12`, which moves whenever the corpus grows a method — and
  // it moved in each of three branches on the same afternoon — while the CLAIM
  // it stands for is that some `this` has more than one candidate binder and the
  // `not this_nearer` literal chooses between them. That is a property, not a
  // count.
  assert.ok(m.n('this_over[flow](F, T)') > m.n('this_host[flow](F, T)'),
    'some `this` really does have more than one candidate, and nearest-wins discards the rest');
});

test('WHERE THE WALK CANNOT LOOK: a function the HOST calls', () => {
  // Asked of the rule before it was believed, which is the question that pays.
  // Five shapes were built; four are covered and the fourth is covered for a
  // reason worth naming — `valHelper`, reached only through `const ref = fn`,
  // is found because the VALUE layer resolves the alias, so this walk inherits
  // dataflow's reach for free.
  //
  // THE ONE THAT IS BLIND: a function passed to a host API and called by it.
  // `[1].map(cbBody)` never produces a call site the model can see, so `cbBody`
  // is not reachable and everything behind it is reported maybe-dead. That is
  // the DANGEROUS direction — a live function called dead — and no rule here can
  // close it: it needs a model of what `Array.prototype.map` does with its
  // argument, which is `w_env_api_surface`.
  //
  // Asserted rather than described, so the day the API surface lands this goes
  // red and says the limit is gone.
  const extra = `
function cbHelper(n) { return n; }
function cbBody(n) { return cbHelper(n); }
export function useCbHost() { return [1].map(cbBody); }
`;
  const r = new Rofl();
  const load = (name: string, text: string) => {
    const res = r.load(text);
    assert.ok(res.ok, `${name} REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  };
  // ONE LOAD, AND THE FACTS AFTER, which is what test/js-corpus-world.ts
  // records and this world was still doing the old way. `r.load()` EVALUATES,
  // under its own DEFAULT budget — so loading the packs onto a store that
  // already holds a hundred thousand AST facts runs a full fixpoint there, and
  // on 2026-09-08 this world outgrew that budget: `hole($load(2),
  // budget_exhausted)`, every later query `partial`, and zero rows. Zero rows
  // then read as `cbHelper is not reported maybe-dead`, which is the sentence
  // this test exists to deny. Raising `evaluate` to 200 M changed nothing,
  // because the wall was never `evaluate`'s.
  load('all packs', [read('boot.rofl'), ...FACTS.map(read),
    read('facts/js-controlflow.rofl'), ...RULES.map(read)].join('\n'));
  for (const [logical, disk] of FILES) {
    const src = read(disk) + (logical === 'alpha.mjs' ? extra : '');
    assert.ok(r.assert(scan(src, { file: logical }).facts.join('\n')).ok);
  }
  r.evaluate(20_000_000);
  // THE QUERY CARRIES ITS OWN BUDGET AND THIS TEST NEVER READ `partial`, which
  // made its central assertion unfalsifiable in the wrong direction. `query`
  // re-ensures under the DEFAULT budget whatever `evaluate` was given, and this
  // world — the whole corpus plus three appended functions — outgrew it on
  // 2026-09-08. Every query then came back `partial: true` with a
  // `hole(budget_exhausted)` and ZERO ROWS, and zero rows read as `cbHelper is
  // not reported maybe-dead`, which is exactly the sentence this test exists to
  // deny. An empty answer is a fact about the tool until shown otherwise, and
  // this file had shown otherwise about a DIFFERENT tool two hundred lines up.
  // Second instance in two iterations, after `mutant 8` in
  // test/js-callgraph.test.ts.
  const BUDGET = 40_000_000;
  const ask = (lit: string) => {
    const res = r.query(lit, { budget: BUDGET });
    assert.equal(res.partial, false, `query ${lit} hit a budget — the answer is about the tool`);
    return res;
  };
  const rows = ask('may_not_be_reached[code](F)').rows;
  const names = new Set(rows.flatMap((row) => {
    const f = row.bindings.F ?? '';
    return ask(`fn_name[code](${f}, N)`).rows.map((x) => unq(x.bindings.N ?? ''));
  }));
  assert.ok(names.size > 0, 'positive control: the walk reports somebody');
  assert.equal(names.has('cbHelper'), true,
    'a live function is reported maybe-dead: the host-callback limit is still open');
  assert.equal(names.has('cbBody'), false,
    'positive control: cbBody itself is not even in the denominator, nothing calls it');
});

test('may_not_run is a MAY-set: it covers what stayed silent and over-covers on purpose', async () => {
  const m = base();
  const mayNotRun = new Set(m.q('may_not_run[code](F)')
    .flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  // THREE functions, and the runtime enters two of them. A may-set that named
  // only the one that stayed silent would be a MUST-analysis wearing this
  // relation's name, and it would be wrong the first time a loop ran zero times.
  // FIVE now, not three: the control constructs added on 2026-09-05 brought a
  // `while` body and a `catch` handler, and both are arms that may be skipped.
  // The runtime enters four of the five.
  // SEVEN on 2026-09-06: `r_abrupt` reads statement ORDER, and the two new names
  // are the only two callees in the corpus that sit after a `return` in their
  // own statement list — `neverReached` after a plain return, `neverCased` after
  // a return inside a switch case, whose statements live under `consequent` and
  // were invisible to the first draft of the rule.
  // EIGHT on 2026-09-06 with the reachability fixture: `sleeper`'s only call
  // site is a guard arm, so the LOCAL rule already covers it. `dormant` — the
  // function behind it — is NOT here, and its absence is the whole point of
  // w_cf_reachability: nothing guards the call to `dormant`, so `may_not_run`
  // says it runs. Only the transitive relation says otherwise.
  // ELEVEN on 2026-09-06 with the exception fixtures, and the three new names
  // are three different reasons: `after` follows a call that always throws (the
  // gap this layer carried since it landed), `unlit` follows `super(n)` into a
  // constructor that always throws, and `label` is called only from inside a
  // catch arm — a guard, so the LOCAL rule covers it and the runtime enters it
  // anyway, which is what a may-set is for.
  // TWELVE with the accessor fixture: `unreadable` follows `void gauge.broken`,
  // a READ with no call syntax anywhere at the site whose getter always throws.
  // That name is the whole content of w_cf_accessor, and it is here rather than
  // in a count because the site looks like a property access.
  // FIFTEEN on 2026-09-07 with the SUSPENSION, and the three new names are one
  // answer and two consequences of it.
  //
  // `afterStall` is the item: it is called after `await unsettled`, a promise
  // nothing ever resolves, and the runtime never enters it. Before this the
  // layer WAIVED suspensions with the reason `control returns so the site still
  // runs` — a claim about the program, not the language — and this very
  // assertion is where it went red: a function the model calls, the runtime
  // never entered, and nothing explained.
  //
  // `alef` and `pickedB` ARE ENTERED BY THE RUNTIME and are on this list on
  // purpose, which is what makes it a may-set rather than a claim. `alef`'s one
  // remaining unguarded site is `return awaited(n)` in `useAwait`, which sits
  // after `await mkAlef()`; `pickedB`'s is after a `yield`. Both would be
  // unreachable if the promise never settled or the consumer never asked for
  // another value, and neither is something this layer can decide. Over-covering
  // in the safe direction is what `may_not_run` is documented to be — the
  // dangerous direction is a live function reported dead by a set that is too
  // NARROW.
  // THIRTY ON 2026-09-08, AND THE NUMBER IS A MERGE OF TWO PARALLEL BRANCHES.
  // `fallbackMaker` arrives from w_destructuring_rest_and_spread: it is called
  // nowhere except inside a parameter's DEFAULT VALUE, and a default runs only
  // when the argument is absent — measured at run time, two calls to the same
  // defaulted function ran the default exactly ONCE. The other thirteen arrive
  // from w_labelled_control and w_inert_statements, and not one of them is a new
  // KIND of answer: each is a call placed in a position under study so that a
  // statement, which has no name, can be read back by the name of what it calls.
  // Four say something only a label can — `pastLabelledBreak`,
  // `pastLabelledContinue`, `pastLabelledBlock` and
  // `pastConditionalLabelledBreak` follow a transfer that leaves a statement
  // further out than the reference's own list — and `pastLabelledBlock` is the
  // one that was WRONG rather than missing: a labelled block is not a loop body
  // and not an arm, so before the rule the model said it runs.
  //
  // THIS LIST IS WHY THE PINS ARE SETS. Two branches grew it independently and
  // the merge is a UNION, which is computable and was computed. Had it been
  // `assert.equal(mayNotRun.size, 17)` against `... 29`, both numbers would have
  // been right on their own branch, neither right here, and nothing in the
  // conflict would have said what the third number was.
  // FROM THREE BRANCHES, AND THE MERGE IS A UNION. `bumpedInUpdate` is called
  // from a `for`'s UPDATE, which had no `guard_kind` row at all until
  // w_update_and_literals, and `seenUpdate` is its control from the body next
  // door. `burnished`, `inked`, `minted`, `punched`, `scored`, `stamped` and
  // `struck` are each called from a NON-STATIC class field initialiser, which
  // runs once per construction and never if the class is never constructed —
  // `sealed`, the STATIC field's callee, is deliberately not here, and that
  // split was measured by running the shape. Not one branch could see the
  // others; the three lists merged by name without a decision.
  // SEVEN MORE ON 2026-09-09 (w_cf_completion), and every one of them is a
  // position `r_abrupt` was structurally unable to look at: it read SIBLINGS, so
  // an abrupt transfer that completes an ENCLOSING region reached nothing.
  // `pastNestedReturn` and `pastTailBlock` follow a nested block that returns
  // (`pastInnerDead` is inside one, after the return); `pastDoubleBlock` follows
  // two nested blocks, which is the arm being a closure rather than one lift;
  // `pastBothArms` and `pastElseIf` follow an `if` and an `else if` chain whose
  // every arm returns; `pastLabelledReturn` follows a labelled block that
  // returns, which the labelled arm cannot reach because there is no reference
  // to walk from. The nine controls beside them — `pastOneArm`,
  // `pastGuardedBlock`, `pastElseIfOpen`, `pastLabelledEscape` and the five
  // deferred statement kinds — are deliberately NOT here, and mutants c4, c5 and
  // c6 in test/js-controlflow.test.ts put each of them here on demand.
  assert.deepEqual([...mayNotRun].sort(), [
    'after', 'afterStall', 'alef', 'bet', 'beyondPlainBreak',
    'bumpedInUpdate', 'burnished', 'fallbackMaker', 'guardedElse', 'inked',
    'label', 'loopBody', 'minted', 'neverCased', 'neverReached',
    'pastBlockBreak', 'pastBothArms', 'pastBreak',
    'pastConditionalLabelledBreak', 'pastContinue', 'pastDebugger',
    'pastDoubleBlock', 'pastElseIf', 'pastEmpty', 'pastInnerBreak',
    'pastInnerDead', 'pastInnerLabel', 'pastLabelledBlock',
    'pastLabelledBreak', 'pastLabelledContinue', 'pastLabelledReturn',
    'pastNestedReturn', 'pastPlainBreak', 'pastTailBlock', 'pickedB',
    'punched', 'reading', 'rescue', 'scored', 'seenUpdate', 'sleeper',
    'stamped', 'struck', 'unlit', 'unreached', 'unreadable',
  ]);
  const reached = new Set(m.q('may_not_be_reached[code](F)')
    .flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  // TWO now, and they are two different shapes of the same relation. `dormant`
  // is called UNGUARDED from a function that may never run — the chain
  // w_cf_reachability was closed on. `lateThrow` is called unguarded from
  // `boom`, and `boom` is RETURNED rather than called, so nothing reaches it at
  // all: unreachability with no guard anywhere in it. The local rule says both
  // run; only the walk says otherwise, and it says so for two distinct reasons.
  assert.deepEqual([...reached].filter((f) => !mayNotRun.has(f)).sort(),
    ['dormant', 'lateThrow'],
    'the transitive relation adds exactly the functions the local one claims run');

  const dir = new URL('test/fixtures/js-call/', new URL('../', import.meta.url));
  const alpha: any = await import(new URL('alpha.mjs', dir).href);
  const beta: any = await import(new URL('beta.mjs', dir).href);
  const t: any = await import(new URL('trace.mjs', dir).href);
  await alpha.main();
  beta.bmain();
  // the default export is an ENTRY POINT and nothing in beta.mjs calls it, so
  // the consumer is what makes it run — here, as in any importing module.
  beta.default(2);
  // NORMALISED, for the same reason the two call-graph acceptances are: V8 names
  // a getter's frame `get broken` and the model names the node `broken`. Without
  // this the getter reads as a function the model calls and the runtime never
  // entered — a silence with no explanation — when the runtime entered it twice.
  const strip = (n: string) => n.replace(/^(get|set) /, '');
  const ran = t.oracle.measured ? new Set([...t.oracle.measured()].map(strip)) : new Set(
    t.oracle.edges().map((e: any) => strip(e.callee)));

  // THE ACCEPTANCE: everything the model derives an edge to, and the runtime
  // never entered, must be either a may-not-run (control flow explains it) or
  // the named value decoy. A silent function explained by neither is a call the
  // model claims and nothing accounts for.
  // RESTRICTED TO THE FILES THAT RUN. `shapes.ts` is scanned and never
  // executed, so every callee it names is silent for a reason that has nothing
  // to do with control flow — the first draft of this assertion listed five of
  // them and looked like a real hole.
  const RUN = ['alpha.mjs', 'beta.mjs', 'gamma.mjs', 'delta.mjs'];
  const derived = new Set(m.q('calls_in[code](File, A, B)')
    .filter(([file]) => RUN.includes(file)).map(([, , b]) => b));
  const silent = [...derived].filter((f) => !ran.has(f)).sort();
  // `pickA` — the fixture's value decoy, instrumented and never called — does
  // NOT appear here, and its absence is the stronger statement: the model does
  // not derive an edge to it at all, because `two[pickA]()` reads the VALUE of
  // `pickA` and reaches `pickB`. A silence the call graph already avoids
  // claiming needs no control-flow excuse.
  // ONE NAMED EXCEPTION, and the interesting part is that its OWNER CHANGED.
  // This block used to read `w_cf_abrupt_transfer` and predicted, in as many
  // words, that "the day the abrupt work lands this assertion goes red and says
  // the gap is closed". The abrupt work landed on 2026-09-06 and this stayed
  // green, because the prediction was wrong about the cause: `after` is called
  // immediately after a `throw`, but not in the same statement list — it is
  // called INSIDE `thrower`'s caller, after a call that never returns. That is
  // exception PROPAGATION across a call edge, which no rule reading syntax
  // positions can reach, and `w_exn_propagation` owns it.
  // The correction is the finding, not the relabelling: a gap attributed to the
  // queue item that happened to be open is a guess, and it survives until
  // something forces it to be measured. Closing the item was that force.
  const EXN_GAP = ['after'];
  // ...and the acceptance reads the TRANSITIVE relation, because `dormant` is
  // silent and only that one explains it. The local set is asserted above and
  // stays the layer's published answer; this is the stronger relation doing the
  // work, which is the same lesson the switch-case field taught one item ago.
  const unexplained = silent.filter((f) => !reached.has(f) && !EXN_GAP.includes(f));
  assert.deepEqual(silent.filter((f) => EXN_GAP.includes(f)), EXN_GAP,
    'the propagation witness is still silent — if it is not, w_exn_propagation moved');
  console.log(`  derived ${derived.size} callees, ${silent.length} never entered: ${silent.join(', ')}`);
  assert.deepEqual(unexplained, [],
    'a function the model calls, the runtime never entered, and nothing explains');
  assert.ok(silent.length > 0, 'positive control: something really did stay silent');
});
