---
world: strata
books: main
default: main
---

# strata

> rules/strata.rofl — the schedule as data, for the evaluator that reads it.
> 
> The first ten rules stood in `boot.rofl` until the evaluator stopped needing
> them. They compute, over a program's own reflection, the dependency graph
> (`dep/2`, `dep_neg/2`), its transitive closure (`reach/2`), the relations no
> schedule can order (`unstratified/1`), and the stratum table (`stratum/2`)
> that the STOCK evaluator reads back out of the store to order its negation
> phases.
> 
> The primary evaluator peels that schedule off the DECODED RULES before a
> single rule fires (`src/aggeval.ts`, `peelRounds`), so a program no longer has
> to derive a description of itself in order to be run, and boot.rofl no longer
> carries these. `stratum/2` and `unstratified/1` remain the kernel's declared
> READ INTERFACE (README.md), and `new Rofl({ evaluator: 'strata' })` still
> reads them — it simply has no supplier unless a program is one.
> 
> THIS PACK IS THAT SUPPLIER, and it is an ordinary program. That is the whole
> point the deletion makes rather than hides: the table was always computed by
> rules over reflection, and moving it out of boot.rofl changes who loads it
> and nothing else. Load it beside boot.rofl and the stock path behaves exactly
> as it did.
> 
> WARNING, and it is why this is not loaded by default: `stratum(Rel, N) :-
> dep_neg(Rel, Q), stratum(Q, M), N is M + 1` invents a value that was not in
> the input, so it has no fixpoint on a negative cycle and is made safe only by
> being refused first. The peel invents nothing and is bounded by construction.

Reads:

- from outside these files:
  - <a id="concludes"></a>A rule concludes a relation (`concludes`)
  - <a id="conclusion_tense"></a>A rule concludes at a tense (`conclusion_tense`)
  - <a id="edb"></a>A relation is given from outside (`edb`)
  - <a id="lattice_decl"></a>A relation is a lattice of a number arguments merged by an operation (`lattice_decl`)
  - <a id="premise_agg"></a>A rule aggregates over a relation (`premise_agg`)
  - <a id="premise_lit"></a>The premise at a position of a rule is a literal (`premise_lit`)
  - <a id="premise_neg"></a>A rule negates a relation (`premise_neg`)
  - <a id="premise_pos"></a>A rule reads a relation (`premise_pos`)
  - <a id="tag_decl"></a>A relation of a number arguments is tagged in the semiring (`tag_decl`)
- from safety: [lattice_rel](safety.rofl.md#lattice_rel), [stratum](safety.rofl.md#stratum)

## Words

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="counting_tag"></a>A relation is a counting tag if it of some number [arguments is tagged in the](#tag_decl) `counting` semiring.

<a id="dep"></a>A relation X depends on a relation B either:

1. if all of:
   - a rule R [concludes](#concludes) X;
   - R [concludes at](#conclusion_tense) `now`;
   - R [reads](#premise_pos) B;
2. if all of:
   - a rule R [concludes](#concludes) X;
   - R [concludes at](#conclusion_tense) `now`;
   - R [negates](#premise_neg) B.

<a id="dep_neg"></a>A relation depends negatively on a relation B if all of:
  - a rule R [concludes](#concludes) it;
  - R [concludes at](#conclusion_tense) `now`;
  - R [negates](#premise_neg) B.

> AN AGGREGATE READS AS A NEGATION DOES: what it reads is closed below it.
> The four relations the kernel reflects cells into, and `hole`, which a
> fold that overflows writes, sit above every aggregate, so a rule that
> negates one of them is above them all.

A relation

- depends on a relation B if all of:
  - a rule R [concludes](#concludes) it;
  - R [concludes at](#conclusion_tense) `now`;
  - R [aggregates over](#premise_agg) B.
- depends negatively on a relation B if all of:
  - a rule R [concludes](#concludes) it;
  - R [concludes at](#conclusion_tense) `now`;
  - R [aggregates over](#premise_agg) B.

<a id="agg_reflection"></a>`agg_reflection` includes `agg_cell`, `agg_member`, `agg_member_prem`, `agg_sealed`, `hole`.

A relation

- depends on a relation B if [the kernel reflects cells into](#agg_reflection) it and some rule [aggregates over](#premise_agg) B.
- depends negatively on a relation B if [the kernel reflects cells into](#agg_reflection) it and some rule [aggregates over](#premise_agg) B.

> A THRESHOLD reads its inner body as premises (it is monotone), and its
> cells are closed with its conclusion's relation: the reflection sits above
> that relation, so above what the threshold reads.

<a id="threshold_rule"></a>`threshold_rule`(R) if [the premise at](#premise_lit) some position of a rule R is $agg(`at_least`, something, something, something, something).

A relation

- depends on a relation Y if all of:
  - [the kernel reflects cells into](#agg_reflection) it;
  - [`threshold_rule`](#threshold_rule)(R);
  - a rule R [concludes](#concludes) Y;
  - R [concludes at](#conclusion_tense) `now`.
- depends negatively on a relation Y if all of:
  - [the kernel reflects cells into](#agg_reflection) it;
  - [`threshold_rule`](#threshold_rule)(R);
  - a rule R [concludes](#concludes) Y;
  - R [concludes at](#conclusion_tense) `now`.

> THE MEMBERS THE KERNEL WRITES OF A LATTICE when it closes sit above every
> lattice (docs/aggregates.md, "The order lattice, as built"). A rule reading a lattice
> from OUTSIDE its recursion is strict too, but saying which reads are outside
> takes `not reach(B, A)`, a negation the stock evaluator cannot order before
> it reads this table; so this table does not rank such a reader, and the
> stock evaluator refuses it unless the program ranks it itself.

A relation is a lattice if it [is a lattice of](#lattice_decl) some number arguments merged by some operation.

<a id="lattice_reflection"></a>`lattice_reflection` includes `lattice_member`, `lattice_member_prem`, `hole`.

A relation

- depends on a relation B if the kernel writes it [when a lattice closes](#lattice_reflection) and B [is a lattice](safety.rofl.md#lattice_rel).
- depends negatively on a relation B if the kernel writes it [when a lattice closes](#lattice_reflection) and B [is a lattice](safety.rofl.md#lattice_rel).

> A SEMIRING TAG (docs/aggregates.md, "Tags, as built"). An idempotent one
> is the order lattice of its ⊕. A counting one is a sum of the derivations
> its rules conclude, sealed once they close: its rules' premises are read as
> an aggregate reads, closed below it, and what the kernel reflects of its
> cells sits above it. (The engine ranks the relation of the derivations
> themselves between the two.)

<a id="tag_lattice"></a>`tag_lattice` includes `tropical`, `viterbi`, `trust`.

A relation

- is a lattice if it of some number [arguments is tagged in the](#tag_decl) Alg semiring and the semiring Alg [is the order lattice of its ⊕](#tag_lattice).
- depends on a relation B if all of:
  - it [is a counting tag](#counting_tag);
  - a rule R [concludes](#concludes) it;
  - R [concludes at](#conclusion_tense) `now`;
  - R [reads](#premise_pos) B.
- depends negatively on a relation B if all of:
  - it [is a counting tag](#counting_tag);
  - a rule R [concludes](#concludes) it;
  - R [concludes at](#conclusion_tense) `now`;
  - R [reads](#premise_pos) B.
- depends on a relation B if [the kernel reflects cells into](#agg_reflection) it and B [is a counting tag](#counting_tag).
- depends negatively on a relation B if [the kernel reflects cells into](#agg_reflection) it and B [is a counting tag](#counting_tag).

<a id="reach"></a>A relation Y reaches a relation B either:

1. if Y [depends on](#dep) B;
2. if Y [reaches](#reach) a relation X and X [depends on](#dep) B.

<a id="unstratified"></a>A relation is unstratified if it [depends negatively on](#dep_neg) a relation Q and Q [reaches](#reach) it.

A relation Rel is in the stratum E either:

1. if Rel [is given from outside](#edb) and E is 0;
2. if a rule R [concludes](#concludes) Rel, R [concludes at](#conclusion_tense) `next`, and E is 0;
3. if all of:
   - Rel [depends negatively on](#dep_neg) a relation Q;
   - Q [is in the stratum](safety.rofl.md#stratum) M;
   - E is M + 1;
4. if Rel [depends on](#dep) a relation Q and Q [is in the stratum](safety.rofl.md#stratum) E.

