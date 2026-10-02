# Linter — a smell is a count, and a count is a rule

`npm run lint -- rules/js-dataflow.rofl` says which relations are probably
tables (five or more rules conclude one), which pairs of relations are read
together by five or more rules, which bodies have seven or more conditions,
and a few kinds of repetition (several routes under one name, twin bodies,
mirror heads). It used to say it by projecting the reflection of the rule
file and folding the counting semiring over the support the store had
recorded, because the kernel could not count. Now it is `linter.rofl`:

```
lint_bodies(Rel, N)  :- N is count(R : concludes(R, Rel)).
probably_a_table(Rel, N) :- lint_min(table, M), lint_bodies(Rel, N), N >= M, not foreign_head(Rel).
```

The thresholds are facts (`lint_min`), so a threshold is a row and not a
constant in a script. `scripts/lint.ts` is a loader and a printer.

## What it reads

The reflection a load writes about the rules (`concludes`, `premise_pos`,
`premise_neg`, `has_premise`). It is base and complete before anything fires,
so a count over it is sealed and sound; an aggregate over what the kernel
writes WHILE it evaluates (`derived_by`, `hole`, the cells) is refused
(f_aggregates_over_live_kernel_relations_are_refused). So the demo needs no
census of the rules as facts: the rules of the target file are loaded and
counted as they stand. What the host still feeds are the heads boot.rofl
concludes (`foreign_head`), because the reflection does not say which file a
rule came from; the linter's own heads are listed beside the thresholds.

The counts are of distinct rules, one per (rule, relation), which is what the
fold of the counting semiring counted by the construction of its projections,
and what `count` counts by definition. Nothing in the result depends on
having an order on atoms, which the kernel does not have and the old
projections spelled as permutations.

## The findings

| finding | rule | threshold |
|---|---|---|
| `probably_a_table(Rel, N)` | N rules conclude Rel | 5 |
| `probably_needs_a_name(A, B, N)` | N rules read A and B | 5 |
| `probably_hides_a_concept(R, Rel, N)` | rule R of Rel has N premises | 7 |
| `probably_several_routes(H, N)` | a table whose bodies share no derived relation | 5 |
| `probably_one_rule_with_an_or(H)` | two bodies, same relations, same polarity | |
| `probably_a_pair_or_a_case_table(H1, H2)` | bodies equal but for the heads | |

A pair and a mirror are symmetric rows (both orders are concluded, the host
prints one): ROFL has no `<` on atoms, so the rules do not pick an order.

## Ranks

`rank` gives a place among the distinct values, so ties share one and the next
place is the next value, not the next count. `lint_table_place` ranks the tables
by bodies, `lint_long_place` the long bodies by premises, and `lint_ways(Rel, N)`
counts in how many of the kinds a head is named, with `lint_place` its place by
that. Over js-dataflow: `may_be_node` is first (a table, routes, twins, mirrors
and three long bodies, five ways), then `may_be_lit` and `member_value` (four).

## The world

`agg_linter_demo` loads `linter.rofl` with two rule files to read:

- `corpus-dataflow.rofl`, a frozen copy of `rules/js-dataflow.rofl` (4f997a6),
  so that an edit to the model does not move the answers;
- `corpus-fixture.rofl`, rules that sit on every threshold: 4 and 5 bodies,
  a pair read by 4 rules and one by 5, a body of 6 premises and one of 7, a
  relation read and never concluded, a table of five routes beside one of four,
  twins, a mirror.

`corpus-boot-heads.rofl` is `npm run lint -- --boot-heads`, frozen.

The answers the old `scripts/lint.ts` printed over the frozen copy are rows in
`examples/checks/agg-linter-demo-check.rofl` (`lw_`), and the new rules must
conclude exactly them: 7 tables, 31 pairs, 13 long bodies, 7 routes, 7 twins,
20 mirrors, none missing and none extra. The fixture is held by hand (`lx_`).
`why all` of `probably_a_table(binds_name, 5)` names the five rules.

An empty group, in both of its readings: grouped by the relation, a relation
nothing concludes has no row (`fx_ghost`, so no relation has `0` bodies);
asked per relation bound before, it reads 0.

The mutants (`scripts/agg_mutants.ts`) edit the rules, the fixture or the check
and each turns a named alarm red: a threshold on either side of the edge (4
and 6 around 5), the wrong thing counted (premise indices for rules), an empty
group read as 0, a rank that is not dense, an asymmetric pair. The engine's
own faults `mono` and `empty_none` (`npm run test:agg:breaks`) turn the world
red too.

Run it: `npm test -- --world agg_linter_demo`. The ledger cell is `count` of
`demo` (`facts/agg.rofl`, `w_agg_demo_linter`).
