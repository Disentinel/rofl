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
  // Seventeen (surface, member) pairs with a landmark, and NOT ONE of them was
  // typed anywhere in this tree: the module half comes from `member_effect[code]`
  // — twenty-two module defaults with seven member overrides subtracted — and
  // the global half from `host_global_effect`, both in facts/js-host.rofl and
  // both written for the runtime layer before this pack existed.
  assert.deepEqual(w.binds('concrete_denotes[flow](S, Op, E)'), [
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
  assert.deepEqual(w.binds('ambient_owed[flow](O, S)'), [
    'builtin_prototype/array',
    'es_intrinsic/BigInt', 'es_intrinsic/Error', 'es_intrinsic/JSON',
    'es_intrinsic/Map', 'es_intrinsic/Math', 'es_intrinsic/Object',
    'es_intrinsic/Promise', 'es_intrinsic/Reflect', 'es_intrinsic/Symbol',
    'host_runtime/atob',
  ]);
  // ...and the pairs under it, which is rules/js-effects.rofl's own residue
  // relation with rows in it for the first time.
  assert.deepEqual(w.binds('concrete_unmapped[flow](S, Op)'), [
    'BigInt/itself', 'Error/captureStackTrace', 'JSON/parse', 'JSON/stringify',
    'Map/construct', 'Math/construct', 'Math/max', 'Object/entries',
    'Object/hasOwn', 'Object/keys', 'Promise/allSettled', 'Promise/any',
    'Reflect/ownKeys', 'Symbol/for', 'array/toSorted', 'atob/itself',
  ]);
  // WHICH SURFACES THE MODEL CANNOT LIST THE MEMBERS OF, and it is exactly the
  // globals. `scanners/host_lib.ts` walks a MODULE's properties through the
  // checker and stops at the NAMES of the globals, so `console`'s members are
  // the ones a program selects rather than the ones `Console` declares. Every
  // unenumerated surface is a global and no module is one.
  const un = w.binds('ambient_unenumerated[flow](S)');
  assert.deepEqual(un.filter((s) => s.startsWith('node:')), [],
    'a module surface is enumerated by the checker');
  assert.ok(un.includes('console') && un.includes('process') && un.includes('crypto'),
    `the global surfaces are not — got ${un.join(' ')}`);
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
  assert.deepEqual([...named(after)].sort(),
    ['announce', 'get', 'isThere', 'later', 'matches', 'readIt', 'readLater',
      'say', 'soon', 'space', 'where', 'writeLater']);
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
  const tops = (w: World) => new Set(w.q('effect_of[flow](F, top)')
    .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  assert.deepEqual([...tops(after)].sort(), [...tops(before)].sort(),
    'not one function reaches the top of the lattice because of an ambient call');
  assert.deepEqual([...tops(after)].sort(), ['all', 'shadowed'],
    'and the two that are at the top were at the top without this pack');
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
  assert.deepEqual([...seeded].sort(), ['BigInt', 'Error', 'JSON', 'Map', 'Math', 'Object',
    'Promise', 'Reflect', 'Symbol', 'atob', 'console', 'document', 'fetch',
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
  assert.deepEqual(shapes, ['s_identifier', 's_member_on_call', 's_member_on_ident'],
    'a call on a value, a call on a call\'s result, and a call on a name — '
    + 'three shapes no surface can name, because the receiver is not ambient');
});

// ===========================================================================
// 6. THE MUTANTS
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
  assert.deepEqual(m.binds('concrete_denotes[flow](S, Op, E)'), base().binds('concrete_denotes[flow](S, Op, E)'),
    'the ATTRIBUTED half does not move, which is why a count of it would sleep');
  assert.deepEqual(m.binds('ambient_owed[flow](O, S)'), ['builtin_prototype/array', 'host_runtime/atob'],
    'KILLED: the ECMAScript surface stops being owed and starts being invisible');
});

test('MUTANT M7: `read<global>` for a free global dropped — the seeded set kills it', () => {
  // Targets: the `identifier` cell's third case. A COUNT of `eff_here(_, read,
  // global)` would have moved and said nothing, because member reads on an
  // untraced receiver seed the same label; the set of NAMES that seed it is
  // what names the loss.
  const m = build([{ file: AMB_RULES,
    find: 'eff_here[flow](E, read, global) :- free_global[code](E, _, _).',
    replace: '' }]);
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
