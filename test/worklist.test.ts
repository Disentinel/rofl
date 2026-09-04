// worklist.test.ts — THE PLAN, AND THE WORLD NOBODY WAS BUILDING
//
// Two things are under test and only one of them is the queue.
//
// THE FIRST IS THE WORLD. Every other test here builds a model from a SUBSET
// of the fact packs — js-kinds plus the callgraph ones, or js-modules plus
// js-kinds — and the audits are asserted over that subset. Loading all five
// together is a different program, and it says something the subsets cannot:
// `stale_reason[audit]` fires three rows that no gate has ever seen, because
// the only world they exist in is one nobody built. Those three are pinned
// below by name, with the queue item that owns them.
//
// THE SECOND IS THE QUEUE'S OWN HONESTY. A plan that quietly stops matching
// the model is worse than no plan, so every way it can lie is a positive row:
// an open cell nobody owns, an item pointing at a shut cell, two owners for
// one cell, and a claim of completion the model contradicts. Each is planted
// below and each must go red.
//
// WHAT THE MUTANTS MEASURED, including the one that lives: a deleted claim is
// INVISIBLE, because the layer's sweeping item absorbs whatever is unclaimed.
// That is what a bucket is for and no rule can close it, so the detector is a
// NUMBER — how many cells each sweep absorbs, pinned here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';

const ROOT = new URL('../', import.meta.url);
const read = (p: string) => fs.readFileSync(new URL(p, ROOT), 'utf8');

const FACTS = ['facts/js-kinds.rofl', 'facts/js-shapes.rofl', 'facts/js-modules.rofl',
  'facts/js-callgraph.rofl', 'facts/js-resolve.rofl', 'facts/js-dataflow.rofl', 'facts/findings.rofl'];
const RULES = ['rules/js-model.rofl', 'rules/worklist.rofl'];

interface Mut { find?: string; replace?: string; extra?: string }

function world(m: Mut = {}) {
  const r = new Rofl();
  const load = (text: string, what: string) => {
    const res = r.load(text);
    assert.equal(res.ok, true, `${what} rejected:\n${res.diagnostics.slice(0, 3).join('\n')}`);
  };
  load(read('boot.rofl'), 'boot.rofl');
  for (const f of FACTS) load(read(f), f);
  for (const f of RULES) load(read(f), f);
  let plan = read('facts/worklist.rofl');
  if (m.find !== undefined) {
    assert.ok(plan.includes(m.find), `mutation anchor absent: ${m.find}`);
    plan = plan.replace(m.find, m.replace ?? '');
  }
  if (m.extra) plan += '\n' + m.extra;
  load(plan, 'facts/worklist.rofl');
  r.evaluate(8_000_000);
  return {
    n: (q: string) => r.query(q).rows.length,
    binds: (q: string, ...vs: string[]) =>
      r.query(q).rows.map((row) => vs.map((v) => row.bindings[v]).join('/')).sort(),
  };
}

/** every way the plan can lie, as one list, so a new one cannot be forgotten */
const LIES = [
  'unqueued[audit](K, S, L)',
  'queue_stale[audit](W, K, S, L)',
  'false_done[audit](W, K, S, L)',
  'double_owned[audit](K, S, L, A, B)',
  'spawn_orphan[audit](W, F)',
  'work_unstated[audit](W)',
  'work_unordered[audit](W)',
  'work_stateless[audit](W)',
  'work_bad_state[audit](W, S)',
  'work_sweeps_nolayer[audit](W, L)',
  'needs_unknown[audit](W, O)',
  'needs_cycle[audit](W)',
];

test('the five-pack world loads and the plan tells no lie', () => {
  const w = world();
  for (const lie of LIES) assert.equal(w.n(lie), 0, lie);
  // the ledger's own audits over this world, which is the point of building it
  assert.equal(w.n('orphan[audit](Q, A, K, S, L)'), 0, 'a claim over a cell that does not exist');
  assert.equal(w.n('unknown_ledger[audit](Q)'), 0, '`queued` is a declared ledger');
  assert.equal(w.n('double_cell[audit](A, K, L)'), 0);
  assert.equal(w.n('bad_reason[audit](A, K, L, R)'), 0);
});

test('THE THREE ROWS NO SUBSET WORLD CONTAINED, and what closed them', () => {
  const w = world();
  // WHAT THIS WORLD SAID WHEN IT WAS FIRST BUILT: three rows of
  // `stale_reason[audit]` — import_declaration/modules at out_of_scope and
  // not_yet, import_expression/modules at runtime_dependent — a correct audit
  // reporting a false positive, because all three excuses were ALIVE while the
  // cells they sat on were `handled`. The coverage was PARTIAL and a matrix
  // keyed by kind cannot say so. Deleting the rows would have been the error.
  assert.deepEqual(w.binds('stale_reason[audit](A, K, L, R)', 'K', 'L', 'R'), []);
  assert.deepEqual(w.binds('stale_reason[audit](A, K, S, L, R)', 'K', 'L', 'R'), []);

  // WHAT CLOSED THEM: the specifier refinement. The same three statements are
  // still made and each now names the shape it is true of, which is the only
  // difference between an excuse and a frontier.
  assert.deepEqual(w.binds('shaped_because[audit](A, K, S, modules, R)', 'K', 'S', 'R'), [
    'import_declaration/bare/out_of_scope',
    'import_declaration/subpath/not_yet',
    'import_expression/computed/runtime_dependent',
  ], 'the values are the ones rules/js-modules.rofl already derives, not a second vocabulary');
  // and the refinement did not leak into the layer where a specifier is
  // meaningless — that is what `shape_in` is for
  assert.equal(w.n('cell[audit](A, K, bare, callgraph)'), 0, 'no phantom cell');
  assert.equal(w.n('unearned_axis[audit](A, L)'), 0, 'both layers earn the column');

  assert.deepEqual(w.binds('work_spawned(W, F)', 'W'),
    ['w_cg_member_family', 'w_mod_partial_cell']);
  assert.deepEqual(w.binds('next_work[audit](W)', 'W'), ['w_df_value_core'],
    'item 1 is done and three call-graph items are blocked on dataflow');
});

test('the queue covers the model: 105 open cells, 37 claimed by name, 68 swept', () => {
  const w = world();
  assert.equal(w.n('open_cell[audit](K, S, L)'), 105, 'the queue is the model\'s open set');
  assert.equal(w.n('work(W, Note)'), 13);

  // PER LAYER, and the swept figures are the ONLY detector for a claim that
  // quietly falls into a bucket — see the mutant below that lives.
  const per = (l: string) => [w.n(`open_cell[audit](K, S, ${l})`),
    w.n(`claimed(K, S, ${l})`), w.n(`sweeper(K, S, ${l})`)];
  assert.deepEqual(per('callgraph'), [38, 21, 17]);
  assert.deepEqual(per('dataflow'), [29, 16, 13]);
  assert.deepEqual(per('modules'), [38, 0, 38]);

  // AN IRREDUCIBLE UNKNOWN IS NOT WORK, and it is the one thing deliberately
  // kept out of the queue — named rather than counted, because a count cannot
  // notice a cell quietly moving between the two halves.
  assert.deepEqual(w.binds('irreducible_unknown[audit](A, K, S, L)', 'K', 'S', 'L'), [
    'import_expression/computed/modules',
    'import_expression/none/callgraph',
    'import_expression/none/dataflow',
    'member_expression/s_computed_dynamic_key/callgraph',
    'optional_member_expression/s_computed_dynamic_key/callgraph',
  ], 'a dynamic import specifier and a computed key: nobody is ever assigned these');
});

// ===========================================================================
// THE MUTANT SET. Seven planted defects, six killed, one alive and named.

test('MUTANT 1 — a claim on a kind nobody declares', () => {
  // THE DESIGN ARGUMENT, MEASURED. This is caught by `orphan[audit]`, a rule
  // written before this pack existed, because the queue is spelled as a
  // `claim` rather than as a relation of its own. CLAUDE.md records what the
  // other choice costs: a new relation over the same arguments reopened the
  // whole vocabulary hole and nobody noticed.
  const w = world({ extra: 'claim(queued, js, no_such_kind, none, dataflow, w_df_value_core).' });
  assert.equal(w.n('orphan[audit](Q, A, K, S, L)'), 1, 'the inherited check bites');
  assert.equal(w.n('queue_stale[audit](W, K, S, L)'), 1, 'and the queue says it points at nothing open');
});

test('MUTANT 2 — a real shape claimed in the wrong layer', () => {
  // `s_member_on_this` exists, `dataflow` exists, and the CELL does not: the
  // shape axis applies to callgraph only. A pair of legal names is not a legal
  // cell, which is the check a per-argument vocabulary test would miss.
  const w = world({ extra: 'claim(queued, js, member_expression, s_member_on_this, dataflow, w_df_value_core).' });
  assert.equal(w.n('orphan[audit](Q, A, K, S, L)'), 1);
});

test('MUTANT 3 — a sweep marked done while its layer still has open cells', () => {
  const w = world({ find: 'work_state(w_df_sweep, open).', replace: 'work_state(w_df_sweep, done).' });
  assert.equal(w.n('unqueued[audit](K, S, L)'), 13,
    'the residue goes straight back on the unqueued list');
});

test('MUTANT 4 — a named item marked done while its cells are open', () => {
  // the defect docs/modelling-a-language.md fears by name: a filled matrix
  // looks finished. Here the model contradicts the claim of completion.
  const w = world({ find: 'work_state(w_cg_member_family, open).', replace: 'work_state(w_cg_member_family, done).' });
  assert.equal(w.n('false_done[audit](W, K, S, L)'), 9, 'one row per cell it did not close');
});

test('MUTANT 5 — two items owning one cell', () => {
  const w = world({ extra: 'claim(queued, js, new_expression, s_new_result, callgraph, w_cg_member_family).' });
  assert.equal(w.n('double_owned[audit](K, S, L, A, B)'), 2, 'both orderings of the pair');
});

test('MUTANT 6 — a spawned finding that is not in the ledger', () => {
  const w = world({ extra: 'work_spawned(w_cg_sweep, f_no_such_finding).' });
  assert.equal(w.n('spawn_orphan[audit](W, F)'), 1);
});

test('MUTANT 7 — an item with no order and no state', () => {
  const w = world({ extra: 'work(w_ghost, "neither ordered nor stated").' });
  assert.equal(w.n('work_unordered[audit](W)'), 1);
  assert.equal(w.n('work_stateless[audit](W)'), 1);
});

test('MUTANT 8 — THE ONE THAT LIVES: a deleted claim vanishes into the sweep', () => {
  const base = world();
  const w = world({ find: 'claim(queued, js, new_expression, s_new_result, callgraph, w_cg_new_expression).' });
  // EVERY LIE-DETECTOR STAYS QUIET. The cell is still open, still owned — by
  // the layer's bucket instead of by the item that was supposed to do it.
  for (const lie of LIES) assert.equal(w.n(lie), 0, `${lie} caught it after all — update this test`);
  // and the ONLY thing that moved is the number this test pins
  assert.equal(base.n('sweeper(K, S, callgraph)'), 17);
  assert.equal(w.n('sweeper(K, S, callgraph)'), 18, 'specificity leaked into the bucket');
  assert.equal(w.n('claimed(K, S, callgraph)'), 20);
  console.log('  ALIVE by construction: a bucket cannot tell a lost claim from an unclaimed cell;'
    + ' swept 15 -> 16 is the whole signal');
});

test('MUTANT 9 — a dependency the plan does not honour', () => {
  // THE DEFECT THIS RELATION WAS ADDED FOR, planted: `w_cg_call_result` says in
  // its note that it waits on dataflow returns, and for three commits it sat
  // AHEAD of the item it waits on. A note cannot refuse to hand out an item.
  const base = world();
  assert.deepEqual(base.binds('next_work[audit](W)', 'W'), ['w_df_value_core']);
  assert.ok(base.n('blocked[audit](W)') >= 3, 'three call-graph items wait on dataflow');

  // with the dependencies dropped, the queue hands out the lowest number
  // regardless of whether its premise exists
  const mut = world({ find: 'work_needs(w_cg_member_family, w_df_value_core).', replace: '' });
  assert.equal(mut.n('blocked[audit](W)'), base.n('blocked[audit](W)') - 1);
  console.log(`  KILLED: blocked ${base.n('blocked[audit](W)')} -> ${mut.n('blocked[audit](W)')}`);
});

test('MUTANT 10 — a dependency on an item nobody declared, and a cycle', () => {
  const unknown = world({ extra: 'work_needs(w_df_value_core, w_no_such_item).' });
  assert.equal(unknown.n('needs_unknown[audit](W, O)'), 1);
  const cyc = world({ extra: 'work_needs(w_df_value_core, w_cg_member_family).' });
  assert.ok(cyc.n('needs_cycle[audit](W)') >= 2, 'both ends of the loop are named');
  console.log(`  KILLED: needs_unknown 1, needs_cycle ${cyc.n('needs_cycle[audit](W)')}`);
});
