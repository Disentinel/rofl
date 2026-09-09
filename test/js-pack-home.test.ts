// js-pack-home.test.ts — WHERE A `node_kind` ROW BELONGS, MEASURED.
//
// `w_vocabulary_home` reads: *node_kind rows live in five packs;
// facts/js-kinds.rofl is named for them and holds a minority*. Both halves are
// true — seven packs now, and 32 of 100 — and the conclusion they invite is
// wrong. This file is the measurement that says so, and rules/js-pack-home.rofl
// is the rule it enforces.
//
// THE WORLD HERE HAS NO CORPUS, for the reason test/js-vocabulary.test.ts gives
// about its own: the audit reads `asserted_by` and `node_kind` and nothing else,
// so a corpus adds nothing to its answer and seconds to its cost.
//
// AND IT LOADS EACH PACK SEPARATELY, WITH A `who` OF ITS OWN, which is the one
// thing every other test file here does not do. `Rofl.load(a + b)` makes two
// packs one writer; `load(a, {who: p})` then `load(b, {who: q})` is what puts a
// pack name into the store. A LAYER IS TWO FILES AND ONE PRINCIPAL — see the
// note in rules/js-pack-home.rofl for what that costs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const BUDGET = { budget: 900_000_000 };

/** A layer: its principal, its fact pack, and the rule pack that reads it. The
 *  fact pack is what carries `node_kind`; both load under the one principal. */
const LAYERS: { who: string; facts: string; rules?: string }[] = [
  { who: 'p_js_kinds', facts: 'facts/js-kinds.rofl' },
  { who: 'p_js_callgraph', facts: 'facts/js-callgraph.rofl', rules: 'rules/js-callgraph.rofl' },
  { who: 'p_js_dataflow', facts: 'facts/js-dataflow.rofl', rules: 'rules/js-dataflow.rofl' },
  { who: 'p_js_modules', facts: 'facts/js-modules.rofl', rules: 'rules/js-modules.rofl' },
  { who: 'p_js_shapes', facts: 'facts/js-shapes.rofl' },
  { who: 'p_js_statements', facts: 'facts/js-statements.rofl' },
  { who: 'p_js_controlflow', facts: 'facts/js-controlflow.rofl', rules: 'rules/js-controlflow.rofl' },
];
/** The rule packs no fact pack owns: the matrix itself, the shared structure,
 *  and the two vocabulary audits. They declare no kind and are here because the
 *  audit under test reads `kind_named_by_rule` neighbours and because a world
 *  that cannot answer `orphan_claim` cannot be compared with one that can. */
const SHARED_RULES = ['rules/js-structure.rofl', 'rules/js-model.rofl',
  'rules/js-vocabulary.rofl', 'rules/js-pack-home.rofl'];

type Patch = { who: string; find?: string; add?: string; replace?: string };

function world(patches: Patch[] = [], rules = SHARED_RULES, only?: string[]): Rofl {
  const r = new Rofl();
  const load = (text: string, who?: string) => {
    const res = r.load(text, who ? { who } : {});
    assert.ok(res.ok, `REJECTED (${who ?? 'shared'}):\n${res.diagnostics.slice(0, 5).join('\n')}`);
  };
  load(read('boot.rofl'));
  for (const L of LAYERS.filter((L) => !only || only.includes(L.who))) {
    let text = [L.facts, ...(L.rules ? [L.rules] : [])].map(read).join('\n');
    for (const p of patches.filter((x) => x.who === L.who)) {
      if (p.find !== undefined) {
        assert.ok(text.includes(p.find), `mutation anchor absent in ${L.facts}: ${p.find}`);
        text = text.replace(p.find, p.replace ?? '');
      }
      if (p.add) text += '\n' + p.add + '\n';
    }
    load(text, L.who);
  }
  load(rules.map(read).join('\n'));
  r.evaluate(900_000_000);
  return r;
}

const rows = (r: Rofl, lit: string) => {
  const res = r.query(lit, BUDGET);
  assert.equal(res.error, undefined, `${lit}: ${res.error}`);
  assert.equal(res.unpopulatable, false, `${lit}: nothing in this world can populate it`);
  return res.rows.map((x) => x.bindings as Record<string, unknown>);
};
const set = (r: Rofl, lit: string, v: string) =>
  new Set(rows(r, lit).map((b) => String(b[v])));
const pairs = (r: Rofl, lit: string, a: string, b: string) =>
  rows(r, lit).map((x) => `${String(x[a])} ${String(x[b])}`).sort();

// ---------------------------------------------------------------------------
// 1. THE RULE HOLDS, AND THE AUDIT IS NOT VACUOUS

test('every node_kind row is earned by the pack it sits in', () => {
  const r = world();
  // THE POSITIVE CONTROL COMES FIRST, because an empty audit over an empty
  // `pack_declares` would look exactly like a clean tree. The set is the seven
  // principals BY NAME — not a count of rows, which every branch moves.
  assert.deepEqual([...set(r, 'pack_declares(P, K)', 'P')].sort(),
    LAYERS.map((L) => L.who).sort());
  // ...and the slot discovery reached the RULES' own kind tables, not just the
  // six verdict ledgers. Named, because "32 slots" is a number that grows with
  // the model and `callee_shape` is the one that matters here: it is the only
  // thing backing `node_kind(js, tsas_expression)` in facts/js-callgraph.rofl.
  const slots = new Set(pairs(r, 'fkind_slot(Rel, I)', 'Rel', 'I'));
  for (const s of ['handled 2', 'ignored 2', 'unknown_because 2', 'checked 2',
    'shape_of 2', 'kind_absent_ok 1', 'callee_shape 1', 'value_transparent 1'])
    assert.ok(slots.has(s), `kind slot not discovered: ${s}`);

  assert.deepEqual(pairs(r, 'kind_home_unbacked[audit](P, K)', 'P', 'K'), []);
  console.log(`  packs ${LAYERS.length}  slots ${slots.size}`
    + `  declarations ${rows(r, 'pack_declares(P, K)').length}`
    + `  borrows ${rows(r, 'pack_borrows[audit](P, K)').length}`);
});

test('the audit is empty because the rows are placed, not because it is blind', () => {
  // MUTANT 5, and it is the control on the control. Drop the base-pack clause
  // and the rows facts/js-kinds.rofl holds for the LANGUAGE — declared so the
  // denominator is not the model's own list — all report at once. A set, not a
  // count: another branch declaring a twenty-fourth kind grows it and the
  // membership claim below still holds.
  const r = world([], ['rules/js-structure.rofl', 'rules/js-model.rofl',
    'rules/js-vocabulary.rofl']);
  const text = read('rules/js-pack-home.rofl')
    .replace('not pack_speaks(P, K),\n                                   not base_pack(P).',
      'not pack_speaks(P, K).');
  assert.notEqual(text, read('rules/js-pack-home.rofl'), 'mutation anchor absent');
  assert.ok(r.load(text).ok);
  r.evaluate(900_000_000);
  const fired = set(r, 'kind_home_unbacked[audit](P, K)', 'K');
  assert.ok(fired.size > 0, 'the base clause was carrying nothing');
  for (const k of ['static_block', 'reg_exp_literal', 'export_specifier', 'directive'])
    assert.ok(fired.has(k), `${k} is declared in the base pack and unspoken; it should fire`);
  assert.deepEqual([...set(r, 'kind_home_unbacked[audit](P, K)', 'P')], ['p_js_kinds']);
});

// ---------------------------------------------------------------------------
// 2. THE MUTANT SET. Three of the four are named in the brief that asked for
//    this item; the fourth is the one the brief invited by name and it SURVIVES.

test('MUTANT: a row in a pack that says nothing about the kind', () => {
  // `while_statement` is judged by facts/js-statements.rofl and
  // facts/js-controlflow.rofl and by nothing in the shape pack, so a row parked
  // there is earned by nothing. This is the wholesale gather in miniature.
  const r = world([{ who: 'p_js_shapes', add: 'node_kind(js, while_statement).' }]);
  assert.deepEqual(pairs(r, 'kind_home_unbacked[audit](P, K)', 'P', 'K'),
    ['p_js_shapes while_statement']);
});

test('MUTANT: a duplicate in a pack that DOES speak about the kind survives', () => {
  // The brief asked whether anything notices a duplicate. Nothing does, and
  // that is the finding rather than a gap: 274 rows for 100 kinds is what packs
  // that load independently COST, and `f_the_kind_vocabulary_is_scattered...`
  // records the choice to pay it. A copy in a pack that judges the kind is
  // indistinguishable from the copy that was already there — by construction,
  // because the rule is about what a pack SAYS and not about how many packs say
  // it.
  const r = world([{ who: 'p_js_controlflow', add: 'node_kind(js, while_statement).' }]);
  assert.deepEqual(pairs(r, 'kind_home_unbacked[audit](P, K)', 'P', 'K'), []);
  assert.deepEqual(pairs(r, 'orphan_claim[audit](L, K, X)', 'K', 'L'), []);
});

test('MUTANT: gathering every row into the base pack survives THIS audit', () => {
  // ...and it is the mutant the item's own statement proposes. The base clause
  // absorbs it, because a base pack is allowed to declare what it does not
  // judge — that is what a base pack IS. The audit that would catch it does not
  // exist and cannot: see `residue_stale` at the foot of rules/js-pack-home.rofl,
  // measured and deleted. WHAT CATCHES IT IS THE WORLD, and the last test in
  // this file is that measurement.
  const r = world([{ who: 'p_js_kinds', add: 'node_kind(js, while_statement).' }]);
  assert.deepEqual(pairs(r, 'kind_home_unbacked[audit](P, K)', 'P', 'K'), []);
});

test('MUTANT: deleting an earned row is caught in the partial world and NOT in the full one', () => {
  // The other direction, and it is NOT this file's audit that catches it — a
  // deleted row is not a misplaced row. `facts/js-callgraph.rofl` carries
  // `handled(js, identifier, callgraph, r_call_edge)`; take its declaration
  // away and the pack judges a cell that does not exist.
  const del: Patch = { who: 'p_js_callgraph', find: 'node_kind(js, identifier).\n' };
  const partial = world([del], SHARED_RULES, ['p_js_kinds', 'p_js_callgraph']);
  const fired = pairs(partial, 'orphan_claim[audit](L, K, X)', 'K', 'X');
  assert.ok(fired.length > 0, 'orphan_claim slept through a deleted declaration');
  assert.ok(fired.every((s) => s.startsWith('identifier ')), fired.join(' | '));

  // ...AND THE FULL WORLD DOES NOT NOTICE, which is the finding rather than a
  // gap in the test. `identifier` is declared in FOUR packs, so removing one
  // copy leaves the corpus world's vocabulary untouched and every audit in it
  // green. THE DUPLICATION THAT MAKES A PARTIAL WORLD POSSIBLE IS ALSO WHAT
  // MAKES THE FULL WORLD BLIND TO A DELETION — which is the price of the
  // decision `f_the_kind_vocabulary_is_scattered_across_the_packs_that_needed_it`
  // records, measured here for the first time rather than argued.
  const full = world([del]);
  assert.deepEqual(pairs(full, 'orphan_claim[audit](L, K, X)', 'K', 'X'), []);
  assert.deepEqual(pairs(full, 'kind_home_unbacked[audit](P, K)', 'P', 'K'), []);
  assert.ok(set(full, 'node_kind(js, K)', 'K').has('identifier'),
    'positive control: three other packs still declare it');
});

// ---------------------------------------------------------------------------
// 3. WHAT THE GATHER WOULD ACTUALLY COST, WORLD BY WORLD.
//
// The worlds below are the distinct fact-pack combinations this suite builds.
// They are written out HERE, as this file's own data, rather than read out of
// the test files that build them — a pin on somebody else's pack list is the
// hazard `f_a_ledger_keyed_by_name_merges...` names, and the names are in the
// comments so a reader can check them by hand.
//
// Nothing is asserted about a world's CONTENTS, which every branch grows.
// What is asserted is a RELATION between worlds, which no branch moves:
// today every partial world is a proper subset of the full one, and after the
// gather every one of them IS the full one.

const WORLDS: [name: string, packs: string[]][] = [
  // test/js-model.test.ts world()          — the mechanism fixture, alone
  ['the mechanism fixture', ['facts/js-kinds.rofl']],
  // test/js-callgraph.test.ts, test/js-layer-cost.test.ts CALLGRAPH,
  // test/js-fixpoint-cost.test.ts
  ['the call-graph fixpoint', ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl']],
  // test/js-model.test.ts shapeWorld()
  ['the shape axis', ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-shapes.rofl']],
  // test/js-modules.test.ts, test/js-resolve.test.ts, test/js-export-forms.test.ts
  ['the module boundary', ['facts/js-kinds.rofl', 'facts/js-modules.rofl']],
  // test/js-layer-cost.test.ts ERA, test/js-env.test.ts, test/js-directives.test.ts
  ['the era scale', ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
    'facts/js-modules.rofl', 'facts/js-shapes.rofl']],
  // test/js-corpus-world.ts, and every file that builds on it
  ['the whole corpus', ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
    'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
    'facts/js-controlflow.rofl']],
];
const ALL_PACKS = WORLDS[WORLDS.length - 1][1];

/** the js kinds a pack list declares, read out of a world rather than parsed */
function kindsOf(packs: string[], gather = false): Set<string> {
  const r = new Rofl();
  const chunks = gather
    // THE COUNTERFACTUAL, applied mechanically: every `node_kind(js, ...)` row
    // in the tree moves to facts/js-kinds.rofl and no other row moves. This is
    // the item's proposal, executed on a copy of the text.
    ? packs.map((p) => (p === 'facts/js-kinds.rofl'
      ? read(p) + '\n' + ALL_PACKS.map(read).join('\n').split('\n')
        .filter((l) => /^node_kind\(js,/.test(l)).join('\n')
      : read(p).split('\n').filter((l) => !/^node_kind\(js,/.test(l)).join('\n')))
    : packs.map(read);
  assert.ok(r.load([read('boot.rofl'), ...chunks].join('\n')).ok);
  const res = r.query('node_kind(js, K)', BUDGET);
  assert.equal(res.unpopulatable, false);
  return new Set(res.rows.map((x) => String(x.bindings.K)));
}

test('every partial world is a proper subset today, and the gather flattens them all', () => {
  const full = kindsOf(ALL_PACKS);
  const flattened: string[] = [];
  for (const [name, packs] of WORLDS) {
    const now = kindsOf(packs);
    for (const k of now) assert.ok(full.has(k), `${name}: ${k} is not in the whole corpus`);
    const after = kindsOf(packs, true);
    console.log(`  ${name.padEnd(24)} ${String(now.size).padStart(3)} kinds`
      + ` -> ${String(after.size).padStart(3)} after the gather`
      + `  (+${after.size - now.size})`);
    // AFTER THE GATHER EVERY WORLD KNOWS EVERY KIND. That is the whole result:
    // the six worlds this suite distinguishes stop being six.
    assert.deepEqual([...after].sort(), [...full].sort(),
      `${name} did not become the full vocabulary`);
    if (now.size < full.size) flattened.push(name);
  }
  // ...and the set of worlds that would be flattened is every one but the last.
  assert.deepEqual(flattened, WORLDS.slice(0, -1).map(([n]) => n));
});

test('the gather puts rows in a pack that speaks about none of them', () => {
  // The same counterfactual read through the audit rather than through the
  // worlds, and the two agree: the rows the gather ADDS to the base pack are
  // rows no pack speaks about from there. The audit cannot report them, because
  // the base clause exempts the pack they land in — which is exactly why the
  // world measurement above is the oracle for this mutant and not this rule.
  const full = kindsOf(ALL_PACKS);
  const base = kindsOf(['facts/js-kinds.rofl']);
  const moved = [...full].filter((k) => !base.has(k));
  const r = world();
  const speaks = new Set(rows(r, 'pack_speaks(P, K)')
    .filter((b) => String(b.P) === 'p_js_kinds').map((b) => String(b.K)));
  const unspoken = moved.filter((k) => !speaks.has(k)).sort();
  assert.deepEqual(unspoken, moved.sort(), 'the base pack judges one of the moved kinds');
  console.log(`  the gather moves ${moved.length} kinds into a pack that judges none of them`);
});
