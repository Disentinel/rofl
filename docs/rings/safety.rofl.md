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
  - <a id="lattice_decl"></a>A relation is a lattice of a number arguments merged by an operation (`lattice_decl`)
  - <a id="premise_agg"></a>A rule aggregates over a relation (`premise_agg`)
  - <a id="premise_lit"></a>The premise at a position of a rule is a literal (`premise_lit`)
  - <a id="premise_neg"></a>A rule negates a relation (`premise_neg`)
  - <a id="premise_pos"></a>A rule reads a relation (`premise_pos`)
  - <a id="reserved"></a>A relation is reserved (`reserved`)

## Words

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="analysed"></a>A rule is analysed if some number [is the variable count of the](#slot_arity) `head` at 0 of it.
- <a id="binds"></a>A rule binds a variable V if [the premise at](#binds_at) some position of it binds V.
- <a id="op_used"></a>An operator is used if [the premise at](#premise_lit) some position of some rule is $builtin(it, something).
- <a id="agg_op"></a>The aggregate at a position K of a rule R is a Op if [the premise at](#premise_lit) K of R is $agg(Op, something, something, something, something).
- <a id="agg_keyed"></a>The aggregate at a position K of a rule R names a key if [the premise at](#premise_lit) K of R is $agg(something, something, something, $cons(something, something), something).
- <a id="agg_one_value"></a>The aggregate at a position K of a rule R folds one value if [the premise at](#premise_lit) K of R is $agg(something, something, $cons(something, `$nil`), something, something).
- <a id="agg_no_value"></a>The aggregate at a position K of a rule R names no value if [the premise at](#premise_lit) K of R is $agg(something, something, `$nil`, something, something).
- <a id="agg_groups"></a>The aggregate at a position K of a rule R groups if [the aggregate at](#agg_group_var) K of R groups by some variable.
- <a id="lattice_rel"></a>A relation is a lattice if it [is a lattice of](#lattice_decl) some number arguments merged by some operation.
- <a id="lattice_any"></a>Some relation is a lattice if some relation [is a lattice](#lattice_rel).
- <a id="lat_op"></a>The lattice P is merged by an operation Op if P [is a lattice of](#lattice_decl) some number arguments merged by Op.
- <a id="lat_dirty"></a>$var(a variable Z) of a rule R depends on the value read at a position K if Z of R [depends on the value read at](#lat_taint) K.
- <a id="lat_widened"></a>The lattice P declares a widening if the lattice P is widened after some number [improvements of a cell](#lattice_widen).
- <a id="lat_last"></a>The lattice premise at a position K of a rule R reads the value X if [the arguments of the lattice premise at](#lat_args) K of R end with $cons(X, `$nil`).
- <a id="lat_last_var"></a>The lattice premise at a position K of a rule R reads its value into a variable if [the lattice premise at](#lat_last) K of R reads the value $var(something).

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
   - [the premise at](#premise_lit) K of R is $builtin("is", something) or $builtin("in", something) or $builtin("=", something);
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

> `E in S` binds E from S, as `is` binds its left from its right

`eq_or_is` includes "in".

<a id="cmp_op"></a>An operator compares if it [is used](#op_used), unless it [binds](#eq_or_is).

<a id="unsafe_rule"></a>A rule R is unsafe either:

1. if a variable V [stands at](#premise_var) some index in the `head` at 0 of R, unless R [binds](#binds) V;
2. if all of:
   - R [is analysed](#analysed);
   - [the premise at](#premise_lit) a position K of R is $builtin("is", something) or $builtin("in", something);
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
> `for(;;)` or a memoised recursion in the evaluator. They are not new: they
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
- <a id="has_agg_rule"></a>has an aggregate if it [is analysed](#analysed) and it [aggregates over](#premise_agg) some relation.
- <a id="mono_rule"></a>is monotone if it [may run](#executable), unless it [has a negation](#has_neg_rule) or it [has an aggregate](#has_agg_rule) or it [is unsafe](#unsafe_rule).

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
2. if R [is analysed](#analysed) and R [negates](#premise_neg) `derived_by`;
3. if R [is analysed](#analysed) and R [aggregates over](#premise_agg) `derived_by`.

> ---------------------------------------------------------------------------
> AGGREGATES (docs/aggregates.md). A body aggregate `N is op(Vals ; Keys :
> Body)` at position K is seeded as two slots, `agg` (the variables it shares
> with the rest of the rule) and `agg_res` (its result), and its inner body
> as a rule of its own, `agg_inner(R, K, I)` with I = `$inner(R, K)`, whose
> head slot is what the fold reads: the values, the keys and the shared
> variables. The inner rule has no `premise_pos`, so it triggers nothing and
> depends on nothing; it is here only to be judged.
> 
> The PER-OPERATION SHAPE is judged here and nowhere else, so this file is
> what a wrong shape is refused by: sum names a key, count and the
> idempotent orders do not, sum/min/max/or/and fold exactly one value.

Declared as facts:

- <a id="agg_inner"></a>`agg_inner` — no rows: declared so a rule may read it

> an aggregate binds what it shares and its result; its inner body starts
> with the correlation already bound

The premise at a position K of a rule R binds a variable V if V [stands at](#premise_var) some index in the `agg`/`agg_res` at K of R.

The premise at 0 of a rule I binds a variable V if [the aggregate at](#agg_inner) a position K of a rule R is judged as I and V [is bound before](#bound_before) K in R.

<a id="needs_key"></a>`needs_key` includes `sum`.

<a id="one_value_op"></a>`one_value_op` includes `sum`, `min`, `max`, `or`, `and`.

<a id="idempotent_op"></a>`idempotent_op` includes `min`, `max`, `or`, `and`.

> the joins (docs/aggregates.md, "The join lattice, as built"): only a
> lattice declaration names one

`idempotent_op` includes `union`, `hull`, `bitor`.

> WHAT THE KERNEL WRITES WHILE THE EVALUATION RUNS has no round that closes
> it, so no aggregate may read it.

<a id="live_kernel_rel"></a>`live_kernel_rel` includes `derived_by`, `hole`, `agg_cell`, `agg_member`, `agg_member_prem`, `agg_sealed`, `lattice_member`, `lattice_member_prem`.

<a id="agg_refused"></a>A rule R is refused because a reason N either:

1. if all of:
   - [the aggregate at](#agg_op) a position K of R is a Op;
   - a Op [needs a key](#needs_key);
   - N is `sum_needs_key`;
   - unless [the aggregate at](#agg_keyed) K of R names a key;
2. if all of:
   - [the aggregate at](#agg_op) a position K of R is a `count`;
   - [the aggregate at](#agg_keyed) K of R names a key;
   - N is `key_on_count`;
3. if all of:
   - [the aggregate at](#agg_op) a position K of R is a Op;
   - a Op [is idempotent](#idempotent_op);
   - [the aggregate at](#agg_keyed) K of R names a key;
   - N is `key_on_idempotent`;
4. if all of:
   - [the aggregate at](#agg_op) a position K of R is a Op;
   - a Op [folds one value](#one_value_op);
   - N is `one_value`;
   - unless [the aggregate at](#agg_one_value) K of R folds one value;
5. if all of:
   - [the aggregate at](#agg_op) a position K of R is a `count`;
   - [the aggregate at](#agg_no_value) K of R names no value;
   - N is `count_needs_a_term`;
6. if all of:
   - [the aggregate at](#agg_inner) some position of R is judged as a rule I;
   - I [is unsafe](#unsafe_rule);
   - N is `member_unbound`;
7. if all of:
   - [the aggregate at](#agg_op) some position of R is a some operation;
   - R [is unsafe](#unsafe_rule);
   - N is `unsafe`;
8. if all of:
   - R [aggregates over](#premise_agg) a relation Rel;
   - [the kernel writes](#live_kernel_rel) Rel while it evaluates;
   - N is `reads_live_kernel`.

> THE THRESHOLD `at_least(N, Vals : Body)` (docs/aggregates.md, "The
> threshold, as built"): `$agg(at_least, N, Vals, $nil, Body)`, seeded with an
> empty `agg_res` slot, since it reads N and binds nothing but what it shares.
> It is monotone, so it reads its inner body as the rule would read it
> inlined (`premise_pos`, `premise_neg`) and may recurse; like count it takes
> no key and counts at least one term.

A rule R is refused because a reason N either:

1. if all of:
   - [the aggregate at](#agg_op) a position K of R is a `at_least`;
   - [the aggregate at](#agg_keyed) K of R names a key;
   - N is `key_on_threshold`;
2. if all of:
   - [the aggregate at](#agg_op) a position K of R is a `at_least`;
   - [the aggregate at](#agg_no_value) K of R names no value;
   - N is `threshold_needs_a_term`.

<a id="thr_read"></a>`thr_read`(R, Q) if all of:
  - [the aggregate at](#agg_op) a position K of a rule R is a `at_least`;
  - [the aggregate at](#agg_inner) K of R is judged as a rule I;
  - [the premise at](#premise_lit) some position of I is $lit(Q, something, something, something) or $not($lit(Q, something, something, something)).

> THE HOLISTIC AGGREGATES (docs/aggregates.md, "The holistic aggregates, as
> built"): median and quantile fold a multiset of values, so like sum they
> name a key; quantile's percent and rank's subject are a first term read
> from outside (the door requires it bound before), so both take exactly two
> terms; rank ranks among distinct values and takes no key.

<a id="needs_holistic_key"></a>`needs_holistic_key` includes `median`, `quantile`.

`one_value_op` includes `median`.

<a id="param_op"></a>`param_op` includes `quantile`, `rank`.

<a id="agg_two_terms"></a>`agg_two_terms`(R, K) if [the premise at](#premise_lit) a position K of a rule R is $agg(something, something, $cons(something, $cons(something, `$nil`)), something, something).

A rule R is refused because a reason N either:

1. if all of:
   - [the aggregate at](#agg_op) a position K of R is a Op;
   - [`needs_holistic_key`](#needs_holistic_key)(Op);
   - N is `holistic_needs_key`;
   - unless [the aggregate at](#agg_keyed) K of R names a key;
2. if all of:
   - [the aggregate at](#agg_op) a position K of R is a Op;
   - [`param_op`](#param_op)(Op);
   - N is `param_and_value`;
   - unless [`agg_two_terms`](#agg_two_terms)(R, K);
3. if all of:
   - [the aggregate at](#agg_op) a position K of R is a `rank`;
   - [the aggregate at](#agg_keyed) K of R names a key;
   - N is `key_on_rank`.

> THE EMPTY GROUP. A zero is a claim that nothing matched, so it exists only
> where the group is asked from outside: every variable the aggregate shares
> is bound before it. An aggregate that binds one of them groups by it, and
> a group with no member is no group.

<a id="agg_group_var"></a>The aggregate at a position K of a rule R groups by a variable V if V [stands at](#premise_var) some index in the `agg` at K of R, unless V [is bound before](#bound_before) K in R.

<a id="empty_zero"></a>The aggregate at a position K of a rule R reads an empty group as zero if [the aggregate at](#agg_op) K of R is a `count` or `sum`, unless [the aggregate at](#agg_groups) K of R groups.

> who reads a cell's members, which the kernel then writes as facts

<a id="member_reader"></a>A rule R reads a cell's members either:

1. if R [is analysed](#analysed) and R [reads](#premise_pos) `agg_member` or `agg_member_prem`;
2. if R [is analysed](#analysed) and R [negates](#premise_neg) `agg_member` or `agg_member_prem`.

> who reads a lattice's members, which the kernel then writes as facts

<a id="lattice_member_reader"></a>A rule R reads a lattice's members either:

1. if R [is analysed](#analysed) and R [reads](#premise_pos) `lattice_member` or `lattice_member_prem`;
2. if R [is analysed](#analysed) and R [negates](#premise_neg) `lattice_member` or `lattice_member_prem`.

> ---------------------------------------------------------------------------
> LATTICES (docs/aggregates.md, "The order lattice, as built"). `lattice dist(A, C,
> min D).` is the kernel row `lattice_decl(dist, 3, min)`: the cell is keyed
> by the head prefix and its value, the last argument, merged by the
> operation. For a program that declares one, the host seeds three more
> inputs: the slots `neg` (a negated premise's variables), `hkey` and `hval`
> (a lattice head's key and, when it is a variable, its value), `lkey` and
> `lval` (the same for a positive premise on a lattice relation);
> `lit_arity(R, K, Rel, N)` for every literal of a lattice relation; and
> `premise_arith(R, K, Res, Op, A, B)` for each `Res is A Op B` whose operands
> are variables or integers (`Res is A` is `Op` = "is", B = A), terms reified.

Declared as facts:

- <a id="premise_arith"></a>`premise_arith` — no rows: declared so a rule may read it
- <a id="lit_arity"></a>`lit_arity` — no rows: declared so a rule may read it

> THE DECLARATION. Recursion is allowed only where the operation is
> idempotent, which is the algebra flag above; one operation and one arity
> per relation.

<a id="lattice_refused"></a>The lattice P is refused because a reason E either:

1. if all of:
   - P [is a lattice of](#lattice_decl) some number arguments merged by an operation Op;
   - E is `not_idempotent`;
   - unless a Op [is idempotent](#idempotent_op);
2. if all of:
   - P [is a lattice of](#lattice_decl) some number arguments merged by an operation X;
   - P [is a lattice of](#lattice_decl) some number arguments merged by an operation B;
   - X differs from B;
   - E is `two_algebras`;
3. if all of:
   - P [is a lattice of](#lattice_decl) a number N arguments merged by some operation;
   - P [is a lattice of](#lattice_decl) a number M arguments merged by some operation;
   - N differs from M;
   - E is `two_arities`.

A rule is refused because `lattice_arity` if all of:
  - [the literal at](#lit_arity) some position of it writes a relation P with a number N arguments;
  - P [is a lattice of](#lattice_decl) a number M arguments merged by some operation;
  - N differs from M.

> a body aggregate of another operation as a lattice head's value, directly
> or through `X is ...` and `=`: a closed aggregate renamed is the same value

<a id="lat_aggval"></a>A variable V of a rule R carries the result of a body aggregate of an operation Z either:

1. if all of:
   - R [concludes](#concludes) a relation H;
   - H [is a lattice](#lattice_rel);
   - [the premise at](#premise_lit) some position of R is $agg(A, $var(V), something, something, something);
2. if all of:
   - a variable Y of R [carries the result of a body aggregate of](#lat_aggval) Z;
   - Y [stands at](#premise_var) some index in the `right` at a position J of R;
   - [the premise at](#premise_lit) J of R is $builtin("is", something) or $builtin("=", something);
   - V [stands at](#premise_var) some index in the `left` at J of R;
3. if all of:
   - a variable Y of R [carries the result of a body aggregate of](#lat_aggval) Z;
   - Y [stands at](#premise_var) some index in the `left` at a position J of R;
   - [the premise at](#premise_lit) J of R is $builtin("=", something);
   - V [stands at](#premise_var) some index in the `right` at J of R.

A rule is refused because `lattice_two_algebras` if all of:
  - it [concludes](#concludes) a relation H;
  - the lattice H [is merged by](#lat_op) an operation Op;
  - a variable V of it [carries the result of a body aggregate of](#lat_aggval) an operation X;
  - V [stands at](#premise_var) some index in the `hval` at 0 of it;
  - X differs from Op.

> RECURSION. What a lattice relation depends on, over every edge of the
> present tense; a rule reads P INSIDE its recursion when P depends on the
> rule's head. Every other read is OUTER: a strict edge, fired once P is
> closed, which may read it any way at all.

<a id="lat_edge"></a>A relation X depends directly on a relation B either:

1. if all of:
   - [some relation is a lattice](#lattice_any);
   - a rule R [concludes](#concludes) X;
   - R [concludes at](#conclusion_tense) `now`;
   - R [reads](#premise_pos) B;
2. if all of:
   - [some relation is a lattice](#lattice_any);
   - a rule R [concludes](#concludes) X;
   - R [concludes at](#conclusion_tense) `now`;
   - R [negates](#premise_neg) B;
3. if all of:
   - [some relation is a lattice](#lattice_any);
   - a rule R [concludes](#concludes) X;
   - R [concludes at](#conclusion_tense) `now`;
   - R [aggregates over](#premise_agg) B.

<a id="lat_reach"></a>The lattice P depends on a relation B either:

1. if P [is a lattice](#lattice_rel) and P [depends directly on](#lat_edge) B;
2. if [the lattice](#lat_reach) P depends on a relation X and X [depends directly on](#lat_edge) B.

<a id="lat_read"></a>The premise at a position K of a rule R reads the lattice P if [the premise at](#premise_lit) K of R is $lit(P, something, something, something) and P [is a lattice](#lattice_rel).

<a id="lat_inner"></a>The premise at a position K of a rule R reads the lattice P inside its recursion if all of:
  - [the premise at](#lat_read) K of R reads the lattice P;
  - R [concludes](#concludes) a relation H;
  - R [concludes at](#conclusion_tense) `now`;
  - [the lattice](#lat_reach) P depends on H.

A rule

- <a id="lattice_outer"></a>reads the lattice P from outside its recursion if [the premise at](#lat_read) a position K of it reads the lattice P, unless [the premise at](#lat_inner) K of it reads the lattice P inside its recursion.
- is refused because `lattice_negated` if all of:
  - it [negates](#premise_neg) a relation P;
  - P [is a lattice](#lattice_rel);
  - it [concludes](#concludes) a relation H;
  - it [concludes at](#conclusion_tense) `now`;
  - [the lattice](#lat_reach) P depends on H.

> MONOTONE IN THE VALUE. An inner read's value variable, and every variable
> computed from it, is TAINTED; each place a tainted variable occurs must be
> one of the uses below, or the rule is refused. `lat_mv` is the direction a
> variable moves when the cell improves: min and and improve downwards, max
> and or upwards; a join's value grows in its own carrier, a set, an
> interval or a bitset, and moves into a head of that carrier only.

<a id="better_move"></a>`better_move` lists:

| operation | direction |
|---|---|
| `min` | `down` |
| `and` | `down` |
| `max` | `up` |
| `or` | `up` |
| `union` | `grow_set` |
| `hull` | `grow_iv` |
| `bitor` | `grow_bits` |

<a id="order_move"></a>`order_move` includes `up`, `down`.

<a id="join_move"></a>`join_move` includes `grow_set`, `grow_iv`, `grow_bits`.

> the reads a growing value keeps true: `E in S` (E a member of S, which
> more members keep true and which enumerates more E as S grows) and
> `A subset S`, S on the right

<a id="join_read"></a>`join_read` includes "in", "subset".

<a id="lt_op"></a>`lt_op` includes "<", "<=".

<a id="gt_op"></a>`gt_op` includes ">", ">=".

<a id="top_const"></a>`top_const` lists:

| direction | value |
|---|---|
| `up` | `true` |
| `down` | `false` |

<a id="lat_taint"></a>A variable V of a rule R depends on the value read at a position K either:

1. if [the premise at](#lat_inner) K of R reads the lattice some relation inside its recursion and V [stands at](#premise_var) some index in the `lval` at K of R;
2. if all of:
   - a variable Y of R [depends on the value read at](#lat_taint) K;
   - Y [stands at](#premise_var) some index in the `right` at a position J of R;
   - [the premise at](#premise_lit) J of R is $builtin("is", something) or $builtin("=", something);
   - V [stands at](#premise_var) some index in the `left` at J of R;
3. if all of:
   - a variable Y of R [depends on the value read at](#lat_taint) K;
   - Y [stands at](#premise_var) some index in the `left` at a position J of R;
   - [the premise at](#premise_lit) J of R is $builtin("=", something);
   - V [stands at](#premise_var) some index in the `right` at J of R.

<a id="lat_clean"></a>A term E of a rule R does not depend on the value read at a position K either:

1. if all of:
   - [the premise at](#lat_inner) K of R reads the lattice some relation inside its recursion;
   - [the premise at](#premise_arith) some position of R computes some term as E some operator some term;
   - unless E of R [depends on the value read at](#lat_dirty) K;
2. if all of:
   - [the premise at](#lat_inner) K of R reads the lattice some relation inside its recursion;
   - [the premise at](#premise_arith) some position of R computes some term as some term some operator E;
   - unless E of R [depends on the value read at](#lat_dirty) K.

<a id="lat_right_dirty"></a><a id="lat_left_dirty"></a>The right/left side of the premise at a position J of a rule R depends on the value read at a position K if a variable Z of R [depends on the value read at](#lat_taint) K and Z [stands at](#premise_var) some index in the `right`/`left` at J of R.

> the steps that carry the direction: V + E, E + V, V - E, min(V, E) and
> max(V, E) keep it, E - V turns it, `X is V` copies it; E never depends on
> the value

<a id="flip"></a>`flip` lists:

| direction | direction |
|---|---|
| `up` | `down` |
| `down` | `up` |

<a id="lat_mv"></a>A variable of a rule R moves a direction M as the value read at a position K improves if all of:
  - [the premise at](#lat_inner) K of R reads the lattice P inside its recursion;
  - it [stands at](#premise_var) some index in the `lval` at K of R;
  - the lattice P [is merged by](#lat_op) an operation Op;
  - a Op improves M.

<a id="lat_step"></a>The premise at a position J of a rule R carries a variable Y into a variable X , moving a direction M , from the value read at a position K if all of:
  - Y of R moves M [as the value read at](#lat_mv) K improves;
  - [`order_move`](#order_move)(M);
  - [the premise at](#premise_arith) J of R computes $var(X) as $var(Y) "+" a term E;
  - E of R [does not depend on the value read at](#lat_clean) K.

The premise at a position J of a rule R carries a variable Y into a variable X , moving a direction M , from the value read at a position K if all of:
  - Y of R moves M [as the value read at](#lat_mv) K improves;
  - [`order_move`](#order_move)(M);
  - [the premise at](#premise_arith) J of R computes $var(X) as a term E "+" $var(Y);
  - E of R [does not depend on the value read at](#lat_clean) K.

The premise at a position J of a rule R carries a variable Y into a variable X , moving a direction M , from the value read at a position K if all of:
  - Y of R moves M [as the value read at](#lat_mv) K improves;
  - [`order_move`](#order_move)(M);
  - [the premise at](#premise_arith) J of R computes $var(X) as $var(Y) "-" a term E;
  - E of R [does not depend on the value read at](#lat_clean) K.

The premise at a position J of a rule R carries a variable Y into a variable X , moving a direction M2 , from the value read at a position K if all of:
  - Y of R moves a direction M [as the value read at](#lat_mv) K improves;
  - [`order_move`](#order_move)(M);
  - [the premise at](#premise_arith) J of R computes $var(X) as a term E "-" $var(Y);
  - E of R [does not depend on the value read at](#lat_clean) K;
  - M [turns to](#flip) M2.

The premise at a position J of a rule R carries a variable Y into a variable X , moving a direction M , from the value read at a position K if Y of R moves M [as the value read at](#lat_mv) K improves and [the premise at](#premise_arith) J of R computes $var(X) as $var(Y) "is" $var(Y).

The premise at a position J of a rule R carries a variable Y into a variable X , moving a direction M , from the value read at a position K if all of:
  - Y of R moves M [as the value read at](#lat_mv) K improves;
  - [`order_move`](#order_move)(M);
  - [the premise at](#premise_arith) J of R computes $var(X) as $var(Y) an operator Op a term E;
  - Op [keeps an order](#minmax);
  - E of R [does not depend on the value read at](#lat_clean) K.

The premise at a position J of a rule R carries a variable Y into a variable X , moving a direction M , from the value read at a position K if all of:
  - Y of R moves M [as the value read at](#lat_mv) K improves;
  - [`order_move`](#order_move)(M);
  - [the premise at](#premise_arith) J of R computes $var(X) as a term E an operator Op $var(Y);
  - Op [keeps an order](#minmax);
  - E of R [does not depend on the value read at](#lat_clean) K.

<a id="minmax"></a>`minmax` includes "min", "max".

> A SEMIRING TAG'S ⊗ (docs/aggregates.md, "Tags, as built"): the engine
> runs `X is $alg(Acc, T)` for each tag a firing multiplies, each monotone in
> both operands on its carrier, so it keeps the direction as `+` does

<a id="tag_step"></a>`tag_step` includes "$tropical", "$viterbi", "$trust".

The premise at a position J of a rule R carries a variable Y into a variable X , moving a direction M , from the value read at a position K either:

1. if all of:
   - Y of R moves M [as the value read at](#lat_mv) K improves;
   - [`order_move`](#order_move)(M);
   - [the premise at](#premise_arith) J of R computes $var(X) as $var(Y) an operator Op a term E;
   - Op [is a semiring tag's ⊗](#tag_step);
   - E of R [does not depend on the value read at](#lat_clean) K;
2. if all of:
   - Y of R moves M [as the value read at](#lat_mv) K improves;
   - [`order_move`](#order_move)(M);
   - [the premise at](#premise_arith) J of R computes $var(X) as a term E an operator Op $var(Y);
   - Op [is a semiring tag's ⊗](#tag_step);
   - E of R [does not depend on the value read at](#lat_clean) K.

A variable of a rule R moves a direction M as the value read at a position K improves if the premise at some position of R carries some variable into it , moving M [, from the value read at](#lat_step) K.

> THE USES THAT KEEP A RULE MONOTONE

<a id="lat_ok"></a>A variable V of a rule R is used monotonically in the E of the premise at a position N , for the value read at a position K either:

1. if all of:
   - [the premise at](#lat_inner) K of R reads the lattice some relation inside its recursion;
   - V [stands at](#premise_var) some index in the `lval` at K of R;
   - N is K;
   - E is `pos`;
2. if all of:
   - [the premise at](#lat_inner) K of R reads the lattice some relation inside its recursion;
   - V [stands at](#premise_var) some index in the `lval` at K of R;
   - N is K;
   - E is `lval`;
3. if the premise at N of R carries V into some variable , moving some direction [, from the value read at](#lat_step) K and E is `right`;
4. if the premise at N of R carries some variable into V , moving some direction [, from the value read at](#lat_step) K and E is `left`.

> a comparison that stays true as the value improves

A variable X of a rule R is used monotonically in the N of the premise at a position J , for the value read at a position K either:

1. if all of:
   - X of R moves `down` [as the value read at](#lat_mv) K improves;
   - [the premise at](#premise_lit) J of R is $builtin(an operator Op, $cons($var(X), something));
   - Op [holds below](#lt_op);
   - N is `left`;
   - unless [the right side of the premise at](#lat_right_dirty) J of R depends on the value read at K;
2. if all of:
   - X of R moves `up` [as the value read at](#lat_mv) K improves;
   - [the premise at](#premise_lit) J of R is $builtin(an operator Op, $cons($var(X), something));
   - Op [holds above](#gt_op);
   - N is `left`;
   - unless [the right side of the premise at](#lat_right_dirty) J of R depends on the value read at K;
3. if all of:
   - X of R moves `up` [as the value read at](#lat_mv) K improves;
   - [the premise at](#premise_lit) J of R is $builtin(an operator Op, $cons(something, $cons($var(X), `$nil`)));
   - Op [holds below](#lt_op);
   - N is `right`;
   - unless [the left side of the premise at](#lat_left_dirty) J of R depends on the value read at K;
4. if all of:
   - X of R moves `down` [as the value read at](#lat_mv) K improves;
   - [the premise at](#premise_lit) J of R is $builtin(an operator Op, $cons(something, $cons($var(X), `$nil`)));
   - Op [holds above](#gt_op);
   - N is `right`;
   - unless [the left side of the premise at](#lat_left_dirty) J of R depends on the value read at K.

> or's `B = true`, and's `B = false`: equal to the best there is

A variable X of a rule R is used monotonically in the N of the premise at a position J , for the value read at a position K either:

1. if all of:
   - X of R moves a direction M [as the value read at](#lat_mv) K improves;
   - [the best value moving](#top_const) M is C;
   - [the premise at](#premise_lit) J of R is $builtin("=", $cons($var(X), $cons(C, `$nil`)));
   - N is `left`;
2. if all of:
   - X of R moves a direction M [as the value read at](#lat_mv) K improves;
   - [the best value moving](#top_const) M is C;
   - [the premise at](#premise_lit) J of R is $builtin("=", $cons(C, $cons($var(X), `$nil`)));
   - N is `right`.

> a membership or subset test of a growing value, the value on the right

A variable of a rule R is used monotonically in the `right` of the premise at a position J , for the value read at a position K if all of:
  - it of R moves a direction M [as the value read at](#lat_mv) K improves;
  - [`join_move`](#join_move)(M);
  - [the premise at](#premise_lit) J of R is $builtin(Op, $cons(something, $cons($var(it), `$nil`)));
  - [`join_read`](#join_read)(Op);
  - unless [the left side of the premise at](#lat_left_dirty) J of R depends on the value read at K.

> the value of a lattice head whose order improves the same way

<a id="lat_head_ok"></a>A variable of a rule R is the value of a lattice head that improves with the value read at a position K if all of:
  - it of R moves a direction M [as the value read at](#lat_mv) K improves;
  - R [concludes](#concludes) a relation H;
  - the lattice H [is merged by](#lat_op) an operation Op;
  - a Op improves M;
  - it [stands at](#premise_var) some index in the `hval` at 0 of R.

A variable X of a rule R is used monotonically in the E of the premise at a position N , for the value read at a position K either:

1. if all of:
   - X of R [is the value of a lattice head that improves with the value read at](#lat_head_ok) K;
   - N is 0;
   - E is `head`;
2. if all of:
   - X of R [is the value of a lattice head that improves with the value read at](#lat_head_ok) K;
   - N is 0;
   - E is `hval`.

> A DECLARED WIDENING (docs/aggregates.md, "Widening, as built").
> `lattice p(K, hull I) widen N.` is the kernel row `lattice_widen(p, N)`: a
> cell of p that has improved N times is widened from then on, each end the
> join moved going to its infinity. Only an interval hull declares one: a
> union's top is no set, a bitset has finite height, and an order lattice
> that never settles is an improving cycle.

<a id="widenable"></a>`widenable` includes `hull`.

The lattice P is refused because a reason N either:

1. if all of:
   - the lattice P is widened after some number [improvements of a cell](#lattice_widen);
   - the lattice P [is merged by](#lat_op) an operation Op;
   - N is `widen_not_hull`;
   - unless a Op [may declare a widening](#widenable);
2. if all of:
   - the lattice P is widened after X [improvements of a cell](#lattice_widen);
   - the lattice P is widened after B [improvements of a cell](#lattice_widen);
   - X differs from B;
   - N is `two_widenings`.

Declared as facts:

- <a id="lattice_widen"></a>`lattice_widen` — no rows: declared so a rule may read it

> THE INTERVAL FUNCTIONS of `is` move a hull's value monotonely: each is
> monotone in every interval operand, so `J is ivadd(I, 1)` grows as I does
> (ivmul only by an integer, its first operand the interval). They compute
> new ends from the value, so a recursion through one need not settle: every
> cycle it lies on passes a relation declared `widen N`, or it is refused.

<a id="iv_op"></a>`iv_op` includes "ivadd", "ivsub", "ivmul", "ivmeet".

The premise at a position J of a rule R carries a variable Y into a variable X , moving a direction N , from the value read at a position K either:

1. if all of:
   - Y of R moves `grow_iv` [as the value read at](#lat_mv) K improves;
   - [the premise at](#premise_arith) J of R computes $var(X) as $var(Y) an operator Op a term E;
   - Op [is an interval function](#iv_op);
   - E of R [does not depend on the value read at](#lat_clean) K;
   - N is `grow_iv`;
2. if all of:
   - Y of R moves `grow_iv` [as the value read at](#lat_mv) K improves;
   - [the premise at](#premise_arith) J of R computes $var(X) as a term E an operator Op $var(Y);
   - Op [is an interval function](#iv_op);
   - Op differs from "ivmul";
   - E of R [does not depend on the value read at](#lat_clean) K;
   - N is `grow_iv`.

<a id="lat_iv_step"></a>A rule computes a hull's value by an interval function from the value read at a position K if all of:
  - the premise at a position J of it carries some variable into some variable , moving `grow_iv` [, from the value read at](#lat_step) K;
  - [the premise at](#premise_arith) J of it computes some term as some term an operator Op some term;
  - Op [is an interval function](#iv_op).

A relation

- <a id="unw_edge"></a>depends directly on a relation B , and neither declares a widening if all of:
  - it [depends directly on](#lat_edge) B;
  - unless the lattice it [declares a widening](#lat_widened);
  - unless the lattice B [declares a widening](#lat_widened).
- <a id="unw_reach"></a>depends on a relation B through relations none of which declares a widening if it depends directly on B [, and neither declares a widening](#unw_edge).
- depends on a relation C through relations none of which declares a widening if it depends on a relation B [through relations none of which declares a widening](#unw_reach), and B depends directly on C [, and neither declares a widening](#unw_edge).

A rule R is refused because a reason N either:

1. if all of:
   - R [computes a hull's value by an interval function from the value read at](#lat_iv_step) a position K;
   - [the premise at](#lat_inner) K of R reads the lattice P inside its recursion;
   - R [concludes](#concludes) a relation H;
   - P depends on H [through relations none of which declares a widening](#unw_reach);
   - N is `lattice_unwidened`;
2. if all of:
   - R [computes a hull's value by an interval function from the value read at](#lat_iv_step) a position K;
   - [the premise at](#lat_inner) K of R reads the lattice H inside its recursion;
   - R [concludes](#concludes) H;
   - N is `lattice_unwidened`;
   - unless the lattice H [declares a widening](#lat_widened).

<a id="lat_use"></a>A variable of a rule R is used in the S of the premise at a position J , for the value read at a position K if it of R [depends on the value read at](#lat_taint) K and it [stands at](#premise_var) some index in the S at J of R.

<a id="lat_misuse"></a>A rule is not monotone in a lattice value it reads if a variable X of it is used in the S of the premise at a position J [, for the value read at](#lat_use) a position K, unless X of it is used monotonically in the S of the premise at J [, for the value read at](#lat_ok) K.

> a constant read in the value slot is monotone only as the best there is

<a id="lat_args"></a>The arguments of the lattice premise at a position K of a rule R end with a list L either:

1. if [the premise at](#lat_inner) K of R reads the lattice some relation inside its recursion and [the premise at](#premise_lit) K of R is $lit(something, something, L, something);
2. if [the arguments of the lattice premise at](#lat_args) K of R end with $cons(something, L).

<a id="lat_const_ok"></a>The lattice premise at a position K of a rule R reads the best value there is if all of:
  - [the premise at](#lat_inner) K of R reads the lattice P inside its recursion;
  - [the lattice premise at](#lat_last) K of R reads the value C;
  - the lattice P [is merged by](#lat_op) an operation Op;
  - a Op improves a direction M;
  - [the best value moving](#top_const) M is C.

A rule

- is not monotone in a lattice value it reads if all of:
  - [the premise at](#lat_inner) a position K of it reads the lattice some relation inside its recursion;
  - unless the lattice premise at K of it [reads its value into a variable](#lat_last_var);
  - unless the lattice premise at K of it [reads the best value there is](#lat_const_ok).
- is refused because `lattice_nonmonotone` if it [is not monotone in a lattice value it reads](#lat_misuse).

> A THRESHOLD BESIDE A LATTICE. A lattice's close supersedes values and
> withdraws what a hole left unfounded, and a Quorum counted before the close
> would keep a member that is gone. So a threshold may count only facts that
> cannot rest on a lattice before that lattice closes: `lat_live(Q, P)` says
> Q's facts may rest on P's values while P is still open (Q reads P, or a
> relation live on P, inside the recursion or through a positive premise).
> A rule holding a threshold neither concludes a lattice nor reads one inside
> its recursion.

<a id="lat_live"></a>`lat_live`(P, N) either:

1. if a relation P [is a lattice](#lattice_rel) and N is P;
2. if all of:
   - [some relation is a lattice](#lattice_any);
   - a rule R [concludes](#concludes) a relation P;
   - R [concludes at](#conclusion_tense) `now`;
   - R [reads](#premise_pos) a relation B;
   - [`lat_live`](#lat_live)(B, N);
   - unless B [is a lattice](#lattice_rel);
3. if all of:
   - [the premise at](#lat_inner) some position of a rule R reads the lattice B inside its recursion;
   - R [concludes](#concludes) a relation P;
   - [`lat_live`](#lat_live)(B, N).

A rule R is refused because a reason N either:

1. if all of:
   - [`thr_read`](#thr_read)(R, Q);
   - [`lat_live`](#lat_live)(Q, something);
   - N is `threshold_lattice`;
2. if all of:
   - [the aggregate at](#agg_op) some position of R is a `at_least`;
   - R [concludes](#concludes) a relation H;
   - H [is a lattice](#lattice_rel);
   - N is `threshold_lattice`;
3. if all of:
   - [the aggregate at](#agg_op) some position of R is a `at_least`;
   - [the premise at](#lat_inner) some position of R reads the lattice some relation inside its recursion;
   - N is `threshold_lattice`.

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
| `agg_op` | 1 |
| `agg_keyed` | 1 |
| `agg_one_value` | 1 |
| `agg_no_value` | 1 |
| `agg_two_terms` | 1 |
| `thr_read` | 1 |
| `has_agg_rule` | 1 |
| `member_reader` | 1 |
| `unsafe_rule` | 2 |
| `executable` | 2 |
| `demand_rel` | 2 |
| `trigger_of` | 2 |
| `agg_group_var` | 2 |
| `agg_groups` | 2 |
| `agg_refused` | 3 |
| `mono_rule` | 3 |
| `stratum_cone` | 3 |
| `late_rule` | 3 |
| `empty_zero` | 3 |
| `lat_aggval` | 1 |
| `lat_args` | 1 |
| `lat_const_ok` | 1 |
| `lat_dirty` | 1 |
| `lat_edge` | 1 |
| `lat_inner` | 1 |
| `lat_last` | 1 |
| `lat_last_var` | 1 |
| `lat_left_dirty` | 1 |
| `lat_op` | 1 |
| `lat_reach` | 1 |
| `lat_read` | 1 |
| `lat_right_dirty` | 1 |
| `lat_taint` | 1 |
| `lat_use` | 1 |
| `lattice_any` | 1 |
| `lattice_member_reader` | 1 |
| `lattice_refused` | 1 |
| `lattice_rel` | 1 |
| `lat_widened` | 1 |
| `lat_clean` | 2 |
| `lat_head_ok` | 2 |
| `lat_mv` | 2 |
| `lat_ok` | 2 |
| `lat_step` | 2 |
| `lattice_outer` | 2 |
| `lat_live` | 2 |
| `lat_iv_step` | 2 |
| `unw_edge` | 2 |
| `unw_reach` | 2 |
| `lat_misuse` | 3 |

