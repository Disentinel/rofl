---
name: refine-plan
description: Plan the join orders of a ROFL world from its own profile and judge the plan by measurement (ask, reflect, refine, ask). Use when a rule is slow, `hot:` names it on stderr, a world's evaluation grew with its size more than its answers did, or before shipping a model whose rules join three or more relations.
---

# Refine the plan of a world

The engine orders a rule's premises greedily (fewest matches next). That is right on chains and stars and wrong where a
cheap cross product multiplies the partial solutions early. The loop below finds the order by a global minimum over the
profile the engine itself writes, hands it to the engine as facts, and measures whether it helped. Nothing is trusted
unmeasured: the forecast and the width after are in the same report, in the same unit.

## The loop, one command

    npm run refine -- <world files> --out plan.rofl

1. **ask**: the world as it is, with a meter beside it: for every rule, the order it was solved in (`order[profile]`)
   and its width (the partial solutions its premises were solved from, summed: `width_at[profile]`, by the news position the plan is for).
2. **reflect**: the world beside `models/engine/profile.rofl` and `models/engine/plan.rofl`, in a world of its own,
   concludes `plan[fixpointplan](R, At, Order)` and `plan_cost[fixpointplan](R, At, C)`, the width each forecasts.
3. **refine**: the plan facts are written to `plan.rofl`. They are part of the model from now on: load the file with
   the world (`rofl ask L world/*.rofl plan.rofl`, or list it in the world's `check_file` rows), commit it beside the
   rules, and the engine obeys it (docs/cli.md, *The plan as facts*).
4. **ask** again: the width under the facts.

The report, on stderr, one line per planned rule:

    rule  at    before  forecast     after  order (was)
    out    0      1001       210       210  2 4 3 1 (2 1 3 4)  better

## Reading the report

- `after` equals `forecast`: the estimate was exact here. The common case on small, regular data.
- `after` below `before`, `better`: keep the facts.
- `after` above `before`, `worse`: the estimate's hypothesis is false for that rule. Do not drop the row quietly and do
  not keep the fact: delete that rule's line from `plan.rofl` (the engine falls back to its greedy order), and record
  what the data looked like in the ledger (`facts/findings.rofl`): the pack is a hypothesis and this is its
  counterexample. The usual cause is a join whose columns are correlated (the independence estimate divides too much).
- The facts the loop writes are already the kept ones: only a rule whose measured width fell gets its plan fact; `worse` and unchanged rows stay in the report. Known as of 2026-11-01: over the JS model (vscode mini) the independence estimate loses to the greedy order on most rules the data's functional dependencies touch (f_the_join_order_is_a_fact_the_engine_obeys), so the kept set there is small (30 of 1 438) and the report is the finding.
- `after` far below `forecast` is a loose bound, harmless; `after` far above `forecast` with `better` still is the
  estimate wrong but the order right by luck; say so in the finding.
- A rule missing from the report has one premise, or a negation, builtin or aggregate among its premises (not
  planned), or more than eight premises (split it), or is a pack's own.

## When the plan is stale

A plan fact is checked by the engine for shape only (every premise once, the news first, walls where they were). It is
not checked for being a good one: data that changes shape (a relation that was a key and is not any more) makes a plan
stale. Run the loop again after such a change, and in CI where a world's size is pinned. `rofl load --ticks` worlds
and worlds with a lattice are solved in written order and read no plan.

## What not to do

- Do not edit `plan.rofl` by hand to a guess. Every fact in it is to come from the loop or from a measurement.
- Do not put the packs in the world they plan: the lattice would hold every rule of it in written order.
- Do not take `before` from one machine and `after` from another: widths are deterministic, but a different data set
  is a different world.
