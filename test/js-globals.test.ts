// js-globals.test.ts — THE ES GLOBALS, WHICH IS THE HALF OF THE STANDARD
// LIBRARY THAT IS NOT A PROTOTYPE (w_es_globals, 2026-09-09).
//
// test/js-lib-surface.test.ts attributes `array.at` and `string.replaceAll` —
// a member call whose RECEIVER has a known prototype. It says nothing about
// `JSON.parse`, `Promise.all`, `Object.entries` or `Math.max`, because those
// hang off a GLOBAL BINDING and a binding is not a receiver. Measured over the
// five files of test/fixtures/js-call before a line was written: ten stdlib
// calls, ten attributed, and NOT ONE static of an ES global in the corpus.
//
// SO THE CORPUS GREW BY ONE FILE, and every site in it is named in the
// fixture's own header. It is `test/fixtures/js-globals/globals.mjs.txt` rather
// than a sixth `.mjs` in test/fixtures/js-call, because test/js-modules.test.ts
// imports every `.mjs` in that directory with node and compares default exports
// set-for-set — a sixth module there is another branch's oracle changing under
// it.
//
// EVERY NAMED SET IN THIS FILE IS SCOPED TO globals.mjs, the file this branch
// owns. The corpus-wide claims are IDENTITIES between relations — a partition,
// a subset — which no branch can move by editing alpha.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import {
  scanLib, scanGlobals, scanStatics, libSources, emitGlobals, PROTOTYPES,
} from '../scanners/ts_lib.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LIB = path.join(ROOT, 'node_modules', 'typescript', 'lib');
const GLOBALS = 'facts/js-globals.rofl';

const FIX = 'test/fixtures/js-call/';
/** the five files every other corpus test builds on, plus the one this branch
 *  added. `globals.mjs` is a LOGICAL name; the file on disk is `.txt`. */
const FILES: [string, string][] = [
  ['alpha.mjs', FIX + 'alpha.mjs'], ['beta.mjs', FIX + 'beta.mjs'],
  ['gamma.mjs', FIX + 'gamma.mjs'], ['delta.mjs', FIX + 'delta.mjs'],
  ['shapes.ts', FIX + 'shapes.ts.txt'],
  ['globals.mjs', 'test/fixtures/js-globals/globals.mjs.txt'],
];
const MINE = 'globals.mjs';
const PACKS = [
  'boot.rofl',
  'facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
  'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
  'facts/js-controlflow.rofl', 'facts/js-lib-surface.rofl', GLOBALS,
  'facts/js-env.rofl',
  'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
  'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl', 'rules/js-env.rofl',
  'rules/js-env-api.rofl', 'rules/js-globals.rofl',
];
const RULES = 'rules/js-globals.rofl';
const BUDGET = { budget: 900_000_000 };
const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

type Mut = { file: string; find: string; replace: string };
interface World {
  q: (l: string) => string[][];
  /** the unguarded query, for the two places that ask whether a relation can be
   *  populated at all rather than what it holds. */
  ask: (l: string) => { rows: unknown[]; unpopulatable?: boolean; partial: boolean };
  /** which file a node id belongs to — the join `query` cannot make, because it
   *  takes ONE literal. Built once per world from `ast_node`. */
  fileOf: (n: string) => string;
}

function buildRaw(packs: string[] = PACKS, muts: Mut[] = [],
                  files: [string, string][] = FILES): Rofl {
  const r = new Rofl();
  const texts = packs.map((f) => {
    let t = read(f);
    for (const m of muts) if (m.file === f) {
      assert.ok(t.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
      t = t.replace(m.find, m.replace);
    }
    return t;
  });
  // THE PACKS LOAD BEFORE THE FACTS, which is not a style choice: asserting the
  // AST facts first makes `r.load()` run a full fixpoint under its own default
  // budget, and test/js-corpus-world.ts measured that at 16.9 s against 10.0 s
  // for this order. It is also what stopped a world coming back empty and being
  // read as a claim (f_an_empty_answer_is_a_fact_about_the_instrument).
  const res = r.load(texts.join('\n'));
  assert.ok(res.ok, `world REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  for (const [logical, disk] of files) {
    const a = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(a.ok, `${logical} facts REJECTED:\n${a.diagnostics.slice(0, 3).join('\n')}`);
  }
  r.evaluate(40_000_000);
  return r;
}

function wrap(r: Rofl): World {
  const q = (lit: string): string[][] => {
    const out = r.query(lit, BUDGET);
    assert.equal(out.error, undefined, `query ${lit}: ${out.error}`);
    assert.equal(out.partial, false, `query ${lit} hit a budget`);
    // AN EMPTY ANSWER FROM A MISSPELLED RELATION IS INDISTINGUISHABLE FROM AN
    // EMPTY ANSWER OTHERWISE, and this file asks a dozen relations that are
    // legitimately empty. `unpopulatable` is the only thing that tells them
    // apart; two of this repository's era controls were written with the wrong
    // arity and came back green until it was read.
    assert.equal(out.unpopulatable, false, `query ${lit} is UNPOPULATABLE — nothing here can answer it`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return out.rows.map((row) => order.map((v) => unq(String(row.bindings[v] ?? ''))));
  };
  const files = new Map<string, string>();
  for (const [n, , f] of q('ast_node[code](N, K, File, L)')) files.set(n, f);
  return { q, ask: (l) => r.query(l, BUDGET), fileOf: (n) => files.get(n) ?? '<no node>' };
}

const build = (muts: Mut[] = [], packs: string[] = PACKS,
               files: [string, string][] = FILES): World =>
  wrap(buildRaw(packs, muts, files));

let BASE: World | undefined;
const base = () => (BASE ??= build());

/** a set of rows from globals.mjs, deduplicated and sorted. THE FILE FILTER IS
 *  THE POINT: an element that named a row in alpha.mjs would be this branch
 *  pinning another branch's file, which is the second of the three ways a
 *  "named set" turns out not to be one. */
const mine = (w: World, lit: string, render: (r: string[]) => string): string[] =>
  [...new Set(w.q(lit).filter((r) => w.fileOf(r[0]) === MINE).map(render))].sort();

// ---------------------------------------------------------------------------
// 1. THE SCANNER

test('the globals pack is generated, and regenerating it changes nothing', () => {
  // A GENERATED PACK THAT NOBODY REGENERATES IS A HAND-WRITTEN PACK with a
  // misleading header — the same ritual test/js-lib-surface.test.ts performs on
  // the prototype half, for the same reason: compare, do not promise.
  const sources = libSources(LIB);
  const globals = scanGlobals(LIB, sources);
  assert.equal(emitGlobals(globals, scanStatics(LIB, sources, globals)), read(GLOBALS),
    'facts/js-globals.rofl is out of date — run `node --experimental-strip-types scanners/ts_lib.ts`');
});

test('a global is dated by the earliest release that declares it, in four forms', () => {
  const globals = new Map(scanGlobals(LIB).map((g) => [g.name, g]));
  // SPOT CHECKS ACROSS FOUR ERAS AND ALL FOUR FORMS. The claim is not "there
  // are 47 rows" — a count says nothing about whether the release is right.
  assert.equal(globals.get('Object')?.since, 'es5');
  assert.equal(globals.get('Promise')?.since, 'es2015');
  assert.equal(globals.get('BigInt')?.since, 'es2020');
  assert.equal(globals.get('WeakRef')?.since, 'es2021');
  assert.equal(globals.get('Promise')?.form, 'constructor_binding');
  assert.equal(globals.get('Math')?.form, 'namespace_object');
  assert.equal(globals.get('JSON')?.form, 'namespace_object');
  assert.equal(globals.get('Reflect')?.form, 'namespace_block');
  assert.equal(globals.get('NaN')?.form, 'plain_value');
  assert.equal(globals.get('Reflect')?.file, 'lib.es2015.reflect.d.ts');
  // ...AND THE ONE THE SOURCE CANNOT DATE. `globalThis` is a compiler
  // intrinsic: no lib.es*.d.ts declares it, so the scanner emits no row rather
  // than inventing a release. This is the measured absence, as an assertion.
  assert.equal(globals.get('globalThis'), undefined,
    'no ecmascript lib file declares globalThis; a row for it would be invented');
  // POSITIVE CONTROL on the sweep: every prototype the model can name a
  // receiver for is also a global, which is what makes the bridge total on its
  // own side.
  for (const name of PROTOTYPES.keys())
    assert.ok(globals.has(name), `${name} is a prototype the model names and not a global here`);
});

test('a static is dated separately from its binding, and its shape is read not asserted', () => {
  const sources = libSources(LIB);
  const statics = new Map(scanStatics(LIB, sources).map((s) => [`${s.global}.${s.member}`, s]));
  // THE BINDING AND THE STATIC ARE TWO QUESTIONS, and `Symbol` is where that is
  // visible: the binding is es2015 and `Symbol.asyncIterator` is es2018.
  assert.equal(statics.get('Symbol.asyncIterator')?.since, 'es2018');
  assert.equal(statics.get('Object.keys')?.since, 'es5');
  assert.equal(statics.get('Object.entries')?.since, 'es2017');
  assert.equal(statics.get('Object.hasOwn')?.since, 'es2022');
  assert.equal(statics.get('Promise.allSettled')?.since, 'es2020');
  // ...AND THE NAMESPACE BLOCK IS REACHED, which a walk that only reads
  // `declare var` would miss entirely.
  assert.equal(statics.get('Reflect.ownKeys')?.since, 'es2015');
  // CALLABLE AND DATA, TAKEN FROM THE DECLARATION. A MethodSignature is a call
  // and a PropertySignature is a key, and `Symbol` carries one of each.
  assert.equal(statics.get('Symbol.for')?.shape, 'callable');
  assert.equal(statics.get('Symbol.iterator')?.shape, 'data');
  assert.equal(statics.get('Math.max')?.shape, 'callable');
  assert.equal(statics.get('Math.PI')?.shape, 'data');
  // A NAMESPACE OBJECT HAS NO CONSTRUCTOR AND THEREFORE NO `XConstructor`
  // INTERFACE, so its statics come from the interface of its own name. Without
  // the form being recorded there would be nothing to look them up under.
  assert.equal(statics.get('JSON.parse')?.since, 'es5');
  // ...AND A PLAIN VALUE HAS NO STATICS AT ALL.
  assert.deepEqual(scanStatics(LIB, sources).filter((s) => s.global === 'NaN'), []);
});

test('no static in the ecmascript libs is deprecated, and the prototypes disagree', () => {
  // THE RATIO IS THE FINDING RATHER THAN THE FIXTURE, which is the same shape
  // test/js-lib-surface.test.ts records for `lib_replaced_by`. Seventeen
  // `@deprecated` members on the eight prototypes; ZERO across the whole static
  // surface. So the globals pack declares no `lib_static_deprecated` relation:
  // the set is empty in the SOURCE, not merely empty here.
  assert.deepEqual(scanStatics(LIB).filter((s) => s.deprecated).map((s) => `${s.global}.${s.member}`), []);
  assert.equal(scanLib(LIB).filter((m) => m.deprecated).length, 17,
    'the prototype half still has seventeen, so the zero above is a contrast and not a blind walk');
  assert.ok(!read(GLOBALS).includes('lib_static_deprecated'),
    'no relation is emitted for a set the source does not have');
});

// ---------------------------------------------------------------------------
// 2. THE BINDING SURFACE, IN THE CORPUS

test('a free name is a global, and a name the file binds is not', () => {
  const b = base();
  assert.deepEqual(mine(b, 'free_global[code](E, Name, File)', ([, n]) => n),
    ['BigInt', 'Error', 'JSON', 'Map', 'Math', 'Object', 'Promise', 'Reflect', 'Symbol',
     'console', 'globalThis']);
  // THE NEGATIVE CONTROL, AND IT IS WHAT MAKES THE LINE ABOVE MEAN ANYTHING.
  // globals.mjs binds a local `Set` and calls `Set.of(rows)`; `Set` IS an ES
  // global and this one is not a reference to it. Without `not declares_name`
  // the set above would carry it and every other assertion would still pass.
  assert.ok(!mine(b, 'free_global[code](E, Name, File)', ([, n]) => n).includes('Set'),
    'a locally bound name that shadows a global is not a global reference');
  // ...and the same file DOES construct a `Map`, so the exclusion is about the
  // binding and not about the fixture failing to mention collections.
  assert.deepEqual(mine(b, 'es_global_construct[code](X, Name, Rel)', ([, n, r]) => `${n} ${r}`),
    ['Map es2015', 'Math es5']);
});

test('ECMAScript declares it, or the audit says the runtime must', () => {
  const b = base();
  assert.deepEqual(mine(b, 'es_global[code](E, Name, Rel, Form)', ([, n, r, f]) => `${n} ${r} ${f}`),
    ['BigInt es2020 constructor_binding',
     'Error es5 constructor_binding', 'JSON es5 namespace_object',
     'Map es2015 constructor_binding', 'Math es5 namespace_object',
     'Object es5 constructor_binding', 'Promise es2015 constructor_binding',
     'Reflect es2015 namespace_block', 'Symbol es2015 constructor_binding']);
  // THE RESIDUE, AND IT IS THE RUNTIME HALF'S IN-TRAY RATHER THAN A DEFECT.
  // `console` is the host's. `globalThis` is a compiler intrinsic no
  // lib.es*.d.ts declares, so the model's silence about it here is the same
  // measured absence the scanner test asserts, seen from the corpus side.
  assert.deepEqual(mine(b, 'global_unattributed[audit](E, Name)', ([, n]) => n),
    ['console', 'globalThis']);
});

test('the two halves partition the free names, over the WHOLE corpus', () => {
  // AN IDENTITY RATHER THAN A SET, because this claim ranges over five files
  // this branch does not own. Every free global is attributed or is in the
  // audit, never both and never neither — which is the property a runtime
  // table has to be able to rely on when it joins the audit.
  const b = base();
  const free = new Set(b.q('free_global[code](E, Name, File)').map(([e, n]) => `${e} ${n}`));
  const es = new Set(b.q('es_global[code](E, Name, Rel, Form)').map(([e, n]) => `${e} ${n}`));
  const un = new Set(b.q('global_unattributed[audit](E, Name)').map(([e, n]) => `${e} ${n}`));
  assert.ok(free.size > 0, 'positive control: the corpus has free globals at all');
  assert.deepEqual([...es].filter((x) => un.has(x)), [], 'nothing is both attributed and not');
  assert.deepEqual([...free].filter((x) => !es.has(x) && !un.has(x)), [], 'and nothing is neither');
  assert.equal(es.size + un.size, free.size, 'so the two are a partition of the free names');
  // ...AND THE OTHER FIVE FILES CONTRIBUTE, which is the positive control on
  // the file filter every other assertion here uses. Stated as "some row is
  // outside globals.mjs" rather than as a list, so no edit to alpha.mjs moves it.
  assert.ok([...free].some((x) => b.fileOf(x.split(' ')[0]) !== MINE),
    'the corpus outside this branch\'s fixture has free globals too');
});

test('WHERE THIS CANNOT LOOK: a global that is neither a receiver nor a callee', () => {
  // THE CEILING, AS A ROW THAT IS ABSENT ON PURPOSE. `global_ref_position` names
  // five positions; a bare mention is not one of them, so `n > 0 ? n : Infinity`
  // in globals.mjs derives nothing at all. Asserted by name so that the limit is
  // stated rather than discovered, and so that widening the table would have to
  // come here and say so.
  const b = base();
  assert.ok(!mine(b, 'free_global[code](E, Name, File)', ([, n]) => n).includes('Infinity'),
    'a bare reference is outside the position table, and the fixture has one');
  // POSITIVE CONTROL THAT THE FIXTURE REALLY MENTIONS IT — an absent row and an
  // absent SITE look identical, which is exactly how a ceiling becomes a lie.
  assert.ok(read('test/fixtures/js-globals/globals.mjs.txt').includes(': Infinity;'),
    'the fixture mentions Infinity outside any reference position');
  // ...and `Infinity` is in the surface, so the silence is the position table's
  // and not the library's.
  assert.ok(read(GLOBALS).includes('lib_global("Infinity", es5, plain_value).'));
});

// ---------------------------------------------------------------------------
// 3. THE STATIC SURFACE

test('a static is attributed to a member of a named global, and dated', () => {
  const b = base();
  assert.deepEqual(mine(b, 'es_static[code](N, Name, Key, Rel)', ([, n, k, r]) => `${n}.${k} since ${r}`),
    ['JSON.parse since es5', 'JSON.stringify since es5',
     'Math.PI since es5', 'Math.max since es5',
     'Object.entries since es2017', 'Object.hasOwn since es2022', 'Object.keys since es5',
     'Promise.allSettled since es2020', 'Promise.any since es2021',
     'Reflect.ownKeys since es2015', 'Symbol.for since es2015', 'Symbol.iterator since es2015']);
  // A WELL-KNOWN SYMBOL IS A KEY AND NOT A CALL, and so is a constant. Read out
  // of TypeScript's declaration — PropertySignature against MethodSignature —
  // rather than asserted here. `Symbol` carries one of each, which is what makes
  // this a distinction rather than a per-global label.
  assert.deepEqual(mine(b, 'es_static_key[code](N, Name, Key)', ([, n, k]) => `${n}.${k}`),
    ['Math.PI', 'Symbol.iterator']);
  assert.deepEqual(mine(b, 'es_static_call[code](C, Name, Key, Rel)', ([, n, k]) => `${n}.${k}`),
    ['JSON.parse', 'JSON.stringify', 'Math.max', 'Object.entries', 'Object.hasOwn',
     'Object.keys', 'Promise.allSettled', 'Promise.any', 'Reflect.ownKeys', 'Symbol.for']);
});

test('a member of a known global that ECMAScript does not declare is named', () => {
  // THE MIRROR OF `stdlib_unattributed[audit]`, and unlike it this one is NOT
  // empty. `Error.captureStackTrace` is V8's — TypeScript declares it in
  // @types/node and nowhere in lib.es*.d.ts — so it is a HOST extension of a
  // language global, which is one of exactly three things this row can be and
  // the audit does not guess which.
  assert.deepEqual(mine(base(), 'es_static_unattributed[audit](N, Name, Key)', ([, n, k]) => `${n}.${k}`),
    ['Error.captureStackTrace']);
});

test('a form that cannot be constructed, constructed', () => {
  // THE FOUR FORMS USED RATHER THAN RECORDED. `new Math()` is a TypeError and
  // the model can say WHY: `Math` is a `namespace_object`, TypeScript declares
  // no `MathConstructor`, and only a `constructor_binding` has one. Averaging
  // the forms would have made this unstatable.
  assert.deepEqual(
    mine(base(), 'es_construct_not_constructor[audit](X, Name, Form)', ([, n, f]) => `${n} ${f}`),
    ['Math namespace_object']);
});

test('the prototype surface is a THIRD question, and the bridge is partial by construction', () => {
  const b = base();
  // THE BRIDGE COVERS EIGHT OF FORTY-SEVEN, because eight is what
  // `kind_prototype` in rules/js-dataflow.rofl can name a receiver for.
  assert.deepEqual(b.q('lib_global_prototype(Name, P)').map(([n, p]) => `${n}->${p}`).sort(),
    ['Array->array', 'BigInt->bigint', 'Boolean->boolean', 'Function->function',
     'Number->number', 'Object->object', 'RegExp->regexp', 'String->string']);
  // ...AND `Map` IS THE HOLE, AS A ROW. globals.mjs writes `const holder = new
  // Map(); holder.set(k, v)`. `holder.set` resolves to nothing in this program
  // and reaches no prototype either: `kind_prototype` has no arm for a
  // `new_expression`, so `stdlib_member[audit]` never fires and the call is
  // outside BOTH halves of the library. The missing bridge row is where that
  // shows, and it is a finding rather than a defect of this pack.
  assert.ok(!b.q('lib_global_prototype(Name, P)').some(([n]) => n === 'Map'));
  assert.deepEqual(
    b.q('stdlib_member[audit](C, P, Key)').filter((r) => b.fileOf(r[0]) === MINE), [],
    'no prototype-level residue in this fixture, because a `new` result has no prototype');
  // ...AND THE PROTOTYPE HALF IS UNMOVED BY ALL OF THIS, which is the claim
  // that matters to the branch that owns it: `stdlib_unattributed` was empty
  // before this pack existed and is empty with a sixth file in the corpus.
  assert.deepEqual(b.q('stdlib_unattributed[audit](C, P, Key)'), []);
});

// ---------------------------------------------------------------------------
// 4. THE ERA ANSWER

/** which globals / statics each environment cannot have, by name, from this
 *  branch's file only */
const unsupported = (w: World, lit: string, render: (r: string[]) => string): string[] => {
  const byEnv = new Map<string, Set<string>>();
  for (const row of w.q(lit)) {
    if (w.fileOf(row[1]) !== MINE) continue;
    if (!byEnv.has(row[0])) byEnv.set(row[0], new Set());
    byEnv.get(row[0])!.add(render(row));
  }
  return [...byEnv].map(([e, s]) => `${e}: ${[...s].sort().join(' ')}`).sort();
};

test('a static is gated by release, and four releases discriminate', () => {
  // FOUR STATICS AT FOUR RELEASES OFF TWO GLOBALS, which is what makes this a
  // comparison rather than a slope: es2017 has `Object.entries` and lacks
  // `Promise.allSettled`; es2020 has `allSettled` and lacks `Promise.any`;
  // es2021 has `any` and lacks `Object.hasOwn`. Each environment names a
  // different set, and no two are nested by accident.
  assert.deepEqual(unsupported(base(), 'es_static_unsupported[audit](E, N, Name, Key)',
    ([, , n, k]) => `${n}.${k}`), [
    'es2015: Object.entries Object.hasOwn Promise.allSettled Promise.any',
    'es2016: Object.entries Object.hasOwn Promise.allSettled Promise.any',
    'es2017: Object.hasOwn Promise.allSettled Promise.any',
    'es2020: Object.hasOwn Promise.any',
    'es2021: Object.hasOwn',
    'es5: Object.entries Object.hasOwn Promise.allSettled Promise.any '
      + 'Reflect.ownKeys Symbol.for Symbol.iterator',
  ]);
  // ts5 RANKS es2022 AND IS ABSENT FROM THAT LIST, which is the claim: the gate
  // asks whether the environment REACHES the release and does not flag a member
  // for looking new. es2023 is absent for the same reason.
  assert.ok(!unsupported(base(), 'es_static_unsupported[audit](E, N, Name, Key)',
    ([, , n, k]) => `${n}.${k}`).some((l) => l.startsWith('ts5:')));
});

test('the BINDING is gated too, and separately from its members', () => {
  // TWO SURFACES, TWO ANSWERS, ONE SCALE. `Map`, `Promise`, `Reflect` and
  // `Symbol` are es2015 bindings and only es5 lacks them; `BigInt` is es2020 and
  // four environments lack it — while `Object` is es5 and no environment lacks
  // the BINDING even though five lack `Object.hasOwn`. A model that answered the
  // binding and the static with one relation could not say that.
  assert.deepEqual(unsupported(base(), 'es_global_unsupported[audit](E, X, Name)',
    ([, , n]) => n),
    ['es2015: BigInt', 'es2016: BigInt', 'es2017: BigInt',
     'es5: BigInt Map Promise Reflect Symbol']);
});

test('called, constructed, and selected from are three things to do with a binding', () => {
  const b = base();
  // `BigInt(n)` CALLS the global, `new Map()` CONSTRUCTS it, `Math.max` SELECTS
  // from it. Merging them would lose the audit two tests above — a
  // `namespace_object` reached by `new` — and would tell an effect rule nothing
  // about which of the three happened.
  assert.deepEqual(mine(b, 'es_global_invoke[code](C, Name, Rel)', ([, n, r]) => `${n} ${r}`),
    ['BigInt es2020']);
  assert.deepEqual(mine(b, 'es_global_construct[code](X, Name, Rel)', ([, n, r]) => `${n} ${r}`),
    ['Map es2015', 'Math es5']);
  // ...and the three are disjoint on this fixture, which is what makes them
  // three relations rather than three readings of one.
  const inv = new Set(b.q('es_global_invoke[code](C, Name, Rel)').map(([c]) => c));
  const con = new Set(b.q('es_global_construct[code](X, Name, Rel)').map(([x]) => x));
  assert.deepEqual([...inv].filter((x) => con.has(x)), []);
});

// ---------------------------------------------------------------------------
// 5. THE TWO WORLDS, AND THE KERNEL SAYING SO

test('without the era pack the kernel names the missing half', () => {
  // THE SAME DEMONSTRATION rules/js-env-api.rofl carries, restated because this
  // pack has the same shape: the first four sections need only the call graph,
  // and the era verdict needs facts/js-env.rofl, which the call-graph world does
  // not load. Loading this pack without that one is bringing half a question,
  // and the kernel says which half through `unpopulatable` on the relation.
  const half = buildRaw(PACKS.filter((p) => p !== 'facts/js-env.rofl'));
  const env = half.query('environment(E)', BUDGET);
  assert.equal(env.rows.length, 0);
  assert.equal(env.unpopulatable, true, 'the kernel names the missing half');
  const gate = half.query('es_static_unsupported[audit](E, N, Name, Key)', BUDGET);
  assert.equal(gate.rows.length, 0);
  // ...AND THE HALF THAT DOES NOT NEED IT STILL ANSWERS, which is why the rules
  // are one pack rather than two: the attribution is unchanged and only the era
  // verdict is gone.
  const w = wrap(half);
  assert.deepEqual(mine(w, 'es_static[code](N, Name, Key, Rel)', ([, n, k]) => `${n}.${k}`),
    mine(base(), 'es_static[code](N, Name, Key, Rel)', ([, n, k]) => `${n}.${k}`));
});

test('without the globals FACTS the rules derive nothing and say so', () => {
  // A PACK OF RULES WITH NO TABLE IS NOT A PACK THAT IS QUIETLY WRONG. Every
  // relation in section 3 onward reads `lib_global`, so without the generated
  // facts the corpus half still stands — `free_global` is derived from the AST
  // alone — and everything past it is empty rather than misleading.
  const half = wrap(buildRaw(PACKS.filter((p) => p !== GLOBALS)));
  assert.ok(mine(half, 'free_global[code](E, Name, File)', ([, n]) => n).length > 0,
    'the corpus half needs no library at all');
  assert.equal(half.q('es_global[code](E, Name, Rel, Form)').length, 0);
  // AND THE AUDIT INVERTS, which is the tell a reader can act on: with no
  // surface, every free name is unattributed.
  assert.deepEqual(mine(half, 'global_unattributed[audit](E, Name)', ([, n]) => n),
    ['BigInt', 'Error', 'JSON', 'Map', 'Math', 'Object', 'Promise', 'Reflect', 'Symbol',
     'console', 'globalThis']);
});

// ---------------------------------------------------------------------------
// 6. THE MUTANTS

test('MUTANT 1 — the member position leaves the reference table', () => {
  // TARGET: `the ceiling of this pack is the position table`. Drop the member
  // object and every static goes, while the callee positions keep answering —
  // which separates the two halves of `global_ref` rather than killing the pack.
  const m = build([{ file: RULES, find: 'global_ref_position(member_expression, object).',
    replace: '' }]);
  assert.deepEqual(mine(m, 'es_static[code](N, Name, Key, Rel)', ([, n, k]) => `${n}.${k}`), []);
  assert.deepEqual(mine(m, 'global_unattributed[audit](E, Name)', ([, n]) => n), [],
    'and `console` goes with it, being a receiver and not a callee');
  // ITS OWN SIGNATURE: the constructions survive, so this is a position lost
  // and not a pack switched off.
  assert.deepEqual(mine(m, 'es_global_construct[code](X, Name, Rel)', ([, n]) => n),
    ['Map', 'Math']);
});

test('MUTANT 2 — a bound name is no longer a bound name', () => {
  // TARGET: `a name the file declares is not a global`. Drop the negation and
  // the local `Set` in globals.mjs is reported as the ES global `Set`, dated
  // es2015 — a false attribution rather than a missing one, which is the
  // direction this relation is written to avoid.
  const m = build([{ file: RULES,
    find: 'free_global[code](E, Name, File) :- global_ref[code](E, Name, File),\n'
        + '                                    not declares_name[code](Name, File).',
    replace: 'free_global[code](E, Name, File) :- global_ref[code](E, Name, File).' }]);
  assert.ok(mine(m, 'es_global[code](E, Name, Rel, Form)', ([, n, r]) => `${n} ${r}`)
    .includes('Set es2015'), 'the shadowing local is attributed to the standard library');
  // ...AND THE CORPUS'S OWN CLASSES GO WITH IT, which is the same defect where
  // it would do real damage: every `Box`, `Vat` and `Crate` becomes a free name.
  assert.ok(m.q('global_unattributed[audit](E, Name)').length
          > base().q('global_unattributed[audit](E, Name)').length,
    'and the residue audit fills with names this program declares');
});

test('MUTANT 3 — the pattern arm of the declaration walk is withdrawn', () => {
  // TARGET: `a name a PATTERN introduces is bound too`. A declarator whose `id`
  // is an object_pattern has no `ast_name`, so without this arm every
  // destructured local reads as a global. The corpus has many; the fixture has
  // none, so this mutant is killed by the RESIDUE growing, over the whole
  // corpus, rather than by a set from this branch's file.
  const m = build([{ file: RULES,
    find: 'declares_name[code](Name, File) :- declaring_position(K, Field),\n'
        + '                                   ast_node[code](D, K, File, _),\n'
        + '                                   ast_child[code](D, Field, 0, I),\n'
        + '                                   ast_within[code](I, X), ast_name[code](X, Name).',
    replace: '' }]);
  const grew = new Set(m.q('global_unattributed[audit](E, Name)').map(([, n]) => n));
  const had = new Set(base().q('global_unattributed[audit](E, Name)').map(([, n]) => n));
  assert.ok([...grew].some((n) => !had.has(n)),
    `KILLED: names a pattern binds are reported as globals; ${[...grew].sort().join(' ')}`);
});

test('MUTANT 4 — the static join is withdrawn', () => {
  const m = build([{ file: RULES,
    find: 'es_static[code](N, Name, Key, Rel) :- es_global[code](O, Name, _, _),',
    replace: 'es_static_unused[code](N, Name, Key, Rel) :- es_global[code](O, Name, _, _),' }]);
  // KILLED BY `unpopulatable`, WHICH IS THE STRONGER SIGNATURE. With the head
  // renamed nothing in the world can conclude `es_static` at all, so the kernel
  // distinguishes `no static matched` from `nothing here can be a static` — and
  // that is the difference between a mutant this file catches and an empty
  // answer it would have read as a claim.
  assert.equal(m.ask('es_static[code](N, Name, Key, Rel)').unpopulatable, true);
  assert.deepEqual(m.ask('es_static_key[code](N, Name, Key)').rows, [],
    'and the key/call split goes with it, being derived from it');
  // ITS OWN SIGNATURE: the residue audit does not read `es_static`, so it still
  // reports `Error.captureStackTrace`. A mutant that emptied everything could
  // be a world that failed to load.
  assert.deepEqual(mine(m, 'es_static_unattributed[audit](N, Name, Key)', ([, n, k]) => `${n}.${k}`),
    ['Error.captureStackTrace']);
});

test('MUTANT 5 — the residue audit stops subtracting what it attributed', () => {
  const m = build([{ file: RULES,
    find: '                                               selects[flow](N, Key),\n'
        + '                                               not lib_static(Name, Key, _).',
    replace: '                                               selects[flow](N, Key).' }]);
  assert.deepEqual(mine(m, 'es_static_unattributed[audit](N, Name, Key)', ([, n, k]) => `${n}.${k}`),
    ['Error.captureStackTrace', 'JSON.parse', 'JSON.stringify', 'Math.PI', 'Math.max',
     'Object.entries', 'Object.hasOwn', 'Object.keys', 'Promise.allSettled',
     'Promise.any', 'Reflect.ownKeys', 'Symbol.for', 'Symbol.iterator']);
  assert.deepEqual(mine(m, 'es_static[code](N, Name, Key, Rel)', ([, n, k]) => `${n}.${k}`),
    mine(base(), 'es_static[code](N, Name, Key, Rel)', ([, n, k]) => `${n}.${k}`),
    'and the attribution is untouched, which is what the negation is for');
});

test('MUTANT 6 — a well-known symbol is declared callable', () => {
  // TARGET: `the key/call split is READ from the source`. Flip one row of the
  // generated table and `Symbol.iterator` stops being a key — while
  // `Symbol.for`, which is genuinely callable, is unmoved.
  const m = build([{ file: GLOBALS, find: 'lib_static_shape("Symbol", "iterator", data).',
    replace: 'lib_static_shape("Symbol", "iterator", callable).' }]);
  assert.deepEqual(mine(m, 'es_static_key[code](N, Name, Key)', ([, n, k]) => `${n}.${k}`),
    ['Math.PI']);
  assert.deepEqual(mine(m, 'es_static_call[code](C, Name, Key, Rel)', ([, n, k]) => `${n}.${k}`),
    mine(base(), 'es_static_call[code](C, Name, Key, Rel)', ([, n, k]) => `${n}.${k}`),
    'and what is actually CALLED is unchanged, because the shape does not gate it');
});

test('MUTANT 7 — a global is given the wrong form', () => {
  const m = build([{ file: GLOBALS, find: 'lib_global("Math", es5, namespace_object).',
    replace: 'lib_global("Math", es5, constructor_binding).' }]);
  assert.deepEqual(mine(m, 'es_construct_not_constructor[audit](X, Name, Form)',
    ([, n, f]) => `${n} ${f}`), [],
    'the TypeError becomes invisible: a namespace object called a constructor is one');
  // ITS OWN SIGNATURE: `Math.max` is still attributed, so the pack is working
  // and only the FORM is wrong — which is the whole reason the form is a column.
  assert.ok(mine(m, 'es_static[code](N, Name, Key, Rel)', ([, n, k]) => `${n}.${k}`)
    .includes('Math.max'));
});

test('MUTANT 8 — a static is dated wrongly in the generated pack', () => {
  const m = build([{ file: GLOBALS, find: 'lib_static("Object", "hasOwn", es2022).',
    replace: 'lib_static("Object", "hasOwn", es5).' }]);
  // ...and it leaves the gate entirely rather than moving within it: es5 is at
  // or below every environment on the scale, so es2021 reports nothing at all
  // and drops out of the list.
  assert.deepEqual(unsupported(m, 'es_static_unsupported[audit](E, N, Name, Key)',
    ([, , n, k]) => `${n}.${k}`), [
    'es2015: Object.entries Promise.allSettled Promise.any',
    'es2016: Object.entries Promise.allSettled Promise.any',
    'es2017: Promise.allSettled Promise.any',
    'es2020: Promise.any',
    'es5: Object.entries Promise.allSettled Promise.any Reflect.ownKeys '
      + 'Symbol.for Symbol.iterator',
  ]);
});

test('MUTANT 9 — the release membership test is inverted', () => {
  // RE-AIMED FROM AN OFF-BY-ONE, for the reason rules/js-env.rofl records: a
  // rank is a LABEL now and the question is membership, so the boundary error
  // one step further out is dropping the `not`. Every environment then reports
  // exactly the members it HAS.
  const m = build([{ file: RULES,
    find: 'es_static[code](N, Name, Key, Rel),\n'
        + '                                                 environment(E), not reaches[audit](E, Rel).',
    replace: 'es_static[code](N, Name, Key, Rel),\n'
        + '                                                 environment(E), reaches[audit](E, Rel).' }]);
  const rows = unsupported(m, 'es_static_unsupported[audit](E, N, Name, Key)',
    ([, , n, k]) => `${n}.${k}`);
  // BOTH ENDS ARE NAMED, because a mutant that only ADDED rows could be a
  // widening rather than an inversion. es5 reaches nothing later than itself, so
  // under the inversion it reports exactly its own five; ts5 reaches everything
  // and reports all twelve.
  assert.ok(rows.some((l) => l === 'es5: JSON.parse JSON.stringify Math.PI Math.max Object.keys'),
    `expected es5 to report its own members, got ${JSON.stringify(rows)}`);
  assert.ok(rows.some((l) => l.startsWith('ts5: JSON.parse')),
    `expected a ts5 row, got ${JSON.stringify(rows)}`);
});

test('MUTANT 10 — a global name is written as an atom instead of a string', () => {
  // THE MISTAKE THE PROTOTYPE HALF ACTUALLY MADE, kept alive here because this
  // pack repeats the shape: `free_global` gets its name from `ast_name`, and
  // every attribute value the scanner emits is QUOTED. Written as an atom the
  // join produces nothing and the residue audit reports the name — the audit
  // written to notice a missing global noticing a wrong TERM TYPE instead.
  const m = build([{ file: GLOBALS, find: 'lib_global("JSON", es5, namespace_object).',
    replace: 'lib_global(json, es5, namespace_object).' }]);
  assert.ok(!mine(m, 'es_global[code](E, Name, Rel, Form)', ([, n]) => n).includes('JSON'),
    'an atom does not join against a quoted name');
  assert.deepEqual(mine(m, 'global_unattributed[audit](E, Name)', ([, n]) => n),
    ['JSON', 'console', 'globalThis']);
});

test('MUTANT 11 — a function declaration stops binding its own name', () => {
  // TARGET: `declares_name is written rather than borrowed from sees_binder`.
  // This is the one row that separates the two: `sees_binder[code]` covers
  // declarators and patterns and CANNOT see a `function Box() {}`, so borrowing
  // it would have made every call to a top-level function in the corpus a
  // reference to a global of that name. Killed over the WHOLE corpus, by a set
  // DIFFERENCE rather than by a list — an element naming a function in
  // alpha.mjs would be this branch pinning another branch's file.
  const m = build([{ file: RULES, find: 'declaring_position(function_declaration, id).\n',
    replace: '' }]);
  const grew = new Set(m.q('global_unattributed[audit](E, Name)').map(([, n]) => n));
  const had = new Set(base().q('global_unattributed[audit](E, Name)').map(([, n]) => n));
  assert.ok([...grew].filter((n) => !had.has(n)).length > 0,
    'KILLED: functions this program declares are reported as globals');
});

// ---------------------------------------------------------------------------
// 7. THE SURVIVORS, WRITTEN DOWN RATHER THAN LEFT TO BE FOUND
//
// Twenty-two mutants were planted across `global_ref_position` (five rows),
// `declaring_position` (nine rows), both parameter arms, five rule heads,
// `constructible_form` and both negations, and compared against every relation
// this file asserts, corpus-wide. SEVENTEEN DIED. FIVE SURVIVED, and every one
// of them is the same fact — no site in the corpus:
//
//   global_ref_position(optional_member_expression, object)   no `x?.y` on a
//   global_ref_position(optional_call_expression, callee)     free name anywhere
//   declaring_position(function_expression, id)               no NAMED function
//   declaring_position(class_expression, id)                  or class expression
//                                                             shadowing a global
//   declaring_position(catch_clause, param)                   no catch parameter
//                                                             shadowing one
//
// They are declared here rather than deleted, for the reason
// rules/js-dataflow.rofl gives about `kind_prototype(reg_exp_literal, regexp)`:
// a row measured SILENT before it was written is a row that will fire the day
// the corpus grows a site, and removing it to make a mutant die would be
// removing the model to satisfy the instrument. What a reader should take from
// the list is that these five are UNTESTED, not that they are wrong.
