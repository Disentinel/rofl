// js-export-forms.test.ts — THE TWO EXPORT FORMS WITH NO NODE IN THIS
// VOCABULARY, at the four layers that have an opinion about them.
//
//   export { a as b }        ExportSpecifier            (w_export_specifier_forms)
//   export * as ns from '…'  ExportNamespaceSpecifier
//
// THE MEASUREMENT THIS FILE EXISTS FOR, and it was taken BEFORE any rule was
// written because the item's brief allowed either answer:
//
//   does the model resolve `export { internal as external }` to `internal`,
//   to `external`, or to nothing at all?
//
// On a two-file probe with `export { hidden as shown }` beside `export function
// plain`, `exports_name[code]` returned exactly ONE row — `plain` — the
// cross-file call `usesShown -> hidden` was absent from `calls_in`, and its site
// was reported as an unresolved `s_identifier`. So the answer was NOTHING. The
// model did not believe the module exported `internal`; it believed the module
// exported nothing under either name. That is the safe direction and it is
// still a name a module offers that the model could not follow.
//
// AND AT THE CONTROL-FLOW LAYER IT WAS NOT SAFE. On a probe whose three
// functions were exported only through a specifier list — `export { helper as
// h, viaList as v, lonely as l }` — the entry surface was EMPTY:
// `exported_fn` 0, `entry_point` 0, `reachable` 0, `no_entry_point[audit]`
// firing on the file, and `may_not_be_reached` naming `helper`, a function that
// same file exports AND calls. The positive control — the identical three
// functions written `export function` — gives all three as entry points and an
// empty `may_not_be_reached`. A smaller entry surface reports live functions as
// maybe-dead, which is the direction `export_kind_unseen[audit]` already exists
// to catch, arriving through a FORM rather than through a misspelling.
//
// TWO WORLDS, because the four cells do not live in one pack:
//
//   the CORPUS world  test/fixtures/js-call, callgraph + dataflow + controlflow
//   the MODULES world test/fixtures/js-mod,  rules/js-modules.rofl §4b
//
// Every oracle below is a NAMED SET or an identity. Not one is a count of the
// corpus (f_a_pin_that_moves_with_the_corpus_is_measuring_the_corpus).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import { build, base, edges, type Mut, type World } from './js-corpus-world.ts';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readRepo = (p: string): string => fs.readFileSync(path.join(REPO, p), 'utf8');

// ===========================================================================
// THE MODULES WORLD — test/fixtures/js-mod materialised on a real disk, the
// same tree test/js-modules.test.ts builds, minus the resolver oracle it does
// not need here. §4b reads no `source` and no fs fact, so this world needs no
// host emitter at all.

const MOD_FIX = path.join(REPO, 'test/fixtures/js-mod');
function materialise(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'js-exp-')));
  const walk = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(MOD_FIX, rel), { withFileTypes: true })) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) { fs.mkdirSync(path.join(root, r), { recursive: true }); walk(r); }
      else if (e.name.endsWith('.txt')) fs.copyFileSync(path.join(MOD_FIX, r), path.join(root, r.slice(0, -4)));
    }
  };
  walk('');
  return root;
}
const MOD_ROOT = materialise();
process.on('exit', () => fs.rmSync(MOD_ROOT, { recursive: true, force: true }));

const MOD_FILES = ((): string[] => {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(MOD_ROOT, rel), { withFileTypes: true })) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) walk(r); else if (e.name.endsWith('.ts')) out.push(r.split(path.sep).join('/'));
    }
  };
  walk('');
  return out.sort();
})();

const MOD_RULES = readRepo('rules/js-modules.rofl');
const unq = (s: string): string => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

interface ModWorld { q: (lit: string) => string[][]; n: (lit: string) => number; }

/** `rules` mutates rules/js-modules.rofl textually; `extra` appends rules, which
 *  is how a gate gets a planted defect without a second fixture tree. */
function modWorld(opts: { rules?: (s: string) => string; extra?: string } = {}): ModWorld {
  const r = new Rofl();
  const load = (what: string, text: string): void => {
    const res = r.load(text);
    assert.ok(res.ok, `${what} REJECTED: ${res.diagnostics.slice(0, 3).join(' | ')}`);
  };
  load('boot', readRepo('boot.rofl'));
  for (const f of MOD_FILES) {
    const res = r.assert(scan(fs.readFileSync(path.join(MOD_ROOT, f), 'utf8'), { file: f }).facts.join('\n'));
    assert.ok(res.ok, `${f} facts REJECTED: ${res.diagnostics.slice(0, 3).join(' | ')}`);
  }
  const rules = (opts.rules ?? ((s: string) => s))(MOD_RULES);
  assert.ok(!opts.rules || rules !== MOD_RULES, 'the rule mutation applied');
  load('packs', [readRepo('rules/js-structure.rofl'), readRepo('facts/js-kinds.rofl'),
    readRepo('rules/js-model.rofl'), readRepo('facts/js-modules.rofl'), rules,
    opts.extra ?? ''].join('\n'));
  r.evaluate(20_000_000);
  const q = (lit: string): string[][] => {
    const res = r.query(lit);
    assert.equal(res.error, undefined, `query ${lit}: ${res.error}`);
    assert.equal(res.unpopulatable, false, `query ${lit}: nothing in this world can populate it`);
    assert.equal(res.partial, false, `query ${lit} hit a budget`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return res.rows.map((row) => order.map((v) => unq(row.bindings[v] ?? '')));
  };
  return { q, n: (l) => q(l).length };
}

let MOD_BASE: ModWorld | undefined;
const modBase = (): ModWorld => (MOD_BASE ??= modWorld());

/** every export binding as `external <- internal`, which is the whole cell */
const bindings = (w: ModWorld): string[] =>
  w.q('export_binding[code](E, Sp, X, L)').map(([, , x, l]) => `${x} <- ${l}`).sort();
/** the external names that survive erasure */
const valueNames = (w: ModWorld): string[] =>
  w.q('export_value_binding[code](E, Sp)')
    .flatMap(([, sp]) => w.q(`spec_external[code](${sp}, X)`).map(([x]) => x)).sort();

// ===========================================================================
// 1. THE MODULES LAYER — the naming question, and it is the whole cell.

test('MODULES: an external name is not an internal one, and `* as ns` has no internal name at all', () => {
  const m = modBase();
  // THE NAMED SET, not a count. `ErasedOut` and `AlsoErasedOut` are BINDINGS —
  // the module does declare those names — and they are not VALUE bindings,
  // which is the distinction section 5 of the same file makes for imports.
  assert.deepEqual(bindings(m), [
    'AlsoErasedOut <- AlsoErased',
    'ErasedOut <- Erased',
    'alsoExternal <- alsoInternal',
    'everything <- *',
    'external <- internal',
    'shorthand <- shorthand',
  ], 'every export specifier in the fixture binds an external name to an internal one');

  // ...and `everything <- *` is the sentence the cell exists for: an
  // ExportNamespaceSpecifier carries an `exported` child and NO `local` one, so
  // there is nothing to put in the internal column but the `"*"` the import
  // half already spells.
  assert.deepEqual(m.q('spec_internal[code](Sp, L)').map(([, l]) => l).sort(),
    ['*', 'AlsoErased', 'Erased', 'alsoInternal', 'internal', 'shorthand']);

  // THE RENAME, as its own relation: four of the six differ, and `shorthand` is
  // the control that keeps a rule reading `exported` for BOTH columns from
  // looking correct.
  assert.deepEqual(m.q('export_renamed[code](Sp, X, L)').map(([, x, l]) => `${x} <- ${l}`).sort(),
    ['AlsoErasedOut <- AlsoErased', 'ErasedOut <- Erased', 'alsoExternal <- alsoInternal',
     'everything <- *', 'external <- internal']);

  // ERASURE: both markers, and neither implies the other.
  assert.deepEqual(valueNames(m), ['alsoExternal', 'everything', 'external', 'shorthand'],
    'the two type-only exports are bindings and are not values');

  // the gates read zero on the model as written
  for (const g of ['export_binding_missing[audit](Sp)', 'export_binding_conflict[audit](Sp, A, B)',
                   'export_internal_conflict[audit](Sp, A, B)', 'orphan_claim[audit](L, K, La)',
                   'double_claimed[audit](L, K, La)']) {
    assert.equal(m.n(g), 0, g);
  }
});

interface ModMutant {
  name: string; targets: string;
  plant: { rules?: (s: string) => string; extra?: string };
  damage: (m: ModWorld, b: ModWorld) => string | null;
}

const MOD_MUTANTS: ModMutant[] = [
  {
    name: 'M1 the EXTERNAL name is read off the `local` child',
    targets: 'that the name other modules ask for comes from `exported`. Every export outside this '
      + 'fixture has the two names equal, so without the rename this mutant derives the same rows.',
    plant: {
      rules: (s) => s.replace(`spec_external[code](Sp, X) :- export_specifier_node[code](Sp),
                              ast_child[code](Sp, exported, 0, N), ast_name[code](N, X).`,
        `spec_external[code](Sp, X) :- export_specifier_node[code](Sp),
                              ast_child[code](Sp, local, 0, N), ast_name[code](N, X).`),
    },
    damage: (m, b) => {
      const gone = bindings(b).filter((x) => !bindings(m).includes(x));
      return gone.length ? `the module stops offering ${gone.join(', ')}` : null;
    },
  },
  {
    name: 'M2 the INTERNAL name is read off the `exported` child',
    targets: 'that the rename is a rename. Reading one child for both columns makes every binding '
      + 'reflexive, and `export_renamed` is what says so.',
    plant: {
      rules: (s) => s.replace(`spec_internal[code](Sp, L)   :- ast_node[code](Sp, export_specifier, _, _),
                                ast_child[code](Sp, local, 0, N), ast_name[code](N, L).`,
        `spec_internal[code](Sp, L)   :- ast_node[code](Sp, export_specifier, _, _),
                                ast_child[code](Sp, exported, 0, N), ast_name[code](N, L).`),
    },
    damage: (m, b) => {
      const renamed = (w: ModWorld) => w.q('export_renamed[code](Sp, X, L)').map(([, x, l]) => `${x} <- ${l}`).sort();
      assert.ok(renamed(b).length > 0, 'positive control: the baseline has renames');
      return renamed(m).includes('everything <- *') && renamed(m).length === 1
        ? 'every specifier rename collapses; only `* as ns`, which has no local child, still differs'
        : null;
    },
  },
  {
    name: 'M3 `* as ns` loses its internal name',
    targets: 'the gate `export_binding_missing[audit]`, and the fact that the namespace specifier '
      + 'is bound by a DIFFERENT rule from the plain one.',
    plant: { rules: (s) => s.replace('spec_internal[code](Sp, "*") :- ast_node[code](Sp, export_namespace_specifier, _, _).', '') },
    damage: (m, b) => {
      const parts: string[] = [];
      if (!bindings(m).includes('everything <- *')) parts.push('the namespace binding is gone');
      if (m.n('export_binding_missing[audit](Sp)') > 0) parts.push('export_binding_missing fires');
      assert.ok(bindings(b).includes('everything <- *'), 'positive control');
      return parts.length === 2 ? parts.join('; ') : null;
    },
  },
  {
    name: 'M4 the DECLARATION-level erasure marker is ignored',
    targets: '`export type { X }`, where babel leaves the SPECIFIER saying "value" — the half a '
      + 'specifier-only reader gets exactly backwards.',
    plant: { rules: (s) => s.replace('                                     not export_decl_type_only[code](E),\n', '') },
    damage: (m) => valueNames(m).includes('ErasedOut')
      ? 'ErasedOut is now a value binding, and it is erased before anything runs' : null,
  },
  {
    name: 'M5 the INLINE erasure marker is ignored',
    targets: '`export { type X }`, the other half, on a declaration whose own marker says "value".',
    plant: { rules: (s) => s.replace(',\n                                     not export_spec_type_only[code](Sp).', '.') },
    damage: (m) => valueNames(m).includes('AlsoErasedOut')
      ? 'AlsoErasedOut is now a value binding' : null,
  },
  {
    name: 'M6 a second external name for one specifier',
    targets: '`export_binding_conflict[audit]` — that the external name is a FUNCTION of the specifier.',
    plant: { extra: '\nspec_external[code](Sp, "planted") :- ast_node[code](Sp, export_specifier, _, _).\n' },
    damage: (m) => {
      const n = m.n('export_binding_conflict[audit](Sp, A, B)');
      return n > 0 ? `export_binding_conflict reports ${n} row(s)` : null;
    },
  },
  {
    name: 'M7 a second internal name for one specifier',
    targets: '`export_internal_conflict[audit]` — the half `export_binding_conflict` is '
      + 'structurally unable to see, because it is keyed on the external column.',
    plant: { extra: '\nspec_internal[code](Sp, "planted") :- ast_node[code](Sp, export_specifier, _, _).\n' },
    damage: (m) => {
      const conflict = m.n('export_internal_conflict[audit](Sp, A, B)');
      const external = m.n('export_binding_conflict[audit](Sp, A, B)');
      return conflict > 0 && external === 0
        ? `export_internal_conflict reports ${conflict} row(s) and the external gate stays silent — `
          + 'which is why there are two of them'
        : null;
    },
  },
];

for (const g of MOD_MUTANTS) {
  test(`MODULES MUTANT ${g.name}`, () => {
    const m = modWorld(g.plant);
    const d = g.damage(m, modBase());
    console.log(`\n    targets: ${g.targets}`);
    console.log(`    verdict: ${d === null ? 'SURVIVED' : 'KILLED — ' + d}`);
    assert.ok(d !== null, `mutant SURVIVED: ${g.name}`);
  });
}

// ===========================================================================
// 2. THE CORPUS WORLD — the call graph, the value flow and the entry surface.

/** what a file exports, as `external -> the name of the function it stands for`.
 *  The two halves are DIFFERENT STRINGS for a renamed export, which is the
 *  whole cell and the reason this helper does not just print the export name. */
const exportsOf = (w: World, file: string): string[] =>
  w.q(`exports_name[code](F, N, "${file}")`)
    .map(([f, n]) => `${n} -> ${w.q(`fn_name[code](${f}, K)`)[0]?.[0] ?? w.q(`ast_node[code](${f}, K, G, L)`)[0]?.[0] ?? f}`)
    .sort();

/** the functions the model says may not be reached, by name */
const unreached = (w: World): string[] => w.q('may_not_be_reached[code](F)')
  .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)).sort();

test('CORPUS: `export { renamed as exposed }` offers the EXTERNAL name and the INTERNAL function', () => {
  const b = base();
  const alpha = exportsOf(b, 'alpha.mjs');
  assert.ok(alpha.includes('exposed -> renamed'),
    `the answer to the item's question, and it is neither `
    + `\`renamed -> renamed\` nor nothing: ${alpha.filter((x) => x.includes('renamed')).join(', ')}`);
  // ...and NOT under the internal name, which is what an importer would get
  // wrong in the other direction.
  assert.deepEqual(alpha.filter((x) => x.startsWith('renamed ->')), [],
    'the module does not offer `renamed`; that name is internal to alpha.mjs');

  // the namespace re-export offers ONE name standing for a whole module, and
  // the node it stands for is that module's `program` — the same node an
  // `import * as` binds, which is why the member lookup needed no new rule.
  const gammaNs = b.q('exports_name[code](F, "alphaAll", "gamma.mjs")');
  assert.equal(gammaNs.length, 1, 'gamma offers exactly one namespace name');
  assert.deepEqual(b.q(`ast_node[code](${gammaNs[0]?.[0]}, K, F, L)`).map(([k, f]) => `${k}@${f}`),
    ['program@alpha.mjs'], '`export * as alphaAll from` stands for alpha.mjs itself');

  // A RE-EXPORT WITH A SPECIFIER OFFERS NOTHING HERE, and that is a rule rather
  // than an omission: `export { twin as viaDelta } from './gamma.mjs'` names
  // another module's binding, and beta.mjs's own `twin` must not answer for it.
  assert.deepEqual(exportsOf(b, 'beta.mjs').filter((x) => x.startsWith('viaDelta')), [],
    'a re-export specifier binds no local name');
});

test('CORPUS: both new export forms carry a call across a file, and the RUNTIME agrees', () => {
  const b = base();
  const e = edges(b);
  assert.ok(e.has('bviaRename -> renamed'),
    'the renamed export resolves to the function it renames, not to nothing');
  assert.ok(e.has('bviaNsReexport -> leaf'),
    'the namespace re-export resolves a member on a module reached only through gamma.mjs');
  // ...and the collision that makes the second one mean something: beta.mjs
  // binds its OWN `leaf`, which is alpha's `crossed` under an alias. Two
  // functions of one name, and the namespace produced the other one.
  assert.ok(e.has('bcross -> crossed'), 'positive control: the local `leaf` still means `crossed`');
});

test('CORPUS: the entry surface reaches a function exported only through a specifier', () => {
  const b = base();
  const surface = b.q('exported_fn[code](F)')
    .flatMap(([f]) => b.q(`fn_name[code](${f}, N)`).map(([n]) => n));
  assert.ok(surface.includes('renamed'),
    '`export { renamed as exposed }` puts `renamed` on the entry surface');
  assert.deepEqual(unreached(b).filter((n) => n === 'renamed'), [],
    'so nothing reports it as maybe-dead');
  assert.equal(b.n('no_entry_point[audit](File)'), 0,
    'positive control: no fixture file has functions and an empty entry surface');
});

// ---------------------------------------------------------------------------
// 2b. THE ENTRY-SURFACE WORLD — one file, scanned and never run.
//
// WHY IT IS NOT THE CALL-GRAPH CORPUS, measured: deleting the entry-surface arm
// costs NOTHING there. `renamed` stays `reachable` because `bviaRename` calls it
// and `bviaRename` is exported inline, so the walk arrives from a seed the
// mutation does not touch. The mutant survived on the corpus and not on the
// rule, which is category (a) — and the answer to category (a) is a site.

const SURFACE_FIXTURE = 'test/fixtures/js/export-surface.js.txt';
const SURFACE_RULES = ['rules/js-structure.rofl', 'rules/js-dataflow.rofl',
  'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl'];
const SURFACE_FACTS = ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
  'facts/js-shapes.rofl', 'facts/js-statements.rofl', 'facts/js-controlflow.rofl'];

function surfaceWorld(mut?: { file: string; find: string; replace: string }): ModWorld {
  const r = new Rofl();
  const texts = ['boot.rofl', ...SURFACE_FACTS, ...SURFACE_RULES].map((f) => {
    const t = readRepo(f);
    if (!mut || mut.file !== f) return t;
    assert.ok(t.includes(mut.find), `mutation anchor absent in ${f}`);
    return t.replace(mut.find, mut.replace);
  });
  const res = r.load(texts.join('\n'));
  assert.ok(res.ok, `packs REJECTED: ${res.diagnostics.slice(0, 3).join(' | ')}`);
  const a = r.assert(scan(readRepo(SURFACE_FIXTURE), { file: 'export-surface.js' }).facts.join('\n'));
  assert.ok(a.ok, `fixture REJECTED: ${a.diagnostics.slice(0, 3).join(' | ')}`);
  r.evaluate(20_000_000);
  const q = (lit: string): string[][] => {
    const res2 = r.query(lit);
    assert.equal(res2.error, undefined, `query ${lit}: ${res2.error}`);
    assert.equal(res2.unpopulatable, false, `query ${lit}: nothing in this world can populate it`);
    assert.equal(res2.partial, false, `query ${lit} hit a budget`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((x) => x[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return res2.rows.map((row) => order.map((v) => unq(row.bindings[v] ?? '')));
  };
  return { q, n: (l) => q(l).length };
}

const surfaceNames = (w: ModWorld, rel: string): string[] => w.q(rel)
  .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)).sort();

test('SURFACE: a module exported entirely through a specifier list has an entry surface', () => {
  const w = surfaceWorld();
  assert.deepEqual(surfaceNames(w, 'exported_fn[code](F)'), ['helper', 'lonely', 'viaList'],
    'all three, and `helper` is on it because `export { helper as h }` names it');
  assert.deepEqual(surfaceNames(w, 'may_not_be_reached[code](F)'), [],
    'nothing in the file is reported maybe-dead');
  assert.deepEqual(w.q('no_entry_point[audit](File)'), [], 'and the file has an entry point');
});

test('CORPUS MUTANT C7 the entry surface stops reading the specifier list', () => {
  // TARGETS: `exported_fn`, and the DANGEROUS direction — a smaller seed reports
  // live functions as maybe-dead. This is the measurement that was taken BEFORE
  // the arm existed, replayed as a mutant.
  const b = surfaceWorld();
  const m = surfaceWorld({ file: 'rules/js-controlflow.rofl',
    find: `exported_fn[code](F) :- export_local[code](L, _, _), may_be_node[flow](L, F),
                        fn_node[code](F), not in_fn[code](F).`,
    replace: '' });
  assert.deepEqual(surfaceNames(m, 'exported_fn[code](F)'), [], 'the entry surface is empty');
  assert.deepEqual(m.q('no_entry_point[audit](File)').flat(), ['export-surface.js'],
    'a file with functions and no entry point at all');
  assert.deepEqual(surfaceNames(m, 'may_not_be_reached[code](F)'), ['helper'],
    'a function this module exports AND calls is reported maybe-dead');
  // ...and the positive control is the test above: all three are on the surface
  // and nothing is unreached when the arm is in place.
  assert.deepEqual(surfaceNames(b, 'may_not_be_reached[code](F)'), []);
  console.log('\n    verdict: KILLED — entry surface 3 -> 0, no_entry_point fires, `helper` reported maybe-dead');
});

const MUTANTS: { name: string; targets: string; mut: Mut[]; damage: (m: World, b: World) => string | null }[] = [
  {
    name: 'C1 the rename arm reads the EXPORTED child where the LOCAL one belongs',
    targets: 'that `may_be_node` is asked about the name INSIDE the module. `exposed` denotes '
      + 'nothing in alpha.mjs, so the export stops standing for anything.',
    mut: [{ file: 'rules/js-dataflow.rofl',
            find: `    ast_child[code](Sp, local, 0, L),
    ast_child[code](Sp, exported, 0, X), ast_name[code](X, Ext).`,
            replace: `    ast_child[code](Sp, exported, 0, L),
    ast_child[code](Sp, exported, 0, X), ast_name[code](X, Ext).` }],
    damage: (m, b) => {
      const lost = [...edges(b)].filter((e) => !edges(m).has(e)).sort();
      return lost.includes('bviaRename -> renamed')
        ? `the cross-file call through the renamed export is gone (lost: ${lost.join(', ')})` : null;
    },
  },
  {
    name: 'C2 a re-export`s LOCAL name is looked up in the re-exporting file',
    targets: 'the `not reexport_decl` guard. `export { twin as viaDelta } from \'./gamma.mjs\'` '
      + 'names delta`s `twin`, and beta.mjs declares one of its own.',
    mut: [{ file: 'rules/js-dataflow.rofl',
            find: '    not reexport_decl[code](E), not export_list_erased[code](E),',
            replace: '    not export_list_erased[code](E),' }],
    damage: (m, b) => {
      const gained = exportsOf(m, 'beta.mjs').filter((x) => !exportsOf(b, 'beta.mjs').includes(x));
      return gained.includes('viaDelta -> twin')
        ? `beta.mjs now claims to export ${gained.join(', ')} — its own function under a name `
          + 'that at runtime stands for delta`s' : null;
    },
  },
  {
    name: 'C3 the DECLARATION-level erasure marker is ignored',
    targets: '`export type { Base as BaseType }` in shapes.ts, where babel leaves the specifier '
      + 'saying "value" — the form a specifier-only reader gets backwards.',
    mut: [{ file: 'rules/js-dataflow.rofl',
            find: '    not reexport_decl[code](E), not export_list_erased[code](E),',
            replace: '    not reexport_decl[code](E),' }],
    damage: (m, b) => {
      const gained = exportsOf(m, 'shapes.ts').filter((x) => !exportsOf(b, 'shapes.ts').includes(x));
      return gained.some((x) => x.startsWith('BaseType ->'))
        ? `shapes.ts now offers ${gained.join(', ')}, a name erased before anything runs` : null;
    },
  },
  {
    name: 'C4 the INLINE erasure marker is ignored',
    targets: '`export { type curried as curriedType }`, the other marker, on a declaration whose '
      + 'own marker says "value".',
    mut: [{ file: 'rules/js-dataflow.rofl',
            find: '    ast_node[code](Sp, export_specifier, _, _), not export_item_erased[code](Sp),',
            replace: '    ast_node[code](Sp, export_specifier, _, _),' }],
    damage: (m, b) => {
      const gained = exportsOf(m, 'shapes.ts').filter((x) => !exportsOf(b, 'shapes.ts').includes(x));
      return gained.some((x) => x.startsWith('curriedType ->'))
        ? `shapes.ts now offers ${gained.join(', ')}` : null;
    },
  },
  {
    name: 'C5 the namespace re-export reads a LOCAL child it does not have',
    targets: 'the measurement this rule rests on — an ExportNamespaceSpecifier has an `exported` '
      + 'child and no `local` one. A rule written from the import half`s shape derives nothing.',
    mut: [{ file: 'rules/js-dataflow.rofl',
            find: '    ast_child[code](Sp, exported, 0, X), ast_name[code](X, Name),\n    module_source[code](E, Src, File).',
            replace: '    ast_child[code](Sp, local, 0, X), ast_name[code](X, Name),\n    module_source[code](E, Src, File).' }],
    damage: (m, b) => {
      const lost = [...edges(b)].filter((e) => !edges(m).has(e)).sort();
      return m.n('export_ns_name[code](N, S, F)') === 0 && lost.includes('bviaNsReexport -> leaf')
        ? `export_ns_name derives nothing and the member call goes with it (lost: ${lost.join(', ')})` : null;
    },
  },
  {
    name: 'C6 the namespace names EVERY module, not the one its source says',
    targets: 'the join on `import_target`. The edge set cannot see this on its own — `leaf` is '
      + 'declared in alpha.mjs and BOUND in beta.mjs, so the ambiguity is what says which module.',
    mut: [{ file: 'rules/js-dataflow.rofl',
            find: `exports_name[code](P, Name, File) :- export_ns_name[code](Name, Src, File),
                                     import_target[code](Src, Target),
                                     module_object[flow](P, Target).`,
            replace: `exports_name[code](P, Name, File) :- export_ns_name[code](Name, Src, File),
                                     import_target[code](Src, _),
                                     module_object[flow](P, Target).` }],
    damage: (m, b) => {
      const gained = m.q('exports_name[code](F, "alphaAll", "gamma.mjs")').length;
      const wasOne = b.q('exports_name[code](F, "alphaAll", "gamma.mjs")').length;
      return gained > wasOne
        ? `gamma binds \`alphaAll\` to ${gained} modules instead of ${wasOne}` : null;
    },
  },
];

for (const g of MUTANTS) {
  test(`CORPUS MUTANT ${g.name}`, () => {
    const d = g.damage(build(g.mut), base());
    console.log(`\n    targets: ${g.targets}`);
    console.log(`    verdict: ${d === null ? 'SURVIVED' : 'KILLED — ' + d}`);
    assert.ok(d !== null, `mutant SURVIVED: ${g.name}`);
  });
}
