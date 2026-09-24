---
world: policy
books: main
default: main
---

# policy

> policy.rofl — THE KERNEL'S OWN PROGRAM, carried as data rather than code.
> 
> Every rule here was a decision the evaluator made in TypeScript. The owner
> chose 2026-09-05 that the kernel SHIPS this program itself, the way
> `bootstrapKernel` already ships 59 facts into every store: a rule that is not
> loaded is not a conservative answer, it is a wrong one, and 22 of the 95
> worlds in this repository never load boot.rofl.
> 
> SO THIS FILE IS THE SOURCE AND src/reflect.ts CARRIES A COPY. That is the
> shape `examples/ring1/l1.dense.rofl` already has — a program in two forms,
> one readable and one the machine installs — and it is only honest with the
> gate that keeps them identical, which test/kernel-policy-program.test.ts is.
> 
> The relations conclude into `[$kernel]` because they are what the kernel
> knows ABOUT a program, like `concludes` and `premise_pos` they are built
> from. A program's own `reads(E, types)` — examples/wtf has one — lives in
> `[main]` and never meets them.

> WHICH RELATIONS A RELATION'S RULES LOOK AT, positively or negatively.
> This is `dep` from rules/strata.rofl WITHOUT its `conclusion_tense(R, now)`
> filter: the reuse plan must see across the tick boundary, because a `@next`
> conclusion is still something the rule read to produce.
> 
> Measured set for set against the host's own walk over `Evaluation.rules`,
> 2026-09-05: boot.rofl alone 35 pairs, +strata 52, +findings 51,
> +kernel-policy 64, +the ring 1 grammar 248. Agree on every one.

Reads:

- from outside these files:
  - <a id="concludes"></a>A rule concludes a relation (`concludes`)
  - <a id="premise_neg"></a>A rule negates a relation (`premise_neg`)
  - <a id="premise_pos"></a>A rule reads a relation (`premise_pos`)

<a id="rule_reads"></a>The rules of a relation X read a relation B either:

1. if a rule R [concludes](#concludes) X and R [reads](#premise_pos) B;
2. if a rule R [concludes](#concludes) X and R [negates](#premise_neg) B.

> EVERY RELATION THE RULES MENTION, on either side. `planReuse` builds this as
> `rels` while it walks; here it falls out of what is already derived.

A relation

- <a id="rule_relation"></a>is mentioned by a rule if a rule R [concludes](#concludes) it.
- is mentioned by a rule if [the rules of](#rule_reads) a relation X read it.

> THE DEPENDENCY CONE: the reflexive-transitive closure of `rule_reads`. The
> host runs a `for(;;)` growing sets until nothing moves, which is what a
> fixpoint engine does for a living — this is the same answer, stated.

<a id="cone"></a>A relation N is in the cone of a relation X either:

1. if X [is mentioned by a rule](#rule_relation) and N is X;
2. if a relation B [is in the cone of](#cone) X and [the rules of](#rule_reads) B read N.

> OPAQUE, CLOSED UPWARD THROUGH READS. A relation that reads an opaque one is
> opaque: the evaluation cannot promise to reproduce what it holds. The SEED
> stays with the host for now — it needs a premise's tense and a store-shape
> fact ("does this relation hold non-base rows"), and the reflection carries
> neither flat. That is the whole difference between POL and POL*.

<a id="opaque_closed"></a>A relation X is opaque either:

1. if X [is opaque to begin with](#opaque_seed);
2. if [the rules of](#rule_reads) X read a relation B and B [is opaque](#opaque_closed).

Declared as facts:

- <a id="opaque_seed"></a>`opaque_seed` — no rows: declared so a rule may read it

