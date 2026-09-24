---
world: strata
books: main
default: main
---

# strata

> rules/strata.rofl — the schedule as data, for the evaluator that reads it.
> 
> These ten rules stood in `boot.rofl` until the evaluator stopped needing
> them. They compute, over a program's own reflection, the dependency graph
> (`dep/2`, `dep_neg/2`), its transitive closure (`reach/2`), the relations no
> schedule can order (`unstratified/1`), and the stratum table (`stratum/2`)
> that the STOCK evaluator reads back out of the store to order its negation
> phases.
> 
> The primary evaluator peels that schedule off the DECODED RULES before a
> single rule fires (`src/rounds.ts`, `peelRounds`), so a program no longer has
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
  - <a id="premise_neg"></a>A rule negates a relation (`premise_neg`)
  - <a id="premise_pos"></a>A rule reads a relation (`premise_pos`)
- from safety: [stratum](safety.rofl.md#stratum)

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

