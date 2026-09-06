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

// `facts/js-controlflow.rofl` joined 2026-09-04 and it is not optional: it
// carries `layer(controlflow).`, and without it the plan's claim on
// `return_statement x controlflow` points at a cell that does not exist —
// `queue_stale[audit]` said so on the first run, which is the plan and the
// model disagreeing about which world they are in.
const FACTS = ['facts/js-kinds.rofl', 'facts/js-shapes.rofl', 'facts/js-modules.rofl',
  'facts/js-callgraph.rofl', 'facts/js-resolve.rofl', 'facts/js-dataflow.rofl',
  'facts/js-statements.rofl', 'facts/js-controlflow.rofl', 'facts/findings.rofl'];
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
  // THREE BECAME SIX on 2026-09-05, and the three new rows are the modules
  // sweep's whole finding: `require()` is a module edge the layer cannot see,
  // and the two re-export forms were WAIVED — a verdict class that says the
  // language offers nothing to model — beside a comment calling the work undone.
  assert.deepEqual(w.binds('shaped_because[audit](A, K, S, modules, R)', 'K', 'S', 'R'), [
    'call_expression/none/not_yet',
    'export_all_declaration/none/not_yet',
    // ...and the DEFAULT form joined on 2026-09-06, entered by
    // `vocabulary_gap[audit]` the moment a default export appeared in the
    // corpus. It is open for the same reason as its two siblings and owned by
    // the same item: this layer has ONE edge kind and `export default` is not it.
    'export_default_declaration/none/not_yet',
    'export_named_declaration/none/not_yet',
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
    ['w_body_order_is_load_bearing', 'w_body_order_is_load_bearing',
     'w_body_order_is_load_bearing',
     'w_cf_abrupt_transfer', 'w_cf_abrupt_transfer',
     'w_cf_reachability', 'w_cf_reachability',
     'w_cf_sweep', 'w_cf_sweep',
     'w_cg_call_result', 'w_cg_call_result', 'w_cg_call_result',
     'w_cg_member_family', 'w_cg_member_family', 'w_cg_member_family', 'w_cg_member_family',
     'w_cg_sweep', 'w_cg_sweep',
     'w_controlflow_layer', 'w_controlflow_layer', 'w_controlflow_layer', 'w_controlflow_layer',
     'w_cost_gate_per_layer',
     'w_df_control_forms', 'w_df_control_forms', 'w_df_control_forms',
     'w_df_control_forms', 'w_df_control_forms',
     'w_df_instance_vs_class',
     'w_effect_layer',
     'w_env_ledger_form', 'w_env_positional_features',
     'w_env_scan_failed', 'w_env_scan_failed', 'w_join_planner',
     'w_leak_variable_on_the_right', 'w_leak_variable_on_the_right', 'w_mod_partial_cell',
     'w_negation_range_restriction', 'w_scope_binding',
     'w_vocabulary_frame', 'w_vocabulary_home']);
  // FOUR items have come off the front, and the last of them was the one this
  // whole plan was built to reach: `w_controlflow_layer` is done — one fact,
  // fifty cells — so what is left at the head is arithmetic, the call-graph
  // residue sweep.
  // FIVE off the front now: the call-graph sweep finished on 2026-09-05 and the
  // head moved to the next sweep along. Two of the four layers are swept.
  // ALL FOUR SWEEPS ARE DONE as of 2026-09-05, so the head of the queue is a
  // named question for the first time since the plan was seeded: what a
  // class-shaped node DENOTES — `new C()` against `C`, and `super`.
  // ...and the first named question is DONE, so the head is the one thing only
  // the host can supply: a file the scanner refuses contributes no facts, so
  // `valid[audit]` neither accepts nor refuses it.
  // ...and the head reached the item the OWNER IS HOLDING on 2026-09-05, which
  // is what turned the hold into a row. `w_leak_variable_on_the_right` was given
  // order 19 with the comment "ordered LAST because it is the owner's to
  // schedule"; the queue grew to 38 items, so 19 became the middle and the plan
  // started handing out work he had said to hold. A position is a fact about a
  // sequence, not about a person.
  // ...and the abrupt item closed on 2026-09-06, taking four cells with it, and
  // the reachability item closed the same day taking five more. The head is the
  // EXCEPTION PATH — the owner's own observation that an exception is control
  // flow, and the first dataflow edge here that travels along it rather than
  // along the syntax.
  assert.deepEqual(w.binds('next_work[audit](W)', 'W'), ['w_exception_flow'],
    'the sweeps are finished; the head is judgement again');
  assert.deepEqual(w.binds('held(W, Who)', 'W', 'Who'), ['w_leak_variable_on_the_right/vadim']);
  assert.equal(w.n('held_unknown[audit](W)'), 0, 'a hold names an item that exists');
});

test('the queue covers the model: 38 open cells, every one owned by name, none swept', () => {
  const w = world();
  // 83 -> 48 when the last bucket closed. Every open cell in the model now has
  // an item that owns it BY NAME: `sweeper` is empty at all four layers, which
  // is the first time since the plan was seeded that no cell is absorbed.
  // 48 -> 46: the receiver split closed `class_declaration x dataflow`, and
  // `super x dataflow` turned out to need no rule at all — a site was all it
  // was missing.
  // 40 -> 38 the same day, and the two moves in it point OPPOSITE ways:
  // `r_reachability` closed FIVE function-form cells at controlflow, and one new
  // kind (`export_default_declaration`) opened THREE — callgraph, dataflow and
  // modules, all claimed by the items that already own its siblings. A single
  // number would have said "down two" and hidden both.
  // 44 -> 40 on 2026-09-06: `r_abrupt` closed return, throw, break and continue
  // at controlflow, and the item that closed them SPAWNED a successor
  // (w_cf_completion) that claims no cell — the gap lives in the rules, not in
  // any (kind, layer) coordinate, which is the shape f_a_blindness_can_have_no_cell
  // already names.
  assert.equal(w.n('open_cell[audit](K, S, L)'), 38, 'the queue is the model\'s open set');
  assert.equal(w.n('sweeper(K, S, L)'), 0, 'no bucket anywhere');
  // 14 before the environment layer, 19 after it, 20 once `super()` turned up a
  // kernel defect of its own. Every one of the six was entered because the work
  // found it, not because it was foreseen. 27 -> 32 on 2026-09-05: the five
  // layers the sweep did not reach, entered as ITEMS and not as `layer(L)` —
  // five layers would have opened 320 cells and answered the question each item
  // exists to ask.
  assert.equal(w.n('work(W, Note)'), 41);

  // PER LAYER, and the swept figures are the ONLY detector for a claim that
  // quietly falls into a bucket — see the mutant below that lives.
  const per = (l: string) => [w.n(`open_cell[audit](K, S, ${l})`),
    w.n(`claimed(K, S, ${l})`), w.n(`sweeper(K, S, ${l})`)];
  // callgraph 24 -> 25 and claimed 9 -> 11: the catch-all split closed six
  // cells and opened two that are now claimed BY NAME by the items that own
  // them — the control-form item and the standard-library one — which is the
  // queue handing work on rather than a bucket absorbing it.
  // ...and 11 -> 12 on 2026-09-05, when the aliasing item claimed the
  // assignment: `obj.x = f` is a call-graph fact and it had been swept.
  // THEN THE SWEEP RAN and the bucket went to ZERO: 18 cells, of which 4 were
  // residue and closed here, 3 were already modelled and 11 went to items. A
  // layer with no sweeper is a layer whose every open cell has a named owner.
  assert.deepEqual(per('callgraph'), [18, 25, 0]);
  // THE DATAFLOW SWEEP, 2026-09-05: 12 cells out of the bucket and ZERO new
  // items — one already modelled and never recorded, two closed with a reason,
  // nine onto items the two earlier sweeps had already made. Three of four
  // layers now have no bucket at all.
  assert.deepEqual(per('dataflow'), [12, 16, 0]);
  // THE MODULES SWEEP, 2026-09-05: 39 cells down to 4, all four owned. Two of
  // them came from OUTSIDE the bucket — a waiver whose own comment described
  // undone work, which is open work counted as settled.
  assert.deepEqual(per('modules'), [5, 5, 0]);
  // THE FOURTH LAYER, SWEPT. Thirty-seven cells became fifty-two when the
  // control constructs were declared, and the sweep closed forty of them with a
  // reason. The twelve that are left are all claimed BY NAME and none is swept:
  // a sweep that finds twelve cells worth an item is not a bucket.
  // 12 -> 8 on 2026-09-06: the four abrupt kinds are modelled, and their claims
  // stay on the DONE item so `false_done[audit]` keeps guarding that they really
  // did close — claimed stays at 12 while open drops to 8.
  // 8 -> 3 on 2026-09-06: `r_reachability` answered all five function forms.
  // Three cells left at the layer that was swept two days ago.
  assert.deepEqual(per('controlflow'), [3, 12, 0]);

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

test('MUTANT 3 — the sweeps stopped being load-bearing, and that is the milestone', () => {
  // WHAT THIS TEST USED TO PLANT: a sweep marked `done` while its layer still
  // had open cells, so the residue went straight back on the unqueued list.
  // By 2026-09-05 all four sweeps are done AND every cell they left open is
  // claimed by name, so a sweep absorbs NOTHING and its state changes nothing.
  // The mutant has no subject left, and rather than delete it the fact is
  // asserted: reopening every sweep moves not one row.
  const base = world();
  assert.equal(base.n('sweeper(K, S, L)'), 0, 'no layer has a bucket');
  const reopened = world({ find: 'work_state(w_mod_sweep, done).', replace: 'work_state(w_mod_sweep, open).' });
  assert.equal(reopened.n('sweeper(K, S, L)'), 0, 'and reopening one changes nothing: its layer is covered by VERDICTS');
  assert.equal(reopened.n('unqueued[audit](K, S, L)'), base.n('unqueued[audit](K, S, L)'));
  console.log('  NO SUBJECT: four sweeps done, sweeper 0 at every layer,'
    + ' so a sweep\'s state is no longer load-bearing');
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

test('MUTANT 8 — THE ONE THAT LIVED, AND IS NOW DEAD AT EVERY LAYER', () => {
  // FOR TWO DAYS THIS MUTANT WAS ALIVE BY CONSTRUCTION and the comment said so:
  // delete a claim, and the layer's sweeping item absorbs the cell, so every
  // lie-detector stays quiet and only a COUNT moves. A bucket buys coverage and
  // spends detection.
  //
  // ALL FOUR SWEEPS CLOSED ON 2026-09-05 and with them the last bucket. A
  // deleted claim now has nowhere to fall: `unqueued[audit]` names the cell, at
  // EVERY layer, which is why the mutation is run once per layer instead of
  // once — one mutant is liveness, a set is coverage, and the set here is the
  // layers.
  //
  // THE ANCHORS ARE DERIVED, NOT WRITTEN, since 2026-09-06 — and that is the
  // real repair. Hard-coded, this list decayed THREE TIMES IN TWO ITERATIONS:
  // each closing item turned its own claim into a claim on a CLOSED cell, where
  // deleting it correctly derives nothing, so the mutant went red for a reason
  // that had nothing to do with the plan being wrong. It failed in the SAFE
  // direction every time and cost a debugging round every time. A mutant
  // anchored to whichever row happened to be open expires when that row closes;
  // one that ASKS THE MODEL for an open claim at each layer cannot.
  const base = world();
  assert.equal(base.n('unqueued[audit](K, S, L)'), 0, 'baseline: every open cell is owned');

  const plan = read('facts/worklist.rofl');
  const LAYERS = ['callgraph', 'dataflow', 'modules', 'controlflow'];
  const planted: [string, string][] = [];
  for (const layer of LAYERS) {
    // an open cell at this layer, and the claim that owns it
    const owned = base.binds(`claim(queued, js, K, S, ${layer}, W)`, 'K', 'S', 'W')
      .filter((row) => {
        const [k, sh] = row.split('/');
        return base.n(`open_cell[audit](${k}, ${sh}, ${layer})`) === 1;
      });
    assert.ok(owned.length > 0, `no open claimed cell at ${layer} to plant against`);
    // find the source line for the first one — the plan is the file, so the
    // mutation is textual, but WHICH line is a question for the model.
    const [k, sh, w] = owned[0].split('/');
    const line = plan.split('\n').find((l) => {
      const t = l.replace(/\s+/g, ' ').trim();
      return t.startsWith('claim(queued, js,') && t.includes(` ${k},`)
        && t.includes(` ${sh},`) && t.includes(` ${layer},`) && t.includes(`${w})`);
    });
    assert.ok(line, `no source line for claim ${k}/${sh}/${layer}/${w}`);
    planted.push([line!, `${k}/${sh}`]);
  }

  for (const [find, expect] of planted) {
    const w = world({ find });
    assert.equal(w.n('unqueued[audit](K, S, L)'), 1, `a lost claim is invisible again: ${find}`);
    assert.deepEqual(w.binds('unqueued[audit](K, S, L)', 'K', 'S'), [expect]);
  }
  console.log(`  KILLED at all four layers: a deleted claim is now a named row, not a count`);
});

test('MUTANT 9 — a dependency the plan does not honour', () => {
  // THE DEFECT THIS RELATION WAS ADDED FOR, planted: `w_cg_call_result` says in
  // its note that it waits on dataflow returns, and for three commits it sat
  // AHEAD of the item it waits on. A note cannot refuse to hand out an item.
  const base = world();
  // THE HEAD MOVED TWICE ON 2026-09-06: `w_cf_abrupt_transfer` then
  // `w_cf_reachability`, both closed, so the next by order is `w_exception_flow`.
  assert.deepEqual(base.binds('next_work[audit](W)', 'W'), ['w_exception_flow']);
  // FIVE dependencies are live now and every one is DELIBERATE. One is the
  // kernel question the owner has said to hold (`w_env_ledger_form` on
  // `w_leak_variable_on_the_right`); the other four are the chain the five new
  // layers made explicit — effects is the JOIN of exceptions, aliasing and the
  // API surface, and the API surface cannot attribute `xs.at` without a type.
  // That the chain is four deep and acyclic is itself the check: it was written
  // as prose in three item comments before it was written as rows.
  // SIX BECAME FIVE on 2026-09-05: `w_join_planner` waited on the negation half
  // of the same defect, and the negation half is done — a planner may now
  // reorder, because the kernel already refuses to judge a negation early.
  assert.equal(base.n('blocked[audit](W)'), 5, 'one held on purpose, four real premises');
  assert.deepEqual(base.binds('blocked[audit](W)', 'W'),
    ['w_effect_layer', 'w_env_api_surface', 'w_env_ledger_form', 'w_exn_propagation',
     'w_type_surface']);

  // ADDING one makes the queue refuse to hand out an item whose premise is not
  // done — which is the whole content of the relation
  // THE PLANTED DEPENDENCY MOVED 2026-09-04: it pointed at `w_controlflow_layer`,
  // which is now DONE, so the dependency was satisfied and blocked nothing. It
  // has to name an item that is still open to plant anything at all.
  // AND IT DECAYED THE SAME WAY AGAIN on 2026-09-06 — it had been re-pointed at
  // `w_cf_abrupt_transfer`, which closed. Twice is a class, and the class is the
  // one this repository already recorded about an ordinal: a mutant anchored to
  // WHICHEVER ITEM HAPPENED TO BE OPEN expires when that item closes, and it
  // expires in the SAFE direction (blocking nothing), so it goes red only
  // because a count is pinned beside it. It is planted on the HEAD now, and on
  // the item the closing work spawned, so the mutation asserts the thing the
  // relation exists for: the head itself is skipped when its premise is open.
  const mut = world({ extra: 'work_needs(w_cf_reachability, w_cf_completion).' });
  assert.equal(mut.n('blocked[audit](W)'), 6, 'the planted one on top of the five real ones');
  // ...and the head becomes the NEXT ITEM BY ORDER, not the premise: the premise
  // is order 40 and the queue does not promote it for being needed. That is the
  // relation doing exactly one thing — skipping — which is what makes it
  // checkable.
  assert.deepEqual(mut.binds('next_work[audit](W)', 'W'), ['w_exception_flow'],
    'and the blocked item is skipped rather than handed out');
  console.log(`  KILLED: blocked ${base.n('blocked[audit](W)')} -> ${mut.n('blocked[audit](W)')}`);
});

test('the layer list is the owner\'s, and a rule says so', () => {
  // DECIDED BY VADIM 2026-09-05. `layer(L)` is one fact and it opens one cell
  // per declared kind — 59 today — so the five candidate layers in the queue
  // would take the matrix from 285 cells to 580 in five lines. The total size
  // of this programme is set by that list and by nothing else.
  //
  // IT IS A ROW RATHER THAN A PROMISE because an unattended loop works this
  // queue, and several of its items would naturally end in a new layer. A
  // comment cannot refuse.
  const base = world();
  assert.equal(base.n('layer_unauthorised[audit](L)'), 0, 'the four standing layers are signed off');
  assert.deepEqual(base.binds('layer_authorised(L)', 'L').sort(),
    ['callgraph', 'controlflow', 'dataflow', 'modules']);

  // planted: the loop declares a layer on its own authority
  const mut = world({ extra: 'layer(taint).' });
  assert.deepEqual(mut.binds('layer_unauthorised[audit](L)', 'L'), ['taint'],
    'and it is NAMED, so the diff says which one');
  console.log(`  KILLED: layer_unauthorised 0 -> 1, and the matrix grew by`
    + ` ${mut.n('cell[audit](A, K, S, L)') - base.n('cell[audit](A, K, S, L)')} cells on one line`);
});

test('MUTANT — a hold on an item nobody declared, and a hold withdrawn', () => {
  // THE HOLD IS A ROW BECAUSE THE ORDINAL STOPPED SAYING IT, and a row can be
  // wrong in two ways that a position cannot: it can name nothing, and it can
  // be missing. Both are planted.
  const ghost = world({ extra: 'held(w_no_such_item, vadim).' });
  assert.deepEqual(ghost.binds('held_unknown[audit](W)', 'W'), ['w_no_such_item']);

  const free = world({ find: 'held(w_leak_variable_on_the_right, vadim).' });
  assert.deepEqual(free.binds('next_work[audit](W)', 'W'), ['w_leak_variable_on_the_right'],
    'withdraw the hold and the queue hands out the kernel question he deferred');
  console.log('  KILLED: held_unknown 0 -> 1; and without the hold the head is'
    + ' w_leak_variable_on_the_right, seven tests red on it');
});

test('MUTANT 10 — a dependency on an item nobody declared, and a cycle', () => {
  const unknown = world({ extra: 'work_needs(w_cg_syntactic_wrappers, w_no_such_item).' });
  assert.equal(unknown.n('needs_unknown[audit](W, O)'), 1);
  const cyc = world({ extra: 'work_needs(w_cf_abrupt_transfer, w_cg_syntactic_wrappers).\nwork_needs(w_cg_syntactic_wrappers, w_cf_abrupt_transfer).' });
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
  // THREE, since 2026-09-05: the call-graph sweep left `template_literal x
  // callgraph` as the one cell nobody owned, and its cause is the same
  // contract — ``o[`k`]()`` is fixed at parse time and its text is not a fact.
  // FOUR since the dataflow sweep: the template literal is blocked at BOTH
  // layers by one contract — its text is `{raw, cooked}` and never a fact.
  assert.deepEqual(w.binds('cell_blocked(K, S, L, C)', 'S', 'C'), [
    'none/scanner_contract',
    'none/scanner_contract',
    's_computed_template_key/scanner_contract',
    's_computed_template_key/scanner_contract',
  ]);
  assert.equal(w.n('open_cell[audit](K, S, L)') - w.n('workable(K, S, L)'), 4,
    'blocked cells are open and not workable');

  // AND THE ITEM THEY BELONG TO IS SKIPPED WITH A REASON, not silently:
  // BOTH member items now, and they are siblings: the two template-key cells
  // are blocked on the same scanner contract, and neither item has anything
  // else left to do.
  // THREE since 2026-09-05: `w_scanner_nested_values` is the item entered FOR
  // the contract, and it owns nothing but a cell that contract blocks — which
  // is the correct state for an item whose whole content is a blocker.
  assert.deepEqual(w.binds('nothing_workable[audit](W)', 'W'),
    ['w_cg_member_family', 'w_cg_optional_member', 'w_scanner_nested_values']);
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
