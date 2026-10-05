# Demand cones: answering a question in the part of the world it needs

Work item `w_cmp_demand_cones` (hypothesis 7 of the compression programme: most of the world is
never asked). The numbers are from Rust release, 2026-10-05, on the notebooks' own questions;
`f_the_relation_cone_is_sound_where_a_rule_reads_what_no_premise_names` is the finding.

## What exists

`asks(Rel)` is a fact of the world. The kernel runs only the rules whose heads reach an asked
relation, backwards through every premise (positive, negated, inside an aggregate) and through the
relations a subsumptive relation's dominance bodies read; no asks means every rule. Both engines.
A rule outside the cone is still in the store as data: its reflection is whole. This is a **relation
cone**: a relation is derived whole or not at all.

Three levels of demand, told apart by what the answer to a question must hold:

| level | what is derived | state |
|---|---|---|
| relation | every rule of every relation a question reaches | built, below |
| column | a relation without the columns nobody reads | not built; measured below |
| fact (pattern) | the instances a question reaches, by sideways information passing | not built; its bound is measured below |

## When the cone is the whole world

A cone answers like the whole world only if no rule in it can see a relation it does not name.
`Eval::asks_cone` keeps every rule (and says so in the diagnostics) where that happens:

- a rule in the cone reads, or an ask names, a relation the kernel writes from every rule's
  evaluation: `agg_cell`, `agg_member`, `agg_member_prem`, `agg_sealed`, `lattice_member`,
  `lattice_member_prem`, `dominated_by`, `shrug`, `unknown`, `stratum`, `unstratified`, `edb`,
  `hole`. An ask for `hole` is a question about every rule's holes (decided conservatively,
  `f_hole_asked_and_an_ask_a_rule_concludes_keep_every_rule`; the holes of the rules a cone runs
  are in the store without it). With several asked, the diagnostic names the least by name;
- a rule reads `derived_by` of a fact whose relation it does not write (a variable): every
  relation's rows. Written as `$fact(Rel, ..)` it reads Rel, which joins the cone;
- an asked relation is answered on demand (a variable no premise binds): a row is a call some rule
  made, so the rows are those of every caller;
- a rule concludes `asks`: what a world asks is read before its rules run;
- the stock evaluator (`--strata`), which orders every rule by its stratum table.

And the cone grows by what it reads without a premise: a relation an `explain_request` names is
asked, whether the request is a fact or a rule's head; the relations a dominance body reads belong
to the cone of the relation it orders. Two kinds of rule run in every cone, with their premises:

- one concluding what the kernel reads of every evaluation (`kernel_heads`): `unknown`, read behind
  every negation, `shrug`, `explain_request`, and under well_founded `stratum`;
- one that can make the whole world refuse (`refusal_heads`), so a cone never answers a refused
  world: a declared function's or tree's relation, a reader of `unknown` or `shrug`, a rule into a
  tag or reading or concluding a subsumptive relation, a demand-backed head with an aggregate or a
  lattice read, under well_founded every aggregate and demand-backed rule, and every relation a
  stall of the whole program's rounds leaves unsettled.

A question about a relation the cone left out, or about one the kernel writes of every rule, is
refused in both engines with the same words (ask, why, why all, whynot, an explain request), and so
is an excise under a cone that left rules out (`Eval::outside_cone`).

Held by `rust/rofl/tests/asks_cone.rs`: every world of `facts/checks.rofl` that does not ask for a
wall is run without asks and with `asks(R)` for its first and last derived relation; the rows of
every relation in the cone, their supports and ticks, and `why` of the first rows of R are equal
(489 asks, 1679 relations, none differs; a budget- or space-cut world and the `cell` lines are left
out, the reason in the test). A second sweep asks every derived relation (12 per world), walled
worlds under their walls: a refused world is refused with each of its heads asked, for the same
reason; rows, `why`, `whynot` and holes are the whole world's where neither run met its wall; and a
question about a pruned relation is refused (2 352 asks, 312 of a refused world, 904 questions
outside a cone, none differs; `ASKS_SHARD=i/n` splits it). The sweeps found the kernel's readers
(`shrug`, `unknown`, holes, cells), the relations answered on demand and the refused worlds; the
explain request, the dominance body and `derived_by` were found by reading, the kernel's heads, a
rule-made request and a question outside the cone by the review of 2026-10-05. Sixteen worlds
`asks_*` (both engines) and twenty-four planted faults hold the edges; whycheck holds the refusals
of questions and the diagnostics of both engines to each other.

## Measured

Corpora as in `f_half_the_world_is_provenance_and_a_fifth_is_the_ancestor_closure` (self, mcp,
cli_exits, util), world assembled from the notebook, plus the cells' rules; the asks are the
relations of every asking line of the notebook (`never`, `unsure`, `?`, `why`) and the two the host
asks after the run (`hole`, `unresolved_relative`). util has no cells: it is asked with the union
of the three notebooks' questions. `rofl-eval --bytes --budget 4e9 --space 4e7 --delta-first
--unsettled` (the evaluation, no `derived_by` row written for what nothing reads), medians of two
interleaved runs, load 5-8 on a shared machine.

These numbers were taken before the review of 2026-10-05: an ask for `hole` now keeps every rule, so
the cones below are those of the notebooks' questions without it, and a cone now also holds the
rules of every declared function and tree (`binder`, `ast_in`, ...) and of what the kernel reads;
the corpora were not measured again (unverified how much the cones grew).

| corpus | mode | rules run | facts held | eval s | RSS MB |
|---|---|---|---|---|---|
| self | default | 1252 -> 538 (43%) | 1 319 615 -> 1 119 189 (85%) | 7.5 -> 5.8 (78%) | 938 -> 794 (85%) |
| self | sealed | | 1 319 612 -> 1 119 186 | 3.3 -> 2.4 (72%) | 516 -> 452 (88%) |
| mcp | default | 1232 -> 438 (36%) | 980 605 -> 776 257 (79%) | 5.6 -> 3.8 (68%) | 722 -> 587 (81%) |
| mcp | sealed | | 980 610 -> 776 262 | 2.3 -> 1.5 (64%) | 412 -> 367 (89%) |
| cli_exits | default | 1219 -> 423 (35%) | 1 485 145 -> 1 185 744 (80%) | 8.2 -> 5.6 (68%) | 1048 -> 833 (79%) |
| cli_exits | sealed | | 1 485 150 -> 1 185 749 | 3.5 -> 2.2 (63%) | 568 -> 479 (84%) |
| util | default | 1279 -> 570 (45%) | 2 454 568 -> 2 094 904 (85%) | 15.5 -> 11.5 (74%) | 1799 -> 1521 (85%) |
| util | sealed | | 2 454 573 -> 2 094 909 | 6.2 -> 4.4 (70%) | 1020 -> 905 (89%) |

So the cone of a whole notebook is 35-45% of the rules and takes a quarter to a third off the
evaluation and a tenth to a fifth off the memory, which is the owner's expectation set on
2026-10-04 (a third to a half of the time, a small share of memory). It holds 79-85% of the facts
because what it keeps is the part every question about calls needs: name resolution
(`ast_within` 45% of the cone world, `ast_in`, `nearest_v`, `ident_in`, `sees_binder`) and the flow
(`may_be_node` + `may_be_lit` 1.4-2% of it).

One question at a time (rules in the cone of one asking line): self 11 questions, 1 / 399 / 458
(min / median / max) of 1252; mcp 17, 2 / 371 / 414 of 1232; cli_exits 8, 370 / 406 / 417 of 1219.
A question that does not touch a call is a cone of a handful of rules (mcp `nb__advertises`: 3
rules, 15 209 steps, 0.05 s against 934 997 steps for the whole world); one that does reaches
the resolution core (370 rules, 538 491 steps, 3.8 s).

Answers: on all four worlds every asking line of the notebooks, asked of the whole world and of
the cone world, holds the same rows, and the first three rows' `why` read alike (cli_exits 8
questions, mcp 16, self 11, util 35; cli_exits, mcp and self also equal the counts the TypeScript
notebook printed). The rows of every relation of the cone, supports and ticks included, are the
whole world's (200, 199, 290 and 300 relations of cli_exits, mcp, self and util; none differs), and
no relation outside it holds a derived row but the kernel's cells of an aggregate of the cone that ran.

## Hypothesis 7, as measured

The 2026-10-04 numbers were taken on TS in the full world. On Rust, derivations of every firing
(`rofl-eval --derivations`), the rows of a flow relation read by a firing whose head is outside the
flow book:

| | may_be_node read outside the flow book (cone world / whole world; self, util: cone world only) | may_be_lit read outside |
|---|---|---|
| cli_exits | 3.1% / 7.9% | 0% / 0% |
| mcp | 5.4% / 11.0% | 0% / 0% |
| self | 7.3% | 0.0% |
| util | 6.5% | 0% |

So 89-97% of `may_be_node` is read by nothing outside the flow book, and no `may_be_lit` row is read
outside it: **confirmed** (the stated 90-96% is reached on every corpus but mcp's whole world,
89.0%). What the cone does not do is use that: the flow stays in the cone whole, since the
relations that read it do. Its rows are small (1.4-2%), so this is not where the cone is large.

The fact level, a lower bound: the facts in the **positive support** of the answers (every
firing, transitively) are 0.16-0.24% of the facts of the cli_exits and mcp worlds (4 305 and 4 121
facts), 1.9% of self's (it answers a 732-row question); `ast_within` contributes 45 of 535 683
rows, `may_be_node` 85 of 14 269, `may_be_lit` 0. Negated premises add the facts that block, not
counted (`neg:` patterns are in the firings and name no fact), so this is a bound, not what a
demand-driven evaluator derives, which needs the instances every attempt reached. The gap between
80% (relation cone) and 0.2% (support) is where pattern-level demand would work, and most of it is
two things: the ancestor closure, which a declared `tree` answers without rows
(`w_data_structures`), and per-node relations (`nearest_v`, `ast_in`, `ident_in`) derived for
every node of the code when a question reaches a handful of calls.

## Pattern-level demand: what it needs

The finding `f_the_data_walk_of_the_aggregate_area_is_the_demand_graph_a_data_cone_needs`:
datastrat's walk is the magic-set demand graph across components. A kernel that fires a rule only
on instances matching a reached pattern, with that walk as its sideways information passing, is the
fact-level cone; not a rule rewrite (the rewritten rules would show `magic_` premises in `why`),
and not built. Its refusals are the list of "when the cone is the whole world" above plus negation,
aggregates and lattices **inside** a component, where the walk degrades to the relation cone.

## What the cone needs from incremental addition (the AFK decision, not built here)

Measured, Rust, `rofl-serve`, the full world opened, `asks` asserted, evaluated, then one more ask
asserted:

| world | first ask | then | steps first | steps for the second ask | from scratch (both) |
|---|---|---|---|---|---|
| mcp | `nb__advertises` (3 rules) | `nb__unawaited` | 15 209 (0.05 s) | 538 491 (3.8 s) | 538 491 (3.9 s) |
| cli_exits | `nb__exits` | `nb__unawaited` | 838 128 (5.7 s) | 838 446 (5.4 s) | 838 446 (6.1 s) |

A later ask costs the whole of the new cone: evaluation clears every derived fact and derives
again, so growing a cone by 318 steps (0.04%) costs 5.4 s. What it gives is exact: the grown world
is the world asked both from the start (every row of the 2 013 611 equal), and every row the
first cone derived is in it unchanged (the closed-cone property, also the sweep's 69 pairs).

What the cone work needs, precisely:

1. **Rules arrive, facts do not.** Growing a cone adds rules whose heads are in no relation of the
   old cone (a cone holds every rule of each head it holds), reading old relations, which are
   closed, and new ones. The addition is a monotone program over fresh heads: nothing the old cone
   derived is retracted, and no old rule fires again. The engine's entry is "activate these rules
   over the retained store": the first round of each new rule joins all current facts of its
   premises as if they had just arrived (the delta machinery of `delta.rs`, with the whole
   relation as the delta), then the rounds go on as usual; ranks for the new relations above those
   they read; witnesses and `derived_by` notes as for any firing.
2. **It is the same operation as the fallback.** A cone that meets a kernel reader becomes the
   whole world; with the above that is "add the remaining rules", not a restart.
3. **Not needed:** new facts (the AFK tick), retraction (shrinking an ask is a full evaluation
   today, correct; with derivations and witnesses it would be removal of what only the dropped
   rules supported).
4. A host that asks one question after another needs only 1 and the ask read at the call, which
   `Session::assert` of an `asks` fact now does (it was silently not read: a new ask was an empty
   answer).

What this does not do for a **value-level** merge of the flow (the work item's second half): no
compression exists to test it on; the closed-cone property proved here is on relation cones, and
the same proof (a world asked later equals a world asked from the start, every row of an earlier
cone unchanged) is what a node-merging step has to pass.
