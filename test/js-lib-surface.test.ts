// js-lib-surface.test.ts — THE HALF OF THE ENVIRONMENT QUESTION SYNTAX CANNOT
// ANSWER (w_env_api_surface, 2026-09-08).
//
// `stdlib_member[audit]` names the residue the call graph cannot resolve: a
// member call whose receiver has a known PROTOTYPE and whose method is not a
// node in this program. Naming it was w_prototype_of_a_value. This file is the
// evidence for ATTRIBUTING it — which method, and since when.
//
// TWO WORLDS THAT WERE NEVER LOADED TOGETHER. `stdlib_member` is derived in the
// call-graph world and `environment` / `env_rank` are declared in the era
// world's facts, and neither loads the other. Both halves had been complete for
// days and no world could ask the question. The world below is the first that
// loads both, and one of the tests is the kernel saying so by name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import { scanLib, scanReadonly, emit, releaseOf, PROTOTYPES } from '../scanners/ts_lib.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LIB = path.join(ROOT, 'node_modules', 'typescript', 'lib');
const SURFACE = 'facts/js-lib-surface.rofl';

const FIX = 'test/fixtures/js-call/';
const FILES: [string, string][] = [
  ['alpha.mjs', FIX + 'alpha.mjs'], ['beta.mjs', FIX + 'beta.mjs'],
  ['gamma.mjs', FIX + 'gamma.mjs'], ['delta.mjs', FIX + 'delta.mjs'],
  ['shapes.ts', FIX + 'shapes.ts.txt'],
];
const PACKS = [
  'boot.rofl',
  'facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
  'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
  'facts/js-controlflow.rofl', SURFACE, 'facts/js-env.rofl',
  'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
  'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl', 'rules/js-env.rofl',
  'rules/js-env-api.rofl',
];
const BUDGET = { budget: 900_000_000 };
const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

type Mut = { file: string; find: string; replace: string };
interface World { q: (l: string) => string[][]; n: (l: string) => number }

function buildRaw(packs: string[] = PACKS, muts: Mut[] = []): Rofl {
  const r = new Rofl();
  const texts = packs.map((f) => {
    let t = read(f);
    for (const m of muts) if (m.file === f) {
      assert.ok(t.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
      t = t.replace(m.find, m.replace);
    }
    return t;
  });
  const res = r.load(texts.join('\n'));
  assert.ok(res.ok, `world REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  for (const [logical, disk] of FILES) {
    const a = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(a.ok, `${logical} facts REJECTED:\n${a.diagnostics.slice(0, 3).join('\n')}`);
  }
  r.evaluate(40_000_000);
  return r;
}

/** the query surface every assertion here goes through */
function wrap(r: Rofl): World {
  const q = (lit: string): string[][] => {
    const out = r.query(lit, BUDGET);
    assert.equal(out.error, undefined, `query ${lit}: ${out.error}`);
    assert.equal(out.partial, false, `query ${lit} hit a budget`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return out.rows.map((row) => order.map((v) => unq(String(row.bindings[v] ?? ''))));
  };
  return { q, n: (l) => q(l).length };
}

const build = (muts: Mut[] = [], packs: string[] = PACKS): World => wrap(buildRaw(packs, muts));

/** the attributed residue, as `prototype.method since year`, with multiplicity —
 *  never a line number, for the reason `byName` gives in
 *  test/js-update-and-literals.test.ts */
const attributed = (w: World): string[] => {
  const tally = new Map<string, number>();
  for (const [, p, k, s] of w.q('lib_call[code](C, P, K, S)')) {
    const key = `${p}.${k} since ${s}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return [...tally].map(([n, c]) => (c === 1 ? n : `${n} x${c}`)).sort();
};

const residue = (w: World): string[] =>
  w.q('stdlib_unattributed[audit](C, P, K)').map(([, p, k]) => `${p}.${k}`).sort();

/** which methods each environment cannot have, by name */
const unsupported = (w: World): string[] => {
  const byEnv = new Map<string, Set<string>>();
  for (const [e, , p, k] of w.q('lib_unsupported[audit](E, C, P, K)')) {
    if (!byEnv.has(e)) byEnv.set(e, new Set());
    byEnv.get(e)!.add(`${p}.${k}`);
  }
  return [...byEnv].map(([e, s]) => `${e}: ${[...s].sort().join(' ')}`).sort();
};

let BASE: World | undefined;
const base = () => (BASE ??= build());

// ---------------------------------------------------------------------------
// 1. THE SCANNER

test('the surface pack is generated, and regenerating it changes nothing', () => {
  // A GENERATED PACK THAT NOBODY REGENERATES IS A HAND-WRITTEN PACK with a
  // misleading header. This keeps the file honest, and it is the same shape as
  // the attestation ritual: compare, do not promise.
  assert.equal(emit(scanLib(LIB), undefined, scanReadonly(LIB)), read(SURFACE),
    'facts/js-lib-surface.rofl is out of date — run `node --experimental-strip-types scanners/ts_lib.ts`');
});

test('THE MUTATING HALF OF A PROTOTYPE IS READ, AND IT IS A SET DIFFERENCE', () => {
  // `w_ambient_prototype_effects` asked whether the array mutators can be READ
  // from a declaration file rather than typed, and said the honest answer may
  // be no. THIS IS THE ANSWER. TypeScript declares a `Readonly` TWIN of every
  // mutable collection interface, and the twin is the same surface with the
  // mutating members taken out — so the list is a subtraction over two
  // interfaces in the files this scanner already reads.
  const ro = scanReadonly(LIB);
  const by = new Map(ro.map((r) => [r.base, r]));
  // THE NINE, BY NAME AND IN THE ITEM'S OWN WORDS. Not a count: a count could
  // not tell these nine from any other nine, and the whole claim is that the
  // set the language names and the set the declaration yields are the SAME set.
  assert.deepEqual(by.get('Array')?.mutators,
    ['copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice',
      'unshift']);
  // ...AND THE CONSTRUCTION IS GENERAL RATHER THAN AN ARRAY COINCIDENCE, which
  // is why the other two twins are measured here even though neither reaches a
  // row: `Map` and `Set` are not prototypes `kind_prototype` can name a
  // receiver for, so emitting them would be rows no rule reads.
  assert.deepEqual(by.get('Map')?.mutators, ['clear', 'delete', 'set']);
  assert.deepEqual(by.get('Set')?.mutators, ['add', 'clear', 'delete']);
  assert.deepEqual(ro.map((r) => r.view).sort(),
    ['ReadonlyArray', 'ReadonlyMap', 'ReadonlySet'],
    'and those three are every Readonly twin the ecmascript lib files declare');
  // THE PROPERTY THE SUBTRACTION RESTS ON, in the direction nobody looks: the
  // readonly view declares NOTHING the mutable interface does not. If it did,
  // `lib_member` minus `lib_readonly_member` would stop meaning "the members
  // you cannot reach through a readonly reference" and start meaning nothing.
  assert.deepEqual(ro.flatMap((r) => r.viewOnly.map((m) => `${r.view}.${m}`)), []);
  // ...AND WHAT THE SOURCE CANNOT SAY, as a set rather than as a silence. SEVEN
  // of the eight prototypes have no twin at all — five of them `builtin_prototype`
  // rows and two (`object`, `function`) not — so this construction is SILENT
  // about them, which is a different thing from saying they have no mutators
  // and is why the rule in rules/js-ambient.rofl is guarded on the view.
  const withView = new Set(ro.map((r) => r.proto).filter((p) => p !== null));
  assert.deepEqual([...PROTOTYPES.values()].filter((p) => !withView.has(p)).sort(),
    ['bigint', 'boolean', 'function', 'number', 'object', 'regexp', 'string']);
});

test('the era of a method is the earliest lib file that declares it', () => {
  const members = scanLib(LIB);
  const at = new Map(members.map((m) => [`${m.proto}.${m.method}`, m]));
  // FOUR SPOT CHECKS ACROSS FOUR ERAS of the specification. The claim is not
  // "there are 130 rows", it is "the year is right", and a count cannot say so.
  assert.equal(at.get('array.join')?.since, 'es5');
  assert.equal(at.get('array.flat')?.since, 'es2019');
  assert.equal(at.get('string.replaceAll')?.since, 'es2021');
  assert.equal(at.get('array.at')?.since, 'es2022');
  assert.equal(at.get('array.at')?.file, 'lib.es2022.array.d.ts');
  // ...AND THE FILE-NAME RULE ITSELF, since everything above rests on it.
  assert.equal(releaseOf('lib.es5.d.ts'), 'es5');
  assert.equal(releaseOf('lib.es2015.core.d.ts'), 'es2015');
  assert.equal(releaseOf('lib.esnext.array.d.ts'), null, 'esnext names no release');
  assert.equal(releaseOf('lib.dom.d.ts'), null, 'the DOM names no release');
  // POSITIVE CONTROL: the sweep found the eight prototypes it was asked for.
  assert.deepEqual([...new Set(members.map((m) => m.proto))].sort(),
    [...PROTOTYPES.values()].sort());
});

// ---------------------------------------------------------------------------
// 2. THE ATTRIBUTION

test('every member call on a known prototype is attributed to a dated method', () => {
  const b = base();
  assert.deepEqual(attributed(b), [
    'array.at since es2022',
    'array.join since es5 x2',
    'bigint.toString since es2020',
    'regexp.test since es5 x2',
    'string.concat since es5',
    'string.replaceAll since es2021',
    'string.substr since es5',
    'string.trimLeft since es2019',
  ]);
  // ...AND NOTHING IS LEFT OVER. This is the row that would notice
  // `prototype_of` going wrong: a member call on a KNOWN prototype whose name
  // TypeScript's declarations do not carry.
  assert.deepEqual(residue(b), []);
});

test('the same method on a receiver the value layer cannot type is NOT attributed', () => {
  // THE LIMIT, AS A ROW RATHER THAN A SENTENCE. `libEras` in shapes.ts calls
  // `replaceAll` twice — once on a string LITERAL and once on a PARAMETER
  // annotated `string`. Only the literal is attributed, because the surface
  // reaches a receiver whose prototype comes from its KIND, and a TypeScript
  // annotation is not a value this model carries.
  const calls = base().q('lib_call[code](C, P, K, S)').filter(([, , k]) => k === 'replaceAll');
  assert.equal(calls.length, 1, 'one of the two `replaceAll` calls is reached');
});

// ---------------------------------------------------------------------------
// 3. THE ERA ANSWER

test('a library method is gated by year, and three years discriminate', () => {
  // SIX ROWS SINCE THE SCALE GREW, 2026-09-08, and es2021 is the one that makes
  // the claim: it lacks ONLY `array.at`, because `string.replaceAll` is 2021 and
  // `bigint.toString` 2020 and both are its own. With five environments the gate
  // could be read as "older environments lack newer methods"; with es2017 and
  // es2021 in the scale it is visibly a comparison of YEARS, method by method.
  // es2023 is absent from the list entirely — it is above all three.
  assert.deepEqual(unsupported(base()), [
    'es2015: array.at bigint.toString string.replaceAll string.trimLeft',
    'es2016: array.at bigint.toString string.replaceAll string.trimLeft',
    'es2017: array.at bigint.toString string.replaceAll string.trimLeft',
    'es2020: array.at string.replaceAll',
    'es2021: array.at',
    'es5: array.at bigint.toString string.replaceAll string.trimLeft',
  ]);
  // ts5 RANKS 2022 AND IS ABSENT FROM THAT LIST, which is the claim: the gate
  // compares years and does not flag methods for looking new.
  assert.ok(!unsupported(base()).some((l) => l.startsWith('ts5:')),
    'the highest environment on the scale has every method the corpus calls');
});

// ---------------------------------------------------------------------------
// 4. FIVE MUTANTS, FIVE ORACLES

test('MUTANT 1 — the attribution rule is withdrawn', () => {
  const m = build([{ file: 'rules/js-env-api.rofl',
    find: 'lib_call[code](C, P, Key, Rel) :- stdlib_member[audit](C, P, Key),',
    replace: 'lib_call_unused[code](C, P, Key, Rel) :- stdlib_member[audit](C, P, Key),' }]);
  assert.deepEqual(attributed(m), []);
  assert.deepEqual(unsupported(m), [], 'and the era answer goes with it');
});

test('MUTANT 2 — the residue audit stops subtracting what it attributed', () => {
  const m = build([{ file: 'rules/js-env-api.rofl',
    find: 'stdlib_unattributed[audit](C, P, Key) :- stdlib_member[audit](C, P, Key),\n'
        + '                                         not lib_member(P, Key, _).',
    replace: 'stdlib_unattributed[audit](C, P, Key) :- stdlib_member[audit](C, P, Key).' }]);
  // ITS OWN SIGNATURE: the attribution is untouched and the audit reports the
  // rows it just explained — which is what the negation is for.
  assert.deepEqual(attributed(m), attributed(base()));
  assert.deepEqual(residue(m),
    ['array.at', 'array.join', 'array.join', 'bigint.toString',
     'regexp.test', 'regexp.test', 'string.concat', 'string.replaceAll',
     'string.substr', 'string.trimLeft']);
});

test('MUTANT 3 — the year comparison includes the environment itself', () => {
  const m = build([{ file: 'rules/js-env-api.rofl',
    // RE-AIMED 2026-09-08 with the move to composition. The off-by-one it
    // planted was `Since >= R` on a year; the same defect on a membership test
    // is dropping the `not` — an environment is then reported as lacking exactly
    // the methods it HAS, which is the boundary error one step further out.
    find: 'environment(E), not reaches[audit](E, Rel).',
    replace: 'environment(E), reaches[audit](E, Rel).' }]);
  // THE MEMBERSHIP TEST INVERTED: every environment now reports the methods it
  // REACHES as unsupported, so ts5 — which reaches all three — reports all
  // three, and es5 reports none. Both halves are named, because a mutant that
  // only added rows could be a widening rather than an inversion.
  assert.ok(unsupported(m).some((l) => l.startsWith('ts5: array.at')),
    `expected a ts5 row, got ${JSON.stringify(unsupported(m))}`);
  // ...AND es5 REPORTS THE THREE ES5 METHODS, which is the inversion seen from
  // the other end: it reaches `es5` and nothing later, so under the mutant the
  // only methods it calls unsupported are exactly the ones it has. Named rather
  // than counted, because `es5 reports something` would also be true of the
  // honest tree.
  assert.ok(unsupported(m).some((l) => l === 'es5: array.join regexp.test string.concat string.substr'),
    `expected es5 to report its own methods, got ${JSON.stringify(unsupported(m))}`);
});

test('MUTANT 4 — a method is dated wrongly in the pack', () => {
  const m = build([{ file: SURFACE,
    find: 'lib_member(array, "at", es2022).', replace: 'lib_member(array, "at", es5).' }]);
  // ...and it leaves the gate entirely rather than moving within it: 2009 is at
  // or below every environment on the scale.
  assert.deepEqual(unsupported(m), [
    'es2015: bigint.toString string.replaceAll string.trimLeft',
    'es2016: bigint.toString string.replaceAll string.trimLeft',
    'es2017: bigint.toString string.replaceAll string.trimLeft',
    'es2020: string.replaceAll',
    'es5: bigint.toString string.replaceAll string.trimLeft',
  ]);
});

test('MUTANT 5 — the method is written as an atom instead of a string', () => {
  // THE MISTAKE THE FIRST DRAFT ACTUALLY MADE, kept as a mutant. `stdlib_member`
  // gets its key from `selects[flow]`, which reads an `ast_attr` VALUE, and every
  // attribute value the scanner emits is quoted. Written as atoms the join
  // produced ZERO rows out of six and `stdlib_unattributed` reported all six —
  // the audit written to notice a wrong PROTOTYPE noticing a wrong TERM TYPE
  // instead, one level down.
  const m = build([{ file: SURFACE,
    find: 'lib_member(array, "join", es5).', replace: 'lib_member(array, join, es5).' }]);
  assert.ok(!attributed(m).some((s) => s.startsWith('array.join')),
    'an atom does not join against a quoted key');
  assert.deepEqual(residue(m), ['array.join', 'array.join']);
});

// ---------------------------------------------------------------------------
// 5. THE TWO WORLDS, AND THE KERNEL SAYING SO

test('without the era pack the kernel names the missing half', () => {
  // NOT A DEFECT, A DEMONSTRATION. The era question needs `environment` and
  // `env_rank`, which live in facts/js-env.rofl, and the call-graph world does
  // not load it. Loading this pack without that one is bringing half a question.
  //
  // AND THE KERNEL SAYS WHICH HALF — through `unpopulatable` on the relation
  // rather than through an audit. Measured: in the world below `environment(E)`
  // comes back UNPOPULATABLE, which is the kernel distinguishing `no
  // environments matched` from `nothing here can be an environment`. The first
  // draft of this test expected `undefined_premise[audit]` to name the two
  // relations and it named nothing — that audit is itself unpopulatable in this
  // world, so it could not have said anything either way, and an assertion on
  // it would have been an empty answer read as a claim.
  const packs = PACKS.filter((p) => p !== 'facts/js-env.rofl');
  const half = buildRaw(packs);
  const env = half.query('environment(E)', BUDGET);
  assert.equal(env.rows.length, 0);
  assert.equal(env.unpopulatable, true, 'the kernel names the missing half');
  // POSITIVE CONTROL on that field: with the pack, the same query is populated.
  const whole = buildRaw(PACKS).query('environment(E)', BUDGET);
  assert.equal(whole.unpopulatable, false);
  // 5 -> 8 on 2026-09-08: es2017, es2021 and es2023 joined the scale, each at a
  // year this vocabulary has a feature for.
  assert.equal(whole.rows.length, 8);
  // ...AND THE HALF THAT DOES NOT NEED IT STILL ANSWERS, which is why the rules
  // are one pack rather than two: attribution is unchanged and only the era
  // verdict is gone.
  const w = wrap(half);
  assert.deepEqual(attributed(w), attributed(base()));
  assert.deepEqual(unsupported(w), []);
});

// ---------------------------------------------------------------------------
// 6. AND WHETHER THE METHOD IS STILL THE ONE TO USE
//
// w_env_api_surface asked for `replaced_by/2` as the other half of the surface.
// It is not a missing half — it is a relation whose subject barely exists.

const deprecated = (w: World): string[] =>
  w.q('lib_call_deprecated[audit](C, P, K)').map(([, p, k]) => `${p}.${k}`).sort();
const remedy = (w: World): string[] =>
  w.q('lib_call_remedy[audit](C, P, K, R)').map(([, p, k, r]) => `${p}.${k} -> ${r}`).sort();

test('a deprecated call is named, and its remedy only when the source names one', () => {
  const b = base();
  assert.deepEqual(deprecated(b), ['string.substr', 'string.trimLeft']);
  // ONE REMEDY OUT OF TWO DEPRECATIONS, and that ratio is the finding rather
  // than the fixture: measured over the ecmascript lib files, FORTY-ONE
  // `@deprecated` tags and TWO name a replacement. The other thirty-nine read
  // `A legacy feature for browser compatibility` and name nothing, because
  // there IS no replacement for `blink()` or `substr()`.
  assert.deepEqual(remedy(b), ['string.trimLeft -> trimStart']);
});

test('the generated tables carry the ratio the source has', () => {
  const members = scanLib(LIB);
  const dep = members.filter((m) => m.deprecated);
  const named = members.filter((m) => m.replacedBy);
  // SEVENTEEN ON THE EIGHT PROTOTYPES THIS MODEL NAMES, of the forty-one tags
  // in those files — the rest sit on standalone declarations like `escape` and
  // on interfaces no `kind_prototype` row reaches.
  assert.equal(dep.length, 17);
  assert.deepEqual(named.map((m) => `${m.proto}.${m.method} -> ${m.replacedBy}`).sort(),
    ['string.trimLeft -> trimStart', 'string.trimRight -> trimEnd']);
});

test('MUTANT 6 — the deprecation join is withdrawn', () => {
  const m = build([{ file: 'rules/js-env-api.rofl',
    find: 'lib_call_deprecated[audit](C, P, Key) :- lib_call[code](C, P, Key, _),',
    replace: 'lib_call_deprecated_unused[audit](C, P, Key) :- lib_call[code](C, P, Key, _),' }]);
  assert.deepEqual(deprecated(m), []);
  assert.deepEqual(remedy(m), [], 'and the remedy goes with it, being derived from it');
});

test('MUTANT 7 — the remedy join is withdrawn', () => {
  const m = build([{ file: 'rules/js-env-api.rofl',
    find: 'lib_replaced_by(P, Key, R).', replace: 'lib_replaced_by_unused(P, Key, R).' }]);
  // ITS OWN SIGNATURE, and it is what separates this mutant from the one above:
  // the deprecations stand and only the remedy goes.
  assert.deepEqual(deprecated(m), ['string.substr', 'string.trimLeft']);
  assert.deepEqual(remedy(m), []);
});

test('MUTANT 8 — a deprecation is dropped from the generated pack', () => {
  const m = build([{ file: SURFACE,
    find: 'lib_deprecated(string, "substr").', replace: '' }]);
  assert.deepEqual(deprecated(m), ['string.trimLeft'],
    'the one with a remedy survives, which is the half a reader would notice last');
});
