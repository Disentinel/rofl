// js-host.test.ts — THE RUNTIME LAYER, measured.
//
// Four things are checked here and they are different things:
//
//   1. the GENERATOR is REPRODUCIBLE — scanners/host_lib.ts is re-run and its
//      output compared byte for byte against the committed pack, so a hand edit
//      to facts/js-host-surface.rofl is a failing test rather than a silent
//      divergence;
//   2. the TWO DOORS derive what they claim — a module local, a global
//      reference, and the four call shapes — as NAMED SETS, never as counts;
//   3. the COMPOSITION and the COMPARISON agree. `has_api[audit]`, walked over
//      `runtime_includes`, must equal `arrived_by[code]`, computed by one semver
//      comparison. That identity is the oracle for the whole second axis;
//   4. the GATES, each with a PLANTED DEFECT proving it can say no, plus the
//      mutants that ask where each check is structurally unable to LOOK.
//
// EVERY ORACLE IS A NAMED SET AND NONE OF THEM CARRIES A LINE NUMBER. A set
// whose elements embed a coordinate moves when somebody edits a part of the
// file the assertion is not about — HANDOFF records `BIG_TOTAL@shapes.ts:480`
// as the case that taught it — so the effect oracle is keyed by
// `effect:origin.key` and the site oracle by `origin.key`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { base, build, read, ROOT, PACKS, type World } from './js-host-world.ts';
import { emit, scanHosts } from '../scanners/host_lib.ts';
import { mutant } from './helpers/mutant.ts';

const set = (xs: string[]): Set<string> => new Set(xs);
const sorted = (s: Set<string>): string[] => [...s].sort();

// ---------------------------------------------------------------------------
// 1. THE GENERATED PACK IS REPRODUCIBLE

test('facts/js-host-surface.rofl is exactly what scanners/host_lib.ts emits', () => {
  // THE COMMAND IS IN THE PACK'S OWN HEADER, and this is the check that keeps
  // it true: `node --experimental-strip-types scanners/host_lib.ts`.
  const regenerated = emit(scanHosts(ROOT));
  const committed = read('facts/js-host-surface.rofl');
  assert.equal(regenerated, committed,
    'the committed surface pack differs from the generator — re-run\n' +
    '  node --experimental-strip-types scanners/host_lib.ts');
});

test('the two hosts are separated, and the separation is the reason for the host column', () => {
  const w = base();
  // `q` RETURNS ONE CELL PER CAPITAL-LETTER VARIABLE and a CONSTANT in the
  // literal takes no column, so `host_global(node, N)` is ONE cell and not two.
  // The fifth wrong destructure of a positional result in this repository —
  // test/js-corpus-world.ts records four — and the only reason it was caught is
  // that an empty set failed a named-set assertion rather than a count.
  const nodeG = set(w.q('host_global(node, N)').flat());
  const domG = set(w.q('host_global(browser, N)').flat());
  // NAMED SETS, and these two are named by the SOURCE rather than by this file:
  // they are what `@types/node` and `lib.dom.d.ts` declare with the ECMAScript
  // baseline subtracted. The assertions below are about their RELATION, which
  // is what a hostless table would destroy.
  const nodeOnly = sorted(new Set([...nodeG].filter((n) => !domG.has(n))));
  assert.deepEqual(nodeOnly,
    ['Buffer', '__dirname', '__filename', 'clearImmediate', 'exports', 'gc',
      'global', 'module', 'process', 'require', 'setImmediate'],
    'the globals node has and the browser does not');
  // ...and the other direction is the one the brief warned about: most of
  // lib.dom.d.ts is NOT in node. Asserted as membership rather than as a count,
  // because the count moves with TypeScript's version and the membership does
  // not: a browser that gained `document` in node would be news.
  for (const n of ['document', 'window', 'alert', 'XMLHttpRequest', 'localStorage'])
    assert.ok(domG.has(n), `${n} is a browser global`);
  for (const n of ['document', 'window', 'alert', 'XMLHttpRequest'])
    assert.ok(!nodeG.has(n), `${n} is NOT a node global`);
  // `localStorage` IS in node's surface (22, experimental) and is the row that
  // makes this a measurement rather than a list of things browsers have.
  assert.ok(nodeG.has('localStorage'), 'localStorage is in node 22 and this pack says so');
});

// ---------------------------------------------------------------------------
// 2. THE TWO DOORS

test('the module door binds every import form the fixture writes', () => {
  const w = base();
  assert.deepEqual(sorted(set(w.q('host_module_ns[code](F, L, S)').map((r) => `${r[1]}=${r[2]}`))),
    ['fs=node:fs', 'os=node:os', 'path=node:path'],
    'namespace, default and the BARE spelling of a builtin');
  assert.deepEqual(sorted(set(w.q('host_module_named[code](F, L, S, K)').map((r) => `${r[1]}=${r[2]}.${r[3]}`))),
    ['join=node:path.join',
      'notAMemberOfPath=node:path.notAMemberOfPath',
      'rf=node:fs/promises.readFile',
      'writeFile=node:fs/promises.writeFile'],
    'the renamed import keeps its LOCAL name and its IMPORTED key apart');
});

test('an import naming something the module does not export is a row', () => {
  const w = base();
  assert.deepEqual(sorted(set(w.q('host_import_unknown[audit](F, S, K)').map((r) => `${r[1]}.${r[2]}`))),
    ['node:path.notAMemberOfPath']);
});

test('the global door reads a name NOTHING in the file binds', () => {
  const w = base();
  const inFile = (f: string): string[] => sorted(set(
    w.q('host_global_ref[code](E, H, N)')
      .filter(([e]) => w.q(`ast_node[code](${e}, K, File, L)`)[0]?.[1] === f)
      .map(([, , n]) => n)));
  assert.deepEqual(inFile('runtime.mjs'),
    ['atob', 'console', 'document', 'fetch', 'performance', 'setTimeout', 'structuredClone']);
  // ...AND THE NEGATION IS SELECTIVE. shadow.mjs binds `console` (declarator),
  // `fetch` (function declaration), `URL` (class), `performance` (import local)
  // and `structuredClone` (parameter) — one per binding form — and leaves
  // `queueMicrotask` alone. A rule with no negation and a rule whose negation
  // is total look identical on a corpus that never shadows anything.
  assert.deepEqual(inFile('shadow.mjs'), ['queueMicrotask']);
});

test('a global present in one host and absent from the other is a row', () => {
  const w = base();
  assert.deepEqual(sorted(set(w.q('host_global_only_in[code](E, H, N)').map((r) => `${r[1]}:${r[2]}`))),
    ['browser:document'],
    'the row a flat, hostless global table could not hold');
});

test('the four call shapes all reach the surface', () => {
  const w = base();
  assert.deepEqual(sorted(set(w.q('host_module_call[code](C, S, K)').map((r) => `${r[1]}.${r[2]}`))),
    ['node:fs.exists', 'node:fs.globSync', 'node:fs.readFileSync', 'node:fs.statfs',
      'node:fs/promises.readFile', 'node:fs/promises.writeFile',
      'node:os.cpus', 'node:os.machine', 'node:path.join', 'node:path.resolve'],
    'a member call on a namespace AND a plain call of a named import');
  assert.deepEqual(sorted(set(w.q('host_member_call[code](C, H, N, K)')
    .filter(([, h]) => h === 'node').map((r) => `${r[2]}.${r[3]}`))),
    ['console.error', 'console.log', 'performance.now']);
  assert.deepEqual(sorted(set(w.q('host_global_call[code](C, H, N)')
    .filter(([, h]) => h === 'node').map(([, , n]) => n))),
    ['atob', 'fetch', 'queueMicrotask', 'setTimeout', 'structuredClone']);
});

// ---------------------------------------------------------------------------
// 3. THE EFFECT ROW — the shape the effect layer joins against

test('every runtime call carries an effect, or is named in the frontier', () => {
  const w = base();
  // KEYED BY `effect:origin.key`, NOT BY A LINE. Two calls to `path.join` at two
  // lines are ONE element here, which is the point: this set says what the model
  // attributes, and it must not move when a fixture gains a second call.
  assert.deepEqual(sorted(set(w.q('host_call_effect[audit](C, E, W)').flatMap(([c, e, why]) => {
    const s = w.q(`host_site[code](${c}, H, O, K)`)[0];
    return s ? [`${e}:${s[1]}.${s[2]}:${why}`] : [];
  }))), [
    'alloc:structuredClone.itself:by_global',
    'io:console.error:by_global',
    'io:console.log:by_global',
    'io:fetch.itself:by_global',
    'io:node:fs.exists:by_module',
    'io:node:fs.globSync:by_module',
    'io:node:fs.readFileSync:by_module',
    'io:node:fs.statfs:by_module',
    'io:node:fs/promises.readFile:by_module',
    'io:node:fs/promises.writeFile:by_module',
    'io:node:path.resolve:by_member',
    'io:queueMicrotask.itself:by_global',
    'io:setTimeout.itself:by_global',
    'ndet:performance.now:by_global',
    'read:node:os.cpus:by_module',
    'read:node:os.machine:by_module',
    'total:node:path.join:by_module',
  ]);
});

test('a member row WINS over its module default, and both provenances appear', () => {
  const w = base();
  // THE ROW THE OVERRIDE TABLE EXISTS FOR. `node:path` is total; `path.resolve`
  // reads process.cwd() and is io. If the negation in the `by_module` arm went
  // away, `resolve` would carry BOTH and every consumer would have to choose.
  const eff = (spec: string, key: string): string[] => sorted(set(
    w.q('host_call_effect[audit](C, E, W)').flatMap(([c, e]) => {
      const s = w.q(`host_site[code](${c}, H, O, K)`)[0];
      return s && s[1] === spec && s[2] === key ? [e] : [];
    })));
  assert.deepEqual(eff('node:path', 'resolve'), ['io']);
  assert.deepEqual(eff('node:path', 'join'), ['total']);
});

test('a runtime call with no effect row is NAMED and not silently total', () => {
  const w = base();
  assert.deepEqual(sorted(set(w.q('host_call_uneffected[audit](C, O, K)').map((r) => `${r[1]}.${r[2]}`))),
    ['atob.itself'],
    'the frontier is a row in this corpus rather than a promise');
});

test('every effect atom used is one the table declares', () => {
  const w = base();
  const used = set(w.q('host_effect_used[audit](E)').flat());
  const declared = set(w.q('host_effect_atom(E)').flat());
  for (const e of used) assert.ok(declared.has(e), `${e} is a declared effect atom`);
  // ...and the corpus exercises five of the eight, which says how much of the
  // lattice this fixture reaches. `exn`, `div` and `write` have no runtime API
  // attributed to them here, and that is the residue rather than a claim.
  assert.deepEqual(sorted(used), ['alloc', 'io', 'ndet', 'read', 'total']);
});

// ---------------------------------------------------------------------------
// 4. THE SECOND AXIS — the composition and the comparison must agree

test('THE ORACLE: the walk over subkinds equals the comparison over semver', () => {
  const w = base();
  const composed = set(w.q('has_api[audit](R, S, K)').map((r) => r.join('|')));
  const compared = set(w.q('arrived_by[code](R, S, K)').map((r) => r.join('|')));
  // A SET IDENTITY AND NOT A COUNT: two branches can both add a runtime and the
  // union still has to satisfy this, which a number could not survive.
  assert.deepEqual(sorted(composed), sorted(compared),
    'has_api is derived by walking runtime_includes; arrived_by by one `<=`. ' +
    'If they ever differ, one of the two is wrong.');
  assert.ok(composed.size > 0, 'and neither is empty, which is the control');
});

test('each runtime version adds its OWN surface and inherits the rest', () => {
  const w = base();
  const own: Record<string, number> = {};
  for (const [r] of w.q('provides_api[code](R, S, K)')) own[r] = (own[r] ?? 0) + 1;
  // THE PARTITION IS THE CLAIM, not the three numbers: every dated member
  // belongs to exactly one version's own set, and the composition puts them
  // back. Asserted as a partition so a @types/node bump moves the numbers and
  // not the assertion.
  const total = Object.values(own).reduce((a, b) => a + b, 0);
  const reachable = w.n('arrived_by[code](node22, S, K)');
  assert.equal(total, reachable,
    'the three versions partition what node22 can reach');
  for (const r of ['node18', 'node20', 'node22']) assert.ok(own[r] > 0, `${r} adds something of its own`);
});

test('what stops working on an older runtime, by name', () => {
  const w = base();
  const lost = (from: string, to: string): string[] => sorted(set(
    w.q('host_lost[audit](From, To, C, S, K)')
      .filter(([f, t]) => f === from && t === to).map((r) => `${r[3]}.${r[4]}`)));
  assert.deepEqual(lost('node20', 'node18'), ['node:fs.statfs', 'node:os.machine']);
  assert.deepEqual(lost('node22', 'node20'), ['node:fs.globSync']);
  // ...and NOTHING in the other direction, which is the shape of a monotone
  // inclusion and the thing `runtime_drops[audit]` would refute.
  assert.deepEqual(lost('node18', 'node20'), []);
});

test('the ORDER IS NOT TOTAL ACROSS FAMILIES, and nothing compares them', () => {
  const w = base();
  // `browser_evergreen` and the three node versions are incomparable. Before
  // the family went into `arrived_by`'s join, eleven rows said the browser
  // lacked `fs.readFileSync` — true, meaningless, and exactly the comparison
  // this axis must not make.
  const across = w.q('host_lost[audit](From, To, C, S, K)')
    .filter(([f, t]) => (f === 'browser_evergreen') !== (t === 'browser_evergreen'));
  assert.deepEqual(across, [], 'no runtime LOSES anything to another family');
  assert.deepEqual(w.q('runtime_cross_family[audit](A, B)'), []);
});

test('THE BRIDGE: a runtime version reaches an ECMAScript release, and it bites', () => {
  const w = base();
  const rel = (r: string): Set<string> =>
    set(w.q('runtime_reaches_release[audit](R, Rel)').filter(([x]) => x === r).map(([, e]) => e));
  // A DIFFERENCE AND NOT A LIST, so this stays true when TypeScript ships a new
  // edition and `release/1` grows underneath it — the hazard of pinning a set
  // that another pack generates.
  assert.deepEqual(sorted(new Set([...rel('node20')].filter((e) => !rel('node18').has(e)))), ['es2023']);
  assert.deepEqual(sorted(new Set([...rel('node22')].filter((e) => !rel('node20').has(e)))), ['es2024']);
  assert.deepEqual(sorted(new Set([...rel('node18')].filter((e) => !rel('node20').has(e)))), []);
  // ...AND THE BRIDGE DOES WORK. `Array.prototype.toSorted` is es2023, so the
  // corpus's one call to it is unsupported on node18 and on nothing else. This
  // is the ES axis and the runtime axis answering ONE question together.
  assert.deepEqual(sorted(set(w.q('runtime_lib_unsupported[audit](R, C, P, K)')
    .map((r) => `${r[0]}:${r[2]}.${r[3]}`))), ['node18:array.toSorted']);
});

test('the deprecation record, which the ECMAScript axis could not supply', () => {
  const w = base();
  assert.deepEqual(sorted(set(w.q('host_call_deprecated[audit](C, S, K)').map((r) => `${r[1]}.${r[2]}`))),
    ['node:fs.exists']);
  assert.deepEqual(sorted(set(w.q('host_call_remedy[audit](C, S, K, U)').map((r) => `${r[1]}.${r[2]}->${r[3]}`))),
    ['node:fs.exists->stat'],
    'rules/js-env-api.rofl: "a source this repository does not have". It has it now.');
});

test('runtime_drops is EMPTY BY CONSTRUCTION, and the construction is named', () => {
  const w = base();
  assert.deepEqual(w.q('runtime_drops[audit](A, B, S, K)'), [],
    'one snapshot of @types/node records arrival and never removal, so ' +
    'arrived_by is a threshold on one number and a threshold is monotone');
  // THE CONTROL: the relation is askable and its premises are populated, so the
  // emptiness is an answer rather than a misspelling. Without this the row is
  // indistinguishable from a typo.
  assert.ok(w.n('runtime_includes(A, B)') > 0, 'there are inclusions to walk');
  assert.ok(w.n('has_api[audit](R, S, K)') > 0, 'and a surface to lose from');
});

// ---------------------------------------------------------------------------
// 5. THE GATES, each empty on the honest tree

test('every audit in this pack is empty on the honest tree', () => {
  const w = base();
  for (const g of [
    'host_effect_undeclared[audit](E)',
    'host_effect_orphan[audit](S, K)',
    'host_global_effect_orphan[audit](H, N)',
    'runtime_unversioned[audit](R)',
    'runtime_pair_indistinct[audit](A, B)',
    'runtime_family_undeclared[audit](R, F)',
    'runtime_cross_family[audit](A, B)',
    'host_family_mismatch[audit](H)',
    'runtime_no_release[audit](R)',
    'runtime_drops[audit](A, B, S, K)',
  ]) assert.deepEqual(w.q(g), [], g);
});

test('the residue relations are NON-empty and that is the point', () => {
  const w = base();
  // These are the layer's FRONTIER, not its defects: 35 of 57 modules and 51 of
  // 73 node globals carry no effect attribution. Asserted as an IDENTITY
  // against the tables rather than as the numbers, so growing the effect table
  // moves both sides together.
  const mods = set(w.q('host_module(node, S)').flat());
  const done = set(w.q('host_module_effect(node, S, E)').map(([s]) => s));
  assert.deepEqual(sorted(set(w.q('host_module_uneffected[audit](S)').flat())),
    sorted(new Set([...mods].filter((m) => !done.has(m)))));
  assert.ok(done.size > 0 && done.size < mods.size, 'and both halves are non-empty');

  // THE MODULES LAYER'S OWN GAP, reported by this pack rather than fixed by it.
  // `node_builtin_bare` carries 22 rows and there are 57 canonical modules, so
  // `import x from "fs/promises"` classifies as a third-party package.
  const listed = set(w.q('node_builtin_bare(B, S)').map(([, s]) => s));
  assert.deepEqual(sorted(set(w.q('bare_builtin_unlisted[audit](S)').flat())),
    sorted(new Set([...mods].filter((m) => !listed.has(m)))));
  assert.ok(listed.size > 0, 'and the listed half is non-empty — the control');
});

// ---------------------------------------------------------------------------
// 6. THE MUTANTS.
//
// The question asked of each is CLAUDE.md's third one — *where is this check
// structurally unable to LOOK* — rather than *what else could I break*. Each
// names the constraint it targets and what it EXPECTS; a survivor is reported
// rather than deleted, because a mutant that survives for a reason is worth
// more than a line removed.

interface Mutant { id: string; targets: string; file: string; find: string; replace: string;
                   check: (m: World, b: World) => boolean }

const HOST = 'rules/js-host.rofl';
const MUTANTS: Mutant[] = [
  {
    id: 'm_major_rounded_up',
    targets: '`node18` means v18.0.0 — a major rounded up promises nine minors of API',
    file: HOST,
    find: 'VN is V * 1000000.',
    replace: 'VN is V * 1000000 + 999999.',
    check: (m, b) => m.n('host_call_absent_at[audit](R, F, L, S, K)')
                  !== b.n('host_call_absent_at[audit](R, F, L, S, K)'),
  },
  {
    id: 'm_no_reflexive_reach',
    targets: 'a version provides its OWN surface',
    file: HOST,
    find: 'runtime_reaches[audit](R, R) :- runtime_version(R, _, _).',
    replace: 'runtime_reaches[audit](R, R) :- runtime_version(R, zzz_nothing, _).',
    check: (m) => m.n('has_api[audit](R, S, K)') !== m.n('arrived_by[code](R, S, K)'),
  },
  {
    id: 'm_module_default_wins',
    targets: 'a member`s own effect row beats its module`s default',
    file: HOST,
    find: 'host_call_effect[audit](C, E, by_module) :- host_module_call[code](C, Spec, Key),\n                                            host_module_effect(node, Spec, E),\n                                            not host_member_effect(node, Spec, Key, _).',
    replace: 'host_call_effect[audit](C, E, by_module) :- host_module_call[code](C, Spec, Key),\n                                            host_module_effect(node, Spec, E).',
    check: (m, b) => m.n('host_call_effect[audit](C, E, W)') !== b.n('host_call_effect[audit](C, E, W)'),
  },
  {
    id: 'm_named_import_by_local',
    targets: 'a renamed import — `import { readFile as rf }` — keeps local and imported apart',
    file: HOST,
    find: '                                                   binding[code](I, _, Local, Key),\n                                                   Key != "*", Key != "default".',
    replace: '                                                   binding[code](I, _, Local, _), Key = Local,\n                                                   Key != "*", Key != "default".',
    check: (m) => !new Set(m.q('host_module_call[code](C, S, K)').map((r) => `${r[1]}.${r[2]}`))
      .has('node:fs/promises.readFile'),
  },
  {
    id: 'm_no_param_shadow',
    targets: 'a PARAMETER binds a name — the arm `sees_binder` cannot supply',
    file: HOST,
    find: 'name_bound_in[code](File, Name) :- param_of[flow](F, _, Name),\n                                   ast_node[code](F, _, File, _).',
    replace: 'name_bound_in[code](File, Name) :- param_of[flow](F, _, Name), Name = "zzz_nothing",\n                                   ast_node[code](F, _, File, _).',
    check: (m, b) => m.n('host_global_ref[code](E, H, N)') !== b.n('host_global_ref[code](E, H, N)'),
  },
  {
    id: 'm_no_import_shadow',
    targets: 'an IMPORT LOCAL binds a name — the module door shadowing the global door',
    file: HOST,
    find: 'name_bound_in[code](File, Name) :- binding[code](I, _, Name, _), site_file[code](I, File).',
    replace: 'name_bound_in[code](File, Name) :- binding[code](I, _, Name, _), Name = "zzz_nothing", site_file[code](I, File).',
    check: (m, b) => m.n('host_global_ref[code](E, H, N)') !== b.n('host_global_ref[code](E, H, N)'),
  },
  {
    id: 'm_default_import_not_a_namespace',
    targets: '`import path from "node:path"` binds the whole module, like `import * as`',
    file: HOST,
    find: '                                           binding[code](I, _, Local, "default").',
    replace: '                                           binding[code](I, _, Local, "zzz_default").',
    check: (m) => !new Set(m.q('host_module_call[code](C, S, K)').map((r) => `${r[1]}.${r[2]}`))
      .has('node:path.resolve'),
  },
  {
    id: 'm_bridge_ignores_composition',
    targets: 'the bridge composes with the ES walk rather than naming one release',
    file: HOST,
    find: '                                          provides_release(P, Rel0),\n                                          reaches[audit](Rel0, Rel).',
    replace: '                                          provides_release(P, Rel0), Rel = Rel0,\n                                          reaches[audit](Rel0, Rel0).',
    check: (m, b) => m.n('runtime_lib_unsupported[audit](R, C, P, K)')
                  !== b.n('runtime_lib_unsupported[audit](R, C, P, K)'),
  },
  {
    id: 'm_host_projected_away',
    targets: 'a global present in one host and not the other — the reason for the host column',
    file: HOST,
    find: 'host_global_only_in[code](E, H, Name) :- host_global_ref[code](E, H, Name),\n                                         host(G), G != H,\n                                         not host_global(G, Name).',
    replace: 'host_global_only_in[code](E, H, Name) :- host_global_ref[code](E, H, Name),\n                                         host(G), G != H,\n                                         host_global(G, Name).',
    check: (m) => !new Set(m.q('host_global_only_in[code](E, H, N)').map((r) => `${r[1]}:${r[2]}`))
      .has('browser:document'),
  },
];

for (const mu of MUTANTS) {
  test(`MUTANT ${mu.id} — ${mu.targets}`, () => {
    const b = base();
    const m = build([{ file: mu.file, find: mu.find, replace: mu.replace }]);
    assert.ok(mu.check(m, b),
      `${mu.id} SURVIVED: the mutated world answers the same as the honest one, ` +
      'so nothing in this file can see the constraint it targets. Report it ' +
      'rather than deleting the mutant.');
  });
}

// ---------------------------------------------------------------------------
// 7. THE PACK CLOSURE — this world holds every js pack it needs, and says which
//    it refuses. `f_an_instruments_world_is_part_of_its_claim`.

test('the world names every js pack on disk as loaded or deliberately absent', () => {
  const onDisk: string[] = [];
  for (const dir of ['facts', 'rules'])
    for (const f of fs.readdirSync(path.join(ROOT, dir)))
      if (/^js-.*\.rofl$/.test(f)) onDisk.push(`${dir}/${f}`);
  const loaded = new Set(PACKS);
  // REFUSED ON PURPOSE, each with its reason. This world answers a question
  // about the RUNTIME, and a pack it does not need is a fixpoint it pays for.
  const refused = new Set([
    'facts/js-attrs.rofl',       // the attribute census, its own instrument
    'facts/js-cost.rofl',        // the other session's per-rule cost table
    'facts/js-controlflow.rofl', // no runtime question is about control flow
    'facts/js-resolve.rofl',     // the resolver oracle's own loans
    'rules/js-controlflow.rofl',
    'rules/js-model.rofl',       // the coverage matrix, not this layer's product
    'rules/js-pack-home.rofl',   // an audit over the rules themselves
    'rules/js-resolve.rofl',
    'rules/js-vocabulary.rofl',
    'rules/js-attrs.rofl',
    // THE FIFTH LAYER, 2026-09-09, landing on the same day from the branch
    // beside this one. Refused rather than loaded, and the reason is the one
    // this list's header gives: this world answers a question about the
    // RUNTIME. The effect layer is the CONSUMER of that answer — its concrete
    // column joins `ambient_effect(fs, "readFileSync", io)` — so loading it
    // here would put the consumer inside the world that produces its input and
    // make every number below a measurement of both.
    'facts/js-effects.rofl',
    'rules/js-effects.rofl',
    // AND THE ES GLOBALS, same day, same wave. Refused, and this one is the
    // near miss: `js-globals` covers the ECMAScript half of the same question
    // this world answers for the host, and the two DO meet — `free_global[code]`
    // partitions into `es_global` and `global_unattributed`, and that second
    // audit is this world's in-tray. They are kept apart because each must be
    // able to be wrong on its own: a world holding both cannot say which half
    // failed to attribute a global.
    'facts/js-globals.rofl',
    'rules/js-globals.rofl',
    // AND THE AMBIENT SURFACE, 2026-09-09 (w_effect_ambient_call). Refused, and
    // it is the same refusal as the effect layer's two lines up seen from the
    // other end: `rules/js-ambient.rofl` READS `member_effect[code]`,
    // `host_module_effect` and `host_global_effect` — this world's product — and
    // turns them into `ambient_effect(S, Member, EffectName)`. It is the
    // consumer, and a world that held both could not say which half failed to
    // attribute an API. Its own world is `w_js_ambient` in facts/worlds.rofl,
    // over this world's fixtures plus the ES globals one.
    'rules/js-ambient.rofl',
  ]);
  const unaccounted = onDisk.filter((p) => !loaded.has(p) && !refused.has(p));
  assert.deepEqual(unaccounted, [],
    'a js pack appeared that this world neither loads nor refuses by name');
  const stale = [...refused].filter((p) => !onDisk.includes(p));
  assert.deepEqual(stale, [], 'a refusal naming a pack that no longer exists');
});

// ---------------------------------------------------------------------------
// 8. THE DECLARED SURVIVOR.
//
// One mutant in this file CANNOT be killed by this corpus, and it is written
// down with its cause rather than deleted — a mutant that survives for a reason
// is worth more than a line removed. Asserting the SURVIVAL and the CAUSE
// together is what makes the reason falsifiable: the day the cause goes away
// this test goes red and says so, which a deleted mutant could not.

mutant('SURVIVOR m_family_out_of_arrived_by — and the reason it cannot be killed here', () => {
  const b = base();
  const m = build([{
    file: HOST,
    find: 'arrived_by[code](R, Spec, Key) :- runtime_vnum[code](R, VN), runtime_version(R, F, _),\n'
        + '                                  host_member_since(F, Spec, Key, _, Sv), Sv <= VN.',
    replace: 'arrived_by[code](R, Spec, Key) :- runtime_vnum[code](R, VN), runtime_version(R, F, _),\n'
        + '                                  host_member_since(node, Spec, Key, _, Sv), Sv <= VN.',
  }]);
  // IT SURVIVES. Hard-coding the family back into the join changes nothing.
  assert.equal(m.n('arrived_by[code](R, S, K)'), b.n('arrived_by[code](R, S, K)'));
  assert.deepEqual(m.q('host_lost[audit](F, T, C, S, K)'), b.q('host_lost[audit](F, T, C, S, K)'));

  // AND HERE IS WHY, AS A ROW RATHER THAN AS A PARAGRAPH. `browser_evergreen`
  // is the only member of the only other family and its version is 0, so
  // `Sv <= VN` excludes node's entire surface from it whatever the family
  // premise says. The guard is therefore CORRECT AND CURRENTLY REDUNDANT, and
  // it becomes killable the moment a second family gets a version number that
  // orders above anything in node's table.
  assert.equal(b.n('arrived_by[code](browser_evergreen, S, K)'), 0,
    'the browser reaches nothing on node`s scale — the arithmetic already excludes it');
  assert.ok(b.n('arrived_by[code](node18, S, K)') > 0, 'and the positive control: node does');

  // THE GUARD IS ALSO WRITTEN TWICE, which is the second half of the survival
  // and a hazard in its own right: `host_lost` and `host_member_absent` each
  // carry their own family premise, so a mutant of any ONE of the three is
  // invisible from the far end. `orphan_claim[audit]`'s recorded failure —
  // a constraint enforced by independent copies is a constraint no mutant of
  // one copy can find — arriving in a fourth place. See
  // f_a_guard_written_three_times_cannot_be_killed_by_a_mutant_of_one.
  const rules = read('rules/js-host.rofl');
  const copies = ['arrived_by[code](R, Spec, Key) :- runtime_vnum[code](R, VN), runtime_version(R, F, _)',
    'host_member_absent[audit](R, Spec, Key) :- runtime_version(R, F, _)',
    'runtime_version(To, F, _),'];
  for (const c of copies) assert.ok(rules.includes(c), `the family guard is still written at: ${c}`);
});
