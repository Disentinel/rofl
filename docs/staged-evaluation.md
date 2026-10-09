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
no second pass. At 20 files an addition costs about five times its share of the whole (0.45 s a file) and grows
slowly with the world. A world an addition left up to date must not be evaluated again: `evaluate` runs the whole
pass whatever the store holds.

**A stage added above an evaluated one already costs its own delta**
(`f_a_question_added_to_an_evaluated_cone_costs_its_own_delta`, `scripts/stage_by_asks.ts`). A world evaluated
over the cone of `asks(may_be_node)`, then given the question's asks by delta, equals the world that asked both at
once, byte for byte; the question cost 0.38 s against 5.2 s whole at 20 files. What is missing is keeping the lower
stage across a process: `cool` writes base facts only.

## What is built, in order

1. **Derived as given** (the keystone: stages, cache and resume all need it). In memory a stage already builds on the
   one below it; what is built is a kept stage read back as complete: `run_pass` does not clear it and no rule whose
   head is in it fires. Proof: a world evaluated
   in two stages equals the world evaluated whole, byte for byte, on every world of `npm test` that splits.
2. **The mapped volume.** colfile into the engine as the frozen base a fork reads.
3. **Resume** (decision 4, H5).
4. **The planner and its refusal** (decisions 3 and 6, H1, H3).
5. **Workers by key** (decision 7).
6. **The explanation by file**: the why of an absence as a table of files, each row expanded by lifting one volume.

Each item opens with its hypothesis measured; a refuted hypothesis is recorded and changes the order before
anything is built on it.
