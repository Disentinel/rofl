# Optimising a world

A cookbook. Every recipe has the same four parts: the **symptom** (what you
see, and which measurement shows it), the **cure** (a rewrite or a declaration,
with a before and an after), the **gain** that was measured (corpus, mode,
caveat) and the **link** to the finding that holds the evidence and the world
that proves the cure changes no fact. Nothing here is a claim without a
finding; where a number is not from Rust release the text says so. The snippets
were run (`rofl load boot.rofl file.rofl`): each before and after concludes the
same rows, except the order-only pairs of 3.2, the rename of 3.10 and the open
demand relation of section 6, which is the proof world's.

The corpora are the four of `f_half_the_world_is_provenance_and_a_fifth_is_the_ancestor_closure`:
**self** (15 files, 2.4M facts default), **mcp** (40 files), **cli_exits** (51
files) and **util** (100 files, 4.5M facts default), the JS model over each.

## 1. How to measure

**Rust release only** (`CLAUDE.md`, "Rust is the engine";
`f_rust_is_the_engine_ts_is_the_reference`): `cd rust && cargo build --release`,
then `rust/target/release/rofl load --seed`. The TypeScript engine is the parity
reference and its timings decide nothing. A number taken on TypeScript in this
ledger (the first table of `f_half_the_world_is_provenance_and_a_fifth_is_the_ancestor_closure`,
the join-width findings of September) is marked as such below.

`rofl load --seed SEED.json [flags]` reads a seed, evaluates, prints the state on
stdout and, with `--bytes`, a profile on stderr.

| flag | what it is for |
|---|---|
| `--bytes` | `facts`, `eval_ms`, `peak_rows`, `steps`, `absorb_ms`, bytes per table, and two top-20 tables: `argm_rule` (index probes per rule, **deterministic**) and `rule_ms` (time per rule, noisy). |
| `--budget N --space N` | the walls. The plans are on under them too, so a wall's cut moves as the engine improves (`f_the_owner_settles_walls_promises_and_incremental`). The corpus runs use `--budget 4000000000 --space 40000000`. |
| `--ticks N` | advance N ticks |

The environment switches that remain are oracles of the check harness, listed
in docs/knobs.md; none is a tuning knob.

**Seeds.** A seed is a snapshot of the world with the scanned facts asserted
and nothing evaluated. The four corpus seeds were made as experiment 0 made
them: assemble the notebook's world (`notebook/cli.ts` inputs,
`notebook/world.ts`), `Host.init` and the scan, assert the facts into a fork of
the loaded model without evaluating, write `snapshot()`. The scripts were kept
in a session scratchpad (exp0 `seed.ts`, `seed_sealed.ts`), not in the tree;
`scripts/port_corpus.ts` writes seeds of the check worlds and `rofl load --save`
snapshots a loaded world. Two traps found: a string starting with an emoji gave
a lone surrogate that the Rust seed reader refuses (`str_char0`; cli_exits had
two, replaced by U+FFFD for the measurements), and seeds must be regenerated
when the node-id format changes (the tree measurement regenerated them for the
16-hex ids). The sealed seed is the same world with `sealed(provenance)` asserted.

**Probes are deterministic, time is noisy.** Index probes (`arg_matches`,
`argm_rule`) repeat exactly; wall time moved 5-30% with the load of the shared
16-core machine in every measurement below. The method of the findings: one
process at a time, three runs per arm **interleaved**, the median, the probes
as the verdict and the per-head ms beside them. Two readings that mislead:

- `rule_ms` charges the **absorb** (the canonical sort of freshly written rows)
  and the **index builds** to whichever rule probes first: `for_of_use` cost
  4.6 s default and 40 ms sealed with the same probes (`absorb_ms` 2365 against
  175 on util), and the s5 rewrite moved 170 ms from `has_return` to
  `thrown_in`. Read `rule_ms` with `absorb_ms` and with probes, never alone
  (`f_costly_rules_are_shapes`).
- Probe totals are comparable only within one planner setting: the model's
  22.17 M sealed probes before the shape rewrites are written order, the 7.9 M
  of the later re-measure are delta-first.

**Facts identical** is the acceptance of every rewrite: every non-kernel,
non-`derived_by` fact of the canonical state of the eight worlds (four corpora,
sealed and default) equal, except the relations a rewrite removes or adds and
the rule-reflection rows (`rule_prem`, `pos_prem`, `rule_known`, `negated_under`).

## 2. Modes

Three ways to hold provenance, and they are different use patterns, both
supported (owner, 2026-10-04, in `f_half_the_world_is_provenance_and_a_fifth_is_the_ancestor_closure`):
**bulk analysis** (the set of facts is the contract) and **explanation** (`why`,
`whynot`, `excise`, rules reading `derived_by`).

| mode | declare | what it keeps | when it pays |
|---|---|---|---|
| provenanced, canonical (default) | nothing | one `derived_by` row per derived fact, one witness per firing, the canonical first witness; budgets and staging reproduce the reference | explanation; any world a wall can reach; the world the TypeScript engine must equal byte for byte |
| provenance on demand | nothing (the default, lazy) | witnesses as before; the `derived_by` row is written when something observes it | a **served or interactive** world nothing prints whole: `why`, `excise`, questions |
| sealed | `sealed(provenance)` | no `derived_by`, and where nothing withdraws no witness; `why` re-finds the firings by solving the rules with the head bound | bulk analysis: 2.2-3.2x faster and 2.6-2.7x less RSS than default on the four corpora |

**Sealed.** `f_half_the_world_is_provenance_and_a_fifth_is_the_ancestor_closure`,
remeasured on Rust release at 618d45c (single runs, load 9-14, repeat spread
about 15%, fact counts exact): default against sealed, facts 2.42M against 1.36M
(self), eval 13.5 s against 5.1, RSS 1330 MB against 489; mcp 10.1-12.2 s against
4.3-4.6; cli_exits 21.6 against 6.7; util 26.7 against 9.9. The finding's text
says 2.7-3.2x; its own table and the owner's note (2.2-3.2x) agree with each
other, not with that sentence (recorded in `f_the_optimisation_cookbook_found_seven_loose_ends`).
What the seal takes: 44% of the facts (the `derived_by` rows), the witnesses
(default keeps one per derived fact: 1.06M on self, 1.91M on util; sealed keeps 3), and the engine's canonical order,
which it replaces by its own order with activation by component. What it does
not take: `asserted_by`, 5.7-6.7% of a default world and a tenth of a sealed one.
Costs to know before sealing:

- A wall placed by the step count stops at another rule, and a step is charged
  per new fact, not per firing (`f_under_the_witness_seal_a_step_is_a_new_fact_and_a_budget_is_a_different_wall`,
  recorded when the declaration was still called `sealed(witness)`;
  `f_one_knob_the_same_conclusions_and_a_budget_that_may_move_under_it`: accepted
  because the seal is explicit). Do not compare a sealed world with an unsealed
  one under a budget it can reach.
- The engine's own order is **sealed-only by decision**: made the default it
  changed the state of eight worlds, five of them budget worlds and three
  staging worlds (`f_the_engines_own_order_is_another_answer_wherever_the_semantics_names_an_order`).
  Default stays canonical.
- A sealed `why` costs 0.2-6.3 ms against 0.1-0.4 ms with stored witnesses
  (ten facts of the 40-file seed, `f_under_the_seal_a_why_finds_its_witnesses_again_by_solving_the_rules_with_the_head_bound`).
- A rule that reads `derived_by` finds nothing in a sealed world.

**Provenance on demand** (`f_derived_by_is_written_when_asked`; world `prov_lazy`
and four siblings, `rust/rofl/tests/prov_lazy.rs`). Where no rule reads
`derived_by`, a firing is noted as (fact, rule, tick), twelve bytes, and the row
is written when something observes it: the canonical state, a `derived_by` query,
save, the tick boundary. Rofl-eval, 3 runs, medians,
default mode, base 91afde2, `--unsettled` (flag removed 2026-10-05):

| corpus | eval s eager -> lazy (sealed) | peak RSS MB eager -> lazy (sealed) | facts held eager -> lazy |
|---|---|---|---|
| self | 11.3 -> 7.8 (3.3) | 1297 -> 862 (481) | 2 339 727 -> 1 313 839 |
| mcp | 8.5 -> 6.2 (2.5) | 981 -> 663 (386) | 1 733 841 -> 978 223 |
| cli_exits | 12.2 -> 8.8 (4.1) | 1442 -> 965 (536) | 2 638 441 -> 1 481 831 |
| util | 19.9 -> 15.2 (6.5) | 2493 -> 1623 (927) | 4 301 359 -> 2 445 440 |

**The caveat that decides it:** those figures are of an *unobserved* world.
When the state is observed (printed, saved, a census) the rows are written and the
world holds what the eager one held. mcp default, 3 runs: eager 15.79 s wall /
1077 MB; lazy observed 14.70 s / 1080 MB; lazy unobserved 11.19 s / 735 MB;
settle about 1.1 s. So provenance on demand saves memory only where nothing reads
the whole state, and a run that dumps its state saves about 7% wall and no memory.
Sealed stays the bulk mode. Left open and bounded: `w_cmp_provenance_rest`
(`asserted_by`, dropping re-findable witnesses, the tick boundary settling
everything).

## 3. Rule shapes and their rewrites

`f_costly_rules_are_shapes` (hypothesis 3, supported): the time of the JS model
is spent in a dozen ways of *writing a rule*, not in particular rules. Measured
on Rust release, `rofl load --seed SEED --bytes`, per-rule profile of all 1171 rules, four
corpora, sealed and default; base rule time summed over the four corpora 24.1 s
sealed and 68.1 s default; the top 30 rules are 54% of sealed rule time. The
shapes cover 504 rules and 76% of sealed rule time.

First the one the engine owns, because it is the largest.

### 3.0 Delta behind a prefix: nothing to rewrite, fire from the news

**Symptom.** 265 rules, 49% of sealed rule time (33% default): a premise that
receives news during the rule's activity stands after other premises, and the
written-order engine re-joined every premise before it in full on every round.
`argm_rule` shows a rule with thousands of probes per conclusion; the per-rule firings
(`ROFL_PROF_ALL`, removed 2026-10-05) showed many firings and few new rows (`callback_param`: 210 firings on util).

**Cure.** None in the rule. The Rust engine solves a rule fired on the news of
premise i from the news: the news premise first, then greedily the premise with
the fewest estimated matches given what is bound (`engine/joinplan.rs`,
`f_delta_first_plans_fire_a_rule_from_its_news`). Default on. Facts and the whole
`--bytes` state identical in all eight worlds, derived_by and witnesses too.

**Gain** (Rust release, `--bytes`, before = the same binary with delta-first plans switched off, a switch since removed):

| eval ms | self | mcp | cli_exits | util |
|---|---|---|---|---|
| sealed | 5196 -> 3680 (-29%) | 3835 -> 2727 (-29%) | 6352 -> 4111 (-35%) | 9454 -> 6665 (-30%) |
| default | 13085 -> 11866 (-9%) | 9983 -> 7693 (-23%) | 17786 -> 13734 (-23%) | 26845 -> 22638 (-16%) |

RSS +0.1..+1.5%; probes sealed self 4.22M -> 1.92M, util 8.03M -> 3.66M; the
planner's own statistics cost 115-430 ms a corpus (`joinplan_stats_ms`). Default
mode gains less because absorb and `derived_by` writes, not the join, are most of
what is left. After the review fixes, on top of the shape rewrites of 3.4-3.12:
sealed -24..-32%, default -11..-23% (`f_a_join_plan_is_never_observed`).

**Carve-outs, said here and not silently** (`f_a_join_plan_is_never_observed`,
worlds `agg_join_delta_first` and its `_hole`, `_persp`, `_steps`, `_space`
siblings):

- a wall's cut is the engine's and moves with it: an engine that does more for the
  same budget is the expected effect (owner, 2026-10-05); a world whose meaning is the
  stop by budget lowers its budget. A plan that outgrows the space is solved again in
  written order (`Halt::Overrun`), which also does more for the same budget;
- builtins, lattice worlds, aggregates, thresholds, demand rules and closure
  rules stay in written order; no firing is planned while an unknown spreads;
- under any space wall a plan can finish what written order shrugs at
  (`space_exhausted`): a shrug refines, never contradicts;
- the estimate is average-based, a skewed key undercounts; with the overrun
  fallback that costs time, not soundness.

So **do not hand-reorder premises for the planner's sake**: after delta-first
s1-s3 (below) are not worth writing, and s2 made the probes of its own head go up
(7 471 -> 13 399 on self sealed). A declared `function` tells the planner "at most
one match" for a bound key without its counting pass (section 5).

### 3.1 Static joins between recursive premises (s1)

Symptom: `callback_param`, 1656 ms before delta-first. Cure: hoist the static
callee/argument/parameter structure into helpers outside the recursion. Gain:
-10% sealed, -12% default written-order; **after delta-first: callback_param
26-71 ms -> 16-37 but the two helpers cost 30-74 + 7-17 ms and add 5 000-14 000
facts, total probes -0.1%: dropped** (`f_costly_rules_are_shapes`, the
after-delta-first note). Nothing to do.

### 3.2-3.3 Live premise not first (s2), selective constant after the live premise (s3)

```
-- before: the premise that gets news second, the constant-bound one last
passes(F) :- param(F, P), may_be(P).         r(X) :- live(X, Y), key(Y, iterator).
-- after
passes(F) :- may_be(P), param(F, P).         r(X) :- key(Y, iterator), live(X, Y).
```

Written-order gains: s2 `passes_function` -69% sealed / -62% default (179 -> 55
ms); s3 `for_of_iterates` -99% (176 -> 1 ms). After delta-first: s2 probes
7 904 k -> 7 910 k sealed (the head's own up), s3 4-14 ms -> 0-2 ms, 0.1% of rule
time: **both dropped**, the planner already took the rule from 176 ms to 4-14.
Run the rewrite only on a world that runs in written order (aggregates, lattices).

### 3.4 Materialised closure

Symptom: one rule, 10.7% sealed / 19.4% default of rule time, 21% of the facts of
a default world: `ast_within`, the node-times-ancestor closure, 513k-888k rows,
and 43-48% of all `derived_by` rows. Cure: **declare it** (section 5): `tree
ast_in(P, C) closure ast_within.`. A rule rewrite would mean re-expressing about
60 readers (`f_costly_rules_are_shapes`: no rewrite measured).

### 3.5 Cross product (s4)

Symptom: a positive premise sharing no variable with what precedes it; `argm_rule`
shows 250 000 probes for a rule that concludes a few rows. 49 rules, 9.6% sealed.

```
-- before: fkind x fnode first, then the join that connects them
fn_name(F, N) :- fnode(F), fkind(K), has_kind(F, K), nm(F, N).
-- after
fn_name(F, N) :- fnode(F), has_kind(F, K), fkind(K), nm(F, N).
```

Gain: `fn_name` 224 -> 1 ms, 252 685 -> 587 probes (s4); applied across the model
`fn_name` 524 -> 169 ms sealed / 1130 -> 183 default, `prototype_of` 408 -> 180 /
830 -> 523, probes 548k -> 100k. Many detector hits are harmless (a join with a tiny
edb table, or the head *is* the product): those are the register's
`product_is_the_output`. Lint: `cross_product`.

### 3.6 Closure entered from the wide end (s5)

Symptom: a closure with the top bound and the bottom free, the bottom then filtered
by a constant kind; probes 27 918 for a rule that concludes few rows. 17 rules,
8.5% sealed / 11.7% default.

```
-- before: every descendant of F, then the filter
thrown_in(F, T) :- fn(F), within(F, T), throw_stmt(T).
-- after: the filtered end first, then the ancestors of T
thrown_in(F, T) :- throw_stmt(T), within(F, T), fn(F).
```

Gain: probes 27 918 -> 1 684 (s5); across the model `thrown_in` probes 55 836 ->
3 546 (default), `exported_fn` 103 -> 12 / 147 -> 19 ms, `tdz_deferred` 368 -> about
2 ms (probes 831k -> 3k). **Caveat, the cost can move:** the first reader of the
closure by its second argument pays the index build. `thrown_in` itself rose 277
-> 375 ms sealed (it paid the build `has_return` paid before, 190 -> 18); together
467 -> 379 sealed. Where every reader would pay it, nothing is saved (section 3.13).
Lint: `closure_wide_end`. A declared tree answers either end from its intervals
(section 5), which makes this shape moot where the tree is taken.

### 3.7 Same body, two heads (s9)

Symptom: two rules with alpha-equal bodies, different heads: the same join twice a
round. 72 rules, 6.5% sealed.

```
-- before
ext(C, S)  :- call(C, F), imp(F, S).
node(C, C) :- call(C, F), imp(F, S).
-- after: one helper both heads read
ext_call(C, S) :- call(C, F), imp(F, S).
ext(C, S)  :- ext_call(C, S).
node(C, C) :- ext_call(C, _).
```

Gain (the model's `external_value` / `may_be_node`, helpers `ext_call`, `ext_member`;
after delta-first, 8 worlds): heads + helpers 1 237 -> 1 144 ms sealed (-7.5%),
2 862 -> 2 527 default (-11.7%); the whole model's probes 7 904 k -> 7 812 k
(-1.2%) sealed, 9 561 k -> 9 489 k (-0.75%) default. **The price is a round a hop**
(rounds 1 354 -> 1 386 mcp sealed, +2%) and 1 000-3 000 helper facts a world.
The same helper under the engine that fired in written order *raised* the probes
2.5%, because the extra round re-fired `callback_param`; written order measured
-37% sealed for the pair alone. Lint: `twin_bodies`. Applied: `rules/js-dataflow.rofl`.

### 3.8 Scoped descent (s11)

Symptom: a closure-sized descendant set joined back to `nearest_v` to keep only
what is in the same function; probes 1.41 M. 3 rules, 6.1% sealed.

```
-- before: all descendants, then keep those with the same nearest function
here(T, X) :- try(T), within(T, X), nearest(X, F), nearest(T, F).
-- after: walk down, include a function node and do not go below it
walk(T, X) :- try(T), edge(T, X).
walk(T, Y) :- walk(T, X), not fn(X), edge(X, Y).
here(T, X) :- walk(T, X).
```

(`T` is never a function in the model; with a function `T` the two differ.) Gain:
`caught_here` 814 -> 79 ms sealed (-90%), 1423 -> 202 default, probes 1.41 M -> 40 k;
across the model 814 -> 18 / 1387 -> 88, `suspend_at` 635 -> 66 / 743 -> 127.
Lint: `scoped_descent`.

### 3.9 Project the key, then negate (s6)

Symptom: one premise with wildcards followed by negations: the negations run once
per *row*, not once per key (162k negation triples for 26 keys). 70 rules, 2.8%.

```
-- before
unconsumed(K) :- attr(_, K, _), not consumer(K), not alias_of(K).
-- after
key_seen(K)   :- attr(_, K, _).
unconsumed(K) :- key_seen(K), not consumer(K), not alias_of(K).
```

Gain: `unconsumed_attr` 543 -> 69 ms sealed (-87%), 749 -> 242 default; applied
across the model 545 -> 0 with the helper at 32 / 66 (self + mcp). Lint:
`project_then_negate`; the hits that stay are excused as `one_row_per_key` (a few ms each).

### 3.10 Copy under two names (s8) and 3.11 existence by scanning (s7)

```
-- s8 before: the same body under two names
in_fn(N)     :- nearest(_, N).
eff_in_fn(N) :- nearest(_, N).
-- s8 after: one relation, its readers read it
in_fn(N)     :- nearest(_, N).

-- s7 before: one solution per row of a wide relation
scanned() :- node(_, _, _).
-- s7 after: an existing distinct projection
scanned() :- kind_seen(_).
```

s8: `eff_in_fn` dropped, `eff_module` reads `not in_fn[code]`; 272 -> 58 ms sealed,
1048 -> 121 default in the prototype, then, applied, time-neutral because `in_fn`
takes over the firings; **the gain is facts**, 26k-45k fewer a world (the prototype
text says 40k-81k, see the loose ends finding). 35 rules, 2.2%. A declared `alias`
(section 5) will say this in one line. Lint: `twin_bodies` with equal head
arguments is a copy. s7: `corpus_scanned` 82 -> 0 ms sealed, 326 -> 1 default
(235k solutions -> 396); lint `existence_scan`. Not every twin is a copy:
`ident` is not `ast_name` (18 896 against 18 513 rows on cli_exits).

### 3.12 Pairwise not-closer (s10)

Symptom: the same relation twice with `F != G`, read under `not`: the nearest of
all by comparing all pairs. 9 rules, 0.4%.

```
-- before
nearer(F, X)   :- encl(F, X), encl(G, X), within(F, G), F != G.
nearest(X, F)  :- encl(F, X), not nearer(F, X).
-- after: a walk up the parent chain that stops at the first hit
-- (pays only where `enclosing` is a relation something else already needs, see 3.13)
nearest(X, F)  :- parent(X, P), enclosing(P, F).
enclosing(P, P) :- fn(P).
enclosing(P, F) :- parent(P, Q), not fn(P), enclosing(Q, F).
```

Gain: `nearest_fn` off `nearest_v`: 316 -> 54 ms sealed (-83%), 617 -> 150 default
(`encloses` and `closer` dropped); `encloses`+`closer` 248 -> 0. **The lesson
(`f_costly_rules_are_shapes`, last note): a walk is cheaper than the pairwise
form only when the walk relation already exists** (`nearest_fn`, `dec_up` and the
`eff` readers got their 2% from reading `nearest_fn`, which the call graph computes
anyway); a walk written for one reader pays its rounds (3.13). The first `dec_up`
had shape 3.0 itself and saved 4%. Lint: `not_closer`.

### 3.13 Tried, and the cost only moved (or the cure lost)

- **s12 anti-join as two counts** (`attr_kind_lacks`): **refuted**. Identical facts,
  but 51 -> 249 ms on mcp sealed and +65k aggregate member rows: an aggregate keeps
  its members. Nothing to do; keep the per-node negation.
- **Closure from the filtered end for readers that share the index**
  (`for_of_use`, `param_use`, `call_in_try`, `hidden_at`): `for_of_use` 653 -> 87
  ms and `guarded` 230 -> 894, rule time unchanged: the forward `ast_within` index
  is built by its first reader. Also `tdz_deferred`'s `fn_node` reorder: probes
  415 970 -> 564 750.
- **Three nearest-by-not-closer clauses rewritten as walks**, none cheaper in both
  modes, none applied: `this_nearer` 19 / 88 ms against 67 / 113 for the walk
  (`this_up`: one round a level, util 5 487 rows against 756); `private_inner` 0
  ms and 0 probes in all eight worlds, the walk 8 ms for nothing saved;
  `completion_fn_between` sealed 52 -> 17 ms but default 87 -> 143 (22-24 firings
  against 2), net zero, 0.1% of rule time. Register: `this_nearer`, `private_inner`.
- **The helper of 3.7 under written order**, probes +2.5% sealed: see there.
- **s1-s3 after delta-first:** 3.1-3.3.
- **One letter apart, two hundred times the cost**
  (`f_one_letter_apart_same_body_two_hundred_times_the_cost`, September, TypeScript
  join width): `closer_v` and `closer_s` are the same rule; 7.5% of the world and
  0.2%, because `encloses_v` ranges over every function crossed with every node it
  contains and `encloses_s` over 116 `scoped_binder` rows. A shape hit is a
  candidate, never a cause.

### 3.14 The lint

`examples/shapes/shapes.rofl` states seven detectors as rules over the reflection
(`premise_lit`, `conclusion_lit`, `concludes`, `premise_pos/neg`, `uses_builtin`):
`cross_product`, `closure_wide_end`, `project_then_negate`, `existence_scan`,
`not_closer`, `scoped_descent`, `twin_bodies`, each with a `shape_reason`. Load it
beside your rules and read `shape_alarm`:

```
rofl load boot.rofl examples/shapes/shapes.rofl my-rules.rofl lint-decl.rofl | grep '^shape_alarm'
-- lint-decl.rofl holds:  lint_closure(within).   -- a relation the engine reads as a closure
-- over the before-forms of 3.6-3.9 and 3.12 (trailing columns dropped):
shape_alarm[main](closure_wide_end,thrown_b)
shape_alarm[main](existence_scan,sc_b)
shape_alarm[main](not_closer,nearer)
shape_alarm[main](project_then_negate,unc_b)
shape_alarm[main](twin_bodies,ext_b)
```

Two of the detectors are written for the JS model: `lint_closure(Rel)` names
the closures of *your* world (the file ships `lint_closure(ast_within)`), and
`scoped_descent` looks for `nearest_v` by name. A hit you decide to keep goes in a
register row `shape_ok(Head, Shape, "reason: measurement")` with one of the closed
reasons (`product_is_the_output`, `one_row_per_key`, `no_nearest_relation`,
`tried_no_net_gain`, `small_set`, `alias_of_a_derived`); a row whose finding is gone
is an alarm (`shape_ok_stale`). The model's register is `facts/cost-shapes.rofl`.
Over the pre-rewrite rules the detectors found 69 (shape, head) pairs, including
every rule the rewrites changed; over the rewritten model, 59 findings, all
excused. **Not detected:** delta behind a prefix (the engine's), the materialised
closure, premises whose cost is a data distribution. Worlds: `shapes` (both engines,
one planted instance of each shape beside the rewrite that is not one) and
`cost_shapes_model` (Rust only: red on a finding the register does not excuse and
on a register row whose finding is gone). Findings: `f_costly_rules_are_shapes`,
`f_a_demand_premise_unfolds_a_negation_before_its_round` (the engine oddity the lint's
first version found).

**All eleven rewrites together** (s1-s11, facts identical): sealed eval self 4.98 ->
4.37 s, mcp 3.91 -> 3.55, cli_exits 6.30 -> 5.71, util 9.40 -> 8.16 (-9..-13%);
default 12.9 -> 10.8, 10.4 -> 8.6, 17.9 -> 14.1, 27.0 -> 23.7 (-12..-22%); facts
-1.5..-3.4%; probes sealed 22.17 M -> 18.52 M (-16.4%), default 23.90 M -> 19.59 M
(-18.0%), written order. Rewrites and delta-first together against neither,
sealed: self 5144 -> 3403 ms (-34%), mcp 4168 -> 2550 (-39%), cli_exits 6528 ->
4404 (-33%), util 9569 -> 6723 (-30%) (`f_a_join_plan_is_never_observed`).

## 4. Aggregates instead of negation-by-absence

**Symptom.** A rule says "the last" or "the smallest" as the absence of a better
one: a pairwise `not later` / `not closer`. It joins every pair per subject, and it
is a negation the stratifier has to place.

```
-- before: the latest element as the absence of a later one
later(E, J)   :- child(E, J), child(E, K), K > J.
last(E, J)    :- child(E, J), not later(E, J).
-- after: the kernel max says it directly
last(E, I)    :- seq(E), I is max(J : child(E, J)).
```

Decision (owner, 2026-10-04, `f_a_max_over_base_data_costs_the_self_shard`):
`seq_later` is gone, the sequence's last element is the kernel `max`. Answers
byte-identical over small, cjs, xdir, scoped, external, mcp and self. **Gain: none
measured, and that is the finding.** The first A/B put the aggregate at +10.9 s on
a loaded machine (self notebook 97.8 -> 108.7 s); re-measured at load ~1 after
engine-fast, three interleaved pairs: `seq_later` 62.3 / 62.7 / 64.2 s, `max`
62.6 / 62.9 / 62.3 s. These are **notebook wall times, not Rust-release `rofl load --seed`
runs**. The reason to write the aggregate is that it says what it means and costs
one pass where the absence joins every pair; neither form is safer, both are
stratified over base data here.

Conditions and costs:

- The aggregate must sit **above** what it reads: over base data below the recursion,
  as here (`ast_child` below `may_be_node`). An aggregate over a relation the kernel
  writes while evaluating is refused (`f_aggregates_over_live_kernel_relations_are_refused`).
- **An aggregate keeps its members.** Replacing a per-node negation by two counts is
  the refuted s12 (3.13): +65k member rows and 5x the time. Use an aggregate where
  the absence form joins pairs (min, max, nearest), not to replace a cheap key
  lookup.
- A count over the reflection replaced a semiring fold in the linter (118 lines to
  60, `f_a_count_over_the_reflection_replaces_the_semiring_fold_in_the_linter`,
  world `agg_linter_demo`): a clarity gain, not a measured speed gain.

## 5. Declared data structures

`f_a_structure_is_declared_and_does_not_change_the_meaning`, `docs/data-structures.md`.
A declaration changes **no fact**: it is a *promise* the engine checks (a violation
is a refusal naming the place) and a *licence* to store and answer a relation as one
structure. The author declares; **the engine only proposes.**

**Step 0: the engine proposes.** `npm run structures -- [--min-rows N] <files>`
(boot.rofl then the files), `rofl load --propose-structures`. Read-only (`rust/rofl/src/structures.rs`), deterministic,
6-14 s a corpus including the evaluation. On the snippet above:

```
propose tree edge(P, C) closure within.
        edge: 4 edges over 5 nodes, 1 roots, depth 3; one parent per child, no cycle
        within: 7 rows = the closure of edge
        saves 7 rows (7 derivations)
```

It proposes `function` (minimal key sets that determine a column), `tree` (a forest,
and a `closure` when another relation is exactly its transitive closure), and `alias`
(a permuted copy, or a distinct projection), and lists **near misses** with the
offending facts instead of proposing them (`f_the_engine_proposes_a_forest_a_closure_and_aliases_on_all_four_corpora`;
proof fixture `rust/rofl/tests/fixtures/structures_proof.facts`, three planted
faults). A coincidence of data is proposed like any other copy: `spec_imported` and
`spec_local` differ by 4-22 rows each way and are **not** a copy
(`f_the_near_misses_of_the_structure_report_are_four_differences_and_one_fault`).
Rows the proposals would stop storing (an estimate at the mean bytes per fact, not a
before/after): mcp 495 378 (50% of the sealed world), self 714 278 (53%), cli_exits
754 365 (50%), util 1 290 706 (51%: 35% closure, 16% aliases). No engine run backs
the alias part yet.

### function

```
-- before: nothing says the scanner gives one name per node
-- after: a promise, checked after every evaluation, tick and retraction
function ast_name(N, to Name).
```

A second value for a key refuses the run: `program rejected: function ast_name: key
(n1) has two values in the book main: (bar) and (foo)` (verified). Per book. Built
(`f_a_function_is_declared_and_its_promise_is_judged_after_every_evaluation`; worlds
`ds_function_holds` and siblings): five scanner relations are declared in the model
(`ast_node`, `ast_attr`, `ast_name`, `ast_value`, `binder`). **Gain: none measurable,
and the value is the refusal.** Wall within the spread (up to 4%), RSS identical to
the MB over eight seeds, state byte-identical; the planner licence (one match per
bound key, without the counting pass) does not change the plan on a true function.
One later review measured +4.4 MB on self sealed and said so
(`f_a_refused_world_stays_refused_and_a_wall_judges_the_promise`, unexplained).
Function is plumbing: alias by projection wants `function ast_child(P, F, I, to C)`.

### tree with closure

```
-- before: two rules, 513k-888k rows
within(P, C) :- edge(P, C).
within(P, D) :- within(P, X), edge(X, D).
-- after: a declaration; closure lowers to those two rules at load
tree edge(P, C) closure within.
```

Promise: a forest, per book (`node (c) has two parents in the book main: (a) and
(b)`, or `node (a) is its own ancestor ...`). Built, by declaration, not by
recognition (`f_a_tree_is_declared_with_its_closure_and_the_closure_is_answered_from_the_tree_where_no_witness_is_kept`,
`f_the_witnessed_world_answers_a_declared_closure_from_its_tree`; worlds `ds_tree_holds`,
`ds_tree_sealed`, `ds_tree_plan`, `ds_tree_explain_kept` and siblings, with their planted faults).
Sealed or not, the closure has **no rows** unless the world has a lattice, a counting tag,
an assumption or well-founded semantics, its edges are answered on demand or concluded from
it, or (witnesses kept) a rule reads its `derived_by` rows: every premise that reads it is
answered from the forest by interval containment, the parent chain or one pre-order range,
and the planner never starts from an unbound closure premise. Where witnesses are kept a
row's one firing, its height and its `why` are built from the parent chain on demand.
Rust release, `--bytes --budget 4000000000 --space 40000000`, 3 runs, median:

| sealed | facts stored | eval ms | RSS MB |
|---|---|---|---|
| self | 1 315 105 -> 801 480 (-39.1%) | 3 255 -> 2 753 | 509 -> 476 |
| mcp | 979 700 -> 645 112 (-34.2%) | 2 412 -> 1 961 | 414 -> 378 |
| cli_exits | 1 484 841 -> 949 150 (-36.1%) | 3 651 -> 2 925 | 576 -> 534 |
| util | 2 446 459 -> 1 558 330 (-36.3%) | 6 334 -> 5 154 | 984 -> 928 |

Default mode (witnesses kept), same flags, seeds regenerated 2026-10-05, before fe3bdfc
(which stored the closure there): facts stored self 2 341 825 -> 1 828 196 (-21.9%), util
4 302 742 -> 3 414 609 (-20.6%) with the state printed, which writes the closure's
`derived_by` rows; the evaluation 15-30% shorter; the canonical state byte for byte the
stored world's on all four corpora (`docs/data-structures.md`, "Measured where witnesses
are kept").

**Caveats.** A retraction whose fact reaches the edges through the rules is a full
evaluation (the reason says so); one that does not is a delta as in any world. An addition
that reaches the edges keeps what was derived and builds the forest again. The forest is
rebuilt whole when the edge relation grows. A closure over edges answered
on demand stays rows. **A row answered from the tree costs no space and no step**, so a
world a stored closure would cut at a wall completes sealed (owner, 2026-10-05: a wall's
cut moves as the engine improves; the rows of a tree are free).

What serves the readers: 56 premises in 48 rules read `ast_within` or `ast_in`; four
operations (interval ancestry, parent chain, pre-order range, child list) serve all
and **none reads the closure with both ends free** (`f_the_readers_of_the_ancestor_relation_ask_four_operations`,
world `ast_within_readers`).

### Proposed, not built

| structure | what it would take | status |
|---|---|---|
| `alias` | a permuted copy or distinct projection stored once: `ast_in` = `ast_child` without field and position (101 157 rows on util), `ident` = `ast_name` (35 506), the tail of small copies | proposed by the report, not built; wants `function ast_child(P, F, I, to C)`. the report's list includes the `in_fn` / `eff_in_fn` twins (81 170 rows each on util) that rule s8 (3.10) has since removed from the model, so the 16% was not re-measured |
| `span`, `ordered`, `sequence`, `equivalence`, `dag` | interval index, range lookups, ordered children, union-find, reachability labels | designed in `docs/data-structures.md` (order 4-6); the report does not detect them yet |

Until `alias` lands, the cure for a copy is the rule rewrite 3.10, and the engine's
proposal is the lint's `twin_bodies` seen from the data.

## 6. Demand

### asks: the relation cone

`asks(Rel)` is a fact of the world; the kernel runs only the rules whose heads reach an
asked relation, backwards through every premise (positive, negated, inside an
aggregate); no asks means every rule (`f_asks_is_the_relation_cone_as_data_and_the_flow_component_is_suspected_of_being_modelled_to_flood`,
world `asks`, `examples/checks/asks.rofl`).

```
asks(reach).                       -- before: no asks, every rule runs
reach(X, Y) :- edge(X, Y).         -- after: only reach and edge are in the cone;
reach(X, Z) :- reach(X, Y), edge(Y, Z).   -- far, color, twins conclude nothing
```

**Symptom.** A notebook or a served world asks a handful of relations and pays for the
whole model: `rule_ms` is spread over rules no asked relation reads.

**Measured** (Rust release, `rofl load --seed SEED --bytes --budget 4e9 --space 4e7 --unsettled` (flag removed 2026-10-05), medians of two interleaved runs, load 5-8; the cone of a notebook's own
questions, the note `demand-cones.md`, `f_a_notebook_cone_is_a_third_of_the_rules_and_four_fifths_of_the_facts_and_its_answers_need_a_fifth_of_a_percent`):

| corpus | rules run | facts held | eval s default (sealed) | RSS MB default |
|---|---|---|---|---|
| self | 1252 -> 538 (43%) | 1 319 615 -> 1 119 189 (85%) | 7.5 -> 5.8 (3.3 -> 2.4) | 938 -> 794 |
| mcp | 1232 -> 438 (36%) | 980 605 -> 776 257 (79%) | 5.6 -> 3.8 (2.3 -> 1.5) | 722 -> 587 |
| cli_exits | 1219 -> 423 (35%) | 1 485 145 -> 1 185 744 (80%) | 8.2 -> 5.6 (3.5 -> 2.2) | 1048 -> 833 |
| util | 1279 -> 570 (45%) | 2 454 568 -> 2 094 904 (85%) | 15.5 -> 11.5 (6.2 -> 4.4) | 1799 -> 1521 |

So the cone is 35-45% of the rules and takes a quarter to a third off the evaluation
and a tenth to a fifth off the memory: it keeps name resolution (`ast_within` is 45% of
the cone world) and the flow. Every asking line gives the whole world's rows and the
first rows' `why` (8 + 16 + 11 + 35 questions; 200, 199, 290, 300 cone relations equal
row for row). One question at a time: a question over a base relation is 1-3 rules (mcp
`nb__advertises`: 3 rules, 15 209 steps, 0.05 s against 934 997 for the whole world); one
that reaches a call is 370-458 of 1219-1252 rules (538 491 steps, 3.8 s on mcp): **the
resolution core is the price of a call.**

**When the cone is the whole world** (it says so in the engine's diagnostics,
`asks: ...`; held by the cargo test `asks_cone`, 489 asks over 1679 relations, none
differs): a rule reads, or an ask names, a relation the kernel writes from every rule
(`shrug`, `unknown`, `hole`, `agg_cell`, `agg_member`, `lattice_member`, `dominated_by`,
`stratum`, `edb`, ...); a rule reads `derived_by` of a fact whose relation it does not
name (write `$fact(Rel, ..)` and Rel joins the cone instead); an asked relation is
answered on demand. A cone grows by `explain_request`s and by the relations a dominance
body reads. `hole` asked by name lists the holes of the rules that ran.

**Growing a cone is an addition** (`w_cmp_cone_rules_added`, section 7): an ask asserted into
an evaluated world (`Session::assert_delta`, rofl serve's `assert`) prepares the program again
and fires the rules the cone adds over the store, nothing derived cleared. Before, evaluation
cleared every derived fact: mcp 15 209 steps for the first ask then 538 491 for the second
against 538 491 from scratch; cli_exits 838 128 then 838 446, 5.4 s against 6.1. Measured
2026-10-05 on mcp, `asks(unresolved_call)` then `asks(may_not_run)` (34 rules added): 1.55 s
against 3.01 s for the world asked both from the start, the state byte-identical; most of
the 1.55 s is the preparation of the program again, which a fresh world pays too.

### The fact level: what is not built

The positive support of the answers is 0.16-0.24% of the facts (cli_exits, mcp), 1.9% of
self's; the cone is 80%. The gap is the ancestor closure (a declared tree) and the
per-node relations derived for every node. `may_be_node` is read by nothing outside the
flow book in 89-97% of its rows, and `may_be_lit` in all of them, yet the flow stays in
the cone whole because its readers do. **Magic-set rewriting did not pay**
(`f_magic_sets_over_the_flow_book_win_until_a_mirror_becomes_a_product`; JS kernel at 8-24
files, then the Rust engine at 40 files on `rust/target/fast/rofl load --seed`, the *fast*
profile, not release): full 9.97 s, relation cone alone 5.85 s, cone plus magic 15.68 s.
The flow book collapses a hundredfold (5 984 to 58 rows) and the work does not follow
past 16 files, because a generic sideways pass takes `call_site(C, _)` first and the
demand becomes a product. The relation cone is the part worth taking now; the pattern
level wants the planner's cost model, and the data walk of `datastrat.rs` is its
sideways passing (`f_the_data_walk_of_the_aggregate_area_is_the_demand_graph_a_data_cone_needs`).

### Demand relations

A rule whose head has a variable no premise binds makes its relation **answered on
demand**: a row is a call some rule made, solved top-down with the call's arguments
bound, and every relation that reads it is demand-backed too.

```
q(0). e(0, 1). e(1, 2). e(2, 3).
u(X, Y) :- q(X).          -- Y is free: u is answered on demand
h(X) :- u(X, X).          -- h reads it: on demand too, and closed
r(X) :- h(X).             -- r(0), r(1), r(2), r(3)
r(Y) :- e(X, Y), r(X).
```

**Closed: cheap.** A demand relation is closed when every answer position is ground (each
head variable there bound by a positive premise at a ground position, by `is` / `=` from
ground ones, or any position of a non-demand relation; a head *book* variable counts when
a premise at a ground book binds it) and every rule fires bottom-up. Its calls then read
the **store at every depth** and are never unfolded: every answer is stored by its own
bottom-up firing, whose news refires the readers. A 700-step chain (`demand_chain`) used
to hit the depth wall (512) and cut the world; it now gives `dc_r(700)`
(`f_a_closed_recursion_on_a_bound_argument_met_the_depth_wall`, worlds `demand_chain`,
`demand_recursion`). Make an answer position ground by a premise and the relation is closed.
The first fix measured at +1.5% user CPU on mcp sealed, inside the spread (self 8.11 -> 8.17
s, mcp 6.52 -> 6.83 s wall, `f_a_recursion_through_demand_unfolded_without_end`); the later
read-the-store-at-every-depth form was proved on worlds and not timed.

**Open: unfolded per call, to a fixpoint.** A recursive demand relation with an *open*
answer position (`d(X, _) :- u(X, X). d(Y, Z) :- d(X, Z), e(X, Y).`) is unfolded at each
call; a call met again inside its own unfolding reads the answers found so far, and the
first call unfolds again until no pass grows them: the least fixpoint, the answers of the
non-demand copy (`f_a_cycle_cut_shrugged_what_a_fixpoint_decides`, world
`demand_cycle_fixpoint`). A call unfolded to its end is tabled by its variant key where its
rules read no kernel relation or book, and the
calls of one strongly connected set iterate together (`f_a_cycle_of_open_calls_iterated_call_by_call`:
ringo400 12.9 s -> 1.3 s, the state byte-identical). The cut stays only where answers that
may still grow would decide a negation (a call met again under a negation opened inside the
cycle): a shrug with the reason `cut`, which a program the stratifier accepts does not meet
and a stratum table supplied to `--strata` can (world `demand_cycle_cut`). An open answer
still costs an unfolding per call where a closed one reads the store: **bind the answer
position where you can.**

Other demand facts: the descent is bounded by the wall `MAX_DEPTH = 512` (about 13 KiB a
level in a debug build, so a test that walks toward the wall needs a 32 MiB thread,
`f_a_debug_frame_of_the_demand_descent_is_thirteen_kib`); a declared closure over edges answered on
demand stays rows (section 5).

## 7. Adding to an evaluated world

A world that grows (a file scanned, a notebook cell's rules, an ask, a pack) is added to, not
evaluated again: `Session::assert_delta` and `Session::load_delta`, and rofl serve's `assert`
and `load` on an evaluated session (docs/aggregates.md, "Incremental addition, as built").
The answer's `full` is null where the addition was a delta and says every reason where the
world was evaluated again instead; a world not yet evaluated takes the text as before.

**Recipe.** Evaluate the world once; add to it after; read `full`. When it names a reason,
it is one of a fixed list: the world was not evaluated or was cut by a wall, a later tick,
well-founded semantics, a hole or a shrug reader, a ledger reader, a data-stratified
component, a join, widening, counting tag or dominance that the change reaches, a staged
fact two firings reach, a sealed world beyond the monotone part, or a program whose
preparation moves (a declaration, a lattice, a closure answered from its tree), or a lattice beside a relation answered on
demand. The cheap
additions are those whose change stays monotone or reaches negations: what an aggregate
reads is sealed again at its level, and that costs the aggregate's rule.

**Measured** (Rust release, the four-corpus seeds' model and facts, one file held out,
evaluated, then added; `cargo test --release --test addition -- --ignored corpus`; the state
byte-identical to the fresh world each time): mcp, 37 facts: 1.2 s against 4.6 s (x3.9);
811 facts: 2.7 s against 4.7 s (x1.7); self, 8 829 facts (6.6% of the corpus): 4.8 s against
5.9 s; cli_exits, 8 007 facts: 5.9 s against 7.4 s; self's notebook rules (7) added to self:
2.7 s against 6.2 s. Where the rest goes: the two aggregates of the flow model (`may_be_node`,
`may_be_lit`) sealed again whole, the rules whose news reaches a premise no delta plan starts
from fired whole once per level, and the program prepared again for rules.

## 8. What not to do

Each is an anti-pattern with the finding that found it.

- **Reorder premises on a signature.** Five reorders on one principle ("lead with the
  literal that binds") spanned 120 points: -56.5%, -23.3%, -11.5%, 0.02%, and +65% worse
  (TypeScript join width, September; `f_five_reorders_one_principle_and_the_outcomes_span_a_hundred_and_twenty_points`).
  The signature names a candidate, never a cause; a reorder is a hypothesis that costs
  one run. On Rust, after delta-first, the reorders s1-s3 were worth nothing (3.1-3.3).
- **Believe a cost model validated on the cases it was tuned on.** A subset-DP planner
  with perfect statistics got five of five measured reorders right and was wrong on both
  it proposed (-0.32% against a predicted 19.3x; 4.3x *more* expensive against a predicted
  4.43x better): a join's probe values are correlated with the tail of the distribution
  it probes (`f_a_cost_model_can_be_five_for_five_backwards_and_wrong_forwards`,
  `f_a_cardinality_estimate_is_exact_where_there_is_no_cost`: positions bound from one
  earlier premise are 88.1% of the width, median error 13.6x). The delta-first planner
  uses averages and says so (carve-outs, 3.0).
- **Write a walk for one reader**, or enter a closure from the filtered end when another
  reader pays the index: the cost moves (3.12, 3.13).
- **Add a helper without counting the round it adds** (3.7), or a count aggregate where a
  negation was a key lookup (3.13).
- **Read `rule_ms` alone, a wall time from a loaded machine, or a state-printing run as
  a provenance-on-demand measurement** (section 1, section 2).
- **Measure the seal by declaring `sealed(provenance)`**: the `--no-provenance` flag (removed 2026-10-05) understated it before 2026-10-04.
- **Compare a sealed and an unsealed world under a budget it can reach** (section 2).
- **Lead a body with an unbound provenance premise.** Four audit rules that each led with
  `asserted_by` unbound were 100% of an AST index's evaluation (16 eslint files: 125 263
  peak rows and 1 219 ms against 140 rows and 0 ms with the four removed; the kernel, a
  September measurement, `f_four_rules_that_never_fire_are_the_entire_cost_of_an_index`).
  `w(F) :- derived_by(F, _, _).` loaded beside boot.rofl diverges and the budget does not
  stop it (`f_a_rule_that_reads_provenance_with_a_free_variable_never_terminates`, recorded
  2026-09-06; no later note in the ledger).
- **Rely on where a wall cuts.** A wall's cut moves as the engine improves: a plan does
  more for the same budget, and a row answered from a tree costs no space and no step
  (3.0, section 5). A world whose meaning is the stop by budget lowers its budget.
- **Declare a structure because the data happens to satisfy it.** The engine proposes
  coincidences (`spec_imported`, `spec_local`) as readily as copies; only the author
  knows whether every future fact keeps the promise.
- **Take a shape hit as a fault.** 59 hits remain in the model, all excused by a register
  row with a measurement; one letter apart, the same rule cost 7.5% and 0.2% (3.13).
- **Query the state without the cone's conditions**: one rule that reads `shrug`, `hole`,
  an unbound `derived_by` or a demand relation makes `asks` the whole world (section 6).
