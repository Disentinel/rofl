---
world: safety
books: main
default: main
---

# safety

> safety.rofl -- WHAT THE KERNEL KNOWS ABOUT A PROGRAM'S RULES, as rules.
> 
> It opens with RANGE RESTRICTION, which is the judgement everything after it
> rests on: `Evaluation.classify` decides, for every rule, whether the body
> binds everything the head names -- a left-to-right fold over the body
> tracking bound variables. That is the first half of this file. The second
> half is what the kernel then computes FROM that verdict: which rules may not
> run before the program is judged, which relations are demand-backed, what a
> premise can trigger, what is negated anywhere, and who reads provenance.
> 
> TWO INPUTS THE REFLECTION DOES NOT CARRY FLAT, seeded by the host the way
> `opaque_seed` is:
> 
>   premise_var(R, K, Slot, I, Name)  the I'th variable of a slot, in order
>   slot_arity(R, K, Slot, N)         how many variables that slot has
> 
> with Slot one of `pos` (a positive premise: its arguments and its
> perspective), `left` and `right` (the two operands of a builtin) or `head`,
> and K the premise's position, 1-based, 0 for the head. Walking a term is
> mechanism -- a term carries an arbitrary functor and Datalog cannot
> destructure one it does not name -- and the walk decides nothing.
> 
> WHAT IT DOES NOT MODEL, named rather than discovered: the host also refuses a
> body whose negation cannot be ordered (`planBody(...).stuck`). Measured over
> 3555 rules of the corpus that case never arises, because the load door
> refuses such a clause; a store hand-edited to carry one would disagree.
> 
> NO NEGATION STANDS INSIDE THE FOLD. "every variable of this operand is
> already bound" is the one universal the analysis needs, and it is stated
> POSITIVELY by walking the operand's variables by index: `ground_upto` reaches
> the slot's arity only when every step of the walk found its variable bound.
> That keeps the program stratified, so the default evaluator answers it — the
> first version asked the same question with `not unbound(...)` inside a cycle
> and needed the alternating fixpoint, which cost 2443 ms on the grammar
> against 107 ms for boot.rofl.

Reads:

- from outside these files:
  - <a id="concludes"></a>A rule concludes a relation (`concludes`)
  - <a id="conclusion_tense"></a>A rule concludes at a tense (`conclusion_tense`)
  - <a id="has_premise"></a>A rule has a premise at a position (`has_premise`)
  - <a id="premise_lit"></a>The premise at a position of a rule is a literal (`premise_lit`)
  - <a id="premise_neg"></a>A rule negates a relation (`premise_neg`)
  - <a id="premise_pos"></a>A rule reads a relation (`premise_pos`)
  - <a id="reserved"></a>A relation is reserved (`reserved`)

## Words

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="analysed"></a>A rule is analysed if some number [is the variable count of the](#slot_arity) `head` at 0 of it.
- <a id="binds"></a>A rule binds a variable V if [the premise at](#binds_at) some position of it binds V.
- <a id="op_used"></a>An operator is used if [the premise at](#premise_lit) some position of some rule is $builtin(it, something).

Declared as facts:

- <a id="premise_var"></a>`premise_var` — no rows: declared so a rule may read it
- <a id="slot_arity"></a>`slot_arity` — no rows: declared so a rule may read it

> THE SLOTS A GROUNDNESS QUESTION IS ASKED ABOUT, read off the premise's shape
> rather than off its variables: an operand with no variable at all is ground,
> and `premise_var` leaves it no row to say so. Only the two operands of a
> builtin are ever asked -- a positive premise BINDS, it is not tested -- and
> deleting a `slot(R, K, pos)` clause changed no answer on any mutant, which
> is how that clause was found to be dead and removed.

<a id="slot"></a>A rule R asks about the N at a position K either:

1. if [the premise at](#premise_lit) K of R is $builtin(something, something) and N is `left`;
2. if [the premise at](#premise_lit) K of R is $builtin(something, something) and N is `right`.

> THE FOLD. What a premise binds, and what stands bound before a position.

<a id="binds_at"></a>The premise at a position K of a rule R binds a variable V either:

1. if V [stands at](#premise_var) some index in the `pos` at K of R;
2. if all of:
   - [the premise at](#premise_lit) K of R is $builtin("is", something) or $builtin("=", something);
   - the `right` at K of R [is ground](#ground);
   - V [stands at](#premise_var) some index in the `left` at K of R;
3. if all of:
   - [the premise at](#premise_lit) K of R is $builtin("=", something);
   - the `left` at K of R [is ground](#ground);
   - V [stands at](#premise_var) some index in the `right` at K of R.

<a id="bound_before"></a>A variable V is bound before a position K in a rule R either:

1. if all of:
   - [the premise at](#binds_at) a position J of R binds V;
   - K is J + 1;
   - R [has a premise at](#has_premise) K;
2. if all of:
   - V [is bound before](#bound_before) a position J in R;
   - K is J + 1;
   - R [has a premise at](#has_premise) K.

<a id="ground_upto"></a>The S at a position K of a rule R is bound up to an index N either:

1. if R [asks about the](#slot) S at K and N is 0;
2. if all of:
   - the S at K of R [is bound up to](#ground_upto) an index J;
   - N is J + 1;
   - a variable V [stands at](#premise_var) N in the S at K of R;
   - V [is bound before](#bound_before) K in R.

<a id="ground"></a>The S at a position K of a rule R is ground if the S at K of R [is bound up to](#ground_upto) an index N and N [is the variable count of the](#slot_arity) S at K of R.

> THE VERDICT, one clause per way a body can fail to restrict its head.
> Guarded by `analysed`: the store holds the reflection OF THIS PROGRAM as
> well, and a rule the seed never described has no slot arities to reach.

<a id="eq_or_is"></a>`eq_or_is` includes "=", "is".

<a id="cmp_op"></a>An operator compares if it [is used](#op_used), unless it [binds](#eq_or_is).

<a id="unsafe_rule"></a>A rule R is unsafe either:

1. if a variable V [stands at](#premise_var) some index in the `head` at 0 of R, unless R [binds](#binds) V;
2. if all of:
   - R [is analysed](#analysed);
   - [the premise at](#premise_lit) a position K of R is $builtin("is", something);
   - unless the `right` at K of R [is ground](#ground);
3. if all of:
   - R [is analysed](#analysed);
   - [the premise at](#premise_lit) a position K of R is $builtin("=", something);
   - unless the `left` at K of R [is ground](#ground);
   - unless the `right` at K of R [is ground](#ground);
4. if all of:
   - R [is analysed](#analysed);
   - [the premise at](#premise_lit) a position K of R is $builtin(an operator Op, something);
   - Op [compares](#cmp_op);
   - unless the `left` or `right` at K of R [is ground](#ground).

> ---------------------------------------------------------------------------
> WHAT RESTS ON THE VERDICT.
> 
> Everything below reads `unsafe_rule`, and every one of them was a fold, a
> `for(;;)` or a memoised recursion in src/engine.ts. They are not new: they
> are stated in rules/kernel-policy.rofl, where they were measured against the
> host rule for rule by scanners/policy_ladder.ts, which carries a `--break`
> control so the comparison is known to be capable of moving. The one
> difference is that `unsafe` was an INJECTED INPUT there and is derived here.
> 
> EVERY CLAUSE IS GUARDED BY `analysed`, because this store also holds the
> reflection of THIS program. The seed exists for exactly the rules the kernel
> asked about, so `slot_arity(R, 0, head, _)` is an exact membership test, and
> the guard reaches the rest through `executable`.

A rule

- <a id="blocked_head"></a>has a blocked head if all of:
  - it [is analysed](#analysed);
  - it [concludes](#concludes) a relation Rel;
  - Rel [is reserved](#reserved).
- <a id="executable"></a>may run if it [is analysed](#analysed), unless it [has a blocked head](#blocked_head).
- <a id="has_neg_rule"></a>has a negation if it [is analysed](#analysed) and it [negates](#premise_neg) some relation.
- <a id="mono_rule"></a>is monotone if it [may run](#executable) and it neither [has a negation](#has_neg_rule) nor [is unsafe](#unsafe_rule).

> THE STRATUM CONE: the monotone rules that may not run before the program is
> judged -- the ones concluding the stratum table, and anything reading what
> they conclude. `stratum` is named as a constant because it is the one table
> the kernel schedules by.

<a id="stratum_cone"></a>`stratum_cone` includes `stratum`.

A relation is in the stratum cone if all of:
  - a rule R [concludes](#concludes) it;
  - R [is monotone](#mono_rule);
  - R [reads](#premise_pos) a relation Q;
  - Q [is in the stratum cone](#stratum_cone).

<a id="late_rule"></a>A rule runs late if all of:
  - it [concludes](#concludes) a relation Rel;
  - it [is monotone](#mono_rule);
  - Rel [is in the stratum cone](#stratum_cone).

> THE DEMAND-BACKED SET: a relation is unfolded at call sites when a rule
> defining it in the present tense is not range-restricted, or when it reads
> one that is. A `@next` head never unfolds -- it stages instead of matching.

<a id="demand_rel"></a>A relation Rel is answered on demand either:

1. if all of:
   - a rule R [concludes](#concludes) Rel;
   - R [concludes at](#conclusion_tense) `now`;
   - R [may run](#executable);
   - R [is unsafe](#unsafe_rule);
2. if all of:
   - a rule R [concludes](#concludes) Rel;
   - R [concludes at](#conclusion_tense) `now`;
   - R [may run](#executable);
   - R [reads](#premise_pos) a relation Q;
   - Q [is answered on demand](#demand_rel).

> WHAT A POSITIVE PREMISE CAN TRIGGER: itself, and -- when it is demand-backed
> -- whatever the rules defining it read, transitively. The host computed this
> with a memoised recursion carrying a `seen` set, which stops at a cycle
> rather than closing over it; this is the closure, and where the two differ
> the difference is measured rather than assumed.

<a id="trigger_of"></a>A relation P can trigger a relation N either:

1. if a rule R [is analysed](#analysed), R [reads](#premise_pos) P, and N is P;
2. if all of:
   - P [is answered on demand](#demand_rel);
   - a rule R [concludes](#concludes) P;
   - R [concludes at](#conclusion_tense) `now`;
   - R [may run](#executable);
   - R [reads](#premise_pos) a relation Q;
   - Q [can trigger](#trigger_of) N.

> THE RELATIONS SOME RULE NEGATES, and WHICH RULES READ PROVENANCE. Two flat
> questions the host answered with a nested loop over every body.

<a id="neg_relation"></a>A relation is negated somewhere if a rule R [is analysed](#analysed) and R [negates](#premise_neg) it.

<a id="provenance_reader"></a>A rule R reads provenance either:

1. if R [is analysed](#analysed) and R [reads](#premise_pos) `derived_by`;
2. if R [is analysed](#analysed) and R [negates](#premise_neg) `derived_by`.

> ---------------------------------------------------------------------------
> THIS PROGRAM'S OWN SCHEDULE, declared as facts.
> 
> MEASURED 2026-09-06 AND IT WAS A LIVE DEFECT. The kernel evaluates its own
> program in a store of its own, and that store holds no `stratum` table --
> so the evaluator ran EVERY negation in one final pass, which is exactly the
> failure `examples/wtf` was written to demonstrate. Compared against the
> round evaluator, which peels its schedule off the rules instead of reading a
> table, the two disagreed on 3 of 65 corpus programs, and the relation that
> moved was `mono_rule` -- which feeds the stratum cone the kernel then acts
> on. Nothing downstream had visibly changed answer yet; the answer was
> schedule-dependent, which is enough.
> 
> `stratum/1` is read by the kernel and written by the PROGRAM (README, the
> stratification interface), so a program declaring its own is the documented
> arrangement rather than a workaround. The numbers are the ROUNDS
> `peelRounds` takes off these rules, which is coarser than a negation-only
> stratification and valid for the same reason: a phase runs only when every
> phase below it has reached fixpoint. The gate in
> test/kernel-policy-program.test.ts re-peels and compares, so this table
> cannot go stale behind a new clause.

<a id="stratum"></a>`stratum` lists:

| relation | number |
|---|---|
| `analysed` | 1 |
| `slot` | 1 |
| `binds_at` | 1 |
| `bound_before` | 1 |
| `ground_upto` | 1 |
| `ground` | 1 |
| `binds` | 1 |
| `op_used` | 1 |
| `cmp_op` | 1 |
| `blocked_head` | 1 |
| `has_neg_rule` | 1 |
| `neg_relation` | 1 |
| `provenance_reader` | 1 |
| `unsafe_rule` | 2 |
| `executable` | 2 |
| `demand_rel` | 2 |
| `trigger_of` | 2 |
| `mono_rule` | 3 |
| `stratum_cone` | 3 |
| `late_rule` | 3 |

