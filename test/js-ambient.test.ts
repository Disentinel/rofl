// js-ambient.test.ts — THE AMBIENT SURFACE: A CALL WHOSE CALLEE IS NOT IN THIS
// PROGRAM, AND WHAT IT DENOTES.
//
// THE WORLD IS `w_js_ambient` IN facts/worlds.rofl and that is ASSERTED here
// rather than trusted, on the pattern test/js-layer-cost.test.ts and
// test/note-witness.test.ts both use: a claim measured in a world nobody else
// builds describes nothing anybody else tests, and the item's whole product is
// a set of rows about a store.
//
// WHY THE CORPUS IS FOUR FILES FROM TWO DIRECTORIES. `w_js_effects` — the
// lattice over the five shared call fixtures — is where the effect layer is
// measured, and it has NO ambient callee any surface names: measured
// 2026-09-09, its free globals are `Error`, `Promise`, `String`, `Symbol`, and
// not one import of a node builtin. So this world is the runtime layer's three
// fixtures plus the ES globals one, which between them give ONE SURFACE
// ATTRIBUTED BESIDE ANOTHER THAT IS NOT — `console.log` denotes `io` and
// `Math.max` denotes nothing — in a single store. That is the shape the item
// is about, and it is why the frontier can be a printed set here instead of a
// promise.
//
// WHAT IS ASSERTED, AND EVERY ONE OF THEM IS A NAMED SET:
//
//   * the translation from a host effect atom to a lattice landmark, as the
//     eight pairs — DERIVED from the lattice's own closure, not written down;
//   * `ambient_owed[flow](Origin, Surface)` — the in-tray, with the origin in
//     the row, which is the sentence this item leaves behind;
//   * `concrete_denotes[flow]` — every ambient call this model can put in the
//     lattice, by surface and member;
//   * `eff_label_unseen[flow]` EMPTY, which is `ndet` finally having a seed;
//   * the exception oracle NARROWED rather than dropped, with the direction of
//     the divergence named;
//   * the shapes of the calls that remain unattributed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

const AMB_RULES = 'rules/js-ambient.rofl';
const EFF_RULES = 'rules/js-effects.rofl';

/** SECTION 6'S ONE RULE, and the same rule with its head disconnected. Turning
 *  a single rule off inside a pack is how the top-of-the-lattice claim below
 *  gets measured against the CALL attribution it is actually about, instead of
 *  against everything this pack does at once. The replacement is a well-formed
 *  rule with a head nothing reads, so the world still loads and the shape of
 *  the derivation is unchanged. */
const G_READ = 'eff_here[flow](E, read, global) :- free_global[code](E, _, _).';
const G_READ_OFF = 'amb_free_global_read_off[flow](E, read, global) '
  + ':- free_global[code](E, _, _).';

/** THE PACKS `w_js_ambient` DECLARES, in load order. Kept as a literal so the
 *  identity test below compares two independently written lists rather than a
 *  list against itself. */
const PACKS = [
  'boot.rofl',
  'facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
  'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
  'facts/js-controlflow.rofl', 'facts/js-effects.rofl',
  'facts/js-globals.rofl', 'facts/js-lib-surface.rofl', 'facts/js-env.rofl',
  'facts/js-host-surface.rofl', 'facts/js-host.rofl',
  'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
  'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl', 'rules/js-modules.rofl',
  'rules/js-env.rofl', 'rules/js-env-api.rofl', 'rules/js-globals.rofl',
  'rules/js-host.rofl', EFF_RULES, AMB_RULES,
];

const FILES: [string, string][] = [
  ['runtime.mjs', 'test/fixtures/js-host/runtime.mjs'],
  ['shadow.mjs', 'test/fixtures/js-host/shadow.mjs'],
  ['clock.mjs', 'test/fixtures/js-host/clock.mjs'],
  ['globals.mjs', 'test/fixtures/js-globals/globals.mjs.txt'],
];

/** THE TWO BLIND HOST EMITTERS the modules layer needs, the same three lines
 *  test/js-host-world.ts and scripts/witness_check.ts write: the kernel's
 *  builtins are arithmetic and comparison only, so no rule can take a specifier
 *  apart, and without `str_scheme[code]` the whole module door is silent. */
const qs = (s: string): string => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
function strFacts(s: string): string[] {
  if (s.length === 0) return [];
  const segs = s.split('/');
  const out = [`str_char0[code](${qs(s)}, ${qs(s[0] as string)}).`, `str_segs[code](${qs(s)}, ${segs.length}).`];
  segs.forEach((g, i) => out.push(`str_seg[code](${qs(s)}, ${i}, ${qs(g)}).`));
  const c = s.indexOf(':');
  if (c > 0) out.push(`str_scheme[code](${qs(s)}, ${qs(s.slice(0, c))}).`);
  return out;
}
function specifierFacts(sources: string[]): string[] {
  const out = new Set<string>();
  for (const src of sources)
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) for (const f of strFacts(m[1])) out.add(f);
  return [...out];
}

type Mut = { file: string; find: string; replace: string };
interface World { q: (l: string) => string[][]; n: (l: string) => number; binds: (l: string) => string[] }

/** PACKS FIRST, FACTS AFTER, ONE `load`, AND THE LOAD CARRIES A BUDGET.
 *  `r.load()` RE-EVALUATES under DEFAULT_BUDGET 100 000, and this world derives
 *  571 `ambient_effect` rows and 987 `surface_origin` rows from the surface
 *  packs alone — with no corpus at all. Measured: without the budget the load
 *  reports `$load(1)/budget_exhausted` in `hole` and every assertion below goes
 *  red at once, which reads as a broken pack rather than as a small number. */
function build(muts: Mut[] = [], src: [string, string][] = [], omit: string[] = []): World {
  const r = new Rofl();
  const texts = PACKS.filter((f) => !omit.includes(f)).map((f) => {
    let t = read(f);
    for (const m of muts) if (m.file === f) {
      assert.ok(t.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
      t = t.replace(m.find, m.replace);
    }
    return t;
  });
  const res = r.load(texts.join('\n'), { budget: 40_000_000 });
  assert.ok(res.ok, `world REJECTED:\n${res.diagnostics.slice(0, 6).join('\n')}`);
  const sources = FILES.map(([, disk]) => read(disk));
  for (const [i, [logical]] of FILES.entries()) {
    const a = r.assert(scan(sources[i], { file: logical }).facts.join('\n'));
    assert.ok(a.ok, `${logical} facts REJECTED:\n${a.diagnostics.slice(0, 3).join('\n')}`);
  }
  const s = r.assert(specifierFacts(sources).join('\n'));
  assert.ok(s.ok, `specifier facts REJECTED:\n${s.diagnostics.slice(0, 3).join('\n')}`);
  // ...and any PROBE source, scanned from text. A probe rather than a fifth
  // fixture, for the reason test/js-effects.test.ts gives about its own: the
  // four files are what every named set in this file is measured over, and
  // adding one would move all of them for the sake of one rule.
  for (const [logical, text] of src) {
    const a = r.assert(scan(text, { file: logical }).facts.join('\n'));
    assert.ok(a.ok, `${logical} facts REJECTED:\n${a.diagnostics.slice(0, 3).join('\n')}`);
  }
  r.evaluate(40_000_000);
  assert.deepEqual(r.query('hole(Q, R)').rows.map((x: any) => `${x.bindings.Q}/${x.bindings.R}`), [],
                   'this world must reach its fixpoint, not stop at a budget');
  const q = (lit: string): string[][] => {
    const out = r.query(lit, { budget: 900_000_000 });
    assert.equal(out.error, undefined, `query ${lit}: ${out.error}`);
    assert.equal(out.partial, false, `query ${lit} hit a budget`);
    assert.equal(out.unpopulatable, false, `query ${lit}: nothing in this world can populate it`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return out.rows.map((row: any) => order.map((v) => unq(row.bindings[v] ?? '')));
  };
  return { q, n: (l) => q(l).length, binds: (l) => q(l).map((x) => x.join('/')).sort() };
}

let BASE: World | undefined;
const base = () => (BASE ??= build());

// ===========================================================================
// 0. THE WORLD IS THE DECLARED ONE

test('this file builds `w_js_ambient` and nothing else', () => {
  // facts/worlds.rofl declares the world; nothing in ROFL can read a directory,
  // so the two lists are written independently and compared here. A pack added
  // to one and not the other is the failure test/note-witness.test.ts's closure
  // catches from the other side.
  const r = new Rofl();
  const ok = r.load(['boot.rofl', 'rules/worlds.rofl', 'facts/worlds.rofl'].map(read).join('\n'));
  assert.ok(ok.ok, ok.diagnostics.slice(0, 3).join('\n'));
  r.evaluate(2_000_000);
  const declared = r.query('world_pack(w_js_ambient, F)').rows.map((x: any) => unq(String(x.bindings.F))).sort();
  assert.deepEqual(PACKS.filter((p) => p !== 'boot.rofl').sort(), declared,
    'the world this file builds must be the world the ledger declares');
  const corpus = r.query('world_corpus(w_js_ambient, L, D)').rows
    .map((x: any) => `${unq(String(x.bindings.L))}=${unq(String(x.bindings.D))}`).sort();
  assert.deepEqual(FILES.map(([l, d]) => `${l}=${d}`).sort(), corpus, 'and over the same corpus');
});

// ===========================================================================
// 1. THE TRANSLATION — A HOST EFFECT ATOM IS A LATTICE LANDMARK

test('the eight host effect atoms map into the lattice, DERIVED from the lattice', () => {
  const w = base();
  // NOT a table of eight rows. `eff_of_host` is the least `eff_name` whose row
  // contains the atom's label on the ambient heap, computed by the same Moore
  // closure `effect_of[flow]` stands on. The two that are not identities are
  // the whole content: `read` and `write` are LABELS and Koka parameterises
  // both by a heap, and an ambient surface is by definition not allocated in
  // this program, so the heap is `global` with no arm and no exception.
  assert.deepEqual(w.binds('eff_of_host(A, N)'),
    ['alloc/alloc', 'div/div', 'exn/exn', 'io/io', 'ndet/ndet',
      'read/rd_global', 'total/total', 'write/wr_global']);
  assert.deepEqual(w.binds('host_atom_unmapped[audit](A)'), [],
    'every atom facts/js-host.rofl can attribute reaches a landmark');
  assert.deepEqual(w.binds('host_atom_two_names[audit](A, X, Y)'), [],
    'and exactly one');
});

// ===========================================================================
// 2. THE SURFACES AND THE BINDINGS

test('every surface names the declaration file it came from, and only one', () => {
  const w = base();
  assert.deepEqual(w.binds('surface_two_origins[audit](S, A, B)'), [],
    'scanners/host_lib.ts subtracts the ES baseline from both hosts, so no name '
    + 'is claimed by two declaration files — and this is that sentence as a row');
  assert.deepEqual(w.binds('ambient_binding_unowned[audit](F, N, S)'), []);
  assert.deepEqual(w.binds('concrete_no_origin[audit](S)'), []);
  assert.deepEqual(w.binds('concrete_bad_origin[audit](S, O)'), []);
  assert.deepEqual(w.binds('concrete_unnamed[audit](S, Op, E)'), [],
    'every effect this pack derives is a landmark the lattice names');
  assert.deepEqual(w.binds('concrete_async_smuggled[audit](S, Op)'), [],
    'and ASYNC has not come back as a concrete name');
  // the three surfaces a NAMESPACE import binds, which is the module door
  assert.deepEqual([...new Set(w.q('ambient_binding(F, N, S)').map(([, , s]) => s))]
    .filter((s) => s.startsWith('node:')).sort(), ['node:fs', 'node:os', 'node:path']);
  // ...AND THE NEGATIVE CONTROL THAT MAKES THE FREE-NAME TEST MEAN ANYTHING.
  // test/fixtures/js-globals declares a local `Set` that shadows the global of
  // the same name; without `not declares_name` in `free_global[code]` this pack
  // would call `Set.of(rows)` an ambient call on the ECMAScript intrinsic.
  assert.equal(w.n('ambient_binding(F, "Set", S)'), 0,
    'a name the file binds is not ambient, however global it looks');
});

// ===========================================================================
// 3. THE MAP, AND THE IN-TRAY

test('THE PRODUCT: every ambient call this model can put in the lattice', () => {
  const w = base();
  // Every (surface, member) pair with a landmark, and NOT ONE of them was typed
  // anywhere in this tree: the module half comes from `member_effect[code]`
  // — twenty-two module defaults with seven member overrides subtracted — and
  // the global half from `host_global_effect`, both in facts/js-host.rofl and
  // both written for the runtime layer before this pack existed.
  //
  // TWO ARRIVED 2026-09-09 FROM THE SURFACE ITEMS AND THEY COME FROM A THIRD
  // SOURCE — a `.d.ts` read structurally rather than an effect table. `array/
  // fill/wr_local` is `lib_member` minus `lib_readonly_member`, the mutating
  // half of the Array prototype taken as a SET DIFFERENCE over TypeScript's own
  // `ReadonlyArray`; `Math/construct/exn` is `lib_global`'s FORM, which says
  // `Math` has no constructor interface and therefore that `new Math()` throws.
  // Neither is a judgement about a member: one is what `readonly` means and the
  // other is what a missing constructor means.
  assert.deepEqual(w.binds('concrete_denotes[flow](S, Op, E)'), [
    'Math/construct/exn', 'array/fill/wr_local',
    'console/error/io', 'console/log/io', 'fetch/itself/io',
    'node:fs/exists/io', 'node:fs/globSync/io', 'node:fs/promises/readFile/io',
    'node:fs/promises/writeFile/io', 'node:fs/readFileSync/io', 'node:fs/statfs/io',
    'node:os/cpus/rd_global', 'node:os/machine/rd_global',
    'node:path/join/total', 'node:path/resolve/io',
    'performance/now/ndet', 'queueMicrotask/itself/io',
    'setTimeout/itself/io', 'structuredClone/itself/alloc',
  ]);
  // `node:path` is `total` and `path.resolve` is `io`, in one store — which is
  // the module-default-with-member-override pattern arriving intact through
  // two packs and a translation, and the one row that proves the override
  // survived the join.
  assert.ok(w.binds('concrete_denotes[flow](S, Op, E)').includes('node:path/join/total'));
  assert.ok(w.binds('concrete_denotes[flow](S, Op, E)').includes('node:path/resolve/io'));
});

test('THE IN-TRAY: what is owed, with the ORIGIN in the row', () => {
  const w = base();
  // This is the sentence the item leaves behind, and it is a set rather than a
  // number because the three origins owe different work to different owners:
  // the HOST surface has an effect table and one member of it is unattributed;
  // the ECMAScript surface has NO effect table at all; and the builtin
  // prototypes have none either. `Math.max` and `Math.random` have the same
  // shape in every declaration file there is, so no scan will separate them.
  //
  // GREW BY SIX PAIRS AND FIVE ROWS on the merge that put a constructed value's
  // prototype in the tree, and every one of them is the SAME sentence reaching
  // further rather than a new kind of debt: `new String(s).substr(...)`,
  // `new RegExp(...).test(...)` and `new Array(n).fill(0)` are member calls on
  // a receiver the value layer could not trace before, so three prototypes and
  // three intrinsics now have a surface here to owe an effect for. The in-tray
  // getting LONGER because the value layer got better is the healthy direction:
  // nothing moved from owed to attributed by itself.
  //
  // ONE ROW LEFT IT 2026-09-09 AND IT WAS NOT ATTRIBUTED — it was shown to
  // belong to somebody else. `es_intrinsic/Error` was owed for exactly one
  // operation, `Error.captureStackTrace`, which is V8's and which TypeScript
  // declares in @types/node and nowhere in lib.es*.d.ts. So no table of
  // ECMAScript effects will ever map it, and reporting the ECMAScript surface
  // as owing one is false about the surface and hides whose debt it is.
  // `ambient_off_surface[flow]` is where it went.
  assert.deepEqual(w.binds('ambient_owed[flow](O, S)'), [
    'builtin_prototype/array', 'builtin_prototype/regexp',
    'builtin_prototype/string',
    'es_intrinsic/Array', 'es_intrinsic/BigInt',
    'es_intrinsic/JSON', 'es_intrinsic/Map', 'es_intrinsic/Math',
    'es_intrinsic/Object', 'es_intrinsic/Promise', 'es_intrinsic/Reflect',
    'es_intrinsic/RegExp', 'es_intrinsic/String', 'es_intrinsic/Symbol',
    'host_runtime/atob',
  ]);
  // ...and the pairs under it, which is rules/js-effects.rofl's own residue
  // relation with rows in it for the first time. Two left it on the same day
  // and BOTH were attributed by a rule: `array/fill` because `fill` is absent
  // from `ReadonlyArray`, `Math/construct` because `Math` has no constructor
  // interface. `array/toSorted` stayed, and that is the honest half — a member
  // that does not mutate is not thereby effect-free, since it takes a
  // comparator this model has no edge to.
  assert.deepEqual(w.binds('concrete_unmapped[flow](S, Op)'), [
    'Array/construct', 'BigInt/itself', 'Error/captureStackTrace',
    'JSON/parse', 'JSON/stringify',
    'Map/construct', 'Math/max', 'Object/entries',
    'Object/hasOwn', 'Object/keys', 'Promise/allSettled', 'Promise/any',
    'Reflect/ownKeys', 'RegExp/construct', 'String/construct', 'Symbol/for',
    'array/toSorted', 'atob/itself', 'regexp/test',
    'string/substr',
  ]);
  // ...AND THE PAIR THAT IS OWED BY NOBODY HERE, which is the whole of what
  // left the in-tray. It is one row and it is printed rather than counted,
  // because the claim is about WHICH operation is off the surface.
  assert.deepEqual(w.binds('ambient_off_surface[flow](S, Op)'),
    ['Error/captureStackTrace']);
  // WHICH SURFACES THE MODEL CANNOT LIST THE MEMBERS OF, and it is exactly the
  // globals. `scanners/host_lib.ts` walks a MODULE's properties through the
  // checker and stops at the NAMES of the globals, so `console`'s members are
  // the ones a program selects rather than the ones `Console` declares. Every
  // unenumerated surface is a global and no module is one.
  //
  // AND IT IS THE HOST GLOBALS SPECIFICALLY, sharpened 2026-09-09 when the
  // ECMAScript surfaces first got an `ambient_effect` row. `lib_global` and
  // `lib_member` are member lists walked out of lib.es*.d.ts, so `Math` and
  // `array` are enumerated by the same kind of source `node:fs` is; a
  // `plain_value` global with no members is enumerated too, because an empty
  // list from the source is an answer and a missing one is the gap.
  const un = w.binds('ambient_unenumerated[flow](S)');
  assert.deepEqual(un.filter((s) => s.startsWith('node:')), [],
    'a module surface is enumerated by the checker');
  assert.deepEqual(un.filter((s) => ['Math', 'JSON', 'Reflect', 'NaN', 'array'].includes(s)), [],
    'and so is every ECMAScript surface, binding and prototype alike');
  assert.ok(un.includes('console') && un.includes('process') && un.includes('crypto'),
    `the host globals are not — got ${un.join(' ')}`);
});

test('THE IN-TRAY CANNOT BE EMPTIED BY ATTRIBUTING A MEMBER NOBODY CALLS', () => {
  // `ambient_owed[flow]` used to read `not amb_surface_attributed(S)` — no
  // member of this surface is attributed — and that form can be emptied without
  // answering anything. `w_ambient_es_intrinsic_effects`'s own note proposes a
  // floor of exactly that shape: a data static of a frozen intrinsic is
  // `total`. MEASURED AND REFUSED — see the test below — and the relation was
  // strengthened first so that the refusal is not the only thing standing
  // between the in-tray and a free 87 rows.
  //
  // THE TWO FORMS NOW DISAGREE IN BOTH DIRECTIONS, and printing the difference
  // is the whole point: four surfaces have SOME attribution and still owe an
  // operation a call site reaches, and one surface has none and owes nothing.
  //
  // FIRST, THE CONTROL, AND IT IS WHAT SEPARATES A REPAIR FROM A REDEFINITION
  // THAT HIDES ITS OWN EFFECT. With this branch's three new heads disconnected
  // — the two `ambient_effect` arms and both `ambient_off_surface` arms — the
  // pack is the one that shipped at 001b849 with only the in-tray's DEFINITION
  // changed, and the two forms agree row for row. So the strengthening did not
  // move the set; the attributions did.
  const OFF = (find: string, head: string) => ({ file: AMB_RULES, find, replace: head });
  const control = build([
    OFF(`ambient_effect(P, Key, E) :- lib_mutator(P, Key), amb_proto_heap(P, H),
                             eff_of_label(write, H, E).`,
    `amb_off_a(P, Key, E) :- lib_mutator(P, Key), amb_proto_heap(P, H),
                             eff_of_label(write, H, E).`),
    OFF(`ambient_effect(Name, construct, E) :- amb_not_constructible(Name),
                                      eff_of_label(exn, none, E).`,
    `amb_off_b(Name, construct, E) :- amb_not_constructible(Name),
                                      eff_of_label(exn, none, E).`),
    OFF(`ambient_off_surface[flow](S, Op) :- concrete_effect[flow](_, S, Op),
                                    surface_origin(S, es_intrinsic),`,
    `amb_off_c[flow](S, Op) :- concrete_effect[flow](_, S, Op),
                                    surface_origin(S, es_intrinsic),`),
    OFF(`ambient_off_surface[flow](S, Op) :- concrete_effect[flow](_, S, Op),
                                    surface_origin(S, builtin_prototype),`,
    `amb_off_d[flow](S, Op) :- concrete_effect[flow](_, S, Op),
                                    surface_origin(S, builtin_prototype),`),
  ]);
  // The SURFACES of both, because `surface_two_origins[audit]` is empty so a
  // surface carries exactly one origin and the two sets are the same question.
  const surfacesOwed = (x: World) => [...new Set(x.q('ambient_owed[flow](O, S)')
    .map(([, s]) => s))].sort();
  const surfacesWeak = (x: World) => [...new Set(x.q('ambient_surface_unattributed[flow](S)')
    .map(([s]) => s))].sort();
  assert.deepEqual(surfacesOwed(control), surfacesWeak(control),
    'with nothing attributed the two definitions of the in-tray are the same set');
  assert.equal(surfacesOwed(control).length, 16,
    'and that set is the sixteen surfaces the pack shipped with at 001b849');

  const w = base();
  const weak = new Set(w.q('ambient_surface_unattributed[flow](S)').map(([s]) => s));
  const owed = new Set(w.q('ambient_owed[flow](O, S)').map(([, s]) => s));
  assert.deepEqual([...owed].filter((s) => !weak.has(s)).sort(),
    ['JSON', 'Math', 'Reflect', 'array'],
    'attributed in part, and still owed for an operation a call site reaches');
  assert.deepEqual([...weak].filter((s) => !owed.has(s)).sort(), ['Error'],
    'and the one that is unattributed and owes nobody anything');
});

// ===========================================================================
// 4. WHAT THE LATTICE DOES WITH IT

test('`ndet` HAS A SEED AT LAST — and no label of the lattice is unreached', () => {
  const w = base();
  // rules/js-effects.rofl says it in so many words: `ndet` "has NO SEED AT ALL,
  // and cannot have one. Nothing in the LANGUAGE is nondeterministic;
  // `Math.random`, `Date.now` and `crypto.getRandomValues` are ambient members,
  // so `ndet` is derivable exactly when `ambient_effect` exists. It is the
  // sharpest single statement of what this layer is waiting for."
  //
  // `performance.now()` is `ndet` in facts/js-host.rofl, and this is that
  // sentence discharged. The SET is the oracle: over `w_js_effects` it is
  // `['ndet/none', 'write/global']` and here it is empty.
  assert.deepEqual(w.binds('eff_label_unseen[flow](L, H)'), [],
    'every one of the eight labels is exercised once both surfaces are under the lattice');
  assert.ok(w.n('eff_here[flow](N, ndet, none)') >= 1, 'and ndet in particular');
  // the lattice itself is untouched by any of this
  for (const a of ['join_missing[audit](A, B)', 'join_ambiguous[audit](A, B, C, D)',
    'meet_missing[audit](A, B)', 'meet_ambiguous[audit](A, B, C, D)',
    'eff_unnamed[audit](F)', 'eff_two_names[audit](F, A, B)',
    'eff_member_both[audit](M)', 'eff_join_short[audit](F, G, J)',
    'eff_swallowed[audit](F, C, L, H)'])
    assert.deepEqual(w.binds(a), [], a);
});

/** THE SAME WORLD WITH THE AMBIENT PACK TAKEN OUT. Everything else identical —
 *  same corpus, same four other layers, same two surface packs — so a
 *  difference between the two is this pack and nothing else. It is the
 *  instrument the two tests below need and it is worth a whole fixpoint,
 *  because "before" and "after" measured in two DIFFERENT worlds is the defect
 *  this repository records as `a witness has no world`. */
let NOAMB: World | undefined;
const noAmbient = () => (NOAMB ??= build([], [], [AMB_RULES]));

test('BEFORE AND AFTER: what seeding an ambient effect does to the exn oracle', () => {
  // A REPORTING REQUIREMENT rather than a repair, and it was asked for by the
  // branch working the coercion item, which measured the same thing from the
  // other end: one planted `ambient_effect(array, "join", io)` took
  // `eff_exn_only[audit]` from 0 to 2. `may_throw[code]` closes over `resolves`
  // and `throw_statement` ONLY; the concrete column seeds labels from somewhere
  // else entirely, and `io` contains `exn`.
  //
  // MEASURED HERE, in one world with the pack in and out:
  //   eff_exn_only[audit]     0 -> 12
  //   may_throw_only[audit]   0 ->  0
  // The direction is the whole of it. `eff_exn_only` growing is the effect
  // layer knowing MORE than the exception layer, which is true — `console.log`
  // can throw. `may_throw_only` growing would be this layer LOSING a throw the
  // exception layer has, which is what a propagation defect looks like, and it
  // is 0 in both.
  const before = noAmbient();
  const after = base();
  assert.equal(before.n('eff_exn_only[audit](F)'), 0,
    'without the ambient pack the two relations agree row for row, as w_js_effects asserts');
  assert.ok(after.n('eff_exn_only[audit](F)') > 0, 'and with it they do not');
  // ...AND `may_throw_only[audit]` IS VACUOUS IN THIS WORLD, which the control
  // found and which is worth more than the green line it replaces. `may_throw`
  // is ZERO over these four fixtures: not one of them contains a
  // `throw_statement`, so the relation the fifth layer's only independent
  // oracle is built on has NOTHING TO SAY here and `may_throw_only` = 0 is an
  // empty set agreeing with an empty set. That is exactly the shape this
  // repository names — an empty answer is a fact about the QUERY until proven
  // otherwise — arriving inside a check that was written to be the honest half.
  assert.equal(after.n('may_throw[code](F)'), 0,
    'the runtime and globals fixtures throw nothing, so the oracle is silent here');
  assert.equal(before.n('may_throw[code](F)'), 0);
  // THE LIVE VERSION IS ON THE PROBE, which is the only place in this file the
  // direction can be measured at all: three lines that throw, plus a caller, so
  // `may_throw` has rows and the effect layer must reproduce every one of them.
  const w = build([], [['throws.mjs', THROWS]]);
  assert.ok(w.n('may_throw[code](F)') >= 2, 'the control is live on the probe');
  assert.deepEqual(w.binds('may_throw_only[audit](F)'), [],
    'and the effect layer loses no throw the exception layer has');
  // AND EVEN THERE ITS SILENCE IS WEAKER THAN IT LOOKS. Two OTHER branches
  // found holes in `may_throw[code]` the same day, independently of this one
  // and of each other: it cannot see a label that did not arrive through
  // `resolves`, and it has NO CONSTRUCTION EDGE at all — `function g() { return
  // new C(); }` with `class C { x = boom(); }` throws and `may_throw(g)` is
  // false, because the propagation rides `nearest_v` and a field initialiser's
  // call has no enclosing function. So this line means "this layer lost nothing
  // THAT ORACLE CAN SEE". It is kept because it is still the only independent
  // relation the layer has; it is not leaned on, and what this file asserts
  // positively instead is `eff_exn_unexplained[audit]`, which compares the
  // effect layer against ITSELF and has a live mutant.
  // ...and the functions BY NAME, because a count cannot say whether the twelve
  // are the ones that call the host or twelve arbitrary ones.
  const named = (w: World) => new Set(w.q('eff_exn_only[audit](F)')
    .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  // Twelve, and every one of them makes an `io` host call in its own body:
  // `say` is `console.log`/`console.error`, `readIt` is `fs.readFileSync`,
  // `where` is `path.resolve` (the member override), `get` is `fetch`, `soon`
  // is `setTimeout`, `later` is `queueMicrotask`. None is a function that
  // merely calls another — the corpus is flat, which is why MUTANT M8 needs a
  // probe. `now` is NOT here: `performance.now` is `ndet`, and `ndet` does not
  // contain `exn`, which is the row that shows the widening follows the LATTICE
  // rather than the word "ambient".
  //
  // `neverRun` JOINED THEM 2026-09-09 AND IT IS THE ONLY ONE THAT MAKES NO HOST
  // CALL AT ALL. Its body is `return new Math()`, `Math` is a `namespace_object`
  // with no constructor interface, and section 8 reads that form and says the
  // construction throws. It is the first row in this set whose `exn` comes from
  // a DECLARATION'S SHAPE rather than from an effect table, and it is explained
  // by the same carrier closure as the other twelve — `eff_exn_unexplained` is
  // still empty below.
  assert.deepEqual([...named(after)].sort(),
    ['announce', 'get', 'isThere', 'later', 'matches', 'neverRun', 'readIt',
      'readLater', 'say', 'soon', 'space', 'where', 'writeLater']);
});

test('AND THE ANSWER IS NOT THAT EVERYTHING IS THE TOP', () => {
  // The standard the coercion branch set on the same day and refused its own
  // seed to meet: they had 141 operands the value layer never traced, tried
  // seeding the top of the lattice for them, and REFUSED IT on a measurement —
  // it takes `eff_label_unseen` from two labels to none and makes `effect_of`
  // `top` for most of the corpus. An answer that makes every cell say the same
  // thing is not an answer, and 251 unresolved call sites are the same
  // temptation in a different costume.
  //
  // THIS PACK SEEDS NOTHING FOR AN UNATTRIBUTED CALL. `ambient_owed[flow]` and
  // `eff_call_unattributed[flow]` name them and no label is contributed, so the
  // test is exactly the one that refusal implies: no function is pushed to the
  // top by the ambient attribution.
  const before = noAmbient();
  const after = base();
  const tops = (w: World) => [...new Set(w.q('effect_of[flow](F, top)')
    .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)))].sort();

  // THE CLAIM IS ABOUT THE CALL ATTRIBUTION, so it is measured against the call
  // attribution and not against the pack. Section 6's free-global read is one
  // rule and it is turned off by disconnecting its head; everything else in the
  // pack — the eight landmark translations, `concrete_denotes`, the construct
  // surface — stays exactly as it is. THIS is the sentence the refusal implies,
  // and it holds row for row.
  const callsOnly = build([{ file: AMB_RULES, find: G_READ, replace: G_READ_OFF }]);
  assert.deepEqual(tops(callsOnly), tops(before),
    'not one function reaches the top of the lattice because of an ambient CALL');
  assert.deepEqual(tops(callsOnly), ['all', 'shadowed'],
    'and the two that are at the top were at the top without this pack');

  // ...AND FOUR FUNCTIONS DO REACH THE TOP THROUGH SECTION 6, WHICH IS A
  // DIFFERENT FACT AND NOT THE ONE THE REFUSAL WAS ABOUT. It is printed here
  // instead of hidden because the shape of it is the finding.
  //
  // WHAT HAPPENED, measured 2026-09-09 across the merge that put a constructed
  // value's prototype in the tree. `fresh` is `new Map(); holder.set(k, v)`.
  // Before that merge `holder` was untraced, so `holder.set` was `read<global>`
  // and the function's row was <alloc, read<global>> = `st_global`; the free
  // global `Map` then contributed a `read<global>` THE ROW ALREADY HAD and this
  // pack moved nothing. After it, `may_be_node` reaches the `new_expression`,
  // so the same member read is `read<local>` — a STRICTLY BETTER answer — and
  // the row is <alloc, read<local>, read<global>>.
  //
  // AND THAT ROW HAS NO NAME BELOW THE TOP. Measured over the fourteen
  // landmarks: `top` is the only one containing all three of `alloc`,
  // `read<local>` and `read<global>`. So `top` here is the least named row
  // above a row that reads two heaps and writes neither — an over-approximation
  // that is honest about the lattice rather than a function that gave up. The
  // tell the paragraph above names still separates the two cases: a give-up
  // seeds the top FOR AN UNATTRIBUTED CALL, and `ambient_owed[flow]` is still
  // the in-tray it was — nothing was seeded for anything nobody attributed.
  //
  // WHOSE MOVE IT IS: naming a landmark between `st_local` and `top` is the
  // effect layer's, not this pack's, and it is the fifth cell in the lattice's
  // own queue rather than a row here.
  assert.deepEqual(tops(after),
    ['all', 'fresh', 'head', 'matches', 'padded', 'shadowed'],
    'the four the free-global read adds are these four, each a `new Global(...)` '
    + 'whose receiver the value layer now traces');
  assert.deepEqual(tops(after).filter((n) => !tops(callsOnly).includes(n)).sort(),
    ['fresh', 'head', 'matches', 'padded'],
    'and every one of them arrives through section 6 and none through a call');
  // ...AND `eff_label_unseen` EMPTYING IS NOT THE SAME MOVE. It goes from two
  // labels to none here as well, and the reason is the opposite one: `ndet`
  // arrives from `performance.now`, which facts/js-host.rofl attributes by name
  // and defends in a line of prose, and `write<global>` from a real assignment.
  // The tell that separates the two cases is this one — a seed that ANSWERS
  // moves the label set without moving the top set, and a seed that GIVES UP
  // moves both.
  assert.deepEqual(after.binds('eff_label_unseen[flow](L, H)'), []);
  assert.ok(before.n('eff_label_unseen[flow](L, H)') > 0,
    'the control is live: without the pack this corpus does not reach every label');
  // and the distribution stays a distribution rather than collapsing to a point
  const names = new Set(after.q('effect_of[flow](F, N)').map(([, n]) => n));
  assert.ok(names.size >= 5, `the corpus's functions take ${names.size} distinct effects`);
});

test('THE ORACLE IS NARROWED AND NOT DROPPED, and the direction is named', () => {
  const w = base();
  // `may_throw[code]` is seeded by `throw_statement` and nothing else. `io` is
  // `<st<global>, div, exn, ndet>`, so the moment an ambient call is attributed
  // `io` the enclosing function carries `exn` — and `console.log` really can
  // throw. So the row-for-row agreement the effect layer asserts over
  // `w_js_effects` is FALSE here, in one direction, for a reason that is this
  // pack rather than a defect in either relation.
  assert.deepEqual(w.binds('may_throw_only[audit](F)'), [],
    'this layer must not LOSE a throw the exception layer has — unchanged');
  assert.ok(w.n('eff_exn_only[audit](F)') > 0,
    'and it must gain some, or the ambient io attribution reached no function');
  assert.deepEqual(w.binds('eff_exn_unexplained[audit](F)'), [],
    'every function the effect layer calls throwing and may_throw does not '
    + 'reaches an ambient exn source, through the propagation rule\'s own closure');
});

// ===========================================================================
// 5. `identifier`, AND ITS CEILING

test('reading a FREE GLOBAL is read<global>, and a bare mention is not seen', () => {
  const w = base();
  // The third case of the `identifier` cell. The other two are already
  // rules/js-effects.rofl's: a name something reassigns is `read<local>`, and a
  // name nothing reassigns is a VALUE with no cell to read.
  const seeded = new Set(w.q('free_global[code](E, N, F)')
    .filter(([e]) => w.n(`eff_here[flow](${e}, read, global)`) === 1)
    .map(([, n]) => n));
  //
  // `globalThis` IS IN THE SET AND NO SURFACE NAMES IT, which is the sharpest
  // thing this rule says. The item's own note reads "a bare name is a local, an
  // import, or a free global (`read<global>`) ... and only the third needs the
  // surface"; measured, the third needs the surface only for what a CALL of it
  // DOES. Reading it is `read<global>` because it is free, whatever it turns
  // out to be — `globalThis` is a compiler intrinsic no `lib.es*.d.ts` declares
  // and it seeds the label exactly like `console` does.
  //
  // FOUR MORE than when this was written, and all four in the FIFTH reference
  // position: `Array`, `Intl`, `RegExp` and `String` are the callee of a `new`
  // in the globals fixture, which the merge that traces a constructed value's
  // prototype gave something to say about. `global_ref_position` always named
  // that position — what changed is the fixture that exercises it.
  assert.deepEqual([...seeded].sort(), ['Array', 'BigInt', 'Error', 'Intl', 'JSON',
    'Map', 'Math', 'Object', 'Promise', 'Reflect', 'RegExp', 'String', 'Symbol',
    'atob', 'console', 'document', 'fetch',
    'globalThis', 'performance', 'queueMicrotask', 'setTimeout', 'structuredClone']);
  assert.equal(w.n('ambient_binding(F, "globalThis", S)'), 0,
    'and it is bound to no surface at all, which is the two halves coming apart');
  // ...AND THE CEILING, ASSERTED BY NAME rather than left to be discovered.
  // `global_ref_position` in rules/js-globals.rofl names five positions a
  // reference can occupy; a BARE mention is in none of them, so
  // `n > 0 ? n : Infinity` in the globals fixture reads a global and seeds
  // nothing here. This rule inherits that limit exactly.
  assert.equal(w.n('free_global[code](E, "Infinity", F)'), 0,
    'a bare mention of a global is invisible to this layer, and that is stated');
  assert.ok(w.n('ast_name[code](N, "Infinity")') >= 1,
    'the control is live: the word IS in this corpus');
});

test('THE FRONTIER: the calls that stay unattributed, by SHAPE', () => {
  const w = base();
  // A shape and not a coordinate: `unresolved_call[code](C, S)` carries the
  // callgraph layer's own shape vocabulary, so this set moves when the MODEL
  // gains a case and not when somebody adds a line to a fixture.
  const shapes = [...new Set(w.q('eff_call_unattributed[flow](C)')
    .flatMap(([c]) => w.q(`unresolved_call[code](${c}, S)`).map(([s]) => s)))].sort();
  assert.deepEqual(shapes,
    ['s_identifier', 's_member_on_call', 's_member_on_ident', 's_member_on_new'],
    'a call on a value, a call on a call\'s result, a call on a name, and a call '
    + 'on a freshly constructed value — four shapes no surface can name, because '
    + 'the receiver is not ambient');
  // ...AND THE FOURTH ARRIVED THE WAY THIS SET IS SUPPOSED TO MOVE. It is a
  // MODEL case and not a fixture line: `s_member_on_new` is a shape the
  // callgraph layer could not produce until a constructed value reached its
  // prototype, and the moment it could, this frontier grew a row for it. A set
  // written over the shape vocabulary moves when the vocabulary does, which is
  // the whole reason it is not a count of call sites.
});

// ===========================================================================
// 6. THE TWO SURFACE ITEMS: WHAT A DECLARATION FILE CAN AND CANNOT SAY
//    (w_ambient_prototype_effects, w_ambient_es_intrinsic_effects)
//
// Both items are one question from two sides — a surface reaches a call site
// and no table says what its members do — and the two answers are OPPOSITE,
// which is why they were two items. The prototype one is YES and this section
// is the evidence; the intrinsic one is NO for the members and yes for exactly
// one consequence of the binding's FORM.

/** A STRING LITERAL RECEIVER, which the four fixtures do not have and which is
 *  the only shape that can measure the heap argument in section 7. `new
 *  String(s).substr(...)` is a CONSTRUCTED receiver and `may_be_node` reaches
 *  it; `'ab'.concat(x)` is a literal of a kind that is not a `node_value_kind`,
 *  so the value layer cannot trace it and `eff_heap_of` says `global`. */
const LITERAL_RECV = `
export function shout(s) { return 'ab'.concat(s); }
`;

test('THE MUTATING HALF IS A SET DIFFERENCE, AND THE FIVE THAT HAVE NO VIEW '
   + 'ARE A ROW', () => {
  const w = base();
  // THE NINE THE ITEM NAMED, DERIVED. `lib_member` minus `lib_readonly_member`
  // over a prototype that HAS a readonly view — two generated tables and one
  // rule body. The item asked whether this could be READ rather than typed and
  // said the honest answer may be no; it is yes, and the set is identical to
  // the list its own note writes out.
  assert.deepEqual(w.binds('lib_mutator(P, Key)'),
    ['array/copyWithin', 'array/fill', 'array/pop', 'array/push',
      'array/reverse', 'array/shift', 'array/sort', 'array/splice',
      'array/unshift']);
  assert.deepEqual(w.binds('lib_readonly_only[audit](P, Key)'), [],
    'the readonly view declares nothing the mutable interface does not, which '
    + 'is the property the subtraction rests on');
  // ...AND WHAT THE SOURCE CANNOT SAY, AS A POSITIVE ROW. Five of the six
  // builtin prototypes have no `Readonly` twin in any lib file, so this
  // construction is SILENT about them. That is not "they have no mutators", and
  // the difference is the whole reason the rule is guarded.
  assert.deepEqual(w.binds('amb_proto_unsplit[flow](P)'),
    ['bigint', 'boolean', 'number', 'regexp', 'string']);
});

test('THE HEAP IS WHY THIS IS NOT MORE ROWS IN SECTION 4, and it is structural', () => {
  const w = base();
  // `ambient_effect(Surface, Member, Name)` HAS NO HEAP COLUMN, and a builtin
  // prototype is the one surface whose effect is heap-parameterised: the
  // surface is ambient and the RECEIVER is a value in this program. So the row
  // can only be written where the model decides the heap without the site — and
  // it does, for exactly the prototypes every one of whose `kind_prototype`
  // kinds is a `node_value_kind`.
  assert.deepEqual(w.binds('amb_proto_heap(P, H)'), ['array/local', 'regexp/local']);
  assert.deepEqual(w.binds('amb_proto_heap_split[audit](P, M)'), [],
    'and no site contradicts it');
  // THE OTHER FOUR ARE NOT AN OVERSIGHT, MEASURED ON A PROBE. The four fixtures
  // reach the `string` prototype only through `new String(s)`, whose receiver
  // `may_be_node` traces — so this world CANNOT SEE the case the guard exists
  // for, and a survivor here would be a fact about the corpus. A string LITERAL
  // receiver is untraced and its heap is `global`, which is what a surface-grain
  // `wr_local` would have been wrong about.
  const p = build([], [['lit.mjs', LITERAL_RECV]]);
  const recv = p.q('amb_proto_recv[flow](M, P)').filter(([, x]) => x === 'string');
  const heaps = new Set(recv.flatMap(([m]) => p.q(`eff_heap_of[flow](${m}, H)`).map(([h]) => h)));
  assert.ok(heaps.has('global'),
    `a string literal receiver is untraced — got ${[...heaps].sort().join(' ')}`);
  assert.deepEqual(p.binds('amb_proto_heap(P, H)'), ['array/local', 'regexp/local'],
    'and the probe does not make `string` heap-decided');
  assert.deepEqual(p.binds('amb_proto_heap_split[audit](P, M)'), []);
});

test('AND THE MODEL NOW SAYS `new Array(n).fill(0)` WRITES', () => {
  // The point of the whole section, as the one thing that changed about a
  // FUNCTION. `padded` is `new Array(n).fill(0)`; before this rule the model
  // saw an allocation and a member READ and no write anywhere, because
  // `eff_here(_, write, _)` is seeded only by an assignment target and an
  // update expression. A mutator call is the third way to write and it had no
  // rule.
  const w = base();
  const before = build([{ file: AMB_RULES,
    find: `ambient_effect(P, Key, E) :- lib_mutator(P, Key), amb_proto_heap(P, H),
                             eff_of_label(write, H, E).`,
    replace: `amb_proto_write_off(P, Key, E) :- lib_mutator(P, Key), amb_proto_heap(P, H),
                             eff_of_label(write, H, E).` }]);
  const writers = (x: World) => [...new Set(x.q('eff_here[flow](N, write, local)')
    .flatMap(([n]) => x.q(`nearest_v[flow](F, ${n})`))
    .flatMap(([f]) => x.q(`fn_name[code](${f}, N)`).map(([nm]) => nm)))].sort();
  assert.deepEqual(writers(w).filter((n) => !writers(before).includes(n)), ['padded'],
    'one function gains a write of the local heap, and it is the one that fills an array');
});

test('THE INTRINSIC MEMBERS ARE NOT DERIVABLE, AND THE PROPOSED FLOOR IS '
   + 'REFUSED WITH A MEASUREMENT', () => {
  // `w_ambient_es_intrinsic_effects` names a derivable floor: `lib_static_shape`
  // separates a PropertySignature from a MethodSignature, and "a data static of
  // a frozen intrinsic is `total` with no judgement at all". IT WOULD HAVE BEEN
  // 87 ROWS THAT JOIN NOTHING. An OPERATION in this model comes from
  // `selects[flow]` on the callee of a CALL, so a data static can only be an
  // operation if something calls `Math.PI(...)` — and the whole point of the
  // data/method split is that nothing does.
  const w = base();
  const ops = new Set(w.q('concrete_effect[flow](C, S, Op)').map(([, s, o]) => `${s}.${o}`));
  const dataOps = [...ops].filter((k) => {
    const [s, o] = k.split('.');
    return w.n(`lib_static_shape("${s}", "${o}", data)`) === 1;
  });
  assert.deepEqual(dataOps, [],
    'not one data static is ever an operation, so a row for one denotes nothing');
  assert.ok(w.n('lib_static_shape(S, K, data)') > 50, 'the control is live: there are many');
  // ...AND THE IN-TRAY IS NOW IMMUNE TO IT, which is the reason the refusal is
  // not the only thing standing between it and a free set of rows. With the
  // refused rule IN, `ambient_owed` does not move by a single row, because it
  // ranges over the operations a call site REACHES and not over "has this
  // surface any attribution at all".
  const m = build([{ file: AMB_RULES,
    find: 'ambient_effect(P, Key, E) :- lib_mutator(P, Key), amb_proto_heap(P, H),',
    replace: `ambient_effect(S, Key, total) :- lib_static_shape(S, Key, data).
ambient_effect(P, Key, E) :- lib_mutator(P, Key), amb_proto_heap(P, H),` }]);
  assert.ok(m.n('ambient_effect(S, Op, E)') > w.n('ambient_effect(S, Op, E)'),
    'the control is live: the refused rule really does add rows');
  assert.deepEqual(m.binds('ambient_owed[flow](O, S)'), w.binds('ambient_owed[flow](O, S)'),
    'and not one surface leaves the in-tray for them');
  assert.deepEqual(m.binds('concrete_denotes[flow](S, Op, E)'), w.binds('concrete_denotes[flow](S, Op, E)'),
    'nor does one call site denote anything it did not denote before');
});

test('WHAT A FORM DOES SAY: `new Math()` THROWS, and the constructible ones '
   + 'are REFUSED for a named reason', () => {
  const w = base();
  // The one ECMAScript effect a declaration file states outright. `Math` is a
  // `namespace_object`: TypeScript declares no `MathConstructor` behind it, so
  // `new Math()` is a TypeError always — exact, not an over-approximation.
  // Seven globals are in that state and one of them has a site here.
  assert.deepEqual(w.binds('amb_not_constructible(Name)'),
    ['Atomics', 'Infinity', 'Intl', 'JSON', 'Math', 'NaN', 'Reflect']);
  assert.ok(w.binds('concrete_denotes[flow](S, Op, E)').includes('Math/construct/exn'));
  // AND THE CONSTRUCTIBLE ONES ARE NOT GIVEN `alloc`, which would have taken
  // four surfaces out of the in-tray in one line. `new Map()` allocates; `new
  // Array(n)`, `new String(s)` and `new RegExp(src)` allocate AND throw, on a
  // bad length, a symbol and a bad pattern. The lattice's least name containing
  // both labels is measured here rather than asserted in prose, and it is `io`
  // — so the two available answers are an under-approximation and a claim that
  // `new Map()` does input and output.
  assert.deepEqual(w.binds('eff_join(alloc, exn, N)'), ['io'],
    'there is no landmark between `alloc` and `io`, which is why the four stay owed');
  assert.deepEqual(w.binds('ambient_owed[flow](O, S)')
    .filter((r) => ['es_intrinsic/Array', 'es_intrinsic/Map', 'es_intrinsic/RegExp',
      'es_intrinsic/String'].includes(r)),
    ['es_intrinsic/Array', 'es_intrinsic/Map', 'es_intrinsic/RegExp', 'es_intrinsic/String'],
    'and they are owed BY NAME rather than silently under-approximated');
});

// ===========================================================================
// 7. THE MUTANTS
//
// Chosen by asking WHERE THIS CHECK IS STRUCTURALLY UNABLE TO LOOK. Three
// survive and each survivor is a different KIND of survival, which is the
// distinction CLAUDE.md asks for: M1 survives because the two arms it splits
// AGREE, M5 survives because of the corpus, and M4 survives because the
// difference it makes is in ANOTHER world's corpus and was measured there.

test('MUTANT M1: the identity arm loses its guard — SURVIVES, and the arms agree', () => {
  // Targets: that `eff_of_host(A, A)` is restricted to atoms that are not
  // labels. Without the guard, `alloc`, `exn`, `div` and `ndet` are derived
  // twice — once by the closure and once by the identity — and both arms give
  // the SAME name, so the relation does not move.
  const m = build([{ file: AMB_RULES,
    find: 'eff_of_host(A, A)    :- host_effect_atom(A), eff_name(A), not eff_label(A, _).',
    replace: 'eff_of_host(A, A)    :- host_effect_atom(A), eff_name(A).' }]);
  assert.deepEqual(m.binds('eff_of_host(A, N)'), base().binds('eff_of_host(A, N)'),
    'SURVIVES: the closure and the identity agree on every atom that is both');
  assert.deepEqual(m.binds('host_atom_two_names[audit](A, X, Y)'), [],
    'and the ambiguity audit is structurally unable to see an agreement');
});

test('MUTANT M2: the ambient heap is LOCAL — the denotation set kills it', () => {
  // Targets: that an ambient surface is not this program's heap. Nothing in the
  // lattice audits cares, `eff_label_unseen` stays empty because member reads
  // seed read<global> anyway, and no COUNT moves — the denotation set is what
  // sees it.
  const m = build([{ file: AMB_RULES, find: 'amb_heap(global).', replace: 'amb_heap(local).' }]);
  assert.notDeepEqual(m.binds('eff_of_host(A, N)'), base().binds('eff_of_host(A, N)'),
    'KILLED: read no longer denotes rd_global');
  assert.ok(m.binds('concrete_denotes[flow](S, Op, E)').includes('node:os/cpus/rd_local'),
    'and the call site denotes the wrong heap, by name');
});

test('MUTANT M3: the member override dropped — path.resolve goes total', () => {
  // Targets: that `member_effect[code]`'s override survives the translation.
  // `node:path` is total and `path.resolve` reads `process.cwd()`; a model that
  // dated the effect by the MODULE would be wrong about the one member of that
  // module anybody's correctness depends on.
  const m = build([{ file: AMB_RULES,
    find: 'ambient_effect(Spec, Key, E) :- member_effect[code](Spec, Key, A), eff_of_host(A, E).',
    replace: `ambient_effect(Spec, Key, E) :- host_module_member(node, Spec, Key),
                                host_module_effect(node, Spec, A), eff_of_host(A, E).` }]);
  assert.ok(!m.binds('concrete_denotes[flow](S, Op, E)').includes('node:path/resolve/io'),
    'KILLED: the override is gone and resolve reads as pure string algebra');
});

test('MUTANT M4: the global door reads host_global_ref — SURVIVES HERE, and it is measured elsewhere', () => {
  // Targets: the reference-position restriction. `host_global_ref[code]` joins
  // `ident_in[code]` with no position test, so a PROPERTY name of a matching
  // word qualifies. Over THIS corpus the two relations agree; over the five
  // shared call fixtures `host_global_ref` reports `length` and `toString` as
  // references to browser globals, which is why the pack reads `free_global`.
  //
  // THE SURVIVAL IS A PROPERTY OF THIS CORPUS AND IS STATED AS ONE, which is
  // the third kind of survivor the repository asks to be told apart from a hole
  // in the check: the difference is real, it is in another world, and this
  // file's world cannot see it.
  const m = build([{ file: AMB_RULES,
    find: 'ambient_binding(File, Name, Name) :- free_global[code](_, Name, File), host_global(_, Name).',
    replace: `ambient_binding(File, Name, Name) :- host_global_ref[code](E, _, Name),
                                     ast_node[code](E, _, File, _).` }]);
  assert.deepEqual(m.binds('ambient_owed[flow](O, S)'), base().binds('ambient_owed[flow](O, S)'),
    'SURVIVES: no property name in these four files spells a host global');
  assert.deepEqual(m.binds('concrete_denotes[flow](S, Op, E)'), base().binds('concrete_denotes[flow](S, Op, E)'));
});

test('MUTANT M5: a construction that RESOLVES is treated as ambient — SURVIVES by the corpus', () => {
  // Targets: `not resolved_site[code](X)` on the construction arm. The
  // constructor edge in rules/js-callgraph.rofl resolves `new Box()` to a class
  // in this program, and such a `new` is not ambient. These four files construct
  // `Map` and `Math` — both free globals — and no class of their own through a
  // free name, so the negation has nothing to remove here.
  const m = build([{ file: AMB_RULES,
    find: `amb_construct[flow](X, Name) :- transfer_site[code](X, new_expression),
                                not resolved_site[code](X),`,
    replace: `amb_construct[flow](X, Name) :- transfer_site[code](X, new_expression),` }]);
  assert.deepEqual(m.binds('concrete_effect[flow](C, S, Op)'), base().binds('concrete_effect[flow](C, S, Op)'),
    'SURVIVES: every `new` on a free name in this corpus is already unresolved');
  // ...and the guard is not dead: the relation it reads has rows here, so the
  // survival is about which nodes they are and not about an empty premise.
  assert.ok(base().n('resolved_site[code](X)') >= 1, 'the control is live');
});

test('MUTANT M6: the ES intrinsic door removed — the IN-TRAY kills it', () => {
  // Targets: that this model NAMES what it cannot answer. Without the ES arm,
  // `Math.max` and `JSON.parse` are not ambient at all — they simply vanish from
  // every relation, which is the silence the frontier exists to replace. No
  // audit goes red, `concrete_denotes` does not move, and the model looks
  // exactly as correct with a tenth of the question missing.
  const m = build([{ file: AMB_RULES,
    find: 'ambient_binding(File, Name, Name) :- free_global[code](_, Name, File), lib_global(Name, _, _).',
    replace: '' }]);
  // THE ATTRIBUTED HALF MOVES BY EXACTLY ONE ROW NOW, AND IT DID NOT ON
  // 2026-09-09 WHEN THIS MUTANT WAS WRITTEN. That is the mutant getting
  // STRONGER rather than the claim weakening, and the row says why: section 8
  // reads `lib_global`'s FORM and attributes `new Math()` an `exn`, so one
  // ECMAScript pair is now denoted and it goes with the door. Nine of the ten
  // surfaces still vanish in silence, which is the sentence this mutant is
  // about, so the difference is asserted as a NAMED ROW rather than allowed to
  // stand as an inequality.
  const lost = base().binds('concrete_denotes[flow](S, Op, E)')
    .filter((r) => !m.binds('concrete_denotes[flow](S, Op, E)').includes(r));
  assert.deepEqual(lost, ['Math/construct/exn'],
    'the attributed half loses ONE row, and everything else about the ES '
    + 'surface goes without a single relation saying so');
  // The RESIDUE is the two origins the ES arm does not carry, and it grew by the
  // two prototypes a constructed receiver now reaches — `regexp` and `string`
  // arrive through `new RegExp(...).test(...)` and `new String(s).substr(...)`,
  // which is the same growth the in-tray shows and not a weakening of the kill:
  // every ES intrinsic still leaves the set entirely.
  assert.deepEqual(m.binds('ambient_owed[flow](O, S)'),
    ['builtin_prototype/array', 'builtin_prototype/regexp',
     'builtin_prototype/string', 'host_runtime/atob'],
    'KILLED: the ECMAScript surface stops being owed and starts being invisible');
  // ...AND WHAT LEAVES, AS A SET AND NOT A COUNT. A number here is the trap this
  // repository names: it moves when a fixture gains a global and says nothing
  // about which door closed. The DIFFERENCE between the two in-trays is the
  // sentence, and every row of it is an `es_intrinsic`.
  const gone = base().binds('ambient_owed[flow](O, S)')
    .filter((r) => !m.binds('ambient_owed[flow](O, S)').includes(r));
  assert.deepEqual(gone.filter((r) => !r.startsWith('es_intrinsic/')), [],
    'only the ECMAScript origin leaves, and it leaves entirely');
  assert.deepEqual(m.binds('ambient_owed[flow](O, S)').filter((r) => r.startsWith('es_intrinsic/')), [],
    'not one ES intrinsic is owed once the door is gone — they are invisible instead');
  assert.ok(gone.length > 0, 'the control is live: they are owed before the door is removed');
});

test('MUTANT M7: `read<global>` for a free global dropped — the seeded set kills it', () => {
  // Targets: the `identifier` cell's third case. A COUNT of `eff_here(_, read,
  // global)` would have moved and said nothing, because member reads on an
  // untraced receiver seed the same label; the set of NAMES that seed it is
  // what names the loss.
  const m = build([{ file: AMB_RULES, find: G_READ, replace: '' }]);
  const seeded = m.q('free_global[code](E, N, F)')
    .filter(([e]) => m.n(`eff_here[flow](${e}, read, global)`) === 1).map(([, n]) => n);
  assert.deepEqual([...new Set(seeded)].sort(), [],
    'KILLED: not one free global reference contributes a read of the global heap');
});

// THE CARRIER CLOSURE HAS NO SITE IN THIS CORPUS, and a capability nothing
// exercises cannot go red — which this repository forbids by name. The four
// fixtures are FLAT: every one of them makes its own host call and none of them
// calls a local function that makes one, so `amb_exn_carrier`'s second arm
// fires nowhere and MUTANT M8 survives against the honest world. Measured, not
// assumed: with the arm deleted, `eff_exn_unexplained[audit]` is still empty.
// So the mutant is run against a PROBE that has the shape, and the survival
// against the corpus is recorded beside the kill.
const INDIRECT = `
export function inner(x) { console.log(x); }
export function outer(x) { return inner(x); }
`;

/** ...and a probe that THROWS, because `may_throw[code]` is ZERO over the four
 *  fixtures of this world — none of them contains a `throw_statement` — so the
 *  direction `may_throw_only[audit]` measures cannot be measured here without
 *  one. Found by its own control rather than assumed. */
const THROWS = `
export function boom(x) { if (x) { throw new Error('x'); } return 0; }
export function caller(x) { return boom(x); }
`;

test('the carrier closure is EXERCISED, on a probe rather than in a comment', () => {
  const w = build([], [['indirect.mjs', INDIRECT]]);
  // `outer` has no ambient call of its own; it carries `exn` because `inner`
  // does, through exactly the propagation rule `eff_latent` uses.
  const names = new Set(w.q('amb_exn_carrier[flow](F)')
    .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  assert.ok(names.has('inner') && names.has('outer'),
    `the closure reaches a caller of a caller — got ${[...names].sort().join(' ')}`);
  assert.deepEqual(w.binds('eff_exn_unexplained[audit](F)'), [],
    'and the narrowed oracle is still empty with the indirect case in');
});

test('MUTANT M8: the exn carrier stops following calls — SURVIVES the corpus, dies on the probe', () => {
  // Targets: that the repaired oracle follows the CALL GRAPH rather than only
  // the site. A function whose own body has no ambient call but whose callee
  // has one carries `exn` through `eff_latent`, and without the closure arm it
  // is an unexplained divergence.
  const cut = { file: AMB_RULES,
    find: `amb_exn_carrier[flow](F) :- amb_exn_carrier[flow](G), resolves[code](C, G),
                            nearest_v[flow](F, C), not eff_discharged_at[code](C, exn).`,
    replace: '' };
  const flat = build([cut]);
  assert.deepEqual(flat.binds('eff_exn_unexplained[audit](F)'), [],
    'SURVIVES the four fixtures: not one of them calls a local function that calls the host');
  const probed = build([cut], [['indirect.mjs', INDIRECT]]);
  const lost = new Set(probed.q('eff_exn_unexplained[audit](F)')
    .flatMap(([f]) => probed.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  assert.ok(lost.has('outer'),
    `KILLED by the probe: got ${[...lost].sort().join(' ')}`);
});

test('the preorder the map induces is bounded by the CALL SITES, not by the surface', () => {
  const w = base();
  // `concrete_leq[flow]` ranges over `concrete_denotes[flow]` and not over
  // `ambient_effect`, and that is a repair this item paid for rather than a
  // preference: the first form was |ambient_effect| squared, which is about
  // 330 000 rows at 571, and `this.rows` in src/engine.ts is a GLOBAL counter
  // against a 500 000-row wall. It was invisible while `ambient_effect` was
  // empty — 0 x 0 is 0 — and the world that caught it is
  // test/js-attrs.test.ts, the one that loads every JS pack in the tree.
  // Recorded as f_a_squared_relation_over_an_empty_table_is_invisible_until_the_table_fills.
  const denotes = w.n('concrete_denotes[flow](S, Op, E)');
  assert.ok(w.n('concrete_leq[flow](S1, O1, S2, O2)') <= denotes * denotes,
    'the preorder is bounded by the pairs a call site reaches, squared');
  assert.ok(w.n('ambient_effect(S, K, E)') > denotes * denotes,
    'and the surface table is larger than that bound, so the narrowing is real here');
  // ...AND IT STILL ANSWERS THE QUESTION IT EXISTS FOR: two concrete names that
  // are incomparable AS NAMES, compared through what they denote.
  assert.equal(w.n('concrete_leq[flow]("node:path", "join", "node:fs", "readFileSync")'), 1,
    'path:join is total, fs:readFileSync is io, and total <= io');
  assert.equal(w.n('concrete_leq[flow]("node:fs", "readFileSync", "node:path", "join")'), 0,
    'and not the other way round');
});

test('MUTANT M9: a plain call writes the surface in the operation column', () => {
  // Targets: the one relation that exists to tell the four site shapes apart.
  // `host_site[code]` in rules/js-host.rofl says in so many words that writing
  // the name in BOTH columns would make a member call and a plain call
  // indistinguishable; this is that mistake made in the effect layer.
  const m = build([{ file: AMB_RULES,
    find: 'eff_operation[flow](C, itself) :- amb_global_call[flow](C, _).',
    replace: 'eff_operation[flow](C, Name) :- amb_global_call[flow](C, Name).' }]);
  assert.ok(!m.binds('concrete_denotes[flow](S, Op, E)').includes('fetch/itself/io'),
    'KILLED: a plain call of a global denotes nothing');
  assert.ok(m.binds('concrete_unmapped[flow](S, Op)').includes('fetch/fetch'),
    'and lands in the residue under a member name that is its own surface');
});

// ---------------------------------------------------------------------------
// ...AND THE THREE FOR THE TWO SURFACE ITEMS, chosen by the same question:
// where are THESE rules structurally unable to look. M11 is the one that
// answers it — the guard it removes has no site in this world at all.

test('MUTANT M10: `lib_mutator` loses its readonly-view guard — the in-tray kills it', () => {
  // Targets: that a prototype with NO `Readonly` twin yields no mutators.
  // Without the guard the negation inverts the source's meaning wholesale —
  // every member of every prototype the lib files declare no twin for becomes a
  // mutator, because `not lib_readonly_member(P, Key)` is true of all of them.
  // It fails in the direction that LOOKS productive: `regexp.test` acquires an
  // effect and a surface leaves the in-tray.
  const m = build([{ file: AMB_RULES,
    find: `lib_mutator(P, Key) :- lib_member(P, Key, _), lib_readonly_view(P, _),
                       not lib_readonly_member(P, Key).`,
    replace: `lib_mutator(P, Key) :- lib_member(P, Key, _),
                       not lib_readonly_member(P, Key).` }]);
  assert.ok(m.binds('concrete_denotes[flow](S, Op, E)').includes('regexp/test/wr_local'),
    'KILLED: `RegExp.prototype.test` is called a mutator because no ReadonlyRegExp exists');
  assert.ok(!m.binds('ambient_owed[flow](O, S)').includes('builtin_prototype/regexp'),
    'and a surface leaves the in-tray for a reason nothing in the source supports');
});

test('MUTANT M11: every prototype is heap-decided — SURVIVES the corpus, dies on a probe', () => {
  // Targets: `not amb_proto_untraced(P)` — the structural argument that only a
  // prototype whose every `kind_prototype` kind is a `node_value_kind` can have
  // its heap decided without the site.
  //
  // THIS IS WHERE THE CHECK CANNOT LOOK, and it is the reason the probe exists.
  // The four fixtures reach the `string` prototype ONLY through `new String(s)`,
  // whose receiver `may_be_node` traces, so `amb_proto_heap_split[audit]` has no
  // site that could contradict the wrong claim. The audit is honest and blind at
  // the same time, and a survivor here would have been a statement about the
  // fixtures.
  const M = 'amb_proto_heap(P, local) :- builtin_prototype(P), not amb_proto_untraced(P).';
  const OFF = 'amb_proto_heap(P, local) :- builtin_prototype(P).';
  const m = build([{ file: AMB_RULES, find: M, replace: OFF }]);
  assert.deepEqual(m.binds('amb_proto_heap_split[audit](P, M)'), [],
    'SURVIVES over the four fixtures: every prototype receiver in them is traced');
  assert.ok(m.n('amb_proto_recv[flow](M, P)') >= 4, 'the control is live: there are receivers');
  const p = build([{ file: AMB_RULES, find: M, replace: OFF }], [['lit.mjs', LITERAL_RECV]]);
  const split = p.q('amb_proto_heap_split[audit](P, M)').map(([x]) => x);
  assert.deepEqual([...new Set(split)].sort(), ['string'],
    'KILLED on a string LITERAL receiver, which is untraced and therefore global');
});

test('MUTANT M12: `construct` counts as an off-surface member — the in-tray kills it', () => {
  // Targets: `not amb_operation_word(Op)` in `ambient_off_surface`. `itself` and
  // `construct` name a call and a `new`; no declaration file carries them as
  // KEYS, so without the guard every construction of an ES global is "not on the
  // surface" and several surfaces leave the in-tray at once — quietly, and in
  // the direction that makes the queue look shorter.
  const m = build([{ file: AMB_RULES,
    find: `ambient_off_surface[flow](S, Op) :- concrete_effect[flow](_, S, Op),
                                    surface_origin(S, es_intrinsic),
                                    not amb_operation_word(Op),
                                    not lib_static(S, Op, _).`,
    replace: `ambient_off_surface[flow](S, Op) :- concrete_effect[flow](_, S, Op),
                                    surface_origin(S, es_intrinsic),
                                    not lib_static(S, Op, _).` }]);
  const gone = base().binds('ambient_owed[flow](O, S)')
    .filter((r) => !m.binds('ambient_owed[flow](O, S)').includes(r));
  assert.deepEqual(gone,
    ['es_intrinsic/Array', 'es_intrinsic/BigInt', 'es_intrinsic/Map',
      'es_intrinsic/RegExp', 'es_intrinsic/String'],
    'KILLED: the surfaces a construction or a bare call is the only route to '
    + 'stop being owed, because a `new` is not a member name');
});
