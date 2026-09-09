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

interface Mut { find?: string; replace?: string; extra?: string; file?: string }

function world(m: Mut = {}) {
  const r = new Rofl();
  const load = (text: string, what: string) => {
    const res = r.load(text);
    assert.equal(res.ok, true, `${what} rejected:\n${res.diagnostics.slice(0, 3).join('\n')}`);
  };
  load(read('boot.rofl'), 'boot.rofl');
  // FACT AND RULE FILES ARE MUTABLE TOO since 2026-09-06: the frame's three
  // answers live in `facts/js-kinds.rofl` and the gap rule in
  // `rules/js-model.rofl`, and a harness that could only mutate the plan
  // reported six anchor errors as six kills.
  const patch = (f: string) => {
    let text = read(f);
    if (m.file === f && m.find !== undefined) {
      assert.ok(text.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
      text = text.replace(m.find, m.replace ?? '');
    }
    return text;
  };
  for (const f of FACTS) load(patch(f), f);
  for (const f of RULES) load(patch(f), f);
  let plan = read('facts/worklist.rofl');
  if (m.find !== undefined && m.file === undefined) {
    assert.ok(plan.includes(m.find), `mutation anchor absent: ${m.find}`);
    plan = plan.replace(m.find, m.replace ?? '');
  }
  if (m.extra) plan += '\n' + m.extra;
  load(plan, 'facts/worklist.rofl');
  r.evaluate(8_000_000);
  // EVERY ASSERTION IN THIS FILE IS `THIS AUDIT IS EMPTY`, and an empty answer
  // used to have two causes with one voice: nothing satisfies the literal, and
  // nothing in this world could ever put a row under that name at that arity.
  // `unpopulatable` (src/api.ts) is the kernel telling them apart, and it found
  // one of these on the day it was added — `stale_reason[audit]` was asserted
  // empty at arity FIVE against a relation defined at four.
  const ask = (q: string) => {
    const res = r.query(q);
    assert.equal(res.unpopulatable, false, `query ${q}: nothing in this world can populate it`);
    return res;
  };
  return {
    n: (q: string) => ask(q).rows.length,
    binds: (q: string, ...vs: string[]) =>
      ask(q).rows.map((row) => vs.map((v) => row.bindings[v]).join('/')).sort(),
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
  'work_needs_cycle[audit](W)',
  'work_stateless[audit](W)',
  'work_bad_state[audit](W, S)',
  'work_sweeps_nolayer[audit](W, L)',
  'needs_unknown[audit](W, O)',
  'needs_cycle[audit](W)',
  'reason_unclassified[audit](R)',
  'blocker_unknown[audit](K, S, L, C)',
  'blocker_stale[audit](K, S, L)',
  // ADDED 2026-09-06 with w_vocabulary_frame. A kind can now be deferred OUT of
  // the frame with an owner, and a deferral is a decision addressed to someone:
  // an owner that is not an item is addressed to nobody, and an owner that has
  // already closed is a decision that outlived its reason.
  'frame_owner_unknown[audit](K, W)',
  'frame_owner_done[audit](K, W)',
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
  // THE SECOND LINE HERE WAS A DECORATION UNTIL 2026-09-07 and had been one
  // since it was written: `stale_reason[audit]` is defined at arity FOUR in
  // rules/js-model.rofl and was asked at FIVE, so it returned no rows because
  // no relation of that shape exists, not because none is stale. It read as a
  // green gate and could not go red. The refined form of the same question is
  // `shaped_because[audit]`, which the block below already asserts row by row;
  // the shaped half of `stale_reason` does not exist, so the honest thing is to
  // stop pretending it is being checked. Found by `unpopulatable` (src/api.ts).


  // WHAT CLOSED THEM: the specifier refinement. The same three statements are
  // still made and each now names the shape it is true of, which is the only
  // difference between an excuse and a frontier.
  // THREE BECAME SIX on 2026-09-05, and the three new rows are the modules
  // sweep's whole finding: `require()` is a module edge the layer cannot see,
  // and the two re-export forms were WAIVED — a verdict class that says the
  // language offers nothing to model — beside a comment calling the work undone.
  // TWO OF THE SEVEN LEFT ON 2026-09-08 (w_mod_beyond_the_import), which is the
  // set shrinking rather than a pin rotting: `export_named_declaration` and
  // `export_all_declaration` are `handled` by `r_reexport_edge` now — a
  // re-export is a `module_site`, and `depends`/`flows`/`evaluates` follow.
  // The DEFAULT form stays, and its reason is measured rather than inherited
  // from its siblings: scanned beside the six re-export forms,
  // `export default function f() {}` emits no `source` child of any kind, so
  // it is not an edge. What is left of that cell is the naming half.
  // AND THE DEFAULT FORM LEFT ON 2026-09-08: the naming half landed, so
  // `export_default_declaration x modules` is answered and no longer shaped by
  // a reason. Four rows where there were five.
  assert.deepEqual(w.binds('shaped_because[audit](A, K, S, modules, R)', 'K', 'S', 'R'), [
    'call_expression/none/not_yet',
    'import_declaration/bare/out_of_scope',
    'import_declaration/subpath/not_yet',
    'import_expression/computed/runtime_dependent',
  ], 'the values are the ones rules/js-modules.rofl already derives, not a second vocabulary');
  // and the refinement did not leak into the layer where a specifier is
  // meaningless — that is what `shape_in` is for
  assert.equal(w.n('cell[audit](A, K, bare, callgraph)'), 0, 'no phantom cell');
  assert.equal(w.n('unearned_axis[audit](A, L)'), 0, 'both layers earn the column');

  // WAS THE WHOLE BAG WRITTEN OUT — ninety-odd ids, one per spawned finding —
  // and it went red every time anybody recorded a finding under any item,
  // which is a fact about the ledger growing and not about the plan. The
  // sentence it was standing in for is in its own comment: `an item that
  // spawns nothing is either trivial or was not looked at`. So the EXCEPTIONS
  // are named and the rest is derived; `spawn_orphan[audit]` in LIES above
  // already checks that every spawned finding exists.
  const items = new Set(w.binds('work(W, N)', 'W'));
  const spawners = new Set(w.binds('work_spawned(W, F)', 'W'));
  assert.deepEqual([...items].filter((i) => !spawners.has(i)).sort(), [
    // TEN JOINED 2026-09-08, all of them entered the same day: the vocabulary
    // took on twenty-three kinds in one edit and each group got an item to own
    // its cells. An item that has spawned nothing on the day it was ENTERED is
    // not one nobody looked at — it is one nobody has STARTED, which this list
    // cannot tell apart and does not pretend to.
    // `w_await_is_a_call_the_oracle_places_elsewhere` LEFT THIS LIST
    // 2026-09-08: it was taken and it spawned a finding of its own — `await`
    // calls `Promise.prototype.then` ZERO times, measured with a monkey-patch
    // and a positive control, because the spec uses an internal operation.
    // `w_cf_completion` LEFT THIS LIST 2026-09-09, the same way the six before
    // it did: it was taken and it spawned two findings, one of them about the
    // instrument rather than the model — the callee-name oracle this layer
    // reads statement order through can only see a `completes_abruptly` row
    // whose successor holds a call, which on this corpus is 27 rows out of 789.
    'w_cg_new_expression', 'w_cg_optional_member',
    'w_cg_syntactic_wrappers',
    // `w_class_expression` and `w_class_fields` LEFT THIS LIST on 2026-09-08,
    // each in its own branch: both were taken and both spawned findings, one of
    // them a KERNEL gap — no string operation BUILDS a string, so a private
    // method resolves and cannot be named.
    'w_df_function_forms',
    'w_df_generator_protocol', 'w_df_sweep', 'w_df_value_core',
    // `w_inert_statements` and `w_labelled_control` LEFT THIS LIST 2026-09-08:
    // both were taken and both spawned, which is the list working — an item
    // entered but not started looks identical to one nobody looked at, and the
    // only thing that tells them apart is a finding.
    'w_env_api_surface', 'w_export_specifier_forms',
    // `w_has_return_is_a_join_over_the_whole_corpus` JOINED 2026-09-09, entered
    // by the item that built the second cost gate. It is on this list for the
    // reason the block above names: entered today, not started — and it is the
    // clearest case yet of the distinction this list cannot draw, because the
    // work it asks for is already MEASURED (a 42.7% reorder with a row-for-row
    // equivalence control in MUTANT B of test/js-layer-cost.test.ts) and simply
    // not applied.
    // `w_has_return_is_a_join_over_the_whole_corpus` LEFT THIS LIST 2026-09-09,
    // the same way the four before it did: it was taken and it spawned a
    // finding — a per-pack cost difference attributes by FILE and not by
    // purpose, which is what let the repair hide next door.
    // `w_class_expression` and `w_meta_property` LEFT THIS LIST 2026-09-08 for
    // the same reason the two before them did: both were taken and both
    // spawned. `w_meta_property` is still OPEN and still on this side of the
    // ledger's other lists — spawning is what says an item was looked at, not
    // what says it is finished.
    // ...and `w_mod_beyond_the_import` LEFT IT 2026-09-08 the same way: two of
    // its five cells were taken and it spawned three, one of which is a
    // question about a NEIGHBOUR'S landed cell — `export_binding` reports a
    // re-export's `local` as a name in the re-exporting module, which the
    // dataflow layer already guards against and this one does not.
    // `w_open_cell_should_be_an_identity` LEFT THIS LIST 2026-09-09, the same
    // way the three before it did: it was taken and it spawned a finding —
    // `f_an_instruments_world_is_part_of_its_claim`, whose third instance was
    // the two shape mutants that were green because `shapeWorld` does not load
    // the packs their own message talks about.
    'w_mod_sweep', 'w_plugin_gated_kinds',
    // `w_update_and_literals` LEFT THIS LIST 2026-09-08, the same way the two
    // before it did: it was taken and it spawned two findings, one of them in
    // the SCANNER (a bigint matched none of the four branches) and one in a
    // neighbour's already-ticked cell (a for-update was never a guard arm).
    // ...and `w_scope_shadowing` LEFT IT 2026-09-09 the same way, with four:
    // where nearest-wins stops (`binds_name` has no row for a function
    // declaration, a class, a catch parameter or an import), a scope kind no
    // declarator in this corpus reaches, and the dead zone turning out to be a
    // region plus one line rather than flow sensitivity — and a fourth that is
    // not about scope at all: mutant 9 in test/js-callgraph.test.ts lost its
    // row-level oracle to a budget for the second time, and a budget kill
    // decays into a green gate that says nothing.
  ], 'an item that spawns nothing is either trivial or was not looked at');
  assert.deepEqual([...spawners].filter((sp) => !items.has(sp)), [],
    'and nothing spawns a finding without being an item — the other direction');
  // `w_cg_member_family` is the shape the bag was kept for: FOUR findings, one
  // it was created for and three the catch-all split found. Kept as a spot
  // check, because a per-item count is stable where the whole bag was not.
  assert.equal(w.n('work_spawned(w_cg_member_family, F)'), 4);
});

test('the queue covers the model: every open cell owned by name, none swept', () => {
  const w = world();
  // 83 -> 48 when the last bucket closed. Every open cell in the model now has
  // an item that owns it BY NAME: `sweeper` is empty at all four layers, which
  // is the first time since the plan was seeded that no cell is absorbed.
  // 48 -> 46: the receiver split closed `class_declaration x dataflow`, and
  // `super x dataflow` turned out to need no rule at all — a site was all it
  // was missing.
  // 34 -> 33, and the one cell is the milestone: `member_expression x
  // controlflow` was the LAST open cell at that layer. Four layers declared,
  // one of them now completely answered.
  // 38 -> 34 the same day again: w_exception_flow closed four — call_expression
  // and super at controlflow, throw_statement and catch_clause at dataflow.
  // Three items closed in one session and the open set fell by ten.
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
  // 33 -> 32 on 2026-09-07: `this_expression x callgraph` closed, the last cell
  // w_scope_binding owned, and `false_done[audit]` is what said the item was not
  // finished while it stood open.
  // 32 -> 31 on 2026-09-07: `assignment_expression x callgraph`, closed by
  // `r_member_write` — a member written is a member read.
  // 31 -> 25 on 2026-09-07: the module boundary answered three import/export
  // kinds at BOTH layers — the first item in this loop to close six at once.
  // 25 -> 19 the same day: the second module-boundary pass took three more
  // forms at both layers, each for one line of fixture.
  // 19 -> 17 on 2026-09-07: `export *` at both layers, the LAST of the seven
  // import/export forms, and the one that needed two fixture files rather than
  // a line — a module reachable only through the re-export, and a name that
  // collides with the importing file's own.
  // 17 -> 15 on 2026-09-07: the tagged template at both layers — a call the
  // grammar gives no call site, answered as a TRANSFER SITE, with the value
  // half coming free through `resolves`.
  // 15 -> 14 on 2026-09-07: the FOR-OF at callgraph, and only there — the value
  // half of a for-of was never open, because what a loop evaluates to is not a
  // question the dataflow layer asks. The tagged template closed two cells and
  // this closed one, which is what a form with no value has.
  //
  // THIS NUMBER STAYS A NUMBER. It moves when the model answers something, not
  // when a fixture grows, so re-stating it on purpose is the ritual doing its
  // job rather than transcription.
  // 14 -> 10 on 2026-09-08: the SCANNER'S CONTRACT moved, and it moved four
  // cells at once — `template_literal` at callgraph and at dataflow, and
  // `s_computed_template_key` on both member kinds. All four had been blocked
  // for three sessions behind a sentence that was true and unmeasured: the
  // scalars-only contract excluded exactly ONE property in the whole language.
  // The biggest single fall this number has had, and none of it was a rule.
  // 102 -> 70 on 2026-09-08, THIRTY-TWO CELLS IN ONE AFTERNOON, closed by three
  // branches running at the same time: the destructuring family, the two export
  // specifier forms, and labelled plus inert statements.
  //
  // THIS NUMBER IS THE LAST PIN IN THIS FILE THAT IS STILL A NUMBER, and it is
  // one on purpose: it is the only assertion here whose SUBJECT is the size of
  // the open set. Everything around it — the owners, the layers, the sweeper —
  // is named, so a wrong number cannot hide behind them. It is also the pin the
  // parallel experiment moved from three branches at once, which is recorded
  // under `w_open_cell_should_be_an_identity`.
  // 70 -> 71 on 2026-09-08 with the decorator work, and the direction is
  // honest: two cells CLOSED (`decorator` at the call graph and at control
  // flow) and `class_accessor_property` entered the vocabulary with four cells
  // of its own, two of them open. A number that only ever falls is a number
  // measuring effort rather than the model.
  // 71 -> 36 ON ONE AFTERNOON, closed by four branches that could not see each
  // other: ES2022 class syntax (20 cells), the two export forms, the update and
  // literal forms, class expressions, meta properties and decorators.
  // 36 -> 32 on 2026-09-08 with w_env_api_surface: four cells left the queue by
  // becoming IRREDUCIBLE rather than by being answered — the call transfers into
  // a library method with no node in this program, and `open_cell` requires
  // `our_unknown`. They left because nobody can do more, not because nobody looked.
  // 32 -> 15 ON ONE AFTERNOON, from four branches and the library surface:
  // directives (12 cells), the re-export edge, the decorator replacement, the
  // two class-accessor value cells, and four that left by becoming irreducible.
  // 15 -> 6 on 2026-09-08, and this pin STOPS BEING A NUMBER here, which is
  // what `w_open_cell_should_be_an_identity` was entered to ask for. The reason
  // it can stop now is not that six is small: it is that the six no longer
  // form a backlog. Every one of them is a cell whose work is known and whose
  // DECISION is the owner's — `with_statement` at all four layers waits on
  // what `with` does to name resolution, `require` has no site in this tree,
  // and the subpath specifier needs a third host loan. A count could not say
  // that; the rows can, and a seventh row appearing is now a red test with a
  // name in it rather than an off-by-one.
  assert.deepEqual(w.binds('open_cell[audit](K, S, L)', 'K', 'S', 'L'), [
    'call_expression/none/modules',
    'import_declaration/subpath/modules',
    'with_statement/none/callgraph',
    'with_statement/none/controlflow',
    'with_statement/none/dataflow',
    'with_statement/none/modules',
  ], 'the queue is the model\'s open set, and all six of it are the owner\'s to decide');
  assert.equal(w.n('sweeper(K, S, L)'), 0, 'no bucket anywhere');
  // 14 before the environment layer, 19 after it, 20 once `super()` turned up a
  // kernel defect of its own. Every one of the six was entered because the work
  // found it, not because it was foreseen. 27 -> 32 on 2026-09-05: the five
  // layers the sweep did not reach, entered as ITEMS and not as `layer(L)` —
  // five layers would have opened 320 cells and answered the question each item
  // exists to ask.
  // 49 -> 50 on 2026-09-07: w_computed_key_names, entered by the work that
  // wrote `key_name` — a computed key that is a bare identifier is named by the
  // variable's spelling, and the guard that forbids it covers only the other
  // shape of computed key. Found by asking where the guard cannot look, and
  // left open because the corpus contains no site for it.
  // 50 -> 51 on 2026-09-07: w_cf_suspension, entered and closed in one sitting
  // and never on the queue — the cell read `waived`, so no audit had anything
  // to say about it until the waiver's reason was measured.
  // 51, unchanged: no item was entered, and three were marked DONE —
  // w_scanner_nested_values with its cells, and w_cg_member_family and
  // w_cg_optional_member, whose last claims went with them.
  // 61 -> 62 on 2026-09-08: ONE item entered where three closed, and it is
  // `w_destructuring_hides_a_call` — a cell REOPENED rather than a new frontier.
  // `ignored(js, object_pattern, controlflow, a_no_control_transfer)` was
  // measured false the day after it was written: `const {taken} = withGetter`
  // runs the getter, so a destructuring pattern hides a call the way an
  // accessor does, and `accessor_read` is structurally unable to see it because
  // none of these nodes is a `member_expression`.
  // ...AND 62 -> 63 the same day: `w_open_cell_should_be_an_identity`, entered
  // because the open-cell assertion above is the last pin in this file that is
  // a number, and three parallel branches moved it at once.
  // 63 -> 64: `w_decorator_replaces_its_target`, for the half of a decorator
  // that is a VALUE question — the call is modelled, the replacement is not.
  // 64 -> 65: `w_await_is_a_call_the_oracle_places_elsewhere`, which exists
  // because two branches re-pointed one cell at owners that were both wrong —
  // the second at an item a parallel branch had just closed, which
  // `false_done[audit]` reported within one run.
  // 65 -> 66 on 2026-09-09: `w_has_return_is_a_join_over_the_whole_corpus`,
  // entered by the new per-layer cost gate ON ITS FIRST RUN. `has_return` is
  // 94 per cent of the control-flow layer's read path, and leading with the
  // return statement instead of the function takes the layer down 92.8 per
  // cent and the whole world down 42.7, with firings, facts and ten named
  // relations identical row for row. The item exists because the repair is a
  // rule change and the gate that found it is a measurement.
  assert.equal(w.n('work(W, Note)'), 66);

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
  // 18 -> 17 on 2026-09-07: `this_expression`, closed by `r_this_host`.
  // 17 -> 16 on 2026-09-07: `assignment_expression`, closed by `r_member_write`.
  // 10 -> 9 on 2026-09-07: `export_all_declaration`, closed by `r_reexported_name`.
  // 9 -> 8 the same day: `tagged_template_expression`, closed by `r_tag_call`.
  // And CLAIMED falls with it, 19 -> 18: the claim was retired rather than left
  // beside an open item, because `queue_stale[audit]` calls that a lie.
  // 8 -> 7 and claimed 18 -> 17 on 2026-09-07: `for_of_statement`, closed by
  // `r_iterator_protocol`, with its claim retired in the same edit for the
  // reason the tagged template's was.
  // 7 -> 4 and claimed 17 -> 14 on 2026-09-08: the template key on both member
  // kinds and `template_literal` itself, closed by a scanner contract that grew
  // one property, with no rule at the call graph at all.
  // 4 -> 18 open and 14 -> 33 claimed on 2026-09-08, and the direction is the
  // point: this layer got BIGGER because three parallel branches declared work
  // rather than because anything regressed. Every one of the fourteen new open
  // cells carries an owner, which is what the zero on the right says.
  // claimed 33 -> 34: `decorator` closed here and `class_accessor_property`
  // arrived with a claim, so the open figure holds still while both moved.
  // AND ALL FOUR LAYERS FELL TOGETHER ON 2026-09-08, from four branches that
  // could not see one another: callgraph 18 -> 11, dataflow 16 -> 7, modules
  // 19 -> 10, controlflow 18 -> 8. The claimed figures barely move, which is
  // the tell that these are cells being ANSWERED rather than re-owned.
  // 11 -> 7 open and 32 -> 28 claimed on 2026-09-08: the four cells
  // w_env_api_surface closed are all at this layer, and their claims went with
  // them because a claim on an irreducible cell is what `queue_stale` calls a lie.
  // ALL FOUR LAYERS AGAIN, 2026-09-08: callgraph 7 -> 3, dataflow 7 -> 2,
  // modules 10 -> 5, controlflow 8 -> 5.
  // ALL FOUR AGAIN, 2026-09-08 evening: callgraph 3 -> 1, dataflow 2 -> 1,
  // modules 5 -> 3, controlflow 5 -> 1. The open column is now SIX rows in
  // total and every one of them is named in `open_cell` above — four
  // `with_statement` cells, `require`, and the subpath specifier. The claimed
  // column falls with it wherever a claim went out with the cell it named.
  assert.deepEqual(per('callgraph'), [1, 25, 0]);
  // THE DATAFLOW SWEEP, 2026-09-05: 12 cells out of the bucket and ZERO new
  // items — one already modelled and never recorded, two closed with a reason,
  // nine onto items the two earlier sweeps had already made. Three of four
  // layers now have no bucket at all.
  // 4 -> 3 on 2026-09-07, the same kind at the value layer: a re-exported name
  // is a name that denotes another module's function.
  // 3 -> 2, and claimed 10 -> 9: the tagged template's value half, which needed
  // no rule at all — `may_be_node` already carries a call's value through
  // `resolves`, so the cell closed when the call-graph arm landed.
  // 2 -> 1 and claimed 9 -> 8: the value half of the same move — a template
  // with no interpolation evaluates to its cooked text.
  // 24 -> 15 open and 31 -> 27 claimed on 2026-09-08: the destructuring family
  // took nine of these, with four claims retired beside them because a claim
  // left standing on a closed cell is what `queue_stale[audit]` calls a lie.
  // 15 -> 16 open: `class_accessor_property`'s value cell, owned by
  // `w_decorator_replaces_its_target` along with the decorator's own.
  assert.deepEqual(per('dataflow'), [1, 24, 0]);
  // THE MODULES SWEEP, 2026-09-05: 39 cells down to 4, all four owned. Two of
  // them came from OUTSIDE the bucket — a waiver whose own comment described
  // undone work, which is open work counted as settled.
  // 28 -> 19 open and 28 -> 24 claimed on 2026-09-08, and the modules layer is
  // where the parallel work paid most: the two export specifier forms answered
  // eight cells, and the destructuring family answered the rest by measurement
  // rather than by definition — a pattern DIRECTLY under an export declaration
  // moves no row of this layer, which is a verdict that had to be exercised.
  assert.deepEqual(per('modules'), [3, 19, 0]);
  // THE FOURTH LAYER, SWEPT. Thirty-seven cells became fifty-two when the
  // control constructs were declared, and the sweep closed forty of them with a
  // reason. The twelve that are left are all claimed BY NAME and none is swept:
  // a sweep that finds twelve cells worth an item is not a bucket.
  // 12 -> 8 on 2026-09-06: the four abrupt kinds are modelled, and their claims
  // stay on the DONE item so `false_done[audit]` keeps guarding that they really
  // did close — claimed stays at 12 while open drops to 8.
  // 8 -> 3 on 2026-09-06: `r_reachability` answered all five function forms.
  // Three cells left at the layer that was swept two days ago.
  // 3 -> 1 -> ZERO on 2026-09-06: a call is an exit, then a read that runs a
  // getter. THE FIRST LAYER OF THE FOUR TO BE COMPLETELY ANSWERED — every kind
  // in the vocabulary has a verdict at controlflow and none of them is open.
  // 23 -> 18 open and 35 -> 32 claimed on 2026-09-08. `labeled_statement` and
  // the two inert statement forms closed twelve of the cells this layer took on
  // when the vocabulary became the language, and four `with_statement` cells
  // stayed OPEN AND UNBLOCKED — the work is a one-word scanner change and what
  // it waits on is a decision about name resolution, not a blocker.
  assert.deepEqual(per('controlflow'), [1, 30, 0]);

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
  // THREE BECAME SEVEN on 2026-09-08 with w_env_api_surface: two literal kinds
  // and two member shapes whose callee is a library method with no node in this
  // program, each named and dated by `lib_call[code]` before the reason moved.
  assert.deepEqual(w.binds('irreducible_unknown[audit](A, K, S, L)', 'K', 'S', 'L'), [
    'big_int_literal/none/callgraph',
    'import_expression/computed/modules',
    'import_expression/none/callgraph',
    'import_expression/none/dataflow',
    'member_expression/s_member_on_literal/callgraph',
    // FOUR MORE ON 2026-09-08 with the meta properties, and all four are
    // irreducible for the same reason the literals are: the receiver is
    // provided by the HOST. `import.meta` and `new.target` have no node in
    // this program, so a call through either has no source target and no
    // value to flow.
    'member_expression/s_member_on_meta/callgraph',
    'member_expression/s_member_on_template/callgraph',
    'meta_property/import_meta/dataflow',
    'meta_property/new_target/callgraph',
    'meta_property/new_target/dataflow',
    'reg_exp_literal/none/callgraph',
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
  // THE OWNER IS DERIVED. It named `w_cg_member_family` until 2026-09-08, when
  // that item's last cell closed and it was marked done — and `queue_stale`
  // exempts a done item by design, so the second assertion below went quietly
  // to zero. The mutant is about a claim naming a kind nobody declares; whose
  // claim it is has never been the subject.
  const someOpen = world().binds('work_state(W, open)', 'W')[0];
  assert.ok(someOpen, 'positive control: some item is open');
  const w = world({ extra: `claim(queued, js, no_such_kind, none, callgraph, ${someOpen}).` });
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
  // THE ANCHOR IS DERIVED, 2026-09-08, and the reason is that it decayed. It
  // named `w_cg_member_family`, whose last open cell was the template key —
  // and when the scanner's contract moved, that cell closed, the item was
  // marked done for real, and the mutant went quietly dead: planting `done` on
  // an item with no open cells produces no row at all. Six anchors in this
  // repository have now been re-aimed after naming something somebody retired
  // (w_mutant_anchor_decay), so this one asks the base world which item is
  // still open AND still owns an open cell, and plants `done` on that.
  const base = world();
  const owner = base.binds('claim(queued, js, K, S, L, W)', 'K', 'S', 'L', 'W')
    .map((row) => { const [k, sh, l, wi] = row.split('/'); return { k, sh, l, wi }; })
    .find((c) => base.n(`open_cell[audit](${c.k}, ${c.sh}, ${c.l})`) === 1
               && base.n(`work_state(${c.wi}, open)`) === 1);
  assert.ok(owner, 'positive control: some open item still owns an open cell');
  const w = world({ find: `work_state(${owner!.wi}, open).`,
                    replace: `work_state(${owner!.wi}, done).` });
  assert.ok(w.n('false_done[audit](W, K, S, L)') >= 1,
    `one row per cell ${owner!.wi} did not close`);
  assert.equal(base.n('false_done[audit](W, K, S, L)'), 0, 'and none on the honest tree');
});

test('MUTANT 5 — two items owning one cell', () => {
  const w = world({ extra: 'claim(queued, js, tsas_expression, s_ts_as, callgraph, w_cg_member_family).' });
  assert.equal(w.n('double_owned[audit](K, S, L, A, B)'), 2, 'both orderings of the pair');
});

test('MUTANT 6 — a spawned finding that is not in the ledger', () => {
  const w = world({ extra: 'work_spawned(w_cg_sweep, f_no_such_finding).' });
  assert.equal(w.n('spawn_orphan[audit](W, F)'), 1);
});

test('MUTANT 7 — an item with no state, and a plan that waits on itself', () => {
  // `work_unordered[audit]` WENT WITH THE NUMBER on 2026-09-08, when the order
  // became a derivation over `work_needs` instead of a hand-written integer.
  const w = world({ extra: 'work(w_ghost, "stateless").' });
  assert.equal(w.n('work_stateless[audit](W)'), 1);
  const honest = world();

  // ...AND ITS REPLACEMENT, which the change made necessary rather than
  // optional. A hand number cannot be less than itself, so acyclicity came free
  // and nobody had to state it; a derived order makes a cycle possible AND
  // SILENT, because every item in one is blocked by another in it, none is
  // takeable, and the queue simply goes quiet.
  assert.equal(honest.n('work_needs_cycle[audit](W)'), 0, 'and none on the honest tree');
  const loop = world({ extra: 'work_needs(w_join_planner, w_effect_layer).\n'
                            + 'work_needs(w_effect_layer, w_join_planner).' });
  assert.deepEqual(loop.binds('work_needs_cycle[audit](W)', 'W'),
    ['w_effect_layer', 'w_join_planner']);
  // AND THE SILENCE IS THE POINT: both are takeable on the honest tree and
  // neither is in the cycle world's queue, with no other row saying why.
  for (const wi of ['w_join_planner', 'w_effect_layer']) {
    assert.ok(honest.binds('takeable(W)', 'W').includes(wi), `positive control: ${wi} is takeable`);
    assert.ok(!loop.binds('takeable(W)', 'W').includes(wi), `${wi} vanishes from the queue`);
  }
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
  const complete: string[] = [];
  for (const layer of LAYERS) {
    // an open cell at this layer, and the claim that owns it
    const owned = base.binds(`claim(queued, js, K, S, ${layer}, W)`, 'K', 'S', 'W')
      .filter((row) => {
        const [k, sh] = row.split('/');
        return base.n(`open_cell[audit](${k}, ${sh}, ${layer})`) === 1;
      });
    // A LAYER CAN RUN OUT, and on 2026-09-06 `controlflow` did — every cell at
    // it is answered. That is the milestone this whole plan exists to reach, so
    // it is asserted as one rather than swallowed: the layer is named complete
    // and the mutant simply has nowhere to plant.
    if (owned.length === 0) { complete.push(layer); continue; }
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

  // EMPTY SINCE 2026-09-08, and this is the sharpest thing the vocabulary edit
  // did. `controlflow` was the ONE layer with no open cell — the plan's own
  // finish line, reached on 2026-09-06 — and declaring twenty-three kinds
  // re-opened it, because every one of them has a control-flow question nobody
  // has answered. The list going back to empty is not a regression: the layer
  // was finished over a vocabulary that was not the language, and it says so.
  assert.deepEqual(complete, [],
    'the layers with no open cell left — the plan\'s own finish line, named');
  assert.equal(planted.length, LAYERS.length - complete.length,
    'every layer that still has work got a mutant');

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
  // THE HEAD MOVED THREE TIMES ON 2026-09-06: w_cf_abrupt_transfer,
  // w_cf_reachability and w_exception_flow, all closed, so the next by order is
  // `w_cf_accessor`.
  // THE HEAD MOVED AGAIN 2026-09-06: the frame is decided, so the next by order
  // is the transitive half of the exception path — unblocked when its premise,
  // w_exception_flow, closed earlier the same day.
  // ...and again: the transitive half closed the same day its premise did, so
  // the head is the SCOPE question — `binder[flow]` is file-scoped by
  // construction, which has cost this loop five fixture renames.
  // THE HEAD IS EVERY TAKEABLE ITEM SINCE 2026-09-08, and that is this plan
  // rather than the rule: the order is derived from `work_needs` now, and the
  // eleven items anything waits on are all done, so nothing left has leverage.
  // A flat queue is what a finished dependency chain looks like from here.
  assert.deepEqual(base.binds('next_work[audit](W)', 'W').sort(),
                   base.binds('takeable(W)', 'W').sort());
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
  // FIVE BECAME FOUR on 2026-09-06: `w_exn_propagation` waited on
  // `w_exception_flow` — the local edge before the transitive closure — and the
  // local edge is done. The premise it waited on is the one that also took back
  // its witness: `useTry -> after` had been attributed to the transitive item
  // and belongs to the local one.
  // ...AND FOUR BECAME THREE the same day: `w_env_api_surface` waited on the
  // frame, and the frame is decided. Two of the three that remain are the type
  // chain and one is the kernel question the owner is holding.
  // THREE BECAME FOUR on 2026-09-08: `w_destructuring_hides_a_call` waits on
  // `w_env_api_surface` for the same reason `w_effect_layer` does — a getter
  // run by a destructuring pattern is a call into the standard library and the
  // model cannot attribute it without an API surface.
  //
  // NAMED RATHER THAN COUNTED, and the change is why: three parallel branches
  // landed in one afternoon and a count would have said only that the number
  // moved. `blocked` is a claim about WHICH items are held, and holding the
  // wrong one is the failure this test exists to catch.
  // FOUR BECAME FIVE on 2026-09-08: `w_meta_property` waits on
  // `w_env_api_surface` for HALF OF ONE CELL — `import.meta.resolve("./x")` is a
  // call edge into the host, and the other half of the same cell,
  // `new new.target()`, waits on nothing but a notion of call MODE this model
  // does not have. A dependency that covers part of an item is still a
  // dependency the plan must honour.
  // FIVE BECAME ONE on 2026-09-08, and the one left is the kernel question the
  // owner is holding. `w_env_api_surface` closed — the library surface generated
  // from TypeScript's lib.es*.d.ts — and with it went every item that waited on
  // it: the effect layer, `w_meta_property` and `w_destructuring_hides_a_call`.
  // A chain four deep, and its root was never blocked at all: `w_prototype_of_a_value`
  // was open the whole time and its note said so.
  assert.deepEqual(base.binds('blocked[audit](W)', 'W'),
    ['w_env_ledger_form'],
    'the one dependency held on purpose by the owner');

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
  // ...and re-aimed again for the same reason: the head moved on. It is planted
  // on the CURRENT head and on the item the closing work spawned, which is the
  // only pair that keeps saying what the relation exists to say.
  // ...and re-aimed a THIRD time on 2026-09-07, for the third time for the same
  // reason. The decay is now measured rather than described: this mutant has
  // expired every time the head closed, FIVE heads running, always in the safe
  // direction.
  //
  // SO IT IS NOT AN ITEM NAME ANY MORE (w_mutant_anchor_decay, closed
  // 2026-09-07). The anchor was authored TEXT and the thing it wanted to name
  // is a DERIVED ROW, which is the whole content of the decay: `next_work` is a
  // query, `takeable` is a query, and both were sitting one line above the
  // hand-written constant that kept expiring. The plant is now computed from
  // the queue itself — a dependency from the CURRENT head onto the LAST
  // takeable item, which is open and unblocked by construction and can never be
  // the head — so the mutation says what the relation exists to say in any
  // future tree, and the assertion reads the SECOND takeable rather than a name
  // somebody has to remember to change.
  //
  // SAME MOVE AS THE FILE LIST IN test/query-unpopulatable.test.ts and as range
  // restriction leaving the host for the rules: derive the check instead of
  // copying it. Two anchors in this repository have now been retired this way
  // and both had decayed exactly as often as the thing they named changed.
  // RE-AIMED 2026-09-08, and the mutation is SHARPER under a derived order than
  // it was under the number. The plant is one `work_needs` row between two
  // takeable items, and it now does TWO things at once: the dependent becomes
  // blocked and therefore leaves the queue, and the premise becomes an
  // UNBLOCKER and therefore becomes the whole of it. One row, both arms of
  // `next_work`, and the oracle is a set rather than a position.
  const takeable = base.binds('takeable(W)', 'W');
  assert.ok(takeable.length >= 3, `only ${takeable.length} takeable items to plant between`);
  // ON THE HONEST TREE EVERY TAKEABLE ITEM IS NEXT, and that is a fact about
  // this plan rather than about the rule: the eleven items anything waits on
  // are all done, so nothing left has leverage over anything and the fallback
  // arm hands out the lot. A flat plan is what a finished dependency chain
  // looks like from the queue's side.
  assert.deepEqual(base.binds('next_work[audit](W)', 'W').sort(), takeable.slice().sort(),
    'with no leverage anywhere, next is everything takeable');
  const [head, , premise] = takeable;
  const mut = world({ extra: `work_needs(${head}, ${premise}).` });
  assert.equal(mut.n('blocked[audit](W)'), base.n('blocked[audit](W)') + 1,
    'the planted one on top of the real ones');
  assert.deepEqual(mut.binds('next_work[audit](W)', 'W'), [premise],
    'the premise is the only thing with leverage, so it is the whole queue');
  assert.ok(!mut.binds('takeable(W)', 'W').includes(head), 'and the dependent is gone from it');
  console.log(`  KILLED: ${head} blocked on ${premise}; next ${takeable.length} -> 1`);
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
  // THE HONEST TREE HAS NO BLOCKED CELL SINCE 2026-09-08, and that is why this
  // test now PLANTS one. It used to assert the four template-key rows, blocked
  // on the scanner's contract because a template literal's text lived in
  // `TemplateElement.value`, a nested object the scalars-only contract dropped.
  // The contract was measured — one property in the whole language — and moved,
  // all four cells closed, and the three items that owned nothing else were
  // marked done.
  //
  // A CHECK WHOSE SUBJECT HAS GONE IS A GREEN LINE THAT CANNOT GO RED, which
  // this repository has paid for once already (`stale_reason[audit]` asked at
  // the wrong arity read as a passing gate for weeks). So the state is asserted
  // as a STATE — nothing is blocked, nothing is unworkable — and the machinery
  // is exercised on a planted row instead of on the corpus's accidents.
  assert.deepEqual(w.binds('cell_blocked(K, S, L, C)', 'S', 'C'), [],
    'no cell is blocked on the honest tree');
  assert.deepEqual(w.binds('nothing_workable[audit](W)', 'W'), [],
    'and no item is skipped for having nothing to do');
  assert.equal(w.n('open_cell[audit](K, S, L)') - w.n('workable(K, S, L)'), 0,
    'every open cell is workable');

  // THE PLANT, derived rather than named: take an open cell that some open item
  // claims, declare it blocked by a cause that is not a work item, and the
  // queue must (1) stop counting it workable and (2) name its owner as skipped
  // WITH A REASON rather than passing over it in silence.
  // EVERY open cell the chosen item owns is blocked, not just one: an item is
  // skipped only when NOTHING about it is workable, so blocking one cell of two
  // would prove the opposite of what this test claims. The first draft asked
  // for an item owning exactly one open cell and there is none — the plant has
  // to be shaped by what the plan actually holds.
  const cells = w.binds('claim(queued, js, K, S, L, W)', 'W', 'K', 'S', 'L')
    .map((row) => { const [wi, k, sh, l] = row.split('/'); return { wi, k, sh, l }; })
    .filter((c) => w.n(`open_cell[audit](${c.k}, ${c.sh}, ${c.l})`) === 1
                && w.n(`work_state(${c.wi}, open)`) === 1);
  assert.ok(cells.length > 0, 'positive control: some open item owns an open cell');
  const wi = cells[0].wi;
  const mine = cells.filter((c) => c.wi === wi);
  const b = world({ extra: mine
    .map((c) => `cell_blocked(${c.k}, ${c.sh}, ${c.l}, scanner_contract).`).join('\n') });
  assert.equal(b.n('cell_blocked(K, S, L, C)'), mine.length);
  assert.equal(b.n('open_cell[audit](K, S, L)') - b.n('workable(K, S, L)'), mine.length,
    'a blocked cell is open and not workable');
  assert.deepEqual(b.binds('nothing_workable[audit](W)', 'W'), [wi],
    'and the item it belongs to is skipped WITH A REASON, not silently');
  assert.ok(!b.binds('next_work[audit](W)', 'W').includes(wi),
    'so the queue does not hand out work nobody can start');
  // ...AND THE CAUSE MUST BE DECLARED. A blocker naming an unknown cause is a
  // blocker addressed to nobody, which is the same defect `held_unknown` and
  // `frame_owner_unknown` catch one relation over.
  const bad = world({ extra: `cell_blocked(${mine[0].k}, ${mine[0].sh}, ${mine[0].l}, no_such_cause).` });
  assert.equal(bad.n('blocker_unknown[audit](K, S, L, C)'), 1,
    'an undeclared cause is named rather than believed');
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
