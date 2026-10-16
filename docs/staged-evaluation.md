# Staged evaluation: the plan for 1.2

Set 2026-10-09 by the owner in conversation; the decision is
`f_the_owner_sets_staged_evaluation_as_the_engine_of_1_2`. The target is a working repository of about 15 000
files checked against a few hundred invariants on an ordinary machine: memory bounded by a stated limit, the first
run in minutes, an edit of one file in seconds. Every number here that is not cited is an estimate, and each
hypothesis below names the measurement that can refute it.

## What is set aside

The `[surface]` driver (`docs/surface-split.md` §7) stays in the tree and is not the road: at 500 files it took 140
times the whole world, because the values every escaping node holds were published across files and each file was
evaluated again on every growth (7.6 evaluations a file). Volumes, books, `cool`/`reheat` and `fork` are kept as
the working tools.

## The decisions

1. **A derived fact may be kept.** `cool` writes base facts only (session.rs, "a derived fact is not a possession").
   A derived fact is valid while the program and the inputs it rests on are unchanged, so kept under the key
   (program hash, hashes of its inputs) it is correct by construction. For a fact resting on one file the key is
   (program, that file).
2. **Kept facts are mapped, not parsed.** Reading a fact back from ROFL text costs about a third of deriving it
   (28 MB/s parse, ~200 B a fact, against ~20 µs to derive); a mapped columnar file costs a probe
   (`rust/storebench/src/colfile.rs`: 0.165 µs mapped against 0.180 µs in heap,
   `f_columnar_is_the_answer_and_the_measurement_that_says_so_is_density_not_speed`).
3. **The evaluation is a plan of stages that each fit.** A stage is a range of strata over a group of volumes: it
   reads the finished relations of the stages below (mapped), runs its own rules only, writes its result to its own
   mapped file and frees its memory. The plan is facts (`stage`, `stage_reads`, `stage_writes`, `stage_mem`) and
   rules over them check it: every read is of a finished stage, every stage is under the limit. A stage's output
   kept under its key is decision 1's cache.
4. **A stop by budget is a continuation.** The cut state is already a sound subset of the whole
   (`f_a_budget_cut_seals_no_partial_group`); what is lost today is the pending delta (`run_pass` begins with
   `clear_derived`). Kept, with the stratum position, the evaluation resumes and reaches the same fixpoint. A
   negation or aggregate over a relation with pending delta does not run.
5. **Cross-file links are made once.** As Grafema did: a per-file pass derives everything local and leaves dangling
   ends (an import that leaves the file, a call to another file's function) and exports; a link pass over those
   alone makes the edges; a question follows the edges on demand and lifts only the volumes on its path.
6. **A recursion that crosses a large import cycle is refused.** Statically, a recursive component of the rule
   graph through a foreign-capable column (`examples/surface/surface.rofl`) is a recursion that can cross files;
   in the data, its cost is the largest strongly connected component of the import graph. Over the limit the world
   is refused, naming the rule and the files, with the reformulations: a per-function summary, a bounded depth, or
   the cycle broken in the code.
7. **The round is the unit of parallel and distributed work.** The pending delta split by join key goes to
   workers; a stratum boundary is a barrier
   (`f_the_remotable_boundary_is_the_round_and_it_is_fourteen_kilobytes_wide`: 14 KB a round, 1 400 times fewer
   round trips than a call).

## Hypotheses, each with the measurement that decides it

| | hypothesis | refuted if | measured on |
|---|---|---|---|
| H1 | import cycles are small: the largest SCC of the import graph is a few dozen files | it holds hundreds | vscode subset S, `module_target` |
| H2 | what crosses files is rare: under 2 % of derived facts rest on two files | above 5 % | vscode S at 500, the census of `docs/surface-split.md` §1 again on the current model |
| H3 | the largest recursive data-flow component fits a stage | its facts exceed a stage's limit | vscode S, the file graph of cross-file `resolves`/`may_be_node` |
| H4 | a mapped kept fact is at least 50 times cheaper than deriving it | under 10 times | one volume, storebench's colfile against `evaluate` |
| H5 | a resumed evaluation equals a whole one, byte for byte | any difference | the differential of `rust/rofl/tests/incremental.rs`, cut at every budget |

## Measured, 2026-10-09

`f_the_staged_hypotheses_hold_but_the_files_form_one_cycle_that_only_a_thin_delta_crosses`, vscode:

- **H1 holds.** The largest import cycle is 92 of 4 303 files (subset S) and 228 of 9 759 (all of vscode's src/vs and
  extensions). But a file's transitive dependents reach 2 728 and 7 135, so the cost of an edit is decided by
  whether its kept facts change, not by the import graph.
- **H2 holds.** In the witnessed cone at 125 files, 0.81 % of derived facts rest on two files (0.50 % immediately).
  ρ is 5.2, or about 2.6 without the `derived_by` reflection; `ast_within` alone is a third of what is derived.
- **H3 is refuted as stated.** The files read one another in one cycle: 48 of 125 files, holding 70 % of the facts.
  But only about 15 000 witnesses cross a file inside it. So a stage is not a file. The cycle is iterated over the
  thin crossing delta, with every file's local facts kept. That is the difference from the `[surface]` driver,
  which evaluated each volume again.
- **H4 holds.** Deriving costs about 5 µs a fact. A mapped fact costs a probe, the same as a heap fact, and nothing
  at open.

So the first stage of any plan is "everything local, per file". The second is the cross-file cycle, iterated by
delta over the 0.81 %, which is decision 4's resume plus decision 7's split by key, at the size of the crossing
facts.

**Ingest by delta already works** (`f_ingest_by_delta_is_exact_and_an_addition_costs_a_few_times_its_share`,
`scripts/ingest_by_delta.ts`). The core is evaluated once and each file is added to the evaluated world by the
addition path. The result equals the whole world byte for byte, and cross-file joins are found as files arrive, with
no second pass. At 20 files an addition costs about three times its share of the whole (0.35 s a file, was 0.45 s)
and grows slowly with the world: a reset aggregate rule withdraws and fires only its own firings, and a rule fires
whole only in the round that needs it. A world an addition left up to date must not be evaluated again: `evaluate` runs the whole
pass whatever the store holds.

**A stage added above an evaluated one already costs its own delta**
(`f_a_question_added_to_an_evaluated_cone_costs_its_own_delta`, `scripts/stage_by_asks.ts`). A world evaluated
over the cone of `asks(may_be_node)`, then given the question's asks by delta, equals the world that asked both at
once, byte for byte; the question cost 0.38 s against 5.2 s whole at 20 files.

**A stage kept on disk opens evaluated**
(`f_an_evaluated_world_kept_on_disk_opens_evaluated_and_takes_the_next_stage_by_delta`, `rust/rofl/src/image.rs`).
`Session::keep` writes the world in binary, derived facts and witnesses included; `Session::open_kept` reads it back
evaluated, and the next stage goes on by delta. At 20 files: 50 MB, kept in 0.8 s, opened in 0.6 s against 4 s to
evaluate, and the result equal byte for byte. The facts go in by a bulk path, the image keeps the program's safety
answer, and the program is prepared once. A world with lattices (but dominance and join lattices) or sealed opens
evaluated too: the lattice cells, their history and the citers, and the aggregate cells by correlation, are rebuilt
from the store.

## What is built, in order

1. **Derived as given** (the keystone: stages, cache and resume all need it). A stage builds on the one below it in
   memory and across a process (the kept image, the volume). Proved on every world of `npm test` that splits
   (`scripts/addcheck.ts`, `f_two_stages_equal_the_whole_on_every_world_that_splits`): the lower half of the world's
   relations asked, evaluated, kept as a volume and opened, the upper half asked of it, equals the world asking both,
   byte for byte, on all 167; the upper stage goes by delta in 137. Dominance and join lattices are kept with the
   world and open evaluated. Left: an upper stage the addition path evaluates again evaluates the lower one too.
2. **The mapped volume.** Built: `Session::keep_volume` writes the world as the arenas it is, `open_volume` maps
   them and copies nothing (`rust/rofl/src/volume.rs`; at 250 vscode files it opens in 0.6 s against 9.2 s for the
   image, holding 0.36 GB against 1.6 GB, for twice the disk;
   `f_a_world_kept_as_a_volume_opens_mapped_in_a_fifteenth_of_the_time`). A write below the mark copies the value it
   writes, not the arena (`f_a_kept_layer_streams_its_base_and_copies_none`).
3. **Resume** (decision 4, H5). Built for the plain path: `Session::resume`
   (`f_a_step_wall_in_the_plain_path_is_a_continuation`). The place it stopped is kept in the volume, so another
   process opens it and goes on: `scripts/vscode_pieces.ts` evaluates vscode in pieces of a fixed time, each its own
   process, to the same state (`f_an_evaluation_goes_on_in_another_process_from_its_volume`).
4. **The planner and its refusal** (decisions 3 and 6, H1, H3). Built: `scripts/stage_plan.ts FACTS LIMIT_MB` takes
   the imports from the model, keeps each ring of files importing one another by value whole, packs the rings under
   the limit, imported first, and refuses a ring heavier than the limit, naming it; `rules/stage-plan.rofl` checks
   the plan as facts. `--run` evaluates it stage by stage, a process each over the last volume, `--check` against the
   whole: 100 vscode files in 4 stages equal the whole
   (`f_a_stage_plan_keeps_rings_whole_and_its_stages_equal_the_whole`). Real rings: vscode 223 files, webpack 580 (6
   counting only imports at the top of a module). An index of the volume takes its writes in a layer over it and the
   citer index is kept in the volume, so a stage's own memory is near its plan
   (`f_an_index_of_a_volume_takes_its_writes_in_a_layer_over_it`). Keeping a stage streams each column from the
   volume under it and puts the new entries in its tables, so it copies nothing into the heap, and the provenance
   notes are read where they lie (`f_a_kept_layer_streams_its_base_and_copies_none`). Left: the plan's weight per
   fact underestimates a stage that derives much over what is kept.
5. **Workers by key** (decision 7).
6. **The explanation by file**: the why of an absence as a table of files, each row expanded by lifting one volume.
   Built over the evaluated world: a whynot walk parted by file, a row a file with its answers and the premises it
   stopped at, shown as the table in a notebook and answered by `rofl serve`
   (`f_whynot_by_file_parts_the_walk_where_a_candidate_first_names_a_file`). Left: the zero of a row read from the
   file's kept stage under its hash and the program's, which needs item 1.

Each item opens with its hypothesis measured; a refuted hypothesis is recorded and changes the order before
anything is built on it.
