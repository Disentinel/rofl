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
  'reason_unclassified[audit](R)',
  'blocker_unknown[audit](K, S, L, C)',
  'blocker_stale[audit](K, S, L)',
];

/** `scope_unowned` is NOT in that list: it is expected to be non-empty. It
 *  names the exclusions nobody with the authority has confirmed, and an empty
 *  list would mean either every scope question is settled or the audit stopped
 *  looking. The rows are pinned instead. */

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

  // `w_cg_member_family` appears four times: one finding it was created for and
  // three the catch-all split found. An item that spawns nothing is either
  // trivial or was not looked at.
  assert.deepEqual(w.binds('work_spawned(W, F)', 'W'),
    ['w_body_order_is_load_bearing',
     'w_cg_call_result', 'w_cg_call_result', 'w_cg_call_result',
     'w_cg_member_family', 'w_cg_member_family', 'w_cg_member_family', 'w_cg_member_family',
     'w_env_ledger_form', 'w_env_scan_failed',
     'w_leak_variable_on_the_right', 'w_mod_partial_cell']);
  // Two items have come off the front since: `w_cg_member_family` was skipped
  // once its catch-all split left only the blocked template key, and
  // `w_cg_call_result` is done — `super()` modelled, the dynamic-import shape
  // waived as unreachable.
  assert.deepEqual(w.binds('next_work[audit](W)', 'W'), ['w_df_control_forms'],
    'the two call-graph items are settled, so the control forms are next');
});

test('the queue covers the model: 81 open cells, 17 claimed by name, 70 swept', () => {
  const w = world();
  assert.equal(w.n('open_cell[audit](K, S, L)'), 81, 'the queue is the model\'s open set');
  // 14 before the environment layer, 19 after it, 20 once `super()` turned up a
  // kernel defect of its own. Every one of the six was entered because the work
  // found it, not because it was foreseen.
  assert.equal(w.n('work(W, Note)'), 20);

  // PER LAYER, and the swept figures are the ONLY detector for a claim that
  // quietly falls into a bucket — see the mutant below that lives.
  const per = (l: string) => [w.n(`open_cell[audit](K, S, ${l})`),
    w.n(`claimed(K, S, ${l})`), w.n(`sweeper(K, S, ${l})`)];
  // callgraph 24 -> 25 and claimed 9 -> 11: the catch-all split closed six
  // cells and opened two that are now claimed BY NAME by the items that own
  // them — the control-form item and the standard-library one — which is the
  // queue handing work on rather than a bucket absorbing it.
  assert.deepEqual(per('callgraph'), [24, 11, 19]);
  assert.deepEqual(per('dataflow'), [18, 6, 12]);
  assert.deepEqual(per('modules'), [39, 0, 39]);

  // AN IRREDUCIBLE UNKNOWN IS NOT WORK, and it is the one thing deliberately
  // kept out of the queue — named rather than counted, because a count cannot
  // notice a cell quietly moving between the two halves.
  // THREE, not five. The two computed-key cells LEFT this list on 2026-09-04:
  // the value layer resolved two of their three sites, so the cells are
  // `handled` and what remains unknowable is the RESIDUE, recorded in
  // `shape_because`. `runtime_dependent` was a verdict about a SHAPE and the
  // shape turned out to contain decidable sites — which is the finding
  // f_runtime_dependent_is_a_verdict_about_a_shape_and_both_its_sites_are_decidable
  // coming true, found by `unrecorded_coverage[audit]` rather than remembered.
  assert.deepEqual(w.binds('irreducible_unknown[audit](A, K, S, L)', 'K', 'S', 'L'), [
    'import_expression/computed/modules',
    'import_expression/none/callgraph',
    'import_expression/none/dataflow',
  ], 'a dynamic import specifier: nobody is ever assigned these');
});

// ===========================================================================
// THE MUTANT SET. Seven planted defects, six killed, one alive and named.

test('MUTANT 1 — a claim on a kind nobody declares', () => {
  // THE DESIGN ARGUMENT, MEASURED. This is caught by `orphan[audit]`, a rule
  // written before this pack existed, because the queue is spelled as a
  // `claim` rather than as a relation of its own. CLAUDE.md records what the
  // other choice costs: a new relation over the same arguments reopened the
  // whole vocabulary hole and nobody noticed.
  const w = world({ extra: 'claim(queued, js, no_such_kind, none, callgraph, w_cg_member_family).' });
  assert.equal(w.n('orphan[audit](Q, A, K, S, L)'), 1, 'the inherited check bites');
  assert.equal(w.n('queue_stale[audit](W, K, S, L)'), 1, 'and the queue says it points at nothing open');
});

test('MUTANT 2 — a real shape claimed in the wrong layer', () => {
  // `s_member_on_this` exists, `dataflow` exists, and the CELL does not: the
  // shape axis applies to callgraph only. A pair of legal names is not a legal
  // cell, which is the check a per-argument vocabulary test would miss.
  const w = world({ extra: 'claim(queued, js, member_expression, s_member_on_this, dataflow, w_cg_member_family).' });
  assert.equal(w.n('orphan[audit](Q, A, K, S, L)'), 1);
});

test('MUTANT 3 — a sweep marked done while its layer still has open cells', () => {
  const w = world({ find: 'work_state(w_df_sweep, open).', replace: 'work_state(w_df_sweep, done).' });
  assert.equal(w.n('unqueued[audit](K, S, L)'), 12,
    'the residue goes straight back on the unqueued list');
});

test('MUTANT 4 — a named item marked done while its cells are open', () => {
  // the defect docs/modelling-a-language.md fears by name: a filled matrix
  // looks finished. Here the model contradicts the claim of completion.
  // ONE row now, not two: the split closed every cell this item owned except
  // the blocked template key. And this is not only a mutant — the same row
  // fired for real when the item was marked done in facts/worklist.rofl, which
  // is how the state was corrected to `open` with `nothing_workable`.
  const w = world({ find: 'work_state(w_cg_member_family, open).', replace: 'work_state(w_cg_member_family, done).' });
  assert.equal(w.n('false_done[audit](W, K, S, L)'), 1, 'one row per cell it did not close');
});

test('MUTANT 5 — two items owning one cell', () => {
  const w = world({ extra: 'claim(queued, js, tsas_expression, s_ts_as, callgraph, w_cg_member_family).' });
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
  // THE ANCHOR MOVED 2026-09-04. It used to delete the claim on
  // `s_member_on_other`, which no longer exists as an open cell — the catch-all
  // was split and then waived. Its successor is one of the cells the split
  // handed to another item, which is the same construction: a claim by name
  // whose deletion leaves the cell open, owned by the layer's bucket, and
  // every lie-detector quiet.
  const w = world({ find: 'claim(queued, js, member_expression, s_member_on_await,    callgraph, w_df_control_forms).' });
  // EVERY LIE-DETECTOR STAYS QUIET. The cell is still open, still owned — by
  // the layer's bucket instead of by the item that was supposed to do it.
  for (const lie of LIES) assert.equal(w.n(lie), 0, `${lie} caught it after all — update this test`);
  // and the ONLY thing that moved is the number this test pins
  assert.equal(base.n('sweeper(K, S, callgraph)'), 19);
  assert.equal(w.n('sweeper(K, S, callgraph)'), 20, 'specificity leaked into the bucket');
  assert.equal(w.n('claimed(K, S, callgraph)'), 10);
  console.log('  ALIVE by construction: a bucket cannot tell a lost claim from an unclaimed cell;'
    + ' swept 19 -> 20 is the whole signal');
});

test('MUTANT 9 — a dependency the plan does not honour', () => {
  // THE DEFECT THIS RELATION WAS ADDED FOR, planted: `w_cg_call_result` says in
  // its note that it waits on dataflow returns, and for three commits it sat
  // AHEAD of the item it waits on. A note cannot refuse to hand out an item.
  const base = world();
  assert.deepEqual(base.binds('next_work[audit](W)', 'W'), ['w_df_control_forms']);
  // ONE dependency is live now and it is DELIBERATE: `w_env_ledger_form` waits
  // on `w_leak_variable_on_the_right`, a kernel question the owner has said to
  // hold. That is the relation doing its job on a real premise rather than on a
  // planted one — the queue will not offer the ledger form until the leak audit
  // can see a variable on the right of a crossing.
  assert.equal(base.n('blocked[audit](W)'), 1, 'exactly the one held on purpose');
  assert.deepEqual(base.binds('blocked[audit](W)', 'W'), ['w_env_ledger_form']);

  // ADDING one makes the queue refuse to hand out an item whose premise is not
  // done — which is the whole content of the relation
  const mut = world({ extra: 'work_needs(w_cg_syntactic_wrappers, w_controlflow_layer).' });
  assert.equal(mut.n('blocked[audit](W)'), 2, 'the planted one on top of the real one');
  assert.deepEqual(mut.binds('next_work[audit](W)', 'W'), ['w_df_control_forms'],
    'and the blocked item is skipped rather than handed out');
  console.log(`  KILLED: blocked ${base.n('blocked[audit](W)')} -> ${mut.n('blocked[audit](W)')}`);
});

test('MUTANT 10 — a dependency on an item nobody declared, and a cycle', () => {
  const unknown = world({ extra: 'work_needs(w_cg_syntactic_wrappers, w_no_such_item).' });
  assert.equal(unknown.n('needs_unknown[audit](W, O)'), 1);
  const cyc = world({ extra: 'work_needs(w_controlflow_layer, w_cg_syntactic_wrappers).\nwork_needs(w_cg_syntactic_wrappers, w_controlflow_layer).' });
  assert.ok(cyc.n('needs_cycle[audit](W)') >= 2, 'both ends of the loop are named');
  console.log(`  KILLED: needs_unknown 1, needs_cycle ${cyc.n('needs_cycle[audit](W)')}`);
});

test('a cell can be blocked by something that is not a work item', () => {
  const w = world();
  // TWO TEMPLATE-KEY CELLS, blocked on the SCANNER's contract rather than on
  // another item: a template literal's text lives in `TemplateElement.value`,
  // which is a nested object, and the scanner emits only scalar own properties.
  // `work_needs` could not say this — it only points at other work — so the
  // queue used to hand these out as if nobody had got to them.
  assert.deepEqual(w.binds('cell_blocked(K, S, L, C)', 'S', 'C'), [
    's_computed_template_key/scanner_contract',
    's_computed_template_key/scanner_contract',
  ]);
  assert.equal(w.n('open_cell[audit](K, S, L)') - w.n('workable(K, S, L)'), 2,
    'blocked cells are open and not workable');

  // AND THE ITEM THEY BELONG TO IS SKIPPED WITH A REASON, not silently:
  // BOTH member items now, and they are siblings: the two template-key cells
  // are blocked on the same scanner contract, and neither item has anything
  // else left to do.
  assert.deepEqual(w.binds('nothing_workable[audit](W)', 'W'),
    ['w_cg_member_family', 'w_cg_optional_member']);
  assert.ok(!w.binds('next_work[audit](W)', 'W').includes('w_cg_optional_member'));
});

test('a decision already taken is not work', () => {
  const w = world();
  // `unknown_type` calls `out_of_scope` ours rather than the program's, which
  // is right for the matrix and wrong for a plan: it is a decision already
  // taken. Three cells were being offered as work on that reading.
  assert.deepEqual(w.binds('reason_is_work(R)', 'R'), ['not_yet']);
  assert.deepEqual(w.binds('reason_not_work(R)', 'R'), ['budget_exhausted', 'out_of_scope']);
  assert.equal(w.n('reason_unclassified[audit](R)'), 0, 'every ours-reason has an opinion');

  // planted: a new reason in the taxonomy with no opinion about it
  const mut = world({ extra: 'unknown_type(some_new_reason, ours).' });
  assert.deepEqual(mut.binds('reason_unclassified[audit](R)', 'R'), ['some_new_reason'],
    'adding a reason forces a decision about whether it means work');
});

test('MUTANT 11 — a blocker on a cell that is no longer open', () => {
  const mut = world({ extra: 'cell_blocked(js_no_such, none, callgraph, scanner_contract).' });
  assert.equal(mut.n('blocker_stale[audit](K, S, L)'), 1, 'a blocker outliving its cell');
  const bad = world({ extra: 'cell_blocked(member_expression, s_member_on_other, callgraph, vibes).' });
  assert.deepEqual(bad.binds('blocker_unknown[audit](K, S, L, C)', 'C'), ['vibes']);
});

test('an exclusion nobody owns is a row, not a silence', () => {
  const w = world();
  // `out_of_scope` takes a cell OUT of the work queue, so writing one decides
  // that nobody will ever do it — the owner's call, not the model's and not
  // mine. Four were written on my own judgement in one session before this was
  // caught; each was plausible, which is exactly the failure mode.
  assert.deepEqual(w.binds('scope_unowned[audit](K, S, L)', 'K', 'S', 'L'), [
    'array_expression/none/callgraph',
    'import_declaration/bare/modules',
    'member_expression/s_member_on_array/callgraph',
  ], 'three exclusions stand on nobody recorded — two of them predate this branch');

  // and the audit really can go quiet, so a green reading would mean something
  const settled = world({ extra: 'scope_decided(array_expression, none, callgraph).' });
  assert.equal(settled.n('scope_unowned[audit](K, S, L)'), 2, 'one owner decision, one row fewer');
});
