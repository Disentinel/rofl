# The join planner, and the half of it that was measured wrong

`w_join_planner`, 2026-09-09. The item's sentence: *order body literals by
boundness at match time — cost is currently a property of how a human typed the
rule.*

Two planners were built. The first is the one the item asks for, in its
strongest form, and it is **not** what shipped. The second is a third of it and
is what shipped, and the reason is the first one's own measurement.

---

## 1. The strongest planner, and why it is not in the tree

The engine reads a body left to right, so the price of a rule is the sum of its
intermediate result sizes. Minimising that sum over every legal order is a
solved problem: a subset DP over the body, `best[S] = size(S) + min_{L in S}
best[S \ {L}]`, with `size(S)` the standard independence-assumption join size —
the product of the literals' cardinalities divided by each shared variable's
domain, once per extra occurrence. Bodies here are small (the longest in the JS
packs is nine elements), so the DP is exact rather than greedy.

It was fed **perfect statistics**: every relation's cardinality and per-argument
distinct-value counts, read off a **finished** 434 149-fact store — information
no planner running before the fixpoint could ever have. This is the ceiling. If
the ceiling cannot tell the good reorders from the bad ones, nothing below it
can.

### It cleared the bar the brief set

Five body reorders had been measured by hand on 2026-09-05 and 2026-09-09, all
argued from the same principle (*lead with the literal that binds*), with wildly
different outcomes. Scored against them, from the same statistics, in one run:

| case | what a human measured | what the cost planner says |
|---|---|---|
| `has_return` (pre-repair) | repairing it was worth a lot | **reorders it to exactly the hand repair**, 37.4x |
| `encloses_s` (pre-repair) | −11.5% when repaired | **reorders it to exactly the hand repair**, 1.73x |
| `param_hidden` arm 2 (pre-repair) | −56.5% when repaired | **reorders it**, 6.15x |
| `tdz_deferred` | the same-signature swap was worth 0.02% | **keeps the written order**; rates the swap at 1.01x |
| `closer_v` | the reorder was +65%, reverted by hand | **keeps the written order**; rates the reverted variant 40.6x worse |

Five for five, including the two a boundness heuristic gets wrong. `closer_v` is
the decisive one: both of its positions join on `X`, so counting bound arguments
cannot separate them, and the cardinality model can.

### And every one of the five is a retrodiction

The model proposed two orders **nobody had measured**, both for `param_hidden`,
both claiming large wins. Both were built and measured on the control-flow
world (rows handed out, the quantity `test/js-fixpoint-cost.test.ts` counts):

| proposal | predicted | measured |
|---|---|---|
| `param_hidden` arm 1 | 19.3x cheaper | **−0.32%** |
| `param_hidden` arm 2 | 4.43x cheaper | **+326%** — 3 521 279 rows to 15 015 237 |

Nought for two, and the failure is in the dangerous direction.

### The mechanism, measured rather than guessed

The estimate for `ident[code](U, Name)` with `Name` bound is the **mean rows per
name**:

```
|ident| 2439 over 553 distinct names      mean 4.41   median 2   p90 4   max 758
```

The join that reaches that literal has bound `Name` from `param_of`, so the
names it asks about are **parameter** names — 29 of the 553:

```
mean rows per parameter name                                    31.62
rows ident hands out per param_of row (the join's own weighting) 647.99
                                                        under-estimate 147x
```

and the whole of it is one parameter called `n`, whose spelling occurs **758**
times against a median of 2.

**A join's probe values are correlated with the tail of the distribution it
probes.** A per-relation average cannot see the correlation; the histogram that
could is per-*join*, not per-relation. Better per-relation statistics do not fix
this, and the statistics here were already perfect.

There is a second, independent cause in the −0.32% case: the model prices **one**
evaluation of the body from an empty binding, and this engine is **seminaive**.
A predicted saving of 2.23 million rows was worth 11 397.

### The transferable sentence

`rules/js-dataflow.rofl` already carries *the signature names a CANDIDATE, never
a cause*, written about a **structural** signature. This is the same sentence one
level up, about a **numeric** one: **a model validated on the cases it was tuned
against is not validated.** Both are retrodictions until something unmeasured is
predicted.

---

## 2. The planner that shipped: no statistics at all

Ask what the three real repairs had that the two non-repairs did not, and the
answer has no numbers in it.

`has_return`, `encloses_s` and `param_hidden` arm 2 each had a positive literal
**sharing no variable with any literal before it** — a cross product at that
position, whose fan-out is its whole relation and is multiplied by everything
already accumulated. `closer_v` in both spellings, and both of the cost model's
own proposals, are **connected throughout** — and every one of those is a case
where reordering was measured worse or worthless.

So the class that is safe to move is the class that needs no statistics to see,
and the class that needs statistics is the class where statistics were measured
wrong.

`planBody` now holds a cross-product literal until something before it binds one
of its variables. Nothing else moves. **The barrier is the whole correctness
argument and it is one line**: a negation or a builtin drains everything held
ahead of itself, so a positive can never overtake a `not` or an `is` — which is
the risk `w_join_planner` names in its own statement.

Every prefix of the planned order is no wider than the same prefix of the
written one, so it cannot make a body dearer — with one named exception: if the
held relation is **empty**, the written order short-circuits at it and the
planned order evaluates the literals in between first. An empty relation makes
the rule derive nothing either way.

### What it does to the five (plus a sixth)

Control-flow world, rows handed out, corpus and packs identical throughout. All
199 959 program facts, 177 218 firings and 434 149 facts are **byte-identical**
in every row of both columns.

| rule under test | planner OFF | planner ON |
|---|---|---|
| **HEAD** | 3 521 279 | **3 353 932** (−4.75%) |
| `has_return` → pre-repair order | +66.62% | **+1.52%** |
| `encloses_s` → pre-repair order | +37.27% | **0.00%** |
| `param_hidden` arm 2 → pre-repair order | +119.87% | **0.00%** |
| `tdz_deferred` → the rejected swap | −0.04% | **0.00%** |
| `closer_v` → the +65% reorder | +111.66% | +117.23% *(untouched)* |
| cost model's arm-1 proposal | −0.32% | −0.34% *(untouched)* |
| cost model's arm-2 proposal | +326.41% | +342.70% *(untouched)* |
| `completion_fn_between` → cross-product shape | +5.60% | **0.00%** |

The last row is a **sixth case with an independent origin**: the same defect was
recorded the same day by another session as
`f_a_derived_pair_costs_what_its_first_unbound_literal_costs` — one rule of the
completion closure at thirteen seconds of a twenty-two second world, because
`fn_node_v(G)` stood where `G` was unbound. It was repaired by making the rule's
*head* smaller; permuting the repaired rule back into the cross-product shape is
answer-preserving and the planner takes it straight back out.

Four bodies whose written order **stopped being a cost decision at all**.
`has_return` is the honest partial: holding the kind scan until the return
statement binds it is a good order and leading with it is a better one, and
choosing between two good orders is exactly the half that needs a cost model.

### And the saving has a name

The −4.75% is not spread thinly. Comparing the two tallies path by path, one
name carries two thirds of it — and it is the path both cost gates were written
to watch:

```
argMatches ast_node pos=[1]     152 511  ->  40 929     -73%
                                 (67% of the whole 167 347-row saving)
```

That is the KIND SCAN: `ast_node[code](N, some_kind, _, _)` with the node
unbound, which `f_the_layer_no_gate_watched_is_half_the_cost_of_its_own_world`
named as the single heaviest read path in the tree before `has_return` was
repaired by hand. What is left of it at HEAD is what the planner takes out,
without anybody reading a rule.

### The space wall

`DEFAULT_SPACE` is 500 000 rows and the merged control-flow world holds 434 149
facts, so a planner that widened any accumulator would hit
`$rule(...)/space_exhausted` rather than produce a number. Measured on that
world, both ways: **peak rows 49 338 with the hold and 49 338 without it** —
9.9% of the wall, and not moved by a row. That is the expected shape rather than
a surprise: holding a cross product removes a multiplication from every prefix
before its new position, so no accumulator can be wider than it was.

### And the other instrument

`test/js-fixpoint-cost.test.ts`'s world — the call graph, four packs, same
corpus — moves the same way: **3 244 319 → 3 090 542 rows, −4.74%**, with
163 423 firings, 403 379 facts and 185 999 program facts identical and the same
digest. Two worlds, two instruments, the same 4.7%.

`closer_v` is the blind spot, stated as an assertion in
`test/join-planner.test.ts` rather than as a sentence, and entered in the queue
as `w_connected_and_badly_ordered`.

### And it moves no rule text

The hand repairs of 2026-09-09 killed four mutants anchored to the text of
bodies they reordered, without changing an answer. This reorder happens at
`classify` time, on the parsed clause, so **not one character of any `.rofl`
file moves** and no text-anchored mutant expires. Rule ids, canonical text and
the reflection are all keyed on the written order and are untouched.

---

## 3. Two things the ledger learned in passing

**A mutant anchored to an item's STATE expires when the item is done.** Mutant 7
in `test/worklist.test.ts` plants a `work_needs` cycle between two items and
checks both vanish from the queue, with a positive control that both are
takeable on the honest tree. The two were typed out by name and one of them was
`w_join_planner` — so closing this item made the mutant's own control false, and
nothing about cycles moved. The pair is read off `takeable(W)` now. This is the
same sentence the loop already writes about a mutant anchored to a rule's
*text*, arriving through the ledger.

**`0 bodies actually reorder` is retired.**
`f_the_plan_is_expressible_and_the_corpus_says_almost_nothing_about_it` measured
that over the whole corpus and drew the right conclusion: a corpus in which the
plan never moves is two instruments returning their input, so the acceptance had
to be a mutant set in which the plan MOVES. It moves now — **49 of 1 885**
multi-element bodies over 93 `.rofl` files — and that mutant set is
`test/join-planner.test.ts`.


---

## 4. What the two cost gates now say, and one mutant they lose

Both gates are left with their pins as they were — the integrator moves them
once — so the numbers below are what a run reports, not what the files claim.

`test/js-fixpoint-cost.test.ts` (call-graph world, four packs):

```
rows handed out   3 253 649  ->  3 099 872        facts 403 379, firings 163 423 unchanged
read paths >5%    gains `relPersp ast_node`       (the denominator fell, the path did not grow)
```

`test/js-layer-cost.test.ts`:

```
line 403  control-flow world total    3 521 279 -> 3 353 932
line 462  layer path share            relPersp completion_known 22.141% -> 23.400%
line 521  era world total                87 194 ->    84 901
line 553  era layer path set          loses `relPersp env_lang`
line 629  MUTANT B                    see below
```

**MUTANT B is the one worth a decision.** It re-plants the pre-repair order of
`has_return` and asserts the gate catches the regression **four ways**. With the
hold in, it is caught **one**:

| criterion | needs | gets |
|---|---|---|
| world total | ×1.25 | ×1.015 (3 404 842 against 3 353 932) |
| row-share band | 1.5 pp | 1.389 pp (8.503% against 7.114%) |
| rows per derivation | 5 | 4.50 (25.63 against 21.13) |
| the path set | differs | **differs** — still kills |

Nothing is wrong with the gate. The thing the mutant was watching for has
stopped being a regression, which is the outcome the work wanted. That file's
own comment already says *a mutant anchored to the defect expires when the
defect is fixed*, about the anchor text going missing; this is the same sentence
about the defect itself. **What it should now plant is a defect the planner
cannot absorb**, and the queue names the class: `w_connected_and_badly_ordered`,
whose measured instance is `closer_v` at +117% of the same world.

Three anchors, three ways to expire, all seen in one week: a rule's **text**, an
item's **state**, and a **defect class**.


---

## 5. The other session's group-by, re-measured here

Handed over while this was being written: over 16 files of `eslint/lib`, a
position-0 premise's observed cost equals a **static count conditioned on its
written argument pattern** — 68.8% exactly for non-recursive premises, 28.9% for
recursive ones, against a **23.1% shuffled control**. For `ast_node`, 27 of 28
observed costs are the group-by-kind count to the unit.

**The half that transfers, transfers cleanly.** Re-measured on this corpus, the
conditioned count separates the two rules whose text is identical and whose cost
is 200x apart:

```
encloses_v[flow](F, X)   5 815 rows        <- what closer_v seeds from
encloses_s[code](R, D)     133 rows        <- what closer_s seeds from
```

44x, invisible to any property of the rule text, and one group-by away. The
quantity is right and it is cheap. The cost model in §1 already used exactly it —
per-relation cardinality with constants taken from the store's own buckets — and
that is why it was five for five.

**What does not follow is the ordering policy**, and the counterexample is the
case this item exists for:

```
fn_node[code](F)                              395
ast_node[code](R, return_statement, _, _)     400
```

`has_return`'s repair is worth −23.3% of a world and it **leads with the larger**.
A rule that seeds with the cheapest conditioned count picks `fn_node` — which is
the written order — and makes no repair at all; on a corpus where the two numbers
landed the other way round it would make the repair on a **1.3% gap**, which is a
coin flip wearing a measurement's face.

The difference is what the estimate is estimating. Their number is the accuracy
of a cost estimate for **one premise**; an ordering policy is a claim about a
**whole body**. What decides `has_return` is neither seed's size but the
**direction of the second literal**: `ast_within(F, R)` with `R` bound walks a
node's ancestors, a chain of about eight, and with `F` bound walks a function's
descendants.

### Three limits, and they do not overlap

| a conditioned count is | when |
|---|---|
| **exact** | the condition is a CONSTANT — their 68.8% |
| **useless** | the condition is a JOIN VARIABLE — this session's 147x on `ident` |
| **the wrong instant** | the relation is RECURSIVE — their 28.9%, at chance |

Their remedy for the third — a cost model that **is** a fixpoint over
cardinalities, the engine's own shape over a counting semiring rather than a
product over final ones — is the right shape and it is a kernel-sized piece of
work.

**None of the three touches what shipped.** The cross-product hold reads no count
of any kind, so it is below all three limits by construction. And
`w_connected_and_badly_ordered` is where the group-by belongs — with the caveat
this section is: the count that decides such a body is the one on the **join**,
not the one on the seed.
